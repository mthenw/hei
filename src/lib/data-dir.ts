import { readFileSync, unlinkSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { HeiError, isHeiError } from "./errors";

/** Where Hei keeps its SQLite files: `HEI_DATA_DIR`, or `./data`. Created on first use. */
export async function dataDir(): Promise<string> {
  // Runtime state, not app code: keep the build from tracing it into the server output.
  const dir = path.resolve(
    /*turbopackIgnore: true*/ process.env.HEI_DATA_DIR ?? "data",
  );
  await mkdir(dir, { recursive: true });
  return dir;
}

export class DataDirInUse extends HeiError<"DataDirInUse"> {
  constructor(dir: string, pid: number) {
    super(
      "DataDirInUse",
      `Another Hei process (pid ${pid}) is using ${dir}. Stop it, or point this one at its own HEI_DATA_DIR. If no Hei is running, delete ${path.join(dir, LOCK_FILE)}.`,
    );
  }

  static is(error: unknown): error is DataDirInUse {
    return isHeiError(error, "DataDirInUse");
  }
}

const LOCK_FILE = "hei.lock";

/**
 * Make this process the only one using `dir`. pi-durable has no cross-process locking, and two processes writing the
 * same storage corrupt it, so a second one fails here instead. A lock left by a process that has exited is taken over.
 */
export async function claimDataDir(dir: string): Promise<void> {
  const file = path.join(dir, LOCK_FILE);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await writeFile(file, String(process.pid), { flag: "wx" });
      releaseOnExit(file);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const owner = Number((await readFile(file, "utf8").catch(() => "")).trim());
    if (owner === process.pid) return;
    if (Number.isSafeInteger(owner) && owner > 0 && isRunning(owner))
      throw new DataDirInUse(dir, owner);
    await rm(file, { force: true });
  }
  throw new Error(`Could not claim ${dir}`);
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function releaseOnExit(file: string) {
  process.once("exit", () => {
    try {
      if (readFileSync(file, "utf8").trim() === String(process.pid))
        unlinkSync(file);
    } catch {
      // Already gone.
    }
  });
}
