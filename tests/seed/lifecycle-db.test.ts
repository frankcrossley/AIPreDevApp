// "There is no way to force Ready", end to end through the persistence layer.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reopenStoryOnEdit, signOffStory, transitionStory } from "@/server/lifecycle";
import { agreePrfaqInDb, seededDatabase } from "../db";
import { NOW } from "../fixtures";

let env: Awaited<ReturnType<typeof seededDatabase>>;
beforeEach(async () => {
  env = await seededDatabase();
});
afterEach(() => env.cleanup());

const state = async (id: string) => (await env.db.story.findUniqueOrThrow({ where: { id } })).state;

describe("persisted lifecycle", () => {
  it("refuses to sign off seeded BILL-150 and leaves it untouched", async () => {
    const r = await signOffStory(env.db, "bill-150", "priya", NOW);
    expect(r.ok).toBe(false);
    expect(await state("bill-150")).toBe("in_refinement");
    expect(await env.db.event.count()).toBe(0);
  });

  it("refuses transition() to ready even for the lead", async () => {
    const r = await transitionStory(env.db, "bill-150", "ready", { actorId: "priya", now: NOW });
    expect(r.ok).toBe(false);
    expect(await state("bill-150")).toBe("in_refinement");
  });

  it("signs off once the data passes, logs it, and reopens on an edit to the agreed decision", async () => {
    await env.db.item.update({ where: { id: "it-q1" }, data: { status: "resolved" } });
    await env.db.stance.create({ data: { id: "st-dan", itemId: "it-d1", personId: "dan", value: "agree", round: 1, createdAt: NOW } });
    await env.db.hatNote.update({ where: { id: "hn3" }, data: { status: "accepted" } });
    await agreePrfaqInDb(env.db);

    expect((await signOffStory(env.db, "bill-150", "sam", NOW)).ok).toBe(false);
    expect((await signOffStory(env.db, "bill-150", "priya", NOW)).ok).toBe(true);
    expect(await state("bill-150")).toBe("ready");
    expect((await env.db.event.findFirstOrThrow()).type).toBe("story.signed_off");

    const r = await reopenStoryOnEdit(env.db, "bill-150", "b4", "priya");
    expect(r.askStanceFrom).toEqual(["priya", "sam", "marcus", "dan"]);
    const story = await env.db.story.findUniqueOrThrow({ where: { id: "bill-150" } });
    expect(story).toMatchObject({ state: "in_refinement", signedOffBy: null, signedOffAt: null });
    expect((await env.db.item.findUniqueOrThrow({ where: { id: "it-d1" } })).stanceRound).toBe(2);
  });
});
