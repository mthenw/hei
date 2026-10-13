import {
  createModels,
  type FauxResponseFactory,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
} from "@earendil-works/pi-ai";
import { MemoryStorage, type ModelRef } from "@earendil-works/pi-durable";
import { afterEach, describe, expect, it } from "vitest";
import { Agent, type ChatId } from "@/agent";
import type { Catalog, ModelChoice } from "@/agent/model-catalog";
import { ProviderPauses } from "@/agent/provider-pauses";
import { openAppDatabase } from "@/db/database";
import { applyEvents, chatMessages, emptyChatStream } from "@/lib/chat-stream";
import { Chats } from "./chats";

// Two accounts. A stands for the default plan and B for the other one.
const A = { provider: "plan-a", modelId: "a1" };
const B = { provider: "plan-b", modelId: "b1" };
const USAGE_LIMIT =
  '429 {"error":{"code":"subscription_sharing_usage_limit_exceeded"}}';

const agents: Agent[] = [];
afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.close()));
});

async function setup(options: {
  aHitsLimit?: boolean;
  hasB?: boolean;
  aTokensPerSecond?: number;
}) {
  const { aHitsLimit = true, hasB = true } = options;
  const models = createModels({
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  const a = fauxProvider({
    provider: A.provider,
    models: [{ id: A.modelId }],
    tokensPerSecond: options.aTokensPerSecond,
  });
  const aReply: FauxResponseFactory = () => {
    a.appendResponses([aReply]);
    return aHitsLimit
      ? fauxAssistantMessage([], {
          stopReason: "error",
          errorMessage: USAGE_LIMIT,
        })
      : fauxAssistantMessage([
          fauxText(
            "Answer from A, which goes on for a while so it is still streaming.",
          ),
        ]);
  };
  a.setResponses([aReply, aReply]);
  models.setProvider(a.provider);

  // How many user messages B saw in each request, to check a resent message isn't read twice.
  const bSawUserMessages: number[] = [];
  const b = fauxProvider({ provider: B.provider, models: [{ id: B.modelId }] });
  const bReply: FauxResponseFactory = (context) => {
    b.appendResponses([bReply]);
    bSawUserMessages.push(
      context.messages.filter((message) => message.role === "user").length,
    );
    return fauxAssistantMessage([fauxText("Answer from B")]);
  };
  b.setResponses([bReply, bReply]);
  if (hasB) models.setProvider(b.provider);

  const pauses = ProviderPauses.inMemory();
  const choices: ModelChoice[] = [
    { ...A, name: "Model A", family: "ChatGPT" },
    ...(hasB ? [{ ...B, name: "Model B", family: "Claude" as const }] : []),
  ];
  const offered = (model: ModelRef) =>
    choices.some((choice) => choice.provider === model.provider);
  const catalog: Catalog = {
    available: async () => choices,
    isAvailable: async (model) => offered(model),
    defaultModel: async () => A,
    sideJobModel: async () => undefined,
    backupFor: async (model) => {
      const other = model.provider === A.provider ? B : A;
      return offered(other) && !pauses.isPaused(other.provider)
        ? other
        : undefined;
    },
    invalidate: () => {},
  };

  const agent = await Agent.open({
    storage: new MemoryStorage(),
    models,
    catalog,
  });
  agents.push(agent);
  const chats = new Chats(agent, await openAppDatabase(":memory:"), {
    pauses,
  });
  return { agent, chats, pauses, bSawUserMessages };
}

async function shown(agent: Agent, chatId: ChatId) {
  const watch = await agent.watch(chatId);
  await watch.stop();
  const state = applyEvents(emptyChatStream, [watch.snapshot]);
  return { state, messages: chatMessages(state) };
}

let counter = 0;
const message = (content: string) => ({
  content,
  requestId: `failover-${++counter}`,
});

describe("Failover", () => {
  it("switches to the other account and answers there when a limit stops a reply", async () => {
    const { agent, chats, pauses, bSawUserMessages } = await setup({});

    const id = await chats.start(message("Plan my week"));
    await chats.settled(id);

    const { messages } = await shown(agent, id);
    expect(messages).toMatchObject([
      { role: "user", text: "Plan my week" },
      {
        role: "assistant",
        model: B,
        failover: { reason: "plan-a usage limit reached" },
        parts: [{ type: "text", text: "Answer from B" }],
      },
    ]);
    expect(messages[1]).not.toHaveProperty("error", expect.anything());
    expect(await agent.chatModel(id)).toEqual(B);
    expect(pauses.isPaused(A.provider)).toBe(true);
    // The message was sent again, but the model read it once.
    expect(bSawUserMessages).toEqual([1]);
  });

  it("explains the limit on the reply when no other account can take over", async () => {
    const { agent, chats } = await setup({ hasB: false });

    const id = await chats.start(message("Plan my week"));
    await chats.settled(id);

    const { messages } = await shown(agent, id);
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: "assistant",
      error: expect.stringContaining("plan-a usage limit reached"),
    });
    expect(await agent.chatModel(id)).toEqual(A);
  });

  it("moves a chat off a paused provider before sending", async () => {
    const { agent, chats, pauses, bSawUserMessages } = await setup({
      aHitsLimit: false,
    });
    await pauses.pause(A.provider, 60_000, "usage limit reached");

    const id = await chats.start(message("Hello"));
    await chats.settled(id);

    const { messages } = await shown(agent, id);
    expect(messages).toMatchObject([
      { role: "user", text: "Hello" },
      {
        role: "assistant",
        model: B,
        failover: { reason: "plan-a usage limit reached" },
      },
    ]);
    expect(bSawUserMessages).toEqual([1]);
  });

  it("ends a provider's pause when the user picks its model by hand", async () => {
    const { chats, pauses } = await setup({ aHitsLimit: false });
    const id = await chats.start(message("Hello"));
    await chats.settled(id);
    await pauses.pause(A.provider, 60_000, "usage limit reached");

    await chats.setModel(id, A);

    expect(pauses.isPaused(A.provider)).toBe(false);
  });

  it("returns from start while the reply is still being written", async () => {
    const { agent, chats } = await setup({
      aHitsLimit: false,
      aTokensPerSecond: 20,
    });

    const id = await chats.start(message("Hello"));

    expect((await shown(agent, id)).state.running).toBe(true);
    await chats.settled(id);
  });
});
