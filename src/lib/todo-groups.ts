import { addDays, formatDay } from "./todo-dates";

/** What grouping needs from a todo. */
export type Groupable = {
  dueDate: string | null;
  dueTime: string | null;
  priority: "high" | "normal" | "low";
  done: boolean;
  doneAt: number | null;
  createdAt: number;
};

export type TodoGroups<T> = {
  /** Open, due today or earlier. */
  today: T[];
  /** Open, due later, one group per day in date order. */
  upcoming: { date: string; label: string; todos: T[] }[];
  /** Open, without a date. */
  someday: T[];
  /** Done, most recently done first. */
  completed: T[];
};

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 } as const;

/**
 * Sort todos for a list: high priority first, then those with a time by time, then by creation. In Today, overdue
 * todos come before today's within each priority.
 */
export function compareTodos(a: Groupable, b: Groupable): number {
  return (
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
    compareTimes(a.dueTime, b.dueTime) ||
    a.createdAt - b.createdAt
  );
}

function compareTimes(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

/** Split todos into the Todos page's groups, relative to `today`. */
export function groupTodos<T extends Groupable>(
  todos: readonly T[],
  today: string,
): TodoGroups<T> {
  const open = todos.filter((todo) => !todo.done);
  const upcoming = new Map<string, T[]>();
  for (const todo of open)
    if (todo.dueDate !== null && todo.dueDate > today)
      upcoming.set(todo.dueDate, [...(upcoming.get(todo.dueDate) ?? []), todo]);

  return {
    today: open
      .filter((todo) => todo.dueDate !== null && todo.dueDate <= today)
      .sort(compareTodos),
    upcoming: [...upcoming.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, todos]) => ({
        date,
        label: date === addDays(today, 1) ? "Tomorrow" : formatDay(date, today),
        todos: todos.sort(compareTodos),
      })),
    someday: open.filter((todo) => todo.dueDate === null).sort(compareTodos),
    completed: todos
      .filter((todo) => todo.done)
      .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
  };
}
