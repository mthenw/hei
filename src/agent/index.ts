import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { Agent } from "./agent";
import { createDevModel, DEV_MODEL } from "./dev-model";

export { Agent, type ChatId, ChatNotFound, type Message } from "./agent";

// pi-durable allows one owner per storage and has no cross-process locking, so the process keeps exactly one Agent.
// It lives on globalThis so dev hot reload and every server bundle share it.
const globalForAgent = globalThis as typeof globalThis & {
  __heiAgent?: Promise<Agent>;
};

/** The process-wide Agent, opened on first use. */
export function getAgent(): Promise<Agent> {
  globalForAgent.__heiAgent ??= openAgent().catch((error) => {
    globalForAgent.__heiAgent = undefined;
    throw error;
  });
  return globalForAgent.__heiAgent;
}

async function openAgent(): Promise<Agent> {
  // The data directory is runtime state, not app code: keep the build from tracing it into the server output.
  const dataDir = path.resolve(
    /*turbopackIgnore: true*/ process.env.HEI_DATA_DIR ?? "data",
  );
  await mkdir(dataDir, { recursive: true });
  const storage = await openNodeSqliteStorage(
    path.join(dataDir, "agent.sqlite"),
  );

  const models = createModels();
  models.setProvider(createDevModel({ tokensPerSecond: 30 }).provider);

  return Agent.open({ storage, models, defaultModel: DEV_MODEL });
}
