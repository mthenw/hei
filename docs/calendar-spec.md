# Hei — Calendar

A calendar in the time.fyi style that shows every connected calendar in one grid, that Hei can read and plan with, and that changes only when the user approves. Decisions agreed on 13 October 2026; the earlier thinking is in [parked.md](./parked.md). Vocabulary in [CONTEXT.md](../CONTEXT.md).

## Calendars

- **Google** — signed in with Hei's own OAuth client (the user's Google Cloud project), read and write. Every calendar on the account is listed; each can be shown or hidden.
- **ICS link** — a secret calendar address from any provider, read only. For calendars where sign-in is blocked.
- Accounts are added and removed under Settings → Connections. Google tokens and ICS addresses are secrets: stored sealed with `HEI_SECRET`.
- Each calendar has a colour from the time.fyi palette (blue, green, purple, coral, amber; chosen in order, changeable) and can be hidden.
- **Default calendar** for new events: the primary calendar of the first Google account; changeable.

## Sync

- Events are kept in `app.sqlite` and synced in the background: Google every 2 minutes with its sync tokens, ICS links every 15 minutes, and both right after a change Hei makes. [ADR 0008](./adr/0008-calendar-sync.md).
- The first Google sync starts 60 days back; later syncs bring every change. Repeating events are stored as their single occurrences. A rejected sync token (410) wipes the calendar's copy and syncs it again.
- An ICS link is read whole each time; occurrences from 60 days back to a year ahead replace the stored ones.

## Calendar page

- **Week view** by default, plus **day** and **month**. Keys: `1` day, `2`–`9` that many days, `w` week, `m` month, `t` today, `←` `→` back and forward.
- Days run down the screen in a time grid, with all-day events and dated todos in a row on top. A red line marks now.
- Events are pastel chips with a 3 px bar in their calendar's colour; overlapping events sit side by side. Clicking one shows its details and a link to it in Google.
- **Sidebar**: the calendars, with colour and show/hide; and open todos, which can be dragged onto the grid.
- **Phone**: a day view; the sidebar is the drawer.

## Hei and the calendar

Every chat (todo agents included) gets the calendar tools:
- `list_events` — events between two times, optionally matching a text.
- `find_free_time` — free slots of a given length between two times, within working hours unless told otherwise.
- `propose_calendar_changes` — a **plan**: events to create, move or delete, with a one-line summary.

A plan shows in the chat as a **plan card**: the changes, and Approve / Not now. Nothing changes until Approve. After approving, the card shows the result and an Undo, which reverses the changes it made. Only Google calendars can be changed; ICS calendars are read only.

**Ask Hei from the calendar**: `⌘I` (Ctrl+I) opens a chat beside the grid. It is an ordinary chat, so it also appears in the chat list.

## Todos on the calendar

- Dated todos show in the all-day row of their day; a todo with a time also shows at its time as a slim marker.
- Dragging a todo (from the sidebar, or a todo already in the grid) onto a time creates a time block for it in the default calendar (30 minutes, resizable later in Google), linked to the todo. With no calendar Hei can write to, the todo just gets that date and time. Dropping it on a day (the all-day row, or a month cell) gives it that date. The user's own drag needs no approval; a toast offers Undo.

## Setup

Google sign-in needs an OAuth client from the user's Google Cloud project: Google Calendar API enabled (and the People API, for [contacts](./contacts-spec.md)), the consent screen published (in production, so sign-ins don't expire after 7 days; Google shows its "unverified app" notice to the owner), scopes `calendar.events` and `calendar.calendarlist.readonly` (plus the optional contacts scopes), and the redirect `http://localhost:3000/api/calendar/google/callback`. Its id and secret go in `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`. Google accepts that redirect only on localhost or over HTTPS, so Google sign-in happens on the machine running Hei.

## Build order

1. **Calendar core** — tables, sync engine, ICS links, the calendar page with day/week/month views and the sidebar.
2. **Google** — sign-in, calendar list, incremental sync, writes.
3. **Hei's calendar tools and plan cards** — the three tools, approve / not now / undo.
4. **Ask Hei from the calendar** — the `⌘I` chat beside the grid.
5. **Todos on the calendar** — dated todos in the grid, dragging a todo to block time.
6. **Polish** — phone pass, smoke test, docs.

Steps 1–5 are in (13 October 2026). Checked with tests (ICS reading with zones, repeats and exceptions; sync with ids kept and tokens expiring; Google sign-in, sync and writes against a fake Google; plans applied, declined, stopped part-way and undone; free time; layout and time zones) and in the browser with an ICS link: week, day and month views, details, phone, todos in the grid and dropped onto it with Undo, and Ask Hei. Not yet tried against the real Google: sign-in, sync and a plan applied there.
