# Hei — Contacts and mentions

The people in the user's Google contacts, mentioned with `@` in chats and todos, so Hei knows who is meant — for example to draft an email to them. Decisions agreed on 14 October 2026. Vocabulary in [CONTEXT.md](../CONTEXT.md); why it works this way in [ADR 0009](./adr/0009-contacts-and-mentions.md).

## Contacts

- From **Google**, through the same sign-in as the calendar: the address book (saved contacts) and Gmail's **other contacts**, the people the user has exchanged mail with but never saved. Read only.
- Kept in `app.sqlite` and synced every 10 minutes with Google's sync tokens, and right after signing in. A token Google rejects (they last a week after a full sync) starts a full sync; contacts keep their ids.
- An other contact with the same address as a saved one is left out of searches: the saved contact stands for them.
- Contacts access is a separate permission on Google's consent screen. Without it the calendar still works, and Settings → Connections offers **Allow contacts**, which signs in again with that account.
- No contacts page: the `@` list, Hei's tools and the count in Settings are the whole UI.

## Mentions

- Typing `@` in the chat box, or in a todo's title or notes, lists matching contacts: by name, address or company, accents ignored ("lukasz" finds "Łukasz"), names that start with the text first. ↑ ↓ choose, Enter or Tab picks, Esc closes.
- A picked person reads as `@Anna Kowalska` while typing and is stored as `@[Anna Kowalska](contact:42)`: the name keeps it readable anywhere, the id says who it is. Editing the name makes it plain text again.
- Messages, todos (on the Todos page, in the calendar, in chats) and Hei's replies show mentions as accent-tinted names. Chat titles and Google Calendar events get the plain name.

## Hei and contacts

- A user message that mentions someone carries their details to the model (addresses, phone numbers, organization) for that request only; the user's message stays as written.
- `find_contacts` — people by name, address or company; for names without a mention, or mentions inside todos.
- Hei mentions people when it writes todos about them ("Call @[Anna Kowalska](contact:42)"), so a hand-off agent gets their details too.
- `draft_email` — an **email draft** card: To, Cc, Subject and body, with **Open in Gmail** (Gmail's compose window, filled in, in the connected Google account) and **Copy text**. Hei never sends email; the user sends it from Gmail.

## Setup

In the Google Cloud project behind `GOOGLE_OAUTH_CLIENT_ID`, enable the **People API**. Then Settings → Connections → **Allow contacts** on the Google account (or Connect Google for a new one) and tick the contacts boxes on Google's consent screen. Scopes: `contacts.readonly` and `contacts.other.readonly`.

## Status

Built on 14 October 2026. Checked with tests (sync with pages, changes, removals and expired tokens; search ranking and accents; scopes allowed and withdrawn; mention details reaching the model; drafts to mentions and addresses) and in the browser with seeded contacts: the `@` list in the chat box, the Todos quick add and the todo editor, mention chips, the draft card on desktop and phone, and Allow contacts. Not yet tried against the real People API.
