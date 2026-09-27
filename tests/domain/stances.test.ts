// Stances: only people take them, only the people asked, and objections need a reason.
import { describe, expect, it } from "vitest";
import { evaluateBuiltRight } from "@/domain/checks";
import { applyOps, answerQuestion } from "@/domain/notebook";
import { canRecordStance, recordStance, setRequiredStances, stanceSummary } from "@/domain/stances";
import { NOW, seeded, story } from "../fixtures";

describe("recording a stance", () => {
  it("Dan's agree completes the decision's stances", () => {
    const ctx = seeded();
    ctx.stances.push(recordStance({ ctx, itemId: "it-d1", personId: "dan", value: "agree", reason: null, now: NOW, id: "st-new" }));
    expect(evaluateBuiltRight(story(ctx, "BILL-150"), ctx).find((r) => r.key === "stances_complete")!.passed).toBe(true);
    expect(stanceSummary(ctx.items.find((i) => i.id === "it-d1")!, ctx).map((r) => [r.name, r.value])).toEqual([
      ["Priya", "agree"],
      ["Sam", "agree"],
      ["Marcus", "agree"],
      ["Dan", "agree"],
    ]);
  });

  it("goes into the current round", () => {
    const ctx = seeded();
    ctx.items.find((i) => i.id === "it-d1")!.stanceRound = 3;
    expect(recordStance({ ctx, itemId: "it-d1", personId: "dan", value: "concern", reason: null, now: NOW, id: "x" }).round).toBe(3);
  });

  it("an objection needs a reason", () => {
    const ctx = seeded();
    expect(() => recordStance({ ctx, itemId: "it-d1", personId: "dan", value: "object", reason: " ", now: NOW, id: "x" })).toThrow(/why/);
    expect(recordStance({ ctx, itemId: "it-d1", personId: "dan", value: "object", reason: "Breaks ADR-022", now: NOW, id: "x" }).reason).toBe("Breaks ADR-022");
  });

  it("only people asked, only on live decisions", () => {
    const ctx = seeded();
    expect(canRecordStance("mei", "it-d1", ctx)).toEqual({ ok: false, reason: "You weren't asked for a stance on this" });
    expect(canRecordStance("dan", "it-q1", ctx)).toEqual({ ok: false, reason: "Stances are for decisions" });
    ctx.items.find((i) => i.id === "it-d1")!.status = "archived";
    expect(canRecordStance("dan", "it-d1", ctx)).toMatchObject({ ok: false });
  });
});

describe("who's asked", () => {
  it("the lead sets it", () => {
    const ctx = seeded();
    const item = ctx.items.find((i) => i.id === "it-d1")!;
    expect(setRequiredStances(item, ["priya", "dan", "dan"], "priya", story(ctx, "BILL-150"), ctx).requiredStanceIds).toEqual(["priya", "dan"]);
    expect(() => setRequiredStances(item, ["priya"], "sam", story(ctx, "BILL-150"), ctx)).toThrow(/Priya is the lead/);
    expect(() => setRequiredStances(item, [], "priya", story(ctx, "BILL-150"), ctx)).toThrow();
  });
});

describe("answering a question", () => {
  it("adds the answer under the question and resolves it", () => {
    const ctx = seeded();
    let n = 0;
    const r = answerQuestion({ ctx, itemId: "it-q1", text: "Downgrades apply from the next billing cycle.", asDecision: false, actorId: "priya", now: NOW, newId: () => `a-${++n}` });
    const after = applyOps(ctx, r.ops, NOW);
    expect(after.items.find((i) => i.id === "it-q1")!.status).toBe("resolved");
    const lines = after.blocks.filter((b) => b.parentId === "bill-150" && b.section === "Edge cases").sort((a, b) => a.order - b.order);
    expect(lines.map((b) => b.text)).toEqual([
      "What happens on a downgrade mid-cycle?",
      "Downgrades apply from the next billing cycle.",
      "A customer changes plan twice in one month. Probably fine, same rule applies.",
    ]);
    expect(evaluateBuiltRight(story(after, "BILL-150"), after).find((x) => x.key === "no_blocking_questions")!.passed).toBe(true);
  });

  it("as a decision, the answer asks for its own stances", () => {
    const ctx = seeded();
    const r = answerQuestion({ ctx, itemId: "it-q1", text: "Downgrades apply next cycle.", asDecision: true, actorId: "priya", now: NOW, newId: (() => { let k = 0; return () => `d-${++k}`; })() });
    expect(r.ops.some((o) => o.op === "createItem" && o.item.type === "decision")).toBe(true);
  });

  it("refuses answered or non-questions", () => {
    const ctx = seeded();
    const base = { ctx, text: "x", asDecision: false, actorId: "priya", now: NOW, newId: () => "z" };
    expect(() => answerQuestion({ ...base, itemId: "it-d1" })).toThrow();
    ctx.items.find((i) => i.id === "it-q1")!.status = "resolved";
    expect(() => answerQuestion({ ...base, itemId: "it-q1" })).toThrow(/already answered/);
  });
});

describe("who's asked: the edges", () => {
  it("someone who objects stays asked until they resolve it", () => {
    const ctx = seeded();
    ctx.stances.push({ id: "o", itemId: "it-d1", personId: "dan", value: "object", reason: "Needs an event", round: 1, createdAt: NOW });
    const item = ctx.items.find((i) => i.id === "it-d1")!;
    expect(() => setRequiredStances(item, ["priya", "sam", "marcus"], "priya", story(ctx, "BILL-150"), ctx)).toThrow(/Dan objects/);
  });

  it("only epic members can be asked", () => {
    const ctx = seeded();
    const item = ctx.items.find((i) => i.id === "it-d1")!;
    expect(() => setRequiredStances(item, ["priya", "jo"], "priya", story(ctx, "BILL-150"), ctx)).toThrow(/Jo isn't on the epic/);
  });

  it("nothing about stances changes on a Ready story", () => {
    const ctx = seeded();
    story(ctx, "BILL-150").state = "ready";
    const item = ctx.items.find((i) => i.id === "it-d1")!;
    expect(() => setRequiredStances(item, ["priya", "dan"], "priya", story(ctx, "BILL-150"), ctx)).toThrow(/Ready/);
    expect(canRecordStance("dan", "it-d1", ctx)).toEqual({ ok: false, reason: "BILL-150 is Ready. Edit it to reopen it before changing stances." });
  });

  it("only the lead answers a question", () => {
    const ctx = seeded();
    expect(() => answerQuestion({ ctx, itemId: "it-q1", text: "Next cycle.", asDecision: false, actorId: "sam", now: NOW, newId: () => "z1" })).toThrow(/Priya is the lead/);
  });
});
