import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** A Chat in the sidebar. Its id is the id of the pi-durable conversation behind it. */
export const chats = sqliteTable("chats", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  /** The user renamed it, so automatic titles leave it alone. */
  titleByUser: integer("title_by_user", { mode: "boolean" })
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
