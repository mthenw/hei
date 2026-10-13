import { describe, expect, it } from "vitest";
import { cleanTitle, titleFromMessage } from "./title";

describe("titleFromMessage", () => {
  it("uses the first non-empty line, with whitespace collapsed", () => {
    expect(titleFromMessage("\n\n  What's   on today?\nMore detail")).toBe(
      "What's on today?",
    );
  });

  it("cuts a long line at a word boundary", () => {
    expect(
      titleFromMessage(
        "Find me a quiet restaurant near the office for a team dinner next Thursday evening",
      ),
    ).toBe("Find me a quiet restaurant near the office for a team dinner…");
  });

  it("backs up to the previous word when the cut lands mid-word", () => {
    expect(
      titleFromMessage(
        "Find me a quiet restaurant near the office for a team dinners next Thursday",
      ),
    ).toBe("Find me a quiet restaurant near the office for a team…");
  });

  it("cuts a long unbroken word where it must", () => {
    expect(titleFromMessage("x".repeat(80))).toBe(`${"x".repeat(60)}…`);
  });

  it("falls back for a message with no text", () => {
    expect(titleFromMessage("   \n  ")).toBe("New chat");
  });
});

describe("cleanTitle", () => {
  it("strips quotes, a label and trailing punctuation", () => {
    expect(cleanTitle('Title: "Team dinner venue."')).toBe("Team dinner venue");
    expect(cleanTitle("**Weekly plan**\nExtra line")).toBe("Weekly plan");
  });

  it("refuses an empty reply", () => {
    expect(cleanTitle('  ""  ')).toBeUndefined();
  });
});
