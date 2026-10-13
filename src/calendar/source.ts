/** What every calendar provider gives Hei: its calendars, and their events. */

/** An event occurrence as a provider reports it. */
export type SourceEvent = {
  /** The provider's id for this occurrence. */
  externalId: string;
  title: string;
  location: string | null;
  notes: string | null;
  allDay: boolean;
  /** An instant (ISO, UTC), or a date for an all-day event; the end is exclusive. */
  start: string;
  end: string;
  url: string | null;
  todoId: number | null;
};

export type SourceCalendar = {
  externalId: string;
  name: string;
  writable: boolean;
  primary: boolean;
};

/**
 * A sync's result: everything (replacing what Hei has), or the changes since the token Hei sent. A provider that has
 * no tokens always answers in full.
 */
export type SyncResult =
  | { full: true; events: SourceEvent[]; syncToken: string | null }
  | {
      full: false;
      changed: SourceEvent[];
      /** External ids of events that were deleted or cancelled. */
      deleted: string[];
      syncToken: string;
    };

export interface CalendarSource {
  calendars(): Promise<SourceCalendar[]>;
  sync(calendar: {
    externalId: string;
    syncToken: string | null;
  }): Promise<SyncResult>;
}

/** A provider refused or failed; the message says what the user can do. */
export class SourceError extends Error {}

/** A sync token the provider no longer accepts: sync the calendar in full. */
export class SyncTokenExpired extends Error {
  override readonly name = "SyncTokenExpired";
}

/** Matched by name: errors may come from another bundle of this module (see CLAUDE.md). */
export function isSyncTokenExpired(error: unknown): boolean {
  return error instanceof Error && error.name === "SyncTokenExpired";
}

/** How far back and ahead Hei keeps events. */
export const SYNC_PAST_DAYS = 60;
export const SYNC_FUTURE_DAYS = 365;

/** Instants for an event's start and end, for range queries; all-day dates count from midnight UTC. */
export function eventRange(event: Pick<SourceEvent, "start" | "end">): {
  startMs: number;
  endMs: number;
} {
  return { startMs: toMs(event.start), endMs: toMs(event.end) };
}

function toMs(value: string): number {
  return value.length === 10
    ? Date.parse(`${value}T00:00:00Z`)
    : Date.parse(value);
}
