import { createModels, InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { describe, expect, it, vi } from "vitest";
import { ModelCatalog } from "./model-catalog";

async function catalog(options: {
  claudeKey?: boolean;
  chatgpt?: boolean;
  accountModels?: string[] | Error;
  includeDevModel?: boolean;
  paused?: string[];
}) {
  const credentials = new InMemoryCredentialStore();
  if (options.chatgpt)
    await credentials.modify("openai", async () => ({
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
      expires: Date.now() + 60 * 60 * 1000,
    }));
  const models = createModels({
    credentials,
    authContext: {
      env: async (name) =>
        name === "ANTHROPIC_API_KEY" && options.claudeKey
          ? "sk-test"
          : undefined,
      fileExists: async () => false,
    },
  });
  models.setProvider(anthropicProvider());
  models.setProvider(openaiProvider());
  const fetchAccountModels = vi.fn(async () => {
    if (options.accountModels instanceof Error) throw options.accountModels;
    return options.accountModels ?? [];
  });
  const instance = new ModelCatalog({
    models,
    includeDevModel: options.includeDevModel ?? true,
    fetchAccountModels,
    pauses: {
      isPaused: (provider) => options.paused?.includes(provider) ?? false,
    },
  });
  return { catalog: instance, fetchAccountModels };
}

const ids = (choices: { modelId: string }[]) => choices.map((c) => c.modelId);

describe("ModelCatalog", () => {
  it("offers only the dev model when no provider is configured", async () => {
    const { catalog: models } = await catalog({});

    expect(ids(await models.available())).toEqual(["echo"]);
    expect(await models.defaultModel()).toEqual({
      provider: "hei-dev",
      modelId: "echo",
    });
    expect(await models.sideJobModel()).toBeUndefined();
  });

  it("offers Claude with an API key, defaulting to Sonnet and titling with Haiku", async () => {
    const { catalog: models } = await catalog({
      claudeKey: true,
      includeDevModel: false,
    });

    expect(await models.available()).toEqual([
      {
        provider: "anthropic",
        modelId: "claude-sonnet-5-5",
        name: "Claude Sonnet 5.5",
        family: "Claude",
      },
      {
        provider: "anthropic",
        modelId: "claude-opus-5-5",
        name: "Claude Opus 5.5",
        family: "Claude",
      },
      {
        provider: "anthropic",
        modelId: "claude-haiku-5-5",
        name: "Claude Haiku 5.5",
        family: "Claude",
      },
    ]);
    expect(await models.defaultModel()).toMatchObject({
      modelId: "claude-sonnet-5-5",
    });
    expect(await models.sideJobModel()).toMatchObject({
      modelId: "claude-haiku-5-5",
    });
  });

  it("offers the GPT models the ChatGPT account allows", async () => {
    const { catalog: models } = await catalog({
      chatgpt: true,
      accountModels: [
        "gpt-6-luna",
        "gpt-6.1-sol",
        "gpt-4o",
        "text-embedding-3-small",
      ],
      includeDevModel: false,
    });

    expect(ids(await models.available())).toEqual([
      "gpt-6.1-sol",
      "gpt-6-luna",
    ]);
    expect(await models.defaultModel()).toMatchObject({
      modelId: "gpt-6.1-sol",
    });
    expect(await models.sideJobModel()).toMatchObject({
      modelId: "gpt-6-luna",
    });
  });

  it("prefers ChatGPT for new chats and Claude Haiku for small jobs when both are set up", async () => {
    const { catalog: models } = await catalog({
      claudeKey: true,
      chatgpt: true,
      accountModels: ["gpt-6.1-sol", "gpt-6-luna"],
    });

    expect(await models.defaultModel()).toMatchObject({
      provider: "openai",
      modelId: "gpt-6.1-sol",
    });
    expect(await models.sideJobModel()).toMatchObject({
      provider: "anthropic",
      modelId: "claude-haiku-5-5",
    });
  });

  it("falls back to every curated GPT model when the account list can't be read", async () => {
    const { catalog: models } = await catalog({
      chatgpt: true,
      accountModels: new Error("offline"),
      includeDevModel: false,
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(ids(await models.available())).toEqual([
      "gpt-6.1-sol",
      "gpt-6-sol",
      "gpt-6-astra",
      "gpt-6-luna",
    ]);
  });

  it("reads the account list once until invalidated", async () => {
    const { catalog: models, fetchAccountModels } = await catalog({
      chatgpt: true,
      accountModels: ["gpt-6.1-sol"],
    });

    await models.available();
    await models.available();
    expect(fetchAccountModels).toHaveBeenCalledTimes(1);

    models.invalidate();
    await models.available();
    expect(fetchAccountModels).toHaveBeenCalledTimes(2);
  });

  it("backs up ChatGPT with Claude and Claude with ChatGPT, never the dev model", async () => {
    const { catalog: models } = await catalog({
      claudeKey: true,
      chatgpt: true,
      accountModels: ["gpt-6.1-sol"],
    });

    expect(
      await models.backupFor({ provider: "openai", modelId: "gpt-6.1-sol" }),
    ).toEqual({
      provider: "anthropic",
      modelId: "claude-sonnet-5-5",
    });
    expect(
      await models.backupFor({
        provider: "anthropic",
        modelId: "claude-opus-5-5",
      }),
    ).toEqual({
      provider: "openai",
      modelId: "gpt-6.1-sol",
    });
    expect(
      await models.backupFor({ provider: "hei-dev", modelId: "echo" }),
    ).toMatchObject({
      provider: "openai",
    });
  });

  it("has no backup when the other account is missing or paused", async () => {
    const chatgptOnly = await catalog({
      chatgpt: true,
      accountModels: ["gpt-6.1-sol"],
    });
    expect(
      await chatgptOnly.catalog.backupFor({
        provider: "openai",
        modelId: "gpt-6.1-sol",
      }),
    ).toBeUndefined();

    const claudePaused = await catalog({
      claudeKey: true,
      chatgpt: true,
      accountModels: ["gpt-6.1-sol"],
      paused: ["anthropic"],
    });
    expect(
      await claudePaused.catalog.backupFor({
        provider: "openai",
        modelId: "gpt-6.1-sol",
      }),
    ).toBeUndefined();
  });

  it("starts new chats and small jobs away from a paused provider", async () => {
    const { catalog: models } = await catalog({
      claudeKey: true,
      chatgpt: true,
      accountModels: ["gpt-6.1-sol", "gpt-6-luna"],
      paused: ["openai"],
    });

    expect(await models.defaultModel()).toMatchObject({
      provider: "anthropic",
    });

    const claudePaused = await catalog({
      claudeKey: true,
      chatgpt: true,
      accountModels: ["gpt-6.1-sol", "gpt-6-luna"],
      paused: ["anthropic"],
    });
    expect(await claudePaused.catalog.sideJobModel()).toMatchObject({
      modelId: "gpt-6-luna",
    });
  });
});
