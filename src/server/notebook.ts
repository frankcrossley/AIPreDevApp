// Persists notebook edits (ADR-020). The rules are in src/domain/notebook.ts; this file writes
// the ops they produce and logs every change as an Event.
import { randomUUID } from "node:crypto";
import { isLiveItem } from "@/domain/checks";
import { diffSection, reopenImpact, setBlocking, type NotebookOp, type SectionLine } from "@/domain/notebook";
import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "./prisma";
import { reopenWrites } from "./lifecycle";
import { loadSnapshot } from "./snapshot";

export type SaveResult =
  | { status: "saved"; reopened: boolean }
  | { status: "needs_confirmation"; warning: string; personIds: string[] };

const shortId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

function opWrites(db: Db, ops: NotebookOp[], storyId: string, actorId: string, now: Date): Prisma.PrismaPromise<unknown>[] {
  const event = (type: string, payload: object) =>
    db.event.create({
      data: { id: randomUUID(), type, actorId, subjectType: "story", subjectId: storyId, payloadJson: JSON.stringify(payload), createdAt: now },
    });
  return ops.flatMap((o): Prisma.PrismaPromise<unknown>[] => {
    switch (o.op) {
      case "createBlock":
        return [db.block.create({ data: o.block }), event("block.created", { blockId: o.block.id, section: o.block.section, text: o.block.text })];
      case "updateBlock":
        return [
          db.block.update({ where: { id: o.id }, data: { ...(o.text !== undefined && { text: o.text }), ...(o.order !== undefined && { order: o.order }), updatedAt: now } }),
          ...(o.text !== undefined ? [event("block.edited", { blockId: o.id, text: o.text })] : []),
        ];
      case "deleteBlock":
        return [
          db.citation.deleteMany({ where: { fromType: "block", fromId: o.id } }),
          db.block.delete({ where: { id: o.id } }),
          event("block.deleted", { blockId: o.id }),
        ];
      case "createItem": {
        const { requiredStanceIds, ...item } = o.item;
        return [
          db.item.create({ data: { ...item, requiredStanceIdsJson: JSON.stringify(requiredStanceIds) } }),
          event("item.created", { itemId: item.id, type: item.type, text: item.text, blockId: item.blockId }),
        ];
      }
      case "updateItem":
        return [db.item.update({ where: { id: o.id }, data: { text: o.text } }), event("item.edited", { itemId: o.id, text: o.text })];
      case "archiveItem":
        return [db.item.update({ where: { id: o.id }, data: { status: "archived" } }), event("item.archived", { itemId: o.id })];
      case "restoreItem":
        return [db.item.update({ where: { id: o.id }, data: { status: "open" } }), event("item.restored", { itemId: o.id })];
    }
  });
}

/**
 * Saves one section of a story's notebook. Edits to agreed content are held until the caller
 * confirms; on confirmation the story reopens first (bolt 1's reopenOnEdit), then the edit lands.
 */
export async function saveSection(
  db: Db,
  input: { storyId: string; section: string; lines: SectionLine[]; actorId: string; confirmReopen: boolean; now?: Date },
): Promise<SaveResult> {
  const now = input.now ?? new Date();
  const ctx = await loadSnapshot(db);
  const story = ctx.stories.find((s) => s.id === input.storyId);
  if (!story) throw new Error(`No story ${input.storyId}`);
  const template = ctx.templates.find((t) => t.id === story.templateId);
  if (!template?.sections.includes(input.section)) throw new Error(`${input.section} isn't a section of ${story.key}`);

  const ops = diffSection({ ctx, storyId: story.id, section: input.section, lines: input.lines, actorId: input.actorId, now, newId: () => shortId("x") });
  if (!ops.length) return { status: "saved", reopened: false };

  const impact = reopenImpact(ops, story, ctx);
  if (impact.reopen && !input.confirmReopen) {
    return { status: "needs_confirmation", warning: impact.warning, personIds: impact.personIds };
  }
  // The reopen and the edit land together or not at all.
  const reopen = impact.reopen ? reopenWrites(db, story, impact.editedIds, ctx, input.actorId).writes : [];
  await db.$transaction([...reopen, ...opWrites(db, ops, story.id, input.actorId, now)]);
  return { status: "saved", reopened: impact.reopen };
}

/**
 * Marks a question blocking or not. On an agreed, ready or exported story that changes agreed
 * content, so the story reopens in the same transaction (ADR-015).
 */
export async function setItemBlocking(db: Db, itemId: string, blocking: boolean, actorId: string) {
  const ctx = await loadSnapshot(db);
  const item = ctx.items.find((i) => i.id === itemId);
  if (!item || !isLiveItem(item)) throw new Error(`No live item ${itemId}`);
  const updated = setBlocking(item, blocking);
  const story = item.parentType === "story" ? ctx.stories.find((s) => s.id === item.parentId) : undefined;
  const reopen = story ? reopenWrites(db, story, itemId, ctx, actorId).writes : [];
  await db.$transaction([
    ...reopen,
    db.item.update({ where: { id: itemId }, data: { blocking: updated.blocking } }),
    db.event.create({
      data: {
        id: randomUUID(),
        type: blocking ? "item.marked_blocking" : "item.unmarked_blocking",
        actorId,
        subjectType: item.parentType,
        subjectId: item.parentId,
        payloadJson: JSON.stringify({ itemId }),
      },
    }),
  ]);
}
