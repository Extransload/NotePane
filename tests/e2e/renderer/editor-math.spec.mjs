import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  pasteClipboardText,
  pastePlainText,
  selectAppThemeThroughTestHook,
} from "../support/renderer-helpers.mjs";

const MATH_BLOCK = ".bn-editor [data-testid='math-block']";
const INLINE_MATH = ".bn-editor [data-testid='inline-math']";
// KaTeX keeps the source it rendered in its MathML annotation.
const TEX_SOURCE = ".katex annotation[encoding='application/x-tex']";

// Runs in the page before the app loads: a desktop bridge with one note and an exportNote that
// keeps the Markdown it is given.
function stubMarkdownExportBridge(blocksJSON) {
  const now = Date.UTC(2026, 9, 29, 9, 0, 0);
  const note = {
    id: "math-note",
    title: "Math note",
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

// Every equation in the document, in order, as the editor state holds it.
const equations = (page) => page.evaluate(() => {
  const found = [];
  document.querySelector(".bn-editor").editor.view.state.doc.descendants((node) => {
    if (node.type.name === "mathBlock" || node.type.name === "inlineMath") {
      found.push(`${node.type.name}:${node.attrs.latex}`);
    }
  });
  return found;
});

const blockTypes = (page) => page.locator(".bn-editor .bn-block-content").evaluateAll((elements) =>
  elements.map((element) => element.dataset.contentType));

const selectedNodeType = (page) => page.evaluate(() =>
  document.querySelector(".bn-editor").editor.view.state.selection.node?.type.name ?? null);

async function importMarkdown(page, markdown) {
  await page.keyboard.type("/import");
  await page.getByText("Import Markdown", { exact: true }).click();
  const importDialog = page.getByRole("dialog", { name: "Import Markdown" });
  await importDialog.locator(".markdown-import-dropzone").evaluate((dropzone, text) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([text], "math.md", { type: "text/markdown" }));
    dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  }, markdown);
  await expect(importDialog).toHaveCount(0);
}

async function insertInlineEquation(page, latex) {
  await page.keyboard.type("/inline");
  await page.locator(".bn-suggestion-menu-item", { hasText: "Inline equation" }).waitFor();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("inline-math-input")).toBeFocused();
  await page.keyboard.type(latex);
  await page.keyboard.press("Enter");
}

test.describe("equations", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await createBlankSession(page);
    await clickLastEmptyParagraph(page);
  });

  test("inserts a block equation from the slash menu, keeps Enter in the source and commits on Escape", async ({ page }) => {
    await page.keyboard.type("/block equation");
    const item = page.locator(".bn-suggestion-menu-item", { hasText: "Block equation" });
    await expect(item.locator("svg.lucide-sigma")).toHaveCount(1);
    await page.keyboard.press("Enter");

    const input = page.getByTestId("math-block-input");
    await expect(input).toBeFocused();
    await page.keyboard.type("\\frac{a}{b}");
    await page.keyboard.press("Enter");
    await page.keyboard.type("+ c");
    await expect(input).toHaveValue("\\frac{a}{b}\n+ c");
    // The preview follows the source while it is edited; the document waits for the commit.
    await expect(page.locator(`${MATH_BLOCK} ${TEX_SOURCE}`)).toHaveText("\\frac{a}{b}\n+ c");
    expect(await equations(page)).toEqual(["mathBlock:"]);

    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);
    await expect(page.locator(`${MATH_BLOCK} .katex-display .mfrac`)).toBeVisible();
    expect(await equations(page)).toEqual(["mathBlock:\\frac{a}{b}\n+ c"]);
    // The equation stays selected, with a line below it to write on.
    expect(await selectedNodeType(page)).toBe("mathBlock");
    expect(await blockTypes(page)).toEqual(["mathBlock", "paragraph"]);

    // A click opens the source again; leaving the field commits it.
    await page.getByTestId("math-block-preview").click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("\\frac{a}{b}\n+ c");
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("E = mc^2");
    await clickLastEmptyParagraph(page);
    await expect(input).toHaveCount(0);
    await expect.poll(() => equations(page)).toEqual(["mathBlock:E = mc^2"]);
    await expect(page.locator(`${MATH_BLOCK} ${TEX_SOURCE}`)).toHaveText("E = mc^2");

    // Selected, it is deleted with Backspace like an image.
    await page.getByTestId("math-block-preview").click();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Backspace");
    await expect(page.locator(MATH_BLOCK)).toHaveCount(0);
  });

  // The press that selects the block makes it draggable, after which Chrome sent no click.
  test("opens a block equation's editor from one click while the caret is in another block", async ({ page }) => {
    await pasteClipboardText(page, {
      plainText: "",
      html: '<p>Before</p><div data-math-block="\\int_0^1 x^2\\,dx"></div><p>After</p>',
    });
    await expect(page.locator(`${MATH_BLOCK} .katex`)).toBeVisible();
    await page.locator(".bn-editor [data-content-type='paragraph']", { hasText: "After" }).click();
    expect(await selectedNodeType(page)).toBe(null);
    await page.mouse.move(5, 300);

    await page.getByTestId("math-block-preview").click();
    await expect(page.getByTestId("math-block-input")).toBeFocused();
    await expect(page.getByTestId("math-block-input")).toHaveValue("\\int_0^1 x^2\\,dx");
  });

  test("inserts an inline equation from the slash menu and edits it from a click", async ({ page }) => {
    await page.keyboard.type("Area is ");
    await insertInlineEquation(page, "\\pi r^2");
    await expect(page.getByTestId("inline-math-popover")).toHaveCount(0);
    // The caret is after the equation.
    await page.keyboard.type(" here");
    const paragraph = page.locator(".bn-editor [data-content-type='paragraph']").first();
    await expect(paragraph.locator(`[data-testid='inline-math'] ${TEX_SOURCE}`)).toHaveText("\\pi r^2");
    await expect.poll(() => paragraph.evaluate((element) => element.textContent.replace(/πr2.*πr2/, "[math]")))
      .toBe("Area is [math] here");

    await page.locator(INLINE_MATH).click();
    const input = page.getByTestId("inline-math-input");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("\\pi r^2");
    await page.keyboard.press("End");
    await page.keyboard.type("h");
    await page.keyboard.press("Escape");
    await expect(input).toHaveCount(0);
    expect(await equations(page)).toEqual(["inlineMath:\\pi r^2h"]);

    // An equation left empty is removed.
    await page.locator(INLINE_MATH).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Enter");
    await expect(page.locator(INLINE_MATH)).toHaveCount(0);
    await expect(paragraph).toHaveText("Area is  here");
  });

  test("shows a source KaTeX cannot parse as that source in the error colour", async ({ page }) => {
    await insertInlineEquation(page, "\\frac{");
    const error = page.locator(`${INLINE_MATH} .katex-error`);
    await expect(error).toHaveText("\\frac{");
    const errorColour = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--notepane-error-text)";
      document.querySelector(".bn-editor").append(probe);
      const colour = getComputedStyle(probe).color;
      probe.remove();
      return colour;
    });
    await expect(error).toHaveCSS("color", errorColour);
  });

  test("pastes Markdown math as equations and leaves prices and code as text", async ({ page }) => {
    await pastePlainText(page, [
      "Sum $a_1 + b_1$ and $\\{x\\}$ cost $5 and $10, not `$y$`",
      "",
      "$$",
      "\\int_0^1 x^2\\,dx",
      "$$",
      "",
      "$$ e^{i\\pi} = -1 $$",
    ].join("\n"));
    await expect(page.locator(MATH_BLOCK)).toHaveCount(2);
    expect(await equations(page)).toEqual([
      "inlineMath:a_1 + b_1",
      "inlineMath:\\{x\\}",
      "mathBlock:\\int_0^1 x^2\\,dx",
      "mathBlock:e^{i\\pi} = -1",
    ]);
    await expect(page.locator(".bn-editor [data-content-type='paragraph']").first())
      .toContainText("cost $5 and $10, not $y$");
    await expect(page.locator(".bn-editor [data-content-type='paragraph'] code")).toHaveText("$y$");
  });
});

test("exports equations to Markdown as $...$ and $$ blocks and imports them back", async ({ page }) => {
  await page.addInitScript(stubMarkdownExportBridge, JSON.stringify([
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Area ", styles: {} },
        { type: "inlineMath", props: { latex: "\\pi r^2" } },
        { type: "text", text: " here", styles: {} },
      ],
    },
    { type: "mathBlock", props: { latex: "\\int_0^1 x^2\\,dx\n= \\frac{1}{3}" } },
    { type: "paragraph" },
  ]));
  await page.goto("/");
  await expect(page.locator(MATH_BLOCK)).toHaveCount(1);
  await expect(page.locator(`${INLINE_MATH} .katex`)).toBeVisible();

  await page.getByRole("button", { name: "Export" }).click();
  await page.getByRole("menu", { name: "Export format" }).getByRole("menuitem", { name: /Markdown/ }).click();
  await expect(page.locator(".sticky-toast-success")).toHaveText("Markdown exported");
  const markdown = await page.evaluate(() => window.__exportedMarkdown);
  expect(markdown).toBe("Area $\\pi r^2$ here\n\n$$\n\\int_0^1 x^2\\,dx\n= \\frac{1}{3}\n$$\n");

  await clickLastEmptyParagraph(page);
  await importMarkdown(page, markdown);
  await expect(page.locator(MATH_BLOCK)).toHaveCount(2);
  expect(await equations(page)).toEqual([
    "inlineMath:\\pi r^2",
    "mathBlock:\\int_0^1 x^2\\,dx\n= \\frac{1}{3}",
    "inlineMath:\\pi r^2",
    "mathBlock:\\int_0^1 x^2\\,dx\n= \\frac{1}{3}",
  ]);
});

// Fields ease their colours over a theme change; colours are read once that has finished.
async function selectSettledTheme(page, themeId) {
  await selectAppThemeThroughTestHook(page, themeId);
  await page.waitForFunction(() => document.getAnimations()
    .every((animation) => !(animation instanceof CSSTransition) || animation.playState === "finished"));
}

// What the theme leak detector checks for the whole app, for the equations and their editors:
// under two themes that share no colour, none of these colours stays the same.
test("takes every equation colour from the theme", async ({ page }) => {
  await page.goto("/?sentinelThemes=1");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await pasteClipboardText(page, {
    plainText: "",
    html: '<p>Area <span data-inline-math="\\pi r^2"></span> and <span data-inline-math="\\frac{"></span></p>'
      + '<div data-math-block="\\int_0^1 x^2\\,dx"></div><p></p>',
  });
  await expect(page.locator(`${MATH_BLOCK} .katex`)).toBeVisible();
  await page.getByTestId("math-block-preview").click();
  await expect(page.getByTestId("math-block-input")).toBeFocused();

  const read = () => page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    const input = style("[data-testid='math-block-input']");
    return {
      editorText: style(".bn-editor").color,
      blockEquation: style("[data-testid='math-block'] .katex").color,
      inlineEquation: style("[data-testid='inline-math'] .katex").color,
      parseError: style("[data-testid='inline-math'] .katex-error").color,
      inputText: input.color,
      inputBackground: input.backgroundColor,
      inputBorder: input.borderTopColor,
    };
  });
  await selectSettledTheme(page, "sentinel-light-a");
  const first = await read();
  await selectSettledTheme(page, "sentinel-light-b");
  const second = await read();

  expect(first.blockEquation).toBe(first.editorText);
  expect(first.inlineEquation).toBe(first.editorText);
  for (const key of Object.keys(first)) {
    expect(second[key], `${key} follows the theme`).not.toBe(first[key]);
  }

  // The inline equation's editor opens in a portal on the body.
  await page.keyboard.press("Escape");
  const readPopover = () => page.evaluate(() => {
    const popover = getComputedStyle(document.querySelector("[data-testid='inline-math-popover']"));
    const input = getComputedStyle(document.querySelector("[data-testid='inline-math-input']"));
    return {
      background: popover.backgroundColor,
      border: popover.borderTopColor,
      inputText: input.color,
      inputBackground: input.backgroundColor,
    };
  });
  await page.locator(INLINE_MATH).first().click();
  await expect(page.getByTestId("inline-math-input")).toBeFocused();
  const popoverSecond = await readPopover();
  await selectSettledTheme(page, "sentinel-light-a");
  const popoverFirst = await readPopover();
  for (const key of Object.keys(popoverFirst)) {
    expect(popoverSecond[key], `popover ${key} follows the theme`).not.toBe(popoverFirst[key]);
  }
});
