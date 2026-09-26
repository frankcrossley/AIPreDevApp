// Quoted excerpts must be exact substrings of their source (docs/domain.md, Excerpt).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { seeded } from "../fixtures";

describe("seed excerpts", () => {
  const ctx = seeded();

  it("every quote from a source file appears in it word for word, at its locator", () => {
    const withFiles = ctx.excerpts.filter((e) => e.kind === "quote" && ctx.sources.find((s) => s.id === e.sourceId)?.uri);
    expect(withFiles.length).toBeGreaterThan(0);
    for (const e of withFiles) {
      const source = ctx.sources.find((s) => s.id === e.sourceId)!;
      const lines = readFileSync(new URL(`../../seed/${source.uri}`, import.meta.url), "utf8").split("\n");
      const line = lines.find((l) => l.startsWith(`${e.locator} `));
      expect(line, `${e.id} locator ${e.locator}`).toBeDefined();
      expect(line!.includes(e.text), e.id).toBe(true);
    }
  });

  it("the survey theme count matches the CSV's size", () => {
    const rows = readFileSync(new URL("../../seed/sources/survey.csv", import.meta.url), "utf8").trim().split("\n").slice(1);
    expect(rows).toHaveLength(40);
    expect(ctx.excerpts.find((e) => e.id === "ex-survey-overcharged")!.text).toContain("of 40");
  });

  it("every citation, hat-note ref and draft link resolves", () => {
    const ids = new Set([...ctx.blocks, ...ctx.excerpts, ...ctx.items, ...ctx.criteria].map((x) => x.id));
    for (const c of ctx.citations) expect(ids.has(c.toId), c.id).toBe(true);
    for (const h of ctx.hatNotes) for (const r of h.refs) expect(ids.has(r), `${h.id} → ${r}`).toBe(true);
    for (const d of ctx.drafts) if (d.excerptId) expect(ids.has(d.excerptId), d.id).toBe(true);
  });
});
