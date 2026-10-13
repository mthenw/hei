import { describe, expect, it } from "vitest";
import { startOfDay, zonedInstant, zonedParts } from "./zoned-time";

const WARSAW = "Europe/Warsaw";

describe("zoned time", () => {
  it("reads the local date and time", () => {
    expect(zonedParts(Date.UTC(2026, 9, 13, 21, 30), WARSAW)).toEqual({
      date: "2026-10-13",
      minutes: 23 * 60 + 30,
    });
    expect(zonedParts(Date.UTC(2026, 9, 13, 22, 30), WARSAW)).toEqual({
      date: "2026-10-14",
      minutes: 30,
    });
  });

  it("finds the instant of a local time, across the clock changes", () => {
    // Summer time (UTC+2), winter time (UTC+1).
    expect(zonedInstant("2026-10-13", 9 * 60, WARSAW)).toBe(
      Date.UTC(2026, 9, 13, 7, 0),
    );
    expect(zonedInstant("2026-12-01", 9 * 60, WARSAW)).toBe(
      Date.UTC(2026, 11, 1, 8, 0),
    );
    // 25 October 2026: clocks go back at 03:00; the day is 25 hours long.
    expect(
      startOfDay("2026-10-26", WARSAW) - startOfDay("2026-10-25", WARSAW),
    ).toBe(25 * 3_600_000);
  });

  it("round-trips", () => {
    for (const ms of [
      Date.UTC(2026, 2, 29, 0, 30),
      Date.UTC(2026, 5, 1, 12, 0),
      Date.UTC(2026, 9, 25, 1, 15),
    ]) {
      const { date, minutes } = zonedParts(ms, WARSAW);
      expect(zonedInstant(date, minutes, WARSAW)).toBe(
        Math.floor(ms / 60_000) * 60_000,
      );
    }
  });
});
