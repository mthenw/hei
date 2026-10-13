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
- Runs locally during development (`bun run dev`); `bun run dev:lan` starts the dev server on the Mac's LAN IP so a phone on the same network can reach it (Next.js only serves dev assets to the hostname it was started with). Anyone on the LAN can use it in that mode — acceptable for development.
- Later target: Synology DS923+ (x86, 4 GB) in Docker. Not a v1 concern beyond keeping the footprint small.

## Features

### Chat
- Replies stream token by token, rendered as markdown with code highlighting.
- **Stop** aborts the current run. **Regenerate** re-runs the last reply.
- Tool calls render as collapsible blocks (name, arguments, live output, result).
- Model reasoning is visible while it streams, then collapses to "Thought for Ns". Default reasoning effort: medium.
- Every assistant reply shows the model that produced it.
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
- **About me** — free text added to every chat's context.
- **Timezone** — default `Europe/Warsaw`. Current date and time in this zone are injected into every request.
- **Language** — Hei replies in the language of the user's message.
- **Assistant instructions** — editable persona prompt, separate from About me. Default: brief and direct, answer first, no filler, ask before any action with side effects.

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
- **Failover trigger**: a run settles `unanswered` with a model error matching a limit pattern (`subscription_sharing_usage_limit_exceeded`, `usage_limit`, `rate_limit_error`/429, `credit balance is too low`). Hei switches the chat's model with `conversation.configure()` and resubmits.
- **Sticky**: a chat stays on the model it switched to until the user changes it.
- **Paused provider**: Claude after a credit error is skipped until an hourly probe succeeds; ChatGPT after a usage-limit error is skipped for 30 minutes (OpenAI gives no reset time).
- **Both exhausted**: an inline error in the chat naming which limits were hit. Nothing is queued silently.
- **Visible**: a note above the reply, e.g. "Switched to GPT-6.1 Sol — Claude credits used up".
- Reactive only. No proactive watching of rate-limit headers in v1.

### Web access
See [ADR 0003](./adr/0003-own-web-tools.md).
- `web_search` — Jina Search (`s.jina.ai`). Returns up to five results with title, URL and snippet; page content is left out or trimmed so a search doesn't fill the model's context.
- `web_fetch` — Jina Reader (`r.jina.ai/<url>`), renders JavaScript, returns markdown.
- Both use `JINA_API_KEY` (search requires it) and sit behind a provider interface so the backing service can be swapped.
- Both tools are `replay: "safe"` (read-only).

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
- **Tooling**: Biome (lint + format), Vitest with pi-ai's fake model for agent code, one Playwright smoke test of the chat.
- `@earendil-works/*` packages pinned to exact versions.

### App database (initial)
- `chats` — id (the pi-durable conversation id), title, whether the user set the title, the request id of the starting message (makes starting a chat idempotent), created and last-activity timestamps. The chat's model lives in pi-durable's `pi.agent` document, not here.
- `profile` — single row: about me, timezone, assistant instructions.
- `credentials` — pi-ai credential store backing (ChatGPT OAuth tokens), encrypted with `HEI_SECRET`.
- `provider_status` — paused-until per provider, last error.
- `settings` — install-scoped values, including the stable SIWC device id.

### Environment
`ANTHROPIC_API_KEY`, `JINA_API_KEY` (web search and reading pages), `HEI_SECRET`, `HEI_DATA_DIR` (default `./data`).

## Definition of done

1. On the laptop, ask "What's on the Hacker News front page? Summarise the top story." Hei searches, reads the page, and streams an answer with numbered sources; tool calls appear as collapsible blocks.
2. Close the tab mid-reply, open the same chat on the phone — the reply finishes there.
3. Restart the server mid-reply — the run resumes by itself.
4. The chat appears in the sidebar under Today with a generated title; rename and delete work.
5. Fill in the profile — the next reply visibly uses it.
6. When the current provider hits its limit, the next reply comes from the other one, with the switch note shown.

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
