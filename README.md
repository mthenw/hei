# Hei

A single-user personal assistant: chat with ChatGPT or Claude, with web search, places and a profile it keeps in mind, and a todo list whose items Hei can hand to background agents. Built on Next.js and [pi-durable](https://github.com/earendil-works/pi/tree/main/packages/durable). The calendar comes later ([docs/parked.md](docs/parked.md)).

## Setup

Needs Node 24 and bun.

```bash
bun install
cp .env.example .env
```

Fill in `.env`:

- `HEI_SECRET` — encrypts the stored ChatGPT sign-in, e.g. `openssl rand -base64 32`.
- `ANTHROPIC_API_KEY` — Claude, through a pay-as-you-go API key.
- `JINA_API_KEY` — web search and reading pages.
- `GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_BROWSER_KEY` — finding places, and showing them on a map (see `.env.example` for how to restrict each).

All are optional: without any, Hei offers only its scripted dev model.

## Run

```bash
bun run dev
```

Open http://localhost:3000, then **Settings → Connections → Connect ChatGPT** to sign in with a ChatGPT plan. Data lives in `./data` (set `HEI_DATA_DIR` to move it).

To try it from a phone on the same network, stop `bun run dev` and start `bun run dev:lan`, which serves on the Mac's LAN address.

## Checks

```bash
bun run lint
bun run typecheck
bun run test
bun run test:e2e
```

`test:e2e` builds Hei and runs a Playwright smoke test against it on port 3200, with its own data and only the dev model; it uses the installed Chrome.

## Docs

- [docs/v1-spec.md](docs/v1-spec.md) — what v1 does and how it was verified.
- [docs/todos-spec.md](docs/todos-spec.md) — todos, and handing them to agents.
- [CONTEXT.md](CONTEXT.md) — the words Hei uses.
- [docs/adr/](docs/adr/) — why it is built this way.
