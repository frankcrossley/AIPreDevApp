// Notebook saves against a real database: autosave, the held edit to agreed content, and reopening.
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDraftStory } from "@/server/lifecycle";
import { saveSection, setItemBlocking } from "@/server/notebook";
import { seededDatabase } from "../db";
import { NOW } from "../fixtures";

let env: Awaited<ReturnType<typeof seededDatabase>>;
beforeEach(async () => {
  env = await seededDatabase();
});
afterEach(() => env.cleanup());

const whatWeThink = [
  { blockId: "b4", itemId: "it-d1", itemType: "decision", text: "Upgrades apply immediately, charged by the day." },
  { blockId: "b5", itemId: null, itemType: null, text: "Immediately means both the plan and the invoice line." },
  { blockId: "b8", itemId: null, itemType: null, text: "Show both plans as separate lines on the invoice." },
];

describe("saving a section", () => {
  it("saves a new question line as Marcus, with an event", async () => {
    const r = await saveSection(env.db, {
      storyId: "bill-150",
      section: "Edge cases",
      actorId: "marcus",
      confirmReopen: false,
      now: NOW,
      lines: [
        { blockId: "b6", itemId: "it-q1", itemType: "question", text: "What happens on a downgrade mid-cycle?" },
        { blockId: "b7", itemId: null, itemType: null, text: "A customer changes plan twice in one month. Probably fine, same rule applies." },
        { blockId: "blk-new", itemId: "itm-new", itemType: "question", text: "What about downgrades" },
      ],
    });
    expect(r).toEqual({ status: "saved", reopened: false });
    expect(await env.db.block.findUniqueOrThrow({ where: { id: "blk-new" } })).toMatchObject({ authorId: "marcus", order: 3 });
    expect(await env.db.item.findUniqueOrThrow({ where: { id: "itm-new" } })).toMatchObject({ type: "question", ownerId: "marcus" });
    expect((await env.db.event.findMany()).map((e) => [e.type, e.actorId])).toEqual([
      ["block.created", "marcus"],
      ["item.created", "marcus"],
    ]);
  });

  it("holds an edit to the agreed decision, then reopens it on confirmation", async () => {
    await env.db.story.update({ where: { id: "bill-150" }, data: { signedOffBy: "priya", signedOffAt: NOW } });
    const edited = whatWeThink.map((l) => (l.blockId === "b4" ? { ...l, text: "Upgrades apply immediately and are charged by the day." } : l));
    const input = { storyId: "bill-150", section: "What we think", lines: edited, actorId: "dan", now: NOW };

    const held = await saveSection(env.db, { ...input, confirmReopen: false });
    expect(held).toEqual({ status: "needs_confirmation", warning: "Priya, Sam and Marcus agreed this. Saving reopens it for all three.", personIds: ["priya", "sam", "marcus"] });
    expect((await env.db.block.findUniqueOrThrow({ where: { id: "b4" } })).text).toBe("Upgrades apply immediately, charged by the day.");

    expect(await saveSection(env.db, { ...input, confirmReopen: true })).toEqual({ status: "saved", reopened: true });
    expect((await env.db.block.findUniqueOrThrow({ where: { id: "b4" } })).text).toBe("Upgrades apply immediately and are charged by the day.");
    expect(await env.db.item.findUniqueOrThrow({ where: { id: "it-d1" } })).toMatchObject({ stanceRound: 2, text: "Upgrades apply immediately and are charged by the day." });
    expect(await env.db.story.findUniqueOrThrow({ where: { id: "bill-150" } })).toMatchObject({ signedOffBy: null, signedOffAt: null });
  });

  it("refuses a section the template doesn't have", async () => {
    await expect(saveSection(env.db, { storyId: "bill-150", section: "Rules", lines: [], actorId: "priya", confirmReopen: false })).rejects.toThrow();
  });

  it("marks a question blocking, and refuses to block a decision", async () => {
    await setItemBlocking(env.db, "it-q1", false, "priya");
    expect((await env.db.item.findUniqueOrThrow({ where: { id: "it-q1" } })).blocking).toBe(false);
    await expect(setItemBlocking(env.db, "it-d1", true, "priya")).rejects.toThrow(/question/);
  });

  it("creates a draft story from selected text, linked to its line", async () => {
    expect(await createDraftStory(env.db, { epicId: "bill-142", title: "Downgrade rules", actorId: "marcus", sourceBlockId: "b5", now: NOW })).toEqual({ id: "bill-164", key: "BILL-164" });
    expect(await env.db.story.findUniqueOrThrow({ where: { id: "bill-164" } })).toMatchObject({ state: "draft", leadId: "marcus", templateId: "tpl-story" });
    expect(await env.db.citation.findFirstOrThrow({ where: { fromId: "bill-164-b1" } })).toMatchObject({ toType: "block", toId: "b5" });
  });

  it("adding a line to a Ready story reopens it and saves the line in one go", async () => {
    await env.db.story.update({ where: { id: "bill-150" }, data: { state: "ready", signedOffBy: "priya", signedOffAt: NOW } });
    const edge = [
      { blockId: "b6", itemId: "it-q1", itemType: "question", text: "What happens on a downgrade mid-cycle?" },
      { blockId: "b7", itemId: null, itemType: null, text: "A customer changes plan twice in one month. Probably fine, same rule applies." },
      { blockId: "blk-late", itemId: null, itemType: null, text: "Annual plans too." },
    ];
    const input = { storyId: "bill-150", section: "Edge cases", lines: edge, actorId: "sam", now: NOW };
    expect(await saveSection(env.db, { ...input, confirmReopen: false })).toMatchObject({ status: "needs_confirmation", personIds: ["priya", "sam", "marcus"] });
    expect(await env.db.block.findUnique({ where: { id: "blk-late" } })).toBeNull();

    expect(await saveSection(env.db, { ...input, confirmReopen: true })).toEqual({ status: "saved", reopened: true });
    expect(await env.db.story.findUniqueOrThrow({ where: { id: "bill-150" } })).toMatchObject({ state: "in_refinement", signedOffBy: null });
    expect((await env.db.item.findUniqueOrThrow({ where: { id: "it-d1" } })).stanceRound).toBe(2);
    expect(await env.db.block.findUnique({ where: { id: "blk-late" } })).not.toBeNull();
  });

  it("a failed edit leaves the story as it was (reopen and edit are one transaction)", async () => {
    await env.db.story.update({ where: { id: "bill-150" }, data: { state: "ready", signedOffBy: "priya", signedOffAt: NOW } });
    // Make the block insert fail inside the database, after the reopen writes are queued.
    const sqlite = new Database(env.file);
    sqlite.exec("CREATE TRIGGER no_blocks BEFORE INSERT ON Block BEGIN SELECT RAISE(ABORT, 'refused'); END;");
    sqlite.close();
    const lines = [{ blockId: "blk-x", itemId: null, itemType: null, text: "A new line" }];
    await expect(saveSection(env.db, { storyId: "bill-150", section: "Edge cases", lines, actorId: "sam", confirmReopen: true, now: NOW })).rejects.toThrow();
    expect((await env.db.item.findUniqueOrThrow({ where: { id: "it-d1" } })).stanceRound).toBe(1);
    expect(await env.db.story.findUniqueOrThrow({ where: { id: "bill-150" } })).toMatchObject({ state: "ready", signedOffBy: "priya" });
  });

  it("marking a question blocking on a Ready story reopens it", async () => {
    await env.db.story.update({ where: { id: "bill-150" }, data: { state: "ready", signedOffBy: "priya", signedOffAt: NOW } });
    await setItemBlocking(env.db, "it-q1", false, "priya");
    await setItemBlocking(env.db, "it-q1", true, "priya");
    expect(await env.db.story.findUniqueOrThrow({ where: { id: "bill-150" } })).toMatchObject({ state: "in_refinement", signedOffBy: null });
  });

  it("refuses to block an archived item", async () => {
    await env.db.item.update({ where: { id: "it-q1" }, data: { status: "archived" } });
    await expect(setItemBlocking(env.db, "it-q1", true, "priya")).rejects.toThrow(/live/);
  });
});
