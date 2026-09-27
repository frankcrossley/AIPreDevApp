// Local Postgres housekeeping for db:reset and dev (ADR-014, ADR-037). Only ever touches a
// database on this machine, and goes through the Prisma CLI rather than a raw driver.
import { execSync } from "node:child_process";
import { databaseUrl, isLocalHost } from "../src/server/database-config";

export interface LocalDatabase {
  url: string;
  name: string;
  /** The same server's maintenance database, for CREATE and DROP DATABASE. */
  adminUrl: string;
}

export function localDatabase(): LocalDatabase {
  const url = databaseUrl();
  const parsed = new URL(url);
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!isLocalHost(parsed.hostname)) {
    console.error(`Refusing: ${parsed.hostname} is not this machine. Local database scripts never touch a remote database.`);
    process.exit(1);
  }
  if (!/^[a-z][a-z0-9_]*$/.test(name) || name === "postgres") {
    console.error(`Refusing: "${name}" is not a database these scripts manage.`);
    process.exit(1);
  }
  const admin = new URL(url);
  admin.pathname = "/postgres";
  return { url, name, adminUrl: admin.toString() };
}

/** Runs one SQL statement through `prisma db execute`. Throws if it fails. */
export function execute(url: string, sql: string, quiet = false) {
  execSync("npx prisma db execute --stdin", {
    input: sql,
    env: { ...process.env, MIGRATION_DATABASE_URL: url },
    stdio: ["pipe", quiet ? "ignore" : "inherit", quiet ? "ignore" : "inherit"],
  });
}

export function exists(db: LocalDatabase): boolean {
  try {
    execute(db.url, "SELECT 1", true);
    return true;
  } catch {
    return false;
  }
}

/** Drops and recreates the database, applies migrations, and seeds it. */
export function reset(db: LocalDatabase) {
  execute(db.adminUrl, `DROP DATABASE IF EXISTS "${db.name}" WITH (FORCE)`);
  execute(db.adminUrl, `CREATE DATABASE "${db.name}"`);
  const env = { ...process.env, DATABASE_URL: db.url, MIGRATION_DATABASE_URL: db.url };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
}
