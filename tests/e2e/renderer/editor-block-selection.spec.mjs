import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  expectEditorFocused,
  getBulletItemDepth,
  loadTemplatePreview,
  modifierShortcut,
  pastePlainText,
  waitForEditorSelection,
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

test("Escape selects the block under the caret, a code block too, then lets go of it", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, FIXTURE);
  const selectedBlocks = page.locator(".bn-editor [data-block-selected='true']");
  const editorHasFocus = () => page.evaluate(() => Boolean(document.activeElement?.closest(".bn-editor")));

  await page.locator(".bn-editor").getByText("Bravo paragraph", { exact: true }).click();
  await waitForEditorSelection(page);
  await page.keyboard.press("Escape");
  await expect(selectedBlocks).toHaveCount(1);
  await expect(selectedBlocks).toHaveText("Bravo paragraph");
  await expectEditorFocused(page);
  await page.keyboard.press("Escape");
  await expect(selectedBlocks).toHaveCount(0);
  await expect.poll(editorHasFocus).toBe(false);

  await page.locator(".bn-editor [data-content-type='codeBlock'] code").click();
  await waitForEditorSelection(page);
  await page.keyboard.press("Escape");
  await expect(selectedBlocks).toHaveCount(1);
  await expect(selectedBlocks.locator("[data-content-type='codeBlock']")).toHaveCount(1);
  await expectEditorFocused(page);
  await page.keyboard.press("Escape");
  await expect(selectedBlocks).toHaveCount(0);
  await expect.poll(editorHasFocus).toBe(false);
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

// A row given by its text, or a locator for a row without text such as a divider.
function rowOf(page, target) {
  return typeof target === "string" ? row(page, target) : target;
}

async function marquee(page, fromText, toText, { modifier, release = true } = {}) {
  const editorBox = await page.locator(".bn-editor").boundingBox();
  const fromBox = await rowOf(page, fromText).boundingBox();
  const toBox = await rowOf(page, toText).boundingBox();
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
  // The template image pushes "Session brief" down once it loads, so measure after that.
  await expect.poll(() => page.locator(".bn-editor img").first()
    .evaluate((img) => img.complete && img.naturalHeight > 0)).toBe(true);

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

test("selects every block a marquee touches and deselects blocks as it shrinks", async ({ page }) => {
  await pasteSelectionFixture(page);

  await marquee(page, "Alpha paragraph", "Charlie paragraph", { release: false });
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph", "Bravo paragraph", "Charlie paragraph"]);
  await expect(page.getByTestId("block-marquee")).toBeVisible();

  const alphaBox = await row(page, "Alpha paragraph").boundingBox();
  await page.mouse.move(alphaBox.x + alphaBox.width / 2, alphaBox.y + alphaBox.height / 2, { steps: 5 });
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph"]);

  await page.mouse.up();
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph"]);
  await expect(page.getByTestId("block-marquee")).toHaveCount(0);
  await expect(page.locator(".bn-editor")).toHaveAttribute("data-block-selection", "true");
});

test("selects nothing while the marquee stays in the side padding", async ({ page }) => {
  await pasteSelectionFixture(page);
  const editorBox = await page.locator(".bn-editor").boundingBox();
  const alphaBox = await row(page, "Alpha paragraph").boundingBox();
  const charlieBox = await row(page, "Charlie paragraph").boundingBox();
  const charlieY = charlieBox.y + charlieBox.height - 2;

  await page.mouse.move(editorBox.x + editorBox.width - 40, alphaBox.y + 2);
  await page.mouse.down();
  await page.mouse.move(editorBox.x + editorBox.width - 10, charlieY, { steps: 10 });
  await expect(page.getByTestId("block-marquee")).toBeVisible();
  expect(await selectedBlockTexts(page)).toEqual([]);

  await page.mouse.move(editorBox.x + editorBox.width / 2, charlieY, { steps: 10 });
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph", "Bravo paragraph", "Charlie paragraph"]);
  await page.mouse.up();
});

test("selects a nested child alone, and its parent with an outer block", async ({ page }) => {
  await pasteSelectionFixture(page);

  await marquee(page, "Delta child", "Delta child");
  expect(await selectedBlockTexts(page)).toEqual(["Delta child"]);

  await marquee(page, "Delta child", "Echo bullet");
  expect(await selectedBlockTexts(page)).toEqual(["Delta bullet", "Echo bullet"]);
});

test("focuses the last block on a click in the empty surface and clears a block selection", async ({ page }) => {
  await pasteSelectionFixture(page);
  await marquee(page, "Alpha paragraph", "Alpha paragraph");
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph"]);

  const lastBox = await page.locator(".bn-editor .bn-block-outer").last().boundingBox();
  await page.mouse.click(lastBox.x + lastBox.width / 2, lastBox.y + lastBox.height + 40);

  await expect(page.locator(".bn-editor")).toHaveAttribute("data-block-selection", "false");
  await expectEditorFocused(page);
  const lastContent = page.locator(".bn-editor .bn-block-content").last();
  await expect(lastContent).toHaveAttribute("data-content-type", "paragraph");
  await expect(lastContent).toHaveText("");
});

test("never starts a marquee from the side menu handle", async ({ page }) => {
  await pasteSelectionFixture(page);
  await row(page, "Alpha paragraph").hover();
  const handle = page.locator(".bn-side-menu [data-test='dragHandle']");
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  // Playwright never finishes intercepting this handle's HTML5 drag, and a native drag would hide
  // the moves from the page anyway. Cancelling it lets the marquee code see every move.
  await page.evaluate(() => document.addEventListener("dragstart", (event) => event.preventDefault(), { capture: true, once: true }));

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 10, handleBox.y + handleBox.height / 2, { steps: 5 });
  await expect(page.getByTestId("block-marquee")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await selectedBlockTexts(page)).toEqual([]);
});

test("replaces a block selection with a text selection when a drag starts in selected text", async ({ page }) => {
  await pasteSelectionFixture(page);
  await marquee(page, "Alpha paragraph", "Bravo paragraph");
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph", "Bravo paragraph"]);

  await textDrag(page, "Alpha paragraph", "Alpha paragraph");

  expect(await selectedBlockTexts(page)).toEqual([]);
  expect(await selectionString(page)).not.toBe("");
});

test("ends a marquee when the window loses focus mid-drag", async ({ page }) => {
  await pasteSelectionFixture(page);
  await marquee(page, "Alpha paragraph", "Bravo paragraph", { release: false });
  await expect(page.getByTestId("block-marquee")).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByTestId("block-marquee")).toHaveCount(0);
  await page.mouse.up();
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph", "Bravo paragraph"]);

  await row(page, "Bravo paragraph").click();
  const caret = await page.evaluate(() => {
    const selection = window.getSelection();
    const node = selection.anchorNode;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return {
      collapsed: selection.isCollapsed,
      block: element?.closest(".bn-block-content")?.textContent.trim() ?? null,
    };
  });
  expect(caret).toEqual({ collapsed: true, block: "Bravo paragraph" });
  await expect(page.locator(".bn-editor")).toHaveAttribute("data-block-selection", "false");
});

test("focuses the editor when a marquee starts while the find bar has focus", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await pasteSelectionFixture(page);
  await page.keyboard.press(modifierShortcut("F"));
  const findInput = page.getByRole("search", { name: "Find in note" })
    .getByRole("textbox", { name: "Find in note" });
  await findInput.pressSequentially("Charlie");
  await expect(findInput).toBeFocused();
  const surface = page.getByTestId("sticky-editor-surface");
  const scrollTop = await surface.evaluate((el) => el.scrollTop);

  // The find bar floats over the right gutter of the first row, so draw the marquee upwards.
  await marquee(page, "Bravo paragraph", "Alpha paragraph");

  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph", "Bravo paragraph"]);
  await expectEditorFocused(page);
  expect(await surface.evaluate((el) => el.scrollTop)).toBe(scrollTop);
  await page.keyboard.press(modifierShortcut("C"));
  await expect(findInput).toHaveValue("Charlie");
  await expect.poll(() => clipboardText(page)).toContain("Alpha paragraph");
  const copied = await clipboardText(page);
  expect(copied).toContain("Bravo paragraph");
  expect(copied).not.toContain("Charlie");
});

test("adds a Shift marquee to the existing block selection without the blocks between", async ({ page }) => {
  await pasteSelectionFixture(page);
  await marquee(page, "Alpha paragraph", "Alpha paragraph");
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph"]);

  await marquee(page, "Charlie paragraph", "Charlie paragraph", { modifier: "Shift" });
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph", "Charlie paragraph"]);

  await marquee(page, "Foxtrot paragraph", "Foxtrot paragraph", { modifier: "Meta" });
  expect(await selectedBlockTexts(page)).toEqual(["Foxtrot paragraph"]);
});

test("keeps one parent when a Shift marquee touches a child of a selected parent", async ({ page }) => {
  await pasteSelectionFixture(page);
  await marquee(page, "Delta bullet", "Delta bullet");
  expect(await selectedBlockTexts(page)).toEqual(["Delta bullet"]);

  await marquee(page, "Delta child", "Delta child", { modifier: "Shift" });
  expect(await selectedBlockTexts(page)).toEqual(["Delta bullet"]);
});

test("auto-scrolls a marquee held at the bottom edge and keeps its start anchored", async ({ page }) => {
  await pasteLines(page, 60);
  const surface = page.getByTestId("sticky-editor-surface");
  // The paste scrolls to its end, so start from the top.
  await surface.evaluate((el) => { el.scrollTop = 0; });
  await marquee(page, "Line 1", "Line 1", { release: false });
  const surfaceBox = await surface.boundingBox();
  const editorBox = await page.locator(".bn-editor").boundingBox();

  await page.mouse.move(editorBox.x + editorBox.width / 2, surfaceBox.y + surfaceBox.height - 5, { steps: 5 });

  // The pointer stays still in the band, so only the auto-scroll can move the surface.
  await expect.poll(() => surface.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect.poll(async () => {
    const selected = await selectedBlockTexts(page);
    return { first: selected[0], moreThan20: selected.length > 20 };
  }).toEqual({ first: "Line 1", moreThan20: true });
  await page.mouse.up();
});

test("auto-scrolls a text drag held at the bottom edge", async ({ page }) => {
  await pasteLines(page, 60);
  const surface = page.getByTestId("sticky-editor-surface");
  await surface.evaluate((el) => { el.scrollTop = 0; });
  const surfaceBox = await surface.boundingBox();
  const textBox = await row(page, "Line 1").locator(".bn-inline-content").boundingBox();
  expect(textBox).not.toBeNull();

  await page.mouse.move(textBox.x + 2, textBox.y + textBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(textBox.x + 40, surfaceBox.y + surfaceBox.height - 5, { steps: 10 });

  await expect.poll(() => surface.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect.poll(async () => ({
    blocks: await selectedBlockTexts(page),
    reachesLine20: (await selectionString(page)).includes("Line 20"),
  })).toEqual({ blocks: [], reachesLine20: true });
  await page.mouse.up();
});

// Block-selects `firstText`, then adds `secondText` with a Shift marquee.
async function selectTwoBlocks(page, firstText, secondText) {
  await marquee(page, firstText, firstText);
  await marquee(page, secondText, secondText, { modifier: "Shift" });
  expect(await selectedBlockTexts(page)).toEqual([firstText, secondText]);
}

// {Alpha, Charlie} block-selected with Bravo unselected between them.
async function selectAlphaAndCharlie(page) {
  await pasteSelectionFixture(page);
  await selectTwoBlocks(page, "Alpha paragraph", "Charlie paragraph");
}

async function firstBlockTexts(page, count) {
  const texts = await page.locator(".bn-editor .bn-block-content").allTextContents();
  return texts.slice(0, count).map((text) => text.trim());
}

// Seeded first, so a stale clipboard from an earlier test cannot satisfy the assertions.
async function expectClipboardHoldsAlphaAndCharlie(page) {
  await expect.poll(() => clipboardText(page)).toContain("Alpha paragraph");
  const copied = await clipboardText(page);
  expect(copied).toContain("Charlie paragraph");
  expect(copied).not.toContain("Bravo");
}

test("copies exactly the blocks of a non-contiguous selection", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("clipboard before the copy"));
  await selectAlphaAndCharlie(page);

  await page.keyboard.press(modifierShortcut("C"));

  await expectClipboardHoldsAlphaAndCharlie(page);
});

test("cuts exactly the blocks of a non-contiguous selection", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("clipboard before the cut"));
  await selectAlphaAndCharlie(page);

  await page.keyboard.press(modifierShortcut("X"));

  await expectClipboardHoldsAlphaAndCharlie(page);
  await expect(row(page, "Alpha paragraph")).toHaveCount(0);
  await expect(row(page, "Charlie paragraph")).toHaveCount(0);
  await expect(row(page, "Bravo paragraph")).toHaveCount(1);
});

test("deletes a non-contiguous selection and restores it with one undo", async ({ page }) => {
  await selectAlphaAndCharlie(page);

  await page.keyboard.press("Backspace");
  await expect(row(page, "Alpha paragraph")).toHaveCount(0);
  await expect(row(page, "Charlie paragraph")).toHaveCount(0);
  await expect(row(page, "Bravo paragraph")).toHaveCount(1);

  await page.keyboard.press(modifierShortcut("Z"));
  await expect.poll(() => firstBlockTexts(page, 3))
    .toEqual(["Alpha paragraph", "Bravo paragraph", "Charlie paragraph"]);
  // Undo restores the block set itself, not a text span over Bravo.
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph", "Charlie paragraph"]);

  await page.keyboard.press("Backspace");
  await expect(row(page, "Alpha paragraph")).toHaveCount(0);
  await expect(row(page, "Charlie paragraph")).toHaveCount(0);
  await expect(row(page, "Bravo paragraph")).toHaveCount(1);
});

test("replaces a non-contiguous selection with typed text", async ({ page }) => {
  await selectAlphaAndCharlie(page);

  await page.keyboard.type("x");

  await expect.poll(() => firstBlockTexts(page, 2)).toEqual(["x", "Bravo paragraph"]);
  await expect(row(page, "Charlie paragraph")).toHaveCount(0);
});

test("replaces a non-contiguous selection with Korean IME text", async ({ page }) => {
  await selectAlphaAndCharlie(page);
  const cdp = await page.context().newCDPSession(page);

  await cdp.send("Input.imeSetComposition", { text: "ㅎ", selectionStart: 1, selectionEnd: 1 });
  await cdp.send("Input.imeSetComposition", { text: "하", selectionStart: 1, selectionEnd: 1 });
  await cdp.send("Input.insertText", { text: "한" });

  await expect.poll(() => firstBlockTexts(page, 2)).toEqual(["한", "Bravo paragraph"]);
  await expect(row(page, "Charlie paragraph")).toHaveCount(0);
  await expect(row(page, "Delta bullet")).toHaveCount(1);
});

test("replaces a non-contiguous selection when an IME keydown precedes composition", async ({ page }) => {
  await selectAlphaAndCharlie(page);
  await expectEditorFocused(page);

  await page.evaluate(() => document.activeElement.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Process", keyCode: 229, isComposing: false, bubbles: true, cancelable: true,
  })));
  // The keydown alone replaces the set, so compositionstart is not what passes this test.
  await expect(page.locator(".bn-editor")).toHaveAttribute("data-block-selection", "false");
  expect(await firstBlockTexts(page, 2)).toEqual(["", "Bravo paragraph"]);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "ㅎ", selectionStart: 1, selectionEnd: 1 });
  await cdp.send("Input.imeSetComposition", { text: "하", selectionStart: 1, selectionEnd: 1 });
  await cdp.send("Input.insertText", { text: "한" });

  await expect.poll(() => firstBlockTexts(page, 2)).toEqual(["한", "Bravo paragraph"]);
  await expect(row(page, "Charlie paragraph")).toHaveCount(0);
});

test("keeps the unselected block when Enter is pressed on a non-contiguous selection", async ({ page }) => {
  // BlockNote's own Enter throws on a block set, which would also leave the blocks in place.
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await selectAlphaAndCharlie(page);

  const blocks = page.locator(".bn-editor .bn-block-outer");
  const blockCount = await blocks.count();
  // Mod+Enter is the app-level focusEditor shortcut, which acts before the editor sees it.
  for (const key of ["Enter", "Shift+Enter"]) {
    await page.keyboard.press(key);
    await expect(row(page, "Alpha paragraph")).toHaveCount(1);
    await expect(row(page, "Bravo paragraph")).toHaveCount(1);
    await expect(row(page, "Charlie paragraph")).toHaveCount(1);
    await expect(blocks).toHaveCount(blockCount);
    expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph", "Charlie paragraph"]);
  }
  expect(pageErrors).toEqual([]);
});

test("replaces a non-contiguous selection with a pasted standalone URL", async ({ page }) => {
  await selectAlphaAndCharlie(page);

  await pastePlainText(page, "https://example.com/page");

  await expect(row(page, "Alpha paragraph")).toHaveCount(0);
  await expect(row(page, "Charlie paragraph")).toHaveCount(0);
  await expect(row(page, "Bravo paragraph")).toHaveCount(1);
  await expect(page.locator(".bn-editor .bn-block-content")
    .filter({ hasText: "https://example.com/page" })).toHaveCount(1);
});

test("does not seed the find bar from a block selection", async ({ page }) => {
  await selectAlphaAndCharlie(page);

  await page.keyboard.press(modifierShortcut("F"));

  const input = page.getByRole("search", { name: "Find in note" })
    .getByRole("textbox", { name: "Find in note" });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
});

test("copies the find input text instead of a block selection", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await selectAlphaAndCharlie(page);
  await page.keyboard.press(modifierShortcut("F"));
  const input = page.getByRole("search", { name: "Find in note" })
    .getByRole("textbox", { name: "Find in note" });
  await input.fill("needle query");
  await input.selectText();
  await page.evaluate(() => navigator.clipboard.writeText("sentinel"));

  await page.keyboard.press(modifierShortcut("C"));

  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("needle query");
});

// Opens the six-dot menu from `text`'s row and checks the menu stands for that block.
async function openBlockMenuOn(page, text) {
  await row(page, text).hover();
  await page.locator(".bn-side-menu [data-test='dragHandle']").click();
  const blockMenu = page.locator(".bn-drag-handle-menu:visible");
  await expect(blockMenu).toBeVisible();
  const blockId = await row(page, text).evaluate((el) => el.closest(".bn-block-outer").dataset.id);
  await expect(page.locator("style[data-block-menu-highlight]"))
    .toHaveAttribute("data-block-menu-highlight", blockId);
  return blockMenu;
}

async function expectOnlyBravoLeft(page) {
  await expect(row(page, "Alpha paragraph")).toHaveCount(0);
  await expect(row(page, "Charlie paragraph")).toHaveCount(0);
  await expect(row(page, "Bravo paragraph")).toHaveCount(1);
}

test("turns a non-contiguous selection into headings from the block menu", async ({ page }) => {
  await selectAlphaAndCharlie(page);
  const blockMenu = await openBlockMenuOn(page, "Charlie paragraph");

  await blockMenu.getByRole("menuitem", { name: "Turn into" }).click();
  await page.locator(".notepane-block-menu-subpanel[data-panel='turn-into']:visible")
    .getByRole("menuitem", { name: "Heading 1", exact: true })
    .click();

  await expect(row(page, "Alpha paragraph")).toHaveAttribute("data-content-type", "heading");
  await expect(row(page, "Charlie paragraph")).toHaveAttribute("data-content-type", "heading");
  await expect(row(page, "Bravo paragraph")).toHaveAttribute("data-content-type", "paragraph");
});

test("colors a non-contiguous selection from the block menu", async ({ page }) => {
  await selectAlphaAndCharlie(page);
  const blockMenu = await openBlockMenuOn(page, "Charlie paragraph");

  await blockMenu.getByRole("menuitem", { name: "Colors" }).click();
  // The first swatch is "default", which BlockNote renders as no attribute at all.
  const swatch = page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible")
    .locator("[data-color-kind='background']:not([data-color-value='default'])")
    .first();
  const color = await swatch.getAttribute("data-color-value");
  await swatch.click();

  await expect(row(page, "Alpha paragraph")).toHaveAttribute("data-background-color", color);
  await expect(row(page, "Charlie paragraph")).toHaveAttribute("data-background-color", color);
  expect(await row(page, "Bravo paragraph").getAttribute("data-background-color")).toBeNull();
});

test("deletes a non-contiguous selection from the block menu", async ({ page }) => {
  await selectAlphaAndCharlie(page);
  const blockMenu = await openBlockMenuOn(page, "Charlie paragraph");

  await blockMenu.getByRole("menuitem", { name: "Delete" }).click();
  await expectOnlyBravoLeft(page);

  // The menu leaves focus on the body, so put the caret back in the editor to undo.
  await row(page, "Bravo paragraph").click();
  await page.keyboard.press(modifierShortcut("Z"));
  await expect.poll(() => firstBlockTexts(page, 3))
    .toEqual(["Alpha paragraph", "Bravo paragraph", "Charlie paragraph"]);
  await selectTwoBlocks(page, "Alpha paragraph", "Charlie paragraph");
  await openBlockMenuOn(page, "Charlie paragraph");

  await page.keyboard.press("Delete");
  await expectOnlyBravoLeft(page);
});

test("cuts a non-contiguous selection from the block menu shortcut", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("clipboard before the cut"));
  await selectAlphaAndCharlie(page);
  await openBlockMenuOn(page, "Charlie paragraph");

  await page.keyboard.press(modifierShortcut("X"));

  await expectClipboardHoldsAlphaAndCharlie(page);
  await expectOnlyBravoLeft(page);
});

test("leaves the caret on the first block not cut after a block menu cut", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await pasteSelectionFixture(page);
  await selectTwoBlocks(page, "Bravo paragraph", "Echo bullet");
  await openBlockMenuOn(page, "Bravo paragraph");

  await page.keyboard.press(modifierShortcut("X"));

  await expect(row(page, "Bravo paragraph")).toHaveCount(0);
  await expect(row(page, "Echo bullet")).toHaveCount(0);
  await expectEditorFocused(page);
  await expect.poll(() => page.evaluate(() => {
    const node = window.getSelection().anchorNode;
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    return element?.closest(".bn-block-content")?.textContent.trim() ?? null;
  })).toBe("Charlie paragraph");
});

test("indents and outdents each block of a non-contiguous selection", async ({ page }) => {
  await selectAlphaAndCharlie(page);
  const alphaDepth = await blockDepth(page, "Alpha paragraph");
  const bravoDepth = await blockDepth(page, "Bravo paragraph");

  await page.keyboard.press("Tab");
  await expect.poll(() => blockDepth(page, "Charlie paragraph")).toBe(bravoDepth + 1);
  expect(await blockDepth(page, "Bravo paragraph")).toBe(bravoDepth);
  expect(await blockDepth(page, "Alpha paragraph")).toBe(alphaDepth);
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph", "Charlie paragraph"]);

  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => blockDepth(page, "Charlie paragraph")).toBe(bravoDepth);
  expect(await blockDepth(page, "Alpha paragraph")).toBe(alphaDepth);
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph", "Charlie paragraph"]);
});

test("indents a contiguous run as one unit", async ({ page }) => {
  await pasteSelectionFixture(page);
  const alphaDepth = await blockDepth(page, "Alpha paragraph");
  await marquee(page, "Bravo paragraph", "Charlie paragraph");
  expect(await selectedBlockTexts(page)).toEqual(["Bravo paragraph", "Charlie paragraph"]);

  await page.keyboard.press("Tab");
  await expect.poll(() => blockDepth(page, "Bravo paragraph")).toBe(alphaDepth + 1);
  expect(await blockDepth(page, "Charlie paragraph")).toBe(alphaDepth + 1);
  expect(await selectedBlockTexts(page)).toEqual(["Bravo paragraph", "Charlie paragraph"]);

  await page.keyboard.press("Shift+Tab");
  await expect.poll(() => blockDepth(page, "Bravo paragraph")).toBe(alphaDepth);
  expect(await blockDepth(page, "Charlie paragraph")).toBe(alphaDepth);
  expect(await selectedBlockTexts(page)).toEqual(["Bravo paragraph", "Charlie paragraph"]);

  // A run that starts at the top of its group stays put whole, so Bravo never nests under Alpha.
  await marquee(page, "Alpha paragraph", "Bravo paragraph");
  await page.keyboard.press("Tab");
  expect(await blockDepth(page, "Bravo paragraph")).toBe(alphaDepth);
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph", "Bravo paragraph"]);
});

test("moves each block of a non-contiguous selection past its neighbour", async ({ page }) => {
  await pasteSelectionFixture(page);
  const original = await topLevelTexts(page);
  const moveUp = `Shift+${modifierShortcut("ArrowUp")}`;
  await selectTwoBlocks(page, "Bravo paragraph", "Echo bullet");

  await page.keyboard.press(moveUp);
  await expect.poll(async () => (await topLevelTexts(page)).slice(0, 5)).toEqual([
    "Bravo paragraph", "Alpha paragraph", "Charlie paragraph", "Echo bullet", "Delta bullet",
  ]);
  expect(await selectedBlockTexts(page)).toEqual(["Bravo paragraph", "Echo bullet"]);

  // One undo puts both blocks back, so Alpha is at the top edge again.
  await page.keyboard.press(modifierShortcut("Z"));
  await expect.poll(() => topLevelTexts(page)).toEqual(original);
  await selectTwoBlocks(page, "Alpha paragraph", "Charlie paragraph");

  await page.keyboard.press(moveUp);
  expect(await topLevelTexts(page)).toEqual(original);
  expect(await selectedBlockTexts(page)).toEqual(["Alpha paragraph", "Charlie paragraph"]);
});

// The texts of the direct children of `text`'s block, in order.
async function childTexts(page, text) {
  return await row(page, text).evaluate((el) =>
    [...el.closest(".bn-block-outer").querySelectorAll(
      ":scope > .bn-block > .bn-block-group > .bn-block-outer > .bn-block > .bn-block-content",
    )].map((child) => child.textContent.trim()));
}

test("moves a mixed-depth selection without errors", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await pasteSelectionFixture(page);
  const divider = page.locator(".bn-editor .bn-block-content[data-content-type='divider']");
  await marquee(page, "Echo bullet", divider);
  // The divider has no text.
  expect(await selectedBlockTexts(page)).toEqual(["Echo bullet", ""]);

  // Echo nests under Delta after Delta child. The divider has no inline content and stays put.
  await page.keyboard.press("Tab");
  await expect.poll(() => childTexts(page, "Delta bullet")).toEqual(["Delta child", "Echo bullet"]);
  expect((await topLevelTexts(page)).slice(3, 6)).toEqual(["Delta bullet", "", "Foxtrot paragraph"]);

  // The nested run comes first in the document, but its group starts after the top-level one.
  await page.keyboard.press(`Shift+${modifierShortcut("ArrowUp")}`);
  await expect.poll(() => childTexts(page, "Delta bullet")).toEqual(["Echo bullet", "Delta child"]);
  expect((await topLevelTexts(page)).slice(0, 6)).toEqual([
    "Alpha paragraph", "Bravo paragraph", "Charlie paragraph", "", "Delta bullet", "Foxtrot paragraph",
  ]);
  expect(await selectedBlockTexts(page)).toEqual(["", "Echo bullet"]);
  expect(pageErrors).toEqual([]);
});

// Records each glide a block move starts: the block's text and the vertical offset it starts from.
// Installed before the move, as the glide starts in the move's own task.
async function recordBlockGlides(page) {
  await page.evaluate(() => {
    window.__blockGlides = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function recordGlide(keyframes, options) {
      if (options?.id === "notepane-block-move") {
        window.__blockGlides.push({
          text: this.querySelector(".bn-block-content")?.textContent.trim(),
          fromY: Number.parseFloat(String(keyframes[0].translate).split(" ")[1]),
        });
      }
      return animate.call(this, keyframes, options);
    };
  });
}

function readBlockGlides(page) {
  return page.evaluate(() => window.__blockGlides.splice(0));
}

function glideOf(glides, text) {
  return glides.find((glide) => glide.text === text);
}

// Waits for every glide to end and reports whether any block is still offset.
function settleBlockGlides(page) {
  return page.evaluate(async () => {
    const blocks = [...document.querySelectorAll(".bn-editor .bn-block-outer")];
    await Promise.all(blocks.flatMap((block) => block.getAnimations()).map((animation) => animation.finished));
    return blocks.filter((block) => getComputedStyle(block).translate !== "none").length;
  });
}

test("glides blocks moved by Mod+Shift+Arrow or the six-dot handle into place", async ({ page }) => {
  await pasteLines(page, 4);
  await expect(row(page, "Line 4")).toBeVisible();
  await recordBlockGlides(page);

  // Each selected block passes its neighbour: the moved ones start above their new place, the
  // neighbours they passed start below it.
  await selectTwoBlocks(page, "Line 1", "Line 3");
  await page.keyboard.press(`Shift+${modifierShortcut("ArrowDown")}`);
  await expect.poll(() => topLevelTexts(page)).toEqual(["Line 2", "Line 1", "Line 4", "Line 3"]);
  const keyboardGlides = await readBlockGlides(page);
  expect(glideOf(keyboardGlides, "Line 1")?.fromY).toBeLessThan(0);
  expect(glideOf(keyboardGlides, "Line 3")?.fromY).toBeLessThan(0);
  expect(glideOf(keyboardGlides, "Line 2")?.fromY).toBeGreaterThan(0);
  expect(glideOf(keyboardGlides, "Line 4")?.fromY).toBeGreaterThan(0);
  expect(await settleBlockGlides(page)).toBe(0);

  // A block dragged down by its six-dot handle starts above its new place. Playwright's native
  // drag stalls on this handle, so the drag runs as the browser's own drag events, which go
  // through BlockNote's handle and ProseMirror's drop as a real drag does.
  await row(page, "Line 4").click();
  await waitForEditorSelection(page);
  const sourceBox = await page.locator(".bn-editor").getByText("Line 2", { exact: true }).boundingBox();
  await page.mouse.move(sourceBox.x + 10, sourceBox.y + sourceBox.height / 2);
  const handle = page.locator(".bn-side-menu [data-test='dragHandle']");
  await expect(handle).toBeVisible();
  const targetBox = await page.locator(".bn-editor").getByText("Line 4", { exact: true }).boundingBox();
  await handle.evaluate((icon, point) => {
    const button = icon.closest("button");
    const dataTransfer = new DataTransfer();
    const fire = (target, type) => target.dispatchEvent(new DragEvent(type, {
      bubbles: true, cancelable: true, dataTransfer, clientX: point.x, clientY: point.y,
    }));
    fire(button, "dragstart");
    const target = document.elementFromPoint(point.x, point.y);
    for (const type of ["dragenter", "dragover", "drop"]) fire(target, type);
    fire(button, "dragend");
  }, { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height * 0.75 });
  await expect.poll(() => topLevelTexts(page)).toEqual(["Line 1", "Line 2", "Line 4", "Line 3"]);
  const dragGlides = await readBlockGlides(page);
  expect(glideOf(dragGlides, "Line 2")?.fromY).toBeLessThan(0);
  expect(glideOf(dragGlides, "Line 1")?.fromY).toBeGreaterThan(0);
  expect(await settleBlockGlides(page)).toBe(0);
});

test("moves blocks without the glide when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await pasteLines(page, 3);
  await expect(row(page, "Line 3")).toBeVisible();
  await recordBlockGlides(page);
  await selectTwoBlocks(page, "Line 1", "Line 2");
  await page.keyboard.press(`Shift+${modifierShortcut("ArrowDown")}`);
  await expect.poll(() => topLevelTexts(page)).toEqual(["Line 3", "Line 1", "Line 2"]);
  expect(await readBlockGlides(page)).toEqual([]);
});
