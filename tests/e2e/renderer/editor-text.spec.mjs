import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  expectBlockNoteFloatingMenuInsideViewport,
  expectEditorFocused,
  getInlineStyledTextBackground,
  getInlineStyledTextColor,
  loadTemplatePreview,
  modifierShortcut,
  pasteClipboardText,
  pastePlainText,
  readComputedStyleWhileExporting,
  selectAppTheme,
  selectAppThemeThroughTestHook,
  waitForEditorSelection,
} from "../support/renderer-helpers.mjs";

// Tests tagged OPENS_OWN_PAGE open the page themselves (with the dev-only theme hook, or a stub
// bridge installed first), so the page loads once.
const OPENS_OWN_PAGE = "@opens-own-page";

test.beforeEach(async ({ page }, testInfo) => {
  if (testInfo.tags.includes(OPENS_OWN_PAGE)) return;
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

test("prettifies supported code blocks and copies code from upper-right actions", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, [
    "```javascript",
    "const answer={value:42,items:[1,2]}",
    "```",
  ].join("\n"));

  const codeBlock = page
    .locator("[data-content-type='codeBlock']")
    .filter({ hasText: "const answer" });
  const code = codeBlock.locator("code");
  const toolbar = page.getByRole("toolbar", {
    name: "JavaScript code block actions",
  });
  await expect(toolbar).toBeVisible();
  const prettifyButton = toolbar.getByRole("button", {
    name: "Prettify JavaScript code",
  });
  await expect(prettifyButton).toBeEnabled();
  await expect(prettifyButton).toHaveText("Prettify");
  await expect(toolbar.getByRole("button", { name: "Copy JavaScript code" }))
    .toBeEnabled();

  const geometry = await page.evaluate(() => {
    const block = [...document.querySelectorAll("[data-content-type='codeBlock']")]
      .find((element) => element.textContent.includes("const answer"));
    const toolbar = document.querySelector(
      ".code-block-tools[aria-label='JavaScript code block actions']",
    );
    const code = block.querySelector("code");
    const blockRect = block.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const codeRect = code.getBoundingClientRect();
    return {
      rightGap: blockRect.right - toolbarRect.right,
      topGap: toolbarRect.top - blockRect.top,
      codeClearance: codeRect.top - toolbarRect.bottom,
    };
  });
  expect(geometry.rightGap).toBeGreaterThanOrEqual(6);
  expect(geometry.rightGap).toBeLessThanOrEqual(12);
  expect(geometry.topGap).toBeGreaterThanOrEqual(6);
  expect(geometry.topGap).toBeLessThanOrEqual(11);
  expect(geometry.codeClearance).toBeGreaterThanOrEqual(3);

  await prettifyButton.click();
  const formattedCode = "const answer = { value: 42, items: [1, 2] };";
  await expect(code).toHaveText(formattedCode);
  const formattedButton = toolbar.getByRole("button", {
    name: "JavaScript code prettified",
  });
  await expect(formattedButton).toHaveText("Formatted");

  await expect(toolbar.getByRole("button", { name: "Prettify JavaScript code" }))
    .toHaveText("Prettify", { timeout: 2500 });
  await toolbar.getByRole("button", { name: "Prettify JavaScript code" }).click();
  await expect(toolbar.getByRole("button", {
    name: "JavaScript code is already formatted",
  })).toHaveText("Already formatted");

  await toolbar.getByRole("button", { name: "Copy JavaScript code" }).click();
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(formattedCode);
  await expect(toolbar.getByRole("button", { name: "JavaScript code copied" }))
    .toBeVisible();
});

// The highlighted JavaScript block, its `const` keyword and a plain text block, as rendered.
async function readCodeColours(page) {
  return await page.evaluate(() => {
    const blocks = [...document.querySelectorAll(".bn-editor [data-content-type='codeBlock']")];
    const javascript = blocks.find((block) => block.textContent.includes("const answer"));
    const plain = blocks.find((block) => block.textContent.includes("plain words"));
    const keyword = [...javascript.querySelectorAll("code span")].find((span) => span.textContent === "const");
    return {
      javascriptBackground: getComputedStyle(javascript).backgroundColor,
      javascriptColorScheme: getComputedStyle(javascript).colorScheme,
      keyword: keyword ? getComputedStyle(keyword).color : null,
      plainBackground: getComputedStyle(plain).backgroundColor,
      // The block alone paints: a pre painting too would cover the block's edge down its sides.
      preBackgrounds: [...new Set(blocks.map((block) => getComputedStyle(block.querySelector("pre")).backgroundColor))],
    };
  });
}

test("code blocks follow the theme", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, [
    "```javascript",
    "const answer = 42;",
    "```",
    "",
    "```text",
    "plain words",
    "```",
  ].join("\n"));
  await page.evaluate(() => {
    window.__codeThemeNoReload = true;
  });

  // NotePane Light: github-dark highlighting on one GitHub dark surface, highlighted or plain.
  const transparentPre = ["rgba(0, 0, 0, 0)"];
  const notePaneColours = {
    javascriptBackground: "rgb(36, 41, 46)",
    javascriptColorScheme: "dark",
    keyword: "rgb(249, 117, 131)",
    plainBackground: "rgb(36, 41, 46)",
    preBackgrounds: transparentPre,
  };
  await expect.poll(() => readCodeColours(page)).toEqual(notePaneColours);

  // Catppuccin Mocha paints code on its #1e1e2e page colour, so the block is that page raised
  // towards the code text; the highlighting keeps the catppuccin-mocha colours.
  await selectAppTheme(page, "catppuccin-mocha");
  await expect.poll(() => readCodeColours(page)).toEqual({
    javascriptBackground: "rgb(44, 45, 62)",
    javascriptColorScheme: "dark",
    keyword: "rgb(203, 166, 247)",
    plainBackground: "rgb(44, 45, 62)",
    preBackgrounds: transparentPre,
  });

  // Catppuccin Latte: a light code block, set a step darker than its #eff1f5 page.
  await selectAppTheme(page, "catppuccin-latte");
  await expect.poll(() => readCodeColours(page)).toEqual({
    javascriptBackground: "rgb(218, 220, 227)",
    javascriptColorScheme: "light",
    keyword: "rgb(136, 57, 239)",
    plainBackground: "rgb(218, 220, 227)",
    preBackgrounds: transparentPre,
  });

  // NotePane Dark: GitHub dark dimmed's #2d333b, a clear step above the #191919 page.
  await selectAppTheme(page, "notepane-dark");
  await expect.poll(() => readCodeColours(page)).toEqual({
    ...notePaneColours,
    javascriptBackground: "rgb(45, 51, 59)",
    plainBackground: "rgb(45, 51, 59)",
  });

  await selectAppTheme(page, "notepane-light");
  await expect.poll(() => readCodeColours(page)).toEqual(notePaneColours);
  expect(await page.evaluate(() => window.__codeThemeNoReload)).toBe(true);
});

// Runs in the page before the app loads. A minimal preload bridge: one note whose saved version
// holds a JavaScript code block.
function stubVersionHistoryBridge() {
  const now = Date.UTC(2026, 9, 20, 9, 0, 0);
  const blocksJSON = JSON.stringify([
    { type: "paragraph", content: "History note" },
    { type: "codeBlock", props: { language: "javascript" }, content: "const saved = 1;" },
  ]);
  const note = {
    id: "history-note",
    title: "History note",
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
    listNoteVersions: async () => [
      { id: "version-1", noteId: note.id, title: note.title, blocksJSON, source: "manual", createdAt: now - 60_000 },
    ],
  };
}

test("the version history preview recolours its code blocks with the theme", { tag: OPENS_OWN_PAGE }, async ({ page }) => {
  await page.addInitScript(stubVersionHistoryBridge);
  // Version history covers Preferences, so the theme changes through the dev-only hook that
  // `?sentinelThemes` installs.
  await page.goto("/?sentinelThemes=1");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  await page.getByTestId("session-sidebar-footer").getByRole("button", { name: "Version history" }).click();
  const preview = page.getByRole("dialog", { name: "Version history" }).getByLabel("Version preview");
  const keyword = preview.locator("[data-content-type='codeBlock'] code span", { hasText: /^const$/ });
  const block = preview.locator("[data-content-type='codeBlock']");

  await expect(keyword).toHaveCSS("color", "rgb(249, 117, 131)");
  await expect(block).toHaveCSS("background-color", "rgb(36, 41, 46)");
  await selectAppThemeThroughTestHook(page, "catppuccin-mocha");
  await expect(keyword).toHaveCSS("color", "rgb(203, 166, 247)");
  await expect(block).toHaveCSS("background-color", "rgb(44, 45, 62)");
  await selectAppThemeThroughTestHook(page, "notepane-light");
  await expect(keyword).toHaveCSS("color", "rgb(249, 117, 131)");
  await expect(block).toHaveCSS("background-color", "rgb(36, 41, 46)");
});

test("keeps copy available when a code language has no browser formatter", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, [
    "```python",
    "result={'value':42}",
    "```",
  ].join("\n"));
  const pythonToolbar = page.getByRole("toolbar", {
    name: "Python code block actions",
  });
  await expect(pythonToolbar).toBeVisible();
  await expect(
    pythonToolbar.getByRole("button", { name: "Prettify unavailable for Python" }),
  ).toBeDisabled();
  await expect(
    pythonToolbar.getByRole("button", { name: "Prettify unavailable for Python" }),
  ).toHaveText("Prettify");
  await expect(pythonToolbar.getByRole("button", { name: "Copy Python code" }))
    .toBeEnabled();
});

test("selects only the current code block with Command+A", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, [
    "Before code block",
    "",
    "```javascript",
    "const first = 1;",
    "const second = 2;",
    "```",
    "",
    "After code block",
  ].join("\n"));

  const code = page.locator("[data-content-type='codeBlock'] code").first();
  await code.click();
  await waitForEditorSelection(page);
  await page.keyboard.press(modifierShortcut("A"));

  const selectedText = await page.evaluate(
    () => window.getSelection()?.toString() ?? "",
  );
  expect(selectedText).toBe("const first = 1;\nconst second = 2;");
  expect(selectedText).not.toContain("Before code block");
  expect(selectedText).not.toContain("After code block");

  await page.keyboard.press(modifierShortcut("C"));
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("const first = 1;\nconst second = 2;");
  const editorSurface = page.getByTestId("sticky-editor-surface");
  await expect(editorSurface.getByText("Before code block", { exact: true }))
    .toBeVisible();
  await expect(editorSurface.getByText("After code block", { exact: true }))
    .toBeVisible();
});

test("indents and dedents code lines with Tab and Shift+Tab inside the code block", async ({ page }) => {
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("- list parent");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("``` ");
  await page.keyboard.type("function a() {");
  await page.keyboard.press("Enter");
  await page.keyboard.type("return 1;");
  await page.keyboard.press("Enter");
  await page.keyboard.type("}");

  const code = page.locator(".bn-editor [data-content-type='codeBlock'] code");
  const codeText = () => code.evaluate((element) => element.textContent);
  // The code block is the list item's child, so it sits one block group deeper.
  const codeDepth = () => code.evaluate((element) => {
    let depth = 0;
    for (let node = element.parentElement; node; node = node.parentElement) {
      if (node.classList.contains("bn-block-group")) depth += 1;
    }
    return depth;
  });
  await expect.poll(codeText).toBe("function a() {\nreturn 1;\n}");
  const nestedDepth = await codeDepth();
  expect(nestedDepth).toBe(2);

  await page.keyboard.press(modifierShortcut("A"));
  await waitForEditorSelection(page);
  await page.keyboard.press("Tab");
  await expect.poll(codeText).toBe("  function a() {\n  return 1;\n  }");
  await page.keyboard.press("Tab");
  await expect.poll(codeText).toBe("    function a() {\n    return 1;\n    }");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect.poll(codeText).toBe("function a() {\nreturn 1;\n}");
  expect(await codeDepth()).toBe(nestedDepth);

  // A selection inside one line indents that whole line and keeps the rest. ArrowRight leaves the
  // caret at the end of the note, where BlockNote's trailing block swallows (Shift+)ArrowRight, so
  // the selection keys wait until ProseMirror has taken up the caret that Home moved.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Home");
  await waitForEditorSelection(page);
  for (let step = 0; step < "return 1;".length; step += 1) {
    await page.keyboard.press("Shift+ArrowRight");
  }
  await waitForEditorSelection(page);
  expect(await page.evaluate(() => String(window.getSelection()))).toBe("return 1;");
  await page.keyboard.press("Tab");
  await expect.poll(codeText).toBe("function a() {\n  return 1;\n}");

  // A caret Tab still types two spaces; Shift+Tab takes the line's indent away.
  await page.keyboard.press("ArrowRight");
  await waitForEditorSelection(page);
  await page.keyboard.press("Tab");
  await expect.poll(codeText).toBe("function a() {\n  return 1;  \n}");
  await page.keyboard.press("Shift+Tab");
  await expect.poll(codeText).toBe("function a() {\nreturn 1;  \n}");
  // With no indent left, Shift+Tab still leaves the code block in its list item.
  await page.keyboard.press("Shift+Tab");
  await expect.poll(codeText).toBe("function a() {\nreturn 1;  \n}");
  expect(await codeDepth()).toBe(nestedDepth);
});

// A table, image or divider at an edge of the note used to be left out of Command+A.
test("selects a note that starts with an image or a divider with Command+A", async ({ page }) => {
  const imageSource =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAKg4DAZbI8WEAAAAASUVORK5CYII=";
  const editor = page.locator(".bn-editor");
  for (const { first, firstBlock, removeKey } of [
    { first: "---", firstBlock: "[data-content-type='divider']", removeKey: "Backspace" },
    { first: `![first](${imageSource})`, firstBlock: "img.bn-visual-media", removeKey: modifierShortcut("X") },
  ]) {
    await createBlankSession(page);
    await clickLastEmptyParagraph(page);
    await pastePlainText(page, [first, "", "middle", "", "- last"].join("\n"));
    await expect(editor.locator(firstBlock)).toHaveCount(1);
    await editor.getByText("middle", { exact: true }).click();
    await waitForEditorSelection(page);

    await page.keyboard.press(modifierShortcut("A"));
    await waitForEditorSelection(page);
    await page.keyboard.press(removeKey);

    await expect(editor.locator(firstBlock)).toHaveCount(0);
    await expect(editor.getByText("middle", { exact: true })).toHaveCount(0);
    await expect(editor.getByText("last", { exact: true })).toHaveCount(0);
    await expect(editor.locator(".bn-block-content")).toHaveCount(1);
  }
});

test("types Korean or presses Enter over a Command+A note that starts with a divider or table", async ({ page }) => {
  const editor = page.locator(".bn-editor");
  for (const { first, firstBlock, key } of [
    { first: "---", firstBlock: "[data-content-type='divider']", key: "korean" },
    { first: "| a1 | b1 |\n| --- | --- |\n| a2 | b2 |", firstBlock: "table", key: "korean" },
    { first: "---", firstBlock: "[data-content-type='divider']", key: "Enter" },
    { first: "| a1 | b1 |\n| --- | --- |\n| a2 | b2 |", firstBlock: "table", key: "Enter" },
  ]) {
    await createBlankSession(page);
    await clickLastEmptyParagraph(page);
    await pastePlainText(page, [first, "", "middle", "", "- last"].join("\n"));
    await expect(editor.locator(firstBlock)).toHaveCount(1);
    await editor.getByText("middle", { exact: true }).click();
    await waitForEditorSelection(page);
    await page.keyboard.press(modifierShortcut("A"));
    await waitForEditorSelection(page);

    if (key === "korean") {
      // The compositions Chrome reports while a Korean IME types 한.
      const cdp = await page.context().newCDPSession(page);
      for (const text of ["ㅎ", "하", "한"]) {
        await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
      }
      await cdp.send("Input.insertText", { text: "한" });
      await expect(editor.locator(".bn-block-content")).toHaveText(["한"]);
    } else {
      await page.keyboard.press("Enter");
      await page.keyboard.type("typed");
      await expect(editor.locator(".bn-block-content")).toHaveText(["", "typed"]);
    }
    await expect(editor.locator(firstBlock)).toHaveCount(0);
  }
});

// As in Notion, deleting a whole Command+A note leaves one empty paragraph, whatever its first block.
test("leaves one empty paragraph after Backspace or Delete on a Command+A note that starts with a callout", async ({ page }) => {
  const editor = page.locator(".bn-editor");
  const blockRows = () => editor.locator(".bn-block-content").evaluateAll((elements) =>
    elements.map((element) => `${element.dataset.contentType}:${element.textContent}`));
  for (const key of ["Backspace", "Delete"]) {
    await createBlankSession(page);
    await clickLastEmptyParagraph(page);
    await pastePlainText(page, ["first", "", "middle", "", "- last"].join("\n"));
    // `/callout` in the emptied first block turns that block into a callout.
    await editor.getByText("first", { exact: true }).click();
    await waitForEditorSelection(page);
    await page.keyboard.press("End");
    await page.keyboard.press("Shift+Home");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("/callout");
    await expect(page.locator(".bn-suggestion-menu").getByText("Callout", { exact: true })).toBeVisible();
    await page.keyboard.press("Enter");
    await page.keyboard.type("Box");
    await expect(editor.locator("[data-content-type='callout'] .bn-inline-content")).toHaveText("Box");
    await editor.getByText("middle", { exact: true }).click();
    await waitForEditorSelection(page);

    await page.keyboard.press(modifierShortcut("A"));
    await waitForEditorSelection(page);
    await page.keyboard.press(key);

    await expect.poll(blockRows).toEqual(["paragraph:"]);
    await page.keyboard.type("typed");
    await expect.poll(blockRows).toEqual(["paragraph:typed"]);
  }
});

test("keeps a note's only block when its own text is selected and deleted", async ({ page }) => {
  const editor = page.locator(".bn-editor");
  // A note that is one code block: Command+A inside it selects the code alone.
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("```");
  await page.keyboard.press("Space");
  await page.keyboard.type("lone code");
  await expect(editor.locator("[data-content-type='codeBlock']")).toContainText("lone code");
  await page.keyboard.press(modifierShortcut("A"));
  await page.keyboard.press("Backspace");
  await expect(editor.locator("[data-content-type='codeBlock']")).toHaveCount(1);
  await expect(editor.locator("[data-content-type='codeBlock']")).not.toContainText("lone code");

  // A note that is one heading, its text selected by hand.
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("# Lone heading");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("Backspace");
  await expect(editor.locator("[data-content-type='heading']")).toHaveCount(1);
  await expect(editor.locator("[data-content-type='heading']")).toHaveText("");
});

test("gives back a Markdown mark shortcut on Backspace after a modifier key", async ({ page }) => {
  const editor = page.locator(".bn-editor");
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("**bold**");
  await expect(editor.locator("strong", { hasText: "bold" })).toHaveCount(1);
  // Shift alone, as when switching the Korean IME or reaching for another key, types nothing.
  await page.keyboard.press("Shift");
  await page.keyboard.press("Backspace");

  await expect(editor.locator("strong")).toHaveCount(0);
  await expect(editor.getByText("**bold**", { exact: true })).toBeVisible();
});

test("keeps Enter and Shift+Enter behavior in the editor", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("first line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("second line");
  await page.keyboard.press("Enter");
  await page.keyboard.type("next block");

  const editorSurface = page.getByTestId("sticky-editor-surface");
  await expect(editorSurface.getByText("first line")).toBeVisible();
  await expect(editorSurface.getByText("second line")).toBeVisible();
  await expect(editorSurface.getByText("next block")).toBeVisible();

  const blockCount = await page
    .locator(".bn-block-outer")
    .filter({ hasText: "next block" })
    .count();
  expect(blockCount).toBeGreaterThan(0);
});

test("copies Shift+Enter line breaks without markdown escape characters", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("first copied line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("second copied line");
  await page.keyboard.press(modifierShortcut("A"));

  const copiedPlainText = await page.evaluate(() => {
    const editor = document.querySelector(".bn-editor");
    const clipboardData = new DataTransfer();
    editor.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
    return clipboardData.getData("text/plain");
  });

  expect(copiedPlainText).toBe("first copied line\nsecond copied line");
  expect(copiedPlainText).not.toContain("first copied line\\\nsecond copied line");
});

test("copies editor blocks without a structural trailing newline", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("first copied block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second copied block");
  await page.keyboard.press(modifierShortcut("A"));

  const copiedPlainText = await page.evaluate(() => {
    const editor = document.querySelector(".bn-editor");
    const clipboardData = new DataTransfer();
    editor.dispatchEvent(
      new ClipboardEvent("copy", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
    return clipboardData.getData("text/plain");
  });

  expect(copiedPlainText).toBe("first copied block\n\nsecond copied block");
});

test("pastes markdown headings from a rich clipboard as native headings", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await pasteClipboardText(page, {
    plainText:
      "# Heading one\n## Heading two\n### Heading three\n\n[Explicit link](https://example.com/explicit)",
    html:
      "<p># Heading one</p><p>## Heading two</p><p>### Heading three</p><p>[Explicit link](https://example.com/explicit)</p>",
  });

  await expect(page.getByRole("heading", { name: "Heading one", level: 1 }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Heading two", level: 2 }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Heading three", level: 3 }))
    .toBeVisible();
  await expect(page.getByText("# Heading one", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Explicit link" }))
    .toHaveAttribute("href", "https://example.com/explicit");
});

// A heading that starts with "1. " made the plain text look like a Markdown list, which threw
// away the heading, the table and the bold text that the HTML carried.
test("keeps rich HTML structure when its plain text happens to look like Markdown", async ({ page }) => {
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await pasteClipboardText(page, {
    plainText: "1. 개요\n본 문서는 중요 내용을 담습니다.\n항목\t값\nA\t3",
    html:
      "<meta charset=\"utf-8\"><h1>1. 개요</h1><p>본 문서는 <b>중요</b> 내용을 담습니다.</p>" +
      "<table><tr><td>항목</td><td>값</td></tr><tr><td>A</td><td>3</td></tr></table>",
  });

  const editor = page.locator(".bn-editor");
  await expect(page.getByRole("heading", { name: "1. 개요", level: 1 })).toBeVisible();
  await expect(editor.locator("[data-content-type='numberedListItem']")).toHaveCount(0);
  await expect(editor.locator("table")).toHaveCount(1);
  await expect(editor.getByRole("cell", { name: "항목" })).toBeVisible();
  await expect(editor.locator("strong", { hasText: "중요" })).toHaveCount(1);

  // HTML that only styles the same text, as a code editor writes it, is still read as Markdown.
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await pasteClipboardText(page, {
    plainText: "## Wrapped heading\n- wrapped item",
    html:
      "<div style=\"color: #333\"><div><span style=\"color: #00f\">## Wrapped heading</span></div>" +
      "<div><span>- wrapped item</span></div></div>",
  });
  await expect(page.getByRole("heading", { name: "Wrapped heading", level: 2 })).toBeVisible();
  await expect(editor.locator("[data-content-type='bulletListItem']", { hasText: "wrapped item" }))
    .toHaveCount(1);
});

test("reads a paste as Markdown when its plain text writes the HTML's structure", async ({ page }) => {
  const editor = page.locator(".bn-editor");
  // A chat app: the Markdown lines in paragraphs, with a URL linked.
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await pasteClipboardText(page, {
    plainText: "# Chat heading\n- chat item https://example.com",
    html: "<p># Chat heading</p><p>- chat item <a href=\"https://example.com\">https://example.com</a></p>",
  });
  await expect(page.getByRole("heading", { name: "Chat heading", level: 1 })).toBeVisible();
  await expect(editor.locator("[data-content-type='bulletListItem']", { hasText: "chat item" }))
    .toHaveCount(1);

  // Notion: real HTML structure, and Markdown plain text that also keeps a checked to-do.
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await pasteClipboardText(page, {
    plainText: "# Plan\n- [x] Done item\n- [ ] Open item",
    html: "<h1>Plan</h1><ul><li>Done item</li><li>Open item</li></ul>",
  });
  await expect(page.getByRole("heading", { name: "Plan", level: 1 })).toBeVisible();
  const toDos = editor.locator("[data-content-type='checkListItem']");
  await expect(toDos).toHaveCount(2);
  await expect(toDos.first().locator("input[type='checkbox']")).toBeChecked();
});

test("replaces selected text when pasting a URL instead of turning it into link text", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("replace this selected text");
  await page.keyboard.press(modifierShortcut("A"));
  await pastePlainText(page, "https://example.com/replacement");

  const editorSurface = page.getByTestId("sticky-editor-surface");
  await expect(editorSurface.getByText("https://example.com/replacement"))
    .toBeVisible();
  await expect(editorSurface.getByText("replace this selected text"))
    .toHaveCount(0);
});

test("pastes a markdown table written without edge pipes as one row per line", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, "Name | Role\n--- | ---\nAda | Engineer\nGrace | Admiral");

  await expect.poll(async () => page.evaluate(() => {
    const table = [...document.querySelectorAll(".bn-editor table")]
      .find((candidate) => candidate.textContent.includes("Grace"));
    if (!table) return null;
    return [...table.querySelectorAll("tr")].map((row) =>
      [...row.cells].map((cell) => cell.textContent.trim()),
    );
  })).toEqual([
    ["Name", "Role"],
    ["Ada", "Engineer"],
    ["Grace", "Admiral"],
  ]);
});

test("pastes wrapped markdown tables without breaking table cells into paragraphs", async ({ page }) => {
  const wrappedMarkdown = `ZDR을 적용할 수 있고 입력과 출력을 모델 학습에 사용하지 않는 provider를 정리했다.

## 직접 호출 가능한 Provider

| Provider | ZDR | Data Collection | 결과 |
| --- | --- | --- | --- |
| Amazon Bedrock | 가능: data_retention_mode=none | Prompt·response를 durable storage에 기록하지 않음
Model provider에 전달하지 않음
Usage metadata 수집 여부는 현재 링크에서 확인되지 않음 | **Training 근거 필요** |
| Together AI | 가능: 입력·출력 기본 미저장 | Input·output 기본 미저장
Training opt-in을 켜지 않음 | **사용 가능** |`;

  await clickLastEmptyParagraph(page);
  await pastePlainText(page, wrappedMarkdown);

  await expect(page.getByRole("heading", { name: "직접 호출 가능한 Provider" }))
    .toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    return [...document.querySelectorAll(".bn-editor table")]
      .some((table) => table.textContent.includes("Amazon Bedrock"));
  })).toBe(true);

  const pastedTable = await page.evaluate(() => {
    const tables = [...document.querySelectorAll(".bn-editor table")];
    const table = tables.find((candidate) =>
      candidate.textContent.includes("Amazon Bedrock"),
    );
    const tableRows = [...table.querySelectorAll("tr")];
    const headers = [...tableRows[0].cells].map((cell) => cell.textContent.trim());
    const rows = tableRows.slice(1).map((row) =>
      [...row.cells].map((cell) => cell.textContent.trim()),
    );

    return {
      headers,
      rows,
      text: table.textContent,
      tableCount: tables.length,
    };
  });

  expect(pastedTable.tableCount).toBeGreaterThanOrEqual(1);
  expect(pastedTable.headers).toEqual([
    "Provider",
    "ZDR",
    "Data Collection",
    "결과",
  ]);
  expect(pastedTable.rows).toHaveLength(2);
  expect(pastedTable.rows[0]).toHaveLength(4);
  expect(pastedTable.rows[1]).toHaveLength(4);
  expect(pastedTable.text).toContain("Amazon Bedrock");
  expect(pastedTable.text).toContain("Model provider에 전달하지 않음");
  expect(pastedTable.text).toContain("Usage metadata 수집 여부는 현재 링크에서 확인되지 않음");
  expect(pastedTable.text).toContain("Training opt-in을 켜지 않음");
});

test("shows floating formatting toolbar after text selection", async ({ page }) => {
  await loadTemplatePreview(page);
  const styledText = page.getByText("Styled Text");
  await styledText.scrollIntoViewIfNeeded();
  await styledText.dblclick();

  const formattingToolbar = page.locator(".bn-formatting-toolbar");
  await expect(formattingToolbar).toBeVisible();
  await expect(formattingToolbar).toHaveClass(/notepane-formatting-toolbar/);

  const blockTypeButton = formattingToolbar
    .locator(".notepane-formatting-type-row")
    .getByRole("button");
  await expect(blockTypeButton).toHaveText(/paragraph/i);

  const textFormatting = formattingToolbar.getByRole("group", {
    name: "Text formatting",
  });
  for (const buttonName of [
    "Colors",
    "Bold",
    "Italic",
    "Underline",
    "Strike",
    "Create link",
    "Code",
    "Align text left",
    "Align text center",
    "Align text right",
  ]) {
    await expect(textFormatting.getByRole("button", { name: buttonName }))
      .toBeVisible();
  }

  const geometry = await formattingToolbar.evaluate((toolbar) => {
    const toolbarRect = toolbar.getBoundingClientRect();
    const blockTypeRect = toolbar
      .querySelector(".notepane-formatting-type-row button")
      .getBoundingClientRect();
    const actionButtons = [...toolbar.querySelectorAll(
      ".notepane-formatting-actions button",
    )];
    const rowTops = [...new Set(actionButtons.map((button) =>
      Math.round(button.getBoundingClientRect().top),
    ))];

    return {
      toolbarWidth: toolbarRect.width,
      blockTypeWidth: blockTypeRect.width,
      actionButtonCount: actionButtons.length,
      actionRowCount: rowTops.length,
    };
  });
  expect(geometry.toolbarWidth).toBeGreaterThanOrEqual(180);
  expect(geometry.toolbarWidth).toBeLessThanOrEqual(200);
  expect(geometry.blockTypeWidth).toBeGreaterThanOrEqual(160);
  expect(geometry.actionButtonCount).toBe(10);
  expect(geometry.actionRowCount).toBe(2);

  await textFormatting.getByRole("button", { name: "Bold" }).hover();
  const tooltip = page.locator(".mantine-Tooltip-tooltip:visible .bn-tooltip");
  await expect(tooltip).toBeVisible();
  const tooltipStyle = await tooltip.evaluate((element) => ({
    backgroundColor: getComputedStyle(element).backgroundColor,
    fontSize: getComputedStyle(element.querySelector(".mantine-Text-root")).fontSize,
  }));
  expect(tooltipStyle.backgroundColor).toBe("rgb(47, 52, 55)");
  expect(Number.parseFloat(tooltipStyle.fontSize)).toBeLessThanOrEqual(10);

  await page.mouse.move(20, 20);
  await blockTypeButton.click();
  const blockTypeMenu = page.locator(".bn-select:visible");
  await expect(blockTypeMenu).toBeVisible();
  const headingTwo = blockTypeMenu.getByRole("menuitem", {
    name: "Heading 2",
    exact: true,
  });
  const iconLabelGap = await headingTwo.evaluate((item) => {
    const icon = item.querySelector(".mantine-Menu-itemSection[data-position='left']");
    const label = item.querySelector(".mantine-Menu-itemLabel");
    return label.getBoundingClientRect().left - icon.getBoundingClientRect().right;
  });
  expect(iconLabelGap).toBeGreaterThanOrEqual(8);

  await expect(blockTypeMenu.getByRole("menuitem", {
    name: "Heading 5",
    exact: true,
  })).toHaveCount(0);
  await blockTypeMenu.getByRole("menuitem", {
    name: "Heading 4",
    exact: true,
  }).click();
  await expect(blockTypeButton).toHaveText(/Heading 4/);
  const selectedTypeGap = await blockTypeButton.evaluate((button) => {
    const icon = button.querySelector(
      ".mantine-Button-section[data-position='left']",
    );
    const label = button.querySelector(".mantine-Button-label");
    return label.getBoundingClientRect().left - icon.getBoundingClientRect().right;
  });
  expect(selectedTypeGap).toBeGreaterThanOrEqual(8);
});

test("returns focus to the editor after Escape closes the text selection toolbar", async ({ page }) => {
  await loadTemplatePreview(page);
  const styledText = page.getByText("Styled Text");
  await styledText.scrollIntoViewIfNeeded();
  await styledText.dblclick();

  const formattingToolbar = page.locator(".bn-formatting-toolbar");
  await expect(formattingToolbar).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(formattingToolbar).toBeHidden();
  await expectEditorFocused(page);
});

test("shows an opaque compact link form and creates the selected-text link", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Link target");
  await page.keyboard.press(modifierShortcut("A"));

  const formattingToolbar = page.locator(".bn-formatting-toolbar");
  await formattingToolbar.getByRole("button", { name: "Create link" }).click();

  const linkForm = page.locator(".bn-form-popover:visible");
  const urlInput = linkForm.getByPlaceholder("Edit URL");
  await expect(urlInput).toBeVisible();
  const formStyle = await linkForm.evaluate((element) => ({
    backgroundColor: getComputedStyle(element).backgroundColor,
    borderStyle: getComputedStyle(element).borderStyle,
    boxShadow: getComputedStyle(element).boxShadow,
    inputFontSize: getComputedStyle(element.querySelector("input")).fontSize,
    inputPaddingLeft: getComputedStyle(element.querySelector("input")).paddingLeft,
  }));
  expect(formStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(formStyle.borderStyle).toBe("solid");
  expect(formStyle.boxShadow).not.toBe("none");
  expect(Number.parseFloat(formStyle.inputFontSize)).toBeLessThanOrEqual(11);
  expect(Number.parseFloat(formStyle.inputPaddingLeft)).toBeGreaterThanOrEqual(28);

  await urlInput.fill("example.com");
  await urlInput.press("Enter");
  await expect(page.getByRole("link", { name: "Link target" }))
    .toHaveAttribute("href", "https://example.com");
});

test("renders Command+E inline code with Notion-like styling and composable colors", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("InlineCode");
  await page.keyboard.press(modifierShortcut("A"));
  await page.keyboard.press(modifierShortcut("E"));

  const inlineCode = page.locator(".bn-inline-content code", { hasText: "InlineCode" });
  await expect(inlineCode).toBeVisible();

  const lightStyle = await inlineCode.evaluate((element) => {
    const style = getComputedStyle(element);
    const parentStyle = getComputedStyle(element.parentElement);
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: Number.parseFloat(style.borderRadius),
      color: style.color,
      fontScale: Number.parseFloat(style.fontSize) / Number.parseFloat(parentStyle.fontSize),
      fontWeight: style.fontWeight,
      paddingLeft: Number.parseFloat(style.paddingLeft),
    };
  });
  expect(lightStyle.backgroundColor).toBe("rgba(135, 131, 120, 0.16)");
  expect(lightStyle.borderRadius).toBe(3);
  expect(lightStyle.color).toBe("rgb(189, 63, 63)");
  expect(lightStyle.fontScale).toBeCloseTo(0.85, 2);
  expect(lightStyle.fontWeight).toBe("500");
  expect(lightStyle.paddingLeft).toBeGreaterThanOrEqual(3);

  await inlineCode.dblclick();
  const formattingToolbar = page.locator(".bn-formatting-toolbar");
  await expect(formattingToolbar).toBeVisible();
  await formattingToolbar.getByRole("button", { name: "Colors" }).click();
  await page.locator(".bn-color-picker-dropdown:visible [data-test='text-color-blue']")
    .click();
  await expect.poll(async () =>
    getInlineStyledTextColor(page, "InlineCode", "textColor", "blue"),
  ).toBe("rgb(11, 110, 153)");
  await expect(inlineCode).toBeVisible();

  await page.keyboard.press("Escape");
  await inlineCode.dblclick();
  await expect(formattingToolbar).toBeVisible();
  await formattingToolbar.getByRole("button", { name: "Colors" }).click();
  await page.locator(".bn-color-picker-dropdown:visible [data-test='background-color-yellow']")
    .click();
  await expect.poll(async () =>
    getInlineStyledTextBackground(page, "InlineCode", "backgroundColor", "yellow"),
  ).toBe("rgb(251, 243, 219)");
  await expect(inlineCode).toBeVisible();

  await selectAppTheme(page, "notepane-dark");
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-theme-mode", "dark");
  await expect.poll(async () => await inlineCode.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
    };
  })).toEqual({
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    color: "rgb(255, 138, 128)",
  });

  // A PDF export sets is-exporting and applies NotePane Light through withExportTheme.
  const exportStyle = await readComputedStyleWhileExporting(inlineCode, ["backgroundColor", "color"]);
  expect(exportStyle).toEqual({
    backgroundColor: "rgba(135, 131, 120, 0.16)",
    color: "rgb(189, 63, 63)",
  });
});

test("shows recent colors and reapplies the latest color with Command+Shift+H", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("First");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second");

  const editor = page.locator(".bn-editor");
  const first = editor.getByText("First", { exact: true });
  const second = editor.getByText("Second", { exact: true });
  const formattingToolbar = page.locator(".bn-formatting-toolbar");

  await first.dblclick();
  await expect(formattingToolbar).toBeVisible();
  await formattingToolbar.getByRole("button", { name: "Colors" }).click();
  const colorMenu = page.locator(".notion-color-picker-dropdown:visible");
  await expect(colorMenu.getByText("Text color", { exact: true })).toBeVisible();
  await expect(colorMenu.getByText("Background color", { exact: true })).toBeVisible();
  await expect(colorMenu.locator("[data-test^='text-color-']")).toHaveCount(10);
  await expect(colorMenu.locator("[data-test^='background-color-']")).toHaveCount(10);
  const paletteColors = await colorMenu.evaluate((element) => {
    const textColors = [...element.querySelectorAll(
      ".notion-color-swatch[data-color-kind='text'] .notepane-editor-color-icon",
    )].map((icon) => getComputedStyle(icon).color);
    const backgroundColors = [...element.querySelectorAll(
      ".notion-color-swatch[data-color-kind='background'] .notepane-editor-color-icon",
    )].map((icon) => getComputedStyle(icon).backgroundColor);
    const yellowBackground = getComputedStyle(element.querySelector(
      ".notion-color-swatch[data-color-kind='background'][data-color-value='yellow'] .notepane-editor-color-icon",
    )).backgroundColor;
    return {
      distinctBackgroundColors: new Set(backgroundColors).size,
      distinctTextColors: new Set(textColors).size,
      yellowBackground,
    };
  });
  expect(paletteColors.distinctTextColors).toBeGreaterThanOrEqual(9);
  expect(paletteColors.distinctBackgroundColors).toBeGreaterThanOrEqual(9);
  expect(paletteColors.yellowBackground).toBe("rgb(251, 243, 219)");
  await colorMenu.locator("[data-test='background-color-yellow']").click();

  await expect.poll(async () =>
    getInlineStyledTextBackground(page, "First", "backgroundColor", "yellow"),
  ).toBe("rgb(251, 243, 219)");

  await second.dblclick();
  await page.keyboard.press(modifierShortcut("Shift+H"));
  await expect.poll(async () =>
    getInlineStyledTextBackground(page, "Second", "backgroundColor", "yellow"),
  ).toBe("rgb(251, 243, 219)");

  await second.dblclick();
  await expect(formattingToolbar).toBeVisible();
  await formattingToolbar.getByRole("button", { name: "Colors" }).click();
  await expect(colorMenu.getByText("Recently used", { exact: true })).toBeVisible();
  await expect(colorMenu.getByTestId("recent-editor-color-0"))
    .toHaveAttribute("aria-label", "Recent: Yellow background color");
  await colorMenu.locator("[data-test='text-color-blue']").click();

  await expect.poll(async () =>
    getInlineStyledTextColor(page, "Second", "textColor", "blue"),
  ).toBe("rgb(11, 110, 153)");

  await createBlankSession(page);
  await page.keyboard.type("Third");
  const third = page.locator(".bn-editor").getByText("Third", { exact: true });
  await third.dblclick();
  await expect(formattingToolbar).toBeVisible();
  await formattingToolbar.getByRole("button", { name: "Colors" }).click();
  await expect(colorMenu).toBeVisible();
  await expect(colorMenu.getByTestId("recent-editor-color-0"))
    .toHaveAttribute("aria-label", "Recent: Blue text color");
  await expect(colorMenu.getByTestId("recent-editor-color-1"))
    .toHaveAttribute("aria-label", "Recent: Yellow background color");

  await page.keyboard.press("Escape");
  await third.dblclick();
  await page.keyboard.press(modifierShortcut("Shift+H"));
  await expect.poll(async () =>
    getInlineStyledTextColor(page, "Third", "textColor", "blue"),
  ).toBe("rgb(11, 110, 153)");
});

test("keeps BlockNote color and delete menus usable inside the app window", async ({ page }) => {
  await loadTemplatePreview(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("FormatTarget");
  const formattingTarget = page.getByText("FormatTarget");
  await formattingTarget.dblclick();
  const formattingToolbar = page.locator(".bn-formatting-toolbar");
  await expect(formattingToolbar).toBeVisible();
  const colorsButton = formattingToolbar.getByRole("button", { name: "Colors" });
  await colorsButton.click();
  await expect(colorsButton).toHaveAttribute("aria-expanded", "true");

  const colorMenu = page.locator(".bn-color-picker-dropdown:visible");
  await expect(colorMenu).toBeVisible();
  await expectBlockNoteFloatingMenuInsideViewport(
    page,
    ".bn-color-picker-dropdown",
    140,
  );
  await page.locator(".bn-color-picker-dropdown:visible [data-test='text-color-red']").click();

  await expect.poll(async () =>
    getInlineStyledTextColor(page, "FormatTarget", "textColor", "red"),
  ).toBe("rgb(224, 62, 62)");
  await page.keyboard.press("Escape");
  await formattingTarget.dblclick();
  await expect(formattingToolbar).toBeVisible();
  await formattingToolbar.getByRole("button", { name: "Colors" }).click();
  await expect(page.locator(".bn-color-picker-dropdown:visible")).toBeVisible();
  await page.locator(".bn-color-picker-dropdown:visible [data-test='background-color-blue']")
    .click();

  await expect.poll(async () =>
    getInlineStyledTextBackground(page, "FormatTarget", "backgroundColor", "blue"),
  ).toBe("rgb(221, 235, 241)");

  const paragraph = page.locator(".bn-editor").getByText("Objective:", { exact: true });
  await page.keyboard.press("Escape");
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.click();
  const paragraphBox = await paragraph.boundingBox();
  await page.mouse.move(paragraphBox.x - 24, paragraphBox.y + paragraphBox.height / 2);
  const openBlockMenuButton = page.getByRole("button", { name: "Open block menu" });
  await expect(openBlockMenuButton).toBeVisible();
  await openBlockMenuButton.click();

  const blockMenu = page.locator(".bn-drag-handle-menu:visible");
  await expect(blockMenu).toBeVisible();
  await expect(blockMenu.getByRole("menuitem")).toHaveCount(3);
  await expect(blockMenu.locator(".notepane-block-menu-item-content svg"))
    .toHaveCount(3);
  await expect(blockMenu.getByRole("menuitem").last()).toHaveAccessibleName("Delete");
  await expect.poll(() => blockMenu.locator(".notepane-block-menu-icon").evaluateAll((icons) =>
    icons.map((icon) => getComputedStyle(icon).color),
  )).toEqual(["rgb(77, 121, 184)", "rgb(164, 91, 185)", "rgb(193, 74, 74)"]);
  await expectBlockNoteFloatingMenuInsideViewport(page, ".bn-drag-handle-menu", 60);
  await page.getByRole("menuitem", { name: "Turn into" }).click();
  const blockTypeMenu = page.locator(
    ".notepane-block-menu-subpanel[data-panel='turn-into']:visible",
  );
  await expect(blockTypeMenu).toBeVisible();
  await expectBlockNoteFloatingMenuInsideViewport(
    page,
    ".notepane-block-menu-subpanel[data-panel='turn-into']",
    220,
    "absolute",
  );
  await expect.poll(async () => {
    const [parentZIndex, submenuZIndex] = await Promise.all([
      blockMenu.evaluate((element) => Number(getComputedStyle(element).zIndex)),
      blockTypeMenu.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    ]);
    return submenuZIndex > parentZIndex;
  }).toBe(true);
  await blockTypeMenu.getByRole("menuitem", { name: "Heading 2", exact: true }).click();
  await expect(paragraph.locator("xpath=ancestor::h2")).toHaveCount(1);
  await expect(blockMenu).toHaveCount(0);
  await paragraph.click();
  const convertedParagraphBox = await paragraph.boundingBox();
  await page.mouse.move(
    convertedParagraphBox.x - 24,
    convertedParagraphBox.y + convertedParagraphBox.height / 2,
  );
  await openBlockMenuButton.click();
  await expect(blockMenu).toBeVisible();
  const blockMenuTopBeforeColors = await blockMenu.evaluate((element) =>
    Math.round(element.getBoundingClientRect().top),
  );
  await page.getByRole("menuitem", { name: "Colors" }).first().click();
  await expect(page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible"))
    .toBeVisible();
  await expect.poll(async () => {
    const [parentZIndex, submenuZIndex] = await Promise.all([
      blockMenu.evaluate((element) => Number(getComputedStyle(element).zIndex)),
      page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible")
        .evaluate((element) => Number(getComputedStyle(element).zIndex)),
    ]);
    return submenuZIndex > parentZIndex;
  }).toBe(true);
  await expectBlockNoteFloatingMenuInsideViewport(
    page,
    ".notepane-block-menu-subpanel[data-panel='colors']",
    140,
    "absolute",
  );
  await expect.poll(async () =>
    await blockMenu.evaluate((element) =>
      Math.round(element.getBoundingClientRect().top),
    ),
  ).toBe(blockMenuTopBeforeColors);
  await expect.poll(async () =>
    await blockMenu.evaluate((element) => getComputedStyle(element).overflow),
  ).toBe("visible");
  await page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible [data-test='text-color-red']")
    .first()
    .click();

  await expect.poll(async () =>
    paragraph.evaluate((element) => getComputedStyle(element).color),
  ).toBe("rgb(224, 62, 62)");

  await paragraph.click();
  const coloredParagraphBox = await paragraph.boundingBox();
  await page.mouse.move(
    coloredParagraphBox.x - 24,
    coloredParagraphBox.y + coloredParagraphBox.height / 2,
  );
  await openBlockMenuButton.click();
  await page.getByRole("menuitem", { name: "Colors" }).first().click();
  await expect(page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible"))
    .toBeVisible();
  await page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible [data-test='background-color-blue']")
    .first()
    .click();

  await expect.poll(async () =>
    paragraph.evaluate((element) =>
      getComputedStyle(element.closest(".bn-block-content")).backgroundColor,
    ),
  ).toBe("rgb(221, 235, 241)");

  await paragraph.click();
  const recoloredParagraphBox = await paragraph.boundingBox();
  await page.mouse.move(
    recoloredParagraphBox.x - 24,
    recoloredParagraphBox.y + recoloredParagraphBox.height / 2,
  );
  await openBlockMenuButton.click();
  await page.getByRole("menuitem", { name: "Colors" }).first().click();
  const openColorMenu = page.locator(
    ".notepane-block-menu-subpanel[data-panel='colors']:visible",
  );
  await expect(openColorMenu).toBeVisible();
  await page.getByRole("menuitem", { name: "Turn into" }).hover();
  await expect(blockTypeMenu).toBeVisible();
  await expect(openColorMenu).toHaveCount(0);
  await expect(page.locator(".notepane-block-menu-subpanel")).toHaveCount(1);

  await paragraph.click();
  const finalParagraphBox = await paragraph.boundingBox();
  await page.mouse.move(
    finalParagraphBox.x - 24,
    finalParagraphBox.y + finalParagraphBox.height / 2,
  );
  await openBlockMenuButton.click();
  await page.keyboard.press("Delete");

  await expect(page.locator(".bn-editor").getByText("Objective:", { exact: true }))
    .toHaveCount(0);

  const table = page.getByRole("table");
  const tableBox = await table.boundingBox();
  await page.mouse.move(tableBox.x + 20, tableBox.y + 20);
  await expect(openBlockMenuButton).toBeVisible();
  await openBlockMenuButton.click();
  // Colors, the table items (Fit to width, Header row, Header column) and Delete; a table has no
  // text that Turn into could keep.
  const tableMenuItems = page.locator(".bn-drag-handle-menu:visible").getByRole("menuitem");
  await expect(tableMenuItems).toHaveCount(5);
  await expect(tableMenuItems.filter({ hasText: "Turn into" })).toHaveCount(0);
  await expect(tableMenuItems.filter({ hasText: /^Header row$/ })).toHaveCount(1);
  await expect(tableMenuItems.filter({ hasText: /^Header column$/ })).toHaveCount(1);
});

// Opening Turn into near the bottom of the window used to lift the whole block menu, which moved
// another item under the pointer and switched the open panel.
test("keeps the block menu in place when Turn into opens near the bottom of the window", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 620 });
  await clickLastEmptyParagraph(page);
  for (let index = 0; index < 9; index += 1) {
    await page.keyboard.type(`Line ${index}`);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type("Bottom line");
  const bottomLine = page.locator(".bn-editor").getByText("Bottom line", { exact: true });
  const blockMenu = await openBlockMenuFor(page, bottomLine);
  const menuTop = async () => Math.round((await blockMenu.boundingBox()).y);
  const topBefore = await menuTop();

  const turnInto = blockMenu.getByText("Turn into", { exact: true });
  const turnIntoBox = await turnInto.boundingBox();
  await page.mouse.move(turnIntoBox.x + 20, turnIntoBox.y + turnIntoBox.height / 2, { steps: 4 });
  const subpanel = page.getByRole("menu", { name: "Turn into" });
  await expect(subpanel).toBeVisible();
  // The pass that keeps floating menus inside the window lifts the subpanel, which opened level with
  // the menu's top, until it clears the window's margin; that same pass used to lift the menu.
  await expect.poll(async () => {
    const subpanelBox = await subpanel.boundingBox();
    return subpanelBox.y < topBefore && subpanelBox.y + subpanelBox.height <= 620 - 8;
  }).toBe(true);

  expect(await menuTop()).toBe(topBefore);
});

async function turnInto(page, blockMenu, target) {
  await blockMenu.getByRole("menuitem", { name: "Turn into" }).click();
  await page.locator(".notepane-block-menu-subpanel[data-panel='turn-into']:visible")
    .getByRole("menuitem", { name: target, exact: true })
    .click();
}

test("keeps a code block's lines when Turn into makes it text", async ({ page }) => {
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, ["Above", "", "```js", "let a = 1;", "let b = 2;", "```"].join("\n"));
  const editor = page.locator(".bn-editor");
  const code = editor.locator("[data-content-type='codeBlock']");
  await expect(code).toHaveCount(1);

  await turnInto(page, await openBlockMenuFor(page, code), "Paragraph");

  await expect(code).toHaveCount(0);
  const paragraph = editor.locator("[data-content-type='paragraph']", { hasText: "let a = 1;" });
  await expect(paragraph).toHaveCount(1);
  // Notion keeps the code's lines as line breaks inside the one block.
  await expect(paragraph.locator("br")).toHaveCount(1);
  expect(await paragraph.evaluate((element) => element.innerText)).toBe("let a = 1;\nlet b = 2;");

  await turnInto(page, await openBlockMenuFor(page, paragraph), "Quote");
  const quote = editor.locator("[data-content-type='quote']");
  await expect(quote).toHaveCount(1);
  expect(await quote.evaluate((element) => element.innerText)).toBe("let a = 1;\nlet b = 2;");
});

test("offers Turn into only for blocks whose text it can keep", async ({ page }) => {
  // Tall enough for its side menu to be found by hovering it.
  const imageSource = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    return canvas.toDataURL("image/png");
  });
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, [
    "Text line", "", "---", "", "| cellA | cellB |", "| --- | --- |", "| c | d |", "",
    `![picture](${imageSource})`, "", "Last line",
  ].join("\n"));
  const editor = page.locator(".bn-editor");

  for (const block of [
    editor.locator("[data-content-type='divider']"),
    editor.locator("[data-content-type='table']"),
    editor.locator("[data-content-type='image']"),
  ]) {
    await expect(block).toHaveCount(1);
    const blockMenu = await openBlockMenuFor(page, block);
    await expect(blockMenu.getByRole("menuitem", { name: "Colors" })).toBeVisible();
    await expect(blockMenu.getByRole("menuitem", { name: "Turn into" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(blockMenu).toHaveCount(0);
  }

  const textLine = editor.getByText("Text line", { exact: true });
  await expect((await openBlockMenuFor(page, textLine)).getByRole("menuitem", { name: "Turn into" }))
    .toBeVisible();
});

test("puts the caret in a paragraph below a divider typed as ---", async ({ page }) => {
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("top");
  await page.keyboard.press("Enter");
  await page.keyboard.type("---");
  await page.keyboard.type("after the divider");

  const blockRows = () => page.locator(".bn-editor .bn-block-content").evaluateAll((elements) =>
    elements.map((element) => `${element.dataset.contentType}:${element.textContent}`));
  await expect.poll(blockRows).toEqual([
    "paragraph:top",
    "divider:",
    "paragraph:after the divider",
  ]);

  // Between two blocks, the text after the divider gets its own paragraph.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("below");
  await page.keyboard.press("ArrowUp");
  await waitForEditorSelection(page);
  await page.keyboard.type("---");
  await page.keyboard.type("between");
  await expect.poll(blockRows).toEqual([
    "paragraph:top",
    "divider:",
    "paragraph:after the divider",
    "divider:",
    "paragraph:between",
    "paragraph:below",
  ]);
});

// BlockNote undoes a Markdown shortcut on the Backspace right after it, and must give back exactly
// the typed marker, space included once, with the caret after it.
test("gives back exactly the typed Markdown shortcut on Backspace right after it", async ({ page }) => {
  // The inline content alone, without a code block's language picker.
  const blockRows = () => page.locator(".bn-editor .bn-block-content").evaluateAll((elements) =>
    elements.map((element) =>
      `${element.dataset.contentType}:${element.querySelector(".bn-inline-content").textContent}`));
  for (const [marker, blockType] of [
    ["- ", "bulletListItem"],
    ["# ", "heading"],
    ["1. ", "numberedListItem"],
    ["[] ", "checkListItem"],
    ["\" ", "quote"],
    ["``` ", "codeBlock"],
  ]) {
    await createBlankSession(page);
    await clickLastEmptyParagraph(page);
    await page.keyboard.type(marker);
    await expect.poll(blockRows).toEqual([`${blockType}:`]);

    await page.keyboard.press("Backspace");
    await expect.poll(blockRows).toEqual([`paragraph:${marker}`]);
    await page.keyboard.type("x");
    await expect.poll(blockRows).toEqual([`paragraph:${marker}x`]);
  }
});

test("undoes the | quote shortcut back to the typed marker", async ({ page }) => {
  const blockRows = () => page.locator(".bn-editor .bn-block-content").evaluateAll((elements) =>
    elements.map((element) => `${element.dataset.contentType}:${element.textContent}`));
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("|");
  await page.keyboard.press("Space");
  await expect.poll(blockRows).toEqual(["quote:"]);

  await page.keyboard.press(modifierShortcut("Z"));
  await expect.poll(blockRows).toEqual(["paragraph:| "]);

  await page.keyboard.press(modifierShortcut("Shift+Z"));
  await expect.poll(blockRows).toEqual(["quote:"]);
});

test("shows no formatting toolbar for a clicked divider and opens its block menu", async ({ page }) => {
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, ["top", "", "---", "", "bottom"].join("\n"));
  const divider = page.locator(".bn-editor [data-content-type='divider']");
  await expect(divider).toHaveCount(1);

  await divider.click();
  await expect.poll(() => page.evaluate(() => {
    const view = document.querySelector(".bn-editor").editor.view;
    return view.state.selection.node?.type.name ?? null;
  })).not.toBeNull();
  await expect(page.locator(".bn-formatting-toolbar")).toHaveCount(0);

  const blockMenu = await openBlockMenuFor(page, divider);
  await expect(blockMenu.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

test("highlights the active block while its six-dot menu is open", async ({ page }) => {
  await loadTemplatePreview(page);
  const paragraph = page.locator(".bn-editor").getByText("Objective:", {
    exact: true,
  });
  const blockId = await paragraph.evaluate((element) =>
    element.closest(".bn-block-outer").dataset.id,
  );
  const block = page.locator(
    `.bn-block-outer[data-id="${blockId}"] > .bn-block`,
  );

  const openBlockMenu = async () => {
    await paragraph.scrollIntoViewIfNeeded();
    await paragraph.click();
    const paragraphBox = await paragraph.boundingBox();
    await page.mouse.move(
      paragraphBox.x - 24,
      paragraphBox.y + paragraphBox.height / 2,
    );
    await page.getByRole("button", { name: "Open block menu" }).click();
    await expect(page.locator(".bn-drag-handle-menu:visible")).toBeVisible();
    await expect(page.locator("style[data-block-menu-highlight]"))
      .toHaveAttribute("data-block-menu-highlight", blockId);
    return await block.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
      };
    });
  };

  const lightHighlight = await openBlockMenu();
  expect(lightHighlight.animationName).toBe("blockMenuSelectionIn");
  expect(lightHighlight.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(lightHighlight.boxShadow).not.toBe("none");

  await paragraph.click();
  await expect(page.locator(".bn-drag-handle-menu:visible")).toHaveCount(0);
  await expect(page.locator("style[data-block-menu-highlight]")).toHaveCount(0);
  await selectAppTheme(page, "notepane-dark");
  await expect(page.getByTestId("sticky-shell"))
    .toHaveAttribute("data-theme-mode", "dark");

  const darkHighlight = await openBlockMenu();
  expect(darkHighlight.backgroundColor).not.toBe(lightHighlight.backgroundColor);
  expect(darkHighlight.boxShadow).not.toBe(lightHighlight.boxShadow);
});

test("deletes the current block with Command+X when no text is selected", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("delete this block");
  await page.keyboard.press(modifierShortcut("X"));

  await expect(page.getByText("delete this block")).toHaveCount(0);
  await expect(page.getByRole("paragraph").filter({ hasText: /^$/ }).last())
    .toBeVisible();
});

test("leaves the current block in place on Command+Shift+X", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("keep this block");
  await page.keyboard.press(modifierShortcut("Shift+X"));

  await expect(page.locator(".bn-editor").getByText("keep this block", { exact: true }))
    .toHaveCount(1);
});

// Fires the editor's copy handlers into a DataTransfer, the way an in-app
// copy does, and returns it so the same data can be pasted back.
async function copyFromEditor(page) {
  return await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    document.querySelector(".bn-editor").dispatchEvent(
      new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData }),
    );
    window.__notepaneTestClipboard = clipboardData;
    return {
      types: [...clipboardData.types],
      plainText: clipboardData.getData("text/plain"),
    };
  });
}

async function pasteLastCopy(page) {
  await page.evaluate(() => {
    document.querySelector(".bn-editor").dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: window.__notepaneTestClipboard,
      }),
    );
  });
}

test("keeps a toggle when blocks copied inside the editor are pasted back", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.insertText("toggle A");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("child A");
  const toggles = page.locator(".bn-editor [data-content-type='toggleListItem']");
  await expect(toggles).toHaveCount(1);

  await page.keyboard.press(modifierShortcut("A"));
  await page.keyboard.press(modifierShortcut("A"));
  const copied = await copyFromEditor(page);
  expect(copied.types).toContain("blocknote/html");
  await pasteLastCopy(page);

  await expect(toggles).toHaveCount(1);
  await expect(page.locator(".bn-editor [data-content-type='bulletListItem']")).toHaveCount(0);
  await expect(toggles.filter({ hasText: "toggle A" })).toHaveCount(1);
});

test("pastes VS Code lines that start with # as code, not headings", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.evaluate(() => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "# install deps\npip install notepane");
    clipboardData.setData("vscode-editor-data", JSON.stringify({ mode: "shellscript" }));
    document.querySelector(".bn-editor").dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }),
    );
  });

  await expect(page.locator(".bn-editor [data-content-type='codeBlock']")).toContainText("# install deps");
  await expect(page.locator(".bn-editor h1, .bn-editor [data-content-type='heading']")).toHaveCount(0);
});

test("copies only the highlighted text of a keyboard selection across blocks", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.insertText("alpha beta");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("gamma delta");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+End");
  for (let index = 0; index < 2; index += 1) {
    await page.keyboard.press("Shift+ArrowLeft");
  }
  expect(await page.evaluate(() => String(window.getSelection()))).toMatch(/gamma del$/);
  await waitForEditorSelection(page);

  const copied = await copyFromEditor(page);

  expect(copied.plainText).toContain("gamma del");
  expect(copied.plainText).not.toContain("delta");
});

test("cuts the block under the caret after the six-dot handle menu is dismissed", async ({ page }) => {
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Alpha handle block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Bravo middle block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Charlie caret block");

  const editor = page.locator(".bn-editor");
  const alpha = editor.getByText("Alpha handle block", { exact: true });
  await alpha.click();
  const alphaBox = await alpha.boundingBox();
  await page.mouse.move(alphaBox.x + 4, alphaBox.y + alphaBox.height / 2);
  await page.mouse.move(alphaBox.x - 24, alphaBox.y + alphaBox.height / 2);
  await page.getByRole("button", { name: "Open block menu" }).click();
  await expect(page.locator(".bn-drag-handle-menu:visible")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".bn-drag-handle-menu:visible")).toHaveCount(0);
  // Dismissing the menu leaves focus on the page; Tab returns it to the editor
  // without a click, which would otherwise reset the handle's block.
  await page.keyboard.press("Tab");
  await expectEditorFocused(page);

  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("End");
  await expect.poll(() => page.evaluate(() => {
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    return element?.closest(".bn-block-content")?.textContent ?? null;
  })).toBe("Charlie caret block");

  await page.keyboard.press(modifierShortcut("X"));

  await expect(editor.getByText("Charlie caret block", { exact: true })).toHaveCount(0);
  await expect(editor.getByText("Alpha handle block", { exact: true })).toHaveCount(1);
  await expect(editor.getByText("Bravo middle block", { exact: true })).toHaveCount(1);
});

const handleMenuBlockTexts = [
  "Alpha handle block",
  "Bravo middle block",
  "Charlie caret block",
];

// Types Alpha, Bravo and Charlie above an empty last paragraph and seeds the
// clipboard, so a cut is visible as a change of clipboard text.
async function typeHandleMenuBlocks(page) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  for (const text of handleMenuBlockTexts) {
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
  }
  await page.evaluate(() => navigator.clipboard.writeText("clipboard before the cut"));
  const editor = page.locator(".bn-editor");
  return {
    editor,
    alpha: editor.getByText("Alpha handle block", { exact: true }),
    bravo: editor.getByText("Bravo middle block", { exact: true }),
  };
}

// Opens the six-dot menu of `block` and checks the menu stands for that block.
async function openBlockMenuFor(page, block) {
  const box = await block.boundingBox();
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.move(box.x - 24, box.y + box.height / 2);
  await page.locator(".bn-side-menu")
    .getByRole("button", { name: "Open block menu" })
    .click();
  const blockMenu = page.locator(".bn-drag-handle-menu:visible");
  await expect(blockMenu).toBeVisible();
  const blockId = await block.evaluate((element) =>
    element.closest(".bn-block-outer").dataset.id,
  );
  await expect(page.locator("style[data-block-menu-highlight]"))
    .toHaveAttribute("data-block-menu-highlight", blockId);
  return blockMenu;
}

async function expectBlockTexts(editor, texts) {
  await expect.poll(() => editor.locator(".bn-block-content").evaluateAll((elements) =>
    elements.map((element) => element.textContent).filter(Boolean),
  )).toEqual(texts);
}

async function expectClipboardToHoldOnly(page, kept, left) {
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(kept[0]);
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  for (const text of kept) {
    expect(clipboardText).toContain(text);
  }
  for (const text of left) {
    expect(clipboardText).not.toContain(text);
  }
  return clipboardText;
}

test("cuts the block selected with the six-dot handle using the cut shortcut", async ({ page }) => {
  const { editor, alpha, bravo } = await typeHandleMenuBlocks(page);
  // The caret stays in another block, so only the handle identifies Bravo.
  await alpha.click();
  const blockMenu = await openBlockMenuFor(page, bravo);

  await page.keyboard.press(modifierShortcut("X"));

  await expectBlockTexts(editor, ["Alpha handle block", "Charlie caret block"]);
  await expect(blockMenu).toHaveCount(0);
  await expectEditorFocused(page);
  const clipboardText = await expectClipboardToHoldOnly(
    page,
    ["Bravo middle block"],
    ["Alpha", "Charlie"],
  );

  // Paste restores the block, undoing the paste and then the cut leaves it in
  // place. pastePlainText dispatches a synthetic ClipboardEvent carrying the
  // clipboard text, because a real paste shortcut is racy in headless Chromium.
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, clipboardText);
  await expectBlockTexts(editor, [
    "Alpha handle block",
    "Charlie caret block",
    "Bravo middle block",
  ]);
  await page.keyboard.press(modifierShortcut("Z"));
  await expectBlockTexts(editor, ["Alpha handle block", "Charlie caret block"]);
  await page.keyboard.press(modifierShortcut("Z"));
  await expectBlockTexts(editor, handleMenuBlockTexts);
});

test("cutting a nested block leaves the caret beside it, not at the top of the note", async ({ page }) => {
  const { editor } = await typeHandleMenuBlocks(page);
  // Bravo and Charlie become children of Alpha; the caret ends in Bravo. The caret is moved by
  // keyboard, and each Tab waits for ProseMirror to adopt the DOM caret so it nests that block.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await waitForEditorSelection(page);
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowDown");
  await waitForEditorSelection(page);
  await page.keyboard.press("Tab");
  await expect(editor.locator(".bn-block-group .bn-block-group .bn-block-content")).toHaveCount(2);
  await page.keyboard.press("ArrowUp");
  await waitForEditorSelection(page);

  await page.keyboard.press(modifierShortcut("X"));

  await expectBlockTexts(editor, ["Alpha handle block", "Charlie caret block"]);
  await page.keyboard.type("typed ");
  await expect(editor.getByText("typed Charlie caret block", { exact: true })).toHaveCount(1);
});

test("cuts the six-dot menu's block after the arrow keys move through the menu", async ({ page }) => {
  const { editor, alpha, bravo } = await typeHandleMenuBlocks(page);
  await alpha.click();
  const blockMenu = await openBlockMenuFor(page, bravo);

  // A plain key inside the menu ends the handle-click hint, so the cut has to
  // take Bravo from the menu itself rather than fall back to the caret in Alpha.
  await page.keyboard.press("ArrowDown");
  await expect(blockMenu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press(modifierShortcut("X"));

  await expectBlockTexts(editor, ["Alpha handle block", "Charlie caret block"]);
  await expect(blockMenu).toHaveCount(0);
  await expectClipboardToHoldOnly(page, ["Bravo middle block"], ["Alpha", "Charlie"]);
});

test("cuts the six-dot menu's block after a menu item click keeps the menu open", async ({ page }) => {
  const { editor, alpha, bravo } = await typeHandleMenuBlocks(page);
  await alpha.click();
  const blockMenu = await openBlockMenuFor(page, bravo);

  // Colors opens a subpanel and leaves the menu open; its mousedown ends the
  // handle-click hint.
  await blockMenu.getByRole("menuitem", { name: "Colors" }).click();
  await expect(page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible"))
    .toBeVisible();
  await page.keyboard.press(modifierShortcut("X"));

  await expectBlockTexts(editor, ["Alpha handle block", "Charlie caret block"]);
  await expect(blockMenu).toHaveCount(0);
  await expectClipboardToHoldOnly(page, ["Bravo middle block"], ["Alpha", "Charlie"]);
});

test("cuts the six-dot menu's block instead of a text selection in another block", async ({ page }) => {
  const { editor, alpha, bravo } = await typeHandleMenuBlocks(page);
  await alpha.dblclick();
  const selectedText = await page.evaluate(() => String(window.getSelection()));
  expect(selectedText).not.toBe("");
  expect("Alpha handle block").toContain(selectedText);
  const blockMenu = await openBlockMenuFor(page, bravo);

  await page.keyboard.press(modifierShortcut("X"));

  await expectBlockTexts(editor, ["Alpha handle block", "Charlie caret block"]);
  await expect(blockMenu).toHaveCount(0);
  await expectClipboardToHoldOnly(page, ["Bravo middle block"], ["Alpha", "Charlie"]);
});

test("cuts every selected block when the selection includes the six-dot menu's block", async ({ page }) => {
  const { editor, alpha, bravo } = await typeHandleMenuBlocks(page);
  await alpha.click();
  await page.keyboard.press("Shift+ArrowDown");
  const selectedText = await page.evaluate(() => String(window.getSelection()));
  expect(selectedText).toContain("Bravo");
  expect(selectedText).not.toContain("Charlie");
  const blockMenu = await openBlockMenuFor(page, bravo);

  await page.keyboard.press(modifierShortcut("X"));

  await expectBlockTexts(editor, ["Charlie caret block"]);
  await expect(blockMenu).toHaveCount(0);
  await expectClipboardToHoldOnly(
    page,
    ["Alpha handle block", "Bravo middle block"],
    ["Charlie"],
  );
});

// Records every format written to a DataTransfer from now on, so a test can paste back exactly
// what a cut wrote: the async clipboard API cannot read blocknote/html.
async function recordClipboardWrites(page) {
  await page.evaluate(() => {
    window.__notepaneClipboardWrites = {};
    if (window.__notepaneRecordsClipboardWrites) return;
    window.__notepaneRecordsClipboardWrites = true;
    const setData = DataTransfer.prototype.setData;
    DataTransfer.prototype.setData = function recordSetData(type, value) {
      window.__notepaneClipboardWrites[type] = value;
      return setData.call(this, type, value);
    };
  });
}

async function pasteRecordedClipboardWrites(page) {
  return await page.evaluate(() => {
    const written = { ...window.__notepaneClipboardWrites };
    const clipboardData = new DataTransfer();
    for (const [type, value] of Object.entries(written)) {
      clipboardData.setData(type, value);
    }
    document.querySelector(".bn-editor").dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }),
    );
    return Object.keys(written);
  });
}

test("cuts a block with Command+X in the formats the editor's own copy writes", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.insertText("toggle A");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("child A");

  const editor = page.locator(".bn-editor");
  const toggle = editor.locator("[data-content-type='toggleListItem']");
  const child = editor.getByText("child A", { exact: true });
  const parentOfChild = () => child.evaluate((element) => element
    .closest(".bn-block-group")
    .closest(".bn-block-outer")
    ?.querySelector(":scope > .bn-block > .bn-block-content")
    ?.dataset.contentType ?? null);
  await expect(toggle).toHaveCount(1);
  await expect.poll(parentOfChild).toBe("toggleListItem");

  const colorMenu = await openBlockMenuFor(page, toggle);
  await colorMenu.getByRole("menuitem", { name: "Colors" }).click();
  const swatch = page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible")
    .locator("[data-color-kind='background']:not([data-color-value='default'])")
    .first();
  const color = await swatch.getAttribute("data-color-value");
  await swatch.click();
  await expect(toggle).toHaveAttribute("data-background-color", color);
  await page.keyboard.press("Escape");

  const expectToggleRestored = async () => {
    await expect(toggle).toHaveCount(1);
    await expect(toggle).toHaveText("toggle A");
    await expect(toggle).toHaveAttribute("data-background-color", color);
    await expect(editor.locator("[data-content-type='bulletListItem']")).toHaveCount(0);
    await expect(child).toHaveCount(1);
    await expect.poll(parentOfChild).toBe("toggleListItem");
  };

  // With the caret in the block and nothing selected.
  await editor.getByText("toggle A", { exact: true }).click();
  await waitForEditorSelection(page);
  await recordClipboardWrites(page);
  await page.keyboard.press(modifierShortcut("X"));
  await expect(toggle).toHaveCount(0);
  await expect(child).toHaveCount(0);
  await clickLastEmptyParagraph(page);
  expect(await pasteRecordedClipboardWrites(page))
    .toEqual(expect.arrayContaining(["blocknote/html", "text/html", "text/plain"]));
  await expectToggleRestored();

  // With the block's six-dot menu open.
  await openBlockMenuFor(page, toggle);
  await recordClipboardWrites(page);
  await page.keyboard.press(modifierShortcut("X"));
  await expect(toggle).toHaveCount(0);
  await clickLastEmptyParagraph(page);
  expect(await pasteRecordedClipboardWrites(page))
    .toEqual(expect.arrayContaining(["blocknote/html", "text/html", "text/plain"]));
  await expectToggleRestored();

  // Serialising a toggle for the clipboard must leave nothing behind that a later edit trips on.
  await editor.getByText("toggle A", { exact: true }).click();
  await waitForEditorSelection(page);
  await page.keyboard.press(modifierShortcut("X"));
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("after the cuts");
  await expect(editor.getByText("after the cuts", { exact: true })).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});

// Records the block each rise-in animation starts on, from the page's first paint on.
async function openPageRecordingBlockEntrances(page) {
  await page.addInitScript(() => {
    window.__blockEntrances = [];
    document.addEventListener("animationstart", (event) => {
      if (event.animationName === "notepaneBlockEnter") {
        window.__blockEntrances.push(event.target.getAttribute("data-id"));
      }
    }, true);
  });
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
}

function readBlockEntrances(page) {
  return page.evaluate(() => [...window.__blockEntrances]);
}

function readEnteringBlockCount(page) {
  return page.evaluate(() => document.querySelectorAll(".bn-editor .notepane-block-enter").length);
}

function settleBlockEntrances(page) {
  return page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.animationName === "notepaneBlockEnter")
    .map((animation) => animation.finished)));
}

function blockIdOfText(page, text) {
  return page.locator(".bn-editor .bn-block-outer").filter({ hasText: text }).last().getAttribute("data-id");
}

test("rises in the blocks the user creates and no others", { tag: OPENS_OWN_PAGE }, async ({ page }) => {
  await openPageRecordingBlockEntrances(page);
  // The decoration that starts the animation is added in the transaction itself, so a block that
  // is not rising in has no class right after the change.
  expect(await readEnteringBlockCount(page)).toBe(0);

  await clickLastEmptyParagraph(page);
  await page.keyboard.insertText("Typed line");
  expect(await readEnteringBlockCount(page)).toBe(0);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Line from Enter");
  const enterBlockId = await blockIdOfText(page, "Line from Enter");
  await expect.poll(() => readBlockEntrances(page)).toEqual([enterBlockId]);
  // Once the rise has ended, the next change drops the class, and the block does not rise again.
  await settleBlockEntrances(page);
  await page.keyboard.insertText(" again");
  expect(await readEnteringBlockCount(page)).toBe(0);
  expect(await readBlockEntrances(page)).toEqual([enterBlockId]);

  // The slash menu on a line with text puts the new block below it.
  await page.keyboard.type("/heading 2");
  await expect(page.locator(".bn-suggestion-menu")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator(".bn-editor h2")).toHaveCount(1);
  const headingBlockId = await page.locator(".bn-editor .bn-block-outer:has(h2)").last().getAttribute("data-id");
  await expect.poll(() => readBlockEntrances(page)).toEqual([enterBlockId, headingBlockId]);

  // A paste into an empty line fills that line and adds the rest below it.
  await page.keyboard.insertText("Heading text");
  await page.keyboard.press("Enter");
  await waitForEditorSelection(page);
  await pasteClipboardText(page, {
    plainText: "Paste one\nPaste two\nPaste three",
    html: "<p>Paste one</p><p>Paste two</p><p>Paste three</p>",
  });
  await expect(page.locator(".bn-editor").getByText("Paste three", { exact: true })).toBeVisible();
  const pastedIds = [await blockIdOfText(page, "Paste two"), await blockIdOfText(page, "Paste three")];
  await expect.poll(async () => (await readBlockEntrances(page)).slice(2)).toEqual(
    expect.arrayContaining(pastedIds),
  );
  await settleBlockEntrances(page);

  // Switching notes builds the editor again from the stored note: nothing rises in.
  const entrancesBeforeSwitch = (await readBlockEntrances(page)).length;
  const noteId = await page.evaluate(() => document.querySelector("[role='tab'][aria-selected='true']")
    ?.closest(".session-tab-row")?.getAttribute("data-note-id"));
  await createBlankSession(page);
  expect(await readEnteringBlockCount(page)).toBe(0);
  const firstTab = page.locator(`.session-tab-row[data-note-id="${noteId}"]`).getByRole("tab");
  await firstTab.click();
  await expect(firstTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".bn-editor")).toBeVisible();
  expect(await readEnteringBlockCount(page)).toBe(0);
  expect(await readBlockEntrances(page)).toHaveLength(entrancesBeforeSwitch);
});

test("adds blocks without the rise-in when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await clickLastEmptyParagraph(page);
  await page.keyboard.insertText("Still line");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Next still line");
  expect(await readEnteringBlockCount(page)).toBe(0);
  expect(await page.evaluate(() => document.getAnimations()
    .filter((animation) => animation.animationName === "notepaneBlockEnter").length)).toBe(0);
});

// Records each checklist pop: the scales it passes through. Installed before the click, as the pop
// starts in the click's own task.
async function recordCheckPops(page) {
  await page.evaluate(() => {
    window.__checkPops = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function recordPop(keyframes, options) {
      if (options?.id === "notepane-check-pop") {
        window.__checkPops.push(keyframes.map((keyframe) => Number(keyframe.scale)));
      }
      return animate.call(this, keyframes, options);
    };
  });
}

function readCheckPops(page) {
  return page.evaluate(() => window.__checkPops.splice(0));
}

test("pops a checklist box when it is ticked, not when it is cleared", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const box = page.locator(".bn-editor [data-content-type='checkListItem'] input[type='checkbox']").first();
  await expect(box).not.toBeChecked();
  await recordCheckPops(page);

  await box.click();
  await expect(box).toBeChecked();
  await expect.poll(() => readCheckPops(page)).toEqual([[1, 1.15, 1]]);

  await box.click();
  await expect(box).not.toBeChecked();
  expect(await readCheckPops(page)).toEqual([]);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await box.click();
  await expect(box).toBeChecked();
  expect(await readCheckPops(page)).toEqual([]);
});
