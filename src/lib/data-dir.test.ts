import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claimDataDir, DataDirInUse } from "./data-dir";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "hei-data-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const lock = () => path.join(dir, "hei.lock");

describe("claimDataDir", () => {
  it("claims a free data directory for this process", async () => {
    await claimDataDir(dir);

    expect((await readFile(lock(), "utf8")).trim()).toBe(String(process.pid));
  });

  it("lets the owning process claim it again", async () => {
    await claimDataDir(dir);
    await expect(claimDataDir(dir)).resolves.toBeUndefined();
  });

  it("refuses a directory another running process holds", async () => {
    // The test runner's parent process is alive and isn't us.
    await writeFile(lock(), String(process.ppid));

    await expect(claimDataDir(dir)).rejects.toSatisfy(DataDirInUse.is);
  });

  it("takes over a lock left by a process that has exited", async () => {
    await writeFile(lock(), "2147483646");

    await claimDataDir(dir);

    expect((await readFile(lock(), "utf8")).trim()).toBe(String(process.pid));
  });
});
