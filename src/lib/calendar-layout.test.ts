import { describe, expect, it } from "vitest";
import {
  eventsOnDay,
  layoutDay,
  rangeTitle,
  shiftAnchor,
  type Timed,
  visibleDays,
  weekStart,
} from "./calendar-layout";

const ZONE = "Europe/Warsaw";

let nextId = 0;
/** A timed event in Warsaw's summer time (UTC+2) on 14 October 2026, from hh:mm to hh:mm. */
function at(from: string, to: string): Timed {
  const instant = (time: string) => {
    const [hours, minutes] = time.split(":").map(Number);
    return new Date(Date.UTC(2026, 9, 14, hours - 2, minutes)).toISOString();
  };
  return {
    id: ++nextId,
    allDay: false,
    start: instant(from),
    end: instant(to),
  };
}

describe("calendar layout", () => {
  it("shows weeks from Monday, and a month as the six weeks that hold it", () => {
    expect(weekStart("2026-10-14")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(visibleDays({ kind: "week" }, "2026-10-14")).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    const month = visibleDays({ kind: "month" }, "2026-10-14");
    expect([month[0], month.length]).toEqual(["2026-09-28", 42]);
    expect(visibleDays({ kind: "days", count: 3 }, "2026-10-31")).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  it("steps a view's worth back and forth", () => {
    expect(shiftAnchor({ kind: "days", count: 3 }, "2026-10-14", 1)).toBe(
      "2026-10-17",
    );
    expect(shiftAnchor({ kind: "week" }, "2026-10-14", -1)).toBe("2026-10-07");
    expect(shiftAnchor({ kind: "month" }, "2026-12-14", 1)).toBe("2027-01-01");
  });

  it("titles the range by its months", () => {
    const title = (view: Parameters<typeof visibleDays>[0], anchor: string) =>
      rangeTitle(view, visibleDays(view, anchor), anchor);
    expect(title({ kind: "week" }, "2026-10-14")).toBe("October 2026");
    expect(title({ kind: "week" }, "2026-09-30")).toBe("Sept – Oct 2026");
    expect(title({ kind: "week" }, "2026-12-30")).toBe("Dec 2026 – Jan 2027");
    expect(title({ kind: "month" }, "2026-10-14")).toBe("October 2026");
  });

  it("places events by time and puts overlapping ones side by side", () => {
    const standup = at("09:00", "09:30");
    const review = at("09:15", "10:00");
    const lunch = at("12:00", "13:00");
    const quick = at("15:00", "15:05");

    const placed = layoutDay(
      [lunch, review, standup, quick],
      "2026-10-14",
      ZONE,
    );

    expect(
      placed.map((p) => [p.event.id, p.top, p.bottom, p.column, p.columns]),
    ).toEqual([
      [standup.id, 540, 570, 0, 2],
      [review.id, 555, 600, 1, 2],
      [lunch.id, 720, 780, 0, 1],
      // Drawn at least 20 minutes tall.
      [quick.id, 900, 920, 0, 1],
    ]);
  });

  it("clips an event that runs past midnight to each day", () => {
    const night = at("22:00", "26:00"); // until 02:00 the next day

    expect(
      layoutDay([night], "2026-10-14", ZONE).map((p) => [p.top, p.bottom]),
    ).toEqual([[1320, 1440]]);
    expect(
      layoutDay([night], "2026-10-15", ZONE).map((p) => [p.top, p.bottom]),
    ).toEqual([[0, 120]]);
  });

  it("lists a day's all-day events first, then timed ones by time", () => {
    const holiday: Timed = {
      id: 99,
      allDay: true,
      start: "2026-10-14",
      end: "2026-10-16",
    };
    const late = at("18:00", "19:00");
    const early = at("08:00", "09:00");

    expect(
      eventsOnDay([late, holiday, early], "2026-10-14", ZONE).map((e) => e.id),
    ).toEqual([99, early.id, late.id]);
    expect(eventsOnDay([holiday], "2026-10-16", ZONE)).toEqual([]);
  });
});
