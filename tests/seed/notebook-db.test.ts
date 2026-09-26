// Notebook saves against a real database: autosave, the held edit to agreed content, and reopening.
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

  it("creates a draft story from selected text", async () => {
    expect(await createDraftStory(env.db, { epicId: "bill-142", title: "Downgrade rules", actorId: "marcus" })).toEqual({ id: "bill-164", key: "BILL-164" });
    expect(await env.db.story.findUniqueOrThrow({ where: { id: "bill-164" } })).toMatchObject({ state: "draft", leadId: "marcus", templateId: "tpl-story" });
  });
});
