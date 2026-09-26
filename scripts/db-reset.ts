// `npm run db:reset`: delete the local SQLite database, apply migrations, and re-seed.
// Only ever touches a SQLite file inside ./prisma, so it can't wipe anything else.
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { databasePath } from "../src/server/prisma";

const file = databasePath();
const prismaDir = path.resolve("prisma");
if (path.dirname(file) !== prismaDir || !file.endsWith(".db")) {
  console.error(`Refusing to reset ${file}: db:reset only resets a local .db file in ./prisma`);
  process.exit(1);
}

for (const f of [file, `${file}-journal`, `${file}-wal`, `${file}-shm`]) if (existsSync(f)) rmSync(f);
execSync("npx prisma migrate deploy", { stdio: "inherit" });
execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
