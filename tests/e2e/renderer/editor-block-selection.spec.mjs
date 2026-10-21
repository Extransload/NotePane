import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  getBulletItemDepth,
  loadTemplatePreview,
  modifierShortcut,
  pastePlainText,
} from "../support/renderer-helpers.mjs";

const FIXTURE = [
  "Alpha paragraph", "", "Bravo paragraph", "", "Charlie paragraph", "",
  "- Delta bullet", "  - Delta child", "- Echo bullet", "", "---", "",
  "Foxtrot paragraph", "", "```js", "const golf = 1;", "```", "", "Hotel paragraph",
].join("\n");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function row(page, text) {
  return page.locator(".bn-editor .bn-block-content")
    .filter({ hasText: new RegExp(`^${escapeRegExp(text)}$`) });
}

async function pasteSelectionFixture(page) {
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, FIXTURE);
  await expect(row(page, "Hotel paragraph")).toBeVisible();
  expect(await getBulletItemDepth(page, "Delta child"))
    .toBe(await getBulletItemDepth(page, "Delta bullet") + 1);
}

async function pasteLines(page, count) {
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, Array.from({ length: count }, (_, i) => `Line ${i + 1}`).join("\n\n"));
}

async function selectedBlockTexts(page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll('.bn-editor [data-block-selected="true"]')]
      .map((el) => el.querySelector(":scope > .bn-block > .bn-block-content").textContent.trim()));
}

async function blockDepth(page, text) {
  return await row(page, text).evaluate((el) => {
    let depth = 0;
    for (let n = el.parentElement; n; n = n.parentElement) {
      if (n.classList.contains("bn-block-group")) depth += 1;
    }
    return depth;
  });
}

async function topLevelTexts(page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll(".bn-editor > .bn-block-group > .bn-block-outer > .bn-block > .bn-block-content")]
      .map((el) => el.textContent.trim()));
}

async function clipboardText(page) {
  return await page.evaluate(() => navigator.clipboard.readText());
}

async function marquee(page, fromText, toText, { modifier, release = true } = {}) {
  const editorBox = await page.locator(".bn-editor").boundingBox();
  const fromBox = await row(page, fromText).boundingBox();
  const toBox = await row(page, toText).boundingBox();
  expect(editorBox).not.toBeNull();
  expect(fromBox).not.toBeNull();
  expect(toBox).not.toBeNull();
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.move(editorBox.x + editorBox.width - 20, fromBox.y + 2);
  await page.mouse.down();
  await page.mouse.move(editorBox.x + editorBox.width / 2, toBox.y + toBox.height - 2, { steps: 10 });
  if (release) {
    await page.mouse.up();
    if (modifier) await page.keyboard.up(modifier);
  }
}

// Locates by substring so template blocks whose text continues past `text` also match.
async function textDrag(page, fromText, toText) {
  const start = page.locator(".bn-editor").getByText(fromText, { exact: false }).first();
  const end = page.locator(".bn-editor").getByText(toText, { exact: false }).first();
  const startBox = await start.boundingBox();
  const endBox = await end.boundingBox();
  expect(startBox).not.toBeNull();
  expect(endBox).not.toBeNull();
  await page.mouse.move(startBox.x + 2, startBox.y + 8);
  await page.mouse.down();
  await page.mouse.move(endBox.x + endBox.width - 2, endBox.y + endBox.height / 2, { steps: 12 });
  await page.mouse.up();
}

const selectionString = (page) => page.evaluate(() => window.getSelection().toString());
// Chrome's toString() drops text after a non-editable image, so read the range's own contents.
const selectionRangeText = (page) => page.evaluate(() => {
  const selection = window.getSelection();
  return selection.rangeCount ? selection.getRangeAt(0).cloneContents().textContent : "";
});

test("keeps a cross-block text drag as a text selection", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();

  await textDrag(page, "A focused workspace for persistent notes", "Create one session per meeting");

  expect(await selectedBlockTexts(page)).toEqual([]);
  await expect(page.locator(".bn-editor")).toHaveAttribute("data-block-selection", "false");
  const selected = await selectionString(page);
  expect(selected).toContain("A focused workspace for persistent notes");
  expect(selected).toContain("Create one session per meeting");

  await page.keyboard.press(modifierShortcut("C"));
  const copied = await clipboardText(page);
  expect(copied).toContain("A focused workspace for persistent notes");
  expect(copied).toContain("Create one session per meeting");
  expect(copied).not.toContain("Pin a sticky window");
});

test("keeps a text drag across a table and an image as a text selection", async ({ page }) => {
  // Tall enough that "Session brief" is on screen: the drag cannot reach text below the fold.
  await page.setViewportSize({ width: 1280, height: 1400 });
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();

  await textDrag(page, "Workspace modes", "Session brief");

  expect(await selectedBlockTexts(page)).toEqual([]);
  const selected = await selectionRangeText(page);
  expect(selected).toContain("Workspace modes");
  expect(selected).toContain("Best for");
  expect(selected).toContain("Session brief");
});

test("keeps a text drag across a divider and a code block as a text selection", async ({ page }) => {
  await pasteSelectionFixture(page);
  const blocks = page.locator(".bn-editor .bn-block-content");
  const blockCount = await blocks.count();

  await textDrag(page, "Echo bullet", "Hotel paragraph");

  expect(await selectedBlockTexts(page)).toEqual([]);
  const selected = await selectionString(page);
  expect(selected).toContain("Foxtrot paragraph");
  expect(selected).toContain("const golf = 1;");
  expect(selected).toContain("Hotel");
  expect(await blocks.count()).toBe(blockCount);
});
