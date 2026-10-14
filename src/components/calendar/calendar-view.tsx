"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TodoEditor } from "@/components/todos/todo-editor";
import { useTodoList } from "@/components/todos/use-todo-list";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  rangeTitle,
  shiftAnchor,
  type CalendarView as View,
  visibleDays,
} from "@/lib/calendar-layout";
import { createTimeBlock, removeTimeBlock, updateTodo } from "@/lib/chat-api";
import { withoutMentions } from "@/lib/mentions";
import { addDays, formatDue, localDate } from "@/lib/todo-dates";
import { startOfDay, zonedInstant } from "@/lib/zoned-time";
import { AskHei } from "./ask-hei";
import { MonthGrid } from "./month-grid";
import { BLOCK_MINUTES, TimeGrid } from "./time-grid";
import type { TodoDrop } from "./todo-chip";
import { useCalendar, useCalendarEvents } from "./use-calendar";

const VIEWS: { label: string; view: View }[] = [
  { label: "Day", view: { kind: "days", count: 1 } },
  { label: "Week", view: { kind: "week" } },
  { label: "Month", view: { kind: "month" } },
];

/** The calendar: a range of days or a month, moved with the buttons or the keys 1–9, w, m, t and the arrows. */
export function CalendarView() {
  const { overview, calendarsById } = useCalendar();
  const timeZone = overview?.timeZone;
  const today = useToday(timeZone);
  const [view, setView] = useState<View>(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches
      ? { kind: "days", count: 1 }
      : { kind: "week" },
  );
  const [anchor, setAnchor] = useState<string>();
  const shown = anchor ?? today;
  const [asking, setAsking] = useState(false);
  useAskKey(useCallback(() => setAsking((open) => !open), []));

  const { todos: allTodos } = useTodoList();
  const datedTodos = useMemo(
    () => allTodos.filter((todo) => !todo.done && todo.dueDate !== null),
    [allTodos],
  );
  const [editing, setEditing] = useState<number>();
  const [toast, setToast] = useState<Toast>();
  // A todo dropped on a time becomes a time block when a calendar can take one; otherwise it just gets that time.
  const canBlock = [...calendarsById.values()].some(
    (calendar) => calendar.isDefault,
  );

  const dropTodo: TodoDrop = (todoId, date, minutes) => {
    const todo = allTodos.find((candidate) => candidate.id === todoId);
    if (todo === undefined || timeZone === undefined || today === undefined)
      return;
    const failed = (error: unknown) =>
      setToast({
        message: error instanceof Error ? error.message : String(error),
      });
    if (minutes !== undefined && canBlock) {
      const start = zonedInstant(date, minutes, timeZone);
      createTimeBlock({
        todoId,
        start: new Date(start).toISOString(),
        end: new Date(start + BLOCK_MINUTES * 60_000).toISOString(),
      }).then(
        (event) =>
          setToast({
            message: `Blocked ${BLOCK_MINUTES} min for “${withoutMentions(todo.title)}”`,
            undo: () => removeTimeBlock(event.id),
          }),
        failed,
      );
      return;
    }
    const dueTime = minutes !== undefined ? clockOf(minutes) : todo.dueTime;
    updateTodo(todoId, { dueDate: date, dueTime }).then(
      () =>
        setToast({
          message: `“${withoutMentions(todo.title)}” is due ${formatDue(date, dueTime, today)}`,
          undo: () =>
            updateTodo(todoId, {
              dueDate: todo.dueDate,
              dueTime: todo.dueTime,
            }),
        }),
      failed,
    );
  };

  const days = shown ? visibleDays(view, shown) : [];
  const from =
    timeZone && days.length > 0 ? startOfDay(days[0], timeZone) : undefined;
  const to =
    timeZone && days.length > 0
      ? startOfDay(addDays(days[days.length - 1], 1), timeZone)
      : undefined;
  const events = useCalendarEvents(from, to);

  const step = (direction: 1 | -1) =>
    shown && setAnchor(shiftAnchor(view, shown, direction));
  const pickDay = (date: string) => {
    setView({ kind: "days", count: 1 });
    setAnchor(date);
  };
  useKeys({
    onView: setView,
    onToday: () => setAnchor(undefined),
    onStep: step,
  });

  if (timeZone === undefined || today === undefined || shown === undefined)
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Spinner />
      </div>
    );

  const noCalendars = overview?.accounts.length === 0;
  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <h1 className="text-base font-semibold">
            {rangeTitle(view, days, shown)}
          </h1>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnchor(undefined)}
            >
              Today
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => step(-1)}>
              <ChevronLeftIcon />
              <span className="sr-only">Back</span>
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => step(1)}>
              <ChevronRightIcon />
              <span className="sr-only">Forward</span>
            </Button>
            <div className="ml-1 flex rounded-md border p-0.5">
              {VIEWS.map((option) => {
                const active =
                  option.view.kind === view.kind &&
                  (option.view.kind !== "days" ||
                    view.kind !== "days" ||
                    view.count === 1);
                return (
                  <Button
                    key={option.label}
                    variant={active ? "secondary" : "ghost"}
                    size="xs"
                    aria-pressed={active}
                    onClick={() => setView(option.view)}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </header>
        {noCalendars && (
          <p className="border-b px-4 py-2 text-sm text-muted-foreground">
            No calendars yet.{" "}
            <Link
              href="/settings/connections"
              className="text-foreground underline underline-offset-2"
            >
              Connect one
            </Link>{" "}
            to see its events here.
          </p>
        )}
        {view.kind === "month" ? (
          <MonthGrid
            days={days}
            month={shown.slice(0, 7)}
            events={events ?? []}
            todos={datedTodos}
            onOpenTodo={setEditing}
            onDropTodo={dropTodo}
            calendars={calendarsById}
            timeZone={timeZone}
            today={today}
            onPickDay={pickDay}
          />
        ) : (
          <TimeGrid
            days={days}
            events={events ?? []}
            todos={datedTodos}
            onOpenTodo={setEditing}
            onDropTodo={dropTodo}
            calendars={calendarsById}
            timeZone={timeZone}
            today={today}
            onPickDay={pickDay}
          />
        )}
        <div className="sr-only" aria-live="polite">
          {events === undefined ? "Loading events" : `${events.length} events`}
        </div>
      </div>
      <TodoEditor
        todo={allTodos.find((todo) => todo.id === editing)}
        onClose={() => setEditing(undefined)}
      />
      {toast && <UndoToast toast={toast} onDone={() => setToast(undefined)} />}
      {asking && (
        // Beside the grid on a big screen; over everything on a phone.
        <aside
          aria-label="Ask Hei"
          className="fixed inset-0 z-40 bg-background md:static md:inset-auto md:z-auto md:w-96 md:shrink-0 md:border-l"
        >
          <AskHei onClose={() => setAsking(false)} />
        </aside>
      )}
    </div>
  );
}

type Toast = { message: string; undo?: () => Promise<unknown> };

/** What a drop did, with Undo, for a few seconds. */
function UndoToast({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 8_000);
    return () => clearTimeout(timer);
  }, [onDone]);
  return (
    <output className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-popover px-4 py-2 text-sm shadow-lg md:bottom-6">
      <span className="max-w-72 truncate">{toast.message}</span>
      {toast.undo && (
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            void toast.undo?.();
            onDone();
          }}
        >
          Undo
        </Button>
      )}
    </output>
  );
}

function clockOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** ⌘I (Ctrl+I elsewhere) opens and closes the chat beside the calendar. */
function useAskKey(onToggle: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
        event.preventDefault();
        onToggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onToggle]);
}

/** Today in `timeZone`, moving on at midnight. */
function useToday(timeZone: string | undefined): string | undefined {
  const [today, setToday] = useState<string>();
  useEffect(() => {
    if (timeZone === undefined) return;
    const tick = () => setToday(localDate(Date.now(), timeZone));
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [timeZone]);
  return today;
}

/** time.fyi's keys: 1–9 days side by side, w week, m month, t today, arrows back and forth. Ignored while typing. */
function useKeys(handlers: {
  onView: (view: View) => void;
  onToday: () => void;
  onStep: (direction: 1 | -1) => void;
}) {
  const { onView, onToday, onStep } = handlers;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]",
        )
      )
        return;
      if (/^[1-9]$/.test(event.key))
        onView({ kind: "days", count: Number(event.key) });
      else if (event.key === "w") onView({ kind: "week" });
      else if (event.key === "m") onView({ kind: "month" });
      else if (event.key === "t") onToday();
      else if (event.key === "ArrowLeft") onStep(-1);
      else if (event.key === "ArrowRight") onStep(1);
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onView, onToday, onStep]);
}
