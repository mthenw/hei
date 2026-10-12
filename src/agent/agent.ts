import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import {
  type AgentEventStream,
  type ConversationId,
  createRegistry,
  Harness,
  type ModelRef,
  type Storage,
  watchEvents,
} from "@earendil-works/pi-durable";
import { HeiError, isHeiError } from "@/lib/errors";
import { HeiExtension } from "./extension";

/** A Chat is identified by the id of the pi-durable conversation behind it. */
export type ChatId = number;

export type Message = {
  content: string;
  /** Idempotency key: resubmitting the same id never sends the message twice. */
  requestId: string;
};

export class ChatNotFound extends HeiError<"ChatNotFound"> {
  constructor(readonly chatId: ChatId) {
    super("ChatNotFound", `Chat ${chatId} not found`);
  }

  static is(error: unknown): error is ChatNotFound {
    return isHeiError(error, "ChatNotFound");
  }
}

export type AgentOptions = {
  storage: Storage;
  models: Models;
  defaultModel: ModelRef;
};

// Every Hei call runs to completion on its own; cancellation is per conversation, through stop().
const context = BACKGROUND_CONTEXT;

/** Hei's agent runtime: one pi-durable Harness and the operations the app needs from it. */
export class Agent {
  private constructor(
    private readonly harness: Harness,
    private readonly defaultModel: ModelRef,
  ) {}

  /** Open the Harness and continue any run the previous process left unfinished. */
  static async open(options: AgentOptions): Promise<Agent> {
    const registry = createRegistry();
    registry.install(HeiExtension);
    const harness = await Harness.open(
      options.storage,
      { models: options.models, registry },
      context,
    );
    harness.resume();
    return new Agent(harness, options.defaultModel);
  }

  /** Create an empty chat: an ownerless conversation that runs on the default model. */
  async createChat(): Promise<ChatId> {
    const conversation = await this.harness.createConversation(
      { ownership: { kind: "ownerless" }, agent: { model: this.defaultModel } },
      context,
    );
    return conversation.id;
  }

  /** Send a message. While Hei is busy it waits as a follow-up for the current run to finish. */
  async send(chatId: ChatId, message: Message): Promise<void> {
    const conversation = await this.conversation(chatId);
    await conversation.submit(
      { type: "input", content: message.content, requestId: message.requestId },
      context,
    );
  }

  /** Stop the current run and withdraw queued messages. Resolves once the chat is idle. */
  async stop(chatId: ChatId): Promise<void> {
    const conversation = await this.conversation(chatId);
    await conversation.abort(context);
  }

  /** Subscribe to a chat's events: a snapshot, then one batch per commit. */
  async watch(chatId: ChatId): Promise<AgentEventStream> {
    await this.conversation(chatId);
    return watchEvents(this.harness, chatId as ConversationId, context);
  }

  async close(): Promise<void> {
    await this.harness.close(context);
  }

  private async conversation(chatId: ChatId) {
    const conversation = await this.harness.conversation(
      chatId as ConversationId,
      context,
    );
    if (conversation === undefined) throw new ChatNotFound(chatId);
    return conversation;
  }
}
