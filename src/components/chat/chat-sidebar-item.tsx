"use client";

import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useRef, useState } from "react";
import type { ChatSummary } from "@/chats/chats";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { deleteChat, renameChat } from "@/lib/chat-api";

type ChatSidebarItemProps = { chat: ChatSummary; active: boolean };

export function ChatSidebarItem({ chat, active }: ChatSidebarItemProps) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function remove() {
    await deleteChat(chat.id);
    if (active) router.push("/chat");
  }

  if (renaming)
    return <RenameField chat={chat} onDone={() => setRenaming(false)} />;

  return (
    <div className="group/item relative flex items-center">
      <Button
        asChild
        variant={active ? "secondary" : "ghost"}
        className="min-w-0 flex-1 justify-start pr-8 font-normal"
      >
        <Link
          href={`/chat/${chat.id}`}
          aria-current={active ? "page" : undefined}
        >
          <span className="truncate">{chat.title}</span>
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Hidden until hover on pointer devices; always shown on touch screens, which have no hover. */}
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-1.5 opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
          >
            <MoreHorizontalIcon />
            <span className="sr-only">Actions for {chat.title}</span>
          </Button>
        </DropdownMenuTrigger>
        {/* Keep focus where the chosen action puts it, such as the rename field, instead of back on this button. */}
        <DropdownMenuContent
          align="start"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <PencilIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmingDelete(true)}
            >
              <Trash2Icon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              “{chat.title}” will be removed from Hei. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RenameField({
  chat,
  onDone,
}: {
  chat: ChatSummary;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(chat.title);
  const [error, setError] = useState<string>();
  // Enter saves and unmounts the field; the blur that may follow must not save again.
  const finished = useRef(false);

  async function save() {
    if (finished.current) return;
    const trimmed = title.trim();
    if (trimmed === "" || trimmed === chat.title) {
      finished.current = true;
      onDone();
      return;
    }
    try {
      finished.current = true;
      await renameChat(chat.id, trimmed);
      onDone();
    } catch (cause) {
      finished.current = false;
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      finished.current = true;
      onDone();
    }
  }

  return (
    <div className="flex flex-col gap-1 px-0.5 py-0.5">
      <Input
        autoFocus
        aria-label="Chat title"
        aria-invalid={error !== undefined}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void save()}
        onFocus={(event) => event.target.select()}
      />
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
