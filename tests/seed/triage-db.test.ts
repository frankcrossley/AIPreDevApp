// Triage, suggest mode and realignment against a real database.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveSection } from "@/server/notebook";
import {
  acceptDraftAction,
  answerHatNoteAction,
  dismissHatNoteAction,
  expireOverdueDrafts,
  moveDraftAction,
  putToSessionAction,
  rejectDraftAction,
  restoreDraftAction,
  withdrawSuggestionAction,
} from "@/server/triage";
import { seededDatabase } from "../db";
import { NOW } from "../fixtures";

let env: Awaited<ReturnType<typeof seededDatabase>>;
beforeEach(async () => {
  env = await seededDatabase();
});
afterEach(() => env.cleanup());

const edgeCases = [
  { blockId: "b6", itemId: "it-q1", itemType: "question", text: "What happens on a downgrade mid-cycle?" },
  { blockId: "b7", itemId: null, itemType: null, text: "A customer changes plan twice in one month. Probably fine, same rule applies." },
];

describe("only the lead can triage", () => {
  it("Sam is refused; Priya accepts Marcus's draft as an unagreed line", async () => {
    expect(await acceptDraftAction(env.db, { draftId: "dr1", actorId: "sam", confirmReopen: false, now: NOW })).toEqual({ status: "refused", reason: "Priya is the lead" });
    const before = await env.db.block.findMany({ where: { parentId: "bill-150" } });
    expect(await acceptDraftAction(env.db, { draftId: "dr1", actorId: "priya", confirmReopen: false, now: NOW })).toEqual({ status: "done" });
    const dr1 = await env.db.draft.findUniqueOrThrow({ where: { id: "dr1" } });
    expect(dr1).toMatchObject({ status: "accepted", triagedBy: "priya" });
    const block = await env.db.block.findUniqueOrThrow({ where: { id: dr1.resultBlockId! } });
    expect(block).toMatchObject({ section: "What we think", authorId: "marcus" });
    // No agreed content changed.
    for (const b of before) expect(await env.db.block.findUniqueOrThrow({ where: { id: b.id } })).toEqual(b);
  });

  it("reject, move and put to session", async () => {
    await rejectDraftAction(env.db, { draftId: "dr2", actorId: "priya", now: NOW });
    expect((await env.db.draft.findUniqueOrThrow({ where: { id: "dr2" } })).status).toBe("rejected");

    expect(await moveDraftAction(env.db, { draftId: "dr3", toId: "bill-160", actorId: "priya", now: NOW })).toEqual({ status: "done", message: "Moved to BILL-160." });
    expect((await env.db.draft.findUniqueOrThrow({ where: { id: "dr3" } })).targetId).toBe("bill-160");
    expect((await env.db.hatNote.findUniqueOrThrow({ where: { id: "hn5" } })).status).toBe("accepted");

    await putToSessionAction(env.db, { sessionId: "sess-1", subjectId: "it-q1", storyId: "bill-150", actorId: "sam", now: NOW });
    expect(JSON.parse((await env.db.session.findUniqueOrThrow({ where: { id: "sess-1" } })).agendaJson)).toEqual(["it-q1"]);
  });
});

describe("expired drafts", () => {
  it("are archived, not deleted, and can be restored by the lead", async () => {
    const later = new Date(NOW.getTime() + 3 * 86_400_000);
    expect(await expireOverdueDrafts(env.db, later)).toBe(3); // dr2, dr4 and dr5 pass their expiry
    expect((await env.db.draft.findUniqueOrThrow({ where: { id: "dr2" } })).status).toBe("expired");
    expect(await restoreDraftAction(env.db, { draftId: "dr2", actorId: "sam", now: later })).toEqual({ status: "refused", reason: "Priya is the lead" });
    expect(await restoreDraftAction(env.db, { draftId: "dr2", actorId: "priya", now: later })).toEqual({ status: "done" });
    expect((await env.db.draft.findUniqueOrThrow({ where: { id: "dr2" } })).status).toBe("pending");
  });
});

describe("suggest mode", () => {
  it("Marcus's new line is a suggestion; the notebook doesn't change until Priya accepts", async () => {
    const r = await saveSection(env.db, { storyId: "bill-150", section: "Edge cases", actorId: "marcus", confirmReopen: false, now: NOW, lines: [...edgeCases, { blockId: "blk-m1", itemId: null, itemType: null, text: "Annual plans renew mid-cycle too." }] });
    expect(r).toEqual({ status: "suggested", pending: 1 });
    expect(await env.db.block.findUnique({ where: { id: "blk-m1" } })).toBeNull();
    const sg = await env.db.draft.findFirstOrThrow({ where: { kind: "suggestion" } });

    expect(await acceptDraftAction(env.db, { draftId: sg.id, actorId: "priya", confirmReopen: false, now: NOW })).toEqual({ status: "done" });
    expect(await env.db.block.findUniqueOrThrow({ where: { id: "blk-m1" } })).toMatchObject({ authorId: "marcus", order: 3 });
  });

  it("Dan's edit to the agreed decision warns Priya, then reopens it for everyone who agreed", async () => {
    await saveSection(env.db, {
      storyId: "bill-150",
      section: "What we think",
      actorId: "dan",
      confirmReopen: false,
      now: NOW,
      lines: [
        { blockId: "b4", itemId: "it-d1", itemType: "decision", text: "Upgrades apply immediately, rounded to the day." },
        { blockId: "b5", itemId: null, itemType: null, text: "Immediately means both the plan and the invoice line." },
        { blockId: "b8", itemId: null, itemType: null, text: "Show both plans as separate lines on the invoice." },
      ],
    });
    expect((await env.db.block.findUniqueOrThrow({ where: { id: "b4" } })).text).toBe("Upgrades apply immediately, charged by the day.");
    const sg = await env.db.draft.findFirstOrThrow({ where: { kind: "suggestion", authorId: "dan" } });
    expect(await acceptDraftAction(env.db, { draftId: sg.id, actorId: "priya", confirmReopen: false, now: NOW })).toEqual({
      status: "needs_confirmation",
      warning: "Priya, Sam and Marcus agreed this. Accepting reopens it for all three.",
    });
    expect(await acceptDraftAction(env.db, { draftId: sg.id, actorId: "priya", confirmReopen: true, now: NOW })).toEqual({ status: "done" });
    expect((await env.db.block.findUniqueOrThrow({ where: { id: "b4" } })).text).toBe("Upgrades apply immediately, rounded to the day.");
    expect((await env.db.item.findUniqueOrThrow({ where: { id: "it-d1" } })).stanceRound).toBe(2);
  });

  it("an author can withdraw their own suggestion, nobody else can", async () => {
    await saveSection(env.db, { storyId: "bill-150", section: "Edge cases", actorId: "marcus", confirmReopen: false, now: NOW, lines: [...edgeCases, { blockId: "blk-m1", itemId: null, itemType: null, text: "x" }] });
    const sg = await env.db.draft.findFirstOrThrow({ where: { kind: "suggestion" } });
    expect(await withdrawSuggestionAction(env.db, { draftId: sg.id, actorId: "sam", now: NOW })).toMatchObject({ status: "refused" });
    expect(await withdrawSuggestionAction(env.db, { draftId: sg.id, actorId: "marcus", now: NOW })).toEqual({ status: "done" });
  });
});

describe("hat notes", () => {
  it("Priya's answer goes under the line and closes the note; Dan's is a suggestion that closes it on accept", async () => {
    await answerHatNoteAction(env.db, { noteId: "hn3", actorId: "dan", text: "New event: plan.changed, published by metering.", asQuestion: false, now: NOW });
    expect((await env.db.hatNote.findUniqueOrThrow({ where: { id: "hn3" } })).status).toBe("open");
    const sg = await env.db.draft.findFirstOrThrow({ where: { hatNoteId: "hn3" } });
    expect(sg).toMatchObject({ op: "add", afterBlockId: "b4", authorId: "dan" });
    // Accepting touches no agreed line, only adds one after it.
    expect(await acceptDraftAction(env.db, { draftId: sg.id, actorId: "priya", confirmReopen: false, now: NOW })).toEqual({ status: "done" });
    expect((await env.db.hatNote.findUniqueOrThrow({ where: { id: "hn3" } })).status).toBe("accepted");

    await answerHatNoteAction(env.db, { noteId: "hn4", actorId: "priya", text: "Downgrade then upgrade in the same cycle: which rule wins?", asQuestion: true, now: NOW });
    expect((await env.db.hatNote.findUniqueOrThrow({ where: { id: "hn4" } })).status).toBe("accepted");
    expect(await env.db.item.findFirst({ where: { text: "Downgrade then upgrade in the same cycle: which rule wins?", type: "question" } })).not.toBeNull();
  });

  it("only the lead dismisses", async () => {
    expect(await dismissHatNoteAction(env.db, { noteId: "hn2", actorId: "sam", now: NOW })).toMatchObject({ status: "refused" });
    expect(await dismissHatNoteAction(env.db, { noteId: "hn2", actorId: "priya", now: NOW })).toEqual({ status: "done" });
  });
});

describe("deleting a line others cite", () => {
  it("asks first, then removes the citations and adds realignment talking points", async () => {
    const think = [
      { blockId: "b5", itemId: null, itemType: null, text: "Immediately means both the plan and the invoice line." },
      { blockId: "b8", itemId: null, itemType: null, text: "Show both plans as separate lines on the invoice." },
    ];
    const held = await saveSection(env.db, { storyId: "bill-150", section: "What we think", actorId: "priya", confirmReopen: false, now: NOW, lines: think });
    expect(held.status).toBe("needs_confirmation");
    if (held.status === "needs_confirmation") {
      expect(held.warning).toContain("Priya, Sam and Marcus agreed this.");
      expect(held.warning).toContain('2 things cite "Upgrades apply immediately, charged by the day."');
    }
    await saveSection(env.db, { storyId: "bill-150", section: "What we think", actorId: "priya", confirmReopen: true, now: NOW, lines: think });
    expect(await env.db.block.findUnique({ where: { id: "b4" } })).toBeNull();
    expect(await env.db.citation.count({ where: { toId: "b4" } })).toBe(0);
    const realign = await env.db.item.findMany({ where: { type: "talking_point", parentId: "bill-150" } });
    expect(realign.map((i) => i.text).sort()).toEqual([
      'Realign: "Given a customer upgrades on day 15 of a 30-day cycle, then…" lost its source "Upgrades apply immediately, charged by the day."',
      'Realign: "Immediately means both the plan and the invoice line." lost its source "Upgrades apply immediately, charged by the day."',
    ]);
  });
});

describe("every path goes through the same protections", () => {
  it("accepting Dan's removal of a cited line asks first, then realigns its dependents", async () => {
    const think = [
      { blockId: "b5", itemId: null, itemType: null, text: "Immediately means both the plan and the invoice line." },
      { blockId: "b8", itemId: null, itemType: null, text: "Show both plans as separate lines on the invoice." },
    ];
    await saveSection(env.db, { storyId: "bill-150", section: "What we think", lines: think, actorId: "dan", confirmReopen: false, now: NOW });
    const sg = await env.db.draft.findFirstOrThrow({ where: { kind: "suggestion", op: "remove" } });
    const held = await acceptDraftAction(env.db, { draftId: sg.id, actorId: "priya", confirmReopen: false, now: NOW });
    expect(held.status).toBe("needs_confirmation");
    if (held.status === "needs_confirmation") expect(held.warning).toContain("2 things cite");
    await acceptDraftAction(env.db, { draftId: sg.id, actorId: "priya", confirmReopen: true, now: NOW });
    expect(await env.db.block.findUnique({ where: { id: "b4" } })).toBeNull();
    expect(await env.db.citation.count({ where: { toId: "b4" } })).toBe(0);
    expect(await env.db.item.count({ where: { type: "talking_point", text: { startsWith: "Realign:" } } })).toBe(2);
  });

  it("the lead's answer on a Ready story asks before reopening it", async () => {
    await env.db.story.update({ where: { id: "bill-150" }, data: { state: "ready", signedOffBy: "priya", signedOffAt: NOW } });
    const input = { noteId: "hn3", actorId: "priya", text: "New event from metering.", asQuestion: false, now: NOW };
    expect((await answerHatNoteAction(env.db, input)).status).toBe("needs_confirmation");
    expect((await env.db.story.findUniqueOrThrow({ where: { id: "bill-150" } })).state).toBe("ready");
    expect(await answerHatNoteAction(env.db, { ...input, confirmReopen: true })).toEqual({ status: "done" });
    expect((await env.db.story.findUniqueOrThrow({ where: { id: "bill-150" } })).state).toBe("in_refinement");
  });

  it("marking blocking is lead-only on the server, and asks first on a Ready story", async () => {
    const { setItemBlocking } = await import("@/server/notebook");
    expect(await setItemBlocking(env.db, "it-q1", false, "sam", true)).toEqual({ status: "refused", reason: "Priya is the lead" });
    await env.db.story.update({ where: { id: "bill-150" }, data: { state: "ready", signedOffBy: "priya", signedOffAt: NOW } });
    expect((await setItemBlocking(env.db, "it-q1", false, "priya", false)).status).toBe("needs_confirmation");
    expect((await env.db.item.findUniqueOrThrow({ where: { id: "it-q1" } })).blocking).toBe(true);
  });

  it("merging on an Agreed story asks, then reopens", async () => {
    await env.db.stance.deleteMany();
    await env.db.story.update({ where: { id: "bill-150" }, data: { state: "agreed" } });
    const { mergeDraftAction } = await import("@/server/triage");
    expect(await mergeDraftAction(env.db, { draftId: "dr2", intoBlockId: "b7", actorId: "priya", now: NOW })).toEqual({
      status: "needs_confirmation",
      warning: "BILL-150 is Agreed. Accepting reopens it.",
    });
    expect(await mergeDraftAction(env.db, { draftId: "dr2", intoBlockId: "b7", actorId: "priya", confirmReopen: true, now: NOW })).toEqual({ status: "done" });
    expect((await env.db.story.findUniqueOrThrow({ where: { id: "bill-150" } })).state).toBe("in_refinement");
  });

  it("failed moves and overdue drafts are refused, not thrown", async () => {
    expect(await moveDraftAction(env.db, { draftId: "dr3", toId: "nowhere", actorId: "priya", now: NOW })).toMatchObject({ status: "refused" });
    const later = new Date(NOW.getTime() + 3 * 86_400_000);
    expect(await acceptDraftAction(env.db, { draftId: "dr2", actorId: "priya", confirmReopen: false, now: later })).toEqual({
      status: "refused",
      reason: "This draft has expired. Restore it first.",
    });
    expect(await putToSessionAction(env.db, { sessionId: "sess-1", subjectId: "it-q151", storyId: "bill-150", actorId: "sam", now: NOW })).toMatchObject({ status: "refused" });
  });
});
