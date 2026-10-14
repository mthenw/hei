import { describe, expect, it } from "vitest";
import {
  fromTyped,
  mentionedContacts,
  mentionOf,
  mentionsAsLinks,
  splitMentions,
  toTyped,
  typingMention,
  withoutMentions,
} from "./mentions";

const anna = mentionOf("Anna Kowalska", 42);
const ann = mentionOf("Anna", 7);

describe("mentions", () => {
  it("splits text around mentions and lists the contacts once", () => {
    const text = `Email ${anna} and ${ann}, cc ${anna}`;

    expect(splitMentions(text)).toEqual([
      "Email ",
      { name: "Anna Kowalska", contactId: 42 },
      " and ",
      { name: "Anna", contactId: 7 },
      ", cc ",
      { name: "Anna Kowalska", contactId: 42 },
    ]);
    expect(mentionedContacts(text)).toEqual([42, 7]);
    expect(withoutMentions(text)).toBe(
      "Email Anna Kowalska and Anna, cc Anna Kowalska",
    );
  });

  it("leaves text without mentions, and look-alikes, alone", () => {
    const text = "Mail me@example.com about [notes](https://example.com)";
    expect(splitMentions(text)).toEqual([text]);
    expect(withoutMentions(text)).toBe(text);
    expect(splitMentions("")).toEqual([]);
  });

  it("keeps names to one line without brackets", () => {
    expect(mentionOf(" Anna [Ania]\nKowalska ", 3)).toBe(
      "@[Anna Ania Kowalska](contact:3)",
    );
  });

  it("round-trips through typed text", () => {
    const text = `Ask ${anna} and ${ann} about Q4`;
    const typed = toTyped(text);

    expect(typed.text).toBe("Ask @Anna Kowalska and @Anna about Q4");
    expect(fromTyped(typed.text, typed.picked)).toBe(text);
  });

  it("turns only whole picked names into mentions", () => {
    const picked = new Map([
      ["Anna", 7],
      ["Anna Kowalska", 42],
    ]);

    expect(fromTyped("@Anna Kowalska, @Anna, @Annabel, @Bob", picked)).toBe(
      `${anna}, ${ann}, @Annabel, @Bob`,
    );
    // An edited name is plain text again.
    expect(fromTyped("@Anna Kowalsk", new Map([["Anna Kowalska", 42]]))).toBe(
      "@Anna Kowalsk",
    );
  });

  it("finds the mention being typed before the caret", () => {
    const at = (text: string) => typingMention(text, text.length);

    expect(at("Email @")).toEqual({ start: 6, query: "" });
    expect(at("Email @anna ko")).toEqual({ start: 6, query: "anna ko" });
    expect(at("@Łukasz")).toEqual({ start: 0, query: "Łukasz" });
    expect(at("(@ann")).toEqual({ start: 1, query: "ann" });
    // Not a mention: an address, an "@" alone, too many words, a new line.
    expect(at("me@exam")).toBeUndefined();
    expect(at("at @ 5pm")).toBeUndefined();
    expect(at("@anna kowalska about the")).toBeUndefined();
    expect(at("@anna\nhi")).toBeUndefined();
    expect(at("no mention")).toBeUndefined();
    // Only what's before the caret counts.
    expect(typingMention("Ask @an about it", 7)).toEqual({
      start: 4,
      query: "an",
    });
  });

  it("writes mentions as markdown links that survive the renderer", () => {
    expect(mentionsAsLinks(`Ask ${anna}.`)).toBe(
      "Ask [@Anna Kowalska](#contact-42).",
    );
  });
});
