# Parked decisions

Work deliberately left out of [v1](./v1-spec.md). Each section records where the thinking already leans and the questions to settle before building it. Grill each one before its version starts.

## v2 — Calendar

**Leaning**
- Reference product: [time.fyi](https://time.fyi/) — day/week/month grid, keys 2–9 set day count, red now-line, pastel event chips with a 3px saturated left bar (blue `#3b7be8/#dfe9fb`, green `#2e9b5f/#dff2e6`, purple `#7a5ae0/#ebe4fb`, coral `#e8604c/#fde3dd`, amber `#d98b1a/#fbecd2`).
- "Talk to it": a ⌘I quick-ask bar over the calendar. Hei answers with a **plan card** ("Move Design review to Fri 3:00 PM · Hold 25 min travel") with Approve / Not now; nothing changes until approved; a toast offers Undo. Full chats can also use calendar tools.
- Connect each provider directly — no unified API (Nylas needs your own Google OAuth app anyway; Cronofy starts at $819/month):
  - **Google** — own OAuth client set to "In production", unverified. Personal-use apps under 100 users are exempt from verification; this avoids the 7-day refresh-token expiry of "Testing" mode.
  - **Microsoft 365 / Outlook** — own Entra app (needs a free Azure tenant), "any org + personal accounts", delegated `Calendars.ReadWrite` + `offline_access`. Refresh tokens last 90 days, rolling. Register the redirect as Web, not SPA (SPA tokens last 24h).
  - **iCloud, Fastmail, other CalDAV** — `tsdav` with app-specific passwords; parse with `ical.js`/`node-ical`.
  - **Fallback** — read-only ICS secret URLs for calendars where OAuth is blocked (e.g. locked-down work accounts).
- Sync by polling every 1–5 min with each provider's change tracking (Google `syncToken`, Graph delta, CalDAV `sync-collection`). Push webhooks need public HTTPS, which the NAS won't have.

**Open questions**
- Which calendars first, and which need write access vs read-only?
- Do all calendar changes need plan-card approval, or can low-risk ones (e.g. adding a private hold) apply directly?
- Cache events in the app DB or read through on demand?
- Which time.fyi features matter: travel mode, extra time zones, person overlay (P), cross-calendar busy-blocking, booking links?
- Default calendar for new events; colour per calendar.

## v3 — Todos and agent hand-off

**Leaning**
- Todos live in the app DB ([ADR 0002](./adr/0002-separate-app-database.md)), shown time.fyi-style (Today / Upcoming) and draggable onto the calendar to block time.
- Handing a todo to an agent creates a background pi-durable conversation for it (`createConversation({ ownership: { kind: "ownerless" } })`, or the background subagent pattern in pi-durable's example 23). `harness.taskGraph()` can drive a "running agents" panel.
- The agent conversation is a normal chat you can open, steer, or stop.

**Open questions**
- Autonomy: what may an agent do without asking (browse, draft, send, buy)? Where does approval happen — plan card, chat, notification?
- How does an agent report back: comment on the todo, mark it done, open a chat, push notification?
- Push notifications on the phone need Web Push, which on iOS requires a home-screen-installed PWA over HTTPS.
- Concurrency: how many agents at once, given opaque ChatGPT Plus 5-hour limits?
- Which tools do agents get beyond web search/fetch?
- Recurring todos? Due dates and reminders? Projects or tags?

## Later

- **Interactive browsing** — a cloud browser with saved logins driven over CDP with `playwright-core`. Kernel leads ($5/month free credit, idle time free, profiles, managed auth); Browser Use is cheapest per hour (turn off its default residential proxy); Browserbase has the most mature tooling. Anthropic's `browser_toolset_20260801` is Claude-only, so the tool surface must stay provider-agnostic ([ADR 0003](./adr/0003-own-web-tools.md)).
- **WhatsApp channel** — another route handler/client against the same Harness ([ADR 0001](./adr/0001-agent-in-nextjs-process.md)).
- **Automatic memory** — Hei writing durable facts about the user, beyond the manual profile.
- **Network exposure and auth** — leaning Tailscale plus a single passphrase session cookie.
- **Synology deployment** — DS923+ (x86, 4 GB), Node 24 image, `bun install` inside the target image, SQLite on a local volume (not SMB/NFS).
- **Chat extras** — attachments, edit-and-branch, sidebar search and pinning, cost/usage display, proactive rate-limit watching from response headers.
