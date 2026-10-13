import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** A Chat in the sidebar. Its id is the id of the pi-durable conversation behind it. */
export const chats = sqliteTable("chats", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  /** The user renamed it, so automatic titles leave it alone. */
  titleByUser: integer("title_by_user", { mode: "boolean" })
    .notNull()
    .default(false),
  /** A model has written the title; until then the next answer gets to write one. */
  titleWritten: integer("title_written", { mode: "boolean" })
    .notNull()
    .default(false),
  /** Request id of the message that started the chat; a retried start finds this chat instead of making another. */
  startRequestId: text("start_request_id").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  /** When the user last sent a message; orders the sidebar. */
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type ChatRow = typeof chats.$inferSelect;

/** Stored sign-ins, one per pi-ai provider id; `data` is the credential JSON, sealed with HEI_SECRET. */
export const credentials = sqliteTable("credentials", {
  providerId: text("provider_id").primaryKey(),
  type: text("type", { enum: ["api_key", "oauth"] }).notNull(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Install-wide values, such as the device id OpenAI knows this installation by. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Providers Hei skips for a while after hitting a limit, so it doesn't keep asking an exhausted plan. */
export const providerPauses = sqliteTable("provider_pauses", {
  provider: text("provider").primaryKey(),
  until: integer("until", { mode: "timestamp_ms" }).notNull(),
  reason: text("reason").notNull(),
});

/** What the user tells Hei about themselves and how it should behave. A single row, id 1. */
export const profile = sqliteTable("profile", {
  id: integer("id").primaryKey(),
  about: text("about").notNull().default(""),
  timeZone: text("time_zone").notNull().default("Europe/Warsaw"),
  /** A language to always reply in; null replies in the language of each message. */
  replyLanguage: text("reply_language"),
  /** The user's own assistant instructions; null uses Hei's default. */
  instructions: text("instructions"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** A todo on the Todos page. Dates and times are local to the Profile's time zone. */
export const todos = sqliteTable("todos", {
  // Never reused: Hei and its agents refer to todos by id.
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  notes: text("notes").notNull().default(""),
  /** "2026-10-17"; null for Someday. */
  dueDate: text("due_date"),
  /** "14:30", 24-hour; only with a due date. */
  dueTime: text("due_time"),
  priority: text("priority", { enum: ["high", "normal", "low"] })
    .notNull()
    .default("normal"),
  /** When it was marked done; null while open. */
  doneAt: integer("done_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  /** Hand-off: the agent's status; null when the todo was never handed off. */
  agentStatus: text("agent_status", {
    enum: ["queued", "working", "needs_you", "ready", "failed", "stopped"],
  }),
  /** The agent's chat, once it has started. */
  agentChatId: integer("agent_chat_id"),
  /** What the agent reported. */
  agentResult: text("agent_result"),
  /** Why the agent's last run failed. */
  agentError: text("agent_error"),
  /** When the todo was handed off; queued todos start in this order. */
  handedOffAt: integer("handed_off_at", { mode: "timestamp_ms" }),
});

export type TodoRow = typeof todos.$inferSelect;
