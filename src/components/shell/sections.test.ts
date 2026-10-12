import { describe, expect, it } from "vitest";
import { isPathActive, isSectionActive, settingsSection } from "./sections";

describe("isPathActive", () => {
  it("matches the path itself", () => {
    expect(isPathActive("/chat", "/chat")).toBe(true);
  });

  it("matches paths nested under it", () => {
    expect(isPathActive("/chat/abc123", "/chat")).toBe(true);
  });

  it("ignores sibling paths that share a prefix", () => {
    expect(isPathActive("/chats", "/chat")).toBe(false);
    expect(isPathActive("/calendar", "/chat")).toBe(false);
  });
});

describe("isSectionActive", () => {
  it("uses the section's match prefix when its link points deeper", () => {
    expect(isSectionActive("/settings/connections", settingsSection)).toBe(
      true,
    );
  });
});
