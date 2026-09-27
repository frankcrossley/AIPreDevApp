// 04-checks.feature, all scenarios, and the bolt 4 demo.
import { expect, test, type Page } from "@playwright/test";
import { db, line, openStory, resetDb } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

const viewAs = async (page: Page, name: string) => {
  await page.getByLabel("Viewing as").selectOption({ label: name });
  await expect(page.getByLabel("Viewing as")).toHaveValue(name.toLowerCase());
  await openStory(page, "BILL-150");
};

/** Everything but what the demo does in the UI: the PRFAQ is agreed (bolt 5). */
const agreePrfaq = () => db.prfaq.update({ where: { id: "prfaq-142" }, data: { state: "agreed" } });

/** The rest of what "all checks pass" needs, done straight in the database. */
async function makeEverythingPass() {
  await agreePrfaq();
  await db.item.update({ where: { id: "it-q1" }, data: { status: "resolved" } });
  await db.stance.create({ data: { id: "st-dan", itemId: "it-d1", personId: "dan", value: "agree", round: 1, createdAt: new Date() } });
  await db.hatNote.update({ where: { id: "hn3" }, data: { status: "accepted" } });
}

test("Meters reflect computed results", async ({ page }) => {
  await openStory(page, "BILL-150");
  await expect(page.getByTestId("meter-Right thing").getByTestId("meter-count")).toHaveText("4 of 5");
  await expect(page.getByTestId("meter-Built right").getByTestId("meter-count")).toHaveText("5 of 8");
  await page.getByTestId("meter-Right thing").click();
  const view = page.getByTestId("checks-view");
  await expect(view.getByTestId("check-team_aligned")).toContainText("Team aligned on the PRFAQ · read-backs 4 of 6, Dan diverges");
  await expect(view.getByTestId("check-team_aligned").getByLabel("fails")).toBeVisible();
  await expect(view.getByTestId("check-serves_promise").getByLabel("passes")).toBeVisible();
});

test("Every failing line links to its fix", async ({ page }) => {
  await openStory(page, "BILL-150");
  await page.getByTestId("meter-Built right").click();
  await page.getByRole("link", { name: "No blocking questions · downgrade mid-cycle" }).click();
  await expect(line(page, "b6")).toHaveAttribute("data-highlighted", "true");
  // PRFAQ and read-backs link to the epic, in the same workspace.
  await page.getByRole("link", { name: /Team aligned on the PRFAQ/ }).click();
  await expect(page).toHaveURL(/\/w\/BILL-142$/);
});

test("Floor checks can't be removed", async ({ page }) => {
  await openStory(page, "BILL-150");
  await page.getByRole("tab", { name: "Details" }).click();
  const editor = page.getByTestId("template-editor");
  await editor.getByRole("button", { name: "Edit checks" }).click();
  for (const label of ["No blocking questions", "Stances complete", "Claims sourced", "Criteria traced", "Serves a promise", "Team aligned on the PRFAQ"]) {
    const box = editor.getByRole("checkbox", { name: label });
    await expect(box).toBeChecked();
    await expect(box).toBeDisabled();
  }
  await expect(editor).toContainText("Floor · can't be removed");
  const estimated = editor.getByRole("checkbox", { name: "Estimated" });
  await expect(estimated).toBeEnabled();
  await estimated.uncheck();
  await editor.getByRole("button", { name: "Save checks" }).click();
  await expect(page.getByTestId("meter-Built right").getByTestId("meter-count")).toHaveText("4 of 7");
  // And add it back.
  await editor.getByRole("checkbox", { name: "Estimated" }).check();
  await editor.getByRole("button", { name: "Save checks" }).click();
  await expect(page.getByTestId("meter-Built right").getByTestId("meter-count")).toHaveText("5 of 8");
});

test("Ready needs both checks and the lead", async ({ page }) => {
  await makeEverythingPass();
  await openStory(page, "BILL-150");
  await viewAs(page, "Sam");
  await page.getByTestId("meter-Built right").click();
  await expect(page.getByTestId("sign-off")).toBeDisabled();
  await expect(page.getByTestId("sign-off-why")).toHaveText("Priya is the lead");

  await viewAs(page, "Priya");
  await page.getByTestId("meter-Built right").click();
  await expect(page.getByTestId("sign-off")).toBeEnabled();
  await page.getByTestId("sign-off").click();
  await expect(page.getByTestId("state-pill")).toHaveText("Ready");
  expect(await db.story.findUniqueOrThrow({ where: { id: "bill-150" } })).toMatchObject({ state: "ready", signedOffBy: "priya" });
});

test("There is no way to force Ready: the sign-off route", async ({ request }) => {
  const post = (who: string) => request.post("/api/stories/BILL-150/sign-off", { headers: { cookie: `viewing-as=${who}` } });

  let r = await post("priya");
  expect(r.status()).toBe(409);
  expect((await r.json()).reasons.join(" ")).toMatch(/team_aligned/);

  await makeEverythingPass();
  r = await post("sam");
  expect(r.status()).toBe(403);
  expect(await r.json()).toEqual({ reasons: ["Priya is the lead"] });
  expect((await db.story.findUniqueOrThrow({ where: { id: "bill-150" } })).state).toBe("in_refinement");

  r = await post("priya");
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({ key: "BILL-150", state: "ready", signedOffBy: "priya" });

  // Signing off again is refused; there's nothing to force.
  expect((await post("priya")).status()).toBe(409);
});

test("Demo: from 5 of 8 to Ready in the interface", async ({ page }) => {
  await agreePrfaq();
  await openStory(page, "BILL-150");
  await expect(page.getByTestId("meter-Built right").getByTestId("meter-count")).toHaveText("5 of 8");

  // Priya answers the downgrade question.
  const q = page.getByTestId("card-it-q1");
  await q.getByRole("button", { name: "Answer", exact: true }).click();
  await q.getByLabel(/Your answer/).fill("Downgrades apply from the next billing cycle.");
  await q.getByRole("button", { name: "Save answer" }).click();
  await expect(page.getByTestId("meter-Built right").getByTestId("meter-count")).toHaveText("6 of 8");
  await expect(page.getByTestId("section-Edge cases")).toContainText("Downgrades apply from the next billing cycle.");

  // Dan gives his stance.
  await viewAs(page, "Dan");
  const decision = page.getByTestId("card-it-d1");
  await decision.getByRole("button", { name: "Agree", exact: true }).click();
  await expect(page.getByTestId("meter-Built right").getByTestId("meter-count")).toHaveText("7 of 8");

  // Priya answers the Architect.
  await viewAs(page, "Priya");
  const arch = page.getByTestId("card-hn3");
  await arch.getByRole("button", { name: "Answer", exact: true }).click();
  await arch.getByLabel(/Your answer/).fill("New event: metering publishes plan.changed; billing consumes it. No exception to ADR-022.");
  await arch.getByRole("button", { name: "Save answer" }).click();
  await expect(page.getByTestId("meter-Built right").getByTestId("meter-count")).toHaveText("8 of 8");
  await expect(page.getByTestId("meter-Right thing").getByTestId("meter-count")).toHaveText("5 of 5");

  await page.getByTestId("meter-Built right").click();
  await page.getByTestId("sign-off").click();
  await expect(page.getByTestId("state-pill")).toHaveText("Ready");
  await expect(page.getByTestId("backlog-BILL-150").getByTestId("row-state")).toHaveText("Ready");
});

test("An objection needs a reason, and only people asked can take a stance", async ({ page }) => {
  await openStory(page, "BILL-150");
  await viewAs(page, "Mei");
  await expect(page.getByTestId("card-it-d1").getByRole("button", { name: "Object" })).toBeDisabled();

  await viewAs(page, "Dan");
  const card = page.getByTestId("card-it-d1");
  await card.getByRole("button", { name: "Object", exact: true }).click();
  const submit = card.locator("form").getByRole("button", { name: "Object" });
  await expect(submit).toBeDisabled();
  await card.getByLabel(/Why do you object/).fill("Needs a new metering event first.");
  await submit.click();
  await expect(card.getByTestId("stance-dan")).toHaveText("Dan · Object");
  await page.getByTestId("meter-Built right").click();
  await expect(page.getByTestId("check-no_unresolved_conflicts")).toContainText("No unresolved conflicts · Dan");
});

test("BILL-152 shows that its checks changed since sign-off", async ({ page }) => {
  await openStory(page, "BILL-152");
  await expect(page.getByTestId("state-pill")).toHaveText("Ready · checks changed");
  await expect(page.getByTestId("drift")).toContainText("Backed by evidence, Team aligned on the PRFAQ, Criteria traced");
});
