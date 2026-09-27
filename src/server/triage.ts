// Card actions from the right panel: triage (accept, merge, reject, move, restore), withdrawing
// a suggestion, answering and dismissing hat notes, and putting things to the next session.
// Each one is a single transaction with an Event; the rules are in src/domain.
import { randomUUID } from "node:crypto";
import { draftExpiresAt, draftExpiryDays, expireDrafts, restoreDraft } from "@/domain/drafts";
import { answerCitations, diffSection, planChange, sectionLines } from "@/domain/notebook";
import { acceptSuggestion, editsDirectly } from "@/domain/suggestions";
import { acceptNote, canDismiss, canPutToSession, canTriage, canTriageNow, canWithdraw, mergeNote, moveDraft, rejectDraft } from "@/domain/triage";
import type { Citation, DomainSnapshot, Draft } from "@/domain/types";
import type { Db } from "./prisma";
import { changeWrites, citationWrites, draftWrite, eventWrite } from "./notebook";
import { loadSnapshot } from "./snapshot";

export type ActionResult = { status: "done"; message?: string } | { status: "needs_confirmation"; warning: string } | { status: "refused"; reason: string };

const shortId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

async function loadDraft(db: Db, draftId: string, actorId: string, now: Date, forRestore = false) {
  const ctx = await loadSnapshot(db);
  const draft = ctx.drafts.find((d) => d.id === draftId);
  if (!draft) throw new Error(`No draft ${draftId}`);
  const permission = forRestore ? canTriage(actorId, draft, ctx) : canTriageNow(actorId, draft, ctx, now);
  return { ctx, draft, refused: permission.ok ? null : permission.reason };
}

/** Accepts a note or a suggestion. Anything that reopens agreed content or orphans citations asks first. */
export async function acceptDraftAction(
  db: Db,
  input: { draftId: string; actorId: string; confirmReopen: boolean; section?: string; now?: Date },
): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const { ctx, draft, refused } = await loadDraft(db, input.draftId, input.actorId, now);
  if (refused) return { status: "refused", reason: refused };
  const story = ctx.stories.find((s) => s.id === draft.targetId);
  if (!story) return { status: "refused", reason: "Epic notes are accepted into the PRFAQ, which arrives in a later build" };

  let plan, citations: Citation[] = [], updated: Draft;
  try {
    if (draft.kind === "suggestion") {
      plan = acceptSuggestion(draft, ctx, now, () => shortId("x"));
      updated = { ...draft, status: "accepted", triagedBy: input.actorId, triagedAt: now, resultBlockId: draft.blockId };
    } else {
      const r = acceptNote(draft, ctx, { actorId: input.actorId, now, newId: () => shortId("x"), section: input.section });
      ({ plan, citations } = r);
      updated = r.draft;
    }
  } catch (e) {
    return { status: "refused", reason: e instanceof Error ? e.message : "Couldn't accept it" };
  }
  if (plan.needsConfirmation && !input.confirmReopen) return { status: "needs_confirmation", warning: plan.warning };

  await db.$transaction([
    ...changeWrites(db, plan, story, ctx, input.actorId, now),
    ...citationWrites(db, citations),
    draftWrite(db, updated),
    ...(draft.hatNoteId ? answeredNoteWrites(db, draft, ctx) : []),
    eventWrite(db, "draft.accepted", input.actorId, story.id, { draftId: draft.id, kind: draft.kind, reopened: plan.reopen.reopen }, now),
  ]);
  return { status: "done" };
}

export async function mergeDraftAction(
  db: Db,
  input: { draftId: string; intoBlockId: string; actorId: string; confirmReopen?: boolean; now?: Date },
): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const { ctx, draft, refused } = await loadDraft(db, input.draftId, input.actorId, now);
  if (refused) return { status: "refused", reason: refused };
  const story = ctx.stories.find((s) => s.id === draft.targetId);
  if (!story) return { status: "refused", reason: "Only drafts on a story can be merged" };
  let r;
  try {
    r = mergeNote(draft, input.intoBlockId, ctx, { actorId: input.actorId, now, newId: () => shortId("x") });
  } catch (e) {
    return { status: "refused", reason: e instanceof Error ? e.message : "Couldn't merge it" };
  }
  if (r.plan.needsConfirmation && !input.confirmReopen) return { status: "needs_confirmation", warning: r.plan.warning };
  await db.$transaction([
    ...changeWrites(db, r.plan, story, ctx, input.actorId, now),
    ...citationWrites(db, r.citations),
    draftWrite(db, r.draft),
    eventWrite(db, "draft.merged", input.actorId, story.id, { draftId: draft.id, intoBlockId: input.intoBlockId }, now),
  ]);
  return { status: "done" };
}

export async function rejectDraftAction(db: Db, input: { draftId: string; actorId: string; now?: Date }): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const { draft, refused } = await loadDraft(db, input.draftId, input.actorId, now);
  if (refused) return { status: "refused", reason: refused };
  await db.$transaction([
    draftWrite(db, rejectDraft(draft, input.actorId, now)),
    eventWrite(db, "draft.rejected", input.actorId, draft.targetId!, { draftId: draft.id }, now),
  ]);
  return { status: "done" };
}

export async function moveDraftAction(db: Db, input: { draftId: string; toId: string; actorId: string; now?: Date }): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const { ctx, draft, refused } = await loadDraft(db, input.draftId, input.actorId, now);
  if (refused) return { status: "refused", reason: refused };
  let moved: Draft;
  try {
    moved = moveDraft(draft, input.toId, ctx);
  } catch (e) {
    return { status: "refused", reason: e instanceof Error ? e.message : "Couldn't move it" };
  }
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
  const { ctx, draft, refused } = await loadDraft(db, input.draftId, input.actorId, now, true);
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
  const ctx = await loadSnapshot(db);
  const draft = ctx.drafts.find((d) => d.id === input.draftId);
  if (!draft) throw new Error(`No draft ${input.draftId}`);
  const permission = canWithdraw(input.actorId, draft);
  if (!permission.ok) return { status: "refused", reason: permission.reason };
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
  input: { noteId: string; actorId: string; text: string; asQuestion: boolean; confirmReopen?: boolean; now?: Date },
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
      baseText: null,
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
  const plan = planChange(ops, story, ctx);
  if (plan.needsConfirmation && !input.confirmReopen) return { status: "needs_confirmation", warning: plan.warning };
  await db.$transaction([
    ...changeWrites(db, plan, story, ctx, input.actorId, now),
    ...citationWrites(db, answerCitations(blockId, note.refs, ctx)),
    db.hatNote.update({ where: { id: note.id }, data: { status: "accepted" } }),
    eventWrite(db, "hat_note.answered", input.actorId, story.id, { hatNoteId: note.id, blockId }, now),
  ]);
  return { status: "done" };
}

export async function dismissHatNoteAction(db: Db, input: { noteId: string; actorId: string; now?: Date }): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const ctx = await loadSnapshot(db);
  const { note, story } = lineOf(input.noteId, ctx);
  const permission = canDismiss(input.actorId, story.leadId, ctx);
  if (!permission.ok) return { status: "refused", reason: permission.reason };
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
  const ctx = await loadSnapshot(db);
  const session = ctx.sessions.find((s) => s.id === input.sessionId);
  const permission = canPutToSession(session, input.subjectId, input.storyId, ctx);
  if (!permission.ok || !session) return { status: "refused", reason: permission.ok ? "No session" : permission.reason };
  if (session.agenda.includes(input.subjectId)) return { status: "done" };
  await db.$transaction([
    db.session.update({ where: { id: session.id }, data: { agendaJson: JSON.stringify([...session.agenda, input.subjectId]) } }),
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

/** Accepting a suggested answer closes its hat note and makes the answer traceable, like the lead's own. */
function answeredNoteWrites(db: Db, draft: Draft, ctx: DomainSnapshot) {
  const note = ctx.hatNotes.find((h) => h.id === draft.hatNoteId);
  const writes = [db.hatNote.update({ where: { id: draft.hatNoteId! }, data: { status: "accepted" } })];
  if (!note || !draft.blockId) return writes;
  return [...writes, ...citationWrites(db, answerCitations(draft.blockId, note.refs, ctx))];
}
