import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { type JsonObject, MemoryStorage } from "@earendil-works/pi-durable";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Agent } from "@/agent/agent";
import { ModelCatalog } from "@/agent/model-catalog";
import { CONTACTS_SCOPE, OTHER_CONTACTS_SCOPE } from "@/calendar/google";
import { openAppDatabase } from "@/db/database";
import { calendarAccounts } from "@/db/schema";
import { applyEvents, chatMessages, emptyChatStream } from "@/lib/chat-stream";
import { mentionOf } from "@/lib/mentions";
import { Contacts } from "./contacts";
import { fakePeople } from "./testing";
import { addContactDetails, contactsExtension } from "./tools";

type Seen = readonly { role: string; content?: unknown }[];

const agents: Agent[] = [];
afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.close()));
});

let contacts: Contacts;
let anna: number;

beforeEach(async () => {
  const db = await openAppDatabase(":memory:");
  await db.insert(calendarAccounts).values({
    provider: "google",
    name: "me@example.com",
    secret: "sealed",
    createdAt: new Date(),
  });
  const people = fakePeople();
  people.put("connections", {
    resourceName: "people/anna",
    names: [{ displayName: "Anna Kowalska" }],
    emailAddresses: [{ value: "anna@acme.example" }],
    organizations: [{ title: "CFO", name: "Acme" }],
  });
  people.put("connections", {
    resourceName: "people/bob",
    names: [{ displayName: "Bob" }],
  });
  contacts = new Contacts(db, {
    google: {
      googleAccounts: async () => [
        {
          id: 1,
          email: "me@example.com",
          scopes: [CONTACTS_SCOPE, OTHER_CONTACTS_SCOPE],
        },
      ],
      googleAccessToken: async () => "access",
    },
    fetch: people.fetch,
  });
  await contacts.syncNow();
  anna = (await contacts.search("anna"))[0].id;
});

/** An agent whose model makes `calls`, then answers; `seen` collects every request's messages. */
async function setup(calls: { name: string; args: JsonObject }[]) {
  const models = createModels({
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  const faux = fauxProvider({ provider: "hei-dev", models: [{ id: "echo" }] });
  const seen: Seen[] = [];
  faux.setResponses([
    ...calls.map((call) => (context: { messages: Seen }) => {
      seen.push(context.messages);
      return fauxAssistantMessage([fauxToolCall(call.name, call.args)], {
        stopReason: "toolUse",
      });
    }),
    (context: { messages: Seen }) => {
      seen.push(context.messages);
      return fauxAssistantMessage([fauxText("Done.")]);
    },
  ]);
  models.setProvider(faux.provider);
  const agent = await Agent.open({
    storage: new MemoryStorage(),
    models,
    catalog: new ModelCatalog({ models, includeDevModel: true }),
    extensions: [
      contactsExtension(contacts, {
        gmailAccount: async () => "me@example.com",
      }),
    ],
  });
  agents.push(agent);
  return { agent, seen };
}

function texts(message: { content?: unknown } | undefined): string {
  const content = message?.content;
  if (typeof content === "string") return content;
  return ((content ?? []) as { type: string; text?: string }[])
    .map((block) => block.text ?? "")
    .join("\n");
}

describe("contacts extension", () => {
  it("gives the model a mentioned contact's details, and drafts an email to them", async () => {
    const { agent, seen } = await setup([
      { name: "find_contacts", args: { query: "bob" } },
      {
        name: "draft_email",
        args: {
          to: [mentionOf("Anna Kowalska", anna)],
          cc: ["Bob <bob@example.com>"],
          subject: "Q4 numbers",
          body: "Hi Anna,\n\nCould you send the Q4 numbers?\n\nMaciej",
        },
      },
    ]);
    const chatId = await agent.createChat();
    const content = `Email ${mentionOf("Anna Kowalska", anna)} about Q4`;
    const sent = await agent.send(chatId, { content, requestId: "q4" });
    expect(await sent.settled()).toMatchObject({ status: "done" });

    const question = seen[0].find((message) => message.role === "user");
    expect(texts(question)).toContain(
      `<contacts>\n${mentionOf("Anna Kowalska", anna)}: anna@acme.example; CFO, Acme\n</contacts>`,
    );
    const found = seen[1].findLast((message) => message.role === "toolResult");
    expect(texts(found)).toMatch(
      /^@\[Bob\]\(contact:\d+\): no address or phone$/,
    );

    // The transcript keeps the message as written; the chat shows the draft.
    const watch = await agent.watch(chatId);
    await watch.stop();
    const messages = chatMessages(
      applyEvents(emptyChatStream, [watch.snapshot]),
    );
    expect(messages[0]).toMatchObject({ role: "user", text: content });
    const reply = messages.at(-1);
    expect(
      reply?.role === "assistant" &&
        reply.parts.flatMap((part) =>
          part.type === "tool" ? [part.details] : [],
        ),
    ).toEqual([
      { kind: "contacts", query: "bob", count: 1 },
      {
        kind: "email",
        account: "me@example.com",
        draft: {
          to: [{ name: "Anna Kowalska", email: "anna@acme.example" }],
          cc: [{ name: "Bob", email: "bob@example.com" }],
          subject: "Q4 numbers",
          body: "Hi Anna,\n\nCould you send the Q4 numbers?\n\nMaciej",
        },
      },
    ]);
  });

  it("refuses a draft to someone without an address", async () => {
    const [bob] = await contacts.search("bob");
    const { agent, seen } = await setup([
      {
        name: "draft_email",
        args: { to: [mentionOf("Bob", bob.id)], subject: "Hi", body: "Hi" },
      },
      {
        name: "draft_email",
        args: { to: ["not an address"], subject: "Hi", body: "Hi" },
      },
    ]);
    const chatId = await agent.createChat();
    await (
      await agent.send(chatId, { content: "Email Bob", requestId: "b" })
    ).settled();

    const result = (index: number) =>
      texts(seen[index].findLast((message) => message.role === "toolResult"));
    expect(result(1)).toContain("Bob has no email address in the contacts.");
    expect(result(2)).toContain("“not an address” isn't an email address");
  });

  it("says when a mentioned contact is gone", () => {
    const [message] = addContactDetails(
      [
        {
          role: "user",
          content: `Call ${mentionOf("Gone Person", 99)} and ${mentionOf("Gone Person", 99)}`,
          timestamp: 0,
        },
      ],
      new Map(),
    );
    expect(texts(message)).toContain(
      "<contacts>\n@[Gone Person](contact:99) is no longer in the contacts.\n</contacts>",
    );
  });
});
