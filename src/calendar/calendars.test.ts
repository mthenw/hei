import { beforeEach, describe, expect, it, vi } from "vitest";
import { openAppDatabase } from "@/db/database";
import { SecretBox } from "@/lib/secret-box";
import { CalendarNotFound, Calendars, InvalidCalendar } from "./calendars";
import {
  type CalendarSource,
  type SourceCalendar,
  type SourceEvent,
  type SyncResult,
  SyncTokenExpired,
} from "./source";

const box = new SecretBox("a test secret that is long enough", "calendars");

function event(
  externalId: string,
  fields: Partial<SourceEvent> = {},
): SourceEvent {
  return {
    externalId,
    title: externalId,
    location: null,
    notes: null,
    allDay: false,
    start: "2026-10-14T08:00:00.000Z",
    end: "2026-10-14T09:00:00.000Z",
    url: null,
    todoId: null,
    ...fields,
  };
}

/** A provider whose calendars and next sync answers the test sets. */
class FakeSource implements CalendarSource {
  list: SourceCalendar[] = [
    { externalId: "primary", name: "Me", writable: true, primary: true },
    {
      externalId: "holidays",
      name: "Holidays",
      writable: false,
      primary: false,
    },
  ];
  next = new Map<string, SyncResult | Error>();
  seenTokens: (string | null)[] = [];

  async calendars() {
    return this.list;
  }

  async sync(calendar: { externalId: string; syncToken: string | null }) {
    this.seenTokens.push(calendar.syncToken);
    const answer = this.next.get(calendar.externalId) ?? {
      full: false as const,
      changed: [],
      deleted: [],
      syncToken: calendar.syncToken ?? "t0",
    };
    this.next.delete(calendar.externalId);
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

let source: FakeSource;
let store: Calendars;
let accountId: number;

beforeEach(async () => {
  source = new FakeSource();
  const db = await openAppDatabase(":memory:");
  store = new Calendars(db, {
    box,
    timeZone: () => "Europe/Warsaw",
    sourceFor: () => source,
  });
  // An account the fake source answers for, as if signed in.
  const { calendarAccounts } = await import("@/db/schema");
  accountId = (
    await db
      .insert(calendarAccounts)
      .values({
        provider: "google",
        name: "me@example.com",
        secret: box.seal("{}"),
        createdAt: new Date(),
      })
      .returning()
      .get()
  ).id;
});

const DAY = 86_400_000;
const OCT_14 = Date.UTC(2026, 9, 14);

describe("Calendars", () => {
  it("lists an account's calendars, colours them in turn, and makes the primary one the default", async () => {
    await store.syncNow();

    const { accounts } = await store.overview();
    expect(accounts).toMatchObject([
      {
        id: accountId,
        name: "me@example.com",
        error: null,
        calendars: [
          { name: "Me", color: "blue", writable: true, isDefault: true },
          {
            name: "Holidays",
            color: "green",
            writable: false,
            isDefault: false,
          },
        ],
      },
    ]);
  });

  it("keeps an event's id across syncs, and applies changes and deletions", async () => {
    source.next.set("primary", {
      full: true,
      events: [event("a"), event("b")],
      syncToken: "t1",
    });
    await store.syncNow();
    const [a, b] = await store.events(OCT_14, OCT_14 + DAY);

    source.next.set("primary", {
      full: false,
      changed: [
        event("a", {
          title: "A, moved",
          start: "2026-10-14T10:00:00.000Z",
          end: "2026-10-14T11:00:00.000Z",
        }),
      ],
      deleted: ["b"],
      syncToken: "t2",
    });
    await store.syncNow();

    expect(await store.events(OCT_14, OCT_14 + DAY)).toEqual([
      expect.objectContaining({
        id: a.id,
        title: "A, moved",
        start: "2026-10-14T10:00:00.000Z",
      }),
    ]);
    expect(b).toBeDefined();
    // The second sync asked for changes since the first.
    expect(source.seenTokens).toContain("t1");
  });

  it("syncs in full again when the provider rejects its token", async () => {
    source.next.set("primary", {
      full: true,
      events: [event("a")],
      syncToken: "t1",
    });
    await store.syncNow();

    source.next.set("primary", new SyncTokenExpired());
    await store.syncNow();

    expect(source.seenTokens.slice(-2)).toEqual(["t1", null]);
  });

  it("records a failing sync on the account instead of throwing", async () => {
    source.next.set("primary", new Error("Google refused the sign-in"));

    await store.syncNow();

    expect((await store.overview()).accounts[0].error).toBe(
      "Google refused the sign-in",
    );
  });

  it("leaves hidden calendars' events out", async () => {
    source.next.set("primary", {
      full: true,
      events: [event("mine")],
      syncToken: "t1",
    });
    source.next.set("holidays", {
      full: true,
      events: [
        event("holiday", {
          allDay: true,
          start: "2026-10-14",
          end: "2026-10-15",
        }),
      ],
      syncToken: "h1",
    });
    await store.syncNow();
    expect(
      (await store.events(OCT_14, OCT_14 + DAY)).map((e) => e.title),
    ).toEqual(["holiday", "mine"]);

    const holidays = (await store.overview()).accounts[0].calendars[1];
    await store.updateCalendar(holidays.id, { visible: false });

    expect(
      (await store.events(OCT_14, OCT_14 + DAY)).map((e) => e.title),
    ).toEqual(["mine"]);
  });

  it("only makes a writable calendar the default", async () => {
    await store.syncNow();
    const [, holidays] = (await store.overview()).accounts[0].calendars;

    await expect(
      store.updateCalendar(holidays.id, { isDefault: true }),
    ).rejects.toSatisfy(InvalidCalendar.is);
    await expect(
      store.updateCalendar(404, { visible: true }),
    ).rejects.toSatisfy(CalendarNotFound.is);
  });

  it("adds an ICS link after reading it once, and refuses one that isn't a calendar", async () => {
    const db = await openAppDatabase(":memory:");
    const fetch = vi.fn(async (url: URL | RequestInfo) =>
      String(url).includes("good")
        ? new Response(
            "BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:x\nSUMMARY:Gym\nDTSTART:20261014T060000Z\nDTEND:20261014T070000Z\nEND:VEVENT\nEND:VCALENDAR",
          )
        : new Response("Not found", { status: 404 }),
    );
    const ics = new Calendars(db, {
      box,
      timeZone: () => "Europe/Warsaw",
      fetch,
      now: () => Date.UTC(2026, 9, 13),
    });

    await expect(
      ics.addIcs("Broken", "https://example.com/bad.ics"),
    ).rejects.toSatisfy(InvalidCalendar.is);
    const account = await ics.addIcs("Gym", "webcal://example.com/good.ics");

    expect(account).toMatchObject({
      provider: "ics",
      name: "Gym",
      calendars: [{ name: "Gym", writable: false, isDefault: false }],
    });
    expect(
      (await ics.events(OCT_14, OCT_14 + DAY)).map((e) => e.title),
    ).toEqual(["Gym"]);
  });
});
