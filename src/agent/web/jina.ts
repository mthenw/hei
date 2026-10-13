export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  /** As Jina reports it, e.g. "Oct 21, 2025" or "2 days ago". */
  date?: string;
};

export type Page = {
  title: string;
  url: string;
  /** The page as markdown, cut to fit the model's context. */
  content: string;
  truncated: boolean;
};

/** A failure the model should see as the tool's result, in words it can act on. */
export class WebError extends Error {}

export type JinaOptions = {
  apiKey: string;
  fetch?: typeof fetch;
  /** Most tokens one page read may cost; Jina refuses larger pages before charging. */
  readTokenBudget?: number;
  /** Most characters of a page the model gets. */
  maxPageChars?: number;
};

/** Each search result costs about 1,000 tokens when results carry no page content. */
const TOKENS_PER_RESULT = 1_000;

/**
 * Web search and page reading through Jina (ADR 0003). Search asks for titles, links and snippets only: with page
 * content a single search can cost hundreds of thousands of tokens. Reads carry a token budget for the same reason.
 */
export class Jina {
  private readonly fetch: typeof fetch;
  private readonly readTokenBudget: number;
  private readonly maxPageChars: number;

  constructor(private readonly options: JinaOptions) {
    this.fetch = options.fetch ?? fetch;
    this.readTokenBudget = options.readTokenBudget ?? 20_000;
    this.maxPageChars = options.maxPageChars ?? 40_000;
  }

  async search(
    query: string,
    options: { count?: number; signal?: AbortSignal } = {},
  ): Promise<SearchResult[]> {
    const count = options.count ?? 5;
    const url = new URL("https://s.jina.ai/");
    url.searchParams.set("q", query);
    url.searchParams.set("num", String(count));
    const body = await this.request(url, {
      headers: {
        "X-Respond-With": "no-content",
        "X-Token-Budget": String(TOKENS_PER_RESULT * (count + 3)),
      },
      signal: options.signal,
    });
    const results = Array.isArray(body.data) ? body.data : [];
    return results.slice(0, count).map((result: JinaItem) => ({
      title: result.title?.trim() || result.url,
      url: result.url,
      snippet: result.description?.trim() ?? "",
      ...(result.date ? { date: result.date } : {}),
    }));
  }

  async read(
    pageUrl: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<Page> {
    let parsed: URL;
    try {
      parsed = new URL(pageUrl);
    } catch {
      throw new WebError(`Not a URL: ${pageUrl}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new WebError("Only http and https pages can be read.");

    const body = await this.request(new URL("https://r.jina.ai/"), {
      method: "POST",
      body: JSON.stringify({ url: parsed.toString() }),
      headers: {
        "Content-Type": "application/json",
        "X-Retain-Images": "none",
        "X-Token-Budget": String(this.readTokenBudget),
      },
      signal: options.signal,
    });
    const data = (body.data ?? {}) as JinaItem;
    const content = (data.content ?? "").trim();
    const truncated = content.length > this.maxPageChars;
    return {
      title: data.title?.trim() || parsed.hostname,
      url: data.url || parsed.toString(),
      content: truncated ? content.slice(0, this.maxPageChars) : content,
      truncated,
    };
  }

  private async request(
    url: URL,
    init: {
      method?: string;
      body?: string;
      headers: Record<string, string>;
      signal?: AbortSignal;
    },
  ): Promise<JinaBody> {
    const response = await this.fetch(url, {
      method: init.method ?? "GET",
      body: init.body,
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        Accept: "application/json",
        ...init.headers,
      },
      signal: init.signal,
    });
    const body = (await response.json().catch(() => ({}))) as JinaBody;
    if (response.ok) return body;
    if (body.name === "BudgetExceededError")
      throw new WebError(
        "This page is too long to read in full. Try a more specific page.",
      );
    if (response.status === 401 || response.status === 403)
      throw new WebError("Jina refused the API key. Check JINA_API_KEY.");
    if (response.status === 402)
      throw new WebError("The Jina account is out of tokens.");
    throw new WebError(
      `Jina answered ${response.status}${body.message ? `: ${body.message}` : ""}`,
    );
  }
}

type JinaItem = {
  title?: string;
  url: string;
  description?: string;
  date?: string;
  content?: string;
};

type JinaBody = {
  data?: unknown;
  name?: string;
  message?: string;
};
