# Hei

Single-user personal assistant: Next.js + [pi-durable](https://github.com/earendil-works/pi/tree/main/packages/durable). Read before working:

- [docs/v1-spec.md](docs/v1-spec.md) — current scope, behaviour, build order, definition of done.
- [CONTEXT.md](CONTEXT.md) — domain vocabulary. Use these terms in code, UI and commits.
- [docs/adr/](docs/adr/) — why the architecture looks the way it does. Read the relevant ADR before changing process layout, storage, web tools or model access.
- [docs/parked.md](docs/parked.md) — calendar, todos, hand-off and later work. Read when a task touches them.

@AGENTS.md

## Runtime

- **bun is the package manager; Node 24 is the runtime.** pi-durable needs `node:sqlite`, so scripts run the app with Node (`next dev`, `next start`), never `bun run` as the runtime.
- **One Harness, one process.** pi-durable has no cross-process locking. `src/server/hei.ts` builds everything once per process (app database, credential store, models, Agent, Chats, Connections), keeps it on `globalThis`, and is first called from `instrumentation.ts`. Route handlers reach it through `heiForRequest()` (`src/app/api/hei.ts`), never `getHei()` directly: it calls `connection()` first, because `next build` runs GET handlers to try to prerender them, and a build that opens Hei resumes pending runs beside the dev server and corrupts the storage (this happened once). `getHei()` claims the data directory with `data/hei.lock`; a second process fails with `DataDirInUse`. Give smoke-test servers and scripts their own `HEI_DATA_DIR`, and only read the databases with other tools.
- **Server modules are bundled more than once.** Next.js compiles them separately into instrumentation and into each route, all sharing the one `getHei()` instance. Module identity differs across that boundary: match errors with `HeiError` kinds (`isHeiError`, e.g. `ChatNotFound.is`), never `instanceof`; `src/app/api/respond.ts` maps them to statuses. Restart the dev server after changing `src/agent/` or `src/server/`, since the shared instance keeps the code it was built with.
- `src/agent/` stays free of Next.js imports.

## App database

`app.sqlite` holds Hei's own data through Drizzle (see [ADR 0002](docs/adr/0002-separate-app-database.md)). To change the schema, edit `src/db/schema.ts`, run `bun run db:generate --name <change>`, and commit the new files in `drizzle/`; migrations apply when the server starts. Product operations on chats go through `Chats` (`getHei().chats`), which keeps the row and the pi-durable conversation in step and notifies the live chat list.

## pi-durable and pi-ai

- **Pinned exact versions.** The API changes without notice between releases. Before using any `@earendil-works/*` API, read the installed package's README and `.d.ts` files in `node_modules` — the installed version is the source of truth, not memory or the GitHub `main` branch.
- Upgrade these packages only as a deliberate, separate change.
- Mark tools `replay: "safe"` only when re-running them after a crash has no side effects.

## Model access

Claude is reached only through `ANTHROPIC_API_KEY`; ChatGPT only through Sign in with ChatGPT (pi-ai `openai` provider). pi-ai's Claude subscription OAuth impersonates Claude Code and violates Anthropic's terms — leave it unused. See [ADR 0004](docs/adr/0004-model-access.md).

Two guardrails keep it that way: the credential store only stores sign-ins for `openai`, and Hei's pi-ai auth context hides `ANTHROPIC_OAUTH_TOKEN`. Which models are offered, the default for new chats, and the side-job model come from `ModelCatalog` (`src/agent/model-catalog.ts`).

## UI

Dark mode only. Visual language follows time.fyi: Geist / Geist Mono, hairline borders, coral accent. Theme tokens live on `:root` in `src/app/globals.css`; `<html>` carries the `dark` class so component `dark:` variants apply.

Components from shadcn/ui (Radix base — AI Elements relies on `asChild`) and AI Elements; chat state comes from Hei's own SSE hook, not the AI SDK's `useChat`. `src/components/ui/` is vendored shadcn code, excluded from Biome: add and update it with `bunx --bun shadcn@latest add`, and compose or wrap it rather than editing it.

Cache Components is on. Route-level redirects go in `next.config.ts` `redirects`, not a page that calls `redirect()`. On dynamic routes the pathname and params are request data: navigation that highlights the current path renders through `WithPathname`, and pages read `params` inside a `<Suspense>` boundary.

The chat UI's only dependency on pi-durable's event shapes is `src/lib/chat-stream.ts`, which turns agent events into display messages. Keep it that way: when pi-durable changes its events, that file and its tests are the one place to update.

## Tests

The test suite never calls a real model. Build agents with `openTestAgent()` from `src/agent/testing.ts`: it offers only the scripted dev model and gives pi-ai an empty environment, so API keys on the machine stay invisible to tests.
