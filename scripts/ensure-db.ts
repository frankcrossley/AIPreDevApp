// Used by `npm run dev`: reset and seed the database if it doesn't exist yet.
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { databasePath } from "../src/server/prisma";

if (!existsSync(databasePath())) {
  console.log("No database yet. Resetting and seeding.");
  execSync("npm run db:reset", { stdio: "inherit" });
}
