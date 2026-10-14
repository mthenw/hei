import { SourceError, SyncTokenExpired } from "@/calendar/source";

const API = "https://people.googleapis.com/v1";
const PAGE_SIZE = "1000";
/** Plenty for an address book; a list that never ends is Google's problem, not a reason to loop. */
const MAX_PAGES = 100;

/** A Google account's two contact lists: the address book, and the people Gmail keeps from mail ("other contacts"). */
export type ContactList = "saved" | "other";

/** A person as Hei keeps them. */
export type SourceContact = {
  resourceName: string;
  name: string;
  emails: string[];
  phones: string[];
  organization: string | null;
};

export type ContactSyncResult =
  | { full: true; contacts: SourceContact[]; syncToken: string | null }
  | {
      full: false;
      changed: SourceContact[];
      /** Resource names of people removed since the last sync. */
      deleted: string[];
      syncToken: string;
    };

/** Read a Google account's contacts through the People API, a full list first and then only what changed. */
export class GooglePeople {
  private readonly fetch: typeof fetch;

  constructor(
    private readonly options: {
      /** A current access token; called again after a 401. */
      accessToken: (refresh?: boolean) => Promise<string>;
      fetch?: typeof fetch;
    },
  ) {
    this.fetch = options.fetch ?? fetch;
  }

  async sync(
    list: ContactList,
    syncToken: string | null,
  ): Promise<ContactSyncResult> {
    // The same parameters every time, as incremental sync requires.
    const [path, query, field]: [string, Record<string, string>, string] =
      list === "saved"
        ? [
            "/people/me/connections",
            {
              personFields: "names,emailAddresses,phoneNumbers,organizations",
            },
            "connections",
          ]
        : [
            "/otherContacts",
            { readMask: "names,emailAddresses,phoneNumbers" },
            "otherContacts",
          ];
    const people: GooglePerson[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const body = await this.request(path, {
        ...query,
        pageSize: PAGE_SIZE,
        requestSyncToken: "true",
        ...(syncToken ? { syncToken } : {}),
        ...(pageToken ? { pageToken } : {}),
      });
      people.push(...((body[field] as GooglePerson[] | undefined) ?? []));
      nextSyncToken = (body.nextSyncToken as string | undefined) ?? undefined;
      pageToken = (body.nextPageToken as string | undefined) ?? undefined;
      if (pageToken === undefined) break;
    }
    if (pageToken !== undefined)
      throw new SourceError(
        "Google kept returning more contacts; try again later.",
      );

    const live = people.filter((person) => !person.metadata?.deleted);
    if (syncToken === null)
      return {
        full: true,
        contacts: live.flatMap(toContact),
        syncToken: nextSyncToken ?? null,
      };
    return {
      full: false,
      changed: live.flatMap(toContact),
      deleted: people
        .filter((person) => person.metadata?.deleted)
        .map((person) => person.resourceName),
      syncToken: nextSyncToken ?? syncToken,
    };
  }

  private async request(
    path: string,
    query: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const url = `${API}${path}?${new URLSearchParams(query)}`;
    for (const retry of [false, true]) {
      const response = await this.fetch(url, {
        headers: {
          Authorization: `Bearer ${await this.options.accessToken(retry)}`,
        },
      });
      if (response.status === 401 && !retry) continue;
      const text = await response.text();
      if (response.ok) return JSON.parse(text) as Record<string, unknown>;
      throw problem(response.status, text);
    }
    throw new SourceError(
      "Google refused the sign-in. Connect Google again in Settings → Connections.",
    );
  }
}

/** Google's error as something the user can act on. */
function problem(status: number, text: string): Error {
  // Sync tokens last a week; then Google wants a full sync.
  if (text.includes("EXPIRED_SYNC_TOKEN")) return new SyncTokenExpired();
  if (text.includes("SERVICE_DISABLED") || text.includes("has not been used"))
    return new SourceError(
      "The People API is off in your Google Cloud project. Turn it on (APIs & Services → Library → People API), then sync again.",
    );
  if (text.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT"))
    return new SourceError(
      "Hei isn't allowed to read these contacts. Connect Google again and allow contacts.",
    );
  if (status === 429)
    return new SourceError(
      "Google is limiting contact syncs for now; Hei tries again later.",
    );
  let message: string | undefined;
  try {
    message = (JSON.parse(text) as { error?: { message?: string } }).error
      ?.message;
  } catch {
    // Not JSON.
  }
  return new SourceError(
    `Google Contacts answered ${status}${message ? `: ${message}` : ""}.`,
  );
}

type GoogleField<T> = T & { metadata?: { primary?: boolean } };

type GooglePerson = {
  resourceName: string;
  metadata?: { deleted?: boolean };
  names?: GoogleField<{ displayName?: string }>[];
  emailAddresses?: GoogleField<{ value?: string }>[];
  phoneNumbers?: GoogleField<{ value?: string; canonicalForm?: string }>[];
  organizations?: GoogleField<{ name?: string; title?: string }>[];
};

/** A person with a name or an address; Gmail's other contacts with neither are no use for mentions. */
function toContact(person: GooglePerson): SourceContact[] {
  const emails = values(person.emailAddresses, (email) => email.value?.trim());
  const name =
    primaryFirst(person.names ?? [])
      .map((entry) => entry.displayName?.trim())
      .find(Boolean) ?? emails[0];
  if (!name) return [];
  const organization = primaryFirst(person.organizations ?? [])
    .map((entry) =>
      [entry.title?.trim(), entry.name?.trim()].filter(Boolean).join(", "),
    )
    .find(Boolean);
  return [
    {
      resourceName: person.resourceName,
      name,
      emails,
      phones: values(person.phoneNumbers, (phone) => phone.value?.trim()),
      organization: organization ?? null,
    },
  ];
}

/** The non-empty values, primary first, each once. */
function values<T>(
  entries: GoogleField<T>[] | undefined,
  read: (entry: T) => string | undefined,
): string[] {
  return [
    ...new Set(
      primaryFirst(entries ?? [])
        .map(read)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

function primaryFirst<T>(entries: GoogleField<T>[]): GoogleField<T>[] {
  return [...entries].sort(
    (a, b) =>
      Number(b.metadata?.primary === true) -
      Number(a.metadata?.primary === true),
  );
}
