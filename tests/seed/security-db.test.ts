// Least privilege and row level security (ADR-037, prisma/migrations/0002_security).
// Every app table has RLS with a policy for app_runtime only; the runtime role reads and
// writes rows but can't change the schema; any other role (Supabase's anon, say) sees nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrisma } from "@/server/prisma";
import { loadSnapshot } from "@/server/snapshot";
import { recordStanceAction } from "@/server/stances";
import { seededDatabase, type TestDatabase } from "../db";
import { NOW } from "../fixtures";
import { sql, sqlAs } from "../pg";

let env: TestDatabase;
// Cluster-wide test roles: a login that inherits app_runtime (production logs in as app_runtime
// itself or a member of it, docs/deploy.md),
// and a stand-in for Supabase's `anon`, granted SELECT the way Supabase's defaults would.
const RUNTIME_LOGIN = "predev_test_runtime";
const ANON = "predev_test_anon";

const asRole = (role: string, text: string) => sqlAs(env.url, role, text);

beforeAll(async () => {
  env = await seededDatabase();
  await sql(env.url, `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RUNTIME_LOGIN}') THEN CREATE ROLE ${RUNTIME_LOGIN} LOGIN PASSWORD 'test-only' IN ROLE app_runtime; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ANON}') THEN CREATE ROLE ${ANON} NOLOGIN; END IF;
  END $$`);
  await sql(env.url, `GRANT USAGE ON SCHEMA public TO ${ANON}; GRANT SELECT ON "Person", "Story" TO ${ANON}`);
});

afterAll(() => env?.cleanup());

describe("row level security", () => {
  it("every app table has RLS and a policy for app_runtime alone", async () => {
    const tables = await sql<{ name: string; rls: boolean; roles: string[] | null }>(
      env.url,
      `SELECT c.relname AS name, c.relrowsecurity AS rls,
              (SELECT array_agg(DISTINCT r.rolname::text) FROM pg_policy p JOIN pg_roles r ON r.oid = ANY (p.polroles) WHERE p.polrelid = c.oid) AS roles
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`,
    );
    expect(tables.length).toBeGreaterThan(20);
    for (const t of tables) {
      expect(t.rls, `${t.name} has RLS`).toBe(true);
      expect(t.roles ?? [], `${t.name} policies`).toEqual(t.name === "_prisma_migrations" ? [] : ["app_runtime"]);
    }
  });

  it("a role without the policy reads nothing, even when granted SELECT", async () => {
    expect(await asRole(ANON, `SELECT * FROM "Person"`)).toEqual([]);
    await expect(asRole(ANON, `INSERT INTO "Person" (id, name, role) VALUES ('x', 'X', 'engineer')`)).rejects.toThrow(/permission denied/);
    await expect(asRole(ANON, `SELECT * FROM "Event"`)).rejects.toThrow(/permission denied/);
  });
});

describe("the runtime role", () => {
  it("runs the app: reads the workspace and records a stance", async () => {
    const url = new URL(env.url);
    url.username = RUNTIME_LOGIN;
    url.password = "test-only";
    const db = createPrisma(url.toString());
    try {
      const ctx = await loadSnapshot(db);
      expect(ctx.stories.map((s) => s.key)).toContain("BILL-150");
      expect(await recordStanceAction(db, { itemId: "it-d1", actorId: "dan", value: "agree", reason: null, now: NOW })).toEqual({ status: "done" });
    } finally {
      await db.$disconnect();
    }
  });

  it("can't change the schema, empty tables wholesale, or read migration history", async () => {
    await expect(asRole("app_runtime", `CREATE TABLE "Sneaky" (id text)`)).rejects.toThrow(/permission denied/);
    await expect(asRole("app_runtime", `ALTER TABLE "Story" ADD COLUMN "isReady" boolean`)).rejects.toThrow(/must be owner/);
    await expect(asRole("app_runtime", `TRUNCATE "Event"`)).rejects.toThrow(/permission denied/);
    await expect(asRole("app_runtime", `SELECT * FROM "_prisma_migrations"`)).rejects.toThrow(/permission denied/);
  });
});
