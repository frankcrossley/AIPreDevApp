// PRFAQ edits, read-backs and agreement. Rules are in src/domain/prfaq.ts. Any content edit sends
// an agreed PRFAQ back to draft in the same transaction (ADR-034).
import { randomUUID } from "node:crypto";
import {
  afterPrfaqEdit,
  canAgreePrfaq,
  canEditPrfaq,
  editPrfaqFields,
  setCustomerQuote,
  upsertFaq,
  upsertPromise,
  writeReadBack,
  type PrfaqFields,
} from "@/domain/prfaq";
import type { DomainSnapshot, Epic, FaqEntry, Prfaq } from "@/domain/types";
import type { Prisma } from "@/generated/prisma/client";
import { dropStoryWrite, linkNewPromiseWrite, moveToOwnEpicWrite } from "./lifecycle";
import type { Db } from "./prisma";
import { loadSnapshot } from "./snapshot";
import type { ActionResult } from "./triage";

const event = (db: Db, type: string, actorId: string, epicId: string, payload: object) =>
  db.event.create({ data: { id: randomUUID(), type, actorId, subjectType: "epic", subjectId: epicId, payloadJson: JSON.stringify(payload) } });

async function loadEpic(db: Db, epicId: string) {
  const ctx = await loadSnapshot(db);
  const epic = ctx.epics.find((e) => e.id === epicId);
  const prfaq = ctx.prfaqs.find((p) => p.epicId === epicId);
  if (!epic || !prfaq) throw new Error(`No PRFAQ for ${epicId}`);
  return { ctx, epic, prfaq };
}

/** The writes that follow any content edit: back to draft, and too-close read-backs redone. */
function reopenWrites(db: Db, next: Prfaq, ctx: DomainSnapshot, actorId: string, epic: Epic): Prisma.PrismaPromise<unknown>[] {
  const after = afterPrfaqEdit(next, { ...ctx, prfaqs: ctx.prfaqs.map((p) => (p.id === next.id ? next : p)) });
  const { id, ...fields } = after.prfaq;
  const reopened = ctx.prfaqs.find((p) => p.id === id)?.state === "agreed";
  return [
    db.prfaq.update({ where: { id }, data: fields }),
    ...after.readBacks.map((r) => db.readBack.update({ where: { id: r.id }, data: { assessment: r.assessment, note: r.note } })),
    ...(reopened ? [event(db, "prfaq.reopened", actorId, epic.id, {})] : []),
  ];
}

async function asOwner(db: Db, epicId: string, actorId: string) {
  const loaded = await loadEpic(db, epicId);
  const permission = canEditPrfaq(actorId, loaded.epic, loaded.ctx);
  return { ...loaded, refused: permission.ok ? null : permission.reason };
}

const refusedFrom = (e: unknown): ActionResult => ({ status: "refused", reason: e instanceof Error ? e.message : "Couldn't save it" });

export async function savePrfaqFieldsAction(db: Db, input: { epicId: string; actorId: string; fields: PrfaqFields }): Promise<ActionResult> {
  const { ctx, epic, prfaq, refused } = await asOwner(db, input.epicId, input.actorId);
  if (refused) return { status: "refused", reason: refused };
  let next;
  try {
    next = editPrfaqFields(prfaq, input.fields);
  } catch (e) {
    return refusedFrom(e);
  }
  await db.$transaction([...reopenWrites(db, next, ctx, input.actorId, epic), event(db, "prfaq.edited", input.actorId, epic.id, { fields: Object.keys(input.fields) })]);
  return { status: "done" };
}

export async function setQuoteAction(db: Db, input: { epicId: string; actorId: string; excerptId: string }): Promise<ActionResult> {
  const { ctx, epic, prfaq, refused } = await asOwner(db, input.epicId, input.actorId);
  if (refused) return { status: "refused", reason: refused };
  let next;
  try {
    next = setCustomerQuote(prfaq, input.excerptId, ctx);
  } catch (e) {
    return refusedFrom(e);
  }
  await db.$transaction([...reopenWrites(db, next, ctx, input.actorId, epic), event(db, "prfaq.quote_changed", input.actorId, epic.id, { excerptId: input.excerptId })]);
  return { status: "done" };
}

export async function savePromiseAction(db: Db, input: { epicId: string; actorId: string; id: string | null; text: string }): Promise<ActionResult> {
  const { ctx, epic, prfaq, refused } = await asOwner(db, input.epicId, input.actorId);
  if (refused) return { status: "refused", reason: refused };
  let promise;
  try {
    promise = upsertPromise(prfaq, { id: input.id ?? `pr-${randomUUID().slice(0, 8)}`, text: input.text }, ctx);
  } catch (e) {
    return refusedFrom(e);
  }
  await db.$transaction([
    db.prfaqPromise.upsert({ where: { id: promise.id }, create: promise, update: { text: promise.text } }),
    ...reopenWrites(db, prfaq, ctx, input.actorId, epic),
    event(db, "prfaq.promise_saved", input.actorId, epic.id, { promiseId: promise.id }),
  ]);
  return { status: "done" };
}

export async function saveFaqAction(
  db: Db,
  input: { epicId: string; actorId: string; id: string | null; audience: FaqEntry["audience"]; question: string; answer: string | null; storyIds: string[]; blocking: boolean },
): Promise<ActionResult> {
  const { ctx, epic, prfaq, refused } = await asOwner(db, input.epicId, input.actorId);
  if (refused) return { status: "refused", reason: refused };
  let faq;
  try {
    faq = upsertFaq(prfaq, { ...input, id: input.id ?? `faq-${randomUUID().slice(0, 8)}` }, ctx);
  } catch (e) {
    return refusedFrom(e);
  }
  const { storyIds, ...rest } = faq;
  const data = { ...rest, storyIdsJson: JSON.stringify(storyIds) };
  await db.$transaction([
    db.faqEntry.upsert({ where: { id: faq.id }, create: data, update: data }),
    ...reopenWrites(db, prfaq, ctx, input.actorId, epic),
    event(db, "prfaq.faq_saved", input.actorId, epic.id, { faqId: faq.id }),
  ]);
  return { status: "done" };
}

/** Only the person writes their own read-back. */
export async function writeReadBackAction(db: Db, input: { epicId: string; actorId: string; text: string; now?: Date }): Promise<ActionResult> {
  const now = input.now ?? new Date();
  const { ctx, epic } = await loadEpic(db, input.epicId);
  let rb;
  try {
    rb = writeReadBack({ ctx, epic, personId: input.actorId, text: input.text, now });
  } catch (e) {
    return refusedFrom(e);
  }
  await db.$transaction([
    db.readBack.upsert({ where: { id: rb.id }, create: rb, update: { text: rb.text, assessment: rb.assessment, note: rb.note, createdAt: rb.createdAt } }),
    event(db, "readback.written", input.actorId, epic.id, { readBackId: rb.id, assessment: rb.assessment }),
  ]);
  return { status: "done", message: rb.assessment === "too_close" ? rb.note ?? undefined : undefined };
}

export async function agreePrfaqAction(db: Db, input: { epicId: string; actorId: string }): Promise<ActionResult> {
  const { ctx, epic, prfaq } = await loadEpic(db, input.epicId);
  const permission = canAgreePrfaq(input.actorId, epic, ctx);
  if (!permission.ok) return { status: "refused", reason: permission.reasons.join(" · ") };
  await db.$transaction([db.prfaq.update({ where: { id: prfaq.id }, data: { state: "agreed" } }), event(db, "prfaq.agreed", input.actorId, epic.id, {})]);
  return { status: "done" };
}

// ---------- stories that serve no promise ----------

export async function addPromiseForStoryAction(db: Db, input: { epicId: string; storyId: string; actorId: string; text: string }): Promise<ActionResult> {
  const { epic, refused } = await asOwner(db, input.epicId, input.actorId);
  if (refused) return { status: "refused", reason: refused };
  try {
    const { ctx, prfaq, promise, writes } = await linkNewPromiseWrite(db, { storyId: input.storyId, text: input.text, actorId: input.actorId });
    await db.$transaction([...writes, ...reopenWrites(db, prfaq, ctx, input.actorId, epic), event(db, "prfaq.promise_saved", input.actorId, epic.id, { promiseId: promise.id, storyId: input.storyId })]);
  } catch (e) {
    return refusedFrom(e);
  }
  return { status: "done" };
}

export async function moveStoryToOwnEpicAction(db: Db, input: { epicId: string; storyId: string; actorId: string }): Promise<ActionResult> {
  const { refused } = await asOwner(db, input.epicId, input.actorId);
  if (refused) return { status: "refused", reason: refused };
  try {
    const epic = await moveToOwnEpicWrite(db, input.storyId, input.actorId);
    return { status: "done", message: `Moved to its own epic, ${epic.key}.` };
  } catch (e) {
    return refusedFrom(e);
  }
}

export async function dropStoryAction(db: Db, input: { epicId: string; storyId: string; actorId: string }): Promise<ActionResult> {
  const { refused } = await asOwner(db, input.epicId, input.actorId);
  if (refused) return { status: "refused", reason: refused };
  try {
    await dropStoryWrite(db, input.storyId, input.actorId);
  } catch (e) {
    return refusedFrom(e);
  }
  return { status: "done", message: "Dropped. It's archived, not deleted." };
}
