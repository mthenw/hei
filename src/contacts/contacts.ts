import { and, asc, count, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { GoogleAccount } from "@/calendar/calendars";
import { CONTACTS_SCOPE, OTHER_CONTACTS_SCOPE } from "@/calendar/google";
import { isSyncTokenExpired } from "@/calendar/source";
import type { AppDatabase } from "@/db/database";
import { type ContactRow, contactSyncs, contacts } from "@/db/schema";
import {
  type ContactList,
  type ContactSyncResult,
  GooglePeople,
  type SourceContact,
} from "./google-people";

const MINUTE = 60_000;
/** How often contacts sync in the background; they change far less often than calendars. */
const SYNC_EVERY = 10 * MINUTE;
/** Rows per insert: SQLite limits how many values one statement may carry. */
const CHUNK = 50;
/** Matches a search looks through before ranking. */
const SEARCH_POOL = 200;

const LIST_SCOPES: Record<ContactList, string> = {
  saved: CONTACTS_SCOPE,
  other: OTHER_CONTACTS_SCOPE,
};

export type Contact = {
  id: number;
  name: string;
  emails: string[];
  phones: string[];
  organization: string | null;
  /** In the address book, rather than one of Gmail's other contacts. */
  saved: boolean;
};

/** How each Google account's contacts are doing, for Settings. */
export type ContactsStatus = {
  accounts: {
    accountId: number;
    email: string;
    /** The sign-in lets Hei read the contacts; otherwise the user connects Google again. */
    allowed: boolean;
    saved: number;
    other: number;
    syncedAt: number | null;
    error: string | null;
  }[];
};

/** What Contacts needs from the Google sign-in, which Calendars owns. */
export type GoogleAccess = {
  googleAccounts(): Promise<GoogleAccount[]>;
  googleAccessToken(accountId: number, refresh?: boolean): Promise<string>;
};

export type ContactsOptions = {
  google: GoogleAccess;
  /** For calling Google; tests replace it. */
  fetch?: typeof fetch;
  now?: () => number;
};

/**
 * The user's contacts: a synced copy of each Google account's address book and other contacts, searched for mentions
 * and by Hei's tools.
 */
export class Contacts {
  private readonly now: () => number;
  /** Syncs run one at a time. */
  private syncing: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly db: AppDatabase,
    private readonly options: ContactsOptions,
  ) {
    this.now = options.now ?? Date.now;
  }

  /** Sync in the background: every minute, the lists that are due. */
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

  async status(): Promise<ContactsStatus> {
    const [accounts, syncs, counts] = await Promise.all([
      this.options.google.googleAccounts(),
      this.db.select().from(contactSyncs),
      this.db
        .select({
          accountId: contacts.accountId,
          saved: contacts.saved,
          count: count(),
        })
        .from(contacts)
        .groupBy(contacts.accountId, contacts.saved),
    ]);
    return {
      accounts: accounts.map((account) => {
        const lists = syncs.filter((row) => row.accountId === account.id);
        const counted = (saved: boolean) =>
          counts.find(
            (row) => row.accountId === account.id && row.saved === saved,
          )?.count ?? 0;
        const synced = lists
          .map((row) => row.syncedAt?.getTime())
          .filter((time) => time !== undefined);
        return {
          accountId: account.id,
          email: account.email,
          allowed: account.scopes.includes(CONTACTS_SCOPE),
          saved: counted(true),
          other: counted(false),
          syncedAt: synced.length > 0 ? Math.min(...synced) : null,
          error: lists.find((row) => row.error !== null)?.error ?? null,
        };
      }),
    };
  }

  /** Sync one account's contacts, or every account's, now; resolves when done. */
  syncNow(accountId?: number): Promise<void> {
    return this.enqueue(async () => {
      for (const account of await this.options.google.googleAccounts())
        if (accountId === undefined || account.id === accountId)
          await this.syncAccount(account, () => true);
    });
  }

  /**
   * Contacts matching every word of `query` in their name, addresses or organization; names that start with it first,
   * then the address book before other contacts. An other contact with a saved contact's address is left out.
   */
  async search(query: string, limit = 8): Promise<Contact[]> {
    const words = fold(query).split(/\s+/).filter(Boolean).slice(0, 5);
    if (words.length === 0) return [];
    const rows = await this.db
      .select()
      .from(contacts)
      .where(
        and(
          ...words.map(
            (word) =>
              sql`${contacts.search} like ${`%${escapeLike(word)}%`} escape '\\'`,
          ),
          notShadowed(),
        ),
      )
      .limit(SEARCH_POOL);
    const ranked = rows
      .map((row) => ({ row, rank: rank(row, words) }))
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          Number(b.row.saved) - Number(a.row.saved) ||
          a.row.name.localeCompare(b.row.name),
      );
    return ranked.slice(0, limit).map(({ row }) => toContact(row));
  }

  /** The contacts with these ids that still exist. */
  async get(ids: number[]): Promise<Contact[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(contacts)
      .where(inArray(contacts.id, ids))
      .orderBy(asc(contacts.id));
    return rows.map(toContact);
  }

  private syncDue(): Promise<void> {
    return this.enqueue(async () => {
      const syncs = await this.db.select().from(contactSyncs);
      const now = this.now();
      for (const account of await this.options.google.googleAccounts())
        await this.syncAccount(account, (list) => {
          const last = syncs
            .find((row) => row.accountId === account.id && row.list === list)
            ?.syncedAt?.getTime();
          return last === undefined || now - last >= SYNC_EVERY;
        });
    });
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.syncing.then(work);
    this.syncing = next.catch((error: unknown) =>
      console.warn("Contact sync failed:", error),
    );
    return next;
  }

  /** Sync the lists the sign-in allows and `due` picks; drop the lists it no longer allows. */
  private async syncAccount(
    account: GoogleAccount,
    due: (list: ContactList) => boolean,
  ) {
    for (const list of ["saved", "other"] as const) {
      if (!account.scopes.includes(LIST_SCOPES[list])) {
        await this.forget(account.id, list);
        continue;
      }
      if (!due(list)) continue;
      try {
        await this.syncList(account, list);
      } catch (error) {
        await this.recordSync(account.id, list, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async syncList(account: GoogleAccount, list: ContactList) {
    const people = new GooglePeople({
      accessToken: (refresh) =>
        this.options.google.googleAccessToken(account.id, refresh),
      fetch: this.options.fetch,
    });
    const state = await this.db
      .select()
      .from(contactSyncs)
      .where(
        and(
          eq(contactSyncs.accountId, account.id),
          eq(contactSyncs.list, list),
        ),
      )
      .get();
    let result: ContactSyncResult;
    try {
      result = await people.sync(list, state?.syncToken ?? null);
    } catch (error) {
      if (!isSyncTokenExpired(error)) throw error;
      // Sync tokens last a week after a full sync: start over.
      result = await people.sync(list, null);
    }
    const saved = list === "saved";
    if (result.full) {
      const existing = await this.db
        .select({ id: contacts.id, resourceName: contacts.resourceName })
        .from(contacts)
        .where(
          and(eq(contacts.accountId, account.id), eq(contacts.saved, saved)),
        );
      const keep = new Set(
        result.contacts.map((person) => person.resourceName),
      );
      await this.remove(
        existing
          .filter((row) => !keep.has(row.resourceName))
          .map((row) => row.id),
      );
      await this.upsert(account.id, saved, result.contacts);
    } else {
      for (let index = 0; index < result.deleted.length; index += CHUNK)
        await this.db
          .delete(contacts)
          .where(
            and(
              eq(contacts.accountId, account.id),
              inArray(
                contacts.resourceName,
                result.deleted.slice(index, index + CHUNK),
              ),
            ),
          );
      await this.upsert(account.id, saved, result.changed);
    }
    await this.recordSync(account.id, list, {
      syncToken: result.syncToken,
      error: null,
    });
  }

  private async recordSync(
    accountId: number,
    list: ContactList,
    change: { syncToken?: string | null; error: string | null },
  ) {
    // A failing list waits its turn like any other, rather than retrying every minute.
    const values = { ...change, syncedAt: new Date(this.now()) };
    await this.db
      .insert(contactSyncs)
      .values({ accountId, list, ...values })
      .onConflictDoUpdate({
        target: [contactSyncs.accountId, contactSyncs.list],
        set: values,
      });
  }

  private async forget(accountId: number, list: ContactList) {
    await this.db
      .delete(contacts)
      .where(
        and(
          eq(contacts.accountId, accountId),
          eq(contacts.saved, list === "saved"),
        ),
      );
    await this.db
      .delete(contactSyncs)
      .where(
        and(eq(contactSyncs.accountId, accountId), eq(contactSyncs.list, list)),
      );
  }

  /** Insert or update by resource name, so a contact keeps its id, and the mentions of it keep working. */
  private async upsert(
    accountId: number,
    saved: boolean,
    people: SourceContact[],
  ) {
    for (let index = 0; index < people.length; index += CHUNK) {
      const rows = people.slice(index, index + CHUNK).map((person) => ({
        accountId,
        resourceName: person.resourceName,
        saved,
        name: person.name,
        email: person.emails[0]?.toLowerCase() ?? null,
        emails: JSON.stringify(person.emails),
        phones: JSON.stringify(person.phones),
        organization: person.organization,
        search: fold(
          [person.name, ...person.emails, person.organization ?? ""].join(" "),
        ),
      }));
      await this.db
        .insert(contacts)
        .values(rows)
        .onConflictDoUpdate({
          target: [contacts.accountId, contacts.resourceName],
          set: {
            saved: sql`excluded.saved`,
            name: sql`excluded.name`,
            email: sql`excluded.email`,
            emails: sql`excluded.emails`,
            phones: sql`excluded.phones`,
            organization: sql`excluded.organization`,
            search: sql`excluded.search`,
          },
        });
    }
  }

  private async remove(ids: number[]) {
    for (let index = 0; index < ids.length; index += CHUNK)
      await this.db
        .delete(contacts)
        .where(inArray(contacts.id, ids.slice(index, index + CHUNK)));
  }
}

/** An other contact whose address is also a saved contact's is the same person: the saved one stands for them. */
function notShadowed(): SQL {
  return sql`(${contacts.saved} = 1 or ${contacts.email} is null or ${contacts.email} not in (select shadow.email from contacts shadow where shadow.saved = 1 and shadow.email is not null))`;
}

/** 0 when the name starts with the query, 1 when one of its words does, 2 when the address does, 3 otherwise. */
function rank(row: ContactRow, words: string[]): number {
  const name = fold(row.name);
  if (name.startsWith(words.join(" "))) return 0;
  if (name.split(/\s+/).some((part) => part.startsWith(words[0]))) return 1;
  if (row.email?.startsWith(words[0])) return 2;
  return 3;
}

/** Lowercase without accents, so "lukasz" finds "Łukasz". */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/ø/g, "o")
    .replace(/đ/g, "d")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae");
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    emails: JSON.parse(row.emails) as string[],
    phones: JSON.parse(row.phones) as string[],
    organization: row.organization,
    saved: row.saved,
  };
}
