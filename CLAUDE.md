# Hei

Single-user personal assistant: Next.js + [pi-durable](https://github.com/earendil-works/pi/tree/main/packages/durable). Read before working:

- [docs/v1-spec.md](docs/v1-spec.md) — current scope, behaviour, build order, definition of done.
- [CONTEXT.md](CONTEXT.md) — domain vocabulary. Use these terms in code, UI and commits.
- [docs/adr/](docs/adr/) — why the architecture looks the way it does. Read the relevant ADR before changing process layout, storage, web tools or model access.
- [docs/parked.md](docs/parked.md) — calendar, todos, hand-off and later work. Read when a task touches them.

@AGENTS.md

## Runtime

- **bun is the package manager; Node 24 is the runtime.** pi-durable needs `node:sqlite`, so scripts run the app with Node (`next dev`, `next start`), never `bun run` as the runtime.
- **One Harness, one process.** pi-durable has no cross-process locking. The Harness lives on `globalThis` and is opened once from `instrumentation.ts`; reach it through the `src/agent/` accessor so hot reload reuses it.
- `src/agent/` stays free of Next.js imports.

## pi-durable and pi-ai

- **Pinned exact versions.** The API changes without notice between releases. Before using any `@earendil-works/*` API, read the installed package's README and `.d.ts` files in `node_modules` — the installed version is the source of truth, not memory or the GitHub `main` branch.
- Upgrade these packages only as a deliberate, separate change.
- Mark tools `replay: "safe"` only when re-running them after a crash has no side effects.

## Model access

Claude is reached only through `ANTHROPIC_API_KEY`; ChatGPT only through Sign in with ChatGPT (pi-ai `openai` provider). pi-ai's Claude subscription OAuth impersonates Claude Code and violates Anthropic's terms — leave it unused. See [ADR 0004](docs/adr/0004-model-access.md).

## UI

Dark mode only. Visual language follows time.fyi: Geist / Geist Mono, hairline borders, coral accent. Theme tokens live on `:root` in `src/app/globals.css`; `<html>` carries the `dark` class so component `dark:` variants apply.

Components from shadcn/ui (Radix base — AI Elements relies on `asChild`) and AI Elements; chat state comes from Hei's own SSE hook, not the AI SDK's `useChat`. `src/components/ui/` is vendored shadcn code, excluded from Biome: add and update it with `bunx --bun shadcn@latest add`, and compose or wrap it rather than editing it.

Cache Components is on. Route-level redirects go in `next.config.ts` `redirects`, not a page that calls `redirect()`.

## Tests

Agent tests run on pi-ai's fake model — no real model calls in the test suite.
