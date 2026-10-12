"use client";

import { useState } from "react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";

type ChatComposerProps = {
  /** Resolve once the message is admitted; a throw keeps the text in the box. */
  onSend: (text: string) => Promise<void>;
  /** While Hei is replying, the button stops the run instead of sending. */
  running?: boolean;
  onStop?: () => Promise<void>;
  /** Shown beside the button, e.g. how many messages are queued. */
  status?: string;
};

export function ChatComposer({
  onSend,
  running = false,
  onStop,
  status,
}: ChatComposerProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();

  async function send({ text }: { text: string }) {
    if (text.trim() === "") return;
    setSending(true);
    setError(undefined);
    try {
      await onSend(text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <PromptInputProvider>
        <PromptInput onSubmit={send}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask Hei anything" />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              {status && (
                <span className="px-2 text-xs text-muted-foreground">
                  {status}
                </span>
              )}
            </PromptInputTools>
            <PromptInputSubmit
              status={sending ? "submitted" : running ? "streaming" : "ready"}
              onStop={running ? onStop : undefined}
            />
          </PromptInputFooter>
        </PromptInput>
      </PromptInputProvider>
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
