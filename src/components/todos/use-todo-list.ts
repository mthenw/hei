"use client";

import { useEffect, useState } from "react";
import { localDate } from "@/lib/todo-dates";
import type { Todo, TodoList } from "@/todos/todos";

export type LiveTodoList = {
  todos: Todo[];
  /** Today in the Profile's time zone; undefined until the first list arrives. */
  today: string | undefined;
  loaded: boolean;
};

/** Follows the todo list: the server pushes it on every change. "Today" moves on at midnight even without a change. */
export function useTodoList(): LiveTodoList {
  const [list, setList] = useState<TodoList>();
  const [today, setToday] = useState<string>();

  useEffect(() => {
    const source = new EventSource("/api/todos/events");
    source.onmessage = (message) => {
      const next = JSON.parse(message.data) as TodoList;
      setList(next);
      setToday(next.today);
    };
    return () => source.close();
  }, []);

  const timeZone = list?.timeZone;
  useEffect(() => {
    if (timeZone === undefined) return;
    const timer = setInterval(
      () => setToday(localDate(Date.now(), timeZone)),
      60_000,
    );
    return () => clearInterval(timer);
  }, [timeZone]);

  return { todos: list?.todos ?? [], today, loaded: list !== undefined };
}
