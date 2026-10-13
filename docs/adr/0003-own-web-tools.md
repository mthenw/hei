# Web access through Hei's own tools, not provider server tools

`web_search` (Jina Search, `s.jina.ai`) and `web_fetch` (Jina Reader, `r.jina.ai`) are Hei-defined tools behind a provider interface, not Anthropic's `web_search`/`web_fetch` server tools or OpenAI's hosted tools. Hei switches between Claude and GPT per chat and on failover ([ADR 0004](./0004-model-access.md)), so a tool must behave the same whichever model is answering; provider server tools exist only on their own provider, and Sign in with ChatGPT rejects OpenAI's hosted tools outright.

## Considered options

- **Anthropic server tools** — zero infrastructure and built-in citations, but unavailable whenever GPT answers.
- **Jina for both (chosen, 2026-10-13)** — one vendor and one key (`JINA_API_KEY`). Search requires the key; each search costs at least 10k tokens, a new key carries a one-time 10M free tokens (about 1,000 searches), and paid tokens bring a search to roughly $0.0005. Free keys allow 100 searches a minute. Results are five per search and include page content by default, so `web_search` must ask for or trim to snippets before they reach the model.
- **Exa for search plus Jina Reader** — the first choice. Exa runs its own index with date filters and gives $10 of credit every month, but adds a second vendor and key. It stays a drop-in replacement behind the search interface.
- **Tavily or Firecrawl for both** — one vendor as well; Firecrawl also offers interactive browser sessions. Smaller free tiers.

Interactive browsing (a cloud browser with saved logins, e.g. Kernel) is deferred; see [parked.md](../parked.md).
