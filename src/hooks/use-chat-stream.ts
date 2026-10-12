"use client";

import type { AgentEvent } from "@earendil-works/pi-durable";
import { useEffect, useState } from "react";
import {
  applyEvents,
  type ChatStreamState,
  emptyChatStream,
} from "@/lib/chat-stream";

export type ChatConnection = "connecting" | "open" | "reconnecting" | "closed";

/** Follow a chat's live state. Every open device sees the same updates; a reconnect starts from a fresh snapshot. */
export function useChatStream(chatId: number) {
  const [state, setState] = useState<ChatStreamState>(emptyChatStream);
  const [connection, setConnection] = useState<ChatConnection>("connecting");
  /** Whether the first snapshot has arrived; before that the chat is unknown rather than empty. */
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/chats/${chatId}/events`);
    source.onopen = () => setConnection("open");
    source.onmessage = (message) => {
      const events = JSON.parse(message.data) as AgentEvent[];
      setState((current) => applyEvents(current, events));
      setLoaded(true);
    };
    // EventSource retries a dropped connection by itself; it gives up only on an error response, such as 404.
    source.onerror = () =>
      setConnection(
        source.readyState === EventSource.CLOSED ? "closed" : "reconnecting",
      );
    return () => source.close();
  }, [chatId]);

  return { state, connection, loaded };
}
