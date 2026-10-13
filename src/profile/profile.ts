import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/database";
import { profile as profileTable } from "@/db/schema";
import { HeiError, isHeiError } from "@/lib/errors";

/** What the user tells Hei about themselves and how it should behave. */
export type ProfileData = {
  /** Free text added to every chat. */
  about: string;
  /** IANA time zone for "today", "tonight" and message times. */
  timeZone: string;
  /** Always reply in this language; null replies in the language of each message. */
  replyLanguage: string | null;
  /** The user's own assistant instructions; null uses Hei's default. */
  instructions: string | null;
};

export type ProfileChange = Partial<ProfileData>;

export const DEFAULT_PROFILE: ProfileData = {
  about: "",
  timeZone: "Europe/Warsaw",
  replyLanguage: null,
  instructions: null,
};

const MAX_TEXT = 10_000;
const MAX_LANGUAGE = 50;
const ROW = 1;

export class InvalidProfile extends HeiError<"InvalidProfile"> {
  constructor(message: string) {
    super("InvalidProfile", message);
  }

  static is(error: unknown): error is InvalidProfile {
    return isHeiError(error, "InvalidProfile");
  }
}

/**
 * The user's Profile, stored as one row and kept in memory, so building a prompt never waits for the database.
 */
export class Profile {
  private constructor(
    private readonly db: AppDatabase,
    private current: ProfileData,
    private readonly now: () => number,
  ) {}

  static async open(
    db: AppDatabase,
    now: () => number = Date.now,
  ): Promise<Profile> {
    const row = await db
      .select()
      .from(profileTable)
      .where(eq(profileTable.id, ROW))
      .get();
    return new Profile(
      db,
      row === undefined
        ? DEFAULT_PROFILE
        : {
            about: row.about,
            timeZone: row.timeZone,
            replyLanguage: row.replyLanguage,
            instructions: row.instructions,
          },
      now,
    );
  }

  get(): ProfileData {
    return this.current;
  }

  /** Apply a change. Blank instructions or language mean the default. */
  async update(change: ProfileChange): Promise<ProfileData> {
    const next = validate({ ...this.current, ...change });
    const values = { ...next, updatedAt: new Date(this.now()) };
    await this.db
      .insert(profileTable)
      .values({ id: ROW, ...values })
      .onConflictDoUpdate({ target: profileTable.id, set: values });
    this.current = next;
    return next;
  }
}

function validate(profile: ProfileData): ProfileData {
  const about = profile.about.trim();
  if (about.length > MAX_TEXT)
    throw new InvalidProfile(`About me can be at most ${MAX_TEXT} characters.`);
  const instructions = profile.instructions?.trim() || null;
  if (instructions !== null && instructions.length > MAX_TEXT)
    throw new InvalidProfile(
      `Assistant instructions can be at most ${MAX_TEXT} characters.`,
    );
  const replyLanguage = profile.replyLanguage?.trim() || null;
  if (replyLanguage !== null && replyLanguage.length > MAX_LANGUAGE)
    throw new InvalidProfile("That reply language name is too long.");
  const timeZone = profile.timeZone.trim();
  if (!isTimeZone(timeZone))
    throw new InvalidProfile(`Unknown time zone: ${timeZone}.`);
  return { about, timeZone, replyLanguage, instructions };
}

function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone.length > 0;
  } catch {
    return false;
  }
}
