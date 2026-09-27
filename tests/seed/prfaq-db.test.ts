// PRFAQ edits, read-backs and agreement against a real database.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addPromiseForStoryAction,
  agreePrfaqAction,
  dropStoryAction,
  moveStoryToOwnEpicAction,
  saveFaqAction,
  savePrfaqFieldsAction,
  setQuoteAction,
  writeReadBackAction,
} from "@/server/prfaq";
import { seededDatabase } from "../db";

let env: Awaited<ReturnType<typeof seededDatabase>>;
beforeEach(async () => {
  env = await seededDatabase();
});
afterEach(() => env.cleanup());

const faq4 = { id: "faq-4", audience: "internal" as const, question: "What about the 11 of 40 who'd rather keep a flat fee?", storyIds: [], blocking: true };

async function realign() {
  await saveFaqAction(env.db, { epicId: "bill-142", actorId: "priya", ...faq4, answer: "They keep today's fee, capped, for 18 months, then choose." });
  await writeReadBackAction(env.db, { epicId: "bill-142", actorId: "dan", text: "Monthly usage billing, with live usage visible so customers can budget." });
  await writeReadBackAction(env.db, { epicId: "bill-142", actorId: "security", text: "Usage pricing that stores no new personal data." });
}

describe("agreeing the PRFAQ", () => {
  it("is refused early, with reasons, then allowed after realigning", async () => {
    const early = await agreePrfaqAction(env.db, { epicId: "bill-142", actorId: "priya" });
    expect(early.status).toBe("refused");
    if (early.status === "refused") expect(early.reason).toMatch(/Dan's read-back diverges/);
    await realign();
    expect(await agreePrfaqAction(env.db, { epicId: "bill-142", actorId: "sam" })).toMatchObject({ status: "refused" });
    expect(await agreePrfaqAction(env.db, { epicId: "bill-142", actorId: "priya" })).toEqual({ status: "done" });
    expect((await env.db.prfaq.findUniqueOrThrow({ where: { id: "prfaq-142" } })).state).toBe("agreed");
  });

  it("editing an agreed PRFAQ sends it back to draft", async () => {
    await realign();
    await agreePrfaqAction(env.db, { epicId: "bill-142", actorId: "priya" });
    await savePrfaqFieldsAction(env.db, { epicId: "bill-142", actorId: "priya", fields: { subhead: "Usage pricing, fair plan changes, no surprise jumps." } });
    expect((await env.db.prfaq.findUniqueOrThrow({ where: { id: "prfaq-142" } })).state).toBe("draft");
    expect(await env.db.event.count({ where: { type: "prfaq.reopened" } })).toBe(1);
  });
});

describe("who can do what", () => {
  it("only the owner edits; the quote must be a real excerpt; only members read back", async () => {
    expect(await savePrfaqFieldsAction(env.db, { epicId: "bill-142", actorId: "sam", fields: { headline: "x" } })).toEqual({ status: "refused", reason: "Priya owns the PRFAQ" });
    expect(await setQuoteAction(env.db, { epicId: "bill-142", actorId: "priya", excerptId: "ex-survey-flat-fee" })).toMatchObject({ status: "refused" });
    expect(await setQuoteAction(env.db, { epicId: "bill-142", actorId: "priya", excerptId: "ex-acme-1240" })).toEqual({ status: "done" });
    expect(await writeReadBackAction(env.db, { epicId: "bill-142", actorId: "jo", text: "Usage billing for everyone, I think." })).toMatchObject({ status: "refused" });
  });

  it("a pasted headline is marked too close", async () => {
    const r = await writeReadBackAction(env.db, { epicId: "bill-142", actorId: "security", text: "API customers now pay for what they use, and can see it as they go" });
    expect(r).toEqual({ status: "done", message: "Too close to the page, say it in your own words." });
    expect((await env.db.readBack.findUniqueOrThrow({ where: { id: "rb-bill-142-security" } })).assessment).toBe("too_close");
  });
});

describe("stories that serve no promise", () => {
  it("Add a promise links BILL-163", async () => {
    expect(await addPromiseForStoryAction(env.db, { epicId: "bill-142", storyId: "bill-163", actorId: "priya", text: "Your invoice matches how you budget" })).toEqual({ status: "done" });
    const s = await env.db.story.findUniqueOrThrow({ where: { id: "bill-163" } });
    expect((await env.db.prfaqPromise.findUniqueOrThrow({ where: { id: s.promiseId! } })).text).toBe("Your invoice matches how you budget");
  });

  it("Move to its own epic makes a new epic", async () => {
    const r = await moveStoryToOwnEpicAction(env.db, { epicId: "bill-142", storyId: "bill-163", actorId: "priya" });
    expect(r).toEqual({ status: "done", message: "Moved to its own epic, BILL-164, with a draft PRFAQ to write." });
    expect((await env.db.story.findUniqueOrThrow({ where: { id: "bill-163" } })).epicId).toBe("bill-164");
    expect(await env.db.prfaq.findUniqueOrThrow({ where: { epicId: "bill-164" } })).toMatchObject({ state: "draft", headline: "Invoices grouped by project" });
  });

  it("Drop it archives it, and only before refinement", async () => {
    expect(await dropStoryAction(env.db, { epicId: "bill-142", storyId: "bill-163", actorId: "priya" })).toMatchObject({ status: "done" });
    expect((await env.db.story.findUniqueOrThrow({ where: { id: "bill-163" } })).archivedAt).not.toBeNull();
    expect(await dropStoryAction(env.db, { epicId: "bill-142", storyId: "bill-150", actorId: "priya" })).toMatchObject({ status: "refused" });
  });
});

describe("review fixes", () => {
  it("one epic's owner can't act on another epic's story", async () => {
    await moveStoryToOwnEpicAction(env.db, { epicId: "bill-142", storyId: "bill-163", actorId: "priya" });
    // bill-163 is now on BILL-164, owned by Priya; acting on it through BILL-142 is refused.
    expect(await dropStoryAction(env.db, { epicId: "bill-142", storyId: "bill-163", actorId: "priya" })).toEqual({ status: "refused", reason: "That story isn't on this epic" });
  });

  it("a read-back copying a new promise is too close straight away", async () => {
    const { savePromiseAction } = await import("@/server/prfaq");
    await writeReadBackAction(env.db, { epicId: "bill-142", actorId: "security", text: "Your data stays in the region you chose" });
    await savePromiseAction(env.db, { epicId: "bill-142", actorId: "priya", id: null, text: "Your data stays in the region you chose" });
    expect((await env.db.readBack.findUniqueOrThrow({ where: { id: "rb-bill-142-security" } })).assessment).toBe("too_close");
  });

  it("after an agreed PRFAQ is edited, it can't be agreed again until people read it again", async () => {
    await realign();
    await agreePrfaqAction(env.db, { epicId: "bill-142", actorId: "priya" });
    await savePrfaqFieldsAction(env.db, { epicId: "bill-142", actorId: "priya", fields: { subhead: "Usage pricing, fair plan changes, no surprise jumps." } });
    expect((await agreePrfaqAction(env.db, { epicId: "bill-142", actorId: "priya" })).status).toBe("refused");
    expect((await env.db.readBack.findUniqueOrThrow({ where: { id: "rb-bill-142-sam" } })).assessment).toBe("pending");
  });
});
