import { describe, expect, it } from "vitest";
import { classifyLimit } from "./limits";

const kind = (text: string) => classifyLimit(text)?.kind;

describe("classifyLimit", () => {
  it("recognises the ChatGPT plan's usage limit", () => {
    expect(
      kind(
        '429 {"error":{"code":"subscription_sharing_usage_limit_exceeded","message":"You have reached your usage limit"}}',
      ),
    ).toBe("usage_limit");
  });

  it("recognises used-up Anthropic credits", () => {
    expect(
      kind(
        "400 Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
      ),
    ).toBe("credits");
  });

  it("recognises a rate limit that outlasted the retries", () => {
    expect(
      kind('429 {"type":"error","error":{"type":"rate_limit_error"}}'),
    ).toBe("rate_limit");
  });

  it("recognises plan usage that is temporarily unavailable", () => {
    expect(kind("503 subscription_sharing_usage_unavailable")).toBe(
      "unavailable",
    );
  });

  it("leaves other failures alone", () => {
    expect(
      kind("400 Invalid request: messages must alternate"),
    ).toBeUndefined();
    expect(kind("Connection error.")).toBeUndefined();
  });

  it("pauses a provider longer for credits than for a usage window", () => {
    expect(classifyLimit("credit balance is too low")?.pauseMs).toBe(
      60 * 60 * 1000,
    );
    expect(
      classifyLimit("subscription_sharing_usage_limit_exceeded")?.pauseMs,
    ).toBe(30 * 60 * 1000);
  });
});
