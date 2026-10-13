import { describe, expect, it, vi } from "vitest";
import { IcsSource, readIcs } from "./ics";
import { SourceError } from "./source";

const WARSAW_ZONE = `BEGIN:VTIMEZONE
TZID:Europe/Warsaw
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;

const CALENDAR = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Hei//Test//EN
${WARSAW_ZONE}
BEGIN:VEVENT
UID:dentist
SUMMARY:Dentist
LOCATION:Główna 1
DTSTART;TZID=Europe/Warsaw:20261014T143000
DTEND;TZID=Europe/Warsaw:20261014T151500
END:VEVENT
BEGIN:VEVENT
UID:holiday
SUMMARY:All Saints
DTSTART;VALUE=DATE:20261101
DTEND;VALUE=DATE:20261102
END:VEVENT
BEGIN:VEVENT
UID:floating
SUMMARY:Run
DTSTART:20261015T070000
DTEND:20261015T080000
END:VEVENT
BEGIN:VEVENT
UID:standup
SUMMARY:Standup
DTSTART;TZID=Europe/Warsaw:20261012T091500
DTEND;TZID=Europe/Warsaw:20261012T093000
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE;TZID=Europe/Warsaw:20261019T091500
END:VEVENT
BEGIN:VEVENT
UID:standup
RECURRENCE-ID;TZID=Europe/Warsaw:20261026T091500
SUMMARY:Standup (moved)
DTSTART;TZID=Europe/Warsaw:20261026T100000
DTEND;TZID=Europe/Warsaw:20261026T101500
END:VEVENT
BEGIN:VEVENT
UID:standup
RECURRENCE-ID;TZID=Europe/Warsaw:20261102T091500
SUMMARY:Standup
STATUS:CANCELLED
DTSTART;TZID=Europe/Warsaw:20261102T091500
DTEND;TZID=Europe/Warsaw:20261102T093000
END:VEVENT
BEGIN:VEVENT
UID:ancient
SUMMARY:Long ago
DTSTART:20200101T100000Z
DTEND:20200101T110000Z
END:VEVENT
END:VCALENDAR`;

const WINDOW = {
  from: Date.UTC(2026, 8, 1),
  to: Date.UTC(2027, 8, 1),
};

describe("readIcs", () => {
  it("reads timed, all-day and floating events, and expands repeating ones", () => {
    const events = readIcs(CALENDAR, WINDOW, "Europe/Warsaw");

    expect(
      events.map((event) => [
        event.externalId,
        event.title,
        event.start,
        event.end,
      ]),
    ).toEqual([
      [
        "dentist",
        "Dentist",
        "2026-10-14T12:30:00.000Z",
        "2026-10-14T13:15:00.000Z",
      ],
      ["holiday", "All Saints", "2026-11-01", "2026-11-02"],
      // No zone: read in the Profile's.
      [
        "floating",
        "Run",
        "2026-10-15T05:00:00.000Z",
        "2026-10-15T06:00:00.000Z",
      ],
      // Weekly ×4: the 19th is skipped, the 26th moved (and after the clock change), the 2nd cancelled.
      [
        "standup/2026-10-12T09:15:00",
        "Standup",
        "2026-10-12T07:15:00.000Z",
        "2026-10-12T07:30:00.000Z",
      ],
      [
        "standup/2026-10-26T09:15:00",
        "Standup (moved)",
        "2026-10-26T09:00:00.000Z",
        "2026-10-26T09:15:00.000Z",
      ],
    ]);
    expect(events[0]).toMatchObject({ location: "Główna 1", allDay: false });
    expect(events[1]).toMatchObject({ allDay: true });
  });

  it("refuses what isn't a calendar", async () => {
    const source = new IcsSource({
      url: "webcal://example.com/cal.ics",
      name: "Work",
      timeZone: () => "Europe/Warsaw",
      fetch: vi.fn(async () => new Response("<html>Sign in</html>")),
    });

    await expect(source.sync()).rejects.toBeInstanceOf(SourceError);
  });

  it("fetches webcal links over https", async () => {
    const fetch = vi.fn(
      async (_url: URL | RequestInfo, _init?: RequestInit) =>
        new Response(CALENDAR),
    );
    const source = new IcsSource({
      url: "webcal://example.com/cal.ics",
      name: "Work",
      timeZone: () => "Europe/Warsaw",
      fetch,
      now: () => Date.UTC(2026, 9, 13),
    });

    const result = await source.sync();

    expect(String(fetch.mock.calls[0]?.[0])).toBe(
      "https://example.com/cal.ics",
    );
    expect(result).toMatchObject({ full: true, syncToken: null });
    expect(result.full && result.events).toHaveLength(5);
  });
});
