import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
// A throwaway data directory, emptied before each run: the smoke test never touches the real one, and a running dev
// server keeps its own (one process per data directory).
const DATA_DIR = path.join(os.tmpdir(), "hei-e2e");

/**
 * Smoke test against a production build on its own port. Only the dev model is offered: the keys from .env are blanked
 * here, and .env never overrides a variable that is already set.
 */
export default defineConfig({
  testDir: "e2e",
  // One server, one data directory: run the tests one after another.
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  // The installed Chrome, so no browser download is needed.
  projects: [
    {
      name: "desktop",
      grep: /@desktop/,
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "phone",
      grep: /@phone/,
      use: { ...devices["Pixel 7"], channel: "chrome" },
    },
  ],
  webServer: {
    command: `rm -rf "${DATA_DIR}" && bun run build && exec node_modules/.bin/next start --port ${PORT}`,
    port: PORT,
    timeout: 300_000,
    reuseExistingServer: false,
    // Let Hei release its data directory lock on the way out.
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    env: {
      HEI_DATA_DIR: DATA_DIR,
      HEI_DEV_MODEL: "1",
      ANTHROPIC_API_KEY: "",
      JINA_API_KEY: "",
      GOOGLE_MAPS_API_KEY: "",
      GOOGLE_MAPS_BROWSER_KEY: "",
      HEI_SECRET: "",
    },
  },
});
