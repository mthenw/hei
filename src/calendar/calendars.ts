import { and, asc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/database";
import {
  type CalendarAccountRow,
  type CalendarRow,
  calendarAccounts,
  calendarEvents,
  calendars,
} from "@/db/schema";
import { HeiError, isHeiError } from "@/lib/errors";
import type { SecretBox } from "@/lib/secret-box";
import {
  type AccessToken,
  type GoogleClient,
  type GoogleGrant,
  GoogleOAuth,
  GoogleSource,
} from "./google";
import { IcsSource } from "./ics";
import {
  type CalendarSource,
  eventRange,
  isSyncTokenExpired,
  SourceError,
  type SourceEvent,
} from "./source";

export type CalendarColor = "blue" | "green" | "purple" | "coral" | "amber";
export const CALENDAR_COLORS: readonly CalendarColor[] = [
  "blue",
  "green",
  "purple",
  "coral",
  "amber",
];

export type CalendarSummary = {
  id: number;
  accountId: number;
  name: string;
  color: CalendarColor;
  visible: boolean;
  writable: boolean;
  isDefault: boolean;
};

export type AccountSummary = {
  id: number;
  provider: "google" | "ics";
  name: string;
  /** Why the last sync failed; null when it worked. */
  error: string | null;
  syncedAt: number | null;
  calendars: CalendarSummary[];
};

/** What the calendar page needs besides events: the accounts and calendars, and the zone to show times in. */
export type CalendarOverview = {
  accounts: AccountSummary[];
  timeZone: string;
  /** Hei has an OAuth client to sign in to Google with. */
  googleConfigured: boolean;
  /** HEI_SECRET is set, so accounts can be stored. */
  secretConfigured: boolean;
};

export type CalendarEvent = {
  id: number;
  calendarId: number;
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

export class InvalidCalendar extends HeiError<"InvalidCalendar"> {
  constructor(message: string) {
    super("InvalidCalendar", message);
  }

  static is(error: unknown): error is InvalidCalendar {
    return isHeiError(error, "InvalidCalendar");
  }
}

export class CalendarNotFound extends HeiError<"CalendarNotFound"> {
  constructor(what: string) {
    super("CalendarNotFound", `${what} not found`);
  }

  static is(error: unknown): error is CalendarNotFound {
    return isHeiError(error, "CalendarNotFound");
  }
}

const MINUTE = 60_000;
const DAY = 86_400_000;
/** How often each kind of account is synced in the background. */
const SYNC_EVERY: Record<CalendarAccountRow["provider"], number> = {
  google: 2 * MINUTE,
  ics: 15 * MINUTE,
};
/** Rows per insert: SQLite limits how many values one statement may carry. */
const CHUNK = 50;

export type CalendarsOptions = {
  /** Seals tokens and addresses; without it no account can be added. */
  box: SecretBox | undefined;
  /** The Profile's time zone, read on every use. */
  timeZone: () => string;
  /** The source behind an account; tests replace it. */
  sourceFor?: (account: CalendarAccountRow, secret: string) => CalendarSource;
  /** Hei's own Google OAuth client; without it Google can't be connected. */
  google?: GoogleClient;
  /** For reading ICS addresses and calling Google; tests replace it. */
  fetch?: typeof fetch;
  now?: () => number;
};

/**
 * The user's calendars: connected accounts, their calendars, and a synced copy of their events (ADR 0008). Every
 * change notifies subscribers, so the calendar page stays current.
 */
export class Calendars {
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  /** Syncs run one at a time. */
  private syncing: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | undefined;
  /** Google sign-ins in progress, by state: the PKCE verifier and where Google sends the user back. */
  private readonly signIns = new Map<
    string,
    { verifier: string; redirectUri: string; expiresAt: number }
  >();
  /** Access tokens by account; they last an hour and aren't worth storing. */
  private readonly accessTokens = new Map<number, AccessToken>();

  constructor(
    private readonly db: AppDatabase,
    private readonly options: CalendarsOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  /** Sync in the background: every minute, the accounts that are due. */
  start(): void {
    if (this.timer) return;
    void this.syncDue();
    this.timer = setInterval(() => void this.syncDue(), MINUTE);
    this.timer.unref?.();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async overview(): Promise<CalendarOverview> {
    const [accounts, rows] = await Promise.all([
      this.db.select().from(calendarAccounts).orderBy(asc(calendarAccounts.id)),
      this.db.select().from(calendars).orderBy(asc(calendars.id)),
    ]);
    return {
      accounts: accounts.map((account) => ({
        id: account.id,
        provider: account.provider,
        name: account.name,
        error: account.error,
        syncedAt: account.syncedAt?.getTime() ?? null,
        calendars: rows
          .filter((row) => row.accountId === account.id)
          .map(toSummary),
      })),
      timeZone: this.options.timeZone(),
      googleConfigured: this.options.google !== undefined,
      secretConfigured: this.options.box !== undefined,
    };
  }

  /** Start signing in to Google: the consent address to send the browser to. */
  beginGoogleSignIn(redirectUri: string): string {
    this.requireBox();
    const begun = this.oauth().begin(redirectUri);
    const now = this.now();
    for (const [state, pending] of this.signIns)
      if (pending.expiresAt < now) this.signIns.delete(state);
    this.signIns.set(begun.state, {
      verifier: begun.verifier,
      redirectUri,
      expiresAt: now + 10 * MINUTE,
    });
    return begun.url;
  }

  /** Finish signing in with what Google sent back; signing in again with the same account renews it. */
  async finishGoogleSignIn(
    state: string,
    code: string,
  ): Promise<AccountSummary> {
    const pending = this.signIns.get(state);
    this.signIns.delete(state);
    if (pending === undefined || pending.expiresAt < this.now())
      throw new InvalidCalendar(
        "This sign-in has expired or didn't start here. Connect Google again.",
      );
    let grant: GoogleGrant & AccessToken;
    try {
      grant = await this.oauth().finish(
        code,
        pending.verifier,
        pending.redirectUri,
      );
    } catch (error) {
      if (error instanceof SourceError)
        throw new InvalidCalendar(error.message);
      throw error;
    }
    const secret = this.requireBox().seal(
      JSON.stringify({ refreshToken: grant.refreshToken, email: grant.email }),
    );
    const existing = await this.db
      .select()
      .from(calendarAccounts)
      .where(
        and(
          eq(calendarAccounts.provider, "google"),
          eq(calendarAccounts.name, grant.email),
        ),
      )
      .get();
    const id = existing
      ? (
          await this.db
            .update(calendarAccounts)
            .set({ secret, error: null })
            .where(eq(calendarAccounts.id, existing.id))
            .returning()
            .get()
        ).id
      : (
          await this.db
            .insert(calendarAccounts)
            .values({
              provider: "google",
              name: grant.email,
              secret,
              createdAt: new Date(this.now()),
            })
            .returning()
            .get()
        ).id;
    this.accessTokens.set(id, {
      accessToken: grant.accessToken,
      expiresAt: grant.expiresAt,
    });
    await this.syncNow(id);
    return this.account(id);
  }

  /** Events of visible calendars that overlap `from`–`to`, earliest first. */
  async events(from: number, to: number): Promise<CalendarEvent[]> {
    // All-day dates count from midnight UTC, so the window widens by a day each way; callers place them by date.
    const rows = await this.db
      .select({ event: calendarEvents })
      .from(calendarEvents)
      .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
      .where(
        and(
          eq(calendars.visible, true),
          lt(calendarEvents.startMs, to + DAY),
          gt(calendarEvents.endMs, from - DAY),
        ),
      )
      .orderBy(asc(calendarEvents.startMs), asc(calendarEvents.id));
    return rows.map(({ event }) => toEvent(event));
  }

  /** An event with its calendar and the provider's id for it, by Hei's id. */
  async event(id: number): Promise<{
    event: CalendarEvent;
    externalId: string;
    calendar: CalendarSummary;
  }> {
    const row = await this.db
      .select({ event: calendarEvents, calendar: calendars })
      .from(calendarEvents)
      .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
      .where(eq(calendarEvents.id, id))
      .get();
    if (row === undefined) throw new CalendarNotFound(`Event ${id}`);
    return {
      event: toEvent(row.event),
      externalId: row.event.externalId,
      calendar: toSummary(row.calendar),
    };
  }

  async calendarSummary(id: number): Promise<CalendarSummary> {
    return toSummary(await this.calendar(id));
  }

  /** Where new events go, if any calendar can take them. */
  async defaultCalendar(): Promise<CalendarSummary | undefined> {
    const row = await this.db
      .select()
      .from(calendars)
      .where(eq(calendars.isDefault, true))
      .get();
    return row && toSummary(row);
  }

  /** What changes a calendar's events at its provider: only Google calendars the account may edit have one. */
  async writer(
    calendarId: number,
  ): Promise<{ source: GoogleSource; externalId: string; accountId: number }> {
    const row = await this.calendar(calendarId);
    const account = await this.db
      .select()
      .from(calendarAccounts)
      .where(eq(calendarAccounts.id, row.accountId))
      .get();
    if (account === undefined || !row.writable)
      throw new InvalidCalendar(`Hei can't change events in “${row.name}”.`);
    const source = this.sourceFor(account);
    if (!(source instanceof GoogleSource))
      throw new InvalidCalendar(`“${row.name}” is read only.`);
    return { source, externalId: row.externalId, accountId: row.accountId };
  }

  /**
   * Block time for a todo in the default calendar: the user's own drag, so it needs no plan. Resolves to the event once
   * the copy has it.
   */
  async createBlock(block: {
    todoId: number;
    title: string;
    start: string;
    end: string;
  }): Promise<CalendarEvent> {
    const calendar = await this.defaultCalendar();
    if (calendar === undefined)
      throw new InvalidCalendar(
        "No calendar can take new events: connect a Google calendar first.",
      );
    if (
      Number.isNaN(Date.parse(block.start)) ||
      Date.parse(block.end) <= Date.parse(block.start)
    )
      throw new InvalidCalendar("A block needs a start and a later end.");
    const writer = await this.writer(calendar.id);
    const created = await writer.source.create(writer.externalId, {
      title: block.title,
      allDay: false,
      start: block.start,
      end: block.end,
      todoId: block.todoId,
    });
    await this.syncNow(writer.accountId);
    const row = await this.db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.calendarId, calendar.id),
          eq(calendarEvents.externalId, created.externalId),
        ),
      )
      .get();
    if (row === undefined)
      throw new InvalidCalendar("The block was made, but hasn't synced yet.");
    return toEvent(row);
  }

  /** Remove a time block made from a todo (its Undo). Other events change only through plans. */
  async removeBlock(eventId: number): Promise<void> {
    const { event, externalId, calendar } = await this.event(eventId);
    if (event.todoId === null)
      throw new InvalidCalendar(
        "Only a todo's time block can be removed here.",
      );
    const writer = await this.writer(calendar.id);
    await writer.source.remove(writer.externalId, externalId);
    await this.syncNow(writer.accountId);
  }

  /** Tell views something changed outside a sync, such as a plan being decided. */
  notifyChanged(): void {
    this.changed();
  }

  /** Connect a calendar published at an ICS address. It is read once now, so a bad link fails here. */
  async addIcs(name: string, url: string): Promise<AccountSummary> {
    const box = this.requireBox();
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 100)
      throw new InvalidCalendar("A name must be 1 to 100 characters.");
    const address = url.trim();
    if (!/^(https?|webcal):\/\/\S+$/i.test(address))
      throw new InvalidCalendar(
        "The address must start with https://, http:// or webcal://.",
      );
    const preview = new IcsSource({
      url: address,
      name: trimmedName,
      timeZone: this.options.timeZone,
      fetch: this.options.fetch,
    });
    try {
      await preview.sync();
    } catch (error) {
      if (error instanceof SourceError)
        throw new InvalidCalendar(error.message);
      throw error;
    }
    const account = await this.db
      .insert(calendarAccounts)
      .values({
        provider: "ics",
        name: trimmedName,
        secret: box.seal(address),
        createdAt: new Date(this.now()),
      })
      .returning()
      .get();
    await this.syncNow(account.id);
    return this.account(account.id);
  }

  async removeAccount(id: number): Promise<void> {
    this.accessTokens.delete(id);
    const result = await this.db
      .delete(calendarAccounts)
      .where(eq(calendarAccounts.id, id))
      .returning({ id: calendarAccounts.id });
    if (result.length === 0) throw new CalendarNotFound(`Account ${id}`);
    await this.ensureDefault();
    this.changed();
  }

  /** Show or hide a calendar, recolour it, or make it the default for new events. */
  async updateCalendar(
    id: number,
    change: { visible?: boolean; color?: CalendarColor; isDefault?: boolean },
  ): Promise<CalendarSummary> {
    const row = await this.calendar(id);
    if (change.color !== undefined && !CALENDAR_COLORS.includes(change.color))
      throw new InvalidCalendar("Unknown colour.");
    if (change.isDefault === true) {
      if (!row.writable)
        throw new InvalidCalendar(
          "Only a calendar Hei can write to can be the default.",
        );
      await this.db.update(calendars).set({ isDefault: false });
    }
    const updated = await this.db
      .update(calendars)
      .set({
        ...(change.visible !== undefined ? { visible: change.visible } : {}),
        ...(change.color !== undefined ? { color: change.color } : {}),
        ...(change.isDefault === true ? { isDefault: true } : {}),
      })
      .where(eq(calendars.id, id))
      .returning()
      .get();
    this.changed();
    return toSummary(updated);
  }

  /** Sync one account, or all of them, now; resolves when done. */
  syncNow(accountId?: number): Promise<void> {
    return this.enqueue(async () => {
      const accounts = await this.db
        .select()
        .from(calendarAccounts)
        .where(
          accountId === undefined
            ? undefined
            : eq(calendarAccounts.id, accountId),
        );
      for (const account of accounts) await this.syncAccount(account);
    });
  }

  /** Call `listener` after every change. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private syncDue(): Promise<void> {
    return this.enqueue(async () => {
      const now = this.now();
      for (const account of await this.db.select().from(calendarAccounts)) {
        const last = account.syncedAt?.getTime() ?? 0;
        if (now - last >= SYNC_EVERY[account.provider])
          await this.syncAccount(account);
      }
    });
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.syncing.then(work);
    this.syncing = next.catch((error: unknown) =>
      console.warn("Calendar sync failed:", error),
    );
    return next;
  }

  private async syncAccount(account: CalendarAccountRow): Promise<void> {
    try {
      const source = this.sourceFor(account);
      await this.syncCalendarList(account, source);
      const rows = await this.db
        .select()
        .from(calendars)
        .where(eq(calendars.accountId, account.id));
      for (const row of rows) await this.syncCalendar(source, row);
      await this.db
        .update(calendarAccounts)
        .set({ error: null, syncedAt: new Date(this.now()) })
        .where(eq(calendarAccounts.id, account.id));
    } catch (error) {
      await this.db
        .update(calendarAccounts)
        .set({
          error: error instanceof Error ? error.message : String(error),
          // A failing account waits its turn like any other, rather than retrying every minute.
          syncedAt: new Date(this.now()),
        })
        .where(eq(calendarAccounts.id, account.id));
    } finally {
      this.changed();
    }
  }

  /** Add calendars the account gained, rename changed ones, and drop those it lost. */
  private async syncCalendarList(
    account: CalendarAccountRow,
    source: CalendarSource,
  ) {
    const remote = await source.calendars();
    const local = await this.db
      .select()
      .from(calendars)
      .where(eq(calendars.accountId, account.id));
    const taken = (await this.db.select({ id: calendars.id }).from(calendars))
      .length;
    let added = 0;
    for (const calendar of remote) {
      const existing = local.find(
        (row) => row.externalId === calendar.externalId,
      );
      if (existing === undefined) {
        await this.db.insert(calendars).values({
          accountId: account.id,
          externalId: calendar.externalId,
          name: calendar.name,
          color: CALENDAR_COLORS[(taken + added++) % CALENDAR_COLORS.length],
          writable: calendar.writable,
        });
      } else if (
        existing.name !== calendar.name ||
        existing.writable !== calendar.writable
      ) {
        await this.db
          .update(calendars)
          .set({ name: calendar.name, writable: calendar.writable })
          .where(eq(calendars.id, existing.id));
      }
    }
    const gone = local.filter(
      (row) =>
        !remote.some((calendar) => calendar.externalId === row.externalId),
    );
    if (gone.length > 0)
      await this.db.delete(calendars).where(
        inArray(
          calendars.id,
          gone.map((row) => row.id),
        ),
      );
    await this.ensureDefault(
      remote.find((calendar) => calendar.primary && calendar.writable)
        ?.externalId,
      account.id,
    );
  }

  private async syncCalendar(source: CalendarSource, row: CalendarRow) {
    let result: Awaited<ReturnType<CalendarSource["sync"]>>;
    try {
      result = await source.sync(row);
    } catch (error) {
      if (!isSyncTokenExpired(error)) throw error;
      // The provider forgot where we were: start over.
      result = await source.sync({
        externalId: row.externalId,
        syncToken: null,
      });
    }
    if (result.full) await this.replaceEvents(row.id, result.events);
    else await this.applyChanges(row.id, result.changed, result.deleted);
    await this.db
      .update(calendars)
      .set({ syncToken: result.syncToken })
      .where(eq(calendars.id, row.id));
  }

  /** Make the calendar's events exactly `events`, keeping the ids of those that stay. */
  private async replaceEvents(calendarId: number, events: SourceEvent[]) {
    const existing = await this.db
      .select({ id: calendarEvents.id, externalId: calendarEvents.externalId })
      .from(calendarEvents)
      .where(eq(calendarEvents.calendarId, calendarId));
    const keep = new Set(events.map((event) => event.externalId));
    await this.removeEvents(
      existing.filter((row) => !keep.has(row.externalId)).map((row) => row.id),
    );
    await this.upsertEvents(calendarId, events);
  }

  private async applyChanges(
    calendarId: number,
    changed: SourceEvent[],
    deleted: string[],
  ) {
    for (let index = 0; index < deleted.length; index += CHUNK)
      await this.db
        .delete(calendarEvents)
        .where(
          and(
            eq(calendarEvents.calendarId, calendarId),
            inArray(
              calendarEvents.externalId,
              deleted.slice(index, index + CHUNK),
            ),
          ),
        );
    await this.upsertEvents(calendarId, changed);
  }

  private async upsertEvents(calendarId: number, events: SourceEvent[]) {
    for (let index = 0; index < events.length; index += CHUNK) {
      const rows = events.slice(index, index + CHUNK).map((event) => ({
        calendarId,
        ...event,
        ...eventRange(event),
      }));
      await this.db
        .insert(calendarEvents)
        .values(rows)
        .onConflictDoUpdate({
          target: [calendarEvents.calendarId, calendarEvents.externalId],
          set: {
            title: sql`excluded.title`,
            location: sql`excluded.location`,
            notes: sql`excluded.notes`,
            allDay: sql`excluded.all_day`,
            start: sql`excluded.start`,
            end: sql`excluded.end`,
            startMs: sql`excluded.start_ms`,
            endMs: sql`excluded.end_ms`,
            url: sql`excluded.url`,
            todoId: sql`excluded.todo_id`,
          },
        });
    }
  }

  private async removeEvents(ids: number[]) {
    for (let index = 0; index < ids.length; index += CHUNK)
      await this.db
        .delete(calendarEvents)
        .where(inArray(calendarEvents.id, ids.slice(index, index + CHUNK)));
  }

  /**
   * Keep one default calendar for new events: the one asked for if there is none yet, otherwise the first writable
   * calendar left.
   */
  private async ensureDefault(preferred?: string, accountId?: number) {
    const rows = await this.db.select().from(calendars);
    if (rows.some((row) => row.isDefault)) return;
    const choice =
      rows.find(
        (row) =>
          row.accountId === accountId &&
          row.externalId === preferred &&
          row.writable,
      ) ?? rows.find((row) => row.writable);
    if (choice)
      await this.db
        .update(calendars)
        .set({ isDefault: true })
        .where(eq(calendars.id, choice.id));
  }

  private sourceFor(account: CalendarAccountRow): CalendarSource {
    const secret = this.requireBox().open(account.secret);
    if (this.options.sourceFor) return this.options.sourceFor(account, secret);
    if (account.provider === "ics")
      return new IcsSource({
        url: secret,
        name: account.name,
        timeZone: this.options.timeZone,
        fetch: this.options.fetch,
      });
    const grant = JSON.parse(secret) as GoogleGrant;
    return new GoogleSource({
      accessToken: (refresh) => this.accessToken(account.id, grant, refresh),
      fetch: this.options.fetch,
      now: this.now,
    });
  }

  /** A current access token for a Google account, refreshed when it is about to expire or was refused. */
  private async accessToken(
    accountId: number,
    grant: GoogleGrant,
    refresh = false,
  ): Promise<string> {
    const cached = this.accessTokens.get(accountId);
    if (!refresh && cached && cached.expiresAt - MINUTE > this.now())
      return cached.accessToken;
    const fresh = await this.oauth().refresh(grant.refreshToken);
    this.accessTokens.set(accountId, fresh);
    return fresh.accessToken;
  }

  private oauth(): GoogleOAuth {
    if (this.options.google === undefined)
      throw new InvalidCalendar(
        "Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to .env to connect Google (see docs/calendar-spec.md, Setup).",
      );
    return new GoogleOAuth(this.options.google, {
      fetch: this.options.fetch,
      now: this.now,
    });
  }

  private requireBox(): SecretBox {
    if (this.options.box === undefined)
      throw new InvalidCalendar(
        "Set HEI_SECRET in .env to connect calendars: their addresses and sign-ins are stored encrypted.",
      );
    return this.options.box;
  }

  private async account(id: number): Promise<AccountSummary> {
    const account = (await this.overview()).accounts.find(
      (candidate) => candidate.id === id,
    );
    if (account === undefined) throw new CalendarNotFound(`Account ${id}`);
    return account;
  }

  private async calendar(id: number): Promise<CalendarRow> {
    const row = await this.db
      .select()
      .from(calendars)
      .where(eq(calendars.id, id))
      .get();
    if (row === undefined) throw new CalendarNotFound(`Calendar ${id}`);
    return row;
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }
}

function toSummary(row: CalendarRow): CalendarSummary {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    color: row.color,
    visible: row.visible,
    writable: row.writable,
    isDefault: row.isDefault,
  };
}

function toEvent(row: typeof calendarEvents.$inferSelect): CalendarEvent {
  return {
    id: row.id,
    calendarId: row.calendarId,
    title: row.title,
    location: row.location,
    notes: row.notes,
    allDay: row.allDay,
    start: row.start,
    end: row.end,
    url: row.url,
    todoId: row.todoId,
  };
}
