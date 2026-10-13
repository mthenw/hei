import { clockTime } from "./calendar-layout";
import { addDays, formatDay } from "./todo-dates";
import { zonedParts } from "./zoned-time";

/** "Wed 14 Oct, 14:30–15:15", "Wed 14 Oct, all day", or a span of days. */
export function formatWhen(
  event: { allDay: boolean; start: string; end: string },
  timeZone: string,
): string {
  if (event.allDay) {
    const last = addDays(event.end, -1);
    return last === event.start
      ? `${formatDay(event.start, event.start)}, all day`
      : `${formatDay(event.start, event.start)} – ${formatDay(last, event.start)}`;
  }
  const start = zonedParts(Date.parse(event.start), timeZone);
  const end = zonedParts(Date.parse(event.end), timeZone);
  const range = `${clockTime(event.start, timeZone)}–${clockTime(event.end, timeZone)}`;
  return start.date === end.date
    ? `${formatDay(start.date, start.date)}, ${range}`
    : `${formatDay(start.date, start.date)} ${clockTime(event.start, timeZone)} – ${formatDay(end.date, start.date)} ${clockTime(event.end, timeZone)}`;
}
