import { MessagesSquareIcon, SquarePenIcon } from "lucide-react";
import Link from "next/link";
import { SidebarHeader } from "@/components/shell/sidebar-header";
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

export function ChatSidebar() {
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
      <ScrollArea className="min-h-0 flex-1">
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
      </ScrollArea>
    </div>
  );
}
