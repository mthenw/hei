# Parked decisions

Work deliberately left out of [v1](./v1-spec.md). Each section records where the thinking already leans and the questions to settle before building it. Grill each one before its version starts.

## Calendar — built

See [calendar-spec.md](./calendar-spec.md). Still open:
- Microsoft 365 / Outlook (own Entra app) and iCloud / CalDAV (`tsdav`, app-specific passwords).
- time.fyi's extras: travel mode, extra time zones, the person overlay, busy-blocking across calendars, booking links.
- Low-risk changes (private holds) applying without a plan card.
- Push notifications for upcoming events; Google push channels need public HTTPS.

## Todos and hand-off — built

Built ahead of the calendar; see [todos-spec.md](./todos-spec.md). Still open:
- Dragging todos onto the calendar to block time (needs v2).
- Push notifications when an agent needs you or is ready: Web Push, which on iOS requires a home-screen-installed PWA over HTTPS.
- Tools that act outside Hei (send, book, buy) and the approval they need before agents get them.
- Recurring todos, reminders, lists or projects.
- A "running agents" panel; for now each todo shows its agent's status.

## Contacts and mentions — built

See [contacts-spec.md](./contacts-spec.md). Still open:
- iCloud contacts (CardDAV, app-specific password) and Microsoft 365, merged with Google's.
- Gmail drafts through the API, and sending after an approval card, like calendar plans.
- Mentions in the calendar's event details, and a contact's details on hover.

## Later

- **Interactive browsing** — a cloud browser with saved logins driven over CDP with `playwright-core`. Kernel leads ($5/month free credit, idle time free, profiles, managed auth); Browser Use is cheapest per hour (turn off its default residential proxy); Browserbase has the most mature tooling. Anthropic's `browser_toolset_20260801` is Claude-only, so the tool surface must stay provider-agnostic ([ADR 0003](./adr/0003-own-web-tools.md)).
- **WhatsApp channel** — another route handler/client against the same Harness ([ADR 0001](./adr/0001-agent-in-nextjs-process.md)).
- **Automatic memory** — Hei writing durable facts about the user, beyond the manual profile.
- **Network exposure and auth** — leaning Tailscale plus a single passphrase session cookie.
- **Synology deployment** — DS923+ (x86, 4 GB), Node 24 image, `bun install` inside the target image, SQLite on a local volume (not SMB/NFS).
- **Chat extras** — attachments, edit-and-branch, sidebar search and pinning, cost/usage display, proactive rate-limit watching from response headers.
