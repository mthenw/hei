"use client";

import {
  Message,
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

export function ChatMessageView({
  message,
  switchedTo,
}: {
  message: ChatMessage;
  /** Display name of the model, when this reply is the first from a different model than the one before. */
  switchedTo?: string;
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
    <Message from="assistant">
      {switchedTo && (
        <p className="text-xs text-muted-foreground">
          Switched to {switchedTo}
        </p>
      )}
      <MessageContent>
        {message.parts.map((part, index) => (
          <AssistantPartView
            // biome-ignore lint/suspicious/noArrayIndexKey: parts only append within a reply, so position is stable, while entry ids change when the streamed response commits and would remount it.
            key={index}
            part={part}
            streaming={message.streaming}
          />
        ))}
        {message.waiting && <Shimmer>Thinking…</Shimmer>}
        {message.error && (
          <p className="text-sm text-destructive">{message.error}</p>
        )}
        {message.stopped && (
          <p className="text-xs text-muted-foreground">Stopped</p>
        )}
      </MessageContent>
    </Message>
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
        <MessageResponse isAnimating={streaming}>{part.text}</MessageResponse>
      );
    case "reasoning":
      return (
        <Reasoning isStreaming={part.streaming}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );
    case "tool":
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
