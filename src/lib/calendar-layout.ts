import { addDays } from "./todo-dates";
import { startOfDay, zonedParts } from "./zoned-time";

/** What the calendar shows: some days side by side (1–9; 7 from Monday is the week), or a month. */
export type CalendarView =
  | { kind: "days"; count: number }
  | { kind: "week" }
  | { kind: "month" };

/** What layout needs from an event. */
export type Timed = {
  id: number;
  allDay: boolean;
  /** An instant (ISO), or a date for an all-day event; the end is exclusive. */
  start: string;
  end: string;
};

export const MINUTES_PER_DAY = 1440;
/** Shortest an event is drawn, so a 5-minute one stays readable. */
const MIN_MINUTES = 20;

/** The Monday of `date`'s week. */
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/** The days a view shows around `anchor`, in order. A month shows the six weeks that hold it, from Monday. */
export function visibleDays(view: CalendarView, anchor: string): string[] {
  const span = (from: string, count: number) =>
    Array.from({ length: count }, (_, index) => addDays(from, index));
  switch (view.kind) {
    case "days":
      return span(anchor, view.count);
    case "week":
      return span(weekStart(anchor), 7);
    case "month":
      return span(weekStart(`${anchor.slice(0, 8)}01`), 42);
  }
}

/** The anchor one step back (-1) or forward (1): a view's worth of days, a week, or a month. */
export function shiftAnchor(
  view: CalendarView,
  anchor: string,
  direction: 1 | -1,
): string {
  switch (view.kind) {
    case "days":
      return addDays(anchor, direction * view.count);
    case "week":
      return addDays(anchor, direction * 7);
    case "month": {
      const [year, month] = anchor.split("-").map(Number);
      const moved = new Date(Date.UTC(year, month - 1 + direction, 1));
      return moved.toISOString().slice(0, 10);
    }
  }
}

/** "October 2026", or "Sep – Oct 2026" / "Dec 2026 – Jan 2027" when the days span two months. */
export function rangeTitle(
  view: CalendarView,
  days: string[],
  anchor: string,
): string {
  const month = (date: string, style: "long" | "short", withYear: boolean) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      month: style,
      ...(withYear ? { year: "numeric" } : {}),
    }).format(new Date(`${date}T00:00:00Z`));
  if (view.kind === "month") return month(anchor, "long", true);
  const first = days[0];
  const last = days[days.length - 1];
  if (first.slice(0, 7) === last.slice(0, 7)) return month(first, "long", true);
  if (first.slice(0, 4) === last.slice(0, 4))
    return `${month(first, "short", false)} – ${month(last, "short", true)}`;
  return `${month(first, "short", true)} – ${month(last, "short", true)}`;
}

/** Whether an event belongs in `date`'s all-day row: an all-day event covering it. */
export function isAllDayOn(event: Timed, date: string): boolean {
  return event.allDay && event.start <= date && date < event.end;
}

/** A timed event placed in a day column, in minutes from the day's midnight. */
export type Placed<T extends Timed> = {
  event: T;
  top: number;
  bottom: number;
  /** Side-by-side position among overlapping events. */
  column: number;
  columns: number;
};

/**
 * Timed events overlapping `date` in `timeZone`, clipped to the day and laid out so overlapping events sit side by
 * side, each as wide as its busiest overlap allows.
 */
export function layoutDay<T extends Timed>(
  events: readonly T[],
  date: string,
  timeZone: string,
): Placed<T>[] {
  const dayStart = startOfDay(date, timeZone);
  const dayEnd = startOfDay(addDays(date, 1), timeZone);
  const placed: Placed<T>[] = events
    .filter((event) => !event.allDay)
    .flatMap((event) => {
      const start = Date.parse(event.start);
      const end = Math.max(Date.parse(event.end), start);
      if (start >= dayEnd || (end <= dayStart && start < dayStart)) return [];
      const top = Math.max(0, (start - dayStart) / 60_000);
      const bottom = Math.min(MINUTES_PER_DAY, (end - dayStart) / 60_000);
      return [
        {
          event,
          top,
          bottom: Math.min(
            MINUTES_PER_DAY,
            Math.max(bottom, top + MIN_MINUTES),
          ),
          column: 0,
          columns: 1,
        },
      ];
    })
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

  // Greedy columns within each cluster of events that overlap one another.
  let cluster: Placed<T>[] = [];
  let columnEnds: number[] = [];
  const close = () => {
    for (const item of cluster) item.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };
  for (const item of placed) {
    if (cluster.length > 0 && columnEnds.every((end) => end <= item.top))
      close();
    let column = columnEnds.findIndex((end) => end <= item.top);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(item.bottom);
    } else columnEnds[column] = item.bottom;
    item.column = column;
    cluster.push(item);
  }
  close();
  return placed;
}

/** The events to list in a month cell: all-day ones first, then timed ones starting that day, by time. */
export function eventsOnDay<T extends Timed>(
  events: readonly T[],
  date: string,
  timeZone: string,
): T[] {
  const allDay = events.filter((event) => isAllDayOn(event, date));
  const timed = events
    .filter(
      (event) =>
        !event.allDay &&
        zonedParts(Date.parse(event.start), timeZone).date === date,
    )
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  return [...allDay, ...timed];
}

/** "09:30", local to `timeZone`. */
export function clockTime(iso: string, timeZone: string): string {
  const { minutes } = zonedParts(Date.parse(iso), timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
