// 01-workspace.feature
import { expect, test } from "@playwright/test";
import { db, newLine, openStory, resetDb, waitSaved } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("Selecting a story keeps the user on the same screen", async ({ page }) => {
  await page.goto("/w/BILL-142");
  await page.getByTestId("backlog").evaluate((el) => (el.dataset.marker = "same-layout"));
  await page.getByTestId("backlog-BILL-150").click();

  await expect(page).toHaveURL(/\/w\/BILL-150$/);
  await expect(page.getByTestId("story-title")).toHaveText("Plan changes mid-cycle");
  for (const name of ["What we heard", "What we think", "Edge cases"]) {
    await expect(page.getByTestId(`section-${name}`)).toBeVisible();
  }
  await expect(page.locator("#block-b1")).toContainText("Acme upgraded on the 20th");
  await expect(page.getByRole("tab", { name: "For this item · 2" })).toHaveAttribute("aria-selected", "true");
  // The URL changed but the layout didn't: the left column is the same element.
  await expect(page.getByTestId("backlog")).toHaveAttribute("data-marker", "same-layout");
});

test("Selecting an epic swaps the centre and right panel contents", async ({ page }) => {
  await openStory(page, "BILL-150");
  await page.getByTestId("backlog-BILL-142").click();
  await expect(page.getByTestId("prfaq").getByRole("heading", { level: 1 })).toHaveText(
    "API customers now pay for what they use, and can see it as they go",
  );
  await expect(page.getByRole("tab", { name: "Alignment" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("readback-dan")).toContainText("Diverges");
});

test("Backlog rows show state at a glance", async ({ page }) => {
  await openStory(page, "BILL-150");
  const expected: Record<string, [string, string, string]> = {
    "BILL-150": ["In refinement", "Right 4/5", "Built 5/8"],
    "BILL-151": ["In refinement", "Right 3/5", "Built 5/8"],
    "BILL-152": ["Ready", "Right 3/5", "Built 7/8"],
    "BILL-160": ["Draft", "Right 3/5", "Built 5/8"],
    "BILL-163": ["Triaged", "Right 2/5", "Built 5/8"],
  };
  for (const [key, [state, right, built]] of Object.entries(expected)) {
    const row = page.getByTestId(`backlog-${key}`);
    await expect(row.getByTestId("row-state")).toHaveText(state);
    await expect(row).toContainText(right);
    await expect(row).toContainText(built);
  }
  await expect(page.getByTestId("backlog-BILL-163").getByTestId("flag-not_in_prfaq")).toHaveText("Not in the PRFAQ");
  await expect(page.getByTestId("backlog-BILL-152").getByTestId("row-state")).toHaveText("Ready");
});

test("Switching who I'm acting as", async ({ page }) => {
  await openStory(page, "BILL-150");
  await page.getByLabel("Viewing as").selectOption({ label: "Marcus" });
  await expect(page.getByLabel("Viewing as")).toHaveValue("marcus");
  await page.reload();
  await expect(page.getByLabel("Viewing as")).toHaveValue("marcus");

  await newLine(page, "Edge cases");
  await page.keyboard.type("Annual plans renew mid-cycle too.");
  await waitSaved(page, "Edge cases");

  const block = await db.block.findFirstOrThrow({ where: { text: "Annual plans renew mid-cycle too." } });
  expect(block.authorId).toBe("marcus");
  const event = await db.event.findFirstOrThrow({ where: { type: "block.created" } });
  expect(event.actorId).toBe("marcus");
});
