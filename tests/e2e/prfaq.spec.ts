// 05-prfaq-alignment.feature, and the bolt 5 demo.
import { expect, test, type Page } from "@playwright/test";
import { db, resetDb } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

const openEpic = async (page: Page) => {
  await page.goto("/w/BILL-142");
  await expect(page.getByTestId("prfaq")).toBeVisible();
};
const viewAs = async (page: Page, name: string) => {
  await page.getByLabel("Viewing as").selectOption({ label: name });
  await expect(page.getByLabel("Viewing as")).toHaveValue(name === "Head of Product" ? "hop" : name.toLowerCase());
  await openEpic(page);
};

test("Customer FAQ answers link to the stories that deliver them", async ({ page }) => {
  await openEpic(page);
  const customer = page.getByTestId("prfaq-faq-customer");
  await expect(customer.getByTestId("faq-faq-1").getByTestId("faq-link-BILL-150")).toBeVisible();
  await expect(customer.getByTestId("faq-faq-2").getByTestId("faq-link-BILL-151")).toContainText("open");
  await customer.getByTestId("faq-link-BILL-150").click();
  await expect(page).toHaveURL(/\/w\/BILL-150$/);
});

test("The customer quote is real", async ({ page }) => {
  await openEpic(page);
  const quote = page.getByTestId("prfaq-quote");
  await expect(quote).toContainText("Only if we can see it in real time. We budget by department.");
  await expect(quote).toContainText("Discovery call · Acme Corp, 14:32");
  await expect(quote.locator("textarea, input")).toHaveCount(0);
  await quote.getByRole("button", { name: "Choose a different excerpt" }).click();
  await quote.getByLabel("Quotes from sources").selectOption("ex-acme-1240");
  await quote.getByRole("button", { name: "Use this quote" }).click();
  // Wait for the save itself: the chooser closes and the quote block shows the new excerpt.
  await expect(quote.getByLabel("Quotes from sources")).toHaveCount(0);
  await expect(quote.locator("blockquote")).toHaveText("“We upgraded on the 20th and paid the new price all month. Finance weren't happy.”");
  await expect(quote.locator("figcaption")).toContainText("12:40");
  expect((await db.prfaq.findUniqueOrThrow({ where: { id: "prfaq-142" } })).customerQuoteExcerptId).toBe("ex-acme-1240");
});

test("Read-backs are required from every member", async ({ page }) => {
  await openEpic(page);
  await viewAs(page, "Security");
  const prompt = page.getByTestId("readback-prompt");
  await expect(prompt).toContainText("What are we building, and why? One line, in your own words.");
  await prompt.getByLabel(/What are we building/).fill("Usage pricing that stores no new personal data.");
  await prompt.getByRole("button", { name: "Save read-back" }).click();
  await expect(page.getByTestId("readback-security")).toContainText("Usage pricing that stores no new personal data.");
});

test("Divergent read-backs are flagged, and can be talked through", async ({ page }) => {
  await openEpic(page);
  const dan = page.getByTestId("readback-dan");
  await expect(dan).toContainText("Diverges");
  await expect(dan).toContainText("The PRFAQ bills monthly and shows usage hourly.");
  await dan.getByRole("button", { name: "Talk it through" }).click();
  await expect(dan.getByRole("button", { name: /^On the .* agenda$/ })).toBeDisabled();
  expect(JSON.parse((await db.session.findUniqueOrThrow({ where: { id: "sess-1" } })).agendaJson)).toEqual(["rb-bill-142-dan"]);
});

test("Pasting the headline doesn't count", async ({ page }) => {
  await openEpic(page);
  await viewAs(page, "Security");
  const prompt = page.getByTestId("readback-prompt");
  await prompt.getByLabel(/What are we building/).fill("API customers now pay for what they use, and can see it as they go");
  await prompt.getByRole("button", { name: "Save read-back" }).click();
  await expect(page.getByTestId("readback-security")).toContainText("Too close to the page");
  await expect(page.getByTestId("readback-security")).toContainText("say it in your own words");
  // The form stays open with the reason, so it can be reworded.
  await expect(page.getByTestId("readback-prompt")).toContainText("Too close to the page, say it in your own words.");
});

test("Move a story with no promise to its own epic, or drop it", async ({ page }) => {
  await openEpic(page);
  await page.getByTestId("unpromised-BILL-163").getByRole("button", { name: "Move to its own epic" }).click();
  await expect(page.getByTestId("backlog-BILL-164")).toContainText("Invoices grouped by project");
  await expect(page.getByTestId("unpromised-BILL-163")).toHaveCount(0);
  await page.getByTestId("backlog-BILL-164").click();
  await expect(page.getByTestId("prfaq").getByRole("heading", { level: 1 })).toHaveText("Invoices grouped by project");

  await resetDb();
  await openEpic(page);
  await page.getByTestId("unpromised-BILL-163").getByRole("button", { name: "Drop it" }).click();
  await expect(page.getByTestId("backlog-BILL-163")).toHaveCount(0);
  expect((await db.story.findUniqueOrThrow({ where: { id: "bill-163" } })).archivedAt).not.toBeNull();
});

test("Stories that serve no promise are flagged", async ({ page }) => {
  await openEpic(page);
  const row = page.getByTestId("unpromised-BILL-163");
  for (const name of ["Add a promise", "Move to its own epic", "Drop it"]) await expect(row.getByRole("button", { name })).toBeEnabled();
  await row.getByRole("button", { name: "Add a promise" }).click();
  await row.getByLabel("The promise BILL-163 serves").fill("Your invoice matches how you budget");
  await row.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("unpromised-BILL-163")).toHaveCount(0);
  await expect(page.getByTestId("prfaq-promises")).toContainText("Your invoice matches how you budget");
  await expect(page.getByTestId("backlog-BILL-163").getByTestId("flag-not_in_prfaq")).toHaveCount(0);
});

test("The PRFAQ can't be agreed early", async ({ page }) => {
  await openEpic(page);
  await expect(page.getByTestId("agree-prfaq")).toBeDisabled();
  const reasons = page.getByTestId("agree-reasons");
  await expect(reasons).toContainText("Dan's read-back diverges");
  await expect(reasons).toContainText("Blocking FAQ unanswered");
  await page.getByTestId("backlog-BILL-150").click();
  await expect(page.getByTestId("meter-Right thing").getByTestId("meter-count")).toHaveText("4 of 5");
});

test("Demo: fix the flat-fee FAQ, realign, agree, and BILL-150's Right thing passes", async ({ page }) => {
  await openEpic(page);
  // Priya answers the flat-fee question in the internal FAQ.
  const faq4 = page.getByTestId("faq-faq-4");
  await faq4.getByRole("button", { name: "Edit" }).click();
  await faq4.getByLabel("Answer", { exact: true }).fill("They keep today's fee, capped, for 18 months, then choose.");
  await faq4.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("faq-faq-4")).toContainText("They keep today's fee");
  await expect(page.getByTestId("evidence-against")).toContainText("The internal FAQ answers it.");

  // Dan realigns; Security reads back.
  for (const [who, text] of [
    ["Dan", "Monthly usage billing, with live usage visible so customers can budget."],
    ["Security", "Usage pricing that stores no new personal data."],
  ]) {
    await viewAs(page, who);
    const prompt = page.getByTestId("readback-prompt").or(page.getByRole("button", { name: "Rewrite your read-back" }));
    if (await page.getByRole("button", { name: "Rewrite your read-back" }).isVisible()) await page.getByRole("button", { name: "Rewrite your read-back" }).click();
    await expect(prompt.first()).toBeVisible();
    await page.getByTestId("readback-prompt").getByLabel(/What are we building/).fill(text);
    await page.getByTestId("readback-prompt").getByRole("button", { name: "Save read-back" }).click();
    await expect(page.getByTestId(`readback-${who.toLowerCase()}`)).toContainText("Matches");
  }

  // Priya agrees, and the story's Right thing passes.
  await viewAs(page, "Priya");
  await page.getByTestId("agree-prfaq").click();
  await expect(page.getByTestId("state-pill")).toHaveText("Agreed");
  await page.getByTestId("backlog-BILL-150").click();
  await expect(page.getByTestId("meter-Right thing").getByTestId("meter-count")).toHaveText("5 of 5");
});
