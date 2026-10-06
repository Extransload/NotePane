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
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("needle");
  await input.press("Enter");

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

function palette(page) {
  return page.getByRole("dialog", { name: "Search notes" });
}

test("opens the note search palette and lands on a match in the current note", async ({ page }) => {
  await typeParagraphs(page, ["palette target text", "second palette line"]);

  await page.keyboard.press(modifierShortcut("P"));
  const input = palette(page).getByRole("textbox", { name: "Search notes" });
  await expect(input).toBeFocused();
  await expect(palette(page).getByRole("option")).toHaveCount(1);

  await input.fill("zzz-not-there");
  await expect(palette(page)).toContainText("No matching notes");

  await input.fill("palette");
  await expect(palette(page).getByRole("option")).toHaveCount(1);
  await input.press("Enter");

  await expect(palette(page)).toHaveCount(0);
  await expect(findBar(page).getByRole("textbox", { name: "Find in note" }))
    .toHaveValue("palette");
  await expect(findBar(page)).toContainText("/ 2");
});

test("closes the note search palette with Escape and returns to the editor", async ({ page }) => {
  await typeParagraphs(page, ["escape check"]);
  await page.keyboard.press(modifierShortcut("P"));
  await palette(page).getByRole("textbox", { name: "Search notes" }).press("Escape");

  await expect(palette(page)).toHaveCount(0);
  await expectEditorToBeFocused(page);
});

test("uses a blank palette query as a plain note switch without opening find", async ({ page }) => {
  await typeParagraphs(page, ["switch only"]);
  await page.keyboard.press(modifierShortcut("P"));
  await palette(page).getByRole("textbox", { name: "Search notes" }).press("Enter");

  await expect(palette(page)).toHaveCount(0);
  await expect(findBar(page)).toHaveCount(0);
  await expectEditorToBeFocused(page);
});

test("hands the trimmed palette query to find", async ({ page }) => {
  await typeParagraphs(page, ["trim target"]);
  await page.keyboard.press(modifierShortcut("P"));
  const input = palette(page).getByRole("textbox", { name: "Search notes" });
  await input.fill("target ");
  await input.press("Enter");

  await expect(findBar(page).getByRole("textbox", { name: "Find in note" })).toHaveValue("target");
  await expect(findBar(page)).toContainText("1 / 1");
});

test("closes find with Escape after clicking the step buttons", async ({ page }) => {
  await typeParagraphs(page, ["needle needle"]);
  await page.keyboard.press(modifierShortcut("F"));
  await findBar(page).getByRole("textbox", { name: "Find in note" }).fill("needle");
  await findBar(page).getByRole("button", { name: "Next match" }).click();
  await expect(findBar(page)).toContainText("2 / 2");

  await page.keyboard.press("Escape");

  await expect(findBar(page)).toHaveCount(0);
});

async function typeCollapsedToggle(page, title, child) {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.insertText(title);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(child);
  const wrapper = page.locator(".bn-toggle-wrapper").filter({ hasText: title });
  await wrapper.locator(".bn-toggle-button").first().click();
  await expect(wrapper).toHaveAttribute("data-show-children", "false");
  return wrapper;
}

test("typing a find query leaves collapsed toggles closed until a step", async ({ page }) => {
  const wrapper = await typeCollapsedToggle(page, "Quiet toggle", "hidden quokka");
  await editorText(page, "Quiet toggle").click();
  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });

  await input.pressSequentially("quokka");
  await expect(findBar(page)).toContainText("1 / 1");
  await expect(wrapper).toHaveAttribute("data-show-children", "false");

  await input.press("Enter");
  await expect(wrapper).toHaveAttribute("data-show-children", "true");
  await expect(editorText(page, "hidden quokka")).toBeVisible();
});

test("find opened from the palette expands the toggle holding the match", async ({ page }) => {
  const wrapper = await typeCollapsedToggle(page, "Palette toggle", "hidden wombat");
  await editorText(page, "Palette toggle").click();
  await page.keyboard.press(modifierShortcut("P"));
  const input = palette(page).getByRole("textbox", { name: "Search notes" });
  await input.fill("wombat");
  await input.press("Enter");

  await expect(findBar(page)).toContainText("1 / 1");
  await expect(wrapper).toHaveAttribute("data-show-children", "true");
});

test("refining the find query stays on the current match", async ({ page }) => {
  await typeParagraphs(page, ["needle thin", "needle one", "needle two", "needle three"]);
  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("needle");
  await expect(findBar(page)).toContainText("1 / 4");
  await input.press("Enter");
  await input.press("Enter");
  await expect(page.locator(".bn-editor .notepane-find-match.is-current")).toHaveText("needle");
  await expect(findBar(page)).toContainText("3 / 4");

  // "needle two" still matches, so it stays current.
  await input.pressSequentially(" t");
  await expect(findBar(page)).toContainText("2 / 3");
  await expect(page.locator(".bn-editor .notepane-find-match.is-current")).toHaveText("needle t");
  await expect(page.locator(".bn-editor p").filter({ has: page.locator(".is-current") }))
    .toHaveText("needle two");

  // It no longer matches, so the nearest match after it becomes current.
  await input.pressSequentially("h");
  await expect(findBar(page)).toContainText("2 / 2");
  await expect(page.locator(".bn-editor p").filter({ has: page.locator(".is-current") }))
    .toHaveText("needle three");
});
