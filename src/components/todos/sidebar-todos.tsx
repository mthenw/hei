"use client";

import { ListTodoIcon } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { SidebarHeader } from "@/components/shell/sidebar-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { addTodo } from "@/lib/chat-api";
import { groupTodos } from "@/lib/todo-groups";
import type { Todo } from "@/todos/todos";
import { TodoEditor } from "./todo-editor";
import { TodoRow } from "./todo-row";
import { useTodoList } from "./use-todo-list";

/** The open todos under the chat list: a quick add, then Today, Upcoming and Someday. The Todos page has the rest. */
export function SidebarTodos() {
  const { todos, today, loaded } = useTodoList();
  const [editing, setEditing] = useState<number>();
  const groups = useMemo(
    () => (today === undefined ? undefined : groupTodos(todos, today)),
    [todos, today],
  );
  const open = (id: number) => setEditing(id);

  return (
    <section
      aria-label="Todos"
      className="flex min-h-0 flex-1 flex-col border-t"
    >
      <SidebarHeader title="Todos">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm">
              <Link href="/todos">
                <ListTodoIcon />
                <span className="sr-only">Open Todos</span>
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open Todos</TooltipContent>
        </Tooltip>
      </SidebarHeader>
      <div className="px-2 pb-1">
        <SidebarQuickAdd />
      </div>
      {/* Radix wraps the content in a display:table box that grows to fit long titles; a block box lets them wrap. */}
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
        <div className="flex flex-col gap-2 px-2 pb-3">
          {groups && today && (
            <>
              <Group
                title="Today"
                todos={groups.today}
                today={today}
                onOpen={open}
              />
              <Group
                title="Upcoming"
                todos={groups.upcoming.flatMap((day) => day.todos)}
                today={today}
                onOpen={open}
              />
              <Group
                title="Someday"
                todos={groups.someday}
                today={today}
                onOpen={open}
              />
            </>
          )}
          {loaded && todos.every((todo) => todo.done) && (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Nothing to do.
            </p>
          )}
        </div>
      </ScrollArea>
      <TodoEditor
        todo={todos.find((todo) => todo.id === editing)}
        onClose={() => setEditing(undefined)}
      />
    </section>
  );
}

function Group({
  title,
  todos,
  today,
  onOpen,
}: {
  title: string;
  todos: Todo[];
  today: string;
  onOpen: (id: number) => void;
}) {
  if (todos.length === 0) return null;
  return (
    <div className="flex flex-col">
      <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground">
        {title}
      </h3>
      <ul className="flex flex-col">
        {todos.map((todo) => (
          <TodoRow key={todo.id} todo={todo} today={today} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

/** A title and Enter: the todo goes to Someday, to be given a date on the Todos page or by Hei. */
function SidebarQuickAdd() {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();

  async function add(event: FormEvent) {
    event.preventDefault();
    if (title.trim() === "") return;
    setError(undefined);
    try {
      await addTodo({ title });
      setTitle("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <form onSubmit={add} className="flex flex-col gap-1">
      <Input
        aria-label="New todo"
        placeholder="Add a todo"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="h-8 text-sm"
      />
      {error && <p className="px-1 text-xs text-destructive">{error}</p>}
    </form>
  );
}
