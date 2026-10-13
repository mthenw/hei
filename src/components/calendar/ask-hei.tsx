"use client";

import { MessageSquareIcon, SquarePenIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatListProvider } from "@/components/chat/chat-list";
import { ChatView } from "@/components/chat/chat-view";
import { ModelsProvider } from "@/components/chat/models";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { startChat } from "@/lib/chat-api";

/**
 * A chat beside the calendar: ask about the schedule, get plan cards to approve, and watch the grid change. It is an
 * ordinary chat, so it is also in the chat list.
 */
export function AskHei({ onClose }: { onClose: () => void }) {
  const [chatId, setChatId] = useState<number>();

  return (
    <ChatListProvider>
      <ModelsProvider>
        <div className="flex h-full min-h-0 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-1 border-b pr-2 pl-4">
            <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
              Ask Hei
            </h2>
            {chatId !== undefined && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setChatId(undefined)}
                    >
                      <SquarePenIcon />
                      <span className="sr-only">New question</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>New question</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild variant="ghost" size="icon-sm">
                      <Link href={`/chat/${chatId}`}>
                        <MessageSquareIcon />
                        <span className="sr-only">Open in Chats</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open in Chats</TooltipContent>
                </Tooltip>
              </>
            )}
            <Button variant="ghost" size="icon-sm" onClick={onClose}>
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </header>
          <div className="min-h-0 flex-1">
            {chatId === undefined ? (
              <div className="flex h-full flex-col justify-end gap-3 p-4">
                <p className="text-sm text-muted-foreground">
                  Ask about your schedule, or what to move: “Find two hours for
                  deep work on Thursday”, “Move the dentist to next week”. Hei
                  shows changes as a card for you to approve.
                </p>
                <ChatComposer
                  onSend={async (text) => setChatId(await startChat(text))}
                />
              </div>
            ) : (
              <ChatView
                key={chatId}
                chatId={chatId}
                onGone={() => setChatId(undefined)}
              />
            )}
          </div>
        </div>
      </ModelsProvider>
    </ChatListProvider>
  );
}
