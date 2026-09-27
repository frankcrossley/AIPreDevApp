// 02-notebook.feature
import { expect, test } from "@playwright/test";
import { db, line, newLine, openStory, resetDb, section, selectText, waitSaved } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

const examples = [
  { prefix: "decision:", type: "decision", text: "Downgrades apply from the next cycle.", panel: "panel-decisions" },
  { prefix: "?", type: "question", text: "What about downgrades", panel: "panel-talking" },
  { prefix: "assume:", type: "assumption", text: "Most plan changes are upgrades.", panel: "panel-talking" },
  { prefix: "risk:", type: "risk", text: "Customers downgrade for a week to save money.", panel: "panel-talking" },
];

for (const ex of examples) {
  test(`A prefix turns a line into an item chip: ${ex.prefix}`, async ({ page }) => {
    await openStory(page, "BILL-150");
    await newLine(page, "Edge cases");
    await page.keyboard.type(`${ex.prefix} ${ex.text}`);

    const newest = section(page, "Edge cases").getByTestId("line").last();
    await expect(newest.getByTestId("chip")).toHaveAttribute("data-chip-type", ex.type);
    await expect(newest).toContainText(ex.text);
    await expect(newest).not.toContainText(ex.prefix === "?" ? "? " : ex.prefix);
    await waitSaved(page, "Edge cases");
    await expect(page.getByTestId(ex.panel)).toContainText(ex.text);
  });
}

test("Selecting text offers Turn into", async ({ page }) => {
  await openStory(page, "BILL-150");
  await selectText(line(page, "b7"), "A customer changes plan twice in one month.");
  const toolbar = page.getByRole("toolbar", { name: "Turn into" });
  for (const option of ["Decision", "Question", "Assumption", "Risk", "Story"]) {
    await expect(toolbar.getByRole("button", { name: option, exact: true })).toBeVisible();
  }
  await toolbar.getByRole("button", { name: "Risk", exact: true }).click();
  await expect(line(page, "b7").getByTestId("chip")).toHaveAttribute("data-chip-type", "risk");
  await waitSaved(page, "Edge cases");
  await expect(page.getByTestId("panel-talking")).toContainText("A customer changes plan twice in one month.");
  const item = await db.item.findFirstOrThrow({ where: { blockId: "b7", status: "open" } });
  expect(item).toMatchObject({ type: "risk", text: "A customer changes plan twice in one month." });

  await selectText(line(page, "b5"), "both the plan and the invoice line");
  await page.getByRole("toolbar", { name: "Turn into" }).getByRole("button", { name: "Story", exact: true }).click();
  await expect(page.getByText("Created BILL-164 as a draft story.")).toBeVisible();
  await expect(page.getByTestId("backlog-BILL-164")).toContainText("both the plan and the invoice line");
});

test("Structure can be removed", async ({ page }) => {
  await openStory(page, "BILL-150");
  await line(page, "b6").getByTestId("chip").click();
  await page.getByRole("menuitem", { name: "Turn back into plain text" }).click();

  await expect(line(page, "b6").getByTestId("chip")).toHaveCount(0);
  await expect(line(page, "b6")).toContainText("What happens on a downgrade mid-cycle?");
  await waitSaved(page, "Edge cases");
  await expect(page.getByTestId("card-it-q1")).toHaveCount(0);
  const item = await db.item.findUniqueOrThrow({ where: { id: "it-q1" } });
  expect(item.status).toBe("archived");
  expect(await db.event.count({ where: { type: "item.archived" } })).toBe(1);
});

test("Questions can be marked blocking", async ({ page }) => {
  await openStory(page, "BILL-150");
  const chip = line(page, "b6").getByTestId("chip");
  await chip.click();
  await page.getByRole("menuitem", { name: "Not blocking" }).click();
  await expect(chip).toHaveText("Question");
  await expect(page.getByTestId("meter-Built right").getByTestId("meter-count")).toHaveText("6 of 8");

  await chip.click();
  await page.getByRole("menuitem", { name: "Mark as blocking" }).click();
  await expect(chip).toHaveText("Blocking");
  await expect(page.getByTestId("meter-Built right").getByTestId("meter-count")).toHaveText("5 of 8");

  await page.getByTestId("meter-Built right").click();
  await page.getByTestId("check-no_blocking_questions").getByRole("link").click();
  await expect(line(page, "b6")).toHaveAttribute("data-highlighted", "true");
});

test("Editing agreed content reopens it (Dan suggests, Priya accepts)", async ({ page }) => {
  // Given the decision is agreed by Priya, Sam and Dan, and Priya has signed the story off as Ready.
  await db.stance.deleteMany({ where: { itemId: "it-d1", personId: "marcus" } });
  await db.stance.create({ data: { id: "st-dan", itemId: "it-d1", personId: "dan", value: "agree", round: 1, createdAt: new Date() } });
  await db.item.update({ where: { id: "it-d1" }, data: { requiredStanceIdsJson: JSON.stringify(["priya", "sam", "dan"]) } });
  await db.story.update({ where: { id: "bill-150" }, data: { state: "ready", signedOffBy: "priya", signedOffAt: new Date() } });

  // When Dan edits its text, it becomes a suggestion; nothing agreed changes yet.
  await openStory(page, "BILL-150");
  await page.getByLabel("Viewing as").selectOption({ label: "Dan" });
  await expect(page.getByLabel("Viewing as")).toHaveValue("dan");
  await openStory(page, "BILL-150");
  await line(page, "b4").locator("span.whitespace-pre-wrap").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Rounded to the day.");
  await expect(section(page, "What we think").getByTestId("save-state")).toHaveText("Suggested · Priya reviews", { timeout: 10_000 });
  expect((await db.block.findUniqueOrThrow({ where: { id: "b4" } })).text).toBe("Upgrades apply immediately, charged by the day.");
  expect((await db.story.findUniqueOrThrow({ where: { id: "bill-150" } })).state).toBe("ready");

  // Priya sees it under the line, and accepting it warns her first.
  await page.getByLabel("Viewing as").selectOption({ label: "Priya" });
  await expect(page.getByLabel("Viewing as")).toHaveValue("priya");
  await openStory(page, "BILL-150");
  const suggestion = line(page, "b4").locator('[data-testid^="suggestion-"]');
  await expect(suggestion).toContainText("Suggested by Dan");
  await expect(suggestion).toContainText("Change to: Upgrades apply immediately, charged by the day. Rounded to the day.");
  await suggestion.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(suggestion.getByTestId("accept-warning")).toContainText("Priya, Sam and Dan agreed this. Accepting reopens it for all three.");
  await suggestion.getByRole("button", { name: "Accept and reopen" }).click();

  await expect(line(page, "b4")).toContainText("Rounded to the day.");
  await expect(page.getByTestId("state-pill")).toHaveText("In refinement");
  await expect(page.getByTestId("card-it-d1")).toContainText("Waiting on Priya, Sam, Dan");
  expect(await db.story.findUniqueOrThrow({ where: { id: "bill-150" } })).toMatchObject({ state: "in_refinement", signedOffBy: null });
  expect((await db.item.findUniqueOrThrow({ where: { id: "it-d1" } })).stanceRound).toBe(2);
});

test("Undo my edit leaves agreed content untouched", async ({ page }) => {
  await openStory(page, "BILL-150");
  await line(page, "b4").locator("span.whitespace-pre-wrap").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Maybe.");
  const warning = section(page, "What we think").getByTestId("reopen-warning");
  await expect(warning).toContainText("Priya, Sam and Marcus agreed this.");
  await warning.getByRole("button", { name: "Undo my edit" }).click();
  await expect(line(page, "b4")).toHaveText(/Upgrades apply immediately, charged by the day\./);
  await expect(line(page, "b4")).not.toContainText("Maybe.");
  expect((await db.item.findUniqueOrThrow({ where: { id: "it-d1" } })).stanceRound).toBe(1);
});

test("Adding a line to a Ready story reopens it too", async ({ page }) => {
  await db.story.update({ where: { id: "bill-150" }, data: { state: "ready", signedOffBy: "priya", signedOffAt: new Date() } });
  await openStory(page, "BILL-150");
  await newLine(page, "Edge cases");
  await page.keyboard.type("Annual plans renew mid-cycle too.");
  const warning = section(page, "Edge cases").getByTestId("reopen-warning");
  await expect(warning).toContainText("Priya, Sam and Marcus agreed this. Saving reopens it for all three.");
  await warning.getByRole("button", { name: "Save and reopen" }).click();
  await waitSaved(page, "Edge cases");
  await expect(page.getByTestId("state-pill")).toHaveText("In refinement");
  expect((await db.item.findUniqueOrThrow({ where: { id: "it-d1" } })).stanceRound).toBe(2);
});

test("A prefix can be escaped: pasted text stays plain, and Backspace undoes a typed chip", async ({ page }) => {
  await openStory(page, "BILL-150");
  await newLine(page, "Edge cases");
  await page.keyboard.type("risk: ");
  const newest = section(page, "Edge cases").getByTestId("line").last();
  await expect(newest.getByTestId("chip")).toHaveAttribute("data-chip-type", "risk");
  await page.keyboard.press("Backspace");
  await expect(newest.getByTestId("chip")).toHaveCount(0);
  await expect(newest).toContainText("risk:");
  await page.keyboard.type("is our word for a failed invoice run");
  await waitSaved(page, "Edge cases");
  const block = await db.block.findFirstOrThrow({ where: { text: { startsWith: "risk:" } } });
  expect(await db.item.count({ where: { blockId: block.id, status: "open" } })).toBe(0);

  // Pasting a prefixed line doesn't make a chip either.
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("decision: pasted, not typed");
  await waitSaved(page, "Edge cases");
  await expect(section(page, "Edge cases").getByTestId("line").last().getByTestId("chip")).toHaveCount(0);
});

test("Deleting a line others cite shows what depends on it, then asks them to realign", async ({ page }) => {
  await openStory(page, "BILL-150");
  // Clear line b4, which b5 and a criterion cite.
  await selectText(line(page, "b4"), "Upgrades apply immediately, charged by the day.");
  await page.keyboard.press("Backspace");
  await expect(line(page, "b4")).toHaveCount(1);
  const warning = section(page, "What we think").getByTestId("reopen-warning");
  await expect(warning).toContainText('2 things cite "Upgrades apply immediately, charged by the day."');
  await expect(warning).toContainText('"Immediately means both the plan and the…"');
  await warning.getByRole("button", { name: "Save and reopen" }).click();
  await waitSaved(page, "What we think");
  await expect(page.getByTestId("panel-talking")).toContainText('Realign: "Immediately means both the plan and the invoice line." lost its source');
  expect(await db.citation.count({ where: { toId: "b4" } })).toBe(0);
});
