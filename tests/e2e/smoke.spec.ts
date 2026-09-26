import { expect, test } from "@playwright/test";

test("the backlog shows BILL-150's computed meters", async ({ page }) => {
  await page.goto("/");
  const row = page.getByTestId("story-BILL-150");
  await expect(row).toContainText("Plan changes mid-cycle");
  await expect(row.getByTestId("right-thing")).toHaveText("4 of 5");
  await expect(row.getByTestId("built-right")).toHaveText("5 of 8");
});
