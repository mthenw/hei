import ICAL from "ical.js";
import { addDays } from "@/lib/todo-dates";
import { zonedInstant } from "@/lib/zoned-time";
import {
  type CalendarSource,
  type SourceCalendar,
  SourceError,
  type SourceEvent,
  SYNC_FUTURE_DAYS,
  SYNC_PAST_DAYS,
  type SyncResult,
} from "./source";

/** Most occurrences one repeating event may add, so a daily event without an end can't flood the store. */
const MAX_OCCURRENCES = 1_000;
const DAY = 86_400_000;

/** A calendar published as an ICS address: read whole on every sync, never written. */
export class IcsSource implements CalendarSource {
  constructor(
    private readonly options: {
      url: string;
      name: string;
      /** Used for times written without a zone. */
      timeZone: () => string;
      fetch?: typeof fetch;
      now?: () => number;
    },
  ) {}

  async calendars(): Promise<SourceCalendar[]> {
    return [
      {
        externalId: "ics",
        name: this.options.name,
        writable: false,
        primary: true,
      },
    ];
  }

  async sync(): Promise<SyncResult> {
    const text = await this.download();
    const now = (this.options.now ?? Date.now)();
    return {
      full: true,
      events: readIcs(
        text,
        { from: now - SYNC_PAST_DAYS * DAY, to: now + SYNC_FUTURE_DAYS * DAY },
        this.options.timeZone(),
      ),
      syncToken: null,
    };
  }

  private async download(): Promise<string> {
    const url = this.options.url.replace(/^webcal:/i, "https:");
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(url, {
        headers: { Accept: "text/calendar" },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new SourceError(
        `Couldn't reach the calendar address: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok)
      throw new SourceError(
        `The calendar address answered ${response.status}. Check that the link is still valid.`,
      );
    const text = await response.text();
    if (!text.includes("BEGIN:VCALENDAR"))
      throw new SourceError("The address doesn't return a calendar (ICS).");
    return text;
  }
}

/**
 * The event occurrences in an ICS file that overlap `window`. Repeating events are expanded into occurrences, with
 * their changed and cancelled ones applied; times without a zone are read in `timeZone`.
 */
export function readIcs(
  text: string,
  window: { from: number; to: number },
  timeZone: string,
): SourceEvent[] {
  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch (error) {
    throw new SourceError(
      `The calendar file can't be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  for (const zone of root.getAllSubcomponents("vtimezone"))
    ICAL.TimezoneService.register(zone);

  // A changed occurrence (with a RECURRENCE-ID) belongs to its series.
  const series = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Event[] = [];
  for (const component of root.getAllSubcomponents("vevent")) {
    const event = new ICAL.Event(component);
    if (event.isRecurrenceException()) exceptions.push(event);
    else series.set(event.uid, event);
  }
  for (const exception of exceptions)
    series.get(exception.uid)?.relateException(exception);

  const events: SourceEvent[] = [];
  const add = (
    item: ICAL.Event,
    start: ICAL.Time,
    end: ICAL.Time | null,
    externalId: string,
  ) => {
    if (item.component.getFirstPropertyValue("status") === "CANCELLED") return;
    const event = toEvent(item, start, end, externalId, timeZone);
    const startMs = instant(start, timeZone);
    const endMs = end ? instant(end, timeZone) : startMs;
    if (startMs < window.to && Math.max(endMs, startMs + 1) > window.from)
      events.push(event);
  };

  for (const event of series.values()) {
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate, event.uid);
      continue;
    }
    const occurrences = event.iterator();
    for (let count = 0; count < MAX_OCCURRENCES; count++) {
      const next = occurrences.next();
      if (!next || instant(next, timeZone) >= window.to) break;
      const details = event.getOccurrenceDetails(next);
      add(
        details.item,
        details.startDate,
        details.endDate,
        `${event.uid}/${next.toString()}`,
      );
    }
  }
  return events;
}

function toEvent(
  item: ICAL.Event,
  start: ICAL.Time,
  end: ICAL.Time | null,
  externalId: string,
  timeZone: string,
): SourceEvent {
  const allDay = start.isDate;
  const startText = allDay
    ? start.toString()
    : new Date(instant(start, timeZone)).toISOString();
  const endText = allDay
    ? end?.isDate
      ? end.toString()
      : addDays(start.toString(), 1)
    : new Date(
        end ? instant(end, timeZone) : instant(start, timeZone),
      ).toISOString();
  const url = item.component.getFirstPropertyValue("url");
  return {
    externalId,
    title: item.summary?.trim() || "Untitled event",
    location: item.location?.trim() || null,
    notes: item.description?.trim().slice(0, 2_000) || null,
    allDay,
    start: startText,
    end: endText,
    url: typeof url === "string" ? url : null,
    todoId: null,
  };
}

/** An ICS time as an instant: dates at midnight UTC, floating times in `timeZone`. */
function instant(time: ICAL.Time, timeZone: string): number {
  if (time.isDate) return Date.UTC(time.year, time.month - 1, time.day);
  const floating = time.zone === undefined || time.zone.tzid === "floating";
  if (floating)
    return zonedInstant(
      `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`,
      time.hour * 60 + time.minute,
      timeZone,
    );
  return time.toUnixTime() * 1000;
}
