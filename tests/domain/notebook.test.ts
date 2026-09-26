// 02-notebook, domain side: prefixes, section diffs, turning structure on and off,
// blocking questions, and the reopen warning for agreed content.
import { describe, expect, it } from "vitest";
import { evaluateBuiltRight } from "@/domain/checks";
import { reopenOnEdit } from "@/domain/lifecycle";
import {
  agreedBy,
  applyOps,
  defaultRequiredStances,
  diffSection,
  newDraftStory,
  parsePrefix,
  reopenImpact,
  reopenWarning,
  setBlocking,
  type SectionLine,
} from "@/domain/notebook";
import type { DomainSnapshot } from "@/domain/types";
import { NOW, seeded, story } from "../fixtures";

let counter = 0;
const newId = () => `new-${++counter}`;
const lines = (ctx: DomainSnapshot, section: string): SectionLine[] =>
  ctx.blocks
    .filter((b) => b.parentId === "bill-150" && b.section === section)
    .sort((a, b) => a.order - b.order)
    .map((b) => {
      const item = ctx.items.find((i) => i.blockId === b.id && i.status !== "archived");
      return { blockId: b.id, itemId: item?.id ?? null, itemType: item?.type ?? null, text: b.text };
    });
const diff = (ctx: DomainSnapshot, section: string, next: SectionLine[], actorId = "priya") =>
  diffSection({ ctx, storyId: "bill-150", section, lines: next, actorId, now: NOW, newId });

describe("parsePrefix", () => {
  it.each([
    ["decision: Downgrades apply next cycle", "decision", "Downgrades apply next cycle"],
    ["Decision:Downgrades apply next cycle", "decision", "Downgrades apply next cycle"],
    ["? What about downgrades", "question", "What about downgrades"],
    ["assume: Most customers upgrade", "assumption", "Most customers upgrade"],
    ["risk: Customers game downgrades", "risk", "Customers game downgrades"],
  ])("%s", (input, type, text) => {
    expect(parsePrefix(input)).toEqual({ type, text });
  });

  it.each(["What about downgrades?", "risky change", "decisions were made", "assume", "? ", "  "])("no chip for %j", (input) => {
    expect(parsePrefix(input)).toBeNull();
  });
});

describe("diffSection", () => {
  it("returns nothing when nothing changed", () => {
    const ctx = seeded();
    expect(diff(ctx, "What we heard", lines(ctx, "What we heard"))).toEqual([]);
  });

  it("a new prefixed line becomes a block and an item owned by its author", () => {
    const ctx = seeded();
    const ops = diff(ctx, "Edge cases", [...lines(ctx, "Edge cases"), { blockId: null, itemId: null, itemType: null, text: "? What about downgrades" }], "marcus");
    const block = ops.find((o) => o.op === "createBlock")!;
    const item = ops.find((o) => o.op === "createItem")!;
    expect(block).toMatchObject({ op: "createBlock", block: { section: "Edge cases", order: 3, text: "What about downgrades", authorId: "marcus" } });
    expect(item).toMatchObject({ op: "createItem", item: { type: "question", text: "What about downgrades", ownerId: "marcus", blocking: false, blockId: block.op === "createBlock" ? block.block.id : "" } });
  });

  it("a new decision asks the lead, the author and the epic's tech lead for stances", () => {
    const ctx = seeded();
    const ops = diff(ctx, "What we think", [...lines(ctx, "What we think"), { blockId: null, itemId: null, itemType: "decision", text: "Downgrades apply from the next cycle." }], "marcus");
    const item = ops.find((o) => o.op === "createItem");
    expect(item && item.op === "createItem" && item.item.requiredStanceIds).toEqual(["priya", "marcus", "dan"]);
    expect(defaultRequiredStances(story(ctx, "BILL-150"), "dan", ctx)).toEqual(["priya", "dan"]);
  });

  it("Turn into: the item's text is the selection, linked to the whole line", () => {
    const ctx = seeded();
    const next = lines(ctx, "Edge cases").map((l) =>
      l.blockId === "b7" ? { ...l, itemType: "risk", itemText: "A customer changes plan twice in one month." } : l,
    );
    const ops = diff(ctx, "Edge cases", next);
    expect(ops).toEqual([
      expect.objectContaining({ op: "createItem", item: expect.objectContaining({ blockId: "b7", type: "risk", text: "A customer changes plan twice in one month." }) }),
    ]);
  });

  it("editing a line updates its block, and the item text when it followed the line", () => {
    const ctx = seeded();
    const next = lines(ctx, "Edge cases").map((l) => (l.blockId === "b6" ? { ...l, text: "What happens on a downgrade mid-month?" } : l));
    expect(diff(ctx, "Edge cases", next)).toEqual([
      { op: "updateBlock", id: "b6", text: "What happens on a downgrade mid-month?" },
      { op: "updateItem", id: "it-q1", text: "What happens on a downgrade mid-month?" },
    ]);
  });

  it("reordering updates orders only", () => {
    const ctx = seeded();
    const next = [...lines(ctx, "Edge cases")].reverse();
    expect(diff(ctx, "Edge cases", next)).toEqual([
      { op: "updateBlock", id: "b7", order: 1 },
      { op: "updateBlock", id: "b6", order: 2 },
    ]);
  });

  it("Turn back into plain text archives the item and keeps the text", () => {
    const ctx = seeded();
    const next = lines(ctx, "What we think").map((l) => (l.blockId === "b4" ? { ...l, itemId: null, itemType: null } : l));
    const ops = diff(ctx, "What we think", next);
    expect(ops).toEqual([{ op: "archiveItem", id: "it-d1" }]);
    const after = applyOps(ctx, ops, NOW);
    expect(after.blocks.find((b) => b.id === "b4")!.text).toBe("Upgrades apply immediately, charged by the day.");
    expect(after.items.find((i) => i.id === "it-d1")!.status).toBe("archived");
    expect(after.stances.filter((s) => s.itemId === "it-d1")).toHaveLength(3);
    // The archived decision no longer needs Dan's stance.
    expect(evaluateBuiltRight(story(after, "BILL-150"), after).find((r) => r.key === "stances_complete")!.passed).toBe(true);
  });

  it("deleting a line removes the block and archives its item", () => {
    const ctx = seeded();
    const next = lines(ctx, "Edge cases").filter((l) => l.blockId !== "b6");
    expect(diff(ctx, "Edge cases", next)).toEqual([
      { op: "archiveItem", id: "it-q1" },
      { op: "deleteBlock", id: "b6" },
      { op: "updateBlock", id: "b7", order: 1 },
    ]);
  });

  it("changing a line's chip type archives the old item and creates a new one", () => {
    const ctx = seeded();
    const next = lines(ctx, "Edge cases").map((l) => (l.blockId === "b6" ? { ...l, itemId: null, itemType: "risk" } : l));
    const ops = diff(ctx, "Edge cases", next);
    expect(ops.map((o) => o.op)).toEqual(["archiveItem", "createItem"]);
  });

  it("refuses blocks from another story or section", () => {
    const ctx = seeded();
    expect(() => diff(ctx, "Edge cases", [{ blockId: "b20", itemId: null, itemType: null, text: "x" }])).toThrow();
    expect(() => diff(ctx, "Edge cases", [{ blockId: "b1", itemId: null, itemType: null, text: "x" }])).toThrow();
  });

  it("drops empty lines", () => {
    const ctx = seeded();
    const ops = diff(ctx, "Edge cases", [...lines(ctx, "Edge cases"), { blockId: null, itemId: null, itemType: null, text: "   " }]);
    expect(ops).toEqual([]);
  });
});

describe("blocking questions", () => {
  it("marking a question blocking fails Built right with a link to it", () => {
    const ctx = seeded();
    const q = ctx.items.find((i) => i.id === "it-q1")!;
    Object.assign(q, setBlocking(q, false));
    expect(evaluateBuiltRight(story(ctx, "BILL-150"), ctx).find((r) => r.key === "no_blocking_questions")!.passed).toBe(true);
    Object.assign(q, setBlocking(q, true));
    const r = evaluateBuiltRight(story(ctx, "BILL-150"), ctx).find((x) => x.key === "no_blocking_questions")!;
    expect(r.passed).toBe(false);
    expect(r.fixTarget).toEqual({ type: "item", id: "it-q1" });
  });

  it("only questions can block", () => {
    const ctx = seeded();
    expect(() => setBlocking(ctx.items.find((i) => i.id === "it-d1")!, true)).toThrow(/question/);
  });
});

describe("agreed content", () => {
  it("names who agreed a decision in its current round, in the order they were asked", () => {
    const ctx = seeded();
    expect(agreedBy(["b4"], "bill-150", ctx)).toEqual(["priya", "sam", "marcus"]);
    expect(agreedBy(["b7"], "bill-150", ctx)).toEqual([]);
    ctx.items.find((i) => i.id === "it-d1")!.stanceRound = 2;
    expect(agreedBy(["b4"], "bill-150", ctx)).toEqual([]);
  });

  it("once a story is Ready, every line is agreed content", () => {
    const ctx = seeded();
    Object.assign(story(ctx, "BILL-150"), { state: "ready", signedOffBy: "priya" });
    expect(agreedBy(["b7"], "bill-150", ctx)).toEqual(["priya", "sam", "marcus"]);
  });

  it("an item-only change to an agreed line (e.g. its text) counts too", () => {
    const ctx = seeded();
    const next = lines(ctx, "What we think").map((l) => (l.blockId === "b4" ? { ...l, text: "Upgrades apply immediately." } : l));
    const ops = diff(ctx, "What we think", next);
    expect(ops.map((o) => o.op)).toEqual(["updateBlock", "updateItem"]);
  });

  it.each([
    [["Priya"], "Priya agreed this. Saving reopens it for them."],
    [["Priya", "Sam"], "Priya and Sam agreed this. Saving reopens it for both."],
    [["Priya", "Sam", "Dan"], "Priya, Sam and Dan agreed this. Saving reopens it for all three."],
    [["Priya", "Sam", "Marcus", "Dan"], "Priya, Sam, Marcus and Dan agreed this. Saving reopens it for all four."],
  ])("warning for %j", (names, text) => {
    expect(reopenWarning(names)).toBe(text);
  });
});

describe("ids from the editor", () => {
  it("creates new blocks and items with the ids the editor assigned", () => {
    const ctx = seeded();
    const ops = diff(ctx, "Edge cases", [...lines(ctx, "Edge cases"), { blockId: "blk-a1", itemId: "itm-a1", itemType: "question", text: "Proration on annual plans?" }]);
    expect(ops).toEqual([
      expect.objectContaining({ op: "createBlock", block: expect.objectContaining({ id: "blk-a1" }) }),
      expect.objectContaining({ op: "createItem", item: expect.objectContaining({ id: "itm-a1", blockId: "blk-a1" }) }),
    ]);
    // Saving the same content again changes nothing.
    const after = applyOps(ctx, ops, NOW);
    expect(diff(after, "Edge cases", lines(after, "Edge cases"))).toEqual([]);
  });

  it("refuses duplicate or malformed ids", () => {
    const ctx = seeded();
    const l = { itemId: null, itemType: null, text: "x" };
    expect(() => diff(ctx, "Edge cases", [{ ...l, blockId: "dup" }, { ...l, blockId: "dup" }])).toThrow(/twice/);
    expect(() => diff(ctx, "Edge cases", [{ ...l, blockId: "has space" }])).toThrow(/Invalid/);
  });

  it("undoing Turn back into plain text restores the archived item with its stances", () => {
    const ctx = seeded();
    const plain = lines(ctx, "What we think").map((l) => (l.blockId === "b4" ? { ...l, itemId: null, itemType: null } : l));
    const archived = applyOps(ctx, diff(ctx, "What we think", plain), NOW);
    const undone = lines(ctx, "What we think");
    expect(diff(archived, "What we think", undone)).toEqual([{ op: "restoreItem", id: "it-d1" }]);
  });
});

describe("reopening agreed and ready stories (ADR-015)", () => {
  const newLineOps = (ctx: DomainSnapshot) =>
    diff(ctx, "Edge cases", [...lines(ctx, "Edge cases"), { blockId: "blk-late", itemId: null, itemType: null, text: "Annual plans too." }]);

  it("a new line on a Ready story reopens it for everyone who agreed, and its signer", () => {
    const ctx = seeded();
    Object.assign(story(ctx, "BILL-150"), { state: "ready", signedOffBy: "priya", signedOffAt: NOW });
    const impact = reopenImpact(newLineOps(ctx), story(ctx, "BILL-150"), ctx);
    expect(impact).toEqual({
      reopen: true,
      editedIds: ["bill-150"],
      personIds: ["priya", "sam", "marcus"],
      warning: "Priya, Sam and Marcus agreed this. Saving reopens it for all three.",
    });
    const r = reopenOnEdit(story(ctx, "BILL-150"), impact.editedIds, ctx);
    expect(r.story).toMatchObject({ state: "in_refinement", signedOffBy: null });
    expect(r.items.map((i) => [i.id, i.stanceRound])).toEqual([["it-d1", 2]]);
  });

  it("editing a plain line of a Ready story still asks everyone again", () => {
    const ctx = seeded();
    Object.assign(story(ctx, "BILL-150"), { state: "ready", signedOffBy: "priya" });
    expect(reopenOnEdit(story(ctx, "BILL-150"), "b7", ctx).askStanceFrom).toEqual(["priya", "sam", "marcus"]);
  });

  it("an Agreed story with nobody to name still reopens, with a plain warning", () => {
    const ctx = seeded();
    ctx.stances = [];
    story(ctx, "BILL-150").state = "agreed";
    const impact = reopenImpact(newLineOps(ctx), story(ctx, "BILL-150"), ctx);
    expect(impact).toMatchObject({ reopen: true, personIds: [], warning: "BILL-150 is Agreed. Saving reopens it." });
  });

  it("in refinement, a plain line edit doesn't reopen anything", () => {
    const ctx = seeded();
    const next = lines(ctx, "Edge cases").map((l) => (l.blockId === "b7" ? { ...l, text: "Twice in a month is fine." } : l));
    expect(reopenImpact(diff(ctx, "Edge cases", next), story(ctx, "BILL-150"), ctx).reopen).toBe(false);
  });

  it("no ops, no reopen", () => {
    const ctx = seeded();
    story(ctx, "BILL-150").state = "ready";
    expect(reopenImpact([], story(ctx, "BILL-150"), ctx).reopen).toBe(false);
  });
});

describe("Turn into → Story", () => {
  it("creates a draft story whose first line cites the line it came from", () => {
    const ctx = seeded();
    const r = newDraftStory({ epic: ctx.epics[0], ctx, title: "  both the plan and\n the invoice line ", actorId: "marcus", sourceBlockId: "b5", now: NOW });
    expect(r.story).toMatchObject({ id: "bill-164", key: "BILL-164", title: "both the plan and the invoice line", state: "draft", leadId: "marcus", templateId: "tpl-story" });
    expect(r.block).toMatchObject({ parentId: "bill-164", section: "What we heard", text: "both the plan and the invoice line" });
    expect(r.citation).toMatchObject({ fromType: "block", fromId: r.block!.id, toType: "block", toId: "b5" });
  });

  it("refuses empty or overlong titles", () => {
    const ctx = seeded();
    const base = { epic: ctx.epics[0], ctx, actorId: "priya", sourceBlockId: null, now: NOW };
    expect(() => newDraftStory({ ...base, title: "  " })).toThrow();
    expect(() => newDraftStory({ ...base, title: "x".repeat(201) })).toThrow(/200/);
  });
});
