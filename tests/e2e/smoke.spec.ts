import { expect, test } from "@playwright/test";
import { resetDb } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("the backlog shows BILL-150's computed meters", async ({ page }) => {
  await page.goto("/");
  const row = page.getByTestId("backlog-BILL-150");
  await expect(row).toContainText("Plan changes mid-cycle");
  await expect(row).toContainText("Right 4/5");
  await expect(row).toContainText("Built 5/8");
});
