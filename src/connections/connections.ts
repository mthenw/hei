import type { AuthInteraction, Models } from "@earendil-works/pi-ai";
import type { ModelCatalog } from "@/agent/model-catalog";
import { HeiError, isHeiError } from "@/lib/errors";
import { CredentialsUnavailable } from "./credential-store";

/** Where OpenAI sends the browser after sign-in; pi-ai listens there for it. */
const CHATGPT_REDIRECT = "http://127.0.0.1:1455/auth/callback";

export type KeyStatus = {
  name: string;
  label: string;
  configured: boolean;
};

export type ConnectionStatus = {
  chatgpt: {
    connected: boolean;
    /** How the connection authenticates, when connected. */
    via?: string;
    /** A sign-in waiting for the user to finish it in the browser. */
    signIn?: { authUrl: string };
    error?: string;
  };
  claude: { configured: boolean; error?: string };
  /** Whether HEI_SECRET is set; without it a ChatGPT sign-in cannot be stored. */
  secretConfigured: boolean;
  keys: KeyStatus[];
};

export class SignInError extends HeiError<"SignInError"> {
  constructor(message: string) {
    super("SignInError", message);
  }

  static is(error: unknown): error is SignInError {
    return isHeiError(error, "SignInError");
  }
}

type SignIn = {
  authUrl: string;
  /** Hand pi-ai the redirect URL the user pasted. */
  submit: (redirectUrl: string) => void;
  abort: AbortController;
  done: Promise<void>;
};

export type ConnectionsOptions = {
  models: Models;
  catalog: ModelCatalog;
  installationId: string;
  secretConfigured: boolean;
  env?: Record<string, string | undefined>;
};

/**
 * Hei's outside accounts: the ChatGPT plan through Sign in with ChatGPT, and the keys read from the environment.
 *
 * Sign-in runs on the server. pi-ai opens a callback server on 127.0.0.1:1455 and also accepts the redirect URL pasted
 * back, so it finishes either way: by itself when the browser runs on the same machine as Hei, or by pasting the
 * address of the page that failed to load when it doesn't.
 */
export class Connections {
  private signIn: SignIn | undefined;
  private lastError: string | undefined;
  private readonly env: Record<string, string | undefined>;

  constructor(private readonly options: ConnectionsOptions) {
    this.env = options.env ?? process.env;
  }

  async status(): Promise<ConnectionStatus> {
    const [chatgpt, claude] = await Promise.all([
      this.check("openai"),
      this.check("anthropic"),
    ]);
    return {
      chatgpt: {
        connected: chatgpt.configured,
        via: chatgpt.via,
        signIn: this.signIn && { authUrl: this.signIn.authUrl },
        error: this.lastError ?? chatgpt.error,
      },
      claude: { configured: claude.configured, error: claude.error },
      secretConfigured: this.options.secretConfigured,
      keys: [
        this.key("ANTHROPIC_API_KEY", "Claude (Anthropic API key)"),
        this.key("JINA_API_KEY", "Web search and reading pages (Jina)"),
        this.key("GOOGLE_MAPS_API_KEY", "Finding places (Google Places)"),
        this.key(
          "GOOGLE_MAPS_BROWSER_KEY",
          "Maps and place cards (Google, browser key)",
        ),
        {
          name: "HEI_SECRET",
          label: "Encryption secret for sign-ins",
          // Set but unusable (too short) counts as missing.
          configured: this.options.secretConfigured,
        },
      ],
    };
  }

  /** Begin Sign in with ChatGPT and return the URL to open. Replaces a sign-in already in progress. */
  async startChatGPTSignIn(): Promise<{ authUrl: string }> {
    if (!this.options.secretConfigured)
      throw new CredentialsUnavailable(
        "Set HEI_SECRET before signing in, then restart Hei.",
      );
    this.cancelChatGPTSignIn();
    this.lastError = undefined;

    const abort = new AbortController();
    let submit: (redirectUrl: string) => void = () => {};
    const pasted = new Promise<string>((resolve) => {
      submit = resolve;
    });
    let announce: (authUrl: string) => void = () => {};
    const authUrl = new Promise<string>((resolve) => {
      announce = resolve;
    });
    const interaction: AuthInteraction = {
      signal: abort.signal,
      notify: (event) => {
        if (event.type === "auth_url") announce(event.url);
      },
      // pi-ai races this prompt against its callback server and aborts the prompt's signal when the server wins or the
      // sign-in is cancelled. The prompt must give up then: until it does, pi-ai's flow can't finish or free port 1455.
      prompt: (prompt) =>
        prompt.type === "manual_code"
          ? untilAborted(pasted, prompt.signal)
          : Promise.reject(
              new Error(`Unexpected sign-in step: ${prompt.type}`),
            ),
    };

    const done = this.options.models
      .login("openai", "oauth", interaction, {
        getDeviceId: () => this.options.installationId,
        agentName: "Hei",
      })
      .then(() => {
        this.options.catalog.invalidate();
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) this.lastError = messageOf(error);
      })
      .finally(() => {
        if (this.signIn?.abort === abort) this.signIn = undefined;
      });

    const url = await Promise.race([authUrl, done.then(() => undefined)]);
    if (url === undefined)
      throw new SignInError(this.lastError ?? "Sign-in ended before it began.");
    this.signIn = { authUrl: url, submit, abort, done };
    return { authUrl: url };
  }

  /** Finish a sign-in with the redirect URL the user pasted. Resolves once the sign-in is stored. */
  async finishChatGPTSignIn(redirectUrl: string): Promise<void> {
    const signIn = this.signIn;
    if (signIn === undefined)
      throw new SignInError("No sign-in is in progress. Start again.");
    // Check before handing it over: pi-ai ends the whole sign-in on a malformed URL, and a typo shouldn't cost that.
    const reason = invalidRedirect(redirectUrl);
    if (reason !== undefined) throw new SignInError(reason);
    signIn.submit(redirectUrl.trim());
    await signIn.done;
    if (this.lastError !== undefined) throw new SignInError(this.lastError);
  }

  cancelChatGPTSignIn() {
    this.signIn?.abort.abort();
    this.signIn = undefined;
  }

  async disconnectChatGPT(): Promise<void> {
    this.cancelChatGPTSignIn();
    this.lastError = undefined;
    await this.options.models.logout("openai");
    this.options.catalog.invalidate();
  }

  private async check(
    providerId: string,
  ): Promise<{ configured: boolean; via?: string; error?: string }> {
    try {
      const check = await this.options.models.checkAuth(providerId);
      if (check === undefined) return { configured: false };
      return {
        configured: true,
        via: check.type === "oauth" ? "Sign in with ChatGPT" : check.source,
      };
    } catch (error) {
      return { configured: false, error: messageOf(error) };
    }
  }

  private key(name: string, label: string): KeyStatus {
    const value = this.env[name];
    return {
      name,
      label,
      configured: value !== undefined && value.trim() !== "",
    };
  }
}

/** `promise`, or a rejection as soon as `signal` aborts. */
function untilAborted<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error("Sign-in cancelled"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}

function invalidRedirect(input: string): string | undefined {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return "Paste the full address from the browser's address bar.";
  }
  if (`${url.origin}${url.pathname}` !== CHATGPT_REDIRECT)
    return `The address must start with ${CHATGPT_REDIRECT}.`;
  if (url.searchParams.get("error"))
    return `ChatGPT refused the sign-in: ${url.searchParams.get("error")}.`;
  if (!url.searchParams.get("code") || !url.searchParams.get("state"))
    return "That address is missing the sign-in code. Copy the whole address.";
  return undefined;
}

function messageOf(error: unknown): string {
  // pi-ai wraps store failures; show the cause, which carries Hei's own message.
  if (error instanceof Error && error.cause instanceof Error)
    return error.cause.message;
  return error instanceof Error ? error.message : String(error);
}
