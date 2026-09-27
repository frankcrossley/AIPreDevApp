// 03-right-panel.feature
import { expect, test } from "@playwright/test";
import { db, line, newLine, openStory, resetDb } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("The panel is ranked, and empty sections are hidden", async ({ page }) => {
  await openStory(page, "BILL-150");
  const panel = page.getByTestId("right-panel");
  const headings = panel.locator("[data-testid=scrum-master] h3, [data-testid^=panel-] > h3");
  await expect(headings).toHaveText([/Scrum Master/, /Decisions needed · 3/, /Talking points · 4/, /From discovery · 2/]);
  await expect(page.getByTestId("scrum-master")).toContainText("Two decisions and one answer stand between this and Ready.");

  // Clear discovery: reject the quote, and uncite the survey theme.
  await db.draft.update({ where: { id: "dr3" }, data: { status: "rejected" } });
  await db.citation.deleteMany({ where: { toId: "ex-survey-overcharged" } });
  await openStory(page, "BILL-150");
  await expect(page.getByTestId("panel-discovery")).toHaveCount(0);
  await expect(page.getByTestId("panel-talking")).toBeVisible();
});

test("Drafts from outside a session are time-bound", async ({ page }) => {
  await openStory(page, "BILL-150");
  const card = page.getByTestId("card-dr2");
  await expect(card).toContainText("Should the invoice explain the proration?");
  await expect(card.getByTestId("card-detail")).toHaveText("Mei · draft · expires in 2 days");
  await expect(card).toHaveClass(/border-dashed/);
});

test("Only the lead can triage", async ({ page }) => {
  await openStory(page, "BILL-150");
  await page.getByLabel("Viewing as").selectOption({ label: "Sam" });
  await expect(page.getByLabel("Viewing as")).toHaveValue("sam");
  await openStory(page, "BILL-150");
  const card = page.getByTestId("card-dr1");
  for (const name of ["Accept", "Merge", "Reject"]) {
    await expect(card.getByRole("button", { name, exact: true })).toBeDisabled();
  }
  await expect(card.getByTestId("disabled-reason")).toHaveText("Priya is the lead");

  const agreedBefore = await db.block.findMany({ where: { parentId: "bill-150" } });
  await page.getByLabel("Viewing as").selectOption({ label: "Priya" });
  await expect(page.getByLabel("Viewing as")).toHaveValue("priya");
  await openStory(page, "BILL-150");
  await page.getByTestId("card-dr1").getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByTestId("card-dr1")).toHaveCount(0);
  const text = "Downgrades should apply at the next cycle, not immediately. Customers game it otherwise.";
  await expect(page.getByTestId("section-What we think")).toContainText(text);
  const block = await db.block.findFirstOrThrow({ where: { text } });
  expect(block.authorId).toBe("marcus");
  expect(await db.item.count({ where: { blockId: block.id } })).toBe(0); // unagreed plain line
  for (const b of agreedBefore) expect(await db.block.findUniqueOrThrow({ where: { id: b.id } })).toEqual(b);
});

test("A draft that passes its expiry leaves the panel on the next load", async ({ page }) => {
  await openStory(page, "BILL-150");
  await expect(page.getByTestId("card-dr2")).toBeVisible();
  await db.draft.update({ where: { id: "dr2" }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  await openStory(page, "BILL-150");
  await expect(page.getByTestId("card-dr2")).toHaveCount(0);
  expect((await db.draft.findUniqueOrThrow({ where: { id: "dr2" } })).status).toBe("expired");
  await page.getByRole("tab", { name: "Activity" }).click();
  await expect(page.getByTestId("expired-dr2")).toContainText("Should the invoice explain the proration?");
});

test("Expired drafts are archived, not deleted", async ({ page }) => {
  await openStory(page, "BILL-150");
  await expect(page.getByTestId("card-dr6")).toHaveCount(0);
  await page.getByRole("tab", { name: "Activity" }).click();
  const expired = page.getByTestId("expired-dr6");
  await expect(expired).toContainText("Proration should round to the hour.");
  await expired.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("tab", { name: /For this item/ }).click();
  await expect(page.getByTestId("card-dr6")).toContainText("Proration should round to the hour.");
});

test("Product hat suggests a better home", async ({ page }) => {
  await openStory(page, "BILL-150");
  const card = page.getByTestId("card-dr3");
  await expect(card).toContainText('"We budget by department."');
  await expect(card.getByTestId("card-hint")).toContainText("PM · Fits BILL-160 better.");
  await card.getByRole("button", { name: "Move it there" }).click();
  await expect(page.getByTestId("card-dr3")).toHaveCount(0);

  await page.getByTestId("backlog-BILL-160").click();
  await expect(page.getByTestId("card-dr3")).toContainText('"We budget by department."');
});

test("Demo: suggest, then the lead accepts from the notebook", async ({ page }) => {
  await openStory(page, "BILL-150");
  await page.getByLabel("Viewing as").selectOption({ label: "Marcus" });
  await expect(page.getByLabel("Viewing as")).toHaveValue("marcus");
  await openStory(page, "BILL-150");
  await newLine(page, "Edge cases");
  await page.keyboard.type("Annual plans renew mid-cycle too.");
  await expect(page.getByTestId("section-Edge cases").getByTestId("save-state")).toHaveText("Suggested · Priya reviews", { timeout: 10_000 });
  await openStory(page, "BILL-150");
  const own = page.getByTestId("section-Edge cases").getByTestId("own-suggestion");
  await expect(own).toContainText(/Your suggestion · expires in \d+ days/);
  // Drawn dashed: it's only a suggestion until the lead accepts it.
  await expect(page.getByTestId("section-Edge cases").getByTestId("line").last()).toHaveClass(/border-dashed/);

  await page.getByLabel("Viewing as").selectOption({ label: "Priya" });
  await expect(page.getByLabel("Viewing as")).toHaveValue("priya");
  await openStory(page, "BILL-150");
  const suggestion = line(page, "b7").locator('[data-testid^="suggestion-"]');
  await expect(suggestion).toContainText("Suggested by Marcus");
  await suggestion.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByTestId("section-Edge cases").getByTestId("line")).toHaveCount(3);
  await expect(page.getByTestId("section-Edge cases")).toContainText("Annual plans renew mid-cycle too.");
});
