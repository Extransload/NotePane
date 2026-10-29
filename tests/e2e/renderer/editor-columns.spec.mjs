import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  modifierShortcut,
  waitForEditorSelection,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.pageErrors = errors;
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(page.pageErrors, "no uncaught errors in the page").toEqual([]);
});

const editor = (page) => page.locator(".bn-editor");
const columnList = (page) => editor(page).locator("[data-node-type='columnList']");
const columns = (page) => editor(page).locator("[data-node-type='column']");

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function row(page, text) {
  return editor(page).locator(".bn-block-content")
    .filter({ hasText: new RegExp(`^${escapeRegExp(text)}$`) });
}

const columnTexts = (column) => column.locator(".bn-block-content")
  .evaluateAll((elements) => elements.map((element) => element.textContent));

async function insertColumns(page) {
  await page.keyboard.type("/columns");
  const item = page.locator(".bn-suggestion-menu").getByText("2 columns", { exact: true });
  await expect(item).toBeVisible();
  await item.click();
  await expect(columns(page)).toHaveCount(2);
  // The menu fades out over the editor, and takes the pointer until it is gone.
  await expect(page.locator(".bn-suggestion-menu")).toHaveCount(0);
}

async function typeInSecondColumn(page, lines) {
  await columns(page).nth(1).locator(".bn-inline-content").first().click();
  await waitForEditorSelection(page);
  await page.keyboard.type(lines[0]);
  for (const line of lines.slice(1)) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
}

// A blank note holding "Above" and a column layout with `left` and `right` lines.
async function writeColumns(page, left, right) {
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Above");
  await page.keyboard.press("Enter");
  await insertColumns(page);
  await page.keyboard.type(left[0]);
  for (const line of left.slice(1)) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
  await typeInSecondColumn(page, right);
}

// Draws a marquee from the editor's right padding at `fromText` to the middle of the editor at the
// bottom of `toText`, as the block selection tests do.
async function marquee(page, fromText, toText) {
  const editorBox = await editor(page).boundingBox();
  const fromBox = await row(page, fromText).boundingBox();
  const toBox = await row(page, toText).boundingBox();
  await page.mouse.move(editorBox.x + editorBox.width - 20, fromBox.y + 2);
  await page.mouse.down();
  await page.mouse.move(editorBox.x + editorBox.width / 2 + 30, toBox.y + toBox.height - 2, { steps: 10 });
  await page.mouse.up();
}

function stubSavingBridge() {
  const note = {
    id: "columns-note",
    title: "Columns note",
    titleManuallyEdited: false,
    blocksJSON: null,
    markdown: "",
    theme: {},
    seedDemoContent: false,
    editorFontFamily: "Inter",
    trashedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };
  window.__savedMarkdown = "";
  window.blocknoteSticky = {
    getCurrentNoteId: async () => note.id,
    getNote: async () => note,
    listNotes: async () => [note],
    listTrash: async () => [],
    getAppTheme: async () => ({ themeId: "notepane-light", mode: "light" }),
    getLayoutMode: async () => "tabs",
    getEditorPreferences: async () => ({}),
    listFonts: async () => [],
    saveContent: async (payload) => {
      window.__savedMarkdown = payload.markdown;
      return note;
    },
    updateAppearance: async () => undefined,
    listNoteVersions: async () => [],
  };
}

test("inserts two columns from the slash menu and writes in each, side by side", async ({ page }) => {
  await writeColumns(page, ["Left one", "Left two"], ["Right one"]);

  await expect(columnList(page)).toHaveCount(1);
  expect(await columnTexts(columns(page).nth(0))).toEqual(["Left one", "Left two"]);
  expect(await columnTexts(columns(page).nth(1))).toEqual(["Right one"]);
  const left = await row(page, "Left one").boundingBox();
  const right = await row(page, "Right one").boundingBox();
  expect(right.x).toBeGreaterThan(left.x + left.width);
  expect(Math.abs(right.y - left.y)).toBeLessThan(2);
  // The layout replaced the empty paragraph the menu was opened in.
  expect(await row(page, "Above").count()).toBe(1);
});

test("offers no columns inside a column", async ({ page }) => {
  await writeColumns(page, ["Left one"], ["Right one"]);
  await page.keyboard.press("Enter");
  await page.keyboard.type("/columns");
  await expect(page.locator(".bn-suggestion-menu").getByText("2 columns", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("keeps Backspace at the start of a column inside the column", async ({ page }) => {
  await writeColumns(page, ["Left one"], ["Right one"]);
  for (let index = 0; index < "Right one".length; index += 1) await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Backspace");

  expect(await columnTexts(columns(page).nth(0))).toEqual(["Left one"]);
  expect(await columnTexts(columns(page).nth(1))).toEqual(["Right one"]);
  await expect(row(page, "Above")).toHaveCount(1);
});

test("removes an empty column with Backspace and keeps the other column's blocks", async ({ page }) => {
  await writeColumns(page, ["Left one", "Left two"], [""]);
  await page.keyboard.press("Backspace");

  await expect(columnList(page)).toHaveCount(0);
  await expect(row(page, "Left one")).toHaveCount(1);
  await page.keyboard.type("!");
  await expect(row(page, "Left two!")).toHaveCount(1);

  await page.keyboard.press(modifierShortcut("z"));
  await page.keyboard.press(modifierShortcut("z"));
  await expect(columns(page)).toHaveCount(2);
  expect(await columnTexts(columns(page).nth(0))).toEqual(["Left one", "Left two"]);
});

test("resizes the columns from the gutter in one undo step", async ({ page }) => {
  await writeColumns(page, ["Left one"], ["Right one"]);
  const gutter = editor(page).getByTestId("column-resize-handle");
  await expect(gutter).toHaveCount(1);
  const before = await columns(page).nth(0).boundingBox();
  const box = await gutter.boundingBox();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();

  await expect.poll(async () => (await columns(page).nth(0).boundingBox()).width).toBeGreaterThan(before.width + 80);
  const widths = await columns(page).evaluateAll((elements) => elements.map((element) => Number(element.dataset.width)));
  expect(widths[0]).toBeGreaterThan(1);
  expect(widths[0] + widths[1]).toBeCloseTo(2, 2);

  await page.keyboard.press(modifierShortcut("z"));
  await expect(columns(page).nth(0)).toHaveAttribute("data-width", "1");
  await expect(columns(page).nth(1)).toHaveAttribute("data-width", "1");
  expect(await columnTexts(columns(page).nth(1))).toEqual(["Right one"]);
});

test("exports columns to Markdown as their content in order", async ({ page }) => {
  await page.addInitScript(stubSavingBridge);
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Above");
  await page.keyboard.press("Enter");
  await insertColumns(page);
  await page.keyboard.type("Left one");
  await typeInSecondColumn(page, ["Right one", "Right two"]);

  await expect.poll(() => page.evaluate(() => window.__savedMarkdown))
    .toMatch(/^Above\n\nLeft one\n\nRight one\n\nRight two\n*$/);
});

test("selects the whole layout with a marquee that also touches a block outside it", async ({ page }) => {
  await writeColumns(page, ["Left one", "Left two"], ["Right one", "Right two"]);

  await marquee(page, "Above", "Right one");
  await expect(columnList(page)).toHaveAttribute("data-block-selected", "true");
  await expect(editor(page).locator("[data-block-selected='true']")).toHaveCount(2);
  await expect(editor(page).locator(".bn-block-outer[data-block-selected='true'] .bn-block-content"))
    .toHaveText(["Above"]);

  await page.keyboard.press("Backspace");
  await expect(columnList(page)).toHaveCount(0);
  await expect(row(page, "Above")).toHaveCount(0);

  await page.keyboard.press(modifierShortcut("z"));
  await expect(columns(page)).toHaveCount(2);
  expect(await columnTexts(columns(page).nth(0))).toEqual(["Left one", "Left two"]);
  expect(await columnTexts(columns(page).nth(1))).toEqual(["Right one", "Right two"]);
});

test("indents, moves and cuts blocks selected inside one column", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await writeColumns(page, ["Left one"], ["Right one", "Right two", "Right three"]);

  await marquee(page, "Right two", "Right three");
  await expect(editor(page).locator("[data-block-selected='true'] > .bn-block > .bn-block-content"))
    .toHaveText(["Right two", "Right three"]);

  await page.keyboard.press("Tab");
  await expect(columns(page).nth(1).locator(".bn-block-group .bn-block-content"))
    .toHaveText(["Right two", "Right three"]);
  await page.keyboard.press("Shift+Tab");
  await expect(columns(page).nth(1).locator(".bn-block-group .bn-block-content")).toHaveCount(0);

  await page.keyboard.press(`Shift+${modifierShortcut("ArrowUp")}`);
  expect(await columnTexts(columns(page).nth(1))).toEqual(["Right two", "Right three", "Right one"]);
  expect(await columnTexts(columns(page).nth(0))).toEqual(["Left one"]);

  await page.keyboard.press(modifierShortcut("x"));
  expect(await columnTexts(columns(page).nth(1))).toEqual(["Right one"]);
  expect(await columnTexts(columns(page).nth(0))).toEqual(["Left one"]);
  // The block copy's plain text is its Markdown, which ends in a newline.
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Right two\n\nRight three\n?$/);
});

test("selects and clears the whole note with Command+A from inside a column", async ({ page }) => {
  await writeColumns(page, ["Left one"], ["Right one"]);

  await page.keyboard.press(modifierShortcut("a"));
  await expect.poll(() => page.evaluate(() => window.getSelection().toString()))
    .toMatch(/Above[\s\S]*Left one[\s\S]*Right one/);

  await page.keyboard.press("Backspace");
  await expect(columnList(page)).toHaveCount(0);
  await expect(editor(page).locator(".bn-block-content")).toHaveCount(1);
  await page.keyboard.type("Fresh");
  await expect(row(page, "Fresh")).toHaveCount(1);
});
