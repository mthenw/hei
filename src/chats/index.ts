import path from "node:path";
import { getAgent } from "@/agent";
import { openAppDatabase } from "@/db/database";
import { dataDir } from "@/lib/data-dir";
import { Chats } from "./chats";

export { type ChatSummary, Chats, InvalidTitle } from "./chats";

// Shared through globalThis like the Agent: Next.js bundles this module more than once, and every copy must notify the
// same subscribers.
const globalForChats = globalThis as typeof globalThis & {
  __heiChats?: Promise<Chats>;
};

/** The process-wide Chats, opened on first use together with the Agent. */
export function getChats(): Promise<Chats> {
  globalForChats.__heiChats ??= openChats().catch((error) => {
    globalForChats.__heiChats = undefined;
    throw error;
  });
  return globalForChats.__heiChats;
}

async function openChats(): Promise<Chats> {
  const [agent, db] = await Promise.all([
    getAgent(),
    openAppDatabase(path.join(await dataDir(), "app.sqlite")),
  ]);
  return new Chats(agent, db);
}
