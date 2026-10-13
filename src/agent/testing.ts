import { createModels } from "@earendil-works/pi-ai";
import { MemoryStorage, type Storage } from "@earendil-works/pi-durable";
import { Agent } from "./agent";
import { createDevModel } from "./dev-model";
import { ModelCatalog } from "./model-catalog";

/**
 * An Agent for tests: only the scripted dev model, and an auth context that sees no environment, so a real API key on
 * the developer's machine can never make a test call a provider.
 */
export async function openTestAgent(
  options: { storage?: Storage; tokensPerSecond?: number } = {},
): Promise<Agent> {
  const models = createModels({
    authContext: { env: async () => undefined, fileExists: async () => false },
  });
  models.setProvider(
    createDevModel({ tokensPerSecond: options.tokensPerSecond }).provider,
  );
  return Agent.open({
    storage: options.storage ?? new MemoryStorage(),
    models,
    catalog: new ModelCatalog({ models, includeDevModel: true }),
  });
}
