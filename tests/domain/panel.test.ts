// 01-workspace "For this item" count and 02-notebook panel sections.
import { describe, expect, it } from "vitest";
import { panelSections } from "@/domain/panel";
import { seeded, story } from "../fixtures";

describe("For this item", () => {
  it("BILL-150: the decision waiting on Dan and the blocking question are Decisions needed", () => {
    const ctx = seeded();
    const p = panelSections(story(ctx, "BILL-150"), ctx);
    expect(p.decisionsNeeded.map((c) => [c.itemId, c.detail])).toEqual([
      ["it-d1", "Waiting on Dan"],
      ["it-q1", "Blocking · owner Priya"],
    ]);
    expect(p.talkingPoints).toEqual([]);
    expect(p.count).toBe(2);
  });

  it.each([
    ["question", false, "talkingPoints"],
    ["question", true, "decisionsNeeded"],
    ["assumption", false, "talkingPoints"],
    ["risk", false, "talkingPoints"],
    ["decision", false, "decisionsNeeded"],
  ] as const)("a %s (blocking %s) goes under %s", (type, blocking, section) => {
    const ctx = seeded();
    ctx.items.push({ id: "x", parentType: "story", parentId: "bill-150", blockId: "b7", type, text: "t", status: "open", ownerId: "priya", blocking, requiredStanceIds: type === "decision" ? ["priya"] : [], stanceRound: 1 });
    const p = panelSections(story(ctx, "BILL-150"), ctx);
    expect(p[section].map((c) => c.itemId)).toContain("x");
  });

  it("leaves out archived items, resolved questions and fully agreed decisions", () => {
    const ctx = seeded();
    ctx.items.find((i) => i.id === "it-q1")!.status = "resolved";
    ctx.stances.push({ id: "d", itemId: "it-d1", personId: "dan", value: "agree", reason: null, round: 1, createdAt: new Date() });
    expect(panelSections(story(ctx, "BILL-150"), ctx).count).toBe(0);
  });
});
