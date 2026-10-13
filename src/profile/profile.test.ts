import { describe, expect, it } from "vitest";
import { openAppDatabase } from "@/db/database";
import { InvalidProfile, Profile } from "./profile";

describe("Profile", () => {
  it("starts empty, in Europe/Warsaw, matching the user's language", async () => {
    const profile = await Profile.open(await openAppDatabase(":memory:"));

    expect(profile.get()).toEqual({
      about: "",
      timeZone: "Europe/Warsaw",
      replyLanguage: null,
      instructions: null,
    });
  });

  it("saves changes and keeps them across a reopen", async () => {
    const db = await openAppDatabase(":memory:");
    const profile = await Profile.open(db);

    await profile.update({
      about: "  I live in Poznań and work on Hei.  ",
      timeZone: "America/New_York",
      replyLanguage: "Polski",
    });

    const reopened = await Profile.open(db);
    expect(reopened.get()).toEqual({
      about: "I live in Poznań and work on Hei.",
      timeZone: "America/New_York",
      replyLanguage: "Polski",
      instructions: null,
    });
  });

  it("treats blank instructions or language as the defaults", async () => {
    const profile = await Profile.open(await openAppDatabase(":memory:"));

    await profile.update({ instructions: "   ", replyLanguage: "" });

    expect(profile.get()).toMatchObject({
      instructions: null,
      replyLanguage: null,
    });
  });

  it("rejects a time zone that doesn't exist", async () => {
    const profile = await Profile.open(await openAppDatabase(":memory:"));

    await expect(
      profile.update({ timeZone: "Mars/Olympus" }),
    ).rejects.toSatisfy(InvalidProfile.is);
    expect(profile.get().timeZone).toBe("Europe/Warsaw");
  });

  it("rejects text that is too long", async () => {
    const profile = await Profile.open(await openAppDatabase(":memory:"));

    await expect(
      profile.update({ about: "x".repeat(10_001) }),
    ).rejects.toSatisfy(InvalidProfile.is);
  });
});
