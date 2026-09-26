// E2E helpers: every test starts from the seed, in the database the dev server uses.
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { normaliseSeed } from "../../src/seed/normalise";
import { createPrisma } from "../../src/server/prisma";
import { writeSnapshot } from "../../prisma/write-snapshot";

export const E2E_DATABASE_URL = "file:./prisma/e2e.db";
export const db = createPrisma(E2E_DATABASE_URL);

export async function resetDb() {
  await db.$transaction([
    db.event.deleteMany(), db.setting.deleteMany(), db.session.deleteMany(), db.readBack.deleteMany(),
    db.faqEntry.deleteMany(), db.prfaqPromise.deleteMany(), db.prfaq.deleteMany(), db.criterion.deleteMany(),
    db.hatNote.deleteMany(), db.draft.deleteMany(), db.citation.deleteMany(), db.excerpt.deleteMany(),
    db.source.deleteMany(), db.stance.deleteMany(), db.item.deleteMany(), db.block.deleteMany(),
    db.story.deleteMany(), db.epic.deleteMany(), db.template.deleteMany(), db.person.deleteMany(),
  ]);
  const seed = JSON.parse(readFileSync(new URL("../../seed/seed.json", import.meta.url), "utf8"));
  const { snapshot, settings } = normaliseSeed(seed, new Date());
  await writeSnapshot(db, snapshot, settings);
}

export const section = (page: Page, name: string) => page.getByTestId(`section-${name}`);
export const editorIn = (page: Page, name: string) => section(page, name).locator(".ProseMirror");

/** Puts the caret at the end of a section and starts a new line. */
export async function newLine(page: Page, name: string) {
  await expect(section(page, name)).toHaveAttribute("data-ready", "true");
  const last = editorIn(page, name).getByTestId("line").last();
  const lastId = await last.getAttribute("data-block-id");
  await last.locator("span.whitespace-pre-wrap").click();
  // The caret must be in the line we clicked before we type.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const node = window.getSelection()?.anchorNode;
        const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null);
        return el?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null;
      }),
    )
    .toBe(lastId);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
}

export async function waitSaved(page: Page, name: string) {
  await expect(section(page, name).getByTestId("save-state")).toHaveText("Saved", { timeout: 10_000 });
}

/** Selects some text inside a line, the way a person would with the mouse. */
export async function selectText(line: Locator, text: string) {
  await line.evaluate((el, t) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const i = node.textContent?.indexOf(t) ?? -1;
      if (i >= 0) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + t.length);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    }
    throw new Error(`Text not found: ${t}`);
  }, text);
}

export const line = (page: Page, blockId: string) => page.locator(`#block-${blockId}`);

/** Opens a story and waits until every notebook editor is ready. */
export async function openStory(page: Page, key: string) {
  await page.goto(`/w/${key}`);
  for (const s of await page.locator("[data-section]").all()) {
    await expect(s).toHaveAttribute("data-ready", "true");
  }
}
