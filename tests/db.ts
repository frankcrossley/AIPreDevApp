// A throwaway SQLite database with the migrations applied and the seed written.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { normaliseSeed } from "@/seed/normalise";
import { createPrisma, type Db } from "@/server/prisma";
import { writeSnapshot } from "../prisma/write-snapshot";
import { NOW, seedJson } from "./fixtures";

export async function seededDatabase(now: Date = NOW): Promise<{ db: Db; file: string; cleanup: () => Promise<void> }> {
  const dir = mkdtempSync(path.join(tmpdir(), "predev-"));
  const file = path.join(dir, "test.db");
  const sqlite = new Database(file);
  const migrations = path.resolve("prisma/migrations");
  for (const m of readdirSync(migrations).filter((d) => !d.endsWith(".toml")).sort()) {
    sqlite.exec(readFileSync(path.join(migrations, m, "migration.sql"), "utf8"));
  }
  sqlite.close();
  const db = createPrisma(`file:${file}`);
  const { snapshot, settings } = normaliseSeed(structuredClone(seedJson), now);
  await writeSnapshot(db, snapshot, settings);
  return {
    db,
    file,
    cleanup: async () => {
      await db.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
