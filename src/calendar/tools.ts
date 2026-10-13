import { Type } from "@earendil-works/pi-ai";
import {
  defineExtension,
  defineTool,
  type Extension,
  section,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { addDays, formatDay } from "@/lib/todo-dates";
import { startOfDay, zonedInstant, zonedParts } from "@/lib/zoned-time";
import {
  type CalendarEvent,
  type CalendarSummary,
  type Calendars,
  InvalidCalendar,
} from "./calendars";
import type { CalendarPlans, ProposedChange } from "./plans";

/** What a calendar tool's result carries for the chat. */
export type CalendarToolDetails =
  | { kind: "calendar"; action: "listed"; count: number }
  | { kind: "calendar"; action: "free"; count: number }
  | { kind: "plan"; planId: number };

/** How Hei should read and plan with the calendar. */
export const CALENDAR_INSTRUCTIONS = [
  "You can see the user's calendars with list_events and find_free_time. Times are in the user's time zone (today's date is above), written YYYY-MM-DDTHH:MM; all-day events use dates (YYYY-MM-DD).",
  "To add, move or delete events, call propose_calendar_changes once with every change and a one-line summary. The user sees it as a card and approves or declines; nothing changes before that, so don't say it's done: say what you propose.",
  "Check for conflicts with list_events or find_free_time before proposing times. Only calendars that aren't marked read only can change. Refer to events by title and time, not by id.",
].join("\n");

const MAX_SPAN_DAYS = 62;
const MAX_LISTED = 150;
const MAX_SLOTS = 12;

/** The calendar as an extension: the tools and the instructions for using them. Every chat gets it. */
export function calendarExtension(
  calendars: Calendars,
  plans: CalendarPlans,
  timeZone: () => string,
): Extension {
  return defineExtension({
    name: "calendar",
    tools: calendarTools(calendars, plans, timeZone),
    sections: [section("calendar", () => CALENDAR_INSTRUCTIONS)],
  });
}

export function calendarTools(
  calendars: Calendars,
  plans: CalendarPlans,
  timeZone: () => string,
): ToolRegistration[] {
  const listEvents = defineTool({
    name: "list_events",
    description:
      "List the user's calendar events between two times, optionally only those matching a text. Each has an id, its time, title, calendar and location.",
    parameters: Type.Object({
      from: Type.String({ description: "YYYY-MM-DD or YYYY-MM-DDTHH:MM" }),
      to: Type.String({
        description: "YYYY-MM-DD (that whole day included) or YYYY-MM-DDTHH:MM",
      }),
      query: Type.Optional(
        Type.String({
          description: "Only events whose title, place or notes contain this.",
        }),
      ),
    }),
    replay: "safe",
    execute: async (args) => {
      const zone = timeZone();
      const range = parseRange(args.from, args.to, zone);
      const [events, names] = await Promise.all([
        calendars.events(range.from, range.to),
        calendarNames(calendars),
      ]);
      const needle = args.query?.toLowerCase().trim();
      const matching = events
        .filter((event) => overlaps(event, range, zone))
        .filter(
          (event) =>
            !needle ||
            [event.title, event.location, event.notes].some((field) =>
              field?.toLowerCase().includes(needle),
            ),
        );
      const lines = matching
        .slice(0, MAX_LISTED)
        .map((event) => eventLine(event, names.get(event.calendarId), zone));
      const details: CalendarToolDetails = {
        kind: "calendar",
        action: "listed",
        count: matching.length,
      };
      return {
        content: [
          {
            type: "text",
            text:
              lines.length === 0
                ? "No events in that time."
                : [
                    ...lines,
                    ...(matching.length > MAX_LISTED
                      ? [
                          `…and ${matching.length - MAX_LISTED} more; ask for a shorter span.`,
                        ]
                      : []),
                  ].join("\n"),
          },
        ],
        details,
      };
    },
  });

  const findFreeTime = defineTool({
    name: "find_free_time",
    description:
      "Find free slots of at least a given length between two times, within working hours on weekdays unless told otherwise.",
    parameters: Type.Object({
      from: Type.String({ description: "YYYY-MM-DD or YYYY-MM-DDTHH:MM" }),
      to: Type.String({
        description: "YYYY-MM-DD (whole day included) or YYYY-MM-DDTHH:MM",
      }),
      duration_minutes: Type.Integer({ minimum: 5, maximum: 1440 }),
      day_start: Type.Optional(
        Type.String({ description: "HH:MM; default 09:00" }),
      ),
      day_end: Type.Optional(
        Type.String({ description: "HH:MM; default 18:00" }),
      ),
      weekends: Type.Optional(
        Type.Boolean({ description: "Include Saturdays and Sundays." }),
      ),
    }),
    replay: "safe",
    execute: async (args) => {
      const zone = timeZone();
      const range = parseRange(args.from, args.to, zone);
      const events = await calendars.events(range.from, range.to);
      const slots = freeSlots({
        busy: events.filter((event) => !event.allDay),
        range: { from: Math.max(range.from, Date.now()), to: range.to },
        durationMinutes: args.duration_minutes,
        dayStart: minutesOf(args.day_start ?? "09:00"),
        dayEnd: minutesOf(args.day_end ?? "18:00"),
        weekends: args.weekends ?? false,
        timeZone: zone,
      });
      const details: CalendarToolDetails = {
        kind: "calendar",
        action: "free",
        count: slots.length,
      };
      return {
        content: [
          {
            type: "text",
            text:
              slots.length === 0
                ? "No free slot that long in that time."
                : slots
                    .slice(0, MAX_SLOTS)
                    .map((slot) => slotLine(slot, zone))
                    .join("\n"),
          },
        ],
        details,
      };
    },
  });

  const change = Type.Union([
    Type.Object({
      action: Type.Literal("create"),
      title: Type.String(),
      start: Type.String({
        description: "YYYY-MM-DDTHH:MM, or YYYY-MM-DD with all_day",
      }),
      end: Type.String({
        description:
          "YYYY-MM-DDTHH:MM, or for all_day the date after the last day",
      }),
      all_day: Type.Optional(Type.Boolean()),
      calendar_id: Type.Optional(
        Type.Integer({
          description: "Leave out for the user's default calendar.",
        }),
      ),
      location: Type.Optional(Type.String()),
      notes: Type.Optional(Type.String()),
    }),
    Type.Object({
      action: Type.Literal("move"),
      event_id: Type.Integer(),
      start: Type.String(),
      end: Type.String(),
    }),
    Type.Object({
      action: Type.Literal("delete"),
      event_id: Type.Integer(),
    }),
  ]);

  const proposeChanges = defineTool({
    name: "propose_calendar_changes",
    description:
      "Propose calendar changes for the user to approve: events to create, move or delete. Nothing changes until they approve the card.",
    parameters: Type.Object({
      summary: Type.String({
        description:
          "One line, e.g. “Move the design review to Friday and hold travel time”.",
      }),
      changes: Type.Array(change, { minItems: 1 }),
    }),
    // Not safe to repeat after a crash: it would propose the plan twice.
    execute: async (args, api) => {
      const zone = timeZone();
      const proposed: ProposedChange[] = [];
      for (const item of args.changes) {
        if (item.action === "delete") {
          proposed.push({ action: "delete", eventId: item.event_id });
        } else if (item.action === "move") {
          const { event } = await calendars.event(item.event_id);
          proposed.push({
            action: "move",
            eventId: item.event_id,
            ...times(item.start, item.end, event.allDay, zone),
          });
        } else {
          const allDay = item.all_day ?? false;
          proposed.push({
            action: "create",
            title: item.title,
            allDay,
            ...times(item.start, item.end, allDay, zone),
            calendarId: item.calendar_id,
            location: item.location,
            notes: item.notes,
          });
        }
      }
      const plan = await plans.propose({
        summary: args.summary,
        changes: proposed,
        chatId: api.conversationId,
      });
      const details: CalendarToolDetails = { kind: "plan", planId: plan.id };
      return {
        content: [
          {
            type: "text",
            text: `Shown to the user as a card with Approve and Not now. Nothing has changed yet; tell them briefly what you propose.`,
          },
        ],
        details,
      };
    },
  });

  return [listEvents, findFreeTime, proposeChanges];
}

/** A range from the model: dates cover whole days (the end day included); times are local. */
export function parseRange(
  from: string,
  to: string,
  timeZone: string,
): { from: number; to: number } {
  const start = isDate(from)
    ? startOfDay(from, timeZone)
    : instant(from, timeZone);
  const end = isDate(to)
    ? startOfDay(addDays(to, 1), timeZone)
    : instant(to, timeZone);
  if (end <= start)
    throw new InvalidCalendar("The end must come after the start.");
  if (end - start > MAX_SPAN_DAYS * 86_400_000)
    throw new InvalidCalendar(`Ask for at most ${MAX_SPAN_DAYS} days at once.`);
  return { from: start, to: end };
}

/** A new event's or a move's times: instants for timed events, dates for all-day ones (a one-day event may end on its start date). */
function times(
  start: string,
  end: string,
  allDay: boolean,
  timeZone: string,
): { start: string; end: string } {
  if (allDay) {
    const first = start.slice(0, 10);
    const last = end.slice(0, 10);
    if (!isDate(first) || !isDate(last))
      throw new InvalidCalendar(
        "An all-day event's start and end are dates (YYYY-MM-DD).",
      );
    return { start: first, end: last <= first ? addDays(first, 1) : last };
  }
  return {
    start: new Date(instant(start, timeZone)).toISOString(),
    end: new Date(instant(end, timeZone)).toISOString(),
  };
}

function instant(value: string, timeZone: string): number {
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(
    value.trim(),
  );
  if (local)
    return zonedInstant(
      local[1],
      Number(local[2]) * 60 + Number(local[3]),
      timeZone,
    );
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed))
    throw new InvalidCalendar(
      `“${value}” isn't a time: write YYYY-MM-DDTHH:MM.`,
    );
  return parsed;
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function minutesOf(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match)
    throw new InvalidCalendar(`“${time}” isn't a time of day: write HH:MM.`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function overlaps(
  event: CalendarEvent,
  range: { from: number; to: number },
  timeZone: string,
): boolean {
  if (event.allDay) {
    const first = zonedParts(range.from, timeZone).date;
    const last = zonedParts(range.to - 1, timeZone).date;
    return event.start <= last && event.end > first;
  }
  return (
    Date.parse(event.start) < range.to && Date.parse(event.end) > range.from
  );
}

async function calendarNames(
  calendars: Calendars,
): Promise<Map<number, CalendarSummary>> {
  const { accounts } = await calendars.overview();
  return new Map(
    accounts.flatMap((account) =>
      account.calendars.map((calendar) => [calendar.id, calendar] as const),
    ),
  );
}

function clock(ms: number, timeZone: string): string {
  const { minutes } = zonedParts(ms, timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** "#12 · Wed 14 Oct 14:30–15:15 · Dentist · Work · at Główna 1" */
function eventLine(
  event: CalendarEvent,
  calendar: CalendarSummary | undefined,
  timeZone: string,
): string {
  let when: string;
  if (event.allDay) {
    const last = addDays(event.end, -1);
    when =
      last === event.start
        ? `${formatDay(event.start, event.start)}, all day`
        : `${formatDay(event.start, event.start)} – ${formatDay(last, event.start)}, all day`;
  } else {
    const start = Date.parse(event.start);
    const end = Date.parse(event.end);
    const day = zonedParts(start, timeZone).date;
    const endDay = zonedParts(end, timeZone).date;
    when =
      day === endDay
        ? `${formatDay(day, day)} ${clock(start, timeZone)}–${clock(end, timeZone)}`
        : `${formatDay(day, day)} ${clock(start, timeZone)} – ${formatDay(endDay, day)} ${clock(end, timeZone)}`;
  }
  const parts = [
    `#${event.id}`,
    when,
    event.title,
    calendar
      ? `${calendar.name}${calendar.writable ? "" : " (read only)"}`
      : undefined,
    event.location ? `at ${event.location}` : undefined,
  ].filter(Boolean);
  return parts.join(" · ");
}

type Slot = { start: number; end: number };

/** Gaps of at least `durationMinutes` between busy events, within each day's hours. */
export function freeSlots(input: {
  busy: Pick<CalendarEvent, "start" | "end">[];
  range: { from: number; to: number };
  durationMinutes: number;
  dayStart: number;
  dayEnd: number;
  weekends: boolean;
  timeZone: string;
}): Slot[] {
  const busy = input.busy
    .map((event) => ({
      start: Date.parse(event.start),
      end: Date.parse(event.end),
    }))
    .sort((a, b) => a.start - b.start);
  const slots: Slot[] = [];
  let date = zonedParts(input.range.from, input.timeZone).date;
  const lastDate = zonedParts(input.range.to - 1, input.timeZone).date;
  for (; date <= lastDate; date = addDays(date, 1)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (!input.weekends && (weekday === 0 || weekday === 6)) continue;
    let cursor = Math.max(
      zonedInstant(date, input.dayStart, input.timeZone),
      input.range.from,
    );
    const close = Math.min(
      zonedInstant(date, input.dayEnd, input.timeZone),
      input.range.to,
    );
    for (const event of busy) {
      if (event.end <= cursor || event.start >= close) continue;
      if (event.start - cursor >= input.durationMinutes * 60_000)
        slots.push({ start: cursor, end: event.start });
      cursor = Math.max(cursor, event.end);
    }
    if (close - cursor >= input.durationMinutes * 60_000)
      slots.push({ start: cursor, end: close });
  }
  return slots;
}

function slotLine(slot: Slot, timeZone: string): string {
  const day = zonedParts(slot.start, timeZone).date;
  const minutes = Math.round((slot.end - slot.start) / 60_000);
  const length =
    minutes >= 60
      ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`
      : `${minutes} min`;
  return `${formatDay(day, day)} ${clock(slot.start, timeZone)}–${clock(slot.end, timeZone)} (${length} free)`;
}
