import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { EntryRecord } from "@earendil-works/pi-durable";
import { describe, expect, it } from "vitest";
import {
  type ChatStreamState,
  chatMessages,
  emptyChatStream,
} from "./chat-stream";

let nextId = 1;

function user(text: string): EntryRecord {
  return {
    id: nextId++,
    conversationId: 1,
    kind: "pi.user",
    model: [{ role: "user", content: text, timestamp: 0 }],
  } as unknown as EntryRecord;
}

function assistant(
  text: string,
  stopReason: AssistantMessage["stopReason"] = "stop",
): EntryRecord {
  const message: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "test",
    provider: "test",
    model: "test-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: 0,
  };
  return {
    id: nextId++,
    conversationId: 1,
    kind: "pi.assistant",
    model: [message],
  } as unknown as EntryRecord;
}

const state = (entries: EntryRecord[]): ChatStreamState => ({
  ...emptyChatStream,
  entries,
});

const replyTexts = (entries: EntryRecord[]) =>
  chatMessages(state(entries)).map((message) =>
    message.role === "user"
      ? `user: ${message.text}`
      : `assistant: ${message.parts.map((part) => (part.type === "text" ? part.text : part.type)).join(" + ")}${message.stopped ? " (stopped)" : ""}${message.error ? ` (error: ${message.error})` : ""}`,
  );

describe("chatMessages", () => {
  it("drops a response cut off by a restart once the run answers again", () => {
    expect(
      replyTexts([
        user("Hi"),
        assistant("Hel", "aborted"),
        assistant("Hello!"),
      ]),
    ).toEqual(["user: Hi", "assistant: Hello!"]);
  });

  it("drops a failed attempt once a retry answers", () => {
    expect(
      replyTexts([user("Hi"), assistant("Hel", "error"), assistant("Hello!")]),
    ).toEqual(["user: Hi", "assistant: Hello!"]);
  });

  it("keeps a reply the user stopped, marked as stopped", () => {
    expect(
      replyTexts([user("Hi"), assistant("Hel", "aborted"), user("Again")]),
    ).toEqual(["user: Hi", "assistant: Hel (stopped)", "user: Again"]);
  });
});
