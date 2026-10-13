import { describe, expect, it } from "vitest";
import { openAppDatabase } from "@/db/database";
import { ProviderPauses } from "./provider-pauses";

describe("ProviderPauses", () => {
  it("skips a provider until its pause ends", async () => {
    let clock = 1_000;
    const pauses = ProviderPauses.inMemory(() => clock);

    await pauses.pause("openai", 30_000, "usage_limit");
    expect(pauses.isPaused("openai")).toBe(true);
    expect(pauses.isPaused("anthropic")).toBe(false);

    clock += 30_000;
    expect(pauses.isPaused("openai")).toBe(false);
  });

  it("remembers pauses across a restart", async () => {
    const db = await openAppDatabase(":memory:");
    const clock = () => 1_000;
    await (await ProviderPauses.open(db, clock)).pause(
      "anthropic",
      60_000,
      "credits",
    );

    const reopened = await ProviderPauses.open(db, clock);

    expect(reopened.active("anthropic")).toEqual({
      provider: "anthropic",
      until: 61_000,
      reason: "credits",
    });
  });

  it("ends a pause early on resume", async () => {
    const pauses = ProviderPauses.inMemory();
    await pauses.pause("openai", 60_000, "usage_limit");

    await pauses.resume("openai");

    expect(pauses.isPaused("openai")).toBe(false);
  });
});
