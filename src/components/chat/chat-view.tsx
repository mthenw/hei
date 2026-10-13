"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { usePageTitle } from "@/components/shell/section-layout";
import { Spinner } from "@/components/ui/spinner";
import { useChatStream } from "@/hooks/use-chat-stream";
import {
  regenerateReply,
  sendMessage,
  setChatModel,
  stopChat,
} from "@/lib/chat-api";
import { chatMessages } from "@/lib/chat-stream";
import { ChatComposer } from "./chat-composer";
import { useChatList } from "./chat-list";
import { ChatMessageView } from "./chat-message";
import { ModelPicker } from "./model-picker";
import { useModels } from "./models";

export function ChatView({ chatId }: { chatId: number }) {
  const { state, connection, loaded } = useChatStream(chatId);
  const messages = useMemo(() => chatMessages(state), [state]);
  const { nameOf } = useModels();
  useChatTitle(chatId);

  if (connection === "closed") {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        This chat could not be loaded.
      </div>
    );
  }

  const last = messages.at(-1);
  const lastReplyFailed =
    last?.role === "assistant" && last.error !== undefined;
  const regenerate = () => regenerateReply(chatId);

  const status = [
    state.queued > 0 && `${state.queued} queued`,
    state.retry && `Retrying (attempt ${state.retry.attempt})`,
    connection === "reconnecting" && "Reconnecting…",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex h-full flex-col">
      {/* Opening a chat jumps to its end; only new content scrolls smoothly. */}
      <Conversation initial="instant">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {!loaded && (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Spinner />
            </div>
          )}
          {messages.map((message) => (
            <ChatMessageView
              key={message.key}
              message={message}
              switchedTo={
                message.role === "assistant" &&
                (message.modelChanged || message.failover) &&
                message.model
                  ? nameOf(message.model)
                  : undefined
              }
              onRegenerate={
                message === last && !state.running ? regenerate : undefined
              }
            />
          ))}
          {/* A failed run already shows its error on the reply; this covers failures that left no reply. */}
          {state.failure && !state.running && !lastReplyFailed && (
            <p className="text-sm text-destructive">{state.failure}</p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <ChatComposer
          onSend={(text) => sendMessage(chatId, text)}
          running={state.running}
          onStop={() => stopChat(chatId)}
          status={status}
          tools={
            <ModelPicker
              value={state.model}
              onChange={(model) =>
                setChatModel(chatId, model).catch((error) =>
                  console.warn("Could not switch the model:", error),
                )
              }
            />
          }
        />
      </div>
    </div>
  );
}

/**
 * Show the chat's title in the browser tab, and leave the chat once it is deleted, from this device or another.
 */
function useChatTitle(chatId: number) {
  const router = useRouter();
  const { chats } = useChatList();
  const title = chats.find((chat) => chat.id === chatId)?.title;
  usePageTitle(title);
  // A chat that was just started may reach this page before the list does, so only a chat that was listed and then
  // disappeared counts as deleted.
  const seen = useRef(false);

  useEffect(() => {
    if (title !== undefined) {
      seen.current = true;
      document.title = `${title} · Hei`;
    } else if (seen.current) {
      router.replace("/chat");
    }
  }, [title, router]);
}
