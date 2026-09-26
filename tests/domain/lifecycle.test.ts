// The story state machine (docs/domain.md "Story lifecycle") and 04-checks:
// "Ready needs both checks and the lead" and "There is no way to force Ready".
import { describe, expect, it } from "vitest";
import { canTransition, reopenOnEdit, signOff, transition } from "@/domain/lifecycle";
import { STORY_STATES, type DomainSnapshot, type StoryState } from "@/domain/types";
import { NOW, makeBill150Pass, seeded, story } from "../fixtures";

const bill150 = (ctx: DomainSnapshot) => story(ctx, "BILL-150");

describe("Ready needs both checks and the lead", () => {
  it("refuses sign-off while any check fails, and says which", () => {
    const ctx = seeded();
    const r = signOff(bill150(ctx), "priya", ctx, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons.join("\n")).toMatch(/team_aligned/);
      expect(r.reasons.join("\n")).toMatch(/stances_complete/);
    }
  });

  it("refuses sign-off from anyone but the lead, even with every check passing", () => {
    const ctx = makeBill150Pass(seeded());
    for (const person of ["sam", "marcus", "dan", "mei", "hop"]) {
      const r = signOff(bill150(ctx), person, ctx, NOW);
      expect(r.ok, person).toBe(false);
    }
  });

  it("lets Priya sign off once all checks pass, and the story becomes ready", () => {
    const ctx = makeBill150Pass(seeded());
    const r = signOff(bill150(ctx), "priya", ctx, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.story.state).toBe("ready");
      expect(r.story.signedOffBy).toBe("priya");
      expect(r.story.signedOffAt).toEqual(NOW);
    }
  });

  it("signing off from refinement passes through agreed: an objection blocks it even if hat checks pass", () => {
    const ctx = makeBill150Pass(seeded());
    ctx.stances.push({ id: "obj", itemId: "it-d1", personId: "sam", value: "object", reason: "Finance can't reconcile", round: 1, createdAt: new Date(NOW.getTime() + 1) });
    const r = signOff(bill150(ctx), "priya", ctx, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.some((x) => x.includes("Sam objects"))).toBe(true);
  });

  it("does not mutate the input story", () => {
    const ctx = makeBill150Pass(seeded());
    signOff(bill150(ctx), "priya", ctx, NOW);
    expect(bill150(ctx).state).toBe("in_refinement");
    expect(bill150(ctx).signedOffBy).toBeNull();
  });

  it("refuses sign-off from states other than in_refinement or agreed", () => {
    for (const state of ["draft", "triaged", "ready", "exported"] as StoryState[]) {
      const ctx = makeBill150Pass(seeded());
      bill150(ctx).state = state;
      expect(signOff(bill150(ctx), "priya", ctx, NOW).ok, state).toBe(false);
    }
  });
});

describe("there is no way to force Ready", () => {
  it("transition() to ready without sign-off is refused from every state, whatever the actor", () => {
    for (const from of STORY_STATES) {
      const ctx = makeBill150Pass(seeded());
      bill150(ctx).state = from;
      for (const actor of ["priya", "hop", "dan"]) {
        const r = transition(bill150(ctx), "ready", ctx, { actorId: actor, now: NOW });
        expect(r.ok, `${from} by ${actor}`).toBe(false);
      }
    }
  });

  it("a stored sign-off doesn't let a failing story through", () => {
    const ctx = seeded();
    Object.assign(bill150(ctx), { state: "agreed", signedOffBy: "priya", signedOffAt: NOW });
    expect(signOff(bill150(ctx), "priya", ctx, NOW).ok).toBe(false);
  });

  it("no transition anywhere returns a ready story except signOff", () => {
    for (const from of STORY_STATES) {
      for (const to of STORY_STATES) {
        const ctx = makeBill150Pass(seeded());
        bill150(ctx).state = from;
        const r = transition(bill150(ctx), to, ctx, { actorId: "priya", now: NOW, via: { kind: "async" }, exportSucceeded: true });
        if (r.ok) expect(r.story.state, `${from} → ${to}`).not.toBe("ready");
      }
    }
  });
});

describe("transition guards", () => {
  it("draft → triaged only by the lead", () => {
    const ctx = seeded();
    const s = story(ctx, "BILL-160");
    expect(transition(s, "triaged", ctx, { actorId: "priya", now: NOW }).ok).toBe(false);
    const r = transition(s, "triaged", ctx, { actorId: "mei", now: NOW });
    expect(r.ok && r.story.state).toBe("triaged");
  });

  it("triaged → in_refinement needs a template and a session agenda slot or async work", () => {
    const ctx = seeded();
    const s = story(ctx, "BILL-163");
    expect(transition(s, "in_refinement", ctx, { actorId: "priya", now: NOW }).ok).toBe(false);
    expect(transition(s, "in_refinement", ctx, { actorId: "priya", now: NOW, via: { kind: "async" } }).ok).toBe(true);
    expect(transition(s, "in_refinement", ctx, { actorId: "priya", now: NOW, via: { kind: "session", sessionId: "sess-1" } }).ok).toBe(false);
    ctx.sessions[0].agenda = ["bill-163"];
    expect(transition(s, "in_refinement", ctx, { actorId: "priya", now: NOW, via: { kind: "session", sessionId: "sess-1" } }).ok).toBe(true);
    s.templateId = "";
    expect(transition(s, "in_refinement", ctx, { actorId: "priya", now: NOW, via: { kind: "async" } }).ok).toBe(false);
  });

  it("in_refinement → agreed needs all stances, no unresolved object, no open blocking question", () => {
    const ctx = seeded();
    const r = canTransition(bill150(ctx), "agreed", ctx, { actorId: "priya", now: NOW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toHaveLength(2);

    makeBill150Pass(ctx);
    expect(canTransition(bill150(ctx), "agreed", ctx, { actorId: "priya", now: NOW }).ok).toBe(true);

    ctx.stances.push({ id: "obj", itemId: "it-d1", personId: "marcus", value: "object", reason: "Gaming risk", round: 1, createdAt: new Date(NOW.getTime() + 1) });
    expect(canTransition(bill150(ctx), "agreed", ctx, { actorId: "priya", now: NOW }).ok).toBe(false);
  });

  it("ready → exported only when the export succeeded", () => {
    const ctx = seeded();
    bill150(ctx).state = "ready";
    expect(transition(bill150(ctx), "exported", ctx, { actorId: "priya", now: NOW }).ok).toBe(false);
    expect(transition(bill150(ctx), "exported", ctx, { actorId: "priya", now: NOW, exportSucceeded: true }).ok).toBe(true);
  });

  it("skipping states is refused", () => {
    const ctx = seeded();
    expect(transition(story(ctx, "BILL-160"), "in_refinement", ctx, { actorId: "mei", now: NOW, via: { kind: "async" } }).ok).toBe(false);
    expect(transition(story(ctx, "BILL-163"), "agreed", ctx, { actorId: "priya", now: NOW }).ok).toBe(false);
  });
});

describe("editing agreed content reopens it", () => {
  it("moves a ready story back to in_refinement, clears the sign-off and asks everyone who agreed again", () => {
    const ctx = makeBill150Pass(seeded());
    const signed = signOff(bill150(ctx), "priya", ctx, NOW);
    if (!signed.ok) throw new Error("setup");
    Object.assign(bill150(ctx), signed.story);

    const r = reopenOnEdit(bill150(ctx), "b4", ctx);
    expect(r.story.state).toBe("in_refinement");
    expect(r.story.signedOffBy).toBeNull();
    expect(r.story.signedOffAt).toBeNull();
    expect(r.items.map((i) => [i.id, i.stanceRound])).toEqual([["it-d1", 2]]);
    expect(r.askStanceFrom).toEqual(["priya", "sam", "marcus", "dan"]);
  });

  it("after reopening, stances_complete fails until people restate, and sign-off is refused", () => {
    const ctx = makeBill150Pass(seeded());
    const r = reopenOnEdit(bill150(ctx), "it-d1", ctx);
    Object.assign(bill150(ctx), r.story);
    for (const i of r.items) Object.assign(ctx.items.find((x) => x.id === i.id)!, i);
    expect(signOff(bill150(ctx), "priya", ctx, NOW).ok).toBe(false);
  });

  it("works for exported stories (drift) and leaves in_refinement stories in place", () => {
    const ctx = seeded();
    const exported = story(ctx, "BILL-152");
    expect(reopenOnEdit(exported, "bill-152", ctx).story).toMatchObject({ state: "in_refinement", signedOffBy: null });
    expect(reopenOnEdit(bill150(ctx), "b7", ctx).story.state).toBe("in_refinement");
  });

  it("a Jira-side change to a criterion asks everyone who agreed on the story again", () => {
    const ctx = makeBill150Pass(seeded());
    bill150(ctx).state = "exported";
    const r = reopenOnEdit(bill150(ctx), "ac1", ctx);
    expect(r.story.state).toBe("in_refinement");
    expect(r.items.map((i) => i.id)).toEqual(["it-d1"]);
    expect(r.askStanceFrom).toEqual(["priya", "sam", "marcus", "dan"]);
  });

  it("editing content that nobody agreed doesn't bump any stance round", () => {
    const ctx = seeded();
    expect(reopenOnEdit(bill150(ctx), "b7", ctx).items).toEqual([]);
  });
});
