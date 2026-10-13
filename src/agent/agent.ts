import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import {
  type AgentEventStream,
  AssistantEntry,
  type ConversationId,
  createRegistry,
  type EntryId,
  type Extension,
  Harness,
  type ModelRef,
  type Storage,
  watchEvents,
} from "@earendil-works/pi-durable";
import { HeiError, isHeiError } from "@/lib/errors";
import type { FailoverNote } from "@/lib/failover-note";
import { FAILOVER_ENTRY } from "@/lib/failover-note";
import { REGENERATE_ENTRY, type RegenerateNote } from "@/lib/regenerate-note";
import { heiExtension, type PersonaSource } from "./extension";
import type { Catalog, ModelChoice } from "./model-catalog";

/** A Chat is identified by the id of the pi-durable conversation behind it. */
export type ChatId = number;

export type Message = {
  content: string;
  /** Idempotency key: resubmitting the same id never sends the message twice. */
  requestId: string;
};

/** How a message's run ended. */
export type Settled =
  | { status: "done"; answer: string | undefined }
  | {
      status: "unanswered";
      /** pi-durable's reason, e.g. "model_error" or "aborted". */
      reason: string;
      /** The error text, for a model error. */
      detail: string | undefined;
      /** The user's message in the transcript, if it was placed. */
      entry: number | undefined;
    };

/** A message Hei admitted. */
export type Sent = {
  /** Resolves when the run that answers the message ends. */
  settled(): Promise<Settled>;
};

export class ChatNotFound extends HeiError<"ChatNotFound"> {
  constructor(readonly chatId: ChatId) {
    super("ChatNotFound", `Chat ${chatId} not found`);
  }

  static is(error: unknown): error is ChatNotFound {
    return isHeiError(error, "ChatNotFound");
  }
}

export class ModelUnavailable extends HeiError<"ModelUnavailable"> {
  constructor(model: ModelRef) {
    super(
      "ModelUnavailable",
      `${model.provider}/${model.modelId} is not available. Check Settings → Connections.`,
    );
  }

  static is(error: unknown): error is ModelUnavailable {
    return isHeiError(error, "ModelUnavailable");
  }
}

export class NothingToRegenerate extends HeiError<"NothingToRegenerate"> {
  constructor(chatId: ChatId) {
    super(
      "NothingToRegenerate",
      `Chat ${chatId} has no message to answer again.`,
    );
  }

  static is(error: unknown): error is NothingToRegenerate {
    return isHeiError(error, "NothingToRegenerate");
  }
}

export type AgentOptions = {
  storage: Storage;
  models: Models;
  catalog: Catalog;
  /** Extensions beside Hei's own, such as web access. Every chat uses all of them. */
  extensions?: Extension[];
  /** The user's Profile, read on every request; defaults to an empty one. */
  persona?: PersonaSource;
};

// Every Hei call runs to completion on its own; cancellation is per conversation, through stop().
const context = BACKGROUND_CONTEXT;

/** Hei's agent runtime: one pi-durable Harness and the operations the app needs from it. */
export class Agent {
  private constructor(
    private readonly harness: Harness,
    private readonly models: Models,
    readonly catalog: Catalog,
  ) {}

  /** Open the Harness and continue any run the previous process left unfinished. */
  static async open(options: AgentOptions): Promise<Agent> {
    const registry = createRegistry();
    registry.install(heiExtension(options.persona));
    for (const extension of options.extensions ?? [])
      registry.install(extension);
    const harness = await Harness.open(
      options.storage,
      { models: options.models, registry },
      context,
    );
    harness.resume();
    return new Agent(harness, options.models, options.catalog);
  }

  /** The models a chat can run on right now. */
  availableModels(): Promise<ModelChoice[]> {
    return this.catalog.available();
  }

  /** Create an empty chat on `model`, or on the default model. */
  async createChat(model?: ModelRef): Promise<ChatId> {
    const chosen = model ?? (await this.catalog.defaultModel());
    await this.requireAvailable(chosen);
    const conversation = await this.harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: { model: chosen, thinkingLevel: "medium" },
      },
      context,
    );
    return conversation.id;
  }

  /** The model a chat runs on now. */
  async chatModel(chatId: ChatId): Promise<ModelRef | undefined> {
    const conversation = await this.conversation(chatId);
    return (await conversation.agent(context)).model;
  }

  /** Switch the model a chat runs on, from its next request. */
  async setModel(chatId: ChatId, model: ModelRef): Promise<void> {
    const conversation = await this.conversation(chatId);
    await this.requireAvailable(model);
    await conversation.configure({ model }, context);
  }

  /** Send a message. While Hei is busy it waits as a follow-up for the current run to finish. */
  async send(chatId: ChatId, message: Message): Promise<Sent> {
    const conversation = await this.conversation(chatId);
    const submission = await conversation.submit(
      { type: "input", content: message.content, requestId: message.requestId },
      context,
    );
    return {
      settled: async () => {
        const record = await submission.wait(context);
        if (record.type !== "input")
          return {
            status: "unanswered",
            reason: "not_input",
            detail: undefined,
            entry: undefined,
          };
        if (record.status === "done") {
          const answer = await conversation.commit(
            (tx) => tx.entry(AssistantEntry, record.answer),
            context,
          );
          return { status: "done", answer: textOf(answer?.model?.[0]) };
        }
        return {
          status: "unanswered",
          reason: record.reason ?? "unknown",
          detail: typeof record.detail === "string" ? record.detail : undefined,
          entry: record.entry,
        };
      },
    };
  }

  /**
   * Record a failover in the chat's transcript. `omit` hides an earlier entry, the message about to be sent again, from
   * the model's context, so it reads the message once.
   */
  async writeFailover(
    chatId: ChatId,
    note: FailoverNote,
    omit?: number,
  ): Promise<void> {
    const conversation = await this.conversation(chatId);
    await conversation.submit(
      {
        type: "write",
        entry: {
          kind: FAILOVER_ENTRY,
          data: note,
          ...(omit === undefined
            ? {}
            : {
                edits: [{ target: omit as EntryId, action: "omit" as const }],
              }),
        },
      },
      context,
    );
  }

  /**
   * Prepare to answer the last message again: stop any reply in progress, then write a `hei.regenerate` entry that hides
   * the message and everything after it from the model's context. Returns the message for the caller to send again.
   */
  async regenerate(chatId: ChatId, requestId: string): Promise<Message> {
    const conversation = await this.conversation(chatId);
    await conversation.abort(context);
    const { entries, contributions } = await conversation.context(context);
    // What the model still sees: entries already omitted, or left out like aborted responses, contribute nothing.
    const seen = (index: number) => contributions[index].length > 0;
    const last = entries.findLastIndex(
      (entry, index) => entry.kind === "pi.user" && seen(index),
    );
    if (last === -1) throw new NothingToRegenerate(chatId);

    const content = userText(entries[last].model?.[0]);
    const omitted = entries.filter((_, index) => index >= last && seen(index));
    const note: RegenerateNote = { resubmitted: content };
    await conversation.submit(
      {
        type: "write",
        requestId: `${requestId}:regenerate`,
        entry: {
          kind: REGENERATE_ENTRY,
          data: note,
          edits: omitted.map((entry) => ({
            target: entry.id,
            action: "omit" as const,
          })),
        },
      },
      context,
    );
    return { content, requestId };
  }

  /** Stop the current run and withdraw queued messages. Resolves once the chat is idle. */
  async stop(chatId: ChatId): Promise<void> {
    const conversation = await this.conversation(chatId);
    await conversation.abort(context);
  }

  /** Subscribe to a chat's events: a snapshot, then one batch per commit. */
  async watch(chatId: ChatId): Promise<AgentEventStream> {
    await this.conversation(chatId);
    return watchEvents(this.harness, chatId as ConversationId, context);
  }

  /**
   * A small job outside any chat, such as writing a title, on the cheap side-job model. Resolves to nothing when no
   * such model is configured or the request fails.
   */
  async complete(
    instructions: string,
    input: string,
  ): Promise<string | undefined> {
    const ref = await this.catalog.sideJobModel();
    const model = ref && this.models.getModel(ref.provider, ref.modelId);
    if (model === undefined) return undefined;
    const response = await this.models.completeSimple(
      model,
      {
        systemPrompt: instructions,
        messages: [{ role: "user", content: input, timestamp: Date.now() }],
      },
      { reasoning: "minimal" },
    );
    if (response.stopReason === "error" || response.stopReason === "aborted")
      return undefined;
    return textOf(response);
  }

  async close(): Promise<void> {
    await this.harness.close(context);
  }

  private async requireAvailable(model: ModelRef) {
    if (!(await this.catalog.isAvailable(model)))
      throw new ModelUnavailable(model);
  }

  private async conversation(chatId: ChatId) {
    const conversation = await this.harness.conversation(
      chatId as ConversationId,
      context,
    );
    if (conversation === undefined) throw new ChatNotFound(chatId);
    return conversation;
  }
}

/** The text of a user message as Hei sent it. */
function userText(message: { role: string; content?: unknown } | undefined) {
  if (message?.role !== "user") return "";
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .filter((block) => block?.type === "text")
    .map((block) => block.text as string)
    .join("\n");
}

function textOf(message: { role: string; content?: unknown } | undefined) {
  if (message?.role !== "assistant" || !Array.isArray(message.content))
    return undefined;
  const text = message.content
    .filter((block) => block?.type === "text")
    .map((block) => block.text as string)
    .join("")
    .trim();
  return text.length > 0 ? text : undefined;
}
