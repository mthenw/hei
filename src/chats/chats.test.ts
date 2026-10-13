import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Agent, ChatNotFound, ModelUnavailable } from "@/agent";
import { openTestAgent } from "@/agent/testing";
import { openAppDatabase } from "@/db/database";
import { Chats, InvalidTitle } from "./chats";

let agent: Agent;
let chats: Chats;
let clock: number;

beforeEach(async () => {
  agent = await openTestAgent();
  clock = Date.UTC(2026, 9, 13, 9, 0);
  chats = new Chats(agent, await openAppDatabase(":memory:"), {
    now: () => clock,
  });
});

afterEach(async () => {
  await agent.close();
});

let counter = 0;
const message = (content: string, requestId = `req-${++counter}`) => ({
  content,
  requestId,
});

describe("Chats", () => {
  it("starts a chat titled after its first message", async () => {
    const id = await chats.start(message("Plan my week\nwith details"));

    expect(await chats.list()).toEqual([
      { id, title: "Plan my week", updatedAt: clock },
    ]);
  });

  it("returns the same chat when a start is retried", async () => {
    const first = await chats.start(message("Hello", "same-request"));
    const retry = await chats.start(message("Hello", "same-request"));

    expect(retry).toBe(first);
    expect(await chats.list()).toHaveLength(1);
  });

  it("lists the most recently active chat first", async () => {
    const older = await chats.start(message("Older"));
    clock += 1000;
    const newer = await chats.start(message("Newer"));
    clock += 1000;
    await chats.send(older, message("Back to this one"));

    expect((await chats.list()).map((chat) => chat.id)).toEqual([older, newer]);
  });

  it("renames a chat", async () => {
    const id = await chats.start(message("Hello"));
    await chats.rename(id, "  Weekly   plan ");

    expect((await chats.list())[0]?.title).toBe("Weekly plan");
  });

  it("rejects an empty title", async () => {
    const id = await chats.start(message("Hello"));

    await expect(chats.rename(id, "   ")).rejects.toSatisfy(InvalidTitle.is);
  });

  it("deletes a chat so it can no longer be used", async () => {
    const id = await chats.start(message("Hello"));
    await chats.delete(id);

    expect(await chats.list()).toEqual([]);
    await expect(chats.send(id, message("Still there?"))).rejects.toSatisfy(
      ChatNotFound.is,
    );
    await expect(chats.watch(id)).rejects.toSatisfy(ChatNotFound.is);
  });

  it("refuses chats it does not know, even if the agent has the conversation", async () => {
    const orphan = await agent.createChat();

    await expect(chats.send(orphan, message("Hi"))).rejects.toSatisfy(
      ChatNotFound.is,
    );
    await expect(chats.rename(orphan, "Title")).rejects.toSatisfy(
      ChatNotFound.is,
    );
  });

  it("notifies subscribers of every change to the list", async () => {
    let changes = 0;
    const unsubscribe = chats.subscribe(() => changes++);

    const id = await chats.start(message("Hello"));
    await chats.send(id, message("Again"));
    await chats.rename(id, "Renamed");
    await chats.delete(id);
    unsubscribe();
    await chats.start(message("After unsubscribing"));

    expect(changes).toBe(4);
  });

  it("replaces the provisional title with a written one once Hei answers", async () => {
    const titled = new Chats(agent, await openAppDatabase(":memory:"), {
      writeTitle: async (first, answer) =>
        answer.includes("You said") ? `About: ${first}` : undefined,
    });
    const id = await titled.start(message("dinner plans"));
    await titled.titled(id);

    expect((await titled.list())[0]?.title).toBe("About: dinner plans");
  });

  it("keeps a title the user set before the written one arrives", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const titled = new Chats(agent, await openAppDatabase(":memory:"), {
      writeTitle: async () => {
        await gate;
        return "Written title";
      },
    });
    const id = await titled.start(message("dinner plans"));
    await titled.rename(id, "My name for it");
    release();
    await titled.titled(id);

    expect((await titled.list())[0]?.title).toBe("My name for it");
  });

  it("starts a chat on a chosen model and refuses one that isn't available", async () => {
    const id = await chats.start(message("Hello"), {
      provider: "hei-dev",
      modelId: "echo",
    });
    expect(id).toBeGreaterThan(0);

    const claude = { provider: "anthropic", modelId: "claude-sonnet-5-5" };
    await expect(chats.start(message("Hi"), claude)).rejects.toSatisfy(
      ModelUnavailable.is,
    );
    await expect(chats.setModel(id, claude)).rejects.toSatisfy(
      ModelUnavailable.is,
    );
  });
});
