// Floor and team checks, one rule at a time. docs/domain.md "Floor checks".
import { describe, expect, it } from "vitest";
import {
  CHECK_DEFINITIONS,
  FLOOR_CHECK_KEYS,
  evaluateBuiltRight,
  evaluatePrfaqAgreement,
  evaluateRightThing,
  latestStances,
} from "@/domain/checks";
import type { CheckResult, DomainSnapshot, FixTarget } from "@/domain/types";
import { NOW, makeBill150Pass, seeded, story } from "../fixtures";

const result = (results: CheckResult[], key: string) => {
  const r = results.find((x) => x.key === key);
  if (!r) throw new Error(`No result ${key}`);
  return r;
};
const built = (ctx: DomainSnapshot, key = "BILL-150") => evaluateBuiltRight(story(ctx, key), ctx);
const right = (ctx: DomainSnapshot, key = "BILL-150") => evaluateRightThing(story(ctx, key), ctx);

function resolves(ctx: DomainSnapshot, t: FixTarget): boolean {
  const pools: Record<FixTarget["type"], { id: string }[]> = {
    story: ctx.stories,
    epic: ctx.epics,
    block: ctx.blocks,
    item: ctx.items,
    criterion: ctx.criteria,
    hatNote: ctx.hatNotes,
    prfaq: ctx.prfaqs,
    promise: ctx.promises,
    faq: ctx.faqEntries,
    readBack: ctx.readBacks,
    person: ctx.people,
  };
  return pools[t.type].some((x) => x.id === t.id);
}

describe("every failing line links to its fix", () => {
  it("each failing check on every seeded story and the epic has a fixTarget that exists", () => {
    const ctx = seeded();
    const all = [
      ...ctx.stories.flatMap((s) => [...evaluateBuiltRight(s, ctx), ...evaluateRightThing(s, ctx)]),
      ...ctx.epics.flatMap((e) => evaluatePrfaqAgreement(e, ctx)),
    ];
    for (const r of all.filter((x) => !x.passed)) {
      expect(r.fixTarget, r.key).not.toBeNull();
      expect(r.blockers.length, r.key).toBeGreaterThan(0);
      for (const b of r.blockers) expect(resolves(ctx, b.fixTarget), `${r.key} → ${b.fixTarget.type}:${b.fixTarget.id}`).toBe(true);
    }
    for (const r of all.filter((x) => x.passed)) expect(r.fixTarget).toBeNull();
  });

  it("points BILL-150's failures at the downgrade question, the decision and the Architect's challenge", () => {
    const results = built(seeded());
    expect(result(results, "no_blocking_questions").fixTarget).toEqual({ type: "item", id: "it-q1" });
    expect(result(results, "stances_complete").fixTarget).toEqual({ type: "item", id: "it-d1" });
    expect(result(results, "arch_questions_answered").fixTarget).toEqual({ type: "hatNote", id: "hn3" });
    expect(result(right(seeded()), "team_aligned").fixTarget).toEqual({ type: "prfaq", id: "prfaq-142" });
  });
});

describe("Built right floor checks", () => {
  it("no_blocking_questions ignores non-blocking and resolved questions", () => {
    const ctx = seeded();
    ctx.items.find((i) => i.id === "it-q1")!.blocking = false;
    expect(result(built(ctx), "no_blocking_questions").passed).toBe(true);
    const ctx2 = seeded();
    ctx2.items.find((i) => i.id === "it-q1")!.status = "resolved";
    expect(result(built(ctx2), "no_blocking_questions").passed).toBe(true);
  });

  it("no_unresolved_conflicts fails on an open conflict hat note", () => {
    const ctx = seeded();
    expect(result(built(ctx), "no_unresolved_conflicts").passed).toBe(true);
    ctx.hatNotes.push({ id: "hnx", hat: "arch", targetType: "block", targetId: "b5", kind: "conflict", text: "Conflicts with ADR-022?", refs: [], status: "open" });
    const r = result(built(ctx), "no_unresolved_conflicts");
    expect(r.passed).toBe(false);
    expect(r.fixTarget).toEqual({ type: "hatNote", id: "hnx" });
  });

  it("no_unresolved_conflicts fails on an object stance until the same person later changes it", () => {
    const ctx = seeded();
    ctx.stances.push({ id: "o1", itemId: "it-d1", personId: "dan", value: "object", reason: "Breaks ADR-022", round: 1, createdAt: NOW });
    const r = result(built(ctx), "no_unresolved_conflicts");
    expect(r.passed).toBe(false);
    expect(r.blockers[0]).toMatchObject({ personId: "dan", fixTarget: { type: "item", id: "it-d1" } });

    ctx.stances.push({ id: "o2", itemId: "it-d1", personId: "dan", value: "concern", reason: "Fine with a new event", round: 1, createdAt: new Date(NOW.getTime() + 1000) });
    expect(result(built(ctx), "no_unresolved_conflicts").passed).toBe(true);
  });

  it("stances_complete only counts stances from the current round", () => {
    const ctx = makeBill150Pass(seeded());
    expect(result(built(ctx), "stances_complete").passed).toBe(true);
    ctx.items.find((i) => i.id === "it-d1")!.stanceRound = 2;
    const r = result(built(ctx), "stances_complete");
    expect(r.passed).toBe(false);
    expect(r.blockers.map((b) => b.personId)).toEqual(["priya", "sam", "marcus", "dan"]);
  });

  it("latestStances keeps the newest stance per person", () => {
    const ctx = seeded();
    ctx.stances.push({ id: "late", itemId: "it-d1", personId: "sam", value: "concern", reason: null, round: 1, createdAt: NOW });
    const latest = latestStances(ctx.stances.filter((s) => s.itemId === "it-d1"));
    expect(latest.get("sam")!.value).toBe("concern");
  });

  it("claims_sourced fails for an unsourced block in a required section, and passes when it's an owned assumption", () => {
    const ctx = seeded();
    ctx.blocks.push({ id: "bx", parentType: "story", parentId: "bill-150", section: "What we think", order: 9, text: "Most customers upgrade, not downgrade.", authorId: "marcus", createdAt: NOW, updatedAt: NOW });
    const r = result(built(ctx), "claims_sourced");
    expect(r.passed).toBe(false);
    expect(r.fixTarget).toEqual({ type: "block", id: "bx" });

    ctx.items.push({ id: "ax", parentType: "story", parentId: "bill-150", blockId: "bx", type: "assumption", text: "Most customers upgrade", status: "open", ownerId: "marcus", blocking: false, requiredStanceIds: [], stanceRound: 1 });
    expect(result(built(ctx), "claims_sourced").passed).toBe(true);

    ctx.items.find((i) => i.id === "ax")!.parentId = "bill-151";
    expect(result(built(ctx), "claims_sourced").passed).toBe(false);
  });

  it("claims_sourced ignores sections that aren't required (Edge cases)", () => {
    const ctx = seeded();
    // b7 in Edge cases has no citation, and BILL-150 still passes.
    expect(ctx.citations.some((c) => c.fromId === "b7")).toBe(false);
    expect(result(built(ctx), "claims_sourced").passed).toBe(true);
  });

  it("criteria_traced needs a criterion, citations on each, and confirmation for hat criteria", () => {
    const ctx = seeded();
    expect(result(built(ctx, "BILL-151"), "criteria_traced").passed).toBe(false);

    ctx.criteria.push({ id: "acx", storyId: "bill-150", given: "g", when: "w", then: "t", origin: "hat", hat: "qa", confirmedBy: null });
    ctx.citations.push({ id: "c-acx", fromType: "criterion", fromId: "acx", toType: "block", toId: "b6" });
    let r = result(built(ctx), "criteria_traced");
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("confirmed");
    ctx.criteria.find((c) => c.id === "acx")!.confirmedBy = "priya";
    expect(result(built(ctx), "criteria_traced").passed).toBe(true);

    ctx.citations = ctx.citations.filter((c) => c.fromId !== "acx");
    r = result(built(ctx), "criteria_traced");
    expect(r.passed).toBe(false);
    expect(r.fixTarget).toEqual({ type: "criterion", id: "acx" });
  });
});

describe("Right thing floor checks", () => {
  it("serves_promise fails without a promise, or with one that doesn't exist", () => {
    const ctx = seeded();
    expect(result(right(ctx, "BILL-163"), "serves_promise").passed).toBe(false);
    story(ctx, "BILL-150").promiseId = "pr-gone";
    expect(result(right(ctx), "serves_promise").passed).toBe(false);
  });

  it("serves_promise only accepts a promise from the story's own epic", () => {
    const ctx = seeded();
    ctx.epics.push({ ...ctx.epics[0], id: "e2", key: "OPS-1", memberIds: [] });
    ctx.prfaqs.push({ ...ctx.prfaqs[0], id: "prfaq-e2", epicId: "e2" });
    ctx.promises.push({ id: "pr-other", prfaqId: "prfaq-e2", text: "Something else" });
    story(ctx, "BILL-150").promiseId = "pr-other";
    expect(result(right(ctx), "serves_promise").passed).toBe(false);
  });

  it("evidence_backed needs a citation to an excerpt, not just to another block", () => {
    const ctx = seeded();
    ctx.citations = ctx.citations.filter((c) => !(c.toType === "excerpt" && ["b1", "b2", "b3", "b4", "b8"].includes(c.fromId)));
    expect(result(right(ctx), "evidence_backed").passed).toBe(false);
  });

  it("success_measure_linked and team_aligned come from the epic's PRFAQ", () => {
    const ctx = seeded();
    ctx.prfaqs[0].successMeasure = "  ";
    ctx.prfaqs[0].state = "agreed";
    expect(result(right(ctx), "success_measure_linked").passed).toBe(false);
    expect(result(right(ctx), "team_aligned").passed).toBe(true);
  });

  it("an epic without a PRFAQ fails both inherited checks", () => {
    const ctx = seeded();
    ctx.prfaqs = [];
    const r = right(ctx);
    expect(result(r, "success_measure_linked").passed).toBe(false);
    expect(result(r, "team_aligned").fixTarget).toEqual({ type: "epic", id: "bill-142" });
  });
});

describe("team checks from the Story template", () => {
  it("within_promise_scope fails on an open Product-hat note", () => {
    const ctx = seeded();
    ctx.hatNotes.push({ id: "pm1", hat: "pm", targetType: "story", targetId: "bill-150", kind: "gap", text: "Is proration explanation in the PRFAQ?", refs: [], status: "open" });
    expect(result(right(ctx), "within_promise_scope").passed).toBe(false);
  });

  it("arch_questions_answered passes once the Architect's challenge is answered", () => {
    const ctx = seeded();
    ctx.hatNotes.find((h) => h.id === "hn3")!.status = "accepted";
    expect(result(built(ctx), "arch_questions_answered").passed).toBe(true);
  });

  it("estimated and mock_if_ui_change", () => {
    const ctx = seeded();
    expect(result(built(ctx, "BILL-151"), "estimated").passed).toBe(false);
    expect(result(built(ctx, "BILL-160"), "mock_if_ui_change").passed).toBe(false);
    story(ctx, "BILL-160").mockUri = "figma://usage-view";
    expect(result(built(ctx, "BILL-160"), "mock_if_ui_change").passed).toBe(true);
  });

  it("a template without team checks still gets every floor check", () => {
    const ctx = seeded();
    story(ctx, "BILL-150").templateId = "tpl-big";
    expect(built(ctx).map((r) => r.key)).toEqual(FLOOR_CHECK_KEYS.built_right);
    expect(right(ctx).map((r) => r.key)).toEqual(FLOOR_CHECK_KEYS.right_thing);
  });

  it("every check key in a seeded template is defined, and floor keys are tier floor", () => {
    const ctx = seeded();
    for (const t of ctx.templates) for (const k of t.teamCheckKeys) expect(CHECK_DEFINITIONS[k]?.tier).toBe("team");
    for (const k of [...FLOOR_CHECK_KEYS.built_right, ...FLOOR_CHECK_KEYS.right_thing]) expect(CHECK_DEFINITIONS[k].tier).toBe("floor");
  });
});

describe("PRFAQ agreement", () => {
  it("passes once Dan realigns, Security reads back, and faq-4 is answered", () => {
    const ctx = seeded();
    ctx.readBacks.find((r) => r.personId === "dan")!.assessment = "matches";
    ctx.readBacks.push({ id: "rb-sec", epicId: "bill-142", personId: "security", text: "Usage billing with no new personal data.", assessment: "matches", note: null, createdAt: NOW });
    ctx.faqEntries.find((f) => f.id === "faq-4")!.answer = "They keep the capped fee for 18 months.";
    expect(evaluatePrfaqAgreement(ctx.epics[0], ctx).every((r) => r.passed)).toBe(true);
  });

  it("too_close and pending read-backs don't count as matching", () => {
    const ctx = seeded();
    ctx.readBacks.find((r) => r.personId === "dan")!.assessment = "too_close";
    ctx.readBacks.find((r) => r.personId === "sam")!.assessment = "pending";
    const r = evaluatePrfaqAgreement(ctx.epics[0], ctx).find((x) => x.key === "readbacks_match")!;
    expect(r.blockers.map((b) => b.personId)).toEqual(["sam", "dan"]);
  });

  it("a promise no story serves blocks agreement", () => {
    const ctx = seeded();
    story(ctx, "BILL-160").promiseId = null;
    const r = evaluatePrfaqAgreement(ctx.epics[0], ctx).find((x) => x.key === "promises_served")!;
    expect(r.passed).toBe(false);
    expect(r.fixTarget).toEqual({ type: "promise", id: "pr-see-usage" });
  });
});
