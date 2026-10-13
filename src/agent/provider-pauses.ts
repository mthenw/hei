import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/database";
import { providerPauses } from "@/db/schema";

export type Pause = { provider: string; until: number; reason: string };

/**
 * Providers Hei skips after hitting a limit, until a time. Kept in memory for synchronous checks and written through to
 * the database so a restart remembers them. Once a pause expires, the next request to the provider is the probe.
 */
export class ProviderPauses {
  private readonly pauses = new Map<string, Pause>();

  private constructor(
    private readonly db: AppDatabase | undefined,
    private readonly now: () => number,
  ) {}

  static async open(
    db: AppDatabase,
    now: () => number = Date.now,
  ): Promise<ProviderPauses> {
    const pauses = new ProviderPauses(db, now);
    for (const row of await db.select().from(providerPauses))
      pauses.pauses.set(row.provider, {
        provider: row.provider,
        until: row.until.getTime(),
        reason: row.reason,
      });
    return pauses;
  }

  /** Pauses kept only in memory, for tests. */
  static inMemory(now: () => number = Date.now): ProviderPauses {
    return new ProviderPauses(undefined, now);
  }

  isPaused(provider: string): boolean {
    return this.active(provider) !== undefined;
  }

  /** The provider's pause, while it lasts. */
  active(provider: string): Pause | undefined {
    const pause = this.pauses.get(provider);
    return pause !== undefined && pause.until > this.now() ? pause : undefined;
  }

  async pause(provider: string, forMs: number, reason: string): Promise<void> {
    const pause = { provider, until: this.now() + forMs, reason };
    this.pauses.set(provider, pause);
    await this.db
      ?.insert(providerPauses)
      .values({ provider, until: new Date(pause.until), reason })
      .onConflictDoUpdate({
        target: providerPauses.provider,
        set: { until: new Date(pause.until), reason },
      });
  }

  /** End a pause early, for example after signing in again. */
  async resume(provider: string): Promise<void> {
    this.pauses.delete(provider);
    await this.db
      ?.delete(providerPauses)
      .where(eq(providerPauses.provider, provider));
  }
}
