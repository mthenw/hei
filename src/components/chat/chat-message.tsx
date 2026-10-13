"use client";

import { RefreshCcwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import type { AssistantPart, ChatMessage, ToolPart } from "@/lib/chat-stream";
import { citations } from "@/lib/citations";
import { CalendarToolView, isCalendarTool } from "./calendar-tool";
import { isPlacesTool, PlacesToolView } from "./places-tool";
import { CitationLink, CitationsProvider, SourceChips } from "./sources";
import { isTodoTool, TodoToolView } from "./todo-tool";
import { isWebTool, WebToolView } from "./web-tool";

// Stable, so memoised markdown blocks aren't re-rendered for a new object; the links read their numbers from context.
const markdownComponents = { a: CitationLink };

export function ChatMessageView({
  message,
  switchedTo,
  onRegenerate,
}: {
  message: ChatMessage;
  /** Display name of the model, when this reply moved to a different model than the reply before, or failed over. */
  switchedTo?: string;
  /** Offered on the last reply while Hei is idle: answer its message again. */
  onRegenerate?: () => Promise<void>;
}) {
  if (message.role === "user") {
    return (
      <Message from="user">
        <MessageContent className="whitespace-pre-wrap">
          {message.text}
        </MessageContent>
      </Message>
    );
  }

  return (
    <AssistantMessageView
      message={message}
      switchedTo={switchedTo}
      onRegenerate={onRegenerate}
    />
  );
}

function AssistantMessageView({
  message,
  switchedTo,
  onRegenerate,
}: {
  message: Extract<ChatMessage, { role: "assistant" }>;
  switchedTo?: string;
  onRegenerate?: () => Promise<void>;
}) {
  const cites = useMemo(
    () =>
      citations(
        message.parts.flatMap((part) =>
          part.type === "text" ? [part.text] : [],
        ),
        message.sources,
      ),
    [message.parts, message.sources],
  );

  return (
    <Message from="assistant">
      {switchedTo && (
        <p className="text-xs text-muted-foreground">
          Switched to {switchedTo}
          {message.failover && ` — ${message.failover.reason}`}
        </p>
      )}
      <MessageContent>
        <CitationsProvider citations={cites}>
          {message.parts.map((part, index) => (
            <AssistantPartView
              // biome-ignore lint/suspicious/noArrayIndexKey: parts only append within a reply, so position is stable, while entry ids change when the streamed response commits and would remount it.
              key={index}
              part={part}
              streaming={message.streaming}
            />
          ))}
        </CitationsProvider>
        {message.waiting && <Shimmer>Thinking…</Shimmer>}
        {message.error && (
          <p className="text-sm text-destructive">{message.error}</p>
        )}
        {message.stopped && (
          <p className="text-xs text-muted-foreground">Stopped</p>
        )}
        <SourceChips cited={cites.cited} />
      </MessageContent>
      {onRegenerate && (
        <MessageActions className="-ml-1.5">
          <RegenerateAction onRegenerate={onRegenerate} />
        </MessageActions>
      )}
    </Message>
  );
}

function RegenerateAction({
  onRegenerate,
}: {
  onRegenerate: () => Promise<void>;
}) {
  // One click, one new reply: the button waits for the request, then the reply it belongs to is replaced.
  const [pending, setPending] = useState(false);

  async function regenerate() {
    setPending(true);
    try {
      await onRegenerate();
    } catch (error) {
      console.warn("Could not regenerate the reply:", error);
    } finally {
      setPending(false);
    }
  }

  return (
    <MessageAction
      tooltip="Regenerate"
      size="icon-xs"
      // Quiet until pointed at: it sits under every last reply.
      className="text-muted-foreground"
      disabled={pending}
      onClick={() => void regenerate()}
    >
      <RefreshCcwIcon />
    </MessageAction>
  );
}

function AssistantPartView({
  part,
  streaming,
}: {
  part: AssistantPart;
  streaming: boolean;
}) {
  switch (part.type) {
    case "text":
      return (
        <MessageResponse
          isAnimating={streaming}
          components={markdownComponents}
        >
          {part.text}
        </MessageResponse>
      );
    case "reasoning":
      return (
        <Reasoning isStreaming={part.streaming}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );
    case "tool":
      if (isWebTool(part)) return <WebToolView part={part} />;
      if (isPlacesTool(part)) return <PlacesToolView part={part} />;
      if (isTodoTool(part)) return <TodoToolView part={part} />;
      if (isCalendarTool(part)) return <CalendarToolView part={part} />;
      return <ToolCallView part={part} />;
  }
}

const toolStates = {
  pending: "input-streaming",
  running: "input-available",
  done: "output-available",
  error: "output-error",
  interrupted: "output-error",
} as const;

function ToolCallView({ part }: { part: ToolPart }) {
  const errorText =
    part.status === "error"
      ? part.result
      : part.status === "interrupted"
        ? "Interrupted before it finished."
        : undefined;
  return (
    <Tool>
      <ToolHeader
        type="dynamic-tool"
        toolName={part.name}
        state={toolStates[part.status]}
      />
      <ToolContent>
        <ToolInput input={part.args} />
        <ToolOutput
          output={
            part.status === "error" ? undefined : (part.result ?? part.output)
          }
          errorText={errorText}
        />
      </ToolContent>
    </Tool>
  );
}
