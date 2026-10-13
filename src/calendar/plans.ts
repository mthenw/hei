import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/database";
import { type CalendarPlanRow, calendarPlans } from "@/db/schema";
import { type Calendars, InvalidCalendar } from "./calendars";
import type { EventDraft } from "./google";
import { SourceError } from "./source";

/** A change as Hei proposes it, times already instants (or dates for all-day events). */
export type ProposedChange =
  | {
      action: "create";
      title: string;
      allDay: boolean;
      start: string;
      end: string;
      /** Hei's calendar id; the default calendar when left out. */
      calendarId?: number;
      location?: string | null;
      notes?: string | null;
      todoId?: number | null;
    }
  | { action: "move"; eventId: number; start: string; end: string }
  | { action: "delete"; eventId: number };

/** A change as the plan card shows it: what it does, to what, as things were when it was proposed. */
export type PlanChange =
  | {
      action: "create";
      calendarId: number;
      calendarName: string;
      title: string;
      allDay: boolean;
      start: string;
      end: string;
      location: string | null;
      notes: string | null;
      todoId: number | null;
    }
  | {
      action: "move";
      eventId: number;
      calendarName: string;
      title: string;
      allDay: boolean;
      from: { start: string; end: string };
      to: { start: string; end: string };
    }
  | {
      action: "delete";
      eventId: number;
      calendarName: string;
      title: string;
      allDay: boolean;
      start: string;
      end: string;
    };

export type PlanStatus = CalendarPlanRow["status"];

export type PlanView = {
  id: number;
  summary: string;
  status: PlanStatus;
  changes: PlanChange[];
  /** Why applying stopped, when it did. */
  error: string | null;
  /** For showing the times. */
  timeZone: string;
};

/** What applying a change did, so Undo can reverse it. */
type Applied =
  | { action: "create"; calendarId: number; externalId: string }
  | {
      action: "move";
      calendarId: number;
      externalId: string;
      previous: { start: string; end: string; allDay: boolean };
    }
  | { action: "delete"; calendarId: number; snapshot: EventDraft };

const MAX_CHANGES = 20;

/**
 * Calendar changes Hei proposes and the user decides on: nothing changes until Approve, and an applied plan can be
 * undone. Writes go to Google; the synced copy follows with an immediate sync.
 */
export class CalendarPlans {
  private readonly now: () => number;

  constructor(
    private readonly db: AppDatabase,
    private readonly calendars: Calendars,
    private readonly options: { timeZone: () => string; now?: () => number },
  ) {
    this.now = options.now ?? Date.now;
  }

  /** Check the changes against the calendars as they are, and keep them as a pending plan. */
  async propose(input: {
    summary: string;
    changes: ProposedChange[];
    chatId?: number;
  }): Promise<PlanView> {
    const summary = input.summary.trim();
    if (summary.length === 0)
      throw new InvalidCalendar("Give the plan a one-line summary.");
    if (input.changes.length === 0 || input.changes.length > MAX_CHANGES)
      throw new InvalidCalendar(`A plan needs 1 to ${MAX_CHANGES} changes.`);
    const changes: PlanChange[] = [];
    for (const change of input.changes) changes.push(await this.check(change));
    const row = await this.db
      .insert(calendarPlans)
      .values({
        chatId: input.chatId ?? null,
        summary,
        changes: JSON.stringify(changes),
        status: "pending",
        createdAt: new Date(this.now()),
      })
      .returning()
      .get();
    return this.view(row);
  }

  async get(id: number): Promise<PlanView> {
    return this.view(await this.row(id));
  }

  /** Apply the plan. A change that fails stops it; what was applied stays, and Undo reverses it. */
  async approve(id: number): Promise<PlanView> {
    const row = await this.row(id);
    if (row.status !== "pending")
      throw new InvalidCalendar(`This plan is ${row.status} already.`);
    const changes = JSON.parse(row.changes) as PlanChange[];
    const applied: Applied[] = [];
    let error: string | null = null;
    const accounts = new Set<number>();
    for (const change of changes) {
      try {
        applied.push(await this.apply(change, accounts));
      } catch (cause) {
        error = messageOf(cause);
        break;
      }
    }
    await this.decide(id, error ? "failed" : "applied", applied, error);
    await this.resync(accounts);
    return this.get(id);
  }

  async dismiss(id: number): Promise<PlanView> {
    const row = await this.row(id);
    if (row.status !== "pending")
      throw new InvalidCalendar(`This plan is ${row.status} already.`);
    await this.decide(id, "dismissed", [], null);
    return this.get(id);
  }

  /** Reverse what applying did, latest first. */
  async undo(id: number): Promise<PlanView> {
    const row = await this.row(id);
    if (row.status !== "applied" && row.status !== "failed")
      throw new InvalidCalendar("Only an applied plan can be undone.");
    const applied = JSON.parse(row.applied ?? "[]") as Applied[];
    const accounts = new Set<number>();
    let error: string | null = null;
    for (const step of [...applied].reverse()) {
      try {
        await this.reverse(step, accounts);
      } catch (cause) {
        error = `Undo stopped: ${messageOf(cause)}`;
        break;
      }
    }
    await this.decide(
      id,
      error ? "failed" : "undone",
      error ? applied : [],
      error,
    );
    await this.resync(accounts);
    return this.get(id);
  }

  private async check(change: ProposedChange): Promise<PlanChange> {
    if (change.action === "create") {
      const calendar =
        change.calendarId === undefined
          ? await this.calendars.defaultCalendar()
          : await this.calendars.calendarSummary(change.calendarId);
      if (calendar === undefined)
        throw new InvalidCalendar(
          "No calendar can take new events: connect a Google calendar first.",
        );
      if (!calendar.writable)
        throw new InvalidCalendar(`“${calendar.name}” is read only.`);
      checkTimes(change.allDay, change.start, change.end);
      const title = change.title.trim();
      if (title.length === 0)
        throw new InvalidCalendar("An event needs a title.");
      return {
        action: "create",
        calendarId: calendar.id,
        calendarName: calendar.name,
        title,
        allDay: change.allDay,
        start: change.start,
        end: change.end,
        location: change.location?.trim() || null,
        notes: change.notes?.trim() || null,
        todoId: change.todoId ?? null,
      };
    }
    const { event, calendar } = await this.calendars.event(change.eventId);
    if (!calendar.writable)
      throw new InvalidCalendar(
        `“${event.title}” is in “${calendar.name}”, which is read only.`,
      );
    if (change.action === "delete")
      return {
        action: "delete",
        eventId: event.id,
        calendarName: calendar.name,
        title: event.title,
        allDay: event.allDay,
        start: event.start,
        end: event.end,
      };
    checkTimes(event.allDay, change.start, change.end);
    return {
      action: "move",
      eventId: event.id,
      calendarName: calendar.name,
      title: event.title,
      allDay: event.allDay,
      from: { start: event.start, end: event.end },
      to: { start: change.start, end: change.end },
    };
  }

  private async apply(
    change: PlanChange,
    accounts: Set<number>,
  ): Promise<Applied> {
    if (change.action === "create") {
      const writer = await this.calendars.writer(change.calendarId);
      accounts.add(writer.accountId);
      const created = await writer.source.create(writer.externalId, {
        title: change.title,
        allDay: change.allDay,
        start: change.start,
        end: change.end,
        location: change.location,
        notes: change.notes,
        todoId: change.todoId,
      });
      return {
        action: "create",
        calendarId: change.calendarId,
        externalId: created.externalId,
      };
    }
    const { event, externalId, calendar } = await this.calendars.event(
      change.eventId,
    );
    const writer = await this.calendars.writer(calendar.id);
    accounts.add(writer.accountId);
    if (change.action === "move") {
      await writer.source.update(writer.externalId, externalId, {
        allDay: event.allDay,
        start: change.to.start,
        end: change.to.end,
      });
      return {
        action: "move",
        calendarId: calendar.id,
        externalId,
        previous: { start: event.start, end: event.end, allDay: event.allDay },
      };
    }
    await writer.source.remove(writer.externalId, externalId);
    return {
      action: "delete",
      calendarId: calendar.id,
      snapshot: {
        title: event.title,
        allDay: event.allDay,
        start: event.start,
        end: event.end,
        location: event.location,
        notes: event.notes,
        todoId: event.todoId,
      },
    };
  }

  private async reverse(step: Applied, accounts: Set<number>) {
    const writer = await this.calendars.writer(step.calendarId);
    accounts.add(writer.accountId);
    if (step.action === "create")
      await writer.source.remove(writer.externalId, step.externalId);
    else if (step.action === "move")
      await writer.source.update(
        writer.externalId,
        step.externalId,
        step.previous,
      );
    else await writer.source.create(writer.externalId, step.snapshot);
  }

  private async decide(
    id: number,
    status: PlanStatus,
    applied: Applied[],
    error: string | null,
  ) {
    await this.db
      .update(calendarPlans)
      .set({
        status,
        applied: JSON.stringify(applied),
        error,
        decidedAt: new Date(this.now()),
      })
      .where(eq(calendarPlans.id, id));
    this.calendars.notifyChanged();
  }

  /** Bring the copy up to date with what was just written. */
  private async resync(accounts: Set<number>) {
    for (const accountId of accounts) await this.calendars.syncNow(accountId);
  }

  private async row(id: number): Promise<CalendarPlanRow> {
    const row = await this.db
      .select()
      .from(calendarPlans)
      .where(eq(calendarPlans.id, id))
      .get();
    if (row === undefined) throw new InvalidCalendar(`Plan ${id} not found.`);
    return row;
  }

  private view(row: CalendarPlanRow): PlanView {
    return {
      id: row.id,
      summary: row.summary,
      status: row.status,
      changes: JSON.parse(row.changes) as PlanChange[],
      error: row.error,
      timeZone: this.options.timeZone(),
    };
  }
}

function checkTimes(allDay: boolean, start: string, end: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (
    allDay
      ? !date.test(start) || !date.test(end)
      : Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))
  )
    throw new InvalidCalendar(
      allDay
        ? "An all-day event's start and end are dates (YYYY-MM-DD; the end is the day after it ends)."
        : "Give times as YYYY-MM-DDTHH:MM.",
    );
  if (allDay ? end <= start : Date.parse(end) <= Date.parse(start))
    throw new InvalidCalendar("An event must end after it starts.");
}

function messageOf(error: unknown): string {
  if (error instanceof SourceError || error instanceof Error)
    return error.message;
  return String(error);
}
