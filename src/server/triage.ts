// Card actions from the right panel: triage (accept, merge, reject, move, restore), withdrawing
// a suggestion, answering and dismissing hat notes, and putting things to the next session.
// Each one is a single transaction with an Event; the rules are in src/domain.
import { randomUUID } from "node:crypto";
import { draftExpiresAt, draftExpiryDays, expireDrafts, restoreDraft } from "@/domain/drafts";
import { diffSection, reopenImpact, sectionLines } from "@/domain/notebook";
import { acceptSuggestion, editsDirectly } from "@/domain/suggestions";
import { acceptNote, canTriage, mergeNote, moveDraft, rejectDraft } from "@/domain/triage";
import type { DomainSnapshot, Draft } from "@/domain/types";
import type { Db } from "./prisma";
import { reopenWrites } from "./lifecycle";
import { citationWrites, draftWrite, eventWrite, opWrites } from "./notebook";
import { loadSnapshot } from "./snapshot";

export type ActionResult = { status: "done"; message?: string } | { status: "needs_confirmation"; warning: string } | { status: "refused"; reason: string };

const shortId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

async function loadDraft(db: Db, draftId: string, actorId: string, allowExpired = false) {
  const ctx = await loadSnapshot(db);
  const draft = ctx.drafts.find((d) => d.id === draftId);
  if (!draft) throw new Error(`No draft ${draftId}`);
  const permission = canTriage(actorId, draft, ctx);
  if (!permission.ok) return { ctx, draft, refused: permission.reason };
  if (draft.status === "expired" && !allowExpired) return { ctx, draft, refused: "This draft has expired. Restore it first." };
  return { ctx, draft, refused: null };
}

/** Accepts a note or a suggestion. Anything that touches agreed content asks first, then reopens with it. */
export async function acceptDraftAction(
  db: Db,
  input: { draftId: string; actorId: string; confirmReopen: boolean; section?: string; now?: Date },
): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const { ctx, draft, refused } = await loadDraft(db, input.draftId, input.actorId);
  if (refused) return { status: "refused", reason: refused };
  const storyId = draft.targetId!;
  const story = ctx.stories.find((s) => s.id === storyId);
  if (!story) return { status: "refused", reason: "Epic notes are triaged from the PRFAQ, which arrives in a later build" };

  let ops, citations, impact, updated: Draft;
  try {
    if (draft.kind === "suggestion") {
      const r = acceptSuggestion(draft, ctx, now, () => shortId("x"));
      ops = r.ops;
      impact = r.impact;
      citations = [] as ReturnType<typeof acceptNote>["citations"];
      updated = { ...draft, status: "accepted", triagedBy: input.actorId, triagedAt: now, resultBlockId: draft.blockId };
    } else {
      const r = acceptNote(draft, ctx, { actorId: input.actorId, now, newId: () => shortId("x"), section: input.section });
      ({ ops, citations } = r);
      impact = r.impact!;
      updated = r.draft;
    }
  } catch (e) {
    return { status: "refused", reason: e instanceof Error ? e.message : "Couldn't accept it" };
  }
  if (impact.reopen && !input.confirmReopen) return { status: "needs_confirmation", warning: impact.warning };

  const answered = draft.hatNoteId ? [db.hatNote.update({ where: { id: draft.hatNoteId }, data: { status: "accepted" } })] : [];
  await db.$transaction([
    ...(impact.reopen ? reopenWrites(db, story, impact.editedIds, ctx, input.actorId).writes : []),
    ...opWrites(db, ops, story.id, input.actorId, now),
    ...citationWrites(db, citations),
    draftWrite(db, updated),
    ...answered,
    eventWrite(db, "draft.accepted", input.actorId, story.id, { draftId: draft.id, kind: draft.kind, reopened: impact.reopen }, now),
  ]);
  return { status: "done" };
}

export async function mergeDraftAction(db: Db, input: { draftId: string; intoBlockId: string; actorId: string; now?: Date }): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const { ctx, draft, refused } = await loadDraft(db, input.draftId, input.actorId);
  if (refused) return { status: "refused", reason: refused };
  let r;
  try {
    r = mergeNote(draft, input.intoBlockId, ctx, { actorId: input.actorId, now, newId: () => shortId("x") });
  } catch (e) {
    return { status: "refused", reason: e instanceof Error ? e.message : "Couldn't merge it" };
  }
  await db.$transaction([
    ...opWrites(db, r.ops, draft.targetId!, input.actorId, now),
    ...citationWrites(db, r.citations),
    draftWrite(db, r.draft),
    eventWrite(db, "draft.merged", input.actorId, draft.targetId!, { draftId: draft.id, intoBlockId: input.intoBlockId }, now),
  ]);
  return { status: "done" };
}

export async function rejectDraftAction(db: Db, input: { draftId: string; actorId: string; now?: Date }): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const { draft, refused } = await loadDraft(db, input.draftId, input.actorId);
  if (refused) return { status: "refused", reason: refused };
  await db.$transaction([
    draftWrite(db, rejectDraft(draft, input.actorId, now)),
    eventWrite(db, "draft.rejected", input.actorId, draft.targetId!, { draftId: draft.id }, now),
  ]);
  return { status: "done" };
}

export async function moveDraftAction(db: Db, input: { draftId: string; toId: string; actorId: string; now?: Date }): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const { ctx, draft, refused } = await loadDraft(db, input.draftId, input.actorId);
  if (refused) return { status: "refused", reason: refused };
  const moved = moveDraft(draft, input.toId, ctx);
  const key = ctx.stories.find((s) => s.id === input.toId)?.key ?? ctx.epics.find((e) => e.id === input.toId)?.key;
  await db.$transaction([
    draftWrite(db, moved),
    // The Product hat's suggestion has been taken.
    db.hatNote.updateMany({ where: { targetType: "draft", targetId: draft.id, moveToId: input.toId, status: "open" }, data: { status: "accepted" } }),
    eventWrite(db, "draft.moved", input.actorId, draft.targetId!, { draftId: draft.id, to: input.toId }, now),
    eventWrite(db, "draft.moved_in", input.actorId, input.toId, { draftId: draft.id, from: draft.targetId }, now),
  ]);
  return { status: "done", message: `Moved to ${key}.` };
}

export async function restoreDraftAction(db: Db, input: { draftId: string; actorId: string; now?: Date }): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const { ctx, draft, refused } = await loadDraft(db, input.draftId, input.actorId, true);
  if (refused) return { status: "refused", reason: refused };
  const restored = restoreDraft(draft, now, ctx);
  await db.$transaction([
    draftWrite(db, restored),
    eventWrite(db, "draft.restored", input.actorId, draft.targetId!, { draftId: draft.id }, now),
  ]);
  return { status: "done" };
}

/** An author takes back their own suggestion. */
export async function withdrawSuggestionAction(db: Db, input: { draftId: string; actorId: string; now?: Date }): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const draft = await db.draft.findUnique({ where: { id: input.draftId } });
  if (!draft || draft.kind !== "suggestion") throw new Error(`No suggestion ${input.draftId}`);
  if (draft.authorId !== input.actorId) return { status: "refused", reason: "Only its author can withdraw a suggestion" };
  if (draft.status !== "pending") return { status: "refused", reason: `Already ${draft.status}` };
  await db.$transaction([
    db.draft.update({ where: { id: draft.id }, data: { status: "withdrawn" } }),
    eventWrite(db, "suggestion.withdrawn", input.actorId, draft.targetId!, { draftId: draft.id }, now),
  ]);
  return { status: "done" };
}

// ---------- hat notes ----------

/** The line a hat note is about, so an answer can go straight under it. */
function lineOf(noteId: string, ctx: DomainSnapshot) {
  const note = ctx.hatNotes.find((h) => h.id === noteId);
  if (!note) throw new Error(`No hat note ${noteId}`);
  const blockId =
    note.targetType === "block" ? note.targetId : note.targetType === "item" ? (ctx.items.find((i) => i.id === note.targetId)?.blockId ?? null) : null;
  const block = ctx.blocks.find((b) => b.id === blockId);
  if (!block || block.parentType !== "story") throw new Error("This note isn't about a line on a story");
  const story = ctx.stories.find((s) => s.id === block.parentId)!;
  return { note, block, story };
}

/**
 * Answers a hat challenge, or adds a QA question to the page, as a new line under the line it's
 * about. The lead's goes straight in and closes the note; anyone else's is a suggestion that
 * closes the note when the lead accepts it (ADR-025).
 */
export async function answerHatNoteAction(
  db: Db,
  input: { noteId: string; actorId: string; text: string; asQuestion: boolean; now?: Date },
): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const text = input.text.trim();
  if (!text) return { status: "refused", reason: "Write the answer first" };
  const ctx = await loadSnapshot(db);
  const { note, block, story } = lineOf(input.noteId, ctx);
  const itemType = input.asQuestion ? "question" : null;
  const blockId = shortId("blk");

  if (!editsDirectly(input.actorId, story)) {
    const suggestion: Draft = {
      id: shortId("sg"),
      targetType: "story",
      targetId: story.id,
      text,
      authorId: input.actorId,
      excerptId: null,
      sourceId: null,
      createdAt: now,
      expiresAt: draftExpiresAt(now, draftExpiryDays({ targetType: "story", targetId: story.id }, ctx), ctx.sessions),
      status: "pending",
      triagedBy: null,
      triagedAt: null,
      resultBlockId: null,
      kind: "suggestion",
      section: block.section,
      op: "add",
      blockId,
      afterBlockId: block.id,
      itemType,
      hatNoteId: note.id,
    };
    await db.$transaction([
      db.draft.create({ data: suggestion }),
      eventWrite(db, "suggestion.updated", input.actorId, story.id, { hatNoteId: note.id, changed: [suggestion.id] }, now),
    ]);
    return { status: "done", message: `Suggested. ${ctx.people.find((p) => p.id === story.leadId)?.name} will review it.` };
  }

  const lines = sectionLines(story.id, block.section, ctx);
  const at = lines.findIndex((l) => l.blockId === block.id);
  const next = [...lines.slice(0, at + 1), { blockId, itemId: null, itemType, text }, ...lines.slice(at + 1)];
  const ops = diffSection({ ctx, storyId: story.id, section: block.section, lines: next, actorId: input.actorId, now, newId: () => shortId("x") });
  const impact = reopenImpact(ops, story, ctx);
  await db.$transaction([
    ...(impact.reopen ? reopenWrites(db, story, impact.editedIds, ctx, input.actorId).writes : []),
    ...opWrites(db, ops, story.id, input.actorId, now),
    db.hatNote.update({ where: { id: note.id }, data: { status: "accepted" } }),
    eventWrite(db, "hat_note.answered", input.actorId, story.id, { hatNoteId: note.id, blockId }, now),
  ]);
  return { status: "done" };
}

export async function dismissHatNoteAction(db: Db, input: { noteId: string; actorId: string; now?: Date }): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const ctx = await loadSnapshot(db);
  const { note, story } = lineOf(input.noteId, ctx);
  if (!editsDirectly(input.actorId, story)) {
    return { status: "refused", reason: `${ctx.people.find((p) => p.id === story.leadId)?.name} is the lead` };
  }
  await db.$transaction([
    db.hatNote.update({ where: { id: note.id }, data: { status: "dismissed" } }),
    // Dismissals are a product metric: hats get quieter when a note type keeps being dismissed.
    eventWrite(db, "hat_note.dismissed", input.actorId, story.id, { hatNoteId: note.id, hat: note.hat, kind: note.kind }, now),
  ]);
  return { status: "done" };
}

/** Puts an item or hat note on the next session's agenda. Bolt 8 builds the session from it. */
export async function putToSessionAction(db: Db, input: { sessionId: string; subjectId: string; storyId: string; actorId: string; now?: Date }): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const session = await db.session.findUnique({ where: { id: input.sessionId } });
  if (!session || session.status === "ended") return { status: "refused", reason: "That session isn't planned any more" };
  const agenda = JSON.parse(session.agendaJson) as string[];
  if (agenda.includes(input.subjectId)) return { status: "done" };
  await db.$transaction([
    db.session.update({ where: { id: session.id }, data: { agendaJson: JSON.stringify([...agenda, input.subjectId]) } }),
    eventWrite(db, "session.agenda_added", input.actorId, input.storyId, { sessionId: session.id, subjectId: input.subjectId }, now),
  ]);
  return { status: "done" };
}

// ---------- the Scrum Master's expiry pass ----------

/** Archives drafts past their expiry (never deletes them). Deterministic; runs when the workspace loads. */
export async function expireOverdueDrafts(db: Db, now = new Date()): Promise<number> {
  const ctx = await loadSnapshot(db);
  const expired = expireDrafts(ctx.drafts, now);
  if (!expired.length) return 0;
  await db.$transaction(
    expired.flatMap((d) => [
      db.draft.update({ where: { id: d.id }, data: { status: "expired" } }),
      db.event.create({
        data: {
          id: randomUUID(),
          type: "draft.expired",
          actorId: null,
          subjectType: d.targetType ?? "story",
          subjectId: d.targetId ?? "",
          payloadJson: JSON.stringify({ draftId: d.id, kind: d.kind }),
          createdAt: now,
        },
      }),
    ]),
  );
  return expired.length;
}
