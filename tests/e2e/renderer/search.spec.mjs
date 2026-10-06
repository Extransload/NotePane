import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  expectEditorToBeFocused,
  modifierShortcut,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

async function typeParagraphs(page, paragraphs) {
  await clickLastEmptyParagraph(page);
  for (const [index, paragraph] of paragraphs.entries()) {
    if (index > 0) {
      await page.keyboard.press("Enter");
    }
    await page.keyboard.insertText(paragraph);
  }
}

// Text locators stay inside the editor: the first line also becomes the
// session title in the sidebar.
function editorText(page, text) {
  return page.locator(".bn-editor").getByText(text);
}

function findBar(page) {
  return page.getByRole("search", { name: "Find in note" });
}

test("finds, steps through and clears matches in the current note", async ({ page }) => {
  await typeParagraphs(page, ["needle one needle two", "Needle three"]);

  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await expect(input).toBeFocused();
  await input.fill("needle");

  await expect(page.locator(".bn-editor .notepane-find-match")).toHaveCount(3);
  await expect(findBar(page)).toContainText("1 / 3");
  await input.press("Enter");
  await expect(findBar(page)).toContainText("2 / 3");
  await input.press("Shift+Enter");
  await input.press("Shift+Enter");
  await expect(findBar(page)).toContainText("3 / 3");
  await expect(page.locator(".bn-editor .notepane-find-match.is-current"))
    .toHaveText("Needle");

  await input.press("Escape");
  await expect(findBar(page)).toHaveCount(0);
  await expect(page.locator(".bn-editor .notepane-find-match")).toHaveCount(0);
  await expectEditorToBeFocused(page);
  await expect.poll(() => page.evaluate(() => String(window.getSelection())))
    .toBe("Needle");
});

test("matches Korean text, including decomposed Hangul", async ({ page }) => {
  await typeParagraphs(page, ["한글 검색 테스트", "한글 문서"]);

  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("한글");

  await expect(findBar(page)).toContainText("1 / 2");
});

test("ignores Enter that commits an IME composition in the find input", async ({ page }) => {
  await typeParagraphs(page, ["needle needle needle"]);
  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("needle");
  await expect(findBar(page)).toContainText("1 / 3");

  await input.evaluate((element) => {
    element.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: "Enter",
    }));
  });
  await expect(findBar(page)).toContainText("1 / 3");

  await input.press("Enter");
  await expect(findBar(page)).toContainText("2 / 3");
});

test("expands a collapsed toggle that holds the current match", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.insertText("Parent toggle");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("hidden needle");
  const wrapper = page.locator(".bn-toggle-wrapper").filter({ hasText: "Parent toggle" });
  await wrapper.locator(".bn-toggle-button").first().click();
  await expect(wrapper).toHaveAttribute("data-show-children", "false");

  await editorText(page, "Parent toggle").click();
  await page.keyboard.press(modifierShortcut("F"));
  await findBar(page).getByRole("textbox", { name: "Find in note" }).fill("needle");

  await expect(wrapper).toHaveAttribute("data-show-children", "true");
  await expect(editorText(page, "hidden needle")).toBeVisible();
});

test("updates the match count while the note is edited", async ({ page }) => {
  await typeParagraphs(page, ["needle needle"]);
  await page.keyboard.press(modifierShortcut("F"));
  await findBar(page).getByRole("textbox", { name: "Find in note" }).fill("needle");
  await expect(findBar(page)).toContainText("/ 2");

  await editorText(page, "needle needle").click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" needle");

  await expect(findBar(page)).toContainText("/ 3");
});

test("seeds the find input from a single-block text selection", async ({ page }) => {
  await typeParagraphs(page, ["select this word"]);
  await editorText(page, "select this word").dblclick();
  const selected = await page.evaluate(() => String(window.getSelection()).trim());

  await page.keyboard.press(modifierShortcut("F"));

  await expect(findBar(page).getByRole("textbox", { name: "Find in note" }))
    .toHaveValue(selected);
});

test("Enter in the find input never edits a toggle under the caret", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.insertText("toggle needle");
  const blocks = page.locator(".bn-editor .bn-block-outer");
  const blockCount = await blocks.count();

  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("needle");
  await input.press("Enter");
  await input.press("Escape");

  await expect(blocks).toHaveCount(blockCount);
});

// One insertText is one undo step. If find recorded anything in history,
// the single Mod+Z below would undo that instead and the text would remain.
test("leaves undo history to the last real edit", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.insertText("undo me later");
  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("undo");
  await input.press("Enter");
  await input.press("Escape");

  await page.keyboard.press(modifierShortcut("Z"));

  await expect(editorText(page, "undo me later")).toHaveCount(0);
});
