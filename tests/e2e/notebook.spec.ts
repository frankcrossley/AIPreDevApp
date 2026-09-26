// 02-notebook.feature
import { expect, test } from "@playwright/test";
import { db, line, newLine, openStory, resetDb, section, selectText, waitSaved } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

const examples = [
  { prefix: "decision:", type: "decision", text: "Downgrades apply from the next cycle.", panel: "decisions-needed" },
  { prefix: "?", type: "question", text: "What about downgrades", panel: "talking-points" },
  { prefix: "assume:", type: "assumption", text: "Most plan changes are upgrades.", panel: "talking-points" },
  { prefix: "risk:", type: "risk", text: "Customers downgrade for a week to save money.", panel: "talking-points" },
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
  await expect(page.getByTestId("talking-points")).toContainText("A customer changes plan twice in one month.");
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

test("Editing agreed content reopens it", async ({ page }) => {
  // Given the decision is agreed by Priya, Sam and Dan, and the story is signed off.
  await db.stance.deleteMany({ where: { itemId: "it-d1", personId: "marcus" } });
  await db.stance.create({ data: { id: "st-dan", itemId: "it-d1", personId: "dan", value: "agree", round: 1, createdAt: new Date() } });
  await db.item.update({ where: { id: "it-d1" }, data: { requiredStanceIdsJson: JSON.stringify(["priya", "sam", "dan"]) } });
  await db.story.update({ where: { id: "bill-150" }, data: { signedOffBy: "priya", signedOffAt: new Date() } });

  await openStory(page, "BILL-150");
  await page.getByLabel("Viewing as").selectOption({ label: "Dan" });
  await expect(page.getByLabel("Viewing as")).toHaveValue("dan");

  await line(page, "b4").locator("span.whitespace-pre-wrap").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Rounded to the day.");

  const warning = section(page, "What we think").getByTestId("reopen-warning");
  await expect(warning).toContainText("Priya, Sam and Dan agreed this. Saving reopens it for all three.");
  expect((await db.block.findUniqueOrThrow({ where: { id: "b4" } })).text).toBe("Upgrades apply immediately, charged by the day.");

  await warning.getByRole("button", { name: "Save and reopen" }).click();
  await waitSaved(page, "What we think");
  await expect(page.getByTestId("card-it-d1")).toContainText("Waiting on Priya, Sam, Dan");
  const story = await db.story.findUniqueOrThrow({ where: { id: "bill-150" } });
  expect(story.signedOffBy).toBeNull();
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
