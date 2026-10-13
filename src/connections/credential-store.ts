import type {
  AuthOperationOptions,
  Credential,
  CredentialInfo,
  CredentialStore,
} from "@earendil-works/pi-ai";
import { eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/database";
import { credentials } from "@/db/schema";
import { HeiError, isHeiError } from "@/lib/errors";
import type { SecretBox } from "@/lib/secret-box";

/**
 * Providers Hei keeps sign-ins for. Claude is reached only with an API key from the environment (ADR 0004), so a Claude
 * subscription sign-in is never stored and pi-ai never uses one.
 */
export const STORABLE_PROVIDERS = ["openai"] as const;
const storable = new Set<string>(STORABLE_PROVIDERS);

export class CredentialsUnavailable extends HeiError<"CredentialsUnavailable"> {
  constructor(message: string) {
    super("CredentialsUnavailable", message);
  }

  static is(error: unknown): error is CredentialsUnavailable {
    return isHeiError(error, "CredentialsUnavailable");
  }
}

/**
 * pi-ai's credential store over Hei's database. Credentials are sealed with HEI_SECRET; without it, nothing can be
 * stored and stored sign-ins cannot be read. Writes to one provider run one at a time, as the contract requires, so a
 * token refresh can never race another.
 */
export class DatabaseCredentialStore implements CredentialStore {
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly db: AppDatabase,
    private readonly box: SecretBox | undefined,
    private readonly now: () => number = Date.now,
  ) {}

  async read(
    providerId: string,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    options?.signal?.throwIfAborted();
    if (!storable.has(providerId)) return undefined;
    const row = await this.db
      .select()
      .from(credentials)
      .where(eq(credentials.providerId, providerId))
      .get();
    return row && this.open(row.data);
  }

  async list(options?: AuthOperationOptions): Promise<CredentialInfo[]> {
    options?.signal?.throwIfAborted();
    const rows = await this.db
      .select({ providerId: credentials.providerId, type: credentials.type })
      .from(credentials)
      .where(inArray(credentials.providerId, [...storable]));
    return rows;
  }

  modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
    options?: AuthOperationOptions,
  ): Promise<Credential | undefined> {
    return this.serialize(providerId, async () => {
      if (!storable.has(providerId))
        throw new CredentialsUnavailable(
          `Hei does not store sign-ins for ${providerId}.`,
        );
      const current = await this.read(providerId);
      const next = await fn(current);
      options?.signal?.throwIfAborted();
      if (next === undefined) return current;
      const data = this.seal(next);
      const updatedAt = new Date(this.now());
      await this.db
        .insert(credentials)
        .values({ providerId, type: next.type, data, updatedAt })
        .onConflictDoUpdate({
          target: credentials.providerId,
          set: { type: next.type, data, updatedAt },
        });
      return next;
    });
  }

  delete(providerId: string): Promise<void> {
    return this.serialize(providerId, async () => {
      await this.db
        .delete(credentials)
        .where(eq(credentials.providerId, providerId));
    });
  }

  private seal(credential: Credential): string {
    if (this.box === undefined)
      throw new CredentialsUnavailable(
        "Set HEI_SECRET to store sign-ins, then restart Hei.",
      );
    return this.box.seal(JSON.stringify(credential));
  }

  private open(sealed: string): Credential {
    if (this.box === undefined)
      throw new CredentialsUnavailable(
        "HEI_SECRET is not set, so stored sign-ins cannot be read.",
      );
    try {
      return JSON.parse(this.box.open(sealed)) as Credential;
    } catch {
      throw new CredentialsUnavailable(
        "A stored sign-in cannot be read. HEI_SECRET may have changed; sign in again.",
      );
    }
  }

  /** Run tasks for one provider one at a time; a failed task never blocks the next. */
  private serialize<T>(providerId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(providerId) ?? Promise.resolve();
    const run = previous.catch(() => {}).then(task);
    const tail = run.catch(() => {});
    this.chains.set(providerId, tail);
    void tail.then(() => {
      if (this.chains.get(providerId) === tail) this.chains.delete(providerId);
    });
    return run;
  }
}
