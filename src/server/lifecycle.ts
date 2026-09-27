// The only code that persists a story's state or sign-off (ADR-007).
// Every write goes through a guarded domain function; nothing here decides a state itself.
import { randomUUID } from "node:crypto";
import { reopenOnEdit, signOff, transition, type ReopenResult, type TransitionOptions, type TransitionResult } from "@/domain/lifecycle";
import { newDraftStory } from "@/domain/notebook";
import { dropStory, moveToOwnEpic, promiseForStory } from "@/domain/prfaq";
import type { DomainSnapshot, Story, StoryState } from "@/domain/types";
import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "./prisma";
import { loadSnapshot } from "./snapshot";

async function persist(db: Db, storyId: string, type: string, actorId: string | null, r: TransitionResult, payload: object) {
  if (!r.ok) return r;
  await db.$transaction([
    db.story.update({
      where: { id: storyId },
      data: { state: r.story.state, signedOffBy: r.story.signedOffBy, signedOffAt: r.story.signedOffAt },
    }),
    db.event.create({
      data: { id: randomUUID(), type, actorId, subjectType: "story", subjectId: storyId, payloadJson: JSON.stringify(payload) },
    }),
  ]);
  return r;
}

async function load(db: Db, storyId: string) {
  const ctx = await loadSnapshot(db);
  const story = ctx.stories.find((s) => s.id === storyId);
  if (!story) throw new Error(`No story ${storyId}`);
  return { ctx, story };
}

export async function transitionStory(db: Db, storyId: string, to: StoryState, opts: TransitionOptions) {
  const { ctx, story } = await load(db, storyId);
  return persist(db, storyId, "story.transition", opts.actorId, transition(story, to, ctx, opts), { from: story.state, to });
}

export async function signOffStory(db: Db, storyId: string, actorId: string, now = new Date()) {
  const { ctx, story } = await load(db, storyId);
  return persist(db, storyId, "story.signed_off", actorId, signOff(story, actorId, ctx, now), { from: story.state });
}

/**
 * The writes that reopen a story after an edit (bolt 1's reopenOnEdit), for callers to put in the
 * same transaction as the edit itself. Empty when nothing needs reopening.
 */
export function reopenWrites(
  db: Db,
  story: Story,
  editedIds: string | string[],
  ctx: DomainSnapshot,
  actorId: string | null,
): { writes: Prisma.PrismaPromise<unknown>[]; result: ReopenResult } {
  const r = reopenOnEdit(story, editedIds, ctx);
  if (r.story === story && !r.items.length) return { writes: [], result: r };
  return {
    result: r,
    writes: [
      ...r.items.map((i) => db.item.update({ where: { id: i.id }, data: { stanceRound: i.stanceRound } })),
      db.story.update({
        where: { id: story.id },
        data: { state: r.story.state, signedOffBy: r.story.signedOffBy, signedOffAt: r.story.signedOffAt },
      }),
      db.event.create({
        data: {
          id: randomUUID(),
          type: "story.reopened",
          actorId,
          subjectType: "story",
          subjectId: story.id,
          payloadJson: JSON.stringify({ editedIds, from: story.state, askStanceFrom: r.askStanceFrom }),
        },
      }),
    ],
  };
}

/** Call after any edit to a story's content. Reopens agreed content and starts new stance rounds. */
export async function reopenStoryOnEdit(db: Db, storyId: string, editedId: string, actorId: string | null) {
  const { ctx, story } = await load(db, storyId);
  const { writes, result } = reopenWrites(db, story, editedId, ctx, actorId);
  if (writes.length) await db.$transaction(writes);
  return result;
}

/** "Turn into → Story": a new draft story, built by the domain's newDraftStory. */
export async function createDraftStory(
  db: Db,
  input: { epicId: string; title: string; actorId: string; sourceBlockId?: string | null; now?: Date },
) {
  const ctx = await loadSnapshot(db);
  const epic = ctx.epics.find((e) => e.id === input.epicId);
  if (!epic) throw new Error(`No epic ${input.epicId}`);
  const { story, block, citation } = newDraftStory({
    epic,
    ctx,
    title: input.title,
    actorId: input.actorId,
    sourceBlockId: input.sourceBlockId ?? null,
    now: input.now ?? new Date(),
  });
  await db.$transaction([
    db.story.create({ data: story }),
    ...(block ? [db.block.create({ data: block })] : []),
    ...(citation ? [db.citation.create({ data: citation })] : []),
    db.event.create({
      data: {
        id: randomUUID(),
        type: "story.created",
        actorId: input.actorId,
        subjectType: "story",
        subjectId: story.id,
        payloadJson: JSON.stringify({ key: story.key, title: story.title, fromBlockId: input.sourceBlockId ?? null }),
      },
    }),
  ]);
  return { id: story.id, key: story.key };
}

// ---------- stories that serve no promise (ADR-036) ----------


export async function dropStoryWrite(db: Db, storyId: string, actorId: string, now = new Date()) {
  const { story } = await load(db, storyId);
  const dropped = dropStory(story, now);
  await db.$transaction([
    db.story.update({ where: { id: story.id }, data: { archivedAt: dropped.archivedAt } }),
    db.event.create({ data: { id: randomUUID(), type: "story.dropped", actorId, subjectType: "epic", subjectId: story.epicId, payloadJson: JSON.stringify({ storyId: story.id, key: story.key }) } }),
  ]);
}

export async function linkNewPromiseWrite(db: Db, input: { storyId: string; text: string; actorId: string }) {
  const { ctx, story } = await load(db, input.storyId);
  const prfaq = ctx.prfaqs.find((p) => p.epicId === story.epicId);
  if (!prfaq) throw new Error("The epic has no PRFAQ yet");
  const { promise, story: linked } = promiseForStory(story, prfaq, input.text, `pr-${randomUUID().slice(0, 8)}`, ctx);
  return { ctx, prfaq, promise, writes: [
    db.prfaqPromise.create({ data: promise }),
    db.story.update({ where: { id: story.id }, data: { promiseId: linked.promiseId } }),
  ] };
}

export async function moveToOwnEpicWrite(db: Db, storyId: string, actorId: string) {
  const { ctx, story } = await load(db, storyId);
  const { epic, prfaq, story: moved } = moveToOwnEpic(story, ctx, actorId);
  await db.$transaction([
    ...(prfaq ? [db.prfaq.create({ data: prfaq })] : []),
    db.epic.create({ data: { id: epic.id, key: epic.key, title: epic.title, ownerId: epic.ownerId, deciderId: epic.deciderId, templateId: epic.templateId, memberIdsJson: JSON.stringify(epic.memberIds) } }),
    db.story.update({ where: { id: story.id }, data: { epicId: moved.epicId, promiseId: null } }),
    db.event.create({ data: { id: randomUUID(), type: "story.moved_to_epic", actorId, subjectType: "epic", subjectId: story.epicId, payloadJson: JSON.stringify({ storyId: story.id, to: epic.key }) } }),
  ]);
  return epic;
}
