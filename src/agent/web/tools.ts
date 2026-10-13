import { Type } from "@earendil-works/pi-ai";
import {
  defineExtension,
  defineTool,
  type Extension,
  section,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import type { Jina, Page, SearchResult } from "./jina";

const RESULTS_PER_SEARCH = 5;

/** What a web tool's result carries for the UI, beside the text the model reads. */
export type WebToolDetails =
  | { kind: "search"; query: string; results: SearchResult[] }
  | { kind: "page"; url: string; title: string; truncated: boolean };

/** How Hei should use the web tools and cite what it found. */
export const WEB_INSTRUCTIONS = [
  "You can search the web with web_search and read a page with web_fetch.",
  "Use them for anything current, local or checkable that you aren't sure of: news, prices, schedules, opening hours, recent releases. Don't search for things you know well.",
  "Search first, then read the one or two most relevant pages when the snippets aren't enough. Prefer primary sources.",
  "Cite each fact you took from the web with a markdown link to the exact page you used, right after the claim, like [nextjs.org](https://nextjs.org/blog/next-16). Link only pages you searched or read. Don't add a list of sources at the end.",
].join("\n");

/** Web access as an extension: the two tools and the instructions for using and citing them. */
export function webExtension(jina: Jina): Extension {
  return defineExtension({
    name: "web",
    tools: webTools(jina),
    sections: [section("web", () => WEB_INSTRUCTIONS)],
  });
}

/** web_search and web_fetch over Jina. Both only read, so they are safe to run again after a restart. */
export function webTools(jina: Jina): ToolRegistration[] {
  const webSearch = defineTool({
    name: "web_search",
    description: `Search the web. Returns up to ${RESULTS_PER_SEARCH} results, each with title, URL, date when known, and a short snippet.`,
    parameters: Type.Object({
      query: Type.String({
        description:
          "What to search for, as you would type it into a search engine.",
      }),
    }),
    replay: "safe",
    execute: async (args, _api, context) => {
      const results = await jina.search(args.query, {
        count: RESULTS_PER_SEARCH,
        signal: context.abortSignal,
      });
      const details: WebToolDetails = {
        kind: "search",
        query: args.query,
        results,
      };
      return {
        content: [{ type: "text", text: searchText(args.query, results) }],
        details,
      };
    },
  });

  const webFetch = defineTool({
    name: "web_fetch",
    description:
      "Read a web page and get its main text as markdown. Very long pages are cut, and pages too large to read are refused.",
    parameters: Type.Object({
      url: Type.String({ description: "The full http(s) URL of the page." }),
    }),
    replay: "safe",
    execute: async (args, _api, context) => {
      const page = await jina.read(args.url, { signal: context.abortSignal });
      const details: WebToolDetails = {
        kind: "page",
        url: page.url,
        title: page.title,
        truncated: page.truncated,
      };
      return {
        content: [{ type: "text", text: pageText(page) }],
        details,
      };
    },
  });

  return [webSearch, webFetch];
}

function searchText(query: string, results: SearchResult[]): string {
  if (results.length === 0) return `No results for "${query}".`;
  return [
    `Results for "${query}":`,
    ...results.map((result, index) =>
      [
        `${index + 1}. ${result.title}`,
        `   ${result.url}`,
        result.date ? `   ${result.date}` : undefined,
        result.snippet ? `   ${result.snippet}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n\n");
}

function pageText(page: Page): string {
  return [
    `# ${page.title}`,
    `URL: ${page.url}`,
    "",
    page.content || "(The page has no readable text.)",
    page.truncated
      ? "\n[The page continues; only the beginning is shown.]"
      : "",
  ].join("\n");
}
