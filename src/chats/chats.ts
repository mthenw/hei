import type { AgentEventStream, ModelRef } from "@earendil-works/pi-durable";
import { and, desc, eq } from "drizzle-orm";
import { type Agent, type ChatId, ChatNotFound, type Message } from "@/agent";
import { ProviderPauses } from "@/agent/provider-pauses";
import type { AppDatabase } from "@/db/database";
import { type ChatRow, chats } from "@/db/schema";
import { HeiError, isHeiError } from "@/lib/errors";
import { Failover } from "./failover";
import {
  cleanTitle,
  TITLE_INSTRUCTIONS,
  titleFromMessage,
  titleInput,
} from "./title";

export type ChatSummary = {
  id: ChatId;
  title: string;
  /** Epoch milliseconds of the last message the user sent. */
  updatedAt: number;
};

const MAX_TITLE_LENGTH = 200;

/** Writes a title from a chat's opening exchange; resolves to nothing to keep the provisional one. */
export type WriteTitle = (
  firstMessage: string,
  answer: string,
) => Promise<string | undefined>;

export type ChatsOptions = {
  now?: () => number;
  writeTitle?: WriteTitle;
  /** Providers paused after a limit; shared with the model catalog. */
  pauses?: ProviderPauses;
};

export class InvalidTitle extends HeiError<"InvalidTitle"> {
  constructor(message: string) {
    super("InvalidTitle", message);
  }

  static is(error: unknown): error is InvalidTitle {
    return isHeiError(error, "InvalidTitle");
  }
}

/**
 * The user's Chats: a row in Hei's database for each, and the pi-durable conversation behind it. Every operation that
 * changes the list notifies subscribers, so every open sidebar stays current.
 */
export class Chats {
  private readonly listeners = new Set<() => void>();

  /** Work still running for messages sent here: failovers and automatic titles. */
  private readonly pending = new Map<ChatId, Set<Promise<unknown>>>();
  private readonly now: () => number;
  private readonly writeTitle: WriteTitle;
  private readonly pauses: ProviderPauses;
  private readonly failover: Failover;

  constructor(
    private readonly agent: Agent,
    private readonly db: AppDatabase,
    options: ChatsOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.pauses = options.pauses ?? ProviderPauses.inMemory(this.now);
    this.failover = new Failover(agent, this.pauses);
    this.writeTitle =
      options.writeTitle ??
      (async (firstMessage, answer) => {
        const reply = await agent.complete(
          TITLE_INSTRUCTIONS,
          titleInput(firstMessage, answer),
        );
        return reply && cleanTitle(reply);
      });
  }

  /**
   * Start a chat with its first message, on `model` or the default model. Retrying with the same request id returns the
   * same chat. Once Hei answers, a model writes the title, unless the user has renamed the chat by then.
   */
  async start(message: Message, model?: ModelRef): Promise<ChatId> {
    const existing = await this.db
      .select({ id: chats.id })
      .from(chats)
      .where(eq(chats.startRequestId, message.requestId))
      .get();
    if (existing !== undefined) return existing.id;

    const id = await this.agent.createChat(model);
    const now = new Date(this.now());
    await this.db.insert(chats).values({
      id,
      title: titleFromMessage(message.content),
      startRequestId: message.requestId,
      createdAt: now,
      updatedAt: now,
    });
    this.changed();
    const { answer } = await this.submit(id, message);
    this.track(
      id,
      answer.then((text) => this.retitle(id, message.content, text)),
    );
    return id;
  }

  /** Resolves once Hei is done with the messages sent through here: failovers and automatic titles included. */
  async settled(chatId: ChatId): Promise<void> {
    while ((this.pending.get(chatId)?.size ?? 0) > 0)
      await Promise.allSettled([...(this.pending.get(chatId) ?? [])]);
  }

  /** Switch the model a chat runs on, from its next request. Choosing a paused provider by hand ends its pause. */
  async setModel(chatId: ChatId, model: ModelRef): Promise<void> {
    await this.row(chatId);
    await this.agent.setModel(chatId, model);
    if (this.pauses.isPaused(model.provider))
      await this.pauses.resume(model.provider);
  }

  async send(chatId: ChatId, message: Message): Promise<void> {
    await this.row(chatId);
    this.track(chatId, (await this.submit(chatId, message)).answer);
    await this.db
      .update(chats)
      .set({ updatedAt: new Date(this.now()) })
      .where(eq(chats.id, chatId));
    this.changed();
  }

  async stop(chatId: ChatId): Promise<void> {
    await this.row(chatId);
    await this.agent.stop(chatId);
  }

  async watch(chatId: ChatId): Promise<AgentEventStream> {
    await this.row(chatId);
    return this.agent.watch(chatId);
  }

  async rename(chatId: ChatId, title: string): Promise<void> {
    const trimmed = title.replace(/\s+/g, " ").trim();
    if (trimmed.length === 0 || trimmed.length > MAX_TITLE_LENGTH)
      throw new InvalidTitle(
        `A title must be 1 to ${MAX_TITLE_LENGTH} characters.`,
      );
    await this.row(chatId);
    await this.db
      .update(chats)
      .set({ title: trimmed, titleByUser: true })
      .where(eq(chats.id, chatId));
    this.changed();
  }

  /**
   * Remove a chat from Hei and stop its work. pi-durable cannot delete a conversation, so the transcript stays in the
   * agent's storage, unreachable from Hei.
   */
  async delete(chatId: ChatId): Promise<void> {
    await this.row(chatId);
    await this.agent.stop(chatId);
    await this.db.delete(chats).where(eq(chats.id, chatId));
    this.changed();
  }

  /** Every chat, most recently active first. */
  async list(): Promise<ChatSummary[]> {
    const rows = await this.db
      .select()
      .from(chats)
      .orderBy(desc(chats.updatedAt), desc(chats.id));
    return rows.map(toSummary);
  }

  /** Call `listener` after every change to the list. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Send a message, first moving the chat off a paused provider. Resolves as soon as the message is admitted; `answer`
   * then follows the reply to its end, through any switch to another account. (Wrapped in an object: an async function
   * returning the promise itself would wait for it.)
   */
  private async submit(
    chatId: ChatId,
    message: Message,
  ): Promise<{ answer: Promise<string | undefined> }> {
    await this.failover.beforeSend(chatId);
    const sent = await this.agent.send(chatId, message);
    const answer = this.failover
      .deliver(chatId, message, sent)
      .catch((error: unknown) => {
        console.warn(`Could not follow chat ${chatId}'s reply:`, error);
        return undefined;
      });
    return { answer };
  }

  private track(chatId: ChatId, work: Promise<unknown>) {
    const pending = this.pending.get(chatId) ?? new Set();
    this.pending.set(chatId, pending);
    pending.add(work);
    void work.finally(() => {
      pending.delete(work);
      if (pending.size === 0) this.pending.delete(chatId);
    });
  }

  private async retitle(
    chatId: ChatId,
    firstMessage: string,
    answer: string | undefined,
  ) {
    try {
      if (answer === undefined) return;
      const title = await this.writeTitle(firstMessage, answer);
      if (title === undefined) return;
      await this.db
        .update(chats)
        .set({ title })
        .where(and(eq(chats.id, chatId), eq(chats.titleByUser, false)));
      this.changed();
    } catch (error) {
      // The provisional title stays; a failed title is not worth failing anything else for.
      console.warn(`Could not title chat ${chatId}:`, error);
    }
  }

  private async row(chatId: ChatId): Promise<ChatRow> {
    const row = await this.db
      .select()
      .from(chats)
      .where(eq(chats.id, chatId))
      .get();
    if (row === undefined) throw new ChatNotFound(chatId);
    return row;
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }
}

function toSummary(row: ChatRow): ChatSummary {
  return { id: row.id, title: row.title, updatedAt: row.updatedAt.getTime() };
}
