import type { AgentEventStream, ModelRef } from "@earendil-works/pi-durable";
import { and, desc, eq } from "drizzle-orm";
import {
  type Agent,
  type ChatId,
  ChatNotFound,
  type Message,
  type Sent,
} from "@/agent";
import type { AppDatabase } from "@/db/database";
import { type ChatRow, chats } from "@/db/schema";
import { HeiError, isHeiError } from "@/lib/errors";
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

  private readonly titling = new Map<ChatId, Promise<void>>();
  private readonly now: () => number;
  private readonly writeTitle: WriteTitle;

  constructor(
    private readonly agent: Agent,
    private readonly db: AppDatabase,
    options: ChatsOptions = {},
  ) {
    this.now = options.now ?? Date.now;
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
    const sent = await this.agent.send(id, message);
    this.changed();
    this.titling.set(id, this.retitle(id, message.content, sent));
    return id;
  }

  /** Resolves once the automatic title for a chat started here has been written or given up on. */
  async titled(chatId: ChatId): Promise<void> {
    await this.titling.get(chatId);
  }

  /** Switch the model a chat runs on, from its next request. */
  async setModel(chatId: ChatId, model: ModelRef): Promise<void> {
    await this.row(chatId);
    await this.agent.setModel(chatId, model);
  }

  async send(chatId: ChatId, message: Message): Promise<void> {
    await this.row(chatId);
    await this.agent.send(chatId, message);
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

  private async retitle(chatId: ChatId, firstMessage: string, sent: Sent) {
    try {
      const answer = await sent.answer();
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
    } finally {
      this.titling.delete(chatId);
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
