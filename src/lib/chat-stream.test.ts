import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { EntryRecord } from "@earendil-works/pi-durable";
import { describe, expect, it } from "vitest";
import {
  applyEvents,
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
  model = "test-model",
): EntryRecord {
  const message: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "test",
    provider: "test",
    model,
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

describe("model changes", () => {
  it("marks only the first reply after the model changes", () => {
    const messages = chatMessages({
      ...emptyChatStream,
      entries: [
        user("One"),
        assistant("A", "stop", "gpt-6.1-sol"),
        user("Two"),
        assistant("B", "stop", "gpt-6.1-sol"),
        user("Three"),
        assistant("C", "stop", "claude-sonnet-5-5"),
        user("Four"),
        assistant("D", "stop", "claude-sonnet-5-5"),
      ],
    });

    expect(
      messages
        .filter((message) => message.role === "assistant")
        .map((message) => message.modelChanged),
    ).toEqual([false, false, true, false]);
  });
});

describe("waiting for a reply", () => {
  it("shows a reply in progress as soon as Hei starts on a message", () => {
    const messages = chatMessages({
      ...emptyChatStream,
      entries: [user("Hi")],
      running: true,
    });

    expect(messages.at(-1)).toMatchObject({
      role: "assistant",
      parts: [],
      streaming: true,
      waiting: true,
    });
  });

  it("keeps waiting while the model's reasoning is hidden", () => {
    const partial = assistant("").model?.[0] as AssistantMessage;
    partial.content = [{ type: "thinking", thinking: "" }];

    const reply = chatMessages({
      ...emptyChatStream,
      entries: [user("Hi")],
      running: true,
      partial,
    }).at(-1);

    expect(reply).toMatchObject({
      role: "assistant",
      waiting: true,
      parts: [],
    });
  });

  it("stops waiting once text streams in", () => {
    const partial = assistant("Hel").model?.[0] as AssistantMessage;

    const reply = chatMessages({
      ...emptyChatStream,
      entries: [user("Hi")],
      running: true,
      partial,
    }).at(-1);

    expect(reply).toMatchObject({ waiting: false, streaming: true });
  });

  it("doesn't show Thinking while a tool is working", () => {
    const call = assistant("", "toolUse").model?.[0] as AssistantMessage;
    call.content = [
      { type: "toolCall", id: "call-1", name: "web_fetch", arguments: {} },
    ];
    const entry = { ...assistant(""), model: [call] } as EntryRecord;

    const reply = chatMessages({
      ...emptyChatStream,
      entries: [user("Hi"), entry],
      running: true,
      toolOutput: { "call-1": "" },
    }).at(-1);

    expect(reply).toMatchObject({ waiting: false, streaming: true });
  });

  it("holds back a failed attempt's error while the run retries", () => {
    const failed = assistant("", "error");
    const reply = chatMessages({
      ...emptyChatStream,
      entries: [user("Hi"), failed],
      running: true,
    }).at(-1);

    expect(reply).toMatchObject({ role: "assistant", waiting: true });
    expect(reply).not.toHaveProperty("error", expect.anything());
  });

  it("shows nothing extra once Hei is idle", () => {
    const messages = chatMessages({
      ...emptyChatStream,
      entries: [user("Hi"), assistant("Hello!")],
    });

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
  });
});

describe("applyEvents", () => {
  it("follows the chat's model when it is switched", () => {
    const model = { provider: "anthropic", modelId: "claude-sonnet-5-5" };
    const state = applyEvents(emptyChatStream, [
      { type: "agent_changed", agent: { model } },
    ]);

    expect(state.model).toEqual(model);
  });
});
