"use client";

import { CircleIcon } from "lucide-react";
import type { CSSProperties, DragEvent } from "react";
import { cn } from "@/lib/utils";
import type { Todo } from "@/todos/todos";

/** The drag data type for a todo; dropping one on the calendar gives it a day or a time block. */
export const TODO_DRAG_TYPE = "application/x-hei-todo";

/** Where a todo was dropped: a day, and the minutes past midnight when it landed on a time. */
export type TodoDrop = (todoId: number, date: string, minutes?: number) => void;

export function startTodoDrag(event: DragEvent, todoId: number) {
  event.dataTransfer.setData(TODO_DRAG_TYPE, String(todoId));
  event.dataTransfer.effectAllowed = "copyMove";
}

/** The todo a drag carries, if it carries one. */
export function droppedTodo(event: DragEvent): number | undefined {
  const value = Number(event.dataTransfer.getData(TODO_DRAG_TYPE));
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function carriesTodo(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(TODO_DRAG_TYPE);
}

/** A todo in the calendar: dashed, so it reads as a todo, not an event. Click to edit; drag to another day or time. */
export function TodoChip({
  todo,
  onOpen,
  showTime = false,
  className,
  style,
}: {
  todo: Todo;
  onOpen: (id: number) => void;
  showTime?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => startTodoDrag(event, todo.id)}
      onClick={() => onOpen(todo.id)}
      style={style}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-[5px] border border-dashed border-muted-foreground/40 bg-background/60 px-1.5 py-0.5 text-left text-xs text-muted-foreground hover:border-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <CircleIcon className="size-3 shrink-0" />
      <span className="truncate">
        {todo.priority === "high" && (
          <span className="mr-0.5 font-semibold text-primary">!</span>
        )}
        {showTime && todo.dueTime && (
          <span className="mr-1 tabular-nums">{todo.dueTime}</span>
        )}
        {todo.title}
      </span>
    </button>
  );
}
