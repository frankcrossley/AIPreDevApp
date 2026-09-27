// 03-right-panel "Only the lead can triage", accept/merge/reject/move, and "Expired drafts are archived".
import { describe, expect, it } from "vitest";
import { applyOps } from "@/domain/notebook";
import { acceptNote, canPutToSession, canTriage, canTriageNow, canWithdraw, mergeNote, mergeTargets, moveDraft, rejectDraft } from "@/domain/triage";
import { expiryLabel } from "@/domain/drafts";
import type { DomainSnapshot } from "@/domain/types";
import { NOW, seeded } from "../fixtures";

let n = 0;
const newId = () => `t-${++n}`;
const draft = (ctx: DomainSnapshot, id: string) => ctx.drafts.find((d) => d.id === id)!;

describe("who can triage", () => {
  it("only the target's lead", () => {
    const ctx = seeded();
    expect(canTriage("sam", draft(ctx, "dr1"), ctx)).toEqual({ ok: false, reason: "Priya is the lead" });
    expect(canTriage("priya", draft(ctx, "dr1"), ctx)).toEqual({ ok: true });
    expect(canTriage("priya", draft(ctx, "dr4"), ctx)).toEqual({ ok: false, reason: "Mei is the lead" });
    expect(canTriage("priya", draft(ctx, "dr5"), ctx)).toEqual({ ok: true }); // epic owner
    expect(canTriage("priya", draft(ctx, "draft-sam-lines"), ctx)).toEqual({ ok: false, reason: "Already accepted" });
  });
});

describe("accept", () => {
  it("Marcus's draft becomes an unagreed line under What we think, credited to him, and nothing agreed changes", () => {
    const ctx = seeded();
    const r = acceptNote(draft(ctx, "dr1"), ctx, { actorId: "priya", now: NOW, newId });
    expect(r.draft).toMatchObject({ status: "accepted", triagedBy: "priya", triagedAt: NOW });
    expect(r.plan.ops).toEqual([
      expect.objectContaining({ op: "createBlock", block: expect.objectContaining({ section: "What we think", order: 4, authorId: "marcus", text: "Downgrades should apply at the next cycle, not immediately. Customers game it otherwise." }) }),
    ]);
    expect(r.plan.needsConfirmation).toBe(false);
    const after = applyOps(ctx, r.plan.ops, NOW);
    for (const b of ctx.blocks) expect(after.blocks.find((x) => x.id === b.id)).toEqual(b);
  });

  it("a quote lands under What we heard and keeps its source", () => {
    const ctx = seeded();
    const r = acceptNote(draft(ctx, "dr3"), ctx, { actorId: "priya", now: NOW, newId });
    expect(r.plan.ops[0]).toMatchObject({ op: "createBlock", block: { section: "What we heard", order: 4, authorId: "priya" } });
    expect(r.citations).toEqual([{ id: `cit-block-${r.draft.resultBlockId}-ex-acme-1432`, fromType: "block", fromId: r.draft.resultBlockId, toType: "excerpt", toId: "ex-acme-1432" }]);
  });

  it("a draft typed with a prefix becomes a chip", () => {
    const ctx = seeded();
    draft(ctx, "dr2").text = "? Should the invoice explain the proration?";
    const r = acceptNote(draft(ctx, "dr2"), ctx, { actorId: "priya", now: NOW, newId });
    expect(r.plan.ops.map((o) => o.op)).toEqual(["createBlock", "createItem"]);
  });

  it("accepting onto a Ready story reopens it, with the warning first", () => {
    const ctx = seeded();
    Object.assign(ctx.stories.find((s) => s.id === "bill-150")!, { state: "ready", signedOffBy: "priya" });
    const r = acceptNote(draft(ctx, "dr1"), ctx, { actorId: "priya", now: NOW, newId });
    expect(r.plan).toMatchObject({ needsConfirmation: true, warning: "Priya, Sam and Marcus agreed this. Accepting reopens it for all three." });
  });

  it("epic drafts wait for the PRFAQ editor", () => {
    const ctx = seeded();
    expect(() => acceptNote(draft(ctx, "dr5"), ctx, { actorId: "priya", now: NOW, newId })).toThrow(/PRFAQ/);
  });
});

describe("merge", () => {
  it("offers agreed lines but disables them", () => {
    const ctx = seeded();
    const targets = mergeTargets(draft(ctx, "dr2"), ctx);
    expect(targets.find((t) => t.blockId === "b4")!.disabledReason).toMatch(/^Agreed/);
    expect(targets.find((t) => t.blockId === "b7")!.disabledReason).toBeNull();
  });

  it("appends the draft to an unagreed line", () => {
    const ctx = seeded();
    const r = mergeNote(draft(ctx, "dr2"), "b5", ctx, { actorId: "priya", now: NOW, newId });
    expect(r.draft.status).toBe("merged");
    expect(r.plan.ops).toEqual([{ op: "updateBlock", id: "b5", text: "Immediately means both the plan and the invoice line. Should the invoice explain the proration?" }]);
    expect(r.plan.needsConfirmation).toBe(false);
  });

  it("refuses an agreed line", () => {
    const ctx = seeded();
    expect(() => mergeNote(draft(ctx, "dr2"), "b4", ctx, { actorId: "priya", now: NOW, newId })).toThrow(/Agreed/);
  });
});

describe("reject and move", () => {
  it("reject records who and when", () => {
    const ctx = seeded();
    expect(rejectDraft(draft(ctx, "dr1"), "priya", NOW)).toMatchObject({ status: "rejected", triagedBy: "priya", triagedAt: NOW });
  });

  it("move retargets and works the expiry out again", () => {
    const ctx = seeded();
    const moved = moveDraft(draft(ctx, "dr3"), "bill-160", ctx);
    expect(moved).toMatchObject({ targetType: "story", targetId: "bill-160" });
    expect(expiryLabel(moved, NOW)).toBe("expires in 5 days");
    expect(() => moveDraft(draft(ctx, "dr3"), "nowhere", ctx)).toThrow();
  });
});

describe("expiry labels", () => {
  it.each([
    [2, "expires in 2 days"],
    [1, "expires tomorrow"],
    [0.1, "expires today"],
    [-1, "expired"],
  ])("%s days → %s", (days, label) => {
    expect(expiryLabel({ status: "pending", expiresAt: new Date(NOW.getTime() + days * 86_400_000) }, NOW)).toBe(label);
  });
});

describe("merge on an agreed story", () => {
  it("reopens it behind the warning, even when nobody is named", () => {
    const ctx = seeded();
    ctx.stances = [];
    ctx.stories.find((s) => s.id === "bill-150")!.state = "agreed";
    const r = mergeNote(draft(ctx, "dr2"), "b7", ctx, { actorId: "priya", now: NOW, newId });
    expect(r.plan).toMatchObject({ needsConfirmation: true, warning: "BILL-150 is Agreed. Accepting reopens it." });
  });

  it("a suggestion can't be merged", () => {
    const ctx = seeded();
    const sg = { ...draft(ctx, "dr2"), kind: "suggestion" as const };
    expect(() => mergeNote(sg, "b7", ctx, { actorId: "priya", now: NOW, newId })).toThrow(/merged/);
  });
});

describe("permissions", () => {
  it("an overdue draft can't be triaged until restored", () => {
    const ctx = seeded();
    const later = new Date(NOW.getTime() + 3 * 86_400_000);
    expect(canTriageNow("priya", draft(ctx, "dr2"), ctx, later)).toEqual({ ok: false, reason: "This draft has expired. Restore it first." });
    expect(canTriageNow("priya", draft(ctx, "dr2"), ctx, NOW)).toEqual({ ok: true });
  });

  it("only the author withdraws a pending suggestion", () => {
    const ctx = seeded();
    const sg = { ...draft(ctx, "dr1"), kind: "suggestion" as const };
    expect(canWithdraw("marcus", sg)).toEqual({ ok: true });
    expect(canWithdraw("priya", sg)).toMatchObject({ ok: false });
    expect(canWithdraw("marcus", draft(ctx, "dr1"))).toMatchObject({ ok: false });
  });

  it("only things on this story go to the session", () => {
    const ctx = seeded();
    expect(canPutToSession(ctx.sessions[0], "it-q1", "bill-150", ctx)).toEqual({ ok: true });
    expect(canPutToSession(ctx.sessions[0], "hn3", "bill-150", ctx)).toEqual({ ok: true });
    expect(canPutToSession(ctx.sessions[0], "it-q151", "bill-150", ctx)).toEqual({ ok: false, reason: "That isn't on this story" });
    expect(canPutToSession({ ...ctx.sessions[0], status: "ended" }, "it-q1", "bill-150", ctx)).toMatchObject({ ok: false });
  });

  it("expiry counts calendar days", () => {
    const at = (iso: string) => ({ status: "pending" as const, expiresAt: new Date(iso) });
    const evening = new Date("2024-09-28T22:00:00Z");
    expect(expiryLabel(at("2024-09-29T08:00:00Z"), evening)).toBe("expires tomorrow");
    expect(expiryLabel(at("2024-09-28T23:00:00Z"), evening)).toBe("expires today");
  });
});
