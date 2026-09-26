import { readFileSync } from "node:fs";
import { normaliseSeed } from "@/seed/normalise";
import type { DomainSnapshot } from "@/domain/types";

/** Fixed "now" so the planned session (in 5 days) lands on Thu 3 Oct 2024. */
export const NOW = new Date("2024-09-28T09:00:00Z");

export const seedJson = JSON.parse(readFileSync(new URL("../seed/seed.json", import.meta.url), "utf8"));

/** A fresh snapshot of the seed data. Each call returns new objects, so tests can mutate freely. */
export function seeded(now: Date = NOW): DomainSnapshot {
  return normaliseSeed(structuredClone(seedJson), now).snapshot;
}

export function story(ctx: DomainSnapshot, key: string) {
  const s = ctx.stories.find((x) => x.key === key);
  if (!s) throw new Error(`No story ${key}`);
  return s;
}

/**
 * The bolt 4 demo path, applied to data: answer the downgrade question, get Dan's stance,
 * answer the Architect, and agree the PRFAQ. After this every BILL-150 check passes.
 */
export function makeBill150Pass(ctx: DomainSnapshot): DomainSnapshot {
  ctx.items.find((i) => i.id === "it-q1")!.status = "resolved";
  ctx.stances.push({
    id: "st-dan",
    itemId: "it-d1",
    personId: "dan",
    value: "agree",
    reason: null,
    round: 1,
    createdAt: NOW,
  });
  ctx.hatNotes.find((h) => h.id === "hn3")!.status = "accepted";
  ctx.prfaqs.find((p) => p.id === "prfaq-142")!.state = "agreed";
  return ctx;
}
