// 03-right-panel: "The panel is ranked", and the "For this item" count from 01-workspace.
import { describe, expect, it } from "vitest";
import { forThisItem } from "@/domain/panel";
import { NOW, seeded, story } from "../fixtures";

const ids = (p: ReturnType<typeof forThisItem>) => p.sections.map((s) => [s.key, s.cards.map((c) => c.id)]);

describe("For this item", () => {
  it("ranks BILL-150: summary, decisions needed, talking points, from discovery", () => {
    const ctx = seeded();
    const p = forThisItem(story(ctx, "BILL-150"), ctx, NOW, "priya");
    expect(p.summary).toBe(
      "Two decisions and one answer stand between this and Ready. The epic's PRFAQ isn't agreed yet. Three drafts here expire before Thu 3 Oct.",
    );
    expect(ids(p)).toEqual([
      ["decisions", ["it-d1", "it-q1", "hn3"]],
      ["talking", ["hn2", "hn4", "dr2", "dr1"]],
      ["discovery", ["ex-survey-overcharged", "dr3"]],
    ]);
    expect(p.count).toBe(9);
  });

  it("hides sections with nothing in them", () => {
    const ctx = seeded();
    ctx.drafts = [];
    ctx.citations = ctx.citations.filter((c) => c.toId !== "ex-survey-overcharged");
    const p = forThisItem(story(ctx, "BILL-150"), ctx, NOW, "priya");
    expect(p.sections.map((s) => s.key)).toEqual(["decisions", "talking"]);
  });

  it("drafts are dashed and say when they expire", () => {
    const ctx = seeded();
    const card = forThisItem(story(ctx, "BILL-150"), ctx, NOW, "priya").sections[1].cards.find((c) => c.id === "dr2")!;
    expect(card).toMatchObject({ tone: "dashed", title: "Should the invoice explain the proration?", detail: "Mei · draft · expires in 2 days" });
  });

  it("only the lead can triage: Sam sees the reason", () => {
    const ctx = seeded();
    const card = forThisItem(story(ctx, "BILL-150"), ctx, NOW, "sam").sections[1].cards.find((c) => c.id === "dr1")!;
    expect(card.actions.map((a) => [a.kind, a.disabledReason])).toEqual([
      ["accept", "Priya is the lead"],
      ["merge", "Priya is the lead"],
      ["reject", "Priya is the lead"],
    ]);
    const asPriya = forThisItem(story(ctx, "BILL-150"), ctx, NOW, "priya").sections[1].cards.find((c) => c.id === "dr1")!;
    expect(asPriya.actions.every((a) => a.disabledReason === null)).toBe(true);
  });

  it("the Product hat suggests a better home for the department-budget quote", () => {
    const ctx = seeded();
    const card = forThisItem(story(ctx, "BILL-150"), ctx, NOW, "priya").sections[2].cards.find((c) => c.id === "dr3")!;
    expect(card.title).toBe('"We budget by department."');
    expect(card.detail).toBe("Discovery call · Acme Corp, 14:32 · draft · expires in 5 days");
    expect(card.hint).toEqual({
      tag: "PM",
      text: "Fits BILL-160 better.",
      action: { kind: "move", label: "Move it there", disabledReason: null, targetId: "bill-160" },
    });
  });

  it("offers to put decisions to the next session, once", () => {
    const ctx = seeded();
    let card = forThisItem(story(ctx, "BILL-150"), ctx, NOW, "priya").sections[0].cards[0];
    expect(card.actions.find((a) => a.kind === "put_to_session")).toEqual({ kind: "put_to_session", label: "Put to Thu 3 Oct", disabledReason: null, targetId: "sess-1" });
    ctx.sessions[0].agenda.push("it-d1");
    card = forThisItem(story(ctx, "BILL-150"), ctx, NOW, "priya").sections[0].cards[0];
    expect(card.actions.find((a) => a.kind === "put_to_session")!.disabledReason).toBe("On the Thu 3 Oct agenda");
  });

  it("leaves out expired, archived and settled things", () => {
    const ctx = seeded();
    ctx.items.find((i) => i.id === "it-q1")!.status = "archived";
    ctx.stances.push({ id: "d", itemId: "it-d1", personId: "dan", value: "agree", reason: null, round: 1, createdAt: NOW });
    ctx.hatNotes.forEach((h) => (h.status = "accepted"));
    const p = forThisItem(story(ctx, "BILL-150"), ctx, new Date(NOW.getTime() + 6 * 86_400_000), "priya");
    expect(p.sections.map((s) => s.key)).toEqual(["discovery"]);
    expect(p.count).toBe(1);
  });
});

describe("For this epic", () => {
  it("lists the epic's drafts; accept waits for the PRFAQ editor", async () => {
    const { forThisEpic } = await import("@/domain/panel");
    const ctx = seeded();
    const cards = forThisEpic(ctx.epics[0], ctx, NOW, "priya");
    expect(cards.map((c) => [c.id, c.title])).toEqual([["dr5", '"Enterprise customers want invoices grouped by project (6 of 40)."']]);
    expect(cards[0].actions.map((a) => [a.kind, a.disabledReason])).toEqual([
      ["accept", "Epic notes are accepted into the PRFAQ, which arrives in a later build"],
      ["reject", null],
    ]);
  });
});
