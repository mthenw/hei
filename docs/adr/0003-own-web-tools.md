# Web access through Hei's own tools, not provider server tools

`web_search` (Exa) and `web_fetch` (Jina Reader) are Hei-defined tools behind a provider interface, not Anthropic's `web_search`/`web_fetch` server tools or OpenAI's hosted tools. Hei switches between Claude and GPT per chat and on failover ([ADR 0004](./0004-model-access.md)), so a tool must behave the same whichever model is answering; provider server tools exist only on their own provider, and Sign in with ChatGPT rejects OpenAI's hosted tools outright.

## Considered options

- **Anthropic server tools** — zero infrastructure and built-in citations, but unavailable whenever GPT answers.
- **Tavily or Firecrawl for both** — one vendor; Firecrawl also offers interactive browser sessions. Exa + Jina won on free-tier headroom ($10/month Exa credit; keyless Jina at 20 req/min with JavaScript rendering).

Interactive browsing (a cloud browser with saved logins, e.g. Kernel) is deferred; see [parked.md](../parked.md).
