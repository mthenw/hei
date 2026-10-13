import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "./database";
import { settings } from "./schema";

/** The stable id of this installation, created on first use. OpenAI knows the installation by it. */
export async function installationId(db: AppDatabase): Promise<string> {
  const key = "installation_id";
  const existing = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  if (existing !== undefined) return existing.value;
  await db
    .insert(settings)
    .values({ key, value: randomUUID() })
    .onConflictDoNothing();
  // Read back rather than trust our value: a concurrent first use may have stored its own.
  const stored = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  if (stored === undefined)
    throw new Error("Could not store the installation id");
  return stored.value;
}
