import { normalizeUrl, type Source } from "./chat-stream";

export type Citation = Source & { number: number };

export type Citations = {
  /** The citation number of a linked URL, if it is one of the reply's sources. */
  numberOf: (url: string) => number | undefined;
  /** The cited sources, in number order. */
  cited: Citation[];
};

// A markdown link with an http(s) target: [text](url) or [text](<url>), optionally with a title.
const LINK = /\[[^\]]*\]\(\s*<?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g;

/**
 * Number a reply's sources in the order its text first links to them. Hei asks the model to cite with links to the
 * exact pages its web tools returned; a link to any other page stays an ordinary link.
 */
export function citations(
  texts: readonly string[],
  sources: readonly Source[],
): Citations {
  const byUrl = new Map(
    sources.map((source) => [normalizeUrl(source.url), source]),
  );
  const numbers = new Map<string, number>();
  const cited: Citation[] = [];
  for (const text of texts)
    for (const match of text.matchAll(LINK)) {
      const key = normalizeUrl(match[1] ?? "");
      const source = byUrl.get(key);
      if (source === undefined || numbers.has(key)) continue;
      numbers.set(key, cited.length + 1);
      cited.push({ ...source, number: cited.length + 1 });
    }
  return { numberOf: (url) => numbers.get(normalizeUrl(url)), cited };
}
