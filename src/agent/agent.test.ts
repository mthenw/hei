import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import {
  type AgentEvent,
  MemoryStorage,
  type Storage,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyEvents,
  type ChatMessage,
  type ChatStreamState,
  chatMessages,
  emptyChatStream,
} from "@/lib/chat-stream";
import { Agent, type ChatId } from "./agent";
import { createDevModel, DEV_MODEL } from "./dev-model";

const openAgents: Agent[] = [];

afterEach(async () => {
  await Promise.all(openAgents.splice(0).map((agent) => agent.close()));
});

async function openAgent(
  options: { storage?: Storage; tokensPerSecond?: number } = {},
) {
  const models = createModels();
  models.setProvider(
    createDevModel({ tokensPerSecond: options.tokensPerSecond }).provider,
  );
  const agent = await Agent.open({
    storage: options.storage ?? new MemoryStorage(),
    models,
    defaultModel: DEV_MODEL,
  });
  openAgents.push(agent);
  return agent;
}

let counter = 0;
const message = (content: string) => ({
  content,
  requestId: `test-${++counter}`,
});

async function startChat(agent: Agent, content: string): Promise<ChatId> {
  const chatId = await agent.createChat();
  await agent.send(chatId, message(content));
  return chatId;
}

/** Follow a chat until Hei has answered every message and gone idle. */
async function settle(
  agent: Agent,
  chatId: ChatId,
  onEvents?: (events: readonly AgentEvent[], state: ChatStreamState) => void,
): Promise<ChatStreamState> {
  const stream = await agent.watch(chatId);
  let state = applyEvents(emptyChatStream, [stream.snapshot]);
  const answered = (current: ChatStreamState) =>
    !current.running &&
    current.queued === 0 &&
    chatMessages(current).at(-1)?.role === "assistant";
  if (answered(state)) {
    await stream.stop();
    return state;
  }
  return new Promise((resolve) => {
    stream.start(async (events) => {
      state = applyEvents(state, events);
      onEvents?.(events, state);
      if (answered(state)) {
        resolve(state);
        void stream.stop();
      }
    });
  });
}

const text = (message: ChatMessage | undefined) =>
  message?.role === "assistant"
    ? message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("")
    : message?.text;

describe("Agent", () => {
  it("answers a new chat with reasoning and streamed text", async () => {
    const agent = await openAgent();
    const chatId = await startChat(agent, "Hello Hei");

    const state = await settle(agent, chatId);
    const [user, reply] = chatMessages(state);

    expect(user).toEqual({
      role: "user",
      key: expect.any(String),
      text: "Hello Hei",
    });
    expect(reply).toMatchObject({
      role: "assistant",
      model: "echo",
      streaming: false,
    });
    expect(reply?.role === "assistant" && reply.parts[0]).toMatchObject({
      type: "reasoning",
      streaming: false,
    });
    expect(text(reply)).toContain("> Hello Hei");
    expect(state.failure).toBeUndefined();
  });

  it("builds the same messages from live events as from a late snapshot", async () => {
    const agent = await openAgent({ tokensPerSecond: 400 });
    const chatId = await startChat(agent, "Stream this");
    let sawPartial = false;

    const live = await settle(agent, chatId, (_events, state) => {
      if (state.partial !== undefined) sawPartial = true;
    });
    const late = await settle(agent, chatId);

    expect(sawPartial).toBe(true);
    expect(chatMessages(live)).toEqual(chatMessages(late));
  });

  it("queues a message sent while busy and answers it next", async () => {
    const agent = await openAgent({ tokensPerSecond: 400 });
    const chatId = await startChat(agent, "First");
    await agent.send(chatId, message("Second"));
    let maxQueued = 0;

    const state = await settle(agent, chatId, (_events, current) => {
      maxQueued = Math.max(maxQueued, current.queued);
    });

    expect(maxQueued).toBe(1);
    expect(
      chatMessages(state).map((m) => [m.role, text(m)?.split("\n")[0]]),
    ).toEqual([
      ["user", "First"],
      ["assistant", "You said:"],
      ["user", "Second"],
      ["assistant", "You said:"],
    ]);
  });

  it("stops a run on request without reporting a failure", async () => {
    const agent = await openAgent({ tokensPerSecond: 40 });
    const chatId = await startChat(agent, "Stop me");

    const stream = await agent.watch(chatId);
    await new Promise<void>((resolve) => {
      stream.start(async (events) => {
        if (events.some((event) => event.type === "message_update")) resolve();
      });
    });
    await stream.stop();
    await agent.stop(chatId);

    const state = await settle(agent, chatId);
    const reply = chatMessages(state).at(-1);
    expect(state.running).toBe(false);
    expect(state.failure).toBeUndefined();
    expect(reply).toMatchObject({ role: "assistant", stopped: true });
  });

  it("resumes an interrupted run after the process reopens its storage", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "hei-agent-"));
    const file = path.join(dir, "agent.sqlite");
    try {
      const first = await openAgent({
        storage: await openNodeSqliteStorage(file),
        tokensPerSecond: 40,
      });
      const chatId = await startChat(first, "Survive a restart");
      const stream = await first.watch(chatId);
      await new Promise<void>((resolve) => {
        stream.start(async (events) => {
          if (events.some((event) => event.type === "message_update"))
            resolve();
        });
      });
      await stream.stop();
      openAgents.splice(openAgents.indexOf(first), 1);
      await first.close();

      const second = await openAgent({
        storage: await openNodeSqliteStorage(file),
        tokensPerSecond: 400,
      });
      const state = await settle(second, chatId);

      // The cut-off response is replaced by the resumed one, not shown above it.
      const reply = text(chatMessages(state).at(-1)) ?? "";
      expect(reply.match(/> Survive a restart/g)).toHaveLength(1);
      expect(state.failure).toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
