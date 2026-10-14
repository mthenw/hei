# Contacts through the Google sign-in; mentions as text

Hei reads the user's contacts from Google's People API through the Google sign-in the calendar already uses, keeps a synced copy in `app.sqlite` (`contacts`, `contact_syncs`), and refers to a contact in text with a mention, `@[Name](contact:ID)`. `Contacts` (`src/contacts/contacts.ts`) owns the copy; `Calendars` owns the sign-in and lends it an access token (`googleAccounts`, `googleAccessToken`).

- **One sign-in, optional scopes.** The consent screen asks for the calendar and contacts scopes together; only the calendar ones are required. What Google granted is stored on the account (`calendar_accounts.scopes`, refreshed with every access token), and contacts sync only when it includes them. A list that is no longer allowed is deleted.
- **Synced like the calendar** ([ADR 0008](./0008-calendar-sync.md)): sync tokens every 10 minutes, a full sync when Google rejects one, contacts updated in place by resource name so their ids — what mentions point at — stay put.
- **Mentions are plain text.** Messages and todos store `@[Anna Kowalska](contact:42)`. The name keeps the text readable where Hei doesn't render mentions (the transcript, a model, Google Calendar); the id makes it unambiguous. Nothing about a mention lives outside the text, so chats, todos and hand-off briefs need no new fields.
- **Details travel with the request.** A `beforeRequest` hook appends each mentioned contact's details to the user message that mentions them, for that request only — like the `<sent>` stamp. The transcript keeps what the user wrote, and the details are current when a contact changes. Mentions outside user messages (in a todo the model lists) are looked up with `find_contacts`.
- **Drafts, not sending.** `draft_email` shows a card that opens Gmail's compose window filled in. No Gmail scope, so no restricted-scope warning and nothing that can send in the user's name.

## Considered options

- **Ask Google on every search** — no copy to keep, but each keystroke in the `@` list waits on Google, and the People API's search covers saved contacts only.
- **Mentions as ids alone** (`<@42>`) — shorter, but unreadable wherever Hei doesn't render them, and meaningless once a contact is deleted.
- **A rich-text composer** (contenteditable, chips as nodes) — chips while typing, but a new editor for the chat box and every todo field; a plain text field with an `@` list covers the need.
- **Gmail drafts through the API** (`gmail.compose`) — drafts on every device, but a restricted scope with an extra warning at sign-in, for a step the user takes anyway.
- **iCloud contacts** (CardDAV) — needs an app-specific password; parked until an address book lives outside Google.
