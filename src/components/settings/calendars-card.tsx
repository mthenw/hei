"use client";

import { CalendarDaysIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { CalendarOverview } from "@/calendar/calendars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ContactsStatus } from "@/contacts/contacts";
import {
  addIcsCalendar,
  getCalendarOverview,
  getContactsStatus,
  removeCalendarAccount,
  syncCalendars,
  syncContacts,
} from "@/lib/chat-api";

/** Calendar accounts and their contacts: what's connected, a form for an ICS link, and disconnecting. */
export function CalendarsCard() {
  const [overview, setOverview] = useState<CalendarOverview>();
  const [contacts, setContacts] = useState<ContactsStatus>();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const refresh = useCallback(() => {
    const failed = (cause: unknown) =>
      setError(cause instanceof Error ? cause.message : String(cause));
    getCalendarOverview().then(setOverview, failed);
    getContactsStatus().then(setContacts, failed);
  }, []);
  useEffect(refresh, [refresh]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addLink(event: FormEvent) {
    event.preventDefault();
    if (await run(() => addIcsCalendar(name, url))) {
      setName("");
      setUrl("");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calendars and contacts</CardTitle>
        <CardDescription>
          Calendars Hei shows and plans with, and the people you can @mention.
          Google calendars sync every 2 minutes, and Hei can change them once
          you approve; contacts sync every 10 minutes. An ICS link is read only
          and checked every 15 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {overview && overview.accounts.length > 0 && (
          <ul className="flex flex-col divide-y rounded-lg border">
            {overview.accounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center gap-3 px-3 py-2"
              >
                <CalendarDaysIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{account.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {account.error ??
                      `${account.calendars.length} ${account.calendars.length === 1 ? "calendar" : "calendars"}`}
                  </span>
                  {account.provider === "google" && (
                    <ContactsLine
                      status={contacts?.accounts.find(
                        (entry) => entry.accountId === account.id,
                      )}
                    />
                  )}
                </div>
                {account.provider === "google" && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        Promise.all([syncCalendars(), syncContacts()]),
                      )
                    }
                  >
                    <RefreshCwIcon />
                    <span className="sr-only">Sync {account.name} now</span>
                  </Button>
                )}
                <Badge variant="secondary">
                  {account.provider === "ics" ? "ICS link" : "Google"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy}
                  onClick={() =>
                    void run(() => removeCalendarAccount(account.id))
                  }
                >
                  <Trash2Icon />
                  <span className="sr-only">Disconnect {account.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <GoogleConnect overview={overview} />
        <form onSubmit={addLink}>
          <FieldGroup>
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <Field>
                <FieldLabel htmlFor="ics-name">Name</FieldLabel>
                <Input
                  id="ics-name"
                  value={name}
                  placeholder="Work"
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ics-url">ICS address</FieldLabel>
                <Input
                  id="ics-url"
                  value={url}
                  placeholder="https://…/basic.ics"
                  onChange={(event) => setUrl(event.target.value)}
                />
              </Field>
            </div>
            <FieldDescription>
              In Google Calendar: Settings → the calendar → “Secret address in
              iCal format”. Outlook: Publish calendar → ICS.
            </FieldDescription>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-fit"
              disabled={busy || name.trim() === "" || url.trim() === ""}
            >
              Add ICS link
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function GoogleConnect({
  overview,
}: {
  overview: CalendarOverview | undefined;
}) {
  if (overview === undefined) return null;
  if (!overview.googleConfigured)
    return (
      <p className="text-sm text-muted-foreground">
        To connect Google, add{" "}
        <code className="font-mono">GOOGLE_OAUTH_CLIENT_ID</code> and{" "}
        <code className="font-mono">GOOGLE_OAUTH_CLIENT_SECRET</code> to .env
        and restart Hei. The calendar spec’s Setup says how to create them.
      </p>
    );
  const local = onLocalhost();
  const ready = overview.secretConfigured && local;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {ready ? (
        <Button asChild>
          <a href="/api/calendar/google/start">Connect Google</a>
        </Button>
      ) : (
        <Button disabled>Connect Google</Button>
      )}
      {!local && (
        <span className="text-xs text-muted-foreground">
          Open Hei at localhost on the computer running it to sign in to Google.
        </span>
      )}
      {!overview.secretConfigured && (
        <span className="text-xs text-muted-foreground">
          Set HEI_SECRET first.
        </span>
      )}
    </div>
  );
}

/** A Google account's contacts: how many, what went wrong, or a way to allow them. */
function ContactsLine({
  status,
}: {
  status: ContactsStatus["accounts"][number] | undefined;
}) {
  if (status === undefined) return null;
  if (!status.allowed)
    return (
      <span className="truncate text-xs text-muted-foreground">
        Contacts not allowed ·{" "}
        {onLocalhost() ? (
          <a
            href={`/api/calendar/google/start?${new URLSearchParams({ account: status.email, back: "settings" })}`}
            className="text-primary hover:underline"
          >
            Allow contacts
          </a>
        ) : (
          "open Hei at localhost to allow them"
        )}
      </span>
    );
  if (status.error)
    return <span className="text-xs text-destructive">{status.error}</span>;
  if (status.syncedAt === null)
    return (
      <span className="truncate text-xs text-muted-foreground">
        Contacts syncing…
      </span>
    );
  const count = status.saved + status.other;
  return (
    <span className="truncate text-xs text-muted-foreground">
      {count.toLocaleString("en-GB")} {count === 1 ? "contact" : "contacts"}
      {status.other > 0 &&
        ` (${status.other.toLocaleString("en-GB")} from Gmail)`}
    </span>
  );
}

// Google only sends sign-ins back to localhost (or HTTPS), so signing in must happen on the machine running Hei.
function onLocalhost(): boolean {
  return (
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  );
}
