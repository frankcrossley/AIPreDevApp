// Persists notebook edits (ADR-020). The rules are in src/domain/notebook.ts; this file writes
// the ops they produce and logs every change as an Event.
import { randomUUID } from "node:crypto";
import { isLiveItem } from "@/domain/checks";
import { deleteImpact, diffSection, realignmentItems, reopenImpact, setBlocking, type NotebookOp, type SectionLine } from "@/domain/notebook";
import { editsDirectly, toSuggestions } from "@/domain/suggestions";
import type { Citation, Draft, Item } from "@/domain/types";
import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "./prisma";
import { reopenWrites } from "./lifecycle";
import { loadSnapshot } from "./snapshot";

export type SaveResult =
  | { status: "saved"; reopened: boolean }
  | { status: "suggested"; pending: number }
  | { status: "needs_confirmation"; warning: string; personIds: string[] };

const shortId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

export function opWrites(db: Db, ops: NotebookOp[], storyId: string, actorId: string, now: Date): Prisma.PrismaPromise<unknown>[] {
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

  // Everyone but the lead suggests (ADR-025).
  if (!editsDirectly(input.actorId, story)) {
    const changes = toSuggestions({ ctx, story, section: input.section, lines: input.lines, authorId: input.actorId, now, newId: () => shortId("sg") });
    await db.$transaction([
      ...changes.upserts.map((d) => db.draft.upsert({ where: { id: d.id }, create: d, update: d })),
      ...changes.withdrawIds.map((id) => db.draft.update({ where: { id }, data: { status: "withdrawn" } })),
      ...(changes.upserts.length || changes.withdrawIds.length
        ? [eventWrite(db, "suggestion.updated", input.actorId, story.id, { section: input.section, changed: changes.upserts.map((d) => d.id), withdrawn: changes.withdrawIds }, now)]
        : []),
    ]);
    const pending = ctx.drafts.filter((d) => d.kind === "suggestion" && d.status === "pending" && d.targetId === story.id && d.authorId === input.actorId && d.section === input.section && !changes.withdrawIds.includes(d.id)).length;
    return { status: "suggested", pending: pending + changes.upserts.filter((d) => !ctx.drafts.some((x) => x.id === d.id)).length };
  }

  const ops = diffSection({ ctx, storyId: story.id, section: input.section, lines: input.lines, actorId: input.actorId, now, newId: () => shortId("x") });
  if (!ops.length) return { status: "saved", reopened: false };

  const impact = reopenImpact(ops, story, ctx);
  const deletes = deleteImpact(ops, ctx);
  if ((impact.reopen || deletes.affected.length) && !input.confirmReopen) {
    return {
      status: "needs_confirmation",
      warning: [impact.reopen ? impact.warning : "", deletes.warning].filter(Boolean).join(" "),
      personIds: impact.personIds,
    };
  }
  // The reopen, the edit and any realignment land together or not at all.
  const reopen = impact.reopen ? reopenWrites(db, story, impact.editedIds, ctx, input.actorId).writes : [];
  const realign = realignmentItems(deletes, () => shortId("rl"));
  await db.$transaction([
    ...reopen,
    ...deletes.affected.map((a) => db.citation.deleteMany({ where: { toType: "block", toId: a.blockId } })),
    ...opWrites(db, ops, story.id, input.actorId, now),
    ...realign.flatMap(({ item, citation }) => [
      itemCreate(db, item),
      ...(citation ? [db.citation.create({ data: citation })] : []),
      eventWrite(db, "item.created", input.actorId, item.parentId, { itemId: item.id, type: item.type, text: item.text, reason: "realign" }, now),
    ]),
  ]);
  return { status: "saved", reopened: impact.reopen };
}

export const eventWrite = (db: Db, type: string, actorId: string | null, storyId: string, payload: object, now: Date) =>
  db.event.create({ data: { id: randomUUID(), type, actorId, subjectType: "story", subjectId: storyId, payloadJson: JSON.stringify(payload), createdAt: now } });

export const itemCreate = (db: Db, item: Item) => {
  const { requiredStanceIds, ...rest } = item;
  return db.item.create({ data: { ...rest, requiredStanceIdsJson: JSON.stringify(requiredStanceIds) } });
};

export const draftWrite = (db: Db, d: Draft) => db.draft.update({ where: { id: d.id }, data: d });
export const citationWrites = (db: Db, citations: Citation[]) => citations.map((c) => db.citation.create({ data: c }));

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
