import { describe, expect, it } from "vitest";
import { todayLine } from "./today";

describe("todayLine", () => {
  it("names the weekday and date in the user's time zone", () => {
    expect(todayLine(new Date("2026-10-13T09:00:00Z"))).toBe(
      "Today is Tuesday, 13 October 2026 (Europe/Warsaw).",
    );
  });

  it("follows the time zone across midnight", () => {
    // 23:30 UTC on the 13th is already the 14th in Warsaw.
    expect(todayLine(new Date("2026-10-13T23:30:00Z"))).toContain(
      "Wednesday, 14 October 2026",
    );
  });
});
