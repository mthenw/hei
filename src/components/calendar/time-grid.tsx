"use client";

import { type DragEvent, useEffect, useRef, useState } from "react";
import type { CalendarEvent, CalendarSummary } from "@/calendar/calendars";
import { isAllDayOn, layoutDay, MINUTES_PER_DAY } from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";
import { zonedParts } from "@/lib/zoned-time";
import type { Todo } from "@/todos/todos";
import { EventChip } from "./event-chip";
import { carriesTodo, droppedTodo, TodoChip, type TodoDrop } from "./todo-chip";

/** Pixels per hour. */
const HOUR = 48;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
/** A dropped todo's block, and the grid it snaps to. */
export const BLOCK_MINUTES = 30;
const SNAP = 15;

/**
 * Days side by side: a header, an all-day row (events and the day's todos), then a scrolling time grid with the
 * events, timed todos and a line at now. Todos dropped on the grid get a time block; on the all-day row, a date.
 */
export function TimeGrid({
  days,
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
  events: CalendarEvent[];
  /** Open todos with a date. */
  todos: Todo[];
  calendars: Map<number, CalendarSummary>;
  timeZone: string;
  today: string;
  /** Clicking a day's heading opens that day. */
  onPickDay: (date: string) => void;
  onOpenTodo: (id: number) => void;
  onDropTodo: TodoDrop;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const columns = {
    gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))`,
  };
  const now = useNowMinutes(timeZone);

  // Open at the working day, or an hour before now if that's later; once, so it never fights the user's scrolling.
  const scrolled = useRef(false);
  useEffect(() => {
    const element = scroller.current;
    if (element === null || now === undefined || scrolled.current) return;
    scrolled.current = true;
    element.scrollTop = Math.max(7.5 * HOUR, (now / 60 - 1) * HOUR);
  }, [now]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid border-b" style={columns}>
        <div />
        {days.map((date) => (
          <DayHeading key={date} date={date} today={today} onPick={onPickDay} />
        ))}
      </div>
      <div className="grid max-h-32 overflow-y-auto border-b" style={columns}>
        <div className="px-1 py-1.5 text-right text-[10px] text-muted-foreground">
          all day
        </div>
        {days.map((date) => (
          <AllDayCell
            key={date}
            date={date}
            events={events.filter((event) => isAllDayOn(event, date))}
            todos={todos.filter(
              (todo) => todo.dueDate === date && !todo.dueTime,
            )}
            calendars={calendars}
            timeZone={timeZone}
            onOpenTodo={onOpenTodo}
            onDropTodo={onDropTodo}
          />
        ))}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div
          className="relative grid"
          style={{ ...columns, height: 24 * HOUR }}
        >
          <div className="relative">
            {HOURS.slice(1).map((hour) => (
              <span
                key={hour}
                style={{ top: hour * HOUR }}
                className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground tabular-nums"
              >
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {days.map((date) => (
            <DayColumn
              key={date}
              date={date}
              events={events}
              todos={todos.filter(
                (todo) => todo.dueDate === date && todo.dueTime,
              )}
              calendars={calendars}
              timeZone={timeZone}
              nowMinutes={date === today ? now : undefined}
              onOpenTodo={onOpenTodo}
              onDropTodo={onDropTodo}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayHeading({
  date,
  today,
  onPick,
}: {
  date: string;
  today: string;
  onPick: (date: string) => void;
}) {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
  }).format(day);
  return (
    <button
      type="button"
      onClick={() => onPick(date)}
      className="flex items-center justify-center gap-1.5 border-l py-2 text-xs text-muted-foreground hover:text-foreground"
    >
      {weekday}
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full text-sm tabular-nums",
          date === today
            ? "bg-primary font-semibold text-primary-foreground"
            : "text-foreground",
        )}
      >
        {day.getUTCDate()}
      </span>
    </button>
  );
}

function AllDayCell({
  date,
  events,
  todos,
  calendars,
  timeZone,
  onOpenTodo,
  onDropTodo,
}: {
  date: string;
  events: CalendarEvent[];
  todos: Todo[];
  calendars: Map<number, CalendarSummary>;
  timeZone: string;
  onOpenTodo: (id: number) => void;
  onDropTodo: TodoDrop;
}) {
  const [over, setOver] = useState(false);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target for dragged todos; the todo editor sets dates from the keyboard.
    <div
      onDragOver={(event) => {
        if (!carriesTodo(event)) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        const id = droppedTodo(event);
        if (id === undefined) return;
        event.preventDefault();
        onDropTodo(id, date);
      }}
      className={cn(
        "flex min-h-8 min-w-0 flex-col gap-0.5 border-l p-0.5",
        over && "bg-primary/10",
      )}
    >
      {events.map((event) => (
        <EventChip
          key={event.id}
          event={event}
          calendar={calendars.get(event.calendarId)}
          timeZone={timeZone}
          compact
        />
      ))}
      {todos.map((todo) => (
        <TodoChip key={todo.id} todo={todo} onOpen={onOpenTodo} />
      ))}
    </div>
  );
}

function DayColumn({
  date,
  events,
  todos,
  calendars,
  timeZone,
  nowMinutes,
  onOpenTodo,
  onDropTodo,
}: {
  date: string;
  events: CalendarEvent[];
  /** The day's todos with a time. */
  todos: Todo[];
  calendars: Map<number, CalendarSummary>;
  timeZone: string;
  nowMinutes: number | undefined;
  onOpenTodo: (id: number) => void;
  onDropTodo: TodoDrop;
}) {
  const placed = layoutDay(events, date, timeZone);
  // Where a dragged todo would land, in minutes; shown as the block it would make.
  const [landing, setLanding] = useState<number>();

  const minutesAt = (event: DragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = ((event.clientY - rect.top) / HOUR) * 60;
    return Math.min(
      Math.max(Math.round(minutes / SNAP) * SNAP, 0),
      MINUTES_PER_DAY - BLOCK_MINUTES,
    );
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a drop target for dragged todos; Hei can block time from the keyboard.
    <div
      onDragOver={(event) => {
        if (!carriesTodo(event)) return;
        event.preventDefault();
        setLanding(minutesAt(event));
      }}
      onDragLeave={() => setLanding(undefined)}
      onDrop={(event) => {
        setLanding(undefined);
        const id = droppedTodo(event);
        if (id === undefined) return;
        event.preventDefault();
        onDropTodo(id, date, minutesAt(event));
      }}
      className="relative border-l"
    >
      {HOURS.map((hour) => (
        <div
          key={hour}
          style={{ top: hour * HOUR }}
          className="absolute inset-x-0 border-t border-border/60"
        />
      ))}
      {placed.map(({ event, top, bottom, column, columns }) => (
        <EventChip
          key={event.id}
          event={event}
          calendar={calendars.get(event.calendarId)}
          timeZone={timeZone}
          compact={bottom - top < 40}
          className="absolute"
          style={{
            top: (top / 60) * HOUR + 1,
            height: ((bottom - top) / 60) * HOUR - 2,
            left: `calc(${(column / columns) * 100}% + 2px)`,
            width: `calc(${100 / columns}% - 4px)`,
          }}
        />
      ))}
      {todos.map((todo) => {
        const [hours, minutes] = (todo.dueTime ?? "00:00")
          .split(":")
          .map(Number);
        return (
          <TodoChip
            key={todo.id}
            todo={todo}
            onOpen={onOpenTodo}
            // Its place in the grid gives the time; the narrow chip spends its width on the title.
            className="absolute right-1 z-10 w-[60%]"
            style={{ top: hours * HOUR + (minutes / 60) * HOUR }}
          />
        );
      })}
      {landing !== undefined && (
        <div
          aria-hidden
          style={{
            top: (landing / 60) * HOUR,
            height: (BLOCK_MINUTES / 60) * HOUR,
          }}
          className="pointer-events-none absolute inset-x-1 rounded-[5px] border border-primary bg-primary/20"
        />
      )}
      {nowMinutes !== undefined && (
        <div
          aria-hidden
          style={{ top: (nowMinutes / 60) * HOUR }}
          className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-(--cal-now)"
        >
          <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-(--cal-now)" />
        </div>
      )}
    </div>
  );
}

/** Minutes since midnight now, in `timeZone`; moves every minute. Undefined before the page is in a browser. */
function useNowMinutes(timeZone: string): number | undefined {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const tick = () =>
      setNow(
        Math.min(zonedParts(Date.now(), timeZone).minutes, MINUTES_PER_DAY - 1),
      );
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [timeZone]);
  return now;
}
