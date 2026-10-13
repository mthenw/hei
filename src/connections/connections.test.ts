import type {
  AuthInteraction,
  LoginOptions,
  Models,
} from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { ModelCatalog } from "@/agent/model-catalog";
import { Connections, SignInError } from "./connections";
import { CredentialsUnavailable } from "./credential-store";

const AUTH_URL = "https://auth.openai.com/api/accounts/authorize?x=1";
const redirect = (code = "abc") =>
  `http://127.0.0.1:1455/auth/callback?code=${code}&state=s&client_id=c`;

/** Just enough of pi-ai's Models for sign-in: a login that behaves like Sign in with ChatGPT. */
function fakeModels() {
  const state = {
    signedIn: false,
    /** The login flow returned or threw, as pi-ai's does once its callback server closes. */
    loginEnded: false,
    loginOptions: undefined as LoginOptions | undefined,
    interaction: undefined as AuthInteraction | undefined,
  };
  const models = {
    async login(
      _providerId: string,
      _type: string,
      interaction: AuthInteraction,
      options?: LoginOptions,
    ) {
      state.interaction = interaction;
      state.loginOptions = options;
      options?.getDeviceId?.();
      interaction.notify({ type: "auth_url", url: AUTH_URL });
      const pasted = await interaction
        .prompt({
          type: "manual_code",
          message: "Paste the redirect URL",
          signal: interaction.signal,
        })
        .finally(() => {
          state.loginEnded = true;
        });
      if (pasted.includes("code=rejected"))
        throw new Error("Token exchange failed");
      state.signedIn = true;
      return { type: "oauth", access: "a", refresh: "r", expires: 1 };
    },
    async logout() {
      state.signedIn = false;
    },
    async checkAuth(providerId: string) {
      return providerId === "openai" && state.signedIn
        ? { type: "oauth" as const }
        : undefined;
    },
  } as unknown as Models;
  return { models, state };
}

function connections(options: { secret?: boolean } = {}) {
  const { models, state } = fakeModels();
  const instance = new Connections({
    models,
    catalog: new ModelCatalog({ models, includeDevModel: false }),
    installationId: "0b7d8b9e-5c1f-4d8a-9a7e-2f3c4d5e6f70",
    secretConfigured: options.secret ?? true,
    env: { ANTHROPIC_API_KEY: "sk-test", HEI_SECRET: "x".repeat(32) },
  });
  return { connections: instance, state };
}

describe("Connections", () => {
  it("signs in to ChatGPT with the pasted redirect URL", async () => {
    const { connections: hei, state } = connections();

    expect(await hei.startChatGPTSignIn()).toEqual({ authUrl: AUTH_URL });
    expect((await hei.status()).chatgpt.signIn).toEqual({ authUrl: AUTH_URL });
    expect(state.loginOptions?.agentName).toBe("Hei");

    await hei.finishChatGPTSignIn(redirect());

    const status = await hei.status();
    expect(status.chatgpt).toEqual({
      connected: true,
      via: "Sign in with ChatGPT",
      signIn: undefined,
      error: undefined,
    });
  });

  it("rejects a malformed address without ending the sign-in", async () => {
    const { connections: hei } = connections();
    await hei.startChatGPTSignIn();

    await expect(
      hei.finishChatGPTSignIn("http://127.0.0.1:1455/auth/callback?state=s"),
    ).rejects.toSatisfy(SignInError.is);
    await expect(
      hei.finishChatGPTSignIn("https://example.com/"),
    ).rejects.toSatisfy(SignInError.is);
    expect((await hei.status()).chatgpt.signIn).toBeDefined();

    await hei.finishChatGPTSignIn(redirect());
    expect((await hei.status()).chatgpt.connected).toBe(true);
  });

  it("reports a sign-in that OpenAI rejects", async () => {
    const { connections: hei } = connections();
    await hei.startChatGPTSignIn();

    await expect(hei.finishChatGPTSignIn(redirect("rejected"))).rejects.toThrow(
      "Token exchange failed",
    );
    const status = await hei.status();
    expect(status.chatgpt.connected).toBe(false);
    expect(status.chatgpt.error).toBe("Token exchange failed");
  });

  it("cancels a sign-in in progress", async () => {
    const { connections: hei, state } = connections();
    await hei.startChatGPTSignIn();

    hei.cancelChatGPTSignIn();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.interaction?.signal?.aborted).toBe(true);
    // The prompt must give up on abort; otherwise pi-ai's flow never ends and keeps port 1455.
    expect(state.loginEnded).toBe(true);
    const status = await hei.status();
    expect(status.chatgpt.signIn).toBeUndefined();
    expect(status.chatgpt.error).toBeUndefined();
  });

  it("refuses to sign in without HEI_SECRET", async () => {
    const { connections: hei } = connections({ secret: false });

    await expect(hei.startChatGPTSignIn()).rejects.toSatisfy(
      CredentialsUnavailable.is,
    );
  });

  it("disconnects ChatGPT", async () => {
    const { connections: hei } = connections();
    await hei.startChatGPTSignIn();
    await hei.finishChatGPTSignIn(redirect());

    await hei.disconnectChatGPT();

    expect((await hei.status()).chatgpt.connected).toBe(false);
  });

  it("reports which keys are set without revealing them", async () => {
    const { connections: hei } = connections();

    const keys = (await hei.status()).keys;
    expect(keys.map((key) => [key.name, key.configured])).toEqual([
      ["ANTHROPIC_API_KEY", true],
      ["JINA_API_KEY", false],
      ["HEI_SECRET", true],
    ]);
    expect(JSON.stringify(keys)).not.toContain("sk-test");
  });
});
