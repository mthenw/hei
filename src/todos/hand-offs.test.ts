import {
  createModels,
  type FauxResponseFactory,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  getCurrentTools,
} from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { afterEach, describe, expect, it } from "vitest";
import { Agent } from "@/agent/agent";
import { ModelCatalog } from "@/agent/model-catalog";
import { Chats } from "@/chats/chats";
import { openAppDatabase } from "@/db/database";
import { HandOffs, handOffExtension } from "./hand-offs";
import { Todos } from "./todos";
import { todosExtension } from "./tools";

const agents: Agent[] = [];
afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.close()));
});

type Message = { role: string; content?: unknown };

/** The text the user wrote last, without the send time Hei adds for the model. */
function lastUserText(messages: readonly Message[]): string {
  const last = messages.findLast((message) => message.role === "user");
  const content = last?.content;
  if (typeof content === "string") return content;
  return ((content ?? []) as { type: string; text?: string }[])
    .filter((part) => part.type === "text" && !part.text?.startsWith("<sent>"))
    .map((part) => part.text)
    .join("\n");
}

/**
 * A model that plays the agent: it asks a question when the todo says "Ask", and otherwise reports a result when it
 * can. It records the tools each request offered.
 */
async function setup(
  options: { maxWorking?: number; tokensPerSecond?: number } = {},
) {
  const models = createModels({
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  const faux = fauxProvider({
    provider: "hei-dev",
    models: [{ id: "echo" }],
    tokensPerSecond: options.tokensPerSecond,
  });
  const toolsOffered: string[][] = [];
  const reply: FauxResponseFactory = (context) => {
    faux.appendResponses([reply]);
    const tools = getCurrentTools(context.messages).map((tool) => tool.name);
    toolsOffered.push(tools);
    if (context.messages.at(-1)?.role === "toolResult")
      return fauxAssistantMessage([fauxText("Reported on the todo.")]);
    const text = lastUserText(context.messages);
    if (text.startsWith("Ask"))
      return fauxAssistantMessage([fauxText("Which day suits you?")]);
    if (text.startsWith("Slow"))
      return fauxAssistantMessage([
        fauxText("Working on it, slowly. ".repeat(40)),
      ]);
    if (tools.includes("report_result"))
      return fauxAssistantMessage(
        [
          fauxToolCall("report_result", {
            result: `Done: ${text.split("\n")[0]}`,
          }),
        ],
        { stopReason: "toolUse" },
      );
    return fauxAssistantMessage([fauxText("Hello.")]);
  };
  faux.setResponses([reply, reply, reply, reply]);
  models.setProvider(faux.provider);

  const db = await openAppDatabase(":memory:");
  const todos = new Todos(db, { timeZone: () => "Europe/Warsaw" });
  const extension = handOffExtension(todos);
  const agent = await Agent.open({
    storage: new MemoryStorage(),
    models,
    catalog: new ModelCatalog({ models, includeDevModel: true }),
    extensions: [todosExtension(todos)],
    optionalExtensions: [extension],
  });
  agents.push(agent);
  const chats = new Chats(agent, db, { writeTitle: async () => undefined });
  const handOffs = new HandOffs({
    todos,
    chats,
    agent,
    extension,
    maxWorking: options.maxWorking,
  });
  return { todos, chats, handOffs, toolsOffered };
}

describe("HandOffs", () => {
  it("starts an agent in a chat of its own, which reports its result on the todo", async () => {
    const { todos, chats, handOffs, toolsOffered } = await setup();
    const { id } = await todos.add({
      title: "Find a plumber",
      priority: "high",
    });

    const started = await handOffs.handOff(id);
    expect(started.agent).toMatchObject({ status: "working" });
    await handOffs.settled();

    const todo = await todos.get(id);
    expect(todo.agent).toMatchObject({
      status: "ready",
      result: "Done: Find a plumber",
      error: null,
    });
    // The agent's chat is an ordinary chat, titled after the todo.
    expect(await chats.list()).toMatchObject([
      { id: todo.agent?.chatId, title: "Find a plumber" },
    ]);
    expect(toolsOffered[0]).toContain("report_result");
    expect(todo.done).toBe(false);
  });

  it("waits for the user when the agent asks, and carries on when they answer", async () => {
    const { todos, chats, handOffs } = await setup();
    const { id } = await todos.add({ title: "Ask which day to book" });

    await handOffs.handOff(id);
    await handOffs.settled();
    const asking = await todos.get(id);
    expect(asking.agent).toMatchObject({ status: "needs_you", result: null });

    await chats.send(asking.agent?.chatId ?? 0, {
      content: "Friday works",
      requestId: "answer-1",
    });
    expect((await todos.get(id)).agent?.status).toBe("working");
    await handOffs.settled();

    expect((await todos.get(id)).agent).toMatchObject({
      status: "ready",
      result: "Done: Friday works",
    });
  });

  it("queues hand-offs beyond the limit and starts them in order", async () => {
    const { todos, handOffs } = await setup({ maxWorking: 1 });
    const first = await todos.add({ title: "First errand" });
    const second = await todos.add({ title: "Second errand" });

    await handOffs.handOff(first.id);
    expect((await handOffs.handOff(second.id)).agent?.status).toBe("queued");
    await handOffs.settled();

    expect((await todos.get(first.id)).agent?.status).toBe("ready");
    expect((await todos.get(second.id)).agent?.status).toBe("ready");
  });

  it("stops an agent on request, and when its todo is done", async () => {
    const { todos, handOffs } = await setup({ tokensPerSecond: 50 });
    const stopped = await todos.add({ title: "Slow research" });
    const completed = await todos.add({ title: "Slow shopping" });

    await handOffs.handOff(stopped.id);
    await handOffs.handOff(completed.id);
    await handOffs.stop(stopped.id);
    await todos.update(completed.id, { done: true });
    await handOffs.settled();

    expect((await todos.get(stopped.id)).agent?.status).toBe("stopped");
    expect((await todos.get(completed.id)).agent?.status).toBe("stopped");
  });

  it("keeps the agent's tools out of other chats", async () => {
    const { chats, toolsOffered } = await setup();

    const id = await chats.start({ content: "Hi", requestId: "plain-1" });
    await chats.settled(id);

    expect(toolsOffered[0]).toContain("add_todo");
    expect(toolsOffered[0]).not.toContain("report_result");
  });
});
