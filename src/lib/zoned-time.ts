/** Wall-clock times in a named time zone, both ways, without a date library. */

export type ZonedParts = {
  /** "2026-10-13" */
  date: string;
  /** Minutes since local midnight, 0–1439. */
  minutes: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let format = formatters.get(timeZone);
  if (format === undefined) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, format);
  }
  return format;
}

/** The local date and time at `ms` in `timeZone`. */
export function zonedParts(ms: number, timeZone: string): ZonedParts {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(ms)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** How far `timeZone` is ahead of UTC at `ms`, in milliseconds. */
function offsetAt(ms: number, timeZone: string): number {
  const parts = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(ms)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant when it is `minutes` past midnight on `date` in `timeZone`. A time skipped by a clock change resolves to
 * the instant after the change.
 */
export function zonedInstant(
  date: string,
  minutes: number,
  timeZone: string,
): number {
  const [year, month, day] = date.split("-").map(Number);
  const wall = Date.UTC(year, month - 1, day) + minutes * 60_000;
  // The offset at the wall time read as UTC is close; one correction settles it, a second covers clock changes.
  let guess = wall - offsetAt(wall, timeZone);
  guess = wall - offsetAt(guess, timeZone);
  return guess;
}

/** The instant a local day starts. */
export function startOfDay(date: string, timeZone: string): number {
  return zonedInstant(date, 0, timeZone);
}
