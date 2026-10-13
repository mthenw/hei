import {
  type FauxResponseFactory,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxThinking,
} from "@earendil-works/pi-ai";

export const DEV_MODEL = { provider: "hei-dev", modelId: "echo" } as const;

/** Sending exactly this to the dev model makes it fail the way a used-up ChatGPT plan does, to try failover by hand. */
export const SIMULATE_LIMIT = "/limit";

/**
 * A scripted stand-in model: it streams a short reply that quotes the last user message. It exercises the whole chat
 * pipeline (thinking, streaming text, resume after restart) without a real provider.
 */
export function createDevModel(options: { tokensPerSecond?: number } = {}) {
  // Without tokensPerSecond the reply streams as fast as the event loop allows, which suits tests.
  const faux = fauxProvider({
    provider: DEV_MODEL.provider,
    models: [{ id: DEV_MODEL.modelId, name: "Hei dev model", reasoning: true }],
    tokensPerSecond: options.tokensPerSecond,
  });

  // The faux queue consumes one step per request. Every reply queues the next, and a few spares cover requests that
  // start in the same tick.
  const reply: FauxResponseFactory = (context) => {
    faux.appendResponses([reply]);
    const text = lastUserText(context.messages);
    return text.trim() === SIMULATE_LIMIT ? simulatedLimit() : devReply(text);
  };
  faux.setResponses(Array.from({ length: 4 }, () => reply));

  return faux;
}

function simulatedLimit() {
  return fauxAssistantMessage([], {
    stopReason: "error",
    errorMessage:
      '429 {"error":{"code":"subscription_sharing_usage_limit_exceeded","message":"Simulated by the dev model"}}',
  });
}

function devReply(userText: string) {
  const quoted = userText
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return fauxAssistantMessage([
    fauxThinking(
      `The user wrote ${userText.length} characters. I am the development model, so I quote it back.`,
    ),
    fauxText(
      [
        "You said:",
        "",
        quoted,
        "",
        "I'm Hei's **development model**, a scripted stand-in that streams this reply so the chat pipeline can be tested without a real provider.",
        "",
        "- Close the tab mid-reply and reopen the chat: the reply keeps going.",
        "- Restart the server mid-reply: it resumes by itself.",
      ].join("\n"),
    ),
  ]);
}

type TranscriptMessage = { role: string; content?: unknown };

function lastUserText(messages: readonly TranscriptMessage[]): string {
  const last = messages.findLast((message) => message.role === "user");
  if (last === undefined) return "";
  if (typeof last.content === "string") return last.content;
  if (!Array.isArray(last.content)) return "";
  return last.content
    .filter((part) => part?.type === "text")
    .map((part) => part.text)
    .join("\n");
}
