import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const PORT = 3100;
// End-to-end tests use their own database, reset and seeded before the server starts.
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/predev_e2e";
// Cloud containers ship a Chromium build; use it when the pinned one isn't installed.
const preinstalled = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export default defineConfig({
  testDir: "tests/e2e",
  // Tests share one database, reset before each test.
  workers: 1,
  fullyParallel: false,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: existsSync(preinstalled) ? { executablePath: preinstalled } : {},
  },
  webServer: {
    command: `npm run db:reset && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { DATABASE_URL },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
