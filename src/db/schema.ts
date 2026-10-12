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
