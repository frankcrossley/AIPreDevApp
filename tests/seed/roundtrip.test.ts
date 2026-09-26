// The seeder writes the snapshot to SQLite and loadSnapshot reads the same data back,
// so the checks the UI will show equal the ones the domain tests prove.
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluateBuiltRight, evaluatePrfaqAgreement, evaluateRightThing } from "@/domain/checks";
import { buildAgenda } from "@/domain/scrum-master";
import type { DomainSnapshot } from "@/domain/types";
import { normaliseSeed } from "@/seed/normalise";
import { loadSnapshot } from "@/server/snapshot";
import { seededDatabase } from "../db";
import { NOW, seedJson } from "../fixtures";

let env: Awaited<ReturnType<typeof seededDatabase>>;
let loaded: DomainSnapshot;
const expected = normaliseSeed(structuredClone(seedJson), NOW).snapshot;

beforeAll(async () => {
  env = await seededDatabase();
  loaded = await loadSnapshot(env.db);
});

afterAll(() => env?.cleanup());

const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));

describe("seed round trip through SQLite", () => {
  it("loads back exactly what was written", () => {
    for (const key of Object.keys(expected) as (keyof DomainSnapshot)[]) {
      expect(byId(loaded[key] as { id: string }[]), key).toEqual(byId(expected[key] as { id: string }[]));
    }
  });

  it("computes the same checks and agenda from the database", () => {
    for (const s of expected.stories) {
      const fromDb = loaded.stories.find((x) => x.id === s.id)!;
      expect(evaluateRightThing(fromDb, loaded)).toEqual(evaluateRightThing(s, expected));
      expect(evaluateBuiltRight(fromDb, loaded)).toEqual(evaluateBuiltRight(s, expected));
    }
    expect(evaluatePrfaqAgreement(loaded.epics[0], loaded)).toEqual(evaluatePrfaqAgreement(expected.epics[0], expected));
    expect(buildAgenda("sess-1", loaded, NOW)).toEqual(buildAgenda("sess-1", expected, NOW));
  });

  it("stores no ready flag", () => {
    const sqlite = new Database(env.file, { readonly: true });
    const columns = sqlite.prepare("select name from pragma_table_info('Story')").all() as { name: string }[];
    sqlite.close();
    expect(columns.map((c) => c.name).filter((n) => /ready/i.test(n))).toEqual([]);
  });
});
