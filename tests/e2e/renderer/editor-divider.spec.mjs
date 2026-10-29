import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  pastePlainText,
  readComputedStyleWhileExporting,
  selectAppTheme,
} from "../support/renderer-helpers.mjs";

const DIVIDER = ".bn-editor .bn-block-content[data-content-type='divider']";

// Runs in the page before the app loads: a desktop bridge with one note and an exportNote that
// keeps the Markdown it is given.
function stubMarkdownExportBridge(blocksJSON) {
  const now = Date.UTC(2026, 9, 29, 9, 0, 0);
  const note = {
    id: "divider-note",
    title: "Divider note",
    titleManuallyEdited: false,
    blocksJSON,
    markdown: "",
    theme: {},
    seedDemoContent: false,
    editorFontFamily: "Inter",
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  window.blocknoteSticky = {
    getCurrentNoteId: async () => note.id,
    getNote: async () => note,
    listNotes: async () => [note],
    listTrash: async () => [],
    getAppTheme: async () => ({ themeId: "notepane-light", mode: "light" }),
    getLayoutMode: async () => "tabs",
    getEditorPreferences: async () => ({}),
    listFonts: async () => [],
    saveContent: async () => note,
    updateAppearance: async () => undefined,
    exportNote: async ({ markdown }) => {
      window.__exportedMarkdown = markdown;
      return { canceled: false };
    },
  };
}

const blockTypes = (page) => page.locator(".bn-editor .bn-block-content").evaluateAll((elements) =>
  elements.map((element) => element.dataset.contentType));

const editorSelection = (page) => page.evaluate(() => {
  const { selection } = document.querySelector(".bn-editor").editor.view.state;
  return { isNode: Boolean(selection.node), type: selection.node?.type.name ?? null };
});

async function importMarkdown(page, markdown) {
  await page.keyboard.type("/import");
  await page.getByText("Import Markdown", { exact: true }).click();
  const importDialog = page.getByRole("dialog", { name: "Import Markdown" });
  await importDialog.locator(".markdown-import-dropzone").evaluate((dropzone, text) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([text], "divider.md", { type: "text/markdown" }));
    dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  }, markdown);
  await expect(importDialog).toHaveCount(0);
}

test.describe("divider", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  });

  test("inserts a divider from the slash menu with a rule icon", async ({ page }) => {
    await createBlankSession(page);
    await clickLastEmptyParagraph(page);
    await page.keyboard.type("Above");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/divider");
    const item = page.locator(".bn-suggestion-menu-item", { hasText: "Divider" });
    await expect(item).toBeVisible();
    await expect(item.locator("svg.lucide-minus")).toHaveCount(1);
    await page.keyboard.press("Enter");

    await expect(page.locator(`${DIVIDER} hr`)).toBeVisible();
    await page.keyboard.type("Below");
    await expect.poll(() => blockTypes(page)).toEqual(["paragraph", "divider", "paragraph"]);
    await expect(page.locator(".bn-editor [data-content-type='paragraph']").last()).toHaveText("Below");
  });

  for (const marker of ["---", "***"]) {
    test(`turns ${marker} typed in an empty paragraph into a divider and writes on below it`, async ({ page }) => {
      await createBlankSession(page);
      await clickLastEmptyParagraph(page);
      await page.keyboard.type("Above");
      await page.keyboard.press("Enter");
      await page.keyboard.type(marker);
      await expect(page.locator(DIVIDER)).toHaveCount(1);
      await page.keyboard.type("Below");

      await expect.poll(() => blockTypes(page)).toEqual(["paragraph", "divider", "paragraph"]);
      await expect(page.locator(".bn-editor [data-content-type='paragraph']").last()).toHaveText("Below");
    });
  }

  test("keeps the marker as text when the paragraph has other text", async ({ page }) => {
    await createBlankSession(page);
    await clickLastEmptyParagraph(page);
    await page.keyboard.type("note ***");
    await expect(page.locator(DIVIDER)).toHaveCount(0);
    await expect(page.locator(".bn-editor [data-content-type='paragraph']").first()).toHaveText("note ***");
  });

  test("selects a divider with Backspace from the empty line below it, then deletes it", async ({ page }) => {
    await createBlankSession(page);
    await clickLastEmptyParagraph(page);
    await page.keyboard.type("Above");
    await page.keyboard.press("Enter");
    await page.keyboard.type("---");
    await expect(page.locator(DIVIDER)).toHaveCount(1);

    await page.keyboard.press("Backspace");
    await expect.poll(() => editorSelection(page)).toEqual({ isNode: true, type: "divider" });
    await expect.poll(() => blockTypes(page)).toEqual(["paragraph", "divider"]);

    await page.keyboard.press("Backspace");
    await expect(page.locator(DIVIDER)).toHaveCount(0);
    await expect(page.locator(".bn-editor [data-content-type='paragraph']").first()).toHaveText("Above");
  });

  test("pastes Markdown rules written with dashes, asterisks or underscores as dividers", async ({ page }) => {
    await createBlankSession(page);
    await clickLastEmptyParagraph(page);
    await pastePlainText(page, "One\n\n---\n\nTwo\n\n***\n\nThree\n\n___\n\nFour");
    await expect.poll(() => blockTypes(page)).toEqual([
      "paragraph", "divider", "paragraph", "divider", "paragraph", "divider", "paragraph",
    ]);
  });
});

test("exports a divider to Markdown as --- and imports it back", async ({ page }) => {
  await page.addInitScript(stubMarkdownExportBridge, JSON.stringify([
    { type: "paragraph", content: "Above" },
    { type: "divider" },
    { type: "paragraph", content: "Below" },
    { type: "codeBlock", props: { language: "text" }, content: "***" },
    { type: "paragraph" },
  ]));
  await page.goto("/");
  await expect(page.locator(DIVIDER)).toHaveCount(1);

  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menu", { name: "Export format" }).getByRole("menuitem", { name: /Markdown/ }).click();
  await expect(page.locator(".sticky-toast-success")).toHaveText("Markdown exported");
  const markdown = await page.evaluate(() => window.__exportedMarkdown);
  // The divider is written with dashes; the `***` inside the code block stays as it is.
  expect(markdown).toBe("Above\n\n---\n\nBelow\n\n```text\n***\n```\n");

  await clickLastEmptyParagraph(page);
  await importMarkdown(page, markdown);
  await expect.poll(() => blockTypes(page)).toEqual([
    "paragraph", "divider", "paragraph", "codeBlock",
    "paragraph", "divider", "paragraph", "codeBlock",
  ]);
});

test("prints a divider as a thin rule in the export colours", async ({ page }) => {
  await page.goto("/");
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("---");
  const rule = page.locator(`${DIVIDER} hr`);
  await expect(rule).toBeVisible();
  const lightRule = await rule.evaluate((element) => getComputedStyle(element).borderTopColor);

  await selectAppTheme(page, "notepane-dark");
  await expect.poll(() => rule.evaluate((element) => getComputedStyle(element).borderTopColor))
    .not.toBe(lightRule);
  expect(await readComputedStyleWhileExporting(rule, ["borderTopWidth", "borderTopStyle", "borderTopColor"]))
    .toEqual({ borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: lightRule });
});
