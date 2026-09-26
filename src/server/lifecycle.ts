// The only code that persists a story's state or sign-off (ADR-007).
// Every write goes through a guarded domain function; nothing here decides a state itself.
import { randomUUID } from "node:crypto";
import { reopenOnEdit, signOff, transition, type TransitionOptions, type TransitionResult } from "@/domain/lifecycle";
import type { StoryState } from "@/domain/types";
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

/** Call after any edit to a story's content. Reopens agreed content and starts new stance rounds. */
export async function reopenStoryOnEdit(db: Db, storyId: string, editedId: string, actorId: string | null) {
  const { ctx, story } = await load(db, storyId);
  const r = reopenOnEdit(story, editedId, ctx);
  if (r.story === story && !r.items.length) return r;
  await db.$transaction([
    ...r.items.map((i) => db.item.update({ where: { id: i.id }, data: { stanceRound: i.stanceRound } })),
    db.story.update({
      where: { id: storyId },
      data: { state: r.story.state, signedOffBy: r.story.signedOffBy, signedOffAt: r.story.signedOffAt },
    }),
    db.event.create({
      data: {
        id: randomUUID(),
        type: "story.reopened",
        actorId,
        subjectType: "story",
        subjectId: storyId,
        payloadJson: JSON.stringify({ editedId, from: story.state, askStanceFrom: r.askStanceFrom }),
      },
    }),
  ]);
  return r;
}
