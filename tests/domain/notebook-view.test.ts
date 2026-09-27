// What the notebook displays for BILL-150, matching V6Story.
import { describe, expect, it } from "vitest";
import { notebookView } from "@/domain/notebook-view";
import { NOW, seeded, story } from "../fixtures";

describe("notebook view", () => {
  const ctx = seeded();
  const s = story(ctx, "BILL-150");
  const view = notebookView(s, ctx, ["What we heard", "What we think", "Edge cases"]);

  it("lists lines per section in order, with their chips", () => {
    expect(view.sections.map((x) => [x.name, x.required, x.lines.map((l) => l.blockId)])).toEqual([
      ["What we heard", true, ["b1", "b2", "b3"]],
      ["What we think", true, ["b4", "b5", "b8"]],
      ["Edge cases", false, ["b6", "b7"]],
    ]);
    expect(view.sections[1].lines[0]).toMatchObject({ itemId: "it-d1", itemType: "decision", itemText: null });
  });

  it("labels sources like the wireframe", () => {
    expect(view.sources.b1).toEqual({ labels: ["Call, 12:40"], sourced: true });
    expect(view.sources.b2.labels).toEqual(["Survey"]);
    expect(view.sources.b3.labels).toEqual(["Doc, line 1"]);
    expect(view.sources.b7.sourced).toBe(false);
  });

  it("shows decision and question status, settled only when everyone asked agreed", () => {
    expect(view.chips["it-d1"]).toEqual({ type: "decision", blocking: false, status: "Agreed 3 of 4", settled: false });
    expect(view.chips["it-q1"]).toEqual({ type: "question", blocking: true, status: "Needs a decision", settled: false });
  });

  it("keeps an item's own text when it came from part of the line", () => {
    const v = notebookView(story(ctx, "BILL-151"), ctx, ["Edge cases"]);
    expect(v.sections[0].lines[0].itemText).toBe("How long does the fee cap last?");
  });
});

describe("notebook view in suggest mode", () => {
  const withSuggestion = () => {
    const c = seeded();
    c.drafts.push({
      id: "sg1", targetType: "story", targetId: "bill-150", text: "Annual plans renew mid-cycle too.", authorId: "marcus",
      excerptId: null, sourceId: null, createdAt: NOW, expiresAt: c.sessions[0].date, status: "pending", triagedBy: null,
      triagedAt: null, resultBlockId: null, kind: "suggestion", section: "Edge cases", op: "add", blockId: "blk-m1",
      afterBlockId: "b7", itemType: null, hatNoteId: null,
    });
    return c;
  };

  it("the author sees their suggestion in place, dashed, and edits in suggesting mode", () => {
    const c = withSuggestion();
    const v = notebookView(story(c, "BILL-150"), c, ["Edge cases"], "marcus", NOW);
    expect(v.mode).toBe("suggesting");
    expect(v.sections[0].lines.map((l) => l.blockId)).toEqual(["b6", "b7", "blk-m1"]);
    expect(v.ownSuggested).toEqual({ "blk-m1": "Your suggestion · expires in 5 days" });
    expect(v.suggestionsUnder).toEqual({});
  });

  it("the lead sees it under the line it follows, with triage allowed", () => {
    const c = withSuggestion();
    const v = notebookView(story(c, "BILL-150"), c, ["Edge cases"], "priya", NOW);
    expect(v.mode).toBe("direct");
    expect(v.sections[0].lines.map((l) => l.blockId)).toEqual(["b6", "b7"]);
    expect(v.suggestionsUnder.b7).toEqual([
      { id: "sg1", author: "Marcus", description: "Add: Annual plans renew mid-cycle too.", expiry: "expires in 5 days", triageReason: null },
    ]);
  });

  it("someone else sees it too, but can't triage", () => {
    const c = withSuggestion();
    const v = notebookView(story(c, "BILL-150"), c, ["Edge cases"], "sam", NOW);
    expect(v.suggestionsUnder.b7[0].triageReason).toBe("Priya is the lead");
  });
});
