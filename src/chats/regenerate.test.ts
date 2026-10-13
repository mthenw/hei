import {
  createModels,
  type FauxResponseFactory,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
} from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { afterEach, describe, expect, it } from "vitest";
import { Agent, type ChatId, NothingToRegenerate } from "@/agent";
import type { Catalog } from "@/agent/model-catalog";
import { openAppDatabase } from "@/db/database";
import { applyEvents, chatMessages, emptyChatStream } from "@/lib/chat-stream";
import { Chats } from "./chats";

const MODEL = { provider: "recorder", modelId: "r1" };

const agents: Agent[] = [];
afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.close()));
});

/** A model that numbers its answers and records the user and assistant turns it was shown for each one. */
async function setup() {
  const models = createModels({
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  const requests: string[][] = [];
  const faux = fauxProvider({
    provider: MODEL.provider,
    models: [{ id: MODEL.modelId }],
  });
  const reply: FauxResponseFactory = (context) => {
    faux.appendResponses([reply]);
    requests.push(
      context.messages
        .filter(({ role }) => role === "user" || role === "assistant")
        .map(summarize),
    );
    return fauxAssistantMessage([fauxText(`Answer ${requests.length}`)]);
  };
  faux.setResponses([reply, reply]);
  models.setProvider(faux.provider);

  const choice = { ...MODEL, name: "Recorder", family: "Claude" as const };
  const catalog: Catalog = {
    available: async () => [choice],
    isAvailable: async () => true,
    defaultModel: async () => MODEL,
    sideJobModel: async () => undefined,
    backupFor: async () => undefined,
    invalidate: () => {},
  };
  const agent = await Agent.open({
    storage: new MemoryStorage(),
    models,
    catalog,
  });
  agents.push(agent);
  const chats = new Chats(agent, await openAppDatabase(":memory:"));
  return { agent, chats, requests };
}

/** "user: …" or "assistant: …", without the send-time stamp Hei adds for the model. */
function summarize(message: { role: string; content: unknown }): string {
  const content =
    typeof message.content === "string"
      ? message.content
      : (message.content as { type: string; text?: string }[])
          .filter(
            (part) => part.type === "text" && !part.text?.startsWith("<sent>"),
          )
          .map((part) => part.text)
          .join("");
  return `${message.role}: ${content}`;
}

/** The chat as the UI shows it, in the same form. */
async function shown(agent: Agent, chatId: ChatId): Promise<string[]> {
  const watch = await agent.watch(chatId);
  await watch.stop();
  const messages = chatMessages(applyEvents(emptyChatStream, [watch.snapshot]));
  return messages.map((message) =>
    message.role === "user"
      ? `user: ${message.text}`
      : `assistant: ${message.parts
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("")}`,
  );
}

let counter = 0;
const message = (content: string) => ({
  content,
  requestId: `regenerate-${++counter}`,
});

describe("Regenerate", () => {
  it("answers the last message again, in place of its reply", async () => {
    const { agent, chats, requests } = await setup();
    const id = await chats.start(message("First"));
    await chats.settled(id);
    await chats.send(id, message("Second"));
    await chats.settled(id);

    await chats.regenerate(id, "regenerate-once");
    await chats.settled(id);

    expect(await shown(agent, id)).toEqual([
      "user: First",
      "assistant: Answer 1",
      "user: Second",
      "assistant: Answer 3",
    ]);
    // The model reads the message once and never sees the reply it replaces.
    expect(requests.at(-1)).toEqual([
      "user: First",
      "assistant: Answer 1",
      "user: Second",
    ]);
  });

  it("can regenerate the same reply again", async () => {
    const { agent, chats, requests } = await setup();
    const id = await chats.start(message("Only message"));
    await chats.settled(id);

    await chats.regenerate(id, "regenerate-first");
    await chats.settled(id);
    await chats.regenerate(id, "regenerate-second");
    await chats.settled(id);

    expect(await shown(agent, id)).toEqual([
      "user: Only message",
      "assistant: Answer 3",
    ]);
    expect(requests).toEqual([
      ["user: Only message"],
      ["user: Only message"],
      ["user: Only message"],
    ]);
  });

  it("keeps the conversation going after a regenerated reply", async () => {
    const { agent, chats, requests } = await setup();
    const id = await chats.start(message("First"));
    await chats.settled(id);
    await chats.regenerate(id, "regenerate-then-continue");
    await chats.settled(id);

    await chats.send(id, message("Next"));
    await chats.settled(id);

    expect(await shown(agent, id)).toEqual([
      "user: First",
      "assistant: Answer 2",
      "user: Next",
      "assistant: Answer 3",
    ]);
    expect(requests.at(-1)).toEqual([
      "user: First",
      "assistant: Answer 2",
      "user: Next",
    ]);
  });

  it("refuses a chat with no message to answer", async () => {
    const { agent } = await setup();
    const id = await agent.createChat();

    await expect(agent.regenerate(id, "regenerate-empty")).rejects.toSatisfy(
      NothingToRegenerate.is,
    );
  });
});
