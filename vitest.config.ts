import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Database tests copy a migrated Postgres template built once per run (tests/db.ts).
    globalSetup: ["tests/global-setup.ts"],
    // Show the check reports the seed tests print, so `npm test` doubles as the bolt 1 demo.
    reporters: ["verbose"],
    silent: false,
  },
});
