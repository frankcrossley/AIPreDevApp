// Creates a Prisma client on Postgres. Kept free of `server-only` so scripts and tests can use it.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseConfig } from "./database-config";

/** A client for `url`, or for DATABASE_URL (validated, ADR-037) when none is given. */
export function createPrisma(url?: string): PrismaClient {
  const config = databaseConfig(url ? { ...process.env, DATABASE_URL: url } : process.env);
  return new PrismaClient({ adapter: new PrismaPg(config) });
}

export type Db = PrismaClient;
