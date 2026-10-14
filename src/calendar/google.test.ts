import { describe, expect, it, vi } from "vitest";
import { openAppDatabase } from "@/db/database";
import { SecretBox } from "@/lib/secret-box";
import { Calendars, InvalidCalendar } from "./calendars";
import { GOOGLE_SCOPES, GoogleOAuth, GoogleSource } from "./google";
import { SyncTokenExpired } from "./source";

const CLIENT = { clientId: "client-id", clientSecret: "client-secret" };
const NOW = Date.UTC(2026, 9, 13, 12, 0);

/** A fake Google: answers by path, and records each request. */
function fakeGoogle(
  answer: (
    url: URL,
    init: RequestInit | undefined,
  ) => { status?: number; body?: unknown },
) {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const { status = 200, body = {} } = answer(url, init);
    return status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(body), { status });
  });
  return { fetch, calls };
}

function idToken(email: string): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part({ email })}.signature`;
}

const GRANTED = {
  access_token: "access-1",
  expires_in: 3600,
  refresh_token: "refresh-1",
  id_token: idToken("me@example.com"),
  scope: GOOGLE_SCOPES.join(" "),
};

describe("GoogleOAuth", () => {
  it("asks for offline access with PKCE, and reads the account from the ID token", async () => {
    const { fetch, calls } = fakeGoogle(() => ({ body: GRANTED }));
    const oauth = new GoogleOAuth(CLIENT, { fetch, now: () => NOW });

    const begun = oauth.begin(
      "http://localhost:3000/api/calendar/google/callback",
      "me@example.com",
    );
    const params = new URL(begun.url).searchParams;
    expect(params.get("access_type")).toBe("offline");
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("state")).toBe(begun.state);
    expect(params.get("scope")).toContain("calendar.events");
    expect(params.get("scope")).toContain("contacts.other.readonly");
    expect(params.get("login_hint")).toBe("me@example.com");

    const grant = await oauth.finish(
      "code-1",
      begun.verifier,
      "http://localhost:3000/api/calendar/google/callback",
    );

    expect(grant).toEqual({
      refreshToken: "refresh-1",
      email: "me@example.com",
      accessToken: "access-1",
      expiresAt: NOW + 3_600_000,
      scopes: GOOGLE_SCOPES.join(" "),
    });
    const sent = new URLSearchParams(String(calls[0].init?.body));
    expect(sent.get("code_verifier")).toBe(begun.verifier);
    expect(sent.get("client_secret")).toBe("client-secret");
  });

  it("takes a sign-in that left the contacts out", async () => {
    const calendarOnly = GOOGLE_SCOPES.filter(
      (scope) => !scope.includes("contacts"),
    ).join(" ");
    const { fetch } = fakeGoogle(() => ({
      body: { ...GRANTED, scope: calendarOnly },
    }));
    const oauth = new GoogleOAuth(CLIENT, { fetch });

    expect(await oauth.finish("code", "verifier", "http://x")).toMatchObject({
      scopes: calendarOnly,
    });
  });

  it("refuses a sign-in that didn't allow the calendar scopes", async () => {
    const { fetch } = fakeGoogle(() => ({
      body: { ...GRANTED, scope: "openid email" },
    }));
    const oauth = new GoogleOAuth(CLIENT, { fetch });

    await expect(oauth.finish("code", "verifier", "http://x")).rejects.toThrow(
      /calendar events/,
    );
  });
});

describe("GoogleSource", () => {
  it("lists calendars with whether Hei may write to them", async () => {
    const { fetch } = fakeGoogle(() => ({
      body: {
        items: [
          {
            id: "me@example.com",
            summary: "Me",
            primary: true,
            accessRole: "owner",
          },
          {
            id: "team",
            summary: "Team",
            summaryOverride: "Team (shared)",
            accessRole: "reader",
          },
          { id: "gone", summary: "Gone", accessRole: "owner", deleted: true },
        ],
      },
    }));
    const source = new GoogleSource({
      accessToken: async () => "token",
      fetch,
    });

    expect(await source.calendars()).toEqual([
      {
        externalId: "me@example.com",
        name: "Me",
        writable: true,
        primary: true,
      },
      {
        externalId: "team",
        name: "Team (shared)",
        writable: false,
        primary: false,
      },
    ]);
  });

  it("syncs in full from 60 days back, then incrementally with the token", async () => {
    const { fetch, calls } = fakeGoogle((url) =>
      url.searchParams.has("syncToken")
        ? {
            body: {
              items: [
                {
                  id: "a",
                  status: "confirmed",
                  summary: "A, renamed",
                  start: { dateTime: "2026-10-14T10:00:00+02:00" },
                  end: { dateTime: "2026-10-14T11:00:00+02:00" },
                },
                { id: "b", status: "cancelled" },
              ],
              nextSyncToken: "t2",
            },
          }
        : url.searchParams.has("pageToken")
          ? {
              body: {
                items: [{ id: "c", status: "cancelled" }],
                nextSyncToken: "t1",
              },
            }
          : {
              body: {
                items: [
                  {
                    id: "a",
                    status: "confirmed",
                    summary: "A",
                    start: { dateTime: "2026-10-14T10:00:00+02:00" },
                    end: { dateTime: "2026-10-14T11:00:00+02:00" },
                    htmlLink: "https://calendar.google.com/a",
                    extendedProperties: { private: { heiTodoId: "7" } },
                  },
                  {
                    id: "b",
                    summary: "Holiday",
                    start: { date: "2026-11-01" },
                    end: { date: "2026-11-02" },
                    description: "<p>Day <b>off</b></p>",
                  },
                ],
                nextPageToken: "page-2",
              },
            },
    );
    const source = new GoogleSource({
      accessToken: async () => "token",
      fetch,
      now: () => NOW,
    });

    const full = await source.sync({
      externalId: "me@example.com",
      syncToken: null,
    });
    expect(full).toEqual({
      full: true,
      syncToken: "t1",
      events: [
        expect.objectContaining({
          externalId: "a",
          title: "A",
          start: "2026-10-14T08:00:00.000Z",
          allDay: false,
          url: "https://calendar.google.com/a",
          todoId: 7,
        }),
        expect.objectContaining({
          externalId: "b",
          title: "Holiday",
          start: "2026-11-01",
          end: "2026-11-02",
          allDay: true,
          notes: "Day off",
        }),
      ],
    });
    expect(calls[0].url.searchParams.get("timeMin")).toBe(
      new Date(NOW - 60 * 86_400_000).toISOString(),
    );
    expect(calls[0].url.searchParams.get("singleEvents")).toBe("true");

    const changes = await source.sync({
      externalId: "me@example.com",
      syncToken: "t1",
    });
    expect(changes).toEqual({
      full: false,
      changed: [
        expect.objectContaining({ externalId: "a", title: "A, renamed" }),
      ],
      deleted: ["b"],
      syncToken: "t2",
    });
    expect(calls.at(-1)?.url.searchParams.has("timeMin")).toBe(false);
  });

  it("reports an expired sync token, and retries once with a fresh access token", async () => {
    let refused = true;
    const { fetch } = fakeGoogle(() => {
      if (refused) {
        refused = false;
        return { status: 401 };
      }
      return { status: 410 };
    });
    const accessToken = vi.fn(async (refresh?: boolean) =>
      refresh ? "fresh" : "stale",
    );
    const source = new GoogleSource({ accessToken, fetch });

    await expect(
      source.sync({ externalId: "x", syncToken: "old" }),
    ).rejects.toBeInstanceOf(SyncTokenExpired);
    expect(accessToken.mock.calls).toEqual([[false], [true]]);
  });

  it("creates, moves and deletes events, linking a time block to its todo", async () => {
    const { fetch, calls } = fakeGoogle((_url, init) =>
      init?.method === "DELETE"
        ? { status: 204 }
        : {
            body: {
              id: "new",
              summary: "Focus",
              start: { dateTime: "2026-10-14T08:00:00Z" },
              end: { dateTime: "2026-10-14T08:30:00Z" },
            },
          },
    );
    const source = new GoogleSource({
      accessToken: async () => "token",
      fetch,
    });

    await source.create("me@example.com", {
      title: "Focus",
      allDay: false,
      start: "2026-10-14T08:00:00.000Z",
      end: "2026-10-14T08:30:00.000Z",
      todoId: 7,
    });
    await source.update("me@example.com", "new", {
      start: "2026-10-14T09:00:00.000Z",
      end: "2026-10-14T09:30:00.000Z",
      allDay: false,
    });
    await source.remove("me@example.com", "new");

    expect(calls.map((call) => [call.init?.method, call.url.pathname])).toEqual(
      [
        ["POST", "/calendar/v3/calendars/me%40example.com/events"],
        ["PATCH", "/calendar/v3/calendars/me%40example.com/events/new"],
        ["DELETE", "/calendar/v3/calendars/me%40example.com/events/new"],
      ],
    );
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      summary: "Focus",
      start: { dateTime: "2026-10-14T08:00:00.000Z" },
      extendedProperties: { private: { heiTodoId: "7" } },
    });
  });
});

describe("Calendars with Google", () => {
  it("connects an account, lists its calendars and syncs them", async () => {
    const { fetch } = fakeGoogle((url) => {
      if (url.hostname === "oauth2.googleapis.com") return { body: GRANTED };
      if (url.pathname.endsWith("/calendarList"))
        return {
          body: {
            items: [
              {
                id: "me@example.com",
                summary: "Me",
                primary: true,
                accessRole: "owner",
              },
            ],
          },
        };
      return {
        body: {
          items: [
            {
              id: "a",
              summary: "Standup",
              start: { dateTime: "2026-10-14T07:15:00Z" },
              end: { dateTime: "2026-10-14T07:30:00Z" },
            },
          ],
          nextSyncToken: "t1",
        },
      };
    });
    const calendars = new Calendars(await openAppDatabase(":memory:"), {
      box: new SecretBox("a test secret that is long enough", "calendars"),
      timeZone: () => "Europe/Warsaw",
      google: CLIENT,
      fetch,
      now: () => NOW,
    });

    const consent = new URL(
      calendars.beginGoogleSignIn(
        "http://localhost:3000/api/calendar/google/callback",
      ),
    );
    await expect(
      calendars.finishGoogleSignIn("forged", "code"),
    ).rejects.toSatisfy(InvalidCalendar.is);
    const account = await calendars.finishGoogleSignIn(
      consent.searchParams.get("state") ?? "",
      "code",
    );

    expect(account).toMatchObject({
      provider: "google",
      name: "me@example.com",
      error: null,
      calendars: [{ name: "Me", writable: true, isDefault: true }],
    });
    expect(
      (
        await calendars.events(Date.UTC(2026, 9, 14), Date.UTC(2026, 9, 15))
      ).map((e) => e.title),
    ).toEqual(["Standup"]);
  });
});
