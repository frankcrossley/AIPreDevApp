// Creates a Prisma client. Kept free of `server-only` so scripts and tests can use it.
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

export const DEFAULT_DATABASE_URL = "file:./prisma/dev.db";

/** Resolves `file:./x.db` against the project root, so every entry point opens the same file. */
export function databasePath(url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): string {
  const file = url.replace(/^file:/, "");
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

export function createPrisma(url?: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath(url) }) });
}

export type Db = PrismaClient;
