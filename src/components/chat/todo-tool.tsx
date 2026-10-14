"use client";

import { ListTodoIcon } from "lucide-react";
import Link from "next/link";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { MentionText } from "@/components/contacts/mention-text";
import type { ToolPart } from "@/lib/chat-stream";
import { formatDue } from "@/lib/todo-dates";
import type { TodoToolDetails } from "@/todos/tools";
import { StatusIcon, ToolError } from "./web-tool";

const TODO_TOOLS = new Set([
  "list_todos",
  "add_todo",
  "update_todo",
  "delete_todo",
  "hand_off_todo",
  "report_result",
]);

export function isTodoTool(part: ToolPart): boolean {
  return TODO_TOOLS.has(part.name);
}

const VERBS: Record<TodoToolDetails["action"], string> = {
  listed: "Looked at your todos",
  added: "Added",
  updated: "Updated",
  completed: "Completed",
  reopened: "Reopened",
  deleted: "Deleted",
  handed_off: "Handed to an agent:",
  reported: "Reported the result on",
};

/** A change to the todo list, in one line that links to the Todos page. */
export function TodoToolView({ part }: { part: ToolPart }) {
  const working = part.status === "pending" || part.status === "running";
  const failed = part.status === "error" || part.status === "interrupted";
  const details = part.details as TodoToolDetails | undefined;

  const label = working ? (
    <Shimmer as="span">
      {part.name === "list_todos"
        ? "Looking at your todos"
        : "Updating your todos"}
    </Shimmer>
  ) : failed || details?.kind !== "todo" ? (
    "Couldn’t update your todos"
  ) : details.action === "listed" ? (
    `${VERBS.listed} · ${details.open ?? 0} open`
  ) : (
    <>
      {VERBS[details.action]} “<MentionText text={details.todo?.title ?? ""} />”
      {details.action === "added" && details.todo?.dueDate && (
        <span>
          {" · "}
          {formatDue(details.todo.dueDate, details.todo.dueTime, details.today)}
        </span>
      )}
    </>
  );

  return (
    <div className="not-prose flex flex-col">
      <Link
        href="/todos"
        className="flex max-w-full items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <StatusIcon working={working} failed={failed} icon={<ListTodoIcon />} />
        <span className="truncate">{label}</span>
      </Link>
      {failed && <ToolError part={part} />}
    </div>
  );
}
