import { mkdir } from "node:fs/promises";
import path from "node:path";

/** Where Hei keeps its SQLite files: `HEI_DATA_DIR`, or `./data`. Created on first use. */
export async function dataDir(): Promise<string> {
  // Runtime state, not app code: keep the build from tracing it into the server output.
  const dir = path.resolve(
    /*turbopackIgnore: true*/ process.env.HEI_DATA_DIR ?? "data",
  );
  await mkdir(dir, { recursive: true });
  return dir;
}
