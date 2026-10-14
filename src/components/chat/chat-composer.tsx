"use client";

import { type ReactNode, useState } from "react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input";
import {
  MentionPopover,
  useMentionPicker,
} from "@/components/contacts/mention-picker";
import { fromTyped } from "@/lib/mentions";

type ChatComposerProps = {
  /** Resolve once the message is admitted; a throw keeps the text in the box. */
  onSend: (text: string) => Promise<void>;
  /** While Hei is replying, the button stops the run instead of sending. */
  running?: boolean;
  onStop?: () => Promise<void>;
  /** Shown beside the button, e.g. how many messages are queued. */
  status?: string;
  /** Controls in the composer's footer, such as the model picker. */
  tools?: ReactNode;
};

export function ChatComposer({
  onSend,
  running = false,
  onStop,
  status,
  tools,
}: ChatComposerProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  // People picked with @ in the text being written.
  const [picked] = useState(() => new Map<string, number>());

  async function send({ text }: { text: string }) {
    if (text.trim() === "") return;
    setSending(true);
    setError(undefined);
    try {
      await onSend(fromTyped(text, picked));
      picked.clear();
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
            <MentionTextarea picked={picked} />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              {tools}
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

/** The message box, with @ to mention a contact. */
function MentionTextarea({ picked }: { picked: Map<string, number> }) {
  const { textInput } = usePromptInputController();
  const picker = useMentionPicker<HTMLTextAreaElement>({
    value: textInput.value,
    onValueChange: textInput.setInput,
    picked,
  });
  return (
    <MentionPopover picker={picker} side="top">
      <PromptInputTextarea
        placeholder="Ask Hei anything"
        {...picker.fieldProps}
      />
    </MentionPopover>
  );
}
