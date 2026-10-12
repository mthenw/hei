# pi-durable Harness runs inside the Next.js server process

Hei's agent runtime is a single pi-durable `Harness` held on `globalThis` in the Next.js server, opened from `instrumentation.ts` (which also calls `harness.resume()`), rather than in a separate agent service. pi-durable allows exactly one process to own a storage and has no cross-process locking, and it resumes unfinished runs after a restart — so a separate process buys little isolation while adding an API to design and a second process to run. Future channels (WhatsApp webhook, background agents) are more route handlers and tasks in the same process.

The browser never drives a run with a request/response stream. It submits input, then subscribes to the chat's live state over SSE, so runs outlive tabs and every open device sees the same updates.

## Consequences

- Next.js must run as a long-lived Node server (`next start` / standalone output), never Edge or serverless.
- Dev hot reload must reuse the `globalThis` Harness rather than open the storage a second time.
- Agent code stays in `src/agent/` with no Next.js imports, so it can move to its own process if that ever becomes necessary.

## Considered options

- **Separate agent server (e.g. Hono) + Next.js UI** — cleaner boundary and UI restarts never touch runs, but pi-durable's resume already covers restarts, and it doubles the moving parts on a 4 GB NAS.
