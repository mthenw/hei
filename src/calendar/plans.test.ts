import { beforeEach, describe, expect, it, vi } from "vitest";
import { openAppDatabase } from "@/db/database";
import { SecretBox } from "@/lib/secret-box";
import { Calendars, InvalidCalendar } from "./calendars";
import { GOOGLE_SCOPES } from "./google";
import { CalendarPlans } from "./plans";
import { freeSlots, parseRange } from "./tools";

const ZONE = "Europe/Warsaw";
const NOW = Date.UTC(2026, 9, 13, 8, 0);

type GoogleEvent = {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
};

/** A Google that remembers events: enough of the Calendar API to sign in, sync, and take writes. */
function statefulGoogle() {
  const events = new Map<string, Map<string, GoogleEvent>>([
    ["me@example.com", new Map()],
    ["team", new Map()],
  ]);
  const deleted = new Map<string, string[]>();
  let nextId = 1;
  let failWrites = 0;
  const idToken = `x.${Buffer.from(JSON.stringify({ email: "me@example.com" })).toString("base64url")}.y`;

  const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const json = (body: unknown, status = 200) =>
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), { status });
    if (url.hostname === "oauth2.googleapis.com")
      return json({
        access_token: "access",
        expires_in: 3600,
        refresh_token: "refresh",
        id_token: idToken,
        scope: GOOGLE_SCOPES.join(" "),
      });
    if (url.pathname.endsWith("/calendarList"))
      return json({
        items: [
          {
            id: "me@example.com",
            summary: "Me",
            primary: true,
            accessRole: "owner",
          },
          { id: "team", summary: "Team", accessRole: "reader" },
        ],
      });
    const match = /\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(
      url.pathname,
    );
    if (!match) return json({}, 404);
    const calendar = events.get(decodeURIComponent(match[1])) ?? new Map();
    const eventId = match[2] && decodeURIComponent(match[2]);
    const method = init?.method ?? "GET";
    if (method !== "GET" && failWrites > 0) {
      failWrites--;
      return json({ error: { message: "Rate limit exceeded" } }, 403);
    }
    if (method === "GET") {
      const gone = deleted.get(match[1]) ?? [];
      deleted.set(match[1], []);
      return json({
        items: [
          ...calendar.values(),
          ...gone.map((id) => ({ id, status: "cancelled" })),
        ],
        nextSyncToken: `t${nextId}`,
      });
    }
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Partial<GoogleEvent>)
      : {};
    if (method === "POST") {
      const created = { ...(body as GoogleEvent), id: `e${nextId++}` };
      calendar.set(created.id, created);
      return json(created);
    }
    const existing = eventId ? calendar.get(eventId) : undefined;
    if (!existing || !eventId) return json({}, 404);
    if (method === "DELETE") {
      calendar.delete(eventId);
      deleted.set(match[1], [...(deleted.get(match[1]) ?? []), eventId]);
      return json(null, 204);
    }
    const updated = { ...existing, ...body };
    calendar.set(eventId, updated);
    return json(updated);
  });

  return {
    fetch,
    events,
    add(calendar: string, event: GoogleEvent) {
      events.get(calendar)?.set(event.id, event);
    },
    failNextWrites(count: number) {
      failWrites = count;
    },
  };
}

let google: ReturnType<typeof statefulGoogle>;
let calendars: Calendars;
let plans: CalendarPlans;

beforeEach(async () => {
  google = statefulGoogle();
  google.add("me@example.com", {
    id: "review",
    summary: "Design review",
    start: { dateTime: "2026-10-14T08:00:00.000Z" },
    end: { dateTime: "2026-10-14T09:00:00.000Z" },
  });
  google.add("me@example.com", {
    id: "gym",
    summary: "Gym",
    start: { dateTime: "2026-10-15T16:00:00.000Z" },
    end: { dateTime: "2026-10-15T17:00:00.000Z" },
  });
  google.add("team", {
    id: "offsite",
    summary: "Offsite",
    start: { date: "2026-10-16" },
    end: { date: "2026-10-17" },
  });
  const db = await openAppDatabase(":memory:");
  calendars = new Calendars(db, {
    box: new SecretBox("a test secret that is long enough", "calendars"),
    timeZone: () => ZONE,
    google: { clientId: "id", clientSecret: "secret" },
    fetch: google.fetch,
    now: () => NOW,
  });
  const consent = new URL(
    calendars.beginGoogleSignIn("http://localhost/callback"),
  );
  await calendars.finishGoogleSignIn(
    consent.searchParams.get("state") ?? "",
    "code",
  );
  plans = new CalendarPlans(db, calendars, {
    timeZone: () => ZONE,
    now: () => NOW,
  });
});

const WEEK = { from: Date.UTC(2026, 9, 12), to: Date.UTC(2026, 9, 19) };

async function stored() {
  return (await calendars.events(WEEK.from, WEEK.to)).map(
    (event) => `${event.title} ${event.start}`,
  );
}

async function eventId(title: string): Promise<number> {
  const event = (await calendars.events(WEEK.from, WEEK.to)).find(
    (e) => e.title === title,
  );
  if (!event) throw new Error(`No ${title}`);
  return event.id;
}

describe("CalendarPlans", () => {
  it("changes nothing until approved, applies every change, and undoes them", async () => {
    const plan = await plans.propose({
      summary: "Make room for focus time",
      changes: [
        {
          action: "create",
          title: "Focus",
          allDay: false,
          start: "2026-10-14T10:00:00.000Z",
          end: "2026-10-14T12:00:00.000Z",
        },
        {
          action: "move",
          eventId: await eventId("Design review"),
          start: "2026-10-16T08:00:00.000Z",
          end: "2026-10-16T09:00:00.000Z",
        },
        { action: "delete", eventId: await eventId("Gym") },
      ],
    });
    expect(plan).toMatchObject({
      status: "pending",
      changes: [
        { action: "create", title: "Focus", calendarName: "Me" },
        {
          action: "move",
          title: "Design review",
          from: { start: "2026-10-14T08:00:00.000Z" },
          to: { start: "2026-10-16T08:00:00.000Z" },
        },
        { action: "delete", title: "Gym" },
      ],
    });
    const before = await stored();
    expect(before).toContain("Gym 2026-10-15T16:00:00.000Z");

    const applied = await plans.approve(plan.id);

    expect(applied).toMatchObject({ status: "applied", error: null });
    expect(await stored()).toEqual(
      expect.arrayContaining([
        "Focus 2026-10-14T10:00:00.000Z",
        "Design review 2026-10-16T08:00:00.000Z",
      ]),
    );
    expect((await stored()).some((line) => line.startsWith("Gym"))).toBe(false);

    const undone = await plans.undo(plan.id);

    expect(undone.status).toBe("undone");
    expect((await stored()).sort()).toEqual([...before].sort());
  });

  it("declines with Not now, and won't decide twice", async () => {
    const plan = await plans.propose({
      summary: "Drop the gym",
      changes: [{ action: "delete", eventId: await eventId("Gym") }],
    });

    expect((await plans.dismiss(plan.id)).status).toBe("dismissed");
    await expect(plans.approve(plan.id)).rejects.toSatisfy(InvalidCalendar.is);
    expect(await stored()).toContain("Gym 2026-10-15T16:00:00.000Z");
  });

  it("refuses changes to read-only calendars and nonsense times", async () => {
    await expect(
      plans.propose({
        summary: "Skip the offsite",
        changes: [{ action: "delete", eventId: await eventId("Offsite") }],
      }),
    ).rejects.toThrow(/read only/);
    await expect(
      plans.propose({
        summary: "Backwards",
        changes: [
          {
            action: "create",
            title: "Oops",
            allDay: false,
            start: "2026-10-14T12:00:00.000Z",
            end: "2026-10-14T10:00:00.000Z",
          },
        ],
      }),
    ).rejects.toThrow(/end after it starts/);
  });

  it("stops at a failing change, keeps what went through, and can undo it", async () => {
    const plan = await plans.propose({
      summary: "Two holds",
      changes: [
        {
          action: "create",
          title: "Hold 1",
          allDay: false,
          start: "2026-10-14T10:00:00.000Z",
          end: "2026-10-14T11:00:00.000Z",
        },
        {
          action: "create",
          title: "Hold 2",
          allDay: false,
          start: "2026-10-14T11:00:00.000Z",
          end: "2026-10-14T12:00:00.000Z",
        },
      ],
    });
    // The first write goes through; the second is refused.
    let writes = 0;
    const original = google.fetch.getMockImplementation();
    google.fetch.mockImplementation(async (input, init) => {
      if (init?.method === "POST" && ++writes === 2) google.failNextWrites(1);
      return original?.(input, init) as Promise<Response>;
    });

    const failed = await plans.approve(plan.id);

    expect(failed).toMatchObject({
      status: "failed",
      error: expect.stringContaining("Rate limit"),
    });
    expect((await stored()).filter((line) => line.startsWith("Hold"))).toEqual([
      "Hold 1 2026-10-14T10:00:00.000Z",
    ]);

    expect((await plans.undo(plan.id)).status).toBe("undone");
    expect((await stored()).filter((line) => line.startsWith("Hold"))).toEqual(
      [],
    );
  });
});

describe("calendar tool helpers", () => {
  it("reads dates as whole days and times as local", () => {
    expect(parseRange("2026-10-14", "2026-10-14", ZONE)).toEqual({
      from: Date.UTC(2026, 9, 13, 22),
      to: Date.UTC(2026, 9, 14, 22),
    });
    expect(parseRange("2026-10-14T09:00", "2026-10-14T17:30", ZONE)).toEqual({
      from: Date.UTC(2026, 9, 14, 7),
      to: Date.UTC(2026, 9, 14, 15, 30),
    });
    expect(() => parseRange("2026-10-14", "2027-10-14", ZONE)).toThrow(
      /at most/,
    );
  });

  it("finds gaps between events within working hours, skipping weekends", () => {
    const slots = freeSlots({
      busy: [
        { start: "2026-10-16T08:00:00.000Z", end: "2026-10-16T09:00:00.000Z" }, // Fri 10:00–11:00
        { start: "2026-10-16T12:00:00.000Z", end: "2026-10-16T15:30:00.000Z" }, // Fri 14:00–17:30
      ],
      range: parseRange("2026-10-16", "2026-10-18", ZONE),
      durationMinutes: 60,
      dayStart: 9 * 60,
      dayEnd: 18 * 60,
      weekends: false,
      timeZone: ZONE,
    });

    // Friday 09:00–10:00 and 11:00–14:00; 17:30–18:00 is too short; the weekend is skipped.
    expect(
      slots.map((slot) => [
        new Date(slot.start).toISOString(),
        new Date(slot.end).toISOString(),
      ]),
    ).toEqual([
      ["2026-10-16T07:00:00.000Z", "2026-10-16T08:00:00.000Z"],
      ["2026-10-16T09:00:00.000Z", "2026-10-16T12:00:00.000Z"],
    ]);
  });
});
