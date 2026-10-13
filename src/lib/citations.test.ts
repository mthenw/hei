import { describe, expect, it } from "vitest";
import { citations } from "./citations";

const sources = [
  { url: "https://nextjs.org/blog/next-16", title: "Next.js 16" },
  { url: "https://react.dev/blog/react-19-3/", title: "React 19.3" },
  { url: "https://example.com/unused", title: "Unused" },
];

describe("citations", () => {
  it("numbers sources in the order the text first links to them", () => {
    const { cited, numberOf } = citations(
      [
        "React 19.3 shipped [react.dev](https://react.dev/blog/react-19-3) and Next.js 16 adopts it [nextjs.org](https://nextjs.org/blog/next-16#features).",
        "Again [react.dev](https://react.dev/blog/react-19-3/).",
      ],
      sources,
    );

    expect(cited.map((citation) => [citation.number, citation.title])).toEqual([
      [1, "React 19.3"],
      [2, "Next.js 16"],
    ]);
    expect(numberOf("https://nextjs.org/blog/next-16")).toBe(2);
  });

  it("leaves links to pages the tools didn't return as plain links", () => {
    const { cited, numberOf } = citations(
      ["See [the docs](https://nextjs.org/docs) for more."],
      sources,
    );

    expect(cited).toEqual([]);
    expect(numberOf("https://nextjs.org/docs")).toBeUndefined();
  });

  it("reads angle-bracket targets and link titles", () => {
    const { cited } = citations(
      ['[a](<https://nextjs.org/blog/next-16> "Next")'],
      sources,
    );

    expect(cited).toHaveLength(1);
  });
});
