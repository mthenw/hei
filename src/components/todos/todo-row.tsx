"use client";

import { CalendarIcon, NotebookTextIcon } from "lucide-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { updateTodo } from "@/lib/chat-api";
import { formatDue } from "@/lib/todo-dates";
import { cn } from "@/lib/utils";
import type { Todo } from "@/todos/todos";
import { AgentBadge } from "./agent-badge";

export function TodoRow({
  todo,
  today,
  showDate = true,
  onOpen,
}: {
  todo: Todo;
  today: string;
  /** Under a day's heading the date is known; only the time shows. */
  showDate?: boolean;
  onOpen: (id: number) => void;
}) {
  // Ticking shows at once. It applies to the state it was ticked from; once the live list brings a change, the list
  // decides again.
  const [ticked, setTicked] = useState<{ done: boolean; from: boolean }>();
  const done = ticked?.from === todo.done ? ticked.done : todo.done;
  const overdue = !todo.done && todo.dueDate !== null && todo.dueDate < today;
  // Today's todos only need their time; elsewhere the day matters too, unless a heading already says it.
  const due =
    todo.dueDate === null
      ? undefined
      : showDate && todo.dueDate !== today
        ? formatDue(todo.dueDate, todo.dueTime, today)
        : (todo.dueTime ?? undefined);

  async function toggle(checked: boolean) {
    setTicked({ done: checked, from: todo.done });
    try {
      await updateTodo(todo.id, { done: checked });
    } catch (error) {
      console.warn("Could not update the todo:", error);
      setTicked(undefined);
    }
  }

  return (
    <li className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50">
      <Checkbox
        checked={done}
        onCheckedChange={(checked) => void toggle(checked === true)}
        aria-label={
          done ? `Reopen “${todo.title}”` : `Complete “${todo.title}”`
        }
        className="mt-0.5"
      />
      <button
        type="button"
        onClick={() => onOpen(todo.id)}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
      >
        <span
          className={cn(
            "text-sm",
            todo.priority === "low" && "text-muted-foreground",
            done && "text-muted-foreground line-through",
          )}
        >
          {todo.priority === "high" && !done && (
            <span
              className="mr-1 font-semibold text-primary"
              title="High priority"
            >
              !
            </span>
          )}
          {todo.title}
        </span>
        {(due || todo.notes || todo.agent) && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {due && (
              <span
                className={cn(
                  "flex items-center gap-1",
                  overdue && "text-destructive",
                )}
              >
                <CalendarIcon className="size-3" />
                {due}
              </span>
            )}
            {todo.notes && (
              <NotebookTextIcon className="size-3" aria-label="Has notes" />
            )}
            {todo.agent && !todo.done && <AgentBadge agent={todo.agent} />}
          </span>
        )}
      </button>
    </li>
  );
}
