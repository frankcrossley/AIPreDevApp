// The Scrum Master is deterministic code (ADR-006).
// 08-session "The agenda is built for you", as a unit test, and the "what blocks Ready" summary.
import { describe, expect, it } from "vitest";
import { buildAgenda, whatBlocksReady } from "@/domain/scrum-master";
import { NOW, makeBill150Pass, seeded, story } from "../fixtures";

describe("the agenda is built for you", () => {
  it("the seeded session is on Thu 3 Oct", () => {
    const d = seeded().sessions[0].date;
    expect(d.toISOString().slice(0, 10)).toBe("2024-10-03");
    expect(d.getUTCDay()).toBe(4);
  });

  it("lists expiring drafts, divergent read-backs, near-Ready items, blocking questions, then new items; Ready items are left off", () => {
    const ctx = seeded();
    const agenda = buildAgenda("sess-1", ctx, NOW);

    expect(agenda.entries.map((e) => [e.kind, e.subjectId])).toEqual([
      ["expiring_drafts", "sess-1"],
      ["divergent_readbacks", "bill-142"],
      ["near_ready", "bill-150"],
      ["blocking_questions", "bill-151"],
      ["new_item", "bill-163"],
    ]);
    expect(agenda.leftOff.map((s) => s.key)).toEqual(["BILL-152"]);
  });

  it("orders expiring drafts by expiry and leaves out archived and triaged ones", () => {
    const agenda = buildAgenda("sess-1", seeded(), NOW);
    const drafts = agenda.entries[0];
    expect(drafts.draftIds).toEqual(["dr4", "dr2", "dr5", "dr1", "dr3"]);
  });

  it("names who diverged, and what each near-Ready or blocked item is waiting on", () => {
    const agenda = buildAgenda("sess-1", seeded(), NOW);
    const [, readbacks, near, blocking] = agenda.entries;
    expect(readbacks.personIds).toEqual(["dan"]);
    expect(near.checkKeys).toEqual(["team_aligned", "no_blocking_questions", "stances_complete", "arch_questions_answered"]);
    expect(blocking.itemIds).toEqual(["it-q151"]);
  });

  it("leaves off items that are Ready", () => {
    const ctx = makeBill150Pass(seeded());
    Object.assign(story(ctx, "BILL-150"), { state: "ready", signedOffBy: "priya", signedOffAt: NOW });
    const agenda = buildAgenda("sess-1", ctx, NOW);
    expect(agenda.entries.map((e) => e.subjectId)).not.toContain("bill-150");
    expect(agenda.leftOff.map((s) => s.key)).toEqual(["BILL-150", "BILL-152"]);
  });

  it("an item whose only gaps are desk work isn't put to the room", () => {
    const ctx = seeded();
    ctx.items.find((i) => i.id === "it-q151")!.status = "resolved";
    const agenda = buildAgenda("sess-1", ctx, NOW);
    expect(agenda.entries.map((e) => e.subjectId)).not.toContain("bill-151");
  });

  it("skips groups with nothing in them", () => {
    const ctx = seeded();
    ctx.drafts = [];
    ctx.readBacks = [];
    expect(buildAgenda("sess-1", ctx, NOW).entries[0].kind).toBe("near_ready");
  });

  it("is deterministic", () => {
    expect(buildAgenda("sess-1", seeded(), NOW)).toEqual(buildAgenda("sess-1", seeded(), NOW));
  });

  it("refuses an unknown or ended session", () => {
    expect(() => buildAgenda("nope", seeded(), NOW)).toThrow();
    const ctx = seeded();
    ctx.sessions[0].status = "ended";
    expect(() => buildAgenda("sess-1", ctx, NOW)).toThrow(/ended/);
  });
});

describe("what blocks Ready", () => {
  it("BILL-150: the PRFAQ, the downgrade question, Dan's stance and the Architect's challenge, each with an owner", () => {
    const ctx = seeded();
    const blockers = whatBlocksReady(story(ctx, "BILL-150"), ctx);
    expect(blockers.map((b) => [b.checkKey, b.ownerId, b.fixTarget])).toEqual([
      ["team_aligned", "priya", { type: "prfaq", id: "prfaq-142" }],
      ["no_blocking_questions", "priya", { type: "item", id: "it-q1" }],
      ["stances_complete", "dan", { type: "item", id: "it-d1" }],
      ["arch_questions_answered", "dan", { type: "hatNote", id: "hn3" }],
    ]);
    for (const b of blockers) expect(b.reason.length).toBeGreaterThan(0);
  });

  it("once every check passes, only the lead's sign-off is left", () => {
    const ctx = makeBill150Pass(seeded());
    expect(whatBlocksReady(story(ctx, "BILL-150"), ctx)).toEqual([
      { checkKey: "lead_sign_off", ownerId: "priya", reason: "Waiting on Priya to sign off as Ready", fixTarget: { type: "story", id: "bill-150" } },
    ]);
  });

  it("nothing blocks a Ready story", () => {
    const ctx = seeded();
    expect(whatBlocksReady(story(ctx, "BILL-152"), ctx)).toEqual([]);
  });

  it("desk-work checks go to the right owners", () => {
    const ctx = seeded();
    const owners = Object.fromEntries(whatBlocksReady(story(ctx, "BILL-160"), ctx).map((b) => [b.checkKey, b.ownerId]));
    expect(owners.mock_if_ui_change).toBe("mei");
    expect(owners.estimated).toBe("mei");
    expect(owners.criteria_traced).toBe("mei");
  });
});

describe("the Scrum Master summary", () => {
  it("counts decisions and answers from the checks, and the drafts expiring before the session", async () => {
    const { readySummary } = await import("@/domain/scrum-master");
    const ctx = seeded();
    expect(readySummary(story(ctx, "BILL-150"), ctx, NOW)).toBe(
      "Two decisions and one answer stand between this and Ready. The epic's PRFAQ isn't agreed yet. Three drafts here expire before Thu 3 Oct.",
    );
  });

  it("names the lead once only sign-off is left, and says Ready when it is", async () => {
    const { readySummary } = await import("@/domain/scrum-master");
    const ctx = makeBill150Pass(seeded());
    ctx.drafts = [];
    expect(readySummary(story(ctx, "BILL-150"), ctx, NOW)).toBe("Every check passes. Waiting on Priya to sign off as Ready.");
    expect(readySummary(story(ctx, "BILL-152"), ctx, NOW)).toBe("Ready. Nothing stands between this and Jira.");
  });

  it("counts desk work as other checks", async () => {
    const { readySummary } = await import("@/domain/scrum-master");
    const ctx = seeded();
    ctx.drafts = [];
    expect(readySummary(story(ctx, "BILL-160"), ctx, NOW)).toBe("Four other checks stand between this and Ready. The epic's PRFAQ isn't agreed yet.");
  });
});
