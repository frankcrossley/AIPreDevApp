// Suggest mode (ADR-025): the lead edits, everyone else suggests. Nothing changes until the lead accepts.
import { describe, expect, it } from "vitest";
import { applyOps, sectionLines } from "@/domain/notebook";
import { acceptSuggestion, applySuggestions, editsDirectly, pendingSuggestions, toSuggestions } from "@/domain/suggestions";
import type { DomainSnapshot, Draft } from "@/domain/types";
import { NOW, seeded, story } from "../fixtures";

let n = 0;
const newId = () => `s-${++n}`;
const suggest = (ctx: DomainSnapshot, section: string, lines: ReturnType<typeof sectionLines>, authorId = "marcus") =>
  toSuggestions({ ctx, story: story(ctx, "BILL-150"), section, lines, authorId, now: NOW, newId });
const save = (ctx: DomainSnapshot, r: ReturnType<typeof toSuggestions>) => {
  for (const d of r.upserts) {
    const i = ctx.drafts.findIndex((x) => x.id === d.id);
    if (i >= 0) ctx.drafts[i] = d;
    else ctx.drafts.push(d);
  }
  for (const id of r.withdrawIds) ctx.drafts.find((d) => d.id === id)!.status = "withdrawn";
};

describe("who edits directly", () => {
  it("the lead does; others suggest", () => {
    const ctx = seeded();
    expect(editsDirectly("priya", story(ctx, "BILL-150"))).toBe(true);
    expect(editsDirectly("marcus", story(ctx, "BILL-150"))).toBe(false);
    expect(editsDirectly("mei", story(ctx, "BILL-160"))).toBe(true);
  });
});

describe("toSuggestions", () => {
  it("a new line from Marcus becomes an add suggestion after the line it follows", () => {
    const ctx = seeded();
    const lines = [...sectionLines("bill-150", "Edge cases", ctx), { blockId: "blk-m1", itemId: null, itemType: "question", text: "What about annual plans?" }];
    const r = suggest(ctx, "Edge cases", lines);
    expect(r.withdrawIds).toEqual([]);
    expect(r.upserts).toEqual([
      expect.objectContaining({
        kind: "suggestion",
        status: "pending",
        authorId: "marcus",
        targetId: "bill-150",
        section: "Edge cases",
        op: "add",
        blockId: "blk-m1",
        afterBlockId: "b7",
        itemType: "question",
        text: "What about annual plans?",
        expiresAt: ctx.sessions[0].date,
      }),
    ]);
  });

  it("edits, removals and chip changes each become one suggestion", () => {
    const ctx = seeded();
    const lines = sectionLines("bill-150", "Edge cases", ctx)
      .filter((l) => l.blockId !== "b7")
      .map((l) => (l.blockId === "b6" ? { ...l, text: "What happens on a downgrade mid-month?" } : l));
    const think = sectionLines("bill-150", "What we think", ctx).map((l) => (l.blockId === "b5" ? { ...l, itemType: "assumption" } : l));
    expect(suggest(ctx, "Edge cases", lines).upserts.map((d) => [d.op, d.blockId, d.text])).toEqual([
      ["remove", "b7", "A customer changes plan twice in one month. Probably fine, same rule applies."],
      ["edit", "b6", "What happens on a downgrade mid-month?"],
    ]);
    expect(suggest(ctx, "What we think", think).upserts.map((d) => [d.op, d.blockId, d.itemType])).toEqual([["chip", "b5", "assumption"]]);
  });

  it("saving again keeps the same suggestion and its expiry; taking an edit back withdraws it", () => {
    const ctx = seeded();
    const base = sectionLines("bill-150", "Edge cases", ctx);
    save(ctx, suggest(ctx, "Edge cases", [...base, { blockId: "blk-m1", itemId: null, itemType: null, text: "Annual plans" }]));
    const first = pendingSuggestions(ctx, "bill-150")[0];

    // Marcus's own view shows his suggestion applied; saving it unchanged changes nothing.
    const view = applySuggestions(base, pendingSuggestions(ctx, "bill-150", "Edge cases"), ctx);
    expect(suggest(ctx, "Edge cases", view)).toEqual({ upserts: [], withdrawIds: [] });

    // He keeps typing: same suggestion, new text, same expiry.
    const typed = suggest(ctx, "Edge cases", [...base, { blockId: "blk-m1", itemId: null, itemType: null, text: "Annual plans renew mid-cycle too." }]);
    expect(typed.upserts).toEqual([{ ...first, text: "Annual plans renew mid-cycle too." }]);

    // He deletes his line again: the suggestion is withdrawn.
    expect(suggest(ctx, "Edge cases", base)).toEqual({ upserts: [], withdrawIds: [first.id] });
  });

  it("other people's suggestions are left alone", () => {
    const ctx = seeded();
    save(ctx, suggest(ctx, "Edge cases", [...sectionLines("bill-150", "Edge cases", ctx), { blockId: "blk-m1", itemId: null, itemType: null, text: "Annual plans" }]));
    expect(suggest(ctx, "Edge cases", sectionLines("bill-150", "Edge cases", ctx), "sam")).toEqual({ upserts: [], withdrawIds: [] });
  });
});

describe("accepting a suggestion", () => {
  const suggestion = (over: Partial<Draft>): Draft => ({
    id: "sg",
    targetType: "story",
    targetId: "bill-150",
    text: "",
    authorId: "dan",
    excerptId: null,
    sourceId: null,
    createdAt: NOW,
    expiresAt: NOW,
    status: "pending",
    triagedBy: null,
    triagedAt: null,
    resultBlockId: null,
    kind: "suggestion",
    section: "Edge cases",
    op: "add",
    blockId: "blk-d1",
    afterBlockId: "b6",
    itemType: null,
    hatNoteId: null,
    ...over,
  });

  it("an added line lands where it was suggested, credited to its author", () => {
    const ctx = seeded();
    const r = acceptSuggestion(suggestion({ text: "Annual plans too." }), ctx, NOW, newId);
    const after = applyOps(ctx, r.ops, NOW);
    expect(sectionLines("bill-150", "Edge cases", after).map((l) => l.blockId)).toEqual(["b6", "blk-d1", "b7"]);
    expect(after.blocks.find((b) => b.id === "blk-d1")!.authorId).toBe("dan");
    expect(r.impact.reopen).toBe(false);
  });

  it("Dan's edit to the agreed decision warns Priya before it reopens", () => {
    const ctx = seeded();
    const r = acceptSuggestion(suggestion({ op: "edit", section: "What we think", blockId: "b4", afterBlockId: null, text: "Upgrades apply immediately, rounded to the day." }), ctx, NOW, newId);
    expect(r.impact).toMatchObject({ reopen: true, personIds: ["priya", "sam", "marcus"], warning: "Priya, Sam and Marcus agreed this. Accepting reopens it for all three." });
  });

  it("a suggestion whose line is gone can't be accepted", () => {
    const ctx = seeded();
    expect(() => acceptSuggestion(suggestion({ op: "edit", blockId: "nope", text: "x" }), ctx, NOW, newId)).toThrow(/gone/);
  });

  it("an add after another pending add goes after where that one would go", () => {
    const ctx = seeded();
    ctx.drafts.push(suggestion({ id: "first", blockId: "blk-a", afterBlockId: "b6", text: "A" }));
    const r = acceptSuggestion(suggestion({ id: "second", blockId: "blk-b", afterBlockId: "blk-a", text: "B" }), ctx, NOW, newId);
    const after = applyOps(ctx, r.ops, NOW);
    expect(sectionLines("bill-150", "Edge cases", after).map((l) => l.blockId)).toEqual(["b6", "blk-b", "b7"]);
  });
});
