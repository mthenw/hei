import path from "node:path";
import {
  type AuthContext,
  createModels,
  defaultProviderAuthContext,
} from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { Agent } from "@/agent/agent";
import { createDevModel } from "@/agent/dev-model";
import { ModelCatalog } from "@/agent/model-catalog";
import { GooglePlaces } from "@/agent/places/google-places";
import { placesExtension } from "@/agent/places/tools";
import { ProviderPauses } from "@/agent/provider-pauses";
import { Jina } from "@/agent/web/jina";
import { webExtension } from "@/agent/web/tools";
import { Chats } from "@/chats/chats";
import { Connections } from "@/connections/connections";
import { DatabaseCredentialStore } from "@/connections/credential-store";
import { openAppDatabase } from "@/db/database";
import { installationId } from "@/db/settings";
import { claimDataDir, dataDir } from "@/lib/data-dir";
import type { MapsConfig } from "@/lib/maps-config";
import { SecretBox } from "@/lib/secret-box";
import { Profile } from "@/profile/profile";

/** Everything the server runs on, built once per process. */
export type Hei = {
  agent: Agent;
  chats: Chats;
  connections: Connections;
  profile: Profile;
  maps: MapsConfig;
};

// pi-durable allows one owner per storage and has no cross-process locking, so the process builds Hei exactly once.
// It lives on globalThis because Next.js bundles this module more than once (instrumentation, each route) and dev hot
// reload re-evaluates it; every copy must reach the same instance.
const globalForHei = globalThis as typeof globalThis & {
  __hei?: Promise<Hei>;
};

export function getHei(): Promise<Hei> {
  globalForHei.__hei ??= openHei().catch((error) => {
    globalForHei.__hei = undefined;
    throw error;
  });
  return globalForHei.__hei;
}

async function openHei(): Promise<Hei> {
  const dir = await dataDir();
  // One process per data directory: a second one (another server, a build, a script) fails here, not in the storage.
  await claimDataDir(dir);
  const db = await openAppDatabase(path.join(dir, "app.sqlite"));
  const box = secretBox(process.env.HEI_SECRET);

  const models = createModels({
    credentials: new DatabaseCredentialStore(db, box),
    authContext: heiAuthContext(),
  });
  models.setProvider(openaiProvider());
  models.setProvider(anthropicProvider());
  models.setProvider(createDevModel({ tokensPerSecond: 30 }).provider);
  const pauses = await ProviderPauses.open(db);
  const profile = await Profile.open(db);
  const catalog = new ModelCatalog({
    models,
    pauses,
    includeDevModel:
      process.env.NODE_ENV !== "production" ||
      process.env.HEI_DEV_MODEL === "1",
  });

  // Tools that need a key are offered only with one, rather than as tools that fail: web access needs a Jina key,
  // finding places a Google Maps key.
  const jinaKey = envValue("JINA_API_KEY");
  const placesKey = envValue("GOOGLE_MAPS_API_KEY");
  const agent = await Agent.open({
    storage: await openNodeSqliteStorage(path.join(dir, "agent.sqlite")),
    models,
    catalog,
    extensions: [
      ...(jinaKey ? [webExtension(new Jina({ apiKey: jinaKey }))] : []),
      ...(placesKey
        ? [placesExtension(new GooglePlaces({ apiKey: placesKey }))]
        : []),
    ],
    persona: profile,
  });
  return {
    agent,
    profile,
    chats: new Chats(agent, db, { pauses }),
    connections: new Connections({
      models,
      catalog,
      installationId: await installationId(db),
      secretConfigured: box !== undefined,
    }),
    maps: {
      browserKey: envValue("GOOGLE_MAPS_BROWSER_KEY") ?? null,
      // Google's test map ID works for advanced markers; a map ID of your own can restyle the map.
      mapId: envValue("GOOGLE_MAPS_MAP_ID") ?? "DEMO_MAP_ID",
    },
  };
}

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === "" ? undefined : value;
}

function secretBox(secret: string | undefined): SecretBox | undefined {
  if (secret === undefined || secret.trim() === "") return undefined;
  try {
    return new SecretBox(secret.trim(), "credentials");
  } catch (error) {
    console.error("HEI_SECRET is unusable, so sign-ins are disabled:", error);
    return undefined;
  }
}

/**
 * pi-ai's environment without ANTHROPIC_OAUTH_TOKEN. That variable holds a Claude subscription token, which pi-ai would
 * use by presenting itself as Claude Code; Hei reaches Claude only with ANTHROPIC_API_KEY (ADR 0004).
 */
function heiAuthContext(): AuthContext {
  const base = defaultProviderAuthContext();
  return {
    env: async (name) =>
      name === "ANTHROPIC_OAUTH_TOKEN" ? undefined : base.env(name),
    fileExists: (file) => base.fileExists(file),
  };
}
