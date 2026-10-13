import { describe, expect, it } from "vitest";
import { SecretBox } from "./secret-box";

const secret = "a-test-secret-that-is-long-enough";

describe("SecretBox", () => {
  it("opens what it sealed", () => {
    const box = new SecretBox(secret, "credentials");
    expect(box.open(box.seal('{"access":"token"}'))).toBe('{"access":"token"}');
  });

  it("never repeats a ciphertext for the same value", () => {
    const box = new SecretBox(secret, "credentials");
    expect(box.seal("same")).not.toBe(box.seal("same"));
  });

  it("refuses a value sealed under another secret or purpose", () => {
    const sealed = new SecretBox(secret, "credentials").seal("token");
    expect(() =>
      new SecretBox("another-secret-long-enough", "credentials").open(sealed),
    ).toThrow();
    expect(() => new SecretBox(secret, "other").open(sealed)).toThrow();
  });

  it("refuses an altered value", () => {
    const box = new SecretBox(secret, "credentials");
    const bytes = Buffer.from(box.seal("token"), "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => box.open(bytes.toString("base64"))).toThrow();
  });

  it("rejects a short secret", () => {
    expect(() => new SecretBox("short", "credentials")).toThrow();
  });
});
