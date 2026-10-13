import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { afterEach, describe, expect, it } from "vitest";
import { Agent } from "@/agent/agent";
import { ModelCatalog } from "@/agent/model-catalog";
import { openAppDatabase } from "@/db/database";
import { applyEvents, chatMessages, emptyChatStream } from "@/lib/chat-stream";
import { Todos } from "./todos";
import { todosExtension } from "./tools";

const agents: Agent[] = [];
afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.close()));
});

/** An agent whose model makes `calls` one after another, then answers, recording the tool results it saw. */
async function setup(
  calls: { name: string; args: Record<string, string | number | boolean> }[],
) {
  const models = createModels({
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  const faux = fauxProvider({ provider: "hei-dev", models: [{ id: "echo" }] });
  const results: string[] = [];
  faux.setResponses([
    ...calls.map(
      (call, index) =>
        (context: {
          messages: readonly { role: string; content?: unknown }[];
        }) => {
          if (index > 0) results.push(lastToolResult(context.messages));
          return fauxAssistantMessage([fauxToolCall(call.name, call.args)], {
            stopReason: "toolUse",
          });
        },
    ),
    (context: { messages: readonly { role: string; content?: unknown }[] }) => {
      results.push(lastToolResult(context.messages));
      return fauxAssistantMessage([fauxText("Done.")]);
    },
  ]);
  models.setProvider(faux.provider);
  const todos = new Todos(await openAppDatabase(":memory:"), {
    timeZone: () => "Europe/Warsaw",
    now: () => Date.UTC(2026, 9, 13, 9, 0),
  });
  const agent = await Agent.open({
    storage: new MemoryStorage(),
    models,
    catalog: new ModelCatalog({ models, includeDevModel: true }),
    extensions: [todosExtension(todos)],
  });
  agents.push(agent);
  return { agent, todos, results };
}

function lastToolResult(
  messages: readonly { role: string; content?: unknown }[],
): string {
  const result = messages.findLast((message) => message.role === "toolResult");
  return ((result?.content ?? []) as { type: string; text?: string }[])
    .map((block) => block.text ?? "")
    .join("");
}

async function run(agent: Agent, content: string) {
  const chatId = await agent.createChat();
  const sent = await agent.send(chatId, { content, requestId: content });
  expect(await sent.settled()).toMatchObject({ status: "done" });
  return chatId;
}

describe("todo tools", () => {
  it("add, complete, list and delete todos from a chat", async () => {
    const { agent, todos, results } = await setup([
      {
        name: "add_todo",
        args: {
          title: "Book dentist",
          due_date: "2026-10-14",
          priority: "high",
        },
      },
      { name: "add_todo", args: { title: "Buy milk" } },
      { name: "update_todo", args: { id: 2, done: true } },
      { name: "list_todos", args: {} },
      { name: "delete_todo", args: { id: 2 } },
    ]);

    const chatId = await run(agent, "Sort out my todos");

    expect(results).toEqual([
      'Added "Book dentist", due Tomorrow.',
      'Added "Buy milk".',
      'Completed "Buy milk".',
      "Upcoming:\n- #1 Book dentist · due Tomorrow (2026-10-14) · high priority",
      'Deleted "Buy milk".',
    ]);
    expect((await todos.list()).todos).toMatchObject([
      { id: 1, title: "Book dentist", dueDate: "2026-10-14", priority: "high" },
    ]);

    // The chat shows each call with what it did.
    const watch = await agent.watch(chatId);
    await watch.stop();
    const reply = chatMessages(
      applyEvents(emptyChatStream, [watch.snapshot]),
    ).at(-1);
    expect(
      reply?.role === "assistant" &&
        reply.parts.flatMap((part) =>
          part.type === "tool" ? [part.details] : [],
        ),
    ).toMatchObject([
      {
        kind: "todo",
        action: "added",
        todo: { title: "Book dentist" },
        today: "2026-10-13",
      },
      { kind: "todo", action: "added", todo: { title: "Buy milk" } },
      { kind: "todo", action: "completed", todo: { title: "Buy milk" } },
      { kind: "todo", action: "listed", open: 1 },
      { kind: "todo", action: "deleted", todo: { title: "Buy milk" } },
    ]);
  });

  it("tells the model what was wrong with a change", async () => {
    const { agent, results } = await setup([
      { name: "add_todo", args: { title: "Party", due_date: "next friday" } },
    ]);

    await run(agent, "Add a party");

    expect(results[0]).toContain("YYYY-MM-DD");
  });
});
