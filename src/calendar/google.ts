import { createHash, randomBytes } from "node:crypto";
import {
  type CalendarSource,
  type SourceCalendar,
  SourceError,
  type SourceEvent,
  SYNC_PAST_DAYS,
  type SyncResult,
  SyncTokenExpired,
} from "./source";

/** Read and change events; list calendars; know which account signed in. */
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const DAY = 86_400_000;

export type GoogleClient = { clientId: string; clientSecret: string };

/** What Hei keeps of a Google sign-in, sealed: the long-lived token, and whose it is. */
export type GoogleGrant = { refreshToken: string; email: string };

export type AccessToken = { accessToken: string; expiresAt: number };

/** Sign in with Google: the consent address, and turning its code (or a refresh token) into tokens. */
export class GoogleOAuth {
  private readonly fetch: typeof fetch;

  constructor(
    private readonly client: GoogleClient,
    options: { fetch?: typeof fetch; now?: () => number } = {},
  ) {
    this.fetch = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  private readonly now: () => number;

  /** A consent address, and the verifier to finish with. `prompt=consent` makes Google hand out a refresh token. */
  begin(redirectUri: string): { url: string; state: string; verifier: string } {
    const state = randomBytes(16).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({
      client_id: this.client.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return { url: url.toString(), state, verifier };
  }

  /** Trade the code Google sent back for tokens, and read whose account it is. */
  async finish(
    code: string,
    verifier: string,
    redirectUri: string,
  ): Promise<GoogleGrant & AccessToken> {
    const body = await this.token({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });
    if (typeof body.refresh_token !== "string")
      throw new SourceError(
        "Google gave no refresh token. Remove Hei's access at myaccount.google.com/permissions and connect again.",
      );
    const missing = GOOGLE_SCOPES.filter(
      (scope) =>
        scope.startsWith("https://") &&
        !String(body.scope ?? "").includes(scope),
    );
    if (missing.length > 0)
      throw new SourceError(
        "Hei needs to see and change your calendar events and list your calendars. Connect again and allow both.",
      );
    return {
      refreshToken: body.refresh_token,
      email: emailOf(String(body.id_token ?? "")),
      ...this.access(body),
    };
  }

  async refresh(refreshToken: string): Promise<AccessToken> {
    return this.access(
      await this.token({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    );
  }

  private access(body: TokenBody): AccessToken {
    if (typeof body.access_token !== "string")
      throw new SourceError("Google answered without an access token.");
    return {
      accessToken: body.access_token,
      expiresAt: this.now() + Number(body.expires_in ?? 3600) * 1000,
    };
  }

  private async token(fields: Record<string, string>): Promise<TokenBody> {
    const response = await this.fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.client.clientId,
        client_secret: this.client.clientSecret,
        ...fields,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as TokenBody;
    if (response.ok) return body;
    if (body.error === "invalid_grant")
      throw new SourceError(
        "The Google sign-in has expired or was revoked. Connect Google again in Settings → Connections.",
      );
    throw new SourceError(
      `Google refused the sign-in (${body.error ?? response.status}${body.error_description ? `: ${body.error_description}` : ""}).`,
    );
  }
}

type TokenBody = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

/** The address in an ID token Google just issued to Hei over TLS; its signature needs no checking here. */
function emailOf(idToken: string): string {
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { email?: string };
    if (payload.email) return payload.email;
  } catch {
    // Fall through.
  }
  throw new SourceError("Google didn't say which account signed in.");
}

/** A new event, or the new times for one. Times are instants (ISO); all-day ones are dates with an exclusive end. */
export type EventDraft = {
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  location?: string | null;
  notes?: string | null;
  todoId?: number | null;
};

/** A Google account's calendars through the Calendar API, with writes for Hei's approved plans. */
export class GoogleSource implements CalendarSource {
  private readonly fetch: typeof fetch;
  private readonly now: () => number;

  constructor(
    private readonly options: {
      /** A current access token; called again after a 401. */
      accessToken: (refresh?: boolean) => Promise<string>;
      fetch?: typeof fetch;
      now?: () => number;
    },
  ) {
    this.fetch = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async calendars(): Promise<SourceCalendar[]> {
    const items = await this.pages<GoogleCalendarEntry>(
      "/users/me/calendarList",
      { minAccessRole: "reader" },
    );
    return items.items
      .filter((entry) => !entry.deleted)
      .map((entry) => ({
        externalId: entry.id,
        name: entry.summaryOverride ?? entry.summary ?? entry.id,
        writable: entry.accessRole === "owner" || entry.accessRole === "writer",
        primary: entry.primary === true,
      }));
  }

  async sync(calendar: {
    externalId: string;
    syncToken: string | null;
  }): Promise<SyncResult> {
    // The same parameters every time, as incremental sync requires; deleted events always come along with a token.
    const query: Record<string, string> = {
      singleEvents: "true",
      showDeleted: "true",
      maxResults: "2500",
    };
    if (calendar.syncToken) query.syncToken = calendar.syncToken;
    else
      query.timeMin = new Date(this.now() - SYNC_PAST_DAYS * DAY).toISOString();
    const { items, nextSyncToken } = await this.pages<GoogleEvent>(
      `/calendars/${encodeURIComponent(calendar.externalId)}/events`,
      query,
    );
    const live = items.filter((item) => item.status !== "cancelled");
    if (calendar.syncToken === null)
      return {
        full: true,
        events: live.map(toSourceEvent),
        syncToken: nextSyncToken ?? null,
      };
    return {
      full: false,
      changed: live.map(toSourceEvent),
      deleted: items
        .filter((item) => item.status === "cancelled")
        .map((item) => item.id),
      syncToken: nextSyncToken ?? calendar.syncToken,
    };
  }

  async create(calendarId: string, draft: EventDraft): Promise<SourceEvent> {
    return toSourceEvent(
      await this.request<GoogleEvent>(
        "POST",
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        toGoogle(draft),
      ),
    );
  }

  /** Change an event's fields (an occurrence of a repeating one changes alone). */
  async update(
    calendarId: string,
    eventId: string,
    draft: Partial<EventDraft>,
  ): Promise<SourceEvent> {
    return toSourceEvent(
      await this.request<GoogleEvent>(
        "PATCH",
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        toGoogle(draft),
      ),
    );
  }

  async remove(calendarId: string, eventId: string): Promise<void> {
    await this.request(
      "DELETE",
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
  }

  /** Every page of a list, and the sync token from its last page. */
  private async pages<T>(
    path: string,
    query: Record<string, string>,
  ): Promise<{ items: T[]; nextSyncToken?: string }> {
    const items: T[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 100; page++) {
      const body = await this.request<{
        items?: T[];
        nextPageToken?: string;
        nextSyncToken?: string;
      }>(
        "GET",
        `${path}?${new URLSearchParams({ ...query, ...(pageToken ? { pageToken } : {}) })}`,
      );
      items.push(...(body.items ?? []));
      if (!body.nextPageToken)
        return { items, nextSyncToken: body.nextSyncToken };
      pageToken = body.nextPageToken;
    }
    throw new SourceError("Google kept returning more pages; try again later.");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    for (const retry of [false, true]) {
      const response = await this.fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await this.options.accessToken(retry)}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 401 && !retry) continue;
      if (response.status === 410) throw new SyncTokenExpired();
      if (response.status === 204) return undefined as T;
      const json = (await response.json().catch(() => ({}))) as T & {
        error?: { message?: string };
      };
      if (response.ok) return json;
      if (response.status === 404)
        throw new SourceError(
          "Google can't find that calendar or event any more.",
        );
      if (response.status === 403 || response.status === 429)
        throw new SourceError(
          `Google refused: ${json.error?.message ?? "rate limit or missing permission"}.`,
        );
      throw new SourceError(
        `Google answered ${response.status}${json.error?.message ? `: ${json.error.message}` : ""}.`,
      );
    }
    throw new SourceError(
      "Google refused the sign-in. Connect Google again in Settings → Connections.",
    );
  }
}

type GoogleCalendarEntry = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  accessRole?: "freeBusyReader" | "reader" | "writer" | "owner";
  deleted?: boolean;
};

type GoogleTime = {
  date?: string | null;
  dateTime?: string | null;
  timeZone?: string;
};

type GoogleEvent = {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  start?: GoogleTime;
  end?: GoogleTime;
  extendedProperties?: { private?: Record<string, string> };
};

function toSourceEvent(event: GoogleEvent): SourceEvent {
  // A real date makes it all-day; Google may echo `date: null` beside a dateTime.
  const allDay = typeof event.start?.date === "string";
  const start = allDay
    ? (event.start?.date ?? "")
    : new Date(event.start?.dateTime ?? 0).toISOString();
  const end = allDay
    ? (event.end?.date ?? start)
    : new Date(event.end?.dateTime ?? event.start?.dateTime ?? 0).toISOString();
  const todo = Number(event.extendedProperties?.private?.heiTodoId);
  return {
    externalId: event.id,
    title: event.summary?.trim() || "(No title)",
    location: event.location?.trim() || null,
    notes: event.description
      ? plainText(event.description).slice(0, 2_000) || null
      : null,
    allDay,
    start,
    end,
    url: event.htmlLink ?? null,
    todoId: Number.isSafeInteger(todo) && todo > 0 ? todo : null,
  };
}

function toGoogle(draft: Partial<EventDraft>): Record<string, unknown> {
  const time = (value: string) =>
    draft.allDay
      ? { date: value, dateTime: null }
      : { dateTime: value, date: null };
  return {
    ...(draft.title !== undefined ? { summary: draft.title } : {}),
    ...(draft.start !== undefined ? { start: time(draft.start) } : {}),
    ...(draft.end !== undefined ? { end: time(draft.end) } : {}),
    ...(draft.location !== undefined ? { location: draft.location ?? "" } : {}),
    ...(draft.notes !== undefined ? { description: draft.notes ?? "" } : {}),
    ...(draft.todoId
      ? { extendedProperties: { private: { heiTodoId: String(draft.todoId) } } }
      : {}),
  };
}

/** Google descriptions may carry HTML; Hei shows text. */
function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
