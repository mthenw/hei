import type {
  AssistantMessage,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type {
  AgentEvent,
  EntryRecord,
  MessageChange,
  ModelRef,
  SnapshotEvent,
} from "@earendil-works/pi-durable";
import { FAILOVER_ENTRY, type FailoverNote } from "./failover-note";

/**
 * Client-side state of one Chat, rebuilt from pi-durable's agent events: a snapshot on (re)connect, then one batch of
 * events per commit. This module is the only place the browser depends on the shape of those events.
 */
export type ChatStreamState = {
  /** The active transcript, in commit order. */
  entries: readonly EntryRecord[];
  /** The assistant message being generated right now. */
  partial: AssistantMessage | undefined;
  /** Running output of unfinished tool calls, by call id. */
  toolOutput: Readonly<Record<string, string>>;
  running: boolean;
  /** Messages waiting in the inbox for the current run to finish. */
  queued: number;
  retry: { attempt: number; at: number; error: string } | undefined;
  /** Why the last message went unanswered, unless the user stopped it. */
  failure: string | undefined;
  /** The model the chat runs on, as pi-durable's agent settings name it. */
  model: ModelRef | undefined;
};

export const emptyChatStream: ChatStreamState = {
  entries: [],
  partial: undefined,
  toolOutput: {},
  running: false,
  queued: 0,
  retry: undefined,
  failure: undefined,
  model: undefined,
};

export function applyEvents(
  state: ChatStreamState,
  events: readonly AgentEvent[],
): ChatStreamState {
  // One working copy per batch; the input state is never mutated.
  const next: Mutable<ChatStreamState> = {
    ...state,
    entries: [...state.entries],
    toolOutput: { ...state.toolOutput },
    partial: state.partial && structuredClone(state.partial),
  };
  for (const event of events) applyEvent(next, event);
  return next;
}

function applyEvent(state: Mutable<ChatStreamState>, event: AgentEvent) {
  switch (event.type) {
    case "snapshot":
      Object.assign(state, fromSnapshot(event));
      return;
    case "run_start":
      state.running = true;
      state.failure = undefined;
      return;
    case "run_end":
      state.running = false;
      state.partial = undefined;
      state.toolOutput = {};
      state.retry = undefined;
      return;
    case "message_start":
      if (event.message.role === "assistant")
        state.partial = structuredClone(event.message);
      return;
    case "message_update":
      if (state.partial)
        for (const change of event.changes) applyChange(state.partial, change);
      return;
    case "message_end":
      appendEntry(state, event.entry);
      if (event.entry.model?.[0]?.role === "assistant")
        state.partial = undefined;
      return;
    case "entry_appended":
      appendEntry(state, event.entry);
      return;
    case "tool_execution_start":
      state.toolOutput[event.toolCallId] = "";
      return;
    case "tool_execution_update": {
      const output = event.output;
      if (output === undefined) return;
      if ("set" in output) {
        state.toolOutput[event.toolCallId] = output.set;
        return;
      }
      const current = state.toolOutput[event.toolCallId] ?? "";
      state.toolOutput[event.toolCallId] =
        current.slice(output.trimStart ?? 0) + (output.append ?? "");
      return;
    }
    case "tool_execution_end":
      delete state.toolOutput[event.toolCallId];
      return;
    case "inbox_update":
      state.queued = event.items.length;
      return;
    case "auto_retry_start":
      state.retry = {
        attempt: event.attempt,
        at: event.at,
        error: event.errorMessage,
      };
      return;
    case "auto_retry_end":
      state.retry = undefined;
      return;
    case "submission": {
      const record = event.record;
      if (
        record.type === "input" &&
        record.status === "unanswered" &&
        record.reason !== "aborted"
      )
        state.failure = describeFailure(record.reason, record.detail);
      return;
    }
    case "agent_changed":
      state.model = event.agent.model;
      return;
    case "task_failed":
      state.failure = event.message;
      return;
  }
}

function fromSnapshot(snapshot: SnapshotEvent): ChatStreamState {
  const toolOutput: Record<string, string> = {};
  for (const slot of snapshot.tools)
    if (slot.status === "running") toolOutput[slot.callId] = slot.output ?? "";
  const generation = snapshot.generation;
  return {
    entries: [...snapshot.entries],
    partial: generation?.message && structuredClone(generation.message),
    toolOutput,
    running: snapshot.run !== undefined,
    queued: snapshot.inbox.length,
    retry: generation?.retry && {
      attempt: generation.attempt,
      ...generation.retry,
    },
    failure: undefined,
    model: snapshot.agent.model,
  };
}

function appendEntry(state: Mutable<ChatStreamState>, entry: EntryRecord) {
  // Entry ids grow in commit order, so anything at or below the newest id is already here.
  const newest = state.entries.at(-1);
  if (newest !== undefined && newest.id >= entry.id) return;
  state.entries.push(entry);
}

function applyChange(message: AssistantMessage, change: MessageChange) {
  switch (change.type) {
    case "text_start":
    case "thinking_start":
    case "toolcall_start":
    case "block":
      message.content[change.contentIndex] = change.block;
      return;
    case "text_delta": {
      const block = message.content[change.contentIndex];
      if (block?.type === "text") block.text += change.delta;
      return;
    }
    case "thinking_delta": {
      const block = message.content[change.contentIndex];
      if (block?.type === "thinking") block.thinking += change.delta;
      return;
    }
    case "toolcall_delta": {
      const block = message.content[change.contentIndex];
      if (block?.type === "toolCall")
        appendAtPath(block.arguments, change.path, change.delta);
      return;
    }
    case "message":
      Object.assign(message, structuredClone(change.message));
      return;
  }
}

/** Append streamed argument text to the string at `path`, creating it when absent. */
function appendAtPath(
  target: ToolCall["arguments"],
  path: readonly (string | number)[],
  delta: string,
) {
  if (path.length === 0) return;
  let node: Record<string | number, unknown> = target;
  for (const key of path.slice(0, -1)) {
    const child = node[key];
    if (typeof child !== "object" || child === null) return;
    node = child as Record<string | number, unknown>;
  }
  const leaf = path[path.length - 1];
  const current = node[leaf];
  node[leaf] = (typeof current === "string" ? current : "") + delta;
}

function describeFailure(reason: string, detail: unknown): string {
  if (typeof detail === "string" && detail.length > 0) return detail;
  if (typeof detail === "object" && detail !== null && "message" in detail) {
    const message = (detail as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return reason.replaceAll("_", " ");
}

// --- Display model -------------------------------------------------------

export type ToolPart = {
  type: "tool";
  callId: string;
  name: string;
  args: Record<string, unknown>;
  status: "pending" | "running" | "done" | "error" | "interrupted";
  /** Running output while the call works. */
  output?: string;
  /** Result text once it finished. */
  result?: string;
};

export type AssistantPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string; streaming: boolean }
  | ToolPart;

export type ChatMessage =
  | { role: "user"; key: string; text: string }
  | {
      role: "assistant";
      key: string;
      parts: AssistantPart[];
      /** The model that produced the latest response in this reply. */
      model?: ModelRef;
      streaming: boolean;
      /** Hei is working on this reply but the model has nothing visible to show yet, e.g. while reasoning privately. */
      waiting: boolean;
      /** This reply comes from a different model than the reply before it. */
      modelChanged: boolean;
      /** Hei switched accounts for this reply because a limit stopped the previous model. */
      failover?: { reason: string };
      error?: string;
      stopped?: boolean;
    };

type AssistantChatMessage = Extract<ChatMessage, { role: "assistant" }>;

/**
 * The transcript as the UI shows it: each user message, then one assistant reply that gathers every model response and
 * tool call of the run that answered it.
 */
export function chatMessages(state: ChatStreamState): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const marks: ResponseMarks = new WeakMap();
  let reply: AssistantChatMessage | undefined;
  // A failover's reason, for the next reply; and the message it sent again, whose second copy isn't shown.
  let switched: { reason: string } | undefined;
  let resent: string | undefined;

  const currentReply = (key: string) => {
    if (reply === undefined) {
      reply = {
        role: "assistant",
        key,
        parts: [],
        streaming: false,
        waiting: false,
        modelChanged: false,
        failover: switched,
      };
      switched = undefined;
      messages.push(reply);
    }
    return reply;
  };

  for (const entry of state.entries) {
    if (entry.kind === FAILOVER_ENTRY) {
      const note = entry.data as FailoverNote;
      if (note.to === undefined) {
        // Nowhere to switch: explain on the reply the limit stopped.
        if (reply !== undefined)
          reply.error = [note.reason, note.hint].filter(Boolean).join(". ");
        continue;
      }
      if (note.resubmitted !== undefined) {
        // The failed attempt gives way to the reply on the other model.
        if (reply !== undefined && messages.at(-1) === reply) messages.pop();
        reply = undefined;
        resent = note.resubmitted;
      }
      switched = { reason: note.reason };
      continue;
    }
    const message = entry.model?.[0];
    if (message === undefined) continue;
    if (message.role === "user" && entry.kind === "pi.user") {
      const text = userText(message);
      if (resent !== undefined && text === resent) {
        resent = undefined;
        reply = undefined;
        continue;
      }
      messages.push({
        role: "user",
        key: `e${entry.id}`,
        text,
      });
      reply = undefined;
    } else if (message.role === "assistant") {
      addResponse(currentReply(`e${entry.id}`), message, false, marks);
    } else if (message.role === "toolResult") {
      attachResult(reply, message);
    }
  }

  if (state.partial !== undefined) {
    const current = currentReply("partial");
    const shown = addResponse(current, state.partial, true, marks);
    current.streaming = true;
    current.waiting = shown === 0;
  } else if (state.running) {
    // Before the model's first output, and between tool rounds, there is no response in progress. Show the reply as
    // waiting anyway, so the work is visible.
    const current = currentReply("pending");
    current.streaming = true;
    current.waiting = true;
  }

  let previousModel: ModelRef | undefined;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    if (message.model !== undefined) {
      message.modelChanged =
        previousModel !== undefined &&
        (previousModel.provider !== message.model.provider ||
          previousModel.modelId !== message.model.modelId);
      previousModel = message.model;
    }
    for (const part of message.parts) {
      if (part.type !== "tool" || part.result !== undefined) continue;
      const output = state.toolOutput[part.callId];
      if (output !== undefined) {
        part.status = "running";
        part.output = output;
      } else {
        part.status = state.running ? "pending" : "interrupted";
      }
    }
  }
  return messages;
}

/** Where each reply's latest response starts in its parts, and whether the model's context leaves it out. */
type ResponseMarks = WeakMap<
  AssistantChatMessage,
  { start: number; excluded: boolean }
>;

/** Add a model response to a reply; returns how many visible parts it contributed. */
function addResponse(
  reply: AssistantChatMessage,
  message: AssistantMessage,
  streaming: boolean,
  marks: ResponseMarks,
): number {
  // pi-durable leaves aborted and failed responses out of the model's context, so a later response in the same run
  // (a retry, or the run resumed after a restart) redoes their work. Show only the newer one.
  const previous = marks.get(reply);
  if (previous?.excluded) reply.parts.length = previous.start;
  marks.set(reply, {
    start: reply.parts.length,
    excluded:
      message.stopReason === "aborted" || message.stopReason === "error",
  });
  reply.model = { provider: message.provider, modelId: message.model };
  // A later response supersedes an earlier failed attempt.
  reply.error =
    message.stopReason === "error"
      ? (message.errorMessage ?? "The model returned an error.")
      : undefined;
  reply.stopped = message.stopReason === "aborted";
  message.content.forEach((block, index) => {
    if (block.type === "text") {
      if (block.text.length > 0)
        reply.parts.push({ type: "text", text: block.text });
    } else if (block.type === "thinking") {
      if (block.redacted || block.thinking.length === 0) return;
      const isLast = index === message.content.length - 1;
      reply.parts.push({
        type: "reasoning",
        text: block.thinking,
        streaming: streaming && isLast,
      });
    } else {
      reply.parts.push({
        type: "tool",
        callId: block.id,
        name: block.name,
        args: { ...block.arguments },
        status: "pending",
      });
    }
  });
  return reply.parts.length - (marks.get(reply)?.start ?? 0);
}

function attachResult(
  reply: AssistantChatMessage | undefined,
  result: ToolResultMessage,
) {
  const part = reply?.parts.find(
    (candidate): candidate is ToolPart =>
      candidate.type === "tool" && candidate.callId === result.toolCallId,
  );
  if (part === undefined) return;
  part.status = result.isError ? "error" : "done";
  part.result = result.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

function userText(message: UserMessage): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] } & {
  entries: EntryRecord[];
  toolOutput: Record<string, string>;
};
