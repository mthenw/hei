import { describe, expect, it, vi } from "vitest";
import { Jina, WebError } from "./jina";

function fakeFetch(status: number, body: unknown) {
  return vi.fn(
    async (_url: URL | RequestInfo, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  );
}

describe("Jina", () => {
  it("searches for titles, links and snippets only, under a token budget", async () => {
    const fetch = fakeFetch(200, {
      data: [
        {
          title: "Next.js 16",
          url: "https://nextjs.org/blog/next-16",
          description: "Routing overhaul.",
          date: "Oct 21, 2025",
          content: "",
        },
        { url: "https://example.com/untitled", description: "" },
      ],
    });
    const jina = new Jina({ apiKey: "key", fetch });

    const results = await jina.search("next.js 16", { count: 2 });

    expect(results).toEqual([
      {
        title: "Next.js 16",
        url: "https://nextjs.org/blog/next-16",
        snippet: "Routing overhaul.",
        date: "Oct 21, 2025",
      },
      {
        title: "https://example.com/untitled",
        url: "https://example.com/untitled",
        snippet: "",
      },
    ]);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://s.jina.ai/?q=next.js+16&num=2");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer key",
      "X-Respond-With": "no-content",
      "X-Token-Budget": "5000",
    });
  });

  it("reads a page as markdown, cut to fit", async () => {
    const fetch = fakeFetch(200, {
      data: {
        title: "Blog",
        url: "https://nextjs.org/blog",
        content: "x".repeat(50),
      },
    });
    const jina = new Jina({ apiKey: "key", fetch, maxPageChars: 20 });

    const page = await jina.read("https://nextjs.org/blog");

    expect(page).toEqual({
      title: "Blog",
      url: "https://nextjs.org/blog",
      content: "x".repeat(20),
      truncated: true,
    });
    const [, init] = fetch.mock.calls[0] ?? [];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      url: "https://nextjs.org/blog",
    });
    expect(init?.headers).toMatchObject({ "X-Token-Budget": "20000" });
  });

  it("explains a page over the token budget instead of paying for it", async () => {
    const jina = new Jina({
      apiKey: "key",
      fetch: fakeFetch(409, {
        name: "BudgetExceededError",
        message: "Token budget (20000) exceeded",
      }),
    });

    await expect(
      jina.read("https://github.com/vercel/next.js/releases"),
    ).rejects.toThrow("too long to read");
  });

  it("refuses something that is not a web page", async () => {
    const jina = new Jina({ apiKey: "key", fetch: fakeFetch(200, {}) });

    await expect(jina.read("file:///etc/passwd")).rejects.toBeInstanceOf(
      WebError,
    );
    await expect(jina.read("not a url")).rejects.toBeInstanceOf(WebError);
  });

  it("reports a rejected key in words the model can pass on", async () => {
    const jina = new Jina({
      apiKey: "bad",
      fetch: fakeFetch(401, { name: "AuthenticationRequiredError" }),
    });

    await expect(jina.search("anything")).rejects.toThrow("JINA_API_KEY");
  });
});
