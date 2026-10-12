"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ChatSummary } from "@/chats/chats";

type ChatList = {
  chats: ChatSummary[];
  /** Whether the first list has arrived; before that the list is unknown rather than empty. */
  loaded: boolean;
};

const ChatListContext = createContext<ChatList | null>(null);

/** Follows the chat list for everything under it, through one connection: the server pushes the list on every change. */
export function ChatListProvider({ children }: { children: ReactNode }) {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/chats/events");
    source.onmessage = (message) => {
      setChats(JSON.parse(message.data) as ChatSummary[]);
      setLoaded(true);
    };
    return () => source.close();
  }, []);

  const value = useMemo(() => ({ chats, loaded }), [chats, loaded]);
  return <ChatListContext value={value}>{children}</ChatListContext>;
}

export function useChatList(): ChatList {
  const list = useContext(ChatListContext);
  if (list === null)
    throw new Error("useChatList must be used inside ChatListProvider");
  return list;
}
