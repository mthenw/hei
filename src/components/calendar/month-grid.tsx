"use client";

import { useState } from "react";
import type { CalendarEvent, CalendarSummary } from "@/calendar/calendars";
import { eventsOnDay } from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";
import type { Todo } from "@/todos/todos";
import { EventChip } from "./event-chip";
import { carriesTodo, droppedTodo, TodoChip, type TodoDrop } from "./todo-chip";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Events listed in a cell before "+N more". */
const SHOWN = 3;

/**
 * Six weeks from Monday: each day with its todos and first few events, and a way into the day for the rest. A todo
 * dropped on a day gets that date.
 */
export function MonthGrid({
  days,
  month,
  events,
  todos,
  calendars,
  timeZone,
  today,
  onPickDay,
  onOpenTodo,
  onDropTodo,
}: {
  days: string[];
  /** "2026-10": days outside it are dimmed. */
  month: string;
  events: CalendarEvent[];
  /** Open todos with a date. */
  todos: Todo[];
  calendars: Map<number, CalendarSummary>;
  timeZone: string;
  today: string;
  onPickDay: (date: string) => void;
  onOpenTodo: (id: number) => void;
  onDropTodo: TodoDrop;
}) {
  const [over, setOver] = useState<string>();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="border-l py-2 text-center text-xs text-muted-foreground first:border-l-0"
          >
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((date) => {
          const listed = eventsOnDay(events, date, timeZone);
          const dayTodos = todos.filter((todo) => todo.dueDate === date);
          const room = Math.max(0, SHOWN - dayTodos.length);
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: a drop target for dragged todos; the todo editor sets dates from the keyboard.
            <div
              key={date}
              onDragOver={(event) => {
                if (!carriesTodo(event)) return;
                event.preventDefault();
                setOver(date);
              }}
              onDragLeave={() => setOver(undefined)}
              onDrop={(event) => {
                setOver(undefined);
                const id = droppedTodo(event);
                if (id === undefined) return;
                event.preventDefault();
                onDropTodo(id, date);
              }}
              className={cn(
                "flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden border-b border-l p-1 [&:nth-child(7n+1)]:border-l-0",
                date.slice(0, 7) !== month && "bg-muted/30",
                over === date && "bg-primary/10",
              )}
            >
              <button
                type="button"
                onClick={() => onPickDay(date)}
                className={cn(
                  "mb-0.5 flex size-6 shrink-0 items-center justify-center self-end rounded-full text-xs tabular-nums hover:bg-muted",
                  date === today &&
                    "bg-primary font-semibold text-primary-foreground hover:bg-primary",
                  date.slice(0, 7) !== month &&
                    date !== today &&
                    "text-muted-foreground",
                )}
              >
                {Number(date.slice(8))}
              </button>
              {dayTodos.map((todo) => (
                <TodoChip
                  key={todo.id}
                  todo={todo}
                  onOpen={onOpenTodo}
                  showTime
                />
              ))}
              {listed.slice(0, room).map((event) => (
                <EventChip
                  key={event.id}
                  event={event}
                  calendar={calendars.get(event.calendarId)}
                  timeZone={timeZone}
                  compact
                />
              ))}
              {listed.length > room && (
                <button
                  type="button"
                  onClick={() => onPickDay(date)}
                  className="w-fit px-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  +{listed.length - room} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
