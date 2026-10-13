# Hei v1 — chat

Hei is a single-user personal assistant built on [pi-durable](https://github.com/earendil-works/pi/tree/main/packages/durable). The long-term product is chat + a time.fyi-style calendar you can talk to + a todo list whose items can be handed to background agents. **v1 is the chat foundation**: conversations, a sidebar, and web access. Calendar and todos are designed later — see [parked.md](./parked.md).

Decisions agreed in the grilling session of 2026-10-12. Architecture-shaping choices are recorded in [adr/](./adr/); vocabulary in [CONTEXT.md](../CONTEXT.md).

## Scope

**In v1**
- Chat with streaming, markdown/code, stop, regenerate, collapsible tool calls, numbered citations.
- Conversation sidebar.
- Web search and page reading tools.
- Profile page and Connections page.
- Two model providers (ChatGPT Plus, Claude API) with a per-chat model picker and automatic failover.
- Responsive layout for desktop and phone; PWA manifest.

**Not in v1**: calendar (v2), todos and agent hand-off (v3), interactive cloud browser, WhatsApp, automatic memory, attachments, message edit/branching, cost display, sidebar search/pinning, auth, network exposure, Synology deployment.

## Users and environment

- One user. No accounts table, no login in v1.
- Runs locally during development (`bun run dev`); `bun run dev:lan` starts the dev server on the Mac's LAN IP instead, so a phone on the same network can reach it (Next.js only serves dev assets to the hostname it was started with, and runs one dev server per project, so stop `bun run dev` first). Anyone on the LAN can use it in that mode — acceptable for development.
- Later target: Synology DS923+ (x86, 4 GB) in Docker. Not a v1 concern beyond keeping the footprint small.

## Features

### Chat
- Replies stream token by token, rendered as markdown with code highlighting.
- **Stop** aborts the current run.
- **Regenerate**, under the last reply while Hei is idle, answers that reply's message again in its place. A `hei.regenerate` transcript entry omits the message and the old reply from the model's context (a pi-durable context edit) and Hei sends the message again, the same way as any message (failover included). The UI shows the message once, with the new reply.
- Tool calls render as collapsible blocks (name, arguments, live output, result).
- Model reasoning is visible while it streams, then collapses to "Thought for Ns". Default reasoning effort: medium.
- A reply names its model only when the model changed since the reply before it ("Switched to …", see failover).
- Web-backed answers cite sources as numbered markers `[1]` with source chips (favicon + domain) under the reply.

### Sending while Hei is busy
- **Enter** queues the message as a follow-up that runs after the current reply (pi-durable inbox follow-up).
- **Stop + send** interrupts the current run and submits the new message.

### Live sync
- The server is the source of truth. A run continues when the tab closes.
- Each open browser subscribes to a chat's live state over SSE. Every device viewing the chat sees the same updates.
- On reconnect the client receives a fresh snapshot (pi-durable has no resume cursor).

### Sidebar
- Chats grouped by date: Today, Yesterday, Last 7 days, Older.
- **New chat** button.
- Titles: a provisional title from the first message (its first line, cut at a word boundary) appears at once; a model-written title replaces it after the first exchange (step 4) unless the user renamed the chat.
- Rename and delete from a menu on each chat. Delete asks for confirmation.
- Delete removes the chat from Hei and stops its work. pi-durable cannot delete a conversation, so the transcript stays in `agent.sqlite`, unreachable from Hei.
- The list is live: every open sidebar updates when a chat is started, renamed, deleted or used, and a chat deleted elsewhere closes in every tab showing it.

### Profile page
Stored as one row in `app.sqlite` and read on every request, so a change applies from the next message in every chat. Hei's own prompt sections come from it (`heiExtension` in `src/agent/extension.ts`).
- **About you** — free text, added to the system prompt when not empty.
- **Time zone** — default `Europe/Warsaw`, any IANA zone, with a button to use the device's. Today's date in this zone is in the system prompt (it changes once a day). Each user message is stamped with its own send time (`<sent>13 Oct 2026, 11:42</sent>`) for the model only, in a `beforeRequest` hook: the stamp depends on the message alone, so cached context stays valid, and the stored chat is unchanged.
- **Reply language** — "Same as my message" (default) or a fixed language.
- **Assistant instructions** — editable persona prompt, separate from About you. Shows the default (answer first and briefly, ask before anything that changes something outside the chat) with a "Reset to default"; leaving the default stores nothing, so improvements to it reach the user.

### Connections page
- **Connect ChatGPT** — runs Sign in with ChatGPT (pi-ai `openai` provider, SIWC) on the server. It opens the auth URL in a new tab; pi-ai's callback server on `127.0.0.1:1455` finishes the sign-in when the browser runs on the same machine as Hei, and otherwise the user pastes the address of the page that failed to load. Requires `HEI_SECRET`; the page explains how to set it. One sign-in at a time; cancelling frees the port.
- **Disconnect** forgets the stored sign-in.
- Shows whether Claude is configured, and set/missing for `ANTHROPIC_API_KEY`, `JINA_API_KEY` and `HEI_SECRET`. Read-only; values are never sent to the browser.

### Models and failover
See [ADR 0004](./adr/0004-model-access.md) for why.

| Role | Model |
|---|---|
| Default | ChatGPT Plus via SIWC — GPT-6.1 Sol (confirm against the account's `GET /v1/models` at build time) |
| Backup | Claude Sonnet 5.5 via `ANTHROPIC_API_KEY` (personal Console org, ~$20/month spend cap) |
| Side jobs (titles) | Claude Haiku 5.5 → a small GPT model → first message truncated |

- **Model picker** in the composer, per chat: Claude Sonnet, Opus and Haiku 5.5 when `ANTHROPIC_API_KEY` is set; GPT-6.1 Sol, GPT-6 Sol, GPT-6 Astra and GPT-6 Luna as far as the ChatGPT account's own model list allows (all four if that list can't be read). New chats start on the first available of GPT-6.1 Sol, Claude Sonnet 5.5, then the dev model. Chats run with medium reasoning effort.
- **Dev model** — the scripted model is offered in development, and in production only with `HEI_DEV_MODEL=1`.
- **Failover trigger**: a message's run settles `unanswered` with a model error that `classifyLimit` recognises: the ChatGPT plan's usage limit (`subscription_sharing_usage_limit_exceeded`), used-up credits or a spend cap (`credit balance is too low`, `insufficient_quota`, billing), a rate limit still failing after pi-durable's retries (429, `rate_limit_error`), or ChatGPT plan usage still unavailable after retries. pi-durable does not retry the first two, so the run ends at once.
- **Switch**: Hei pauses the provider, switches the chat to the other account's default model (`ModelCatalog.backupFor`) and writes a `hei.failover` transcript entry. That entry omits the failed message from the model's context (a pi-durable context edit), and Hei sends the message again, so the new model reads it once. The UI shows the message once, drops the failed attempt, and puts the note above the new reply.
- **Sticky**: a chat stays on the model it switched to until the user changes it.
- **Paused provider**: skipped for 30 minutes after a ChatGPT usage limit (OpenAI gives no reset time), 1 hour after used-up Claude credits, 5 minutes after a lasting rate limit or unavailability. The next request after the pause is the probe. Pauses are stored in `app.sqlite` and survive restarts. Sending to a chat whose provider is paused switches it before sending; picking a paused provider's model by hand ends that pause.
- **Both exhausted**: no switch; the failed reply shows the reason and what to do (add the other account, or that it is paused too). Nothing is queued silently.
- **Visible**: a note above the reply, e.g. "Switched to GPT-6.1 Sol — Claude credits used up". A model change the user made shows "Switched to …" without a reason.
- **Trying it**: in development, sending exactly `/limit` to the dev model makes it fail with a simulated ChatGPT usage limit.
- Reactive only. No proactive watching of rate-limit headers in v1.

### Web access
See [ADR 0003](./adr/0003-own-web-tools.md).
- `web_search` — Jina Search (`s.jina.ai`) with `X-Respond-With: no-content`: five results with title, URL, date and snippet, about 1,000 Jina tokens each, capped by `X-Token-Budget`. Never ask search for page content: with it, one search cost about 419,000 tokens in testing.
- `web_fetch` — Jina Reader (`r.jina.ai`), renders JavaScript, returns markdown. Capped at 20,000 Jina tokens per page (Jina refuses larger pages before charging; the model is told the page is too long) and cut to 40,000 characters for the model.
- Both need `JINA_API_KEY`; without it chats are offered no web tools. They live in a separate `web` extension with their own prompt section, are `replay: "safe"` (read-only), and stop when the reply is stopped.
- **In the chat**: each search shows as one line ("Searched “…” · 5 results", expandable to the results with site icons); each read as "Read <page title>". While a tool works it shows a spinner instead of "Thinking…".
- **Citations**: the model cites with markdown links to the exact pages its tools returned. Links to those pages render as numbers in order of first citation, and the cited pages appear as numbered chips (site icon + domain) under the reply. Links to other pages stay ordinary links.

### Places
Added after v1; see [ADR 0005](./adr/0005-places-with-google-ui-kit.md).
- `find_places` — Google Places API (New) Text Search on the server: up to five places with address, type, rating, price and open-now status for the model. Needs `GOOGLE_MAPS_API_KEY`; without it chats are offered no place search. `replay: "safe"`.
- The transcript keeps only place IDs: the one piece of Places content Google allows to be stored indefinitely.
- **In the chat**: "Found 5 places for “…”", then a dark Google map and, per place, Google's compact place card (photo, rating, type, price, open now, address) with an "Open in Google Maps" link. Each card loads its place from Google and puts a numbered coral pin on the map. The browser loads Google's script only when a chat shows places, with `GOOGLE_MAPS_BROWSER_KEY`; without it, places show as numbered links.
- The model is told not to repeat addresses, ratings or links: it says which places it suggests and why.

### Layout and look
- Icon rail on the left (Chat / Calendar / Todos), each section with its own sidebar. Calendar and Todos are placeholders in v1.
- Phone: bottom tab bar replaces the rail; the chat list becomes a drawer.
- Visual language from time.fyi: Geist and Geist Mono, hairline borders, coral accent, near-black surfaces. **Dark mode only.**
- PWA manifest and icons included. Home-screen install is verified once Hei runs behind HTTPS.

## Architecture

- One Next.js app (App Router), Node 24 LTS runtime, **bun as package manager only** — the app runs on Node because pi-durable uses `node:sqlite`.
- **Agent in-process** ([ADR 0001](./adr/0001-agent-in-nextjs-process.md)): a single pi-durable `Harness` lives on `globalThis` inside the Next.js server, opened at boot from `instrumentation.ts`, which also calls `harness.resume()`. Agent code lives in `src/agent/` with no Next.js imports.
- **Two SQLite files** in `./data` ([ADR 0002](./adr/0002-separate-app-database.md)):
  - `agent.sqlite` — pi-durable storage, owned by the Harness.
  - `app.sqlite` — Hei's own data via Drizzle.
- **Live updates**: a route handler per chat reads `watchEvents(harness, conversationId)` and streams it as SSE.
- **UI**: shadcn/ui + Tailwind + AI Elements (presentational only; state comes from Hei's own SSE hook).
- **Tooling**: Biome (lint + format), Vitest with pi-ai's fake model for agent code, and a Playwright smoke test of the chat (`bun run test:e2e`): it builds Hei, starts it on port 3200 with a throwaway data directory and only the dev model, and drives the installed Chrome at desktop and phone sizes.
- `@earendil-works/*` packages pinned to exact versions.

### App database
- `chats` — id (the pi-durable conversation id), title, whether the user set the title and whether a model wrote it, the request id of the starting message (makes starting a chat idempotent), created and last-activity timestamps. The chat's model lives in pi-durable's `pi.agent` document, not here.
- `profile` — single row: about you, time zone, reply language, assistant instructions.
- `credentials` — pi-ai credential store backing (ChatGPT OAuth tokens), encrypted with `HEI_SECRET`.
- `provider_pauses` — paused-until and reason per provider.
- `settings` — install-scoped values, including the stable SIWC device id.

### Environment
`ANTHROPIC_API_KEY`, `JINA_API_KEY` (web search and reading pages), `GOOGLE_MAPS_API_KEY` (place search, server), `GOOGLE_MAPS_BROWSER_KEY` (map and place cards, browser), `GOOGLE_MAPS_MAP_ID` (optional), `HEI_SECRET`, `HEI_DATA_DIR` (default `./data`).

## Definition of done

1. On the laptop, ask "What's on the Hacker News front page? Summarise the top story." Hei searches, reads the page, and streams an answer with numbered sources; tool calls appear as collapsible blocks.
2. Close the tab mid-reply, open the same chat on the phone — the reply finishes there.
3. Restart the server mid-reply — the run resumes by itself.
4. The chat appears in the sidebar under Today with a generated title; rename and delete work.
5. Fill in the profile — the next reply visibly uses it.
6. When the current provider hits its limit, the next reply comes from the other one, with the switch note shown.

### Walkthrough, 13 October 2026
All eight build steps are in. How each item was checked:
1. Done with GPT-6.1 Sol through Sign in with ChatGPT: it searched, read the page, and answered with numbered sources; each search and read shows as a collapsible line.
2. The smoke test closes the tab mid-reply and opens the chat at phone size, where the reply finishes. A real phone needs `bun run dev:lan`.
3. Done by restarting the dev server mid-reply; the agent tests also reopen storage mid-run.
4. GPT-6 Luna writes the titles; the smoke test renames and deletes a chat.
5. With a Profile filled in, the next request's system prompt carries About you, the time zone's date and the reply language (checked on a test server with the dev model).
6. Not yet seen with a real limit. Sending `/limit` to the dev model simulates one, and the failover tests cover both directions, a paused provider and both accounts exhausted. Watch the first real switch.

Not verified yet: installing to a phone's home screen, which needs Hei behind HTTPS.

## Build order

Each step ends in something runnable and reviewable.

1. **Scaffold** — Next.js, bun, Biome, Vitest, Tailwind, shadcn, Geist, dark theme, app shell (icon rail, section sidebar, bottom tabs).
2. **Tracer bullet** — Harness singleton + fake model + SSE route + minimal chat UI. One message round-trips end to end; restart resumes.
3. **Chats** — app DB, sidebar, new/rename/delete, auto titles.
4. **Real models** — Claude via API key; Connections page with Connect ChatGPT; model picker.
5. **Failover** — limit detection, sticky switch, paused providers, switch note.
6. **Web tools** — `web_search`, `web_fetch`, tool-call blocks, citations.
7. **Profile** — page, context injection, timezone, persona.
8. **Phone + polish** — responsive pass, PWA manifest, `dev:lan`, Playwright smoke test, walk through the definition of done.

## Assumptions not explicitly discussed
- Long chats are compacted automatically using pi-durable's defaults.
- UI text is English.
- Default GPT model is GPT-6.1 Sol, subject to what the Plus account exposes.

## Risks
- **pi-durable is experimental** — "The API changes without notice between releases"; 1.1.0 broke 1.0.0 within six days. Pin exactly, upgrade deliberately.
- **Next.js bundling** of `node:sqlite` and the ESM pi packages is untested; may need `serverExternalPackages`.
- **Dev hot reload** must not open the Harness twice — no cross-process locking in pi-durable.
- **ChatGPT Plus limits are opaque** (5-hour windows, no reset time in errors). Agent tool loops may burn through them faster than chat suggests.
- **SIWC eligibility** covers personal projects running locally or self-hosted; a publicly hosted deployment would need OpenAI's approval.
