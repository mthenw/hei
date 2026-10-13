import type { Credential } from "@earendil-works/pi-ai";
import { beforeEach, describe, expect, it } from "vitest";
import { type AppDatabase, openAppDatabase } from "@/db/database";
import { SecretBox } from "@/lib/secret-box";
import {
  CredentialsUnavailable,
  DatabaseCredentialStore,
} from "./credential-store";

const secret = "a-test-secret-that-is-long-enough";
const token: Credential = {
  type: "oauth",
  access: "access-1",
  refresh: "refresh-1",
  expires: 1,
};

let db: AppDatabase;
let store: DatabaseCredentialStore;

beforeEach(async () => {
  db = await openAppDatabase(":memory:");
  store = new DatabaseCredentialStore(db, new SecretBox(secret, "credentials"));
});

describe("DatabaseCredentialStore", () => {
  it("stores a ChatGPT sign-in and reads it back", async () => {
    await store.modify("openai", async () => token);

    expect(await store.read("openai")).toEqual(token);
    expect(await store.list()).toEqual([
      { providerId: "openai", type: "oauth" },
    ]);
  });

  it("keeps the current credential when the change returns nothing", async () => {
    await store.modify("openai", async () => token);
    const result = await store.modify("openai", async () => undefined);

    expect(result).toEqual(token);
    expect(await store.read("openai")).toEqual(token);
  });

  it("never stores a sign-in for Claude", async () => {
    await expect(
      store.modify("anthropic", async () => ({ ...token })),
    ).rejects.toSatisfy(CredentialsUnavailable.is);
    expect(await store.read("anthropic")).toBeUndefined();
  });

  it("runs changes to one provider one at a time", async () => {
    await store.modify("openai", async () => token);
    const seen: string[] = [];
    const refresh = (access: string) =>
      store.modify("openai", async (current) => {
        seen.push(current?.type === "oauth" ? current.access : "none");
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { ...token, access };
      });

    await Promise.all([refresh("access-2"), refresh("access-3")]);

    expect(seen).toEqual(["access-1", "access-2"]);
  });

  it("forgets a sign-in on delete", async () => {
    await store.modify("openai", async () => token);
    await store.delete("openai");

    expect(await store.read("openai")).toBeUndefined();
  });

  it("refuses to store without a secret, and to read under a different one", async () => {
    const withoutSecret = new DatabaseCredentialStore(db, undefined);
    await expect(
      withoutSecret.modify("openai", async () => token),
    ).rejects.toSatisfy(CredentialsUnavailable.is);

    await store.modify("openai", async () => token);
    const otherSecret = new DatabaseCredentialStore(
      db,
      new SecretBox("another-secret-long-enough", "credentials"),
    );
    await expect(otherSecret.read("openai")).rejects.toSatisfy(
      CredentialsUnavailable.is,
    );
  });
});
