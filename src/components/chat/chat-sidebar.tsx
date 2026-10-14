"use client";

import { MessagesSquareIcon, SquarePenIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { SidebarHeader } from "@/components/shell/sidebar-header";
import { WithPathname } from "@/components/shell/with-pathname";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { groupChatsByDate } from "@/lib/chat-groups";
import { useChatList } from "./chat-list";
import { ChatSidebarItem } from "./chat-sidebar-item";

export function ChatSidebar() {
  const { chats, loaded } = useChatList();
  // Grouping reads the clock, so it waits for the list: prerendering must not depend on the current time.
  const groups = useMemo(
    () => (loaded ? groupChatsByDate(chats) : []),
    [chats, loaded],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarHeader title="Chats">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm">
              <Link href="/chat">
                <SquarePenIcon />
                <span className="sr-only">New chat</span>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>New chat</TooltipContent>
        </Tooltip>
      </SidebarHeader>
      {/* Radix wraps the content in a display:table box that grows to fit long titles; a block box lets them truncate. */}
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
        {loaded && chats.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessagesSquareIcon />
              </EmptyMedia>
              <EmptyTitle>No chats yet</EmptyTitle>
              <EmptyDescription>
                Your conversations will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <WithPathname>
            {(pathname) => (
              <nav aria-label="Chats" className="flex flex-col gap-4 px-2 pb-4">
                {groups.map((group) => (
                  <section key={group.label} className="flex flex-col gap-0.5">
                    <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      {group.label}
                    </h3>
                    {group.chats.map((chat) => (
                      <ChatSidebarItem
                        key={chat.id}
                        chat={chat}
                        active={pathname === `/chat/${chat.id}`}
                      />
                    ))}
                  </section>
                ))}
              </nav>
            )}
          </WithPathname>
        )}
      </ScrollArea>
    </div>
  );
}
