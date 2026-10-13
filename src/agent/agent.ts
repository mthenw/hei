import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Models } from "@earendil-works/pi-ai";
import {
  type AgentEventStream,
  AssistantEntry,
  type ConversationId,
  createRegistry,
  Harness,
  type ModelRef,
  type Storage,
  watchEvents,
} from "@earendil-works/pi-durable";
import { HeiError, isHeiError } from "@/lib/errors";
import { HeiExtension } from "./extension";
import type { ModelCatalog, ModelChoice } from "./model-catalog";

/** A Chat is identified by the id of the pi-durable conversation behind it. */
export type ChatId = number;

export type Message = {
  content: string;
  /** Idempotency key: resubmitting the same id never sends the message twice. */
  requestId: string;
};

/** A message Hei admitted. */
export type Sent = {
  /** The text of Hei's answer once the run finishes, or nothing if it went unanswered. */
  answer(): Promise<string | undefined>;
};

export class ChatNotFound extends HeiError<"ChatNotFound"> {
  constructor(readonly chatId: ChatId) {
    super("ChatNotFound", `Chat ${chatId} not found`);
  }

  static is(error: unknown): error is ChatNotFound {
    return isHeiError(error, "ChatNotFound");
  }
}

export class ModelUnavailable extends HeiError<"ModelUnavailable"> {
  constructor(model: ModelRef) {
    super(
      "ModelUnavailable",
      `${model.provider}/${model.modelId} is not available. Check Settings → Connections.`,
    );
  }

  static is(error: unknown): error is ModelUnavailable {
    return isHeiError(error, "ModelUnavailable");
  }
}

export type AgentOptions = {
  storage: Storage;
  models: Models;
  catalog: ModelCatalog;
};

// Every Hei call runs to completion on its own; cancellation is per conversation, through stop().
const context = BACKGROUND_CONTEXT;

/** Hei's agent runtime: one pi-durable Harness and the operations the app needs from it. */
export class Agent {
  private constructor(
    private readonly harness: Harness,
    private readonly models: Models,
    readonly catalog: ModelCatalog,
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
    return new Agent(harness, options.models, options.catalog);
  }

  /** The models a chat can run on right now. */
  availableModels(): Promise<ModelChoice[]> {
    return this.catalog.available();
  }

  /** Create an empty chat on `model`, or on the default model. */
  async createChat(model?: ModelRef): Promise<ChatId> {
    const chosen = model ?? (await this.catalog.defaultModel());
    await this.requireAvailable(chosen);
    const conversation = await this.harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: { model: chosen, thinkingLevel: "medium" },
      },
      context,
    );
    return conversation.id;
  }

  /** Switch the model a chat runs on, from its next request. */
  async setModel(chatId: ChatId, model: ModelRef): Promise<void> {
    const conversation = await this.conversation(chatId);
    await this.requireAvailable(model);
    await conversation.configure({ model }, context);
  }

  /** Send a message. While Hei is busy it waits as a follow-up for the current run to finish. */
  async send(chatId: ChatId, message: Message): Promise<Sent> {
    const conversation = await this.conversation(chatId);
    const submission = await conversation.submit(
      { type: "input", content: message.content, requestId: message.requestId },
      context,
    );
    return {
      answer: async () => {
        const settled = await submission.wait(context);
        if (settled.status !== "done" || settled.type !== "input")
          return undefined;
        const entry = await conversation.commit(
          (tx) => tx.entry(AssistantEntry, settled.answer),
          context,
        );
        return textOf(entry?.model?.[0]);
      },
    };
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

  /**
   * A small job outside any chat, such as writing a title, on the cheap side-job model. Resolves to nothing when no
   * such model is configured or the request fails.
   */
  async complete(
    instructions: string,
    input: string,
  ): Promise<string | undefined> {
    const ref = await this.catalog.sideJobModel();
    const model = ref && this.models.getModel(ref.provider, ref.modelId);
    if (model === undefined) return undefined;
    const response = await this.models.completeSimple(
      model,
      {
        systemPrompt: instructions,
        messages: [{ role: "user", content: input, timestamp: Date.now() }],
      },
      { reasoning: "minimal" },
    );
    if (response.stopReason === "error" || response.stopReason === "aborted")
      return undefined;
    return textOf(response);
  }

  async close(): Promise<void> {
    await this.harness.close(context);
  }

  private async requireAvailable(model: ModelRef) {
    if (!(await this.catalog.isAvailable(model)))
      throw new ModelUnavailable(model);
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

function textOf(message: { role: string; content?: unknown } | undefined) {
  if (message?.role !== "assistant" || !Array.isArray(message.content))
    return undefined;
  const text = message.content
    .filter((block) => block?.type === "text")
    .map((block) => block.text as string)
    .join("")
    .trim();
  return text.length > 0 ? text : undefined;
}
