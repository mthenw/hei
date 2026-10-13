# Calendars as a synced copy, one source per provider

Hei keeps a copy of every connected calendar's events in `app.sqlite` (`calendar_accounts`, `calendars`, `calendar_events`) and syncs it in the background, rather than asking the providers each time a view opens or Hei needs the schedule. `Calendars` (`src/calendar/calendars.ts`) owns the copy; each provider is a `CalendarSource` (`src/calendar/source.ts`) that lists its calendars and reports their events, in full or as changes since a sync token.

- **Google** syncs every 2 minutes with its sync tokens: the first sync reads from 60 days back, later ones only the changes (deletions included). A token Google rejects (410) wipes that calendar's copy and starts over. Repeating events are fetched as single occurrences.
- **ICS links** have no tokens: every 15 minutes the whole file is read, its repeating events expanded from 60 days back to a year ahead, and the copy made to match.
- **Ids stay put.** Syncing updates events in place, keyed by calendar and the provider's id, so an event keeps Hei's id across syncs: Hei's tools and plan cards refer to events by it.
- **Secrets are sealed.** Google tokens and ICS addresses (which are secret links) are stored encrypted with `HEI_SECRET`, like the ChatGPT sign-in.

## Why a copy

- Views and Hei's tools answer at once and alike, from one store, however many providers are slow or down; a failing account shows its error and keeps its last copy.
- Free time and conflicts are computed across every calendar in one query.
- Writes go to the provider first and the copy follows with an immediate sync, so the provider stays the source of truth.

## Considered options

- **Read on demand** — nothing stored, always current, but every view and every tool call waits on every provider, and ICS files would be downloaded and expanded on each look.
- **Push notifications** (Google watch channels) — need a public HTTPS address, which Hei on a home NAS won't have; polling with sync tokens is cheap enough.
- **A unified API** (Nylas, Cronofy) — Nylas still needs Hei's own Google OAuth client; Cronofy costs far more than a single user warrants.
