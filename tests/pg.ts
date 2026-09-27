// Test-only Postgres administration. Tests may use a raw driver; src/ and scripts/ may not
// (tests/domain/no-force-ready.test.ts).
import { execSync } from "node:child_process";
import pg from "pg";
import { LOCAL_DATABASE_URL } from "@/server/database-config";

/** Where test databases live: a local server, never a remote one. */
export const TEST_SERVER_URL = process.env.TEST_DATABASE_URL ?? LOCAL_DATABASE_URL;
export const TEMPLATE_DB = "predev_test_template";

export function urlFor(database: string, base = TEST_SERVER_URL): string {
  const u = new URL(base);
  u.pathname = `/${database}`;
  return u.toString();
}

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(url: string, text: string, values: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** Runs `text` as `role` (SET ROLE), in a transaction that is always rolled back. */
export async function sqlAs<T extends pg.QueryResultRow = pg.QueryResultRow>(url: string, role: string, text: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${pg.escapeIdentifier(role)}`);
    return (await client.query<T>(text)).rows;
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
}

const admin = () => urlFor("postgres");

/** Builds the migrated template every test database is copied from. */
export async function buildTemplate() {
  const host = new URL(TEST_SERVER_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) throw new Error(`Test databases must be local, not ${host}`);
  await sql(admin(), `DROP DATABASE IF EXISTS "${TEMPLATE_DB}" WITH (FORCE)`);
  await sql(admin(), `CREATE DATABASE "${TEMPLATE_DB}"`);
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, MIGRATION_DATABASE_URL: urlFor(TEMPLATE_DB) } });
}

export async function createFromTemplate(name: string) {
  await sql(admin(), `CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DB}"`);
}

export async function dropDatabase(name: string) {
  await sql(admin(), `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}
