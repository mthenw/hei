"use client";

import { ChevronDownIcon, ListTodoIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { groupTodos } from "@/lib/todo-groups";
import type { Todo } from "@/todos/todos";
import { QuickAdd } from "./quick-add";
import { TodoEditor } from "./todo-editor";
import { TodoRow } from "./todo-row";
import { useTodoList } from "./use-todo-list";

/** The Todos page: quick add, then Today, Upcoming, Someday and Completed. */
export function TodosView() {
  const { todos, today, loaded } = useTodoList();
  const [editing, setEditing] = useState<number>();
  const groups = useMemo(
    () => (today === undefined ? undefined : groupTodos(todos, today)),
    [todos, today],
  );
  const open = (id: number) => setEditing(id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 md:p-6">
      <QuickAdd />
      {!loaded || groups === undefined || today === undefined ? (
        <div className="flex justify-center py-8 text-muted-foreground">
          <Spinner />
        </div>
      ) : todos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListTodoIcon />
            </EmptyMedia>
            <EmptyTitle>No todos yet</EmptyTitle>
            <EmptyDescription>
              Add one above, or ask Hei in a chat.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Group title="Today" empty="Nothing due today.">
            {groups.today.map((todo) => (
              <TodoRow key={todo.id} todo={todo} today={today} onOpen={open} />
            ))}
          </Group>
          {groups.upcoming.length > 0 && (
            <Group title="Upcoming">
              {groups.upcoming.map((day) => (
                <li key={day.date} className="flex flex-col">
                  <h3 className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                    {day.label}
                  </h3>
                  <ul>
                    {day.todos.map((todo) => (
                      <TodoRow
                        key={todo.id}
                        todo={todo}
                        today={today}
                        showDate={false}
                        onOpen={open}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </Group>
          )}
          {groups.someday.length > 0 && (
            <Group title="Someday">
              {groups.someday.map((todo) => (
                <TodoRow
                  key={todo.id}
                  todo={todo}
                  today={today}
                  onOpen={open}
                />
              ))}
            </Group>
          )}
          {groups.completed.length > 0 && (
            <Completed todos={groups.completed} today={today} onOpen={open} />
          )}
        </>
      )}
      <TodoEditor
        todo={todos.find((todo) => todo.id === editing)}
        onClose={() => setEditing(undefined)}
      />
    </div>
  );
}

function Group({
  title,
  empty,
  children,
}: {
  title: string;
  /** Shown when the group has nothing; without it, an empty group still shows its title. */
  empty?: string;
  children: ReactNode[];
}) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="px-2 text-sm font-semibold">{title}</h2>
      {children.length === 0 && empty ? (
        <p className="px-2 py-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col">{children}</ul>
      )}
    </section>
  );
}

function Completed({
  todos,
  today,
  onOpen,
}: {
  todos: Todo[];
  today: string;
  onOpen: (id: number) => void;
}) {
  return (
    <Collapsible className="group/completed flex flex-col gap-1">
      <CollapsibleTrigger className="flex items-center gap-1 px-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        Completed
        <span className="font-normal">· {todos.length}</span>
        <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]/completed:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col">
          {todos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} today={today} onOpen={onOpen} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
