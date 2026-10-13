import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  getCurrentSystemPrompt,
  type Message,
} from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { afterEach, describe, expect, it } from "vitest";
import { Agent } from "./agent";
import { DEFAULT_INSTRUCTIONS, type Persona } from "./extension";
import { ModelCatalog } from "./model-catalog";

const agents: Agent[] = [];
afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.close()));
});

/** An Agent whose model records each request it receives. */
async function setup(persona: Persona) {
  const requests: Message[][] = [];
  const models = createModels({
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  const faux = fauxProvider({ provider: "hei-dev", models: [{ id: "echo" }] });
  const reply = (context: { messages: Message[] }) => {
    requests.push(context.messages);
    faux.appendResponses([reply]);
    return fauxAssistantMessage([fauxText("ok")]);
  };
  faux.setResponses([reply]);
  models.setProvider(faux.provider);
  const agent = await Agent.open({
    storage: new MemoryStorage(),
    models,
    catalog: new ModelCatalog({ models, includeDevModel: true }),
    persona: { get: () => persona },
  });
  agents.push(agent);
  return { agent, requests };
}

let counter = 0;
async function ask(agent: Agent, chatId: number, content: string) {
  const sent = await agent.send(chatId, {
    content,
    requestId: `persona-${++counter}`,
  });
  await sent.settled();
}

const lastUser = (messages: Message[]) =>
  messages.findLast((message) => message.role === "user");

describe("Hei's prompt", () => {
  it("is built from the Profile: instructions, language, about me and today's date", async () => {
    const { agent, requests } = await setup({
      about: "I live in Poznań and cycle to work.",
      timeZone: "America/New_York",
      replyLanguage: "Polski",
      instructions: "Answer in one sentence.",
    });
    const chatId = await agent.createChat();

    await ask(agent, chatId, "Hello");

    const prompt = getCurrentSystemPrompt(requests[0] ?? []);
    expect(prompt).toContain("You are Hei");
    expect(prompt).toContain("Answer in one sentence.");
    expect(prompt).not.toContain(DEFAULT_INSTRUCTIONS);
    expect(prompt).toContain("Always reply in Polski");
    expect(prompt).toContain("I live in Poznań and cycle to work.");
    expect(prompt).toMatch(
      /Today is \w+, \d+ \w+ \d{4} \(America\/New_York\)\./,
    );
  });

  it("uses the default instructions and the user's own language when the Profile is empty", async () => {
    const { agent, requests } = await setup({
      about: "",
      timeZone: "Europe/Warsaw",
      replyLanguage: null,
      instructions: null,
    });
    const chatId = await agent.createChat();

    await ask(agent, chatId, "Hello");

    const prompt = getCurrentSystemPrompt(requests[0] ?? []);
    expect(prompt).toContain(DEFAULT_INSTRUCTIONS);
    expect(prompt).toContain("Reply in the language the user writes in.");
    expect(prompt).not.toContain("told you about themselves");
  });

  it("stamps each user message with its send time for the model only", async () => {
    const { agent, requests } = await setup({
      about: "",
      timeZone: "Europe/Warsaw",
      replyLanguage: null,
      instructions: null,
    });
    const chatId = await agent.createChat();

    await ask(agent, chatId, "What time is it?");

    const user = lastUser(requests[0] ?? []);
    expect(Array.isArray(user?.content) && user.content[0]).toMatchObject({
      type: "text",
      text: expect.stringMatching(
        /^<sent>\d{1,2} \w{3} \d{4}, \d{2}:\d{2}<\/sent>$/,
      ),
    });
    // The chat itself keeps the message as the user wrote it.
    const watch = await agent.watch(chatId);
    await watch.stop();
    const stored = watch.snapshot.entries.find(
      (entry) => entry.kind === "pi.user",
    );
    expect(stored?.model?.[0]).toMatchObject({ content: "What time is it?" });
  });

  it("applies a Profile change from the next message", async () => {
    const persona: Persona = {
      about: "",
      timeZone: "Europe/Warsaw",
      replyLanguage: null,
      instructions: null,
    };
    const { agent, requests } = await setup(persona);
    const chatId = await agent.createChat();
    await ask(agent, chatId, "First");

    persona.instructions = "Talk like a pirate.";
    await ask(agent, chatId, "Second");

    expect(getCurrentSystemPrompt(requests[1] ?? [])).toContain(
      "Talk like a pirate.",
    );
  });
});
