/** Until the Profile sets one (step 7), Hei assumes the user's home time zone is this. */
export const DEFAULT_TIME_ZONE = "Europe/Warsaw";

/**
 * The date as the model should know it, e.g. "Today is Tuesday, 13 October 2026 (Europe/Warsaw)." Only the date, not the
 * time: the prompt then changes once a day, which keeps providers' prompt caches warm.
 */
export function todayLine(now: Date, timeZone = DEFAULT_TIME_ZONE): string {
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(now);
  return `Today is ${date} (${timeZone}).`;
}
