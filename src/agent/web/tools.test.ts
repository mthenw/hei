import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import { MemoryStorage } from "@earendil-works/pi-durable";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEvents, chatMessages, emptyChatStream } from "@/lib/chat-stream";
import { Agent } from "../agent";
import { ModelCatalog } from "../model-catalog";
import { Jina } from "./jina";
import { webExtension } from "./tools";

const agents: Agent[] = [];
afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.close()));
});

/** Jina answering one search and one read, as its JSON API does. */
function fakeJina() {
  const fetch = vi.fn(async (url: URL | RequestInfo) => {
    const body = String(url).startsWith("https://s.jina.ai/")
      ? {
          data: [
            {
              title: "Next.js 16",
              url: "https://nextjs.org/blog/next-16",
              description: "Routing overhaul and Turbopack by default.",
              date: "Oct 21, 2025",
            },
          ],
        }
      : {
          data: {
            title: "Next.js 16",
            url: "https://nextjs.org/blog/next-16",
            content: "Turbopack is now the default bundler.",
          },
        };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { jina: new Jina({ apiKey: "key", fetch }), fetch };
}

describe("web tools", () => {
  it("search, read and cite in one reply", async () => {
    const models = createModels({
      authContext: {
        env: async () => undefined,
        fileExists: async () => false,
      },
    });
    const faux = fauxProvider({
      provider: "hei-dev",
      models: [{ id: "echo" }],
    });
    let toolResultsSeen: string[] = [];
    faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("web_search", { query: "next.js 16" })],
        {
          stopReason: "toolUse",
        },
      ),
      fauxAssistantMessage(
        [fauxToolCall("web_fetch", { url: "https://nextjs.org/blog/next-16" })],
        { stopReason: "toolUse" },
      ),
      (context) => {
        toolResultsSeen = context.messages
          .filter((message) => message.role === "toolResult")
          .map((message) =>
            message.content
              .map((block) => (block.type === "text" ? block.text : ""))
              .join(""),
          );
        return fauxAssistantMessage([
          fauxText(
            "Turbopack is the default [nextjs.org](https://nextjs.org/blog/next-16).",
          ),
        ]);
      },
    ]);
    models.setProvider(faux.provider);
    const { jina, fetch } = fakeJina();
    const agent = await Agent.open({
      storage: new MemoryStorage(),
      models,
      catalog: new ModelCatalog({ models, includeDevModel: true }),
      extensions: [webExtension(jina)],
    });
    agents.push(agent);

    const chatId = await agent.createChat();
    const sent = await agent.send(chatId, {
      content: "What changed in Next.js 16?",
      requestId: "web-1",
    });
    expect(await sent.settled()).toMatchObject({ status: "done" });

    // The model read the search results and the page as text.
    expect(toolResultsSeen[0]).toContain("1. Next.js 16");
    expect(toolResultsSeen[0]).toContain("https://nextjs.org/blog/next-16");
    expect(toolResultsSeen[1]).toContain(
      "Turbopack is now the default bundler.",
    );
    expect(fetch).toHaveBeenCalledTimes(2);

    // The chat shows both tool calls with their details, and the page as the reply's one source.
    const watch = await agent.watch(chatId);
    await watch.stop();
    const reply = chatMessages(
      applyEvents(emptyChatStream, [watch.snapshot]),
    ).at(-1);
    expect(reply).toMatchObject({
      role: "assistant",
      parts: [
        {
          type: "tool",
          name: "web_search",
          status: "done",
          details: { kind: "search", query: "next.js 16" },
        },
        {
          type: "tool",
          name: "web_fetch",
          status: "done",
          details: { kind: "page", title: "Next.js 16" },
        },
        { type: "text" },
      ],
      sources: [
        { url: "https://nextjs.org/blog/next-16", title: "Next.js 16" },
      ],
    });
  });
});
