import type { ModelAuth, Models } from "@earendil-works/pi-ai";
import type { ModelRef } from "@earendil-works/pi-durable";
import { DEV_MODEL } from "./dev-model";

export type ModelChoice = ModelRef & {
  name: string;
  family: "ChatGPT" | "Claude" | "Development";
};

/** Claude models offered in the picker, reached with ANTHROPIC_API_KEY. */
const CLAUDE_MODELS = [
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-haiku-5-5",
];

/**
 * GPT models offered in the picker, in this order, when the ChatGPT plan allows them. OpenAI's own list for the
 * account decides which of these appear; this is also the fallback when that list can't be read.
 */
const GPT_MODELS = ["gpt-6.1-sol", "gpt-6-sol", "gpt-6-astra", "gpt-6-luna"];

/** New chats run on the first available model. ChatGPT first: its plan is already paid for (ADR 0004). */
const DEFAULT_ORDER: ModelRef[] = [
  { provider: "openai", modelId: "gpt-6.1-sol" },
  { provider: "anthropic", modelId: "claude-sonnet-5-5" },
  DEV_MODEL,
];

/** Small jobs, such as titling a chat, run on the first available of these cheap models. */
const SIDE_JOB_ORDER: ModelRef[] = [
  { provider: "anthropic", modelId: "claude-haiku-5-5" },
  { provider: "openai", modelId: "gpt-6-luna" },
];

const ACCOUNT_MODELS_TTL_MS = 10 * 60 * 1000;

export type ModelCatalogOptions = {
  models: Models;
  /** Offer the scripted development model, for working without any provider. */
  includeDevModel: boolean;
  /** Ask OpenAI which model ids this account may use. */
  fetchAccountModels?: (auth: ModelAuth) => Promise<string[]>;
  now?: () => number;
};

/** Which models Hei offers: those whose provider is configured, from short curated lists. */
export class ModelCatalog {
  private accountModels: { ids: Set<string>; at: number } | undefined;
  private readonly fetchAccountModels: (auth: ModelAuth) => Promise<string[]>;
  private readonly now: () => number;

  constructor(private readonly options: ModelCatalogOptions) {
    this.fetchAccountModels = options.fetchAccountModels ?? fetchOpenAIModelIds;
    this.now = options.now ?? Date.now;
  }

  /** Every model the picker can offer right now. */
  async available(): Promise<ModelChoice[]> {
    const [gpt, claude] = await Promise.all([
      this.gptModels(),
      this.configured("anthropic"),
    ]);
    const choices: ModelChoice[] = [
      ...gpt.map((modelId) => this.choice("openai", modelId, "ChatGPT")),
      ...(claude
        ? CLAUDE_MODELS.map((modelId) =>
            this.choice("anthropic", modelId, "Claude"),
          )
        : []),
    ];
    if (this.options.includeDevModel)
      choices.push({
        ...DEV_MODEL,
        name: "Hei dev model",
        family: "Development",
      });
    return choices.filter((choice) => choice.name !== "");
  }

  async isAvailable(model: ModelRef): Promise<boolean> {
    return (await this.available()).some((choice) => sameModel(choice, model));
  }

  /** The model a new chat starts on. */
  async defaultModel(): Promise<ModelRef> {
    const available = await this.available();
    return (
      DEFAULT_ORDER.find((model) =>
        available.some((choice) => sameModel(choice, model)),
      ) ??
      available[0] ??
      DEV_MODEL
    );
  }

  /** The cheap model for small jobs, or nothing when only the dev model is configured. */
  async sideJobModel(): Promise<ModelRef | undefined> {
    const available = await this.available();
    return SIDE_JOB_ORDER.find((model) =>
      available.some((choice) => sameModel(choice, model)),
    );
  }

  /** Forget cached account details, for example after signing in or out. */
  invalidate() {
    this.accountModels = undefined;
  }

  private async gptModels(): Promise<string[]> {
    if (!(await this.configured("openai"))) return [];
    const allowed = await this.allowedOpenAIModels();
    const offered = GPT_MODELS.filter((id) => allowed?.has(id) ?? true);
    // A list that names none of ours most likely uses ids this catalog doesn't know yet; offer ours rather than none.
    return offered.length > 0 ? offered : GPT_MODELS;
  }

  private async allowedOpenAIModels(): Promise<Set<string> | undefined> {
    if (
      this.accountModels !== undefined &&
      this.now() - this.accountModels.at < ACCOUNT_MODELS_TTL_MS
    )
      return this.accountModels.ids;
    try {
      const auth = await this.options.models.getAuth("openai");
      if (auth === undefined) return undefined;
      const ids = new Set(await this.fetchAccountModels(auth.auth));
      this.accountModels = { ids, at: this.now() };
      return ids;
    } catch (error) {
      console.warn("Could not read the ChatGPT account's models:", error);
      return undefined;
    }
  }

  private async configured(providerId: string): Promise<boolean> {
    try {
      return (await this.options.models.checkAuth(providerId)) !== undefined;
    } catch {
      return false;
    }
  }

  private choice(
    provider: string,
    modelId: string,
    family: ModelChoice["family"],
  ): ModelChoice {
    const model = this.options.models.getModel(provider, modelId);
    return { provider, modelId, name: model?.name ?? "", family };
  }
}

export function sameModel(a: ModelRef, b: ModelRef): boolean {
  return a.provider === b.provider && a.modelId === b.modelId;
}

async function fetchOpenAIModelIds(auth: ModelAuth): Promise<string[]> {
  const response = await fetch(
    `${auth.baseUrl ?? "https://api.openai.com/v1"}/models`,
    {
      headers: {
        ...auth.headers,
        ...(auth.apiKey ? { Authorization: `Bearer ${auth.apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok)
    throw new Error(`OpenAI model list failed (${response.status})`);
  const body = (await response.json()) as { data?: { id: string }[] };
  return (body.data ?? []).map((model) => model.id);
}
