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
import { GooglePlaces } from "./google-places";
import { placesExtension } from "./tools";

const agents: Agent[] = [];
afterEach(async () => {
  await Promise.all(agents.splice(0).map((agent) => agent.close()));
});

/** Google answering a text search with two places. */
function fakePlaces() {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          places: [
            {
              id: "ChIJ-ramen",
              displayName: { text: "Ramen-Ya" },
              formattedAddress: "Wrocławska 1, Poznań",
              location: { latitude: 52.408, longitude: 16.934 },
              primaryTypeDisplayName: { text: "Ramen restaurant" },
              rating: 4.6,
              userRatingCount: 1234,
              currentOpeningHours: { openNow: false },
            },
            {
              id: "ChIJ-noodle",
              displayName: { text: "Noodle Bar" },
              formattedAddress: "Półwiejska 2, Poznań",
              location: { latitude: 52.401, longitude: 16.928 },
              priceLevel: "PRICE_LEVEL_INEXPENSIVE",
            },
          ],
        }),
        { status: 200 },
      ),
  );
  return { places: new GooglePlaces({ apiKey: "key", fetch }), fetch };
}

describe("find_places", () => {
  it("gives the model the details and keeps only place IDs for the UI", async () => {
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
    let toolResult = "";
    faux.setResponses([
      fauxAssistantMessage(
        [fauxToolCall("find_places", { query: "ramen in Poznań" })],
        { stopReason: "toolUse" },
      ),
      (context) => {
        const result = context.messages.find(
          (message) => message.role === "toolResult",
        );
        toolResult =
          result?.content
            .map((block) => (block.type === "text" ? block.text : ""))
            .join("") ?? "";
        return fauxAssistantMessage([fauxText("Try Ramen-Ya (1).")]);
      },
    ]);
    models.setProvider(faux.provider);
    const { places, fetch } = fakePlaces();
    const agent = await Agent.open({
      storage: new MemoryStorage(),
      models,
      catalog: new ModelCatalog({ models, includeDevModel: true }),
      extensions: [placesExtension(places)],
    });
    agents.push(agent);

    const chatId = await agent.createChat();
    const sent = await agent.send(chatId, {
      content: "Ramen nearby?",
      requestId: "places-1",
    });
    expect(await sent.settled()).toMatchObject({ status: "done" });
    expect(fetch).toHaveBeenCalledTimes(1);

    expect(toolResult).toBe(
      [
        'Places for "ramen in Poznań":',
        "",
        "1. Ramen-Ya — Ramen restaurant",
        "   Wrocławska 1, Poznań",
        "   Rating 4.6 (1234 reviews) · Closed now",
        "",
        "2. Noodle Bar",
        "   Półwiejska 2, Poznań",
        "   Inexpensive prices",
      ].join("\n"),
    );

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
          name: "find_places",
          status: "done",
          details: {
            kind: "places",
            query: "ramen in Poznań",
            placeIds: ["ChIJ-ramen", "ChIJ-noodle"],
          },
        },
        { type: "text", text: "Try Ramen-Ya (1)." },
      ],
      // Places are not web sources: they get no citation chips.
      sources: [],
    });
  });
});
