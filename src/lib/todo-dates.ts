/** Local calendar dates as "YYYY-MM-DD" strings: they compare and sort as text. */

/** The date it is at `epochMs` in `timeZone`. */
export function localDate(epochMs: number, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(epochMs);
}

/** `date` moved by `days`, across months and years. */
export function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** Whether `value` is a real date written as YYYY-MM-DD. */
export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return addDays(value, 0) === value;
}

/** Whether `value` is a 24-hour time written as HH:MM. */
export function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * A due date as people say it, relative to `today`: "Today", "Tomorrow", "Yesterday", or "Thu 16 Oct" (with the year
 * when it isn't this year). The time follows when there is one: "Tomorrow 14:30".
 */
export function formatDue(
  dueDate: string,
  dueTime: string | null,
  today: string,
): string {
  const day =
    dueDate === today
      ? "Today"
      : dueDate === addDays(today, 1)
        ? "Tomorrow"
        : dueDate === addDays(today, -1)
          ? "Yesterday"
          : formatDay(dueDate, today);
  return dueTime ? `${day} ${dueTime}` : day;
}

/** "Thu 16 Oct", or "Thu 16 Oct 2027" outside `today`'s year. */
export function formatDay(date: string, today: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  })
    .format(parsed)
    .replace(",", "");
}
