import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  expectEditorFocused,
  loadTemplatePreview,
  modifierShortcut,
  openStickyActionBar,
  pastePlainText,
  selectAppTheme,
  waitForEditorSelection,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

test("opens an export format menu from the button and keyboard shortcut", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  const exportButton = page.getByRole("button", { name: "Export" });
  await expect(exportButton).toBeVisible();

  await exportButton.click();
  const exportMenu = page.getByRole("menu", { name: "Export format" });
  await expect(exportMenu).toBeVisible();
  await expect(exportMenu.getByRole("menuitem", { name: /PDF/ })).toBeVisible();
  await expect(exportMenu.getByRole("menuitem", { name: /Markdown/ })).toBeVisible();
  await exportMenu.getByRole("menuitem", { name: /Markdown/ }).click();
  await expect(page.locator(".sticky-toast-error"))
    .toHaveText("Note export is available in the desktop app.");
  await expect(page.locator(".sticky-toast-error"))
    .toHaveCount(0, { timeout: 4000 });

  await page.keyboard.press(modifierShortcut("Shift+E"));
  await expect(page.getByRole("menu", { name: "Export format" })).toBeVisible();
});

test("uses transparent chrome-free styles while exporting", async ({ page }) => {
  await loadTemplatePreview(page);
  const exportStyles = await page.evaluate(() => {
    const surfaceElement = document.querySelector("[data-testid='sticky-editor-surface']");
    surfaceElement.querySelector(".bn-editor").style.paddingBottom = "780px";
    const originalSurfaceRectHeight = surfaceElement.getBoundingClientRect().height;
    document.body.classList.add("is-exporting");
    const shell = getComputedStyle(document.querySelector("[data-testid='sticky-shell']"));
    const header = getComputedStyle(document.querySelector("[data-testid='sticky-header']"));
    const sidebar = getComputedStyle(document.querySelector("[data-testid='session-sidebar']"));
    const surface = getComputedStyle(
      document.querySelector("[data-testid='sticky-editor-surface']"),
    );
    const editor = getComputedStyle(document.querySelector(".bn-editor"));
    const surfaceRect = surfaceElement.getBoundingClientRect();
    const values = {
      headerDisplay: header.display,
      sidebarDisplay: sidebar.display,
      shellBackgroundImage: shell.backgroundImage,
      shellTextColor: shell.color,
      surfaceBackgroundImage: surface.backgroundImage,
      surfaceBackgroundColor: surface.backgroundColor,
      surfaceRectHeight: surfaceRect.height,
      surfaceScrollHeight: surfaceElement.scrollHeight,
      originalSurfaceRectHeight,
      editorTextColor: editor.color,
      codeBackground: getComputedStyle(document.querySelector("[data-content-type='codeBlock']")).backgroundColor,
    };
    document.body.classList.remove("is-exporting");
    surfaceElement.querySelector(".bn-editor").style.paddingBottom = "";
    return values;
  });

  expect(exportStyles.headerDisplay).toBe("none");
  expect(exportStyles.sidebarDisplay).toBe("none");
  expect(exportStyles.shellBackgroundImage).toBe("none");
  expect(exportStyles.shellTextColor).toBe("rgb(55, 53, 47)");
  expect(exportStyles.surfaceBackgroundImage).toBe("none");
  expect(exportStyles.surfaceBackgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(exportStyles.editorTextColor).toBe("rgb(55, 53, 47)");
  expect(exportStyles.codeBackground).toBe("rgb(13, 17, 23)");
  expect(exportStyles.surfaceRectHeight).toBeGreaterThan(
    exportStyles.originalSurfaceRectHeight,
  );
  expect(exportStyles.surfaceRectHeight).toBeGreaterThanOrEqual(
    exportStyles.surfaceScrollHeight - 1,
  );
});

// Runs in the page before the app loads. A desktop bridge whose exportNote reads the content
// colours while the PDF export render is on screen, which is what printToPDF would capture.
function stubExportBridge() {
  const now = Date.UTC(2026, 9, 20, 9, 0, 0);
  const note = {
    id: "export-note",
    title: "Export note",
    titleManuallyEdited: false,
    blocksJSON: JSON.stringify([
      { type: "paragraph", props: { backgroundColor: "red" }, content: "Red highlight" },
      { type: "codeBlock", props: { language: "javascript" }, content: "const answer = 42;" },
      {
        type: "table",
        content: { type: "tableContent", rows: [{ cells: ["Mode", "Colour"] }, { cells: ["Export", "Light"] }] },
      },
      { type: "paragraph" },
    ]),
    markdown: "",
    // A pastel at low opacity: in sticky layout under a dark theme the window is dark, with
    // light text. The tabs layout does not paint the shell with it.
    theme: { tabTextColor: "#d9efff", tabTextOpacity: 0.35 },
    seedDemoContent: false,
    editorFontFamily: "Inter",
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  window.__readExportColours = () => {
    const styleOf = (selector) => getComputedStyle(document.querySelector(selector));
    // The muted colour has no element of its own in this note, so a probe in the editor
    // surface reads it as the exported content would.
    const probe = document.createElement("span");
    probe.style.color = "var(--sticky-muted-color)";
    document.querySelector("[data-testid='sticky-editor-surface']").append(probe);
    const muted = getComputedStyle(probe).color;
    probe.remove();
    const shell = styleOf("[data-testid='sticky-shell']");
    const keyword = [...document.querySelectorAll(".bn-editor [data-content-type='codeBlock'] code span")]
      .find((span) => span.textContent === "const");
    return {
      exporting: document.body.classList.contains("is-exporting"),
      shellText: shell.color,
      colorScheme: shell.colorScheme,
      // printToPDF paints the page canvas in the root's colour scheme.
      rootColorScheme: getComputedStyle(document.documentElement).colorScheme,
      codeBackground: styleOf(".bn-editor [data-content-type='codeBlock']").backgroundColor,
      // The highlighted `const`, coloured by the active code theme.
      codeKeyword: keyword ? getComputedStyle(keyword).color : null,
      redHighlight: styleOf(".bn-editor [data-background-color='red']").backgroundColor,
      tableBorder: styleOf(".bn-editor td").borderTopColor,
      muted,
    };
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
    exportNote: async () => {
      window.__exportColours = window.__readExportColours();
      return { canceled: false };
    },
  };
}

// Export renders with NotePane Light whatever theme is selected, code included: NotePane Light's
// github-dark code theme, even where the selected theme highlights code in its own colours. In
// sticky layout the shell carries its note's colours inline, and the export replaces those too.
for (const { themeId, label, ownCodeTheme, layoutMode } of [
  { themeId: "notepane-dark", label: "a dark theme", ownCodeTheme: false, layoutMode: "tabs" },
  { themeId: "catppuccin-mocha", label: "Catppuccin Mocha", ownCodeTheme: true, layoutMode: "tabs" },
  { themeId: "notepane-dark", label: "a dark theme in sticky layout", ownCodeTheme: false, layoutMode: "sticky" },
]) {
  test(`export renders with NotePane Light under ${label}`, async ({ page }) => {
    await page.addInitScript(stubExportBridge);
    await page.goto("/");
    await expect(page.locator(".bn-editor [data-background-color='red']")).toBeVisible();
    await expect(page.locator(".bn-editor td").first()).toBeVisible();
    await expect(page.locator(".bn-editor [data-content-type='codeBlock'] code span", { hasText: /^const$/ }))
      .toHaveCSS("color", "rgb(249, 117, 131)");
    // The shell eases its colours over a theme change; read them once that has finished.
    const readSettledColours = async () => {
      await page.waitForFunction(() =>
        document.querySelector("[data-testid='sticky-shell']")
          .getAnimations({ subtree: true })
          .every((animation) => !(animation instanceof CSSTransition)),
      );
      return page.evaluate(() => window.__readExportColours());
    };
    // NotePane Light's own colours, read in the tabs layout before a sticky window paints the
    // shell with its note's colour.
    const lightColours = await readSettledColours();

    // Preferences does not open in the sticky layout, so the theme is chosen before switching.
    await selectAppTheme(page, themeId);
    if (layoutMode === "sticky") {
      await page.getByTestId("session-sidebar-footer")
        .getByRole("button", { name: "Switch to Sticky windows mode" })
        .click();
      await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-layout-mode", "sticky");
    }
    const themedColours = await readSettledColours();
    // The selected theme paints these differently, so the export check below means something.
    expect(themedColours.shellText).not.toBe(lightColours.shellText);
    expect(themedColours.redHighlight).not.toBe(lightColours.redHighlight);
    expect(themedColours.tableBorder).not.toBe(lightColours.tableBorder);
    expect(themedColours.muted).not.toBe(lightColours.muted);
    if (ownCodeTheme) {
      expect(themedColours.codeKeyword).not.toBe(lightColours.codeKeyword);
    }

    // In sticky layout the Export button sits in the sticky header's action bar.
    if (layoutMode === "sticky") {
      await openStickyActionBar(page);
    }
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menu", { name: "Export format" }).getByRole("menuitem", { name: /PDF/ }).click();
    await expect(page.locator(".sticky-toast-success")).toHaveText("PDF exported");

    const exportColours = await page.evaluate(() => window.__exportColours);
    expect(exportColours).toEqual({
      exporting: true,
      shellText: "rgb(55, 53, 47)",
      colorScheme: "light",
      rootColorScheme: "light",
      codeBackground: "rgb(13, 17, 23)",
      codeKeyword: "rgb(249, 117, 131)",
      redHighlight: lightColours.redHighlight,
      tableBorder: lightColours.tableBorder,
      muted: lightColours.muted,
    });
    // Afterwards the selected theme is back.
    expect(await readSettledColours()).toEqual(themedColours);
  });
}

test("opens BlockNote slash menu with core demo commands", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/");

  const slashMenu = page.getByRole("listbox");
  await expect(slashMenu).toBeVisible();
  const upperPlacement = await page.evaluate(() => {
    const menu = document.querySelector(".bn-suggestion-menu[role='listbox']");
    const activeBlock = document.querySelector(
      ".bn-editor > .bn-block-group > .bn-block-outer",
    );
    return {
      menuTop: Math.round(menu.getBoundingClientRect().top),
      blockBottom: Math.round(activeBlock.getBoundingClientRect().bottom),
    };
  });
  expect(upperPlacement.menuTop).toBeGreaterThanOrEqual(upperPlacement.blockBottom);

  for (const label of [
    "Heading 1",
    "Toggle List",
    "Check List",
    "Code Block",
    "Table",
    "Image",
    "Video",
    "Audio",
    "File",
    "Import Markdown",
    "Toggle Heading 1",
    "Toggle Heading 4",
  ]) {
    await expect(slashMenu.getByText(label, { exact: true })).toBeVisible();
  }
  for (const label of ["Heading 5", "Heading 6", "Toggle Heading 5", "Toggle Heading 6"]) {
    await expect(slashMenu.getByText(label, { exact: true })).toHaveCount(0);
  }

  await slashMenu.getByText("Toggle Heading 4", { exact: true }).click();
  const toggleHeading = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h4)",
  ).last();
  await expect(toggleHeading.locator(".bn-toggle-wrapper"))
    .toHaveAttribute("data-show-children", "false");
  await expect(toggleHeading.locator(
    "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
  ).getByRole("button", {
    name: "Empty toggle. Click to add a block.",
  })).toHaveCount(0);
});

test("imports Markdown through the slash-command upload modal, including drag and drop", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/import");
  await page.getByText("Import Markdown", { exact: true }).click();

  const importDialog = page.getByRole("dialog", { name: "Import Markdown" });
  await expect(importDialog).toBeVisible();
  await expect(importDialog.getByText("Drop a .md file here")).toBeVisible();
  await expect(importDialog.getByText("or click to choose a file")).toBeVisible();

  await importDialog.locator(".markdown-import-dropzone").evaluate((dropzone) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([
      "# Dropped Markdown\n\n- Imported with drag and drop",
    ], "dropped.md", { type: "text/markdown" }));
    dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });

  await expect(page.getByRole("heading", { name: "Dropped Markdown" })).toBeVisible();
  await expect(page.getByText("Imported with drag and drop", { exact: true })).toBeVisible();
  await expect(importDialog).toHaveCount(0);
});

test("imports a Markdown toggle without page errors once it is edited and deleted", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/import");
  await page.getByText("Import Markdown", { exact: true }).click();
  const importDialog = page.getByRole("dialog", { name: "Import Markdown" });
  await importDialog.locator(".markdown-import-dropzone").evaluate((dropzone) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File(
      ["Intro\n\n<details>\n<summary>Toggle head</summary>\n\nchild one\n\n</details>\n\nOutro\n"],
      "toggle.md",
      { type: "text/markdown" },
    ));
    dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });
  await expect(importDialog).toHaveCount(0);
  const editor = page.locator(".bn-editor");
  const toggle = editor.locator("[data-content-type='toggleListItem']");
  await expect(toggle).toHaveCount(1);
  if ((await editor.locator(".bn-toggle-wrapper").first().getAttribute("data-show-children")) !== "true") {
    await editor.locator(".bn-toggle-button").first().click();
  }
  // The DOM range from `startText` at `startOffset` to `endText` at `endOffset`.
  const selectText = async (startText, startOffset, endText, endOffset) => {
    await page.evaluate(({ startText, startOffset, endText, endOffset }) => {
      const textNode = (text) => [...document.querySelectorAll(".bn-editor .bn-inline-content")]
        .find((element) => element.textContent === text).firstChild;
      const range = document.createRange();
      range.setStart(textNode(startText), startOffset);
      range.setEnd(textNode(endText), endOffset);
      document.querySelector(".bn-editor").focus();
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    }, { startText, startOffset, endText, endOffset });
    await waitForEditorSelection(page);
  };
  await selectText("child one", "child one".length, "child one", "child one".length);
  await page.keyboard.press("Enter");
  await page.keyboard.type("child two");
  await expect(editor.getByText("child two", { exact: true })).toBeVisible();

  // From the end of Intro to the start of Outro: the toggle and its lines go.
  await selectText("Intro", "Intro".length, "Outro", 0);
  await page.keyboard.press("Backspace");

  await expect(toggle).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("imports Markdown as the same blocks as pasting it", async ({ page }) => {
  // Hard breaks written both ways, runs of spaces, and a hard break in a quote.
  const markdown = "line one\\\nline two\n\nsoft one  \nsoft two\n\nruns  of   spaces\n\n> quote\\\nsecond\n";
  const blockRows = () => page.locator(".bn-editor .bn-block-content").evaluateAll((elements) =>
    elements.map((element) => `${element.dataset.contentType}:${element.innerHTML}`));

  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, markdown);
  await expect(page.locator(".bn-editor [data-content-type='quote']")).toHaveCount(1);
  const pastedRows = await blockRows();

  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/import");
  await page.getByText("Import Markdown", { exact: true }).click();
  const importDialog = page.getByRole("dialog", { name: "Import Markdown" });
  await importDialog.locator(".markdown-import-dropzone").evaluate((dropzone, text) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([text], "breaks.md", { type: "text/markdown" }));
    dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  }, markdown);
  await expect(importDialog).toHaveCount(0);

  await expect.poll(blockRows).toEqual(pastedRows);
  await expect.poll(() => page.locator(".bn-editor .bn-inline-content").evaluateAll((elements) =>
    elements.map((element) => element.innerText))).toEqual([
    "line one\nline two",
    "soft one\nsoft two",
    "runs of spaces",
    "quote\nsecond",
  ]);
});

test("lists Import Markdown last, so slash and Enter inserts a block instead of opening a file dialog", async ({ page }) => {
  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/");
  const slashMenu = page.locator(".bn-suggestion-menu");
  const menuItems = slashMenu.locator(".bn-suggestion-menu-item");
  await expect(menuItems.first()).toContainText("Heading 1");
  await expect(menuItems.last()).toContainText("Import Markdown");

  await page.keyboard.press("Enter");
  await expect(slashMenu).toHaveCount(0);
  await expect(page.locator(".bn-editor .bn-block-content")).toHaveCount(1);
  await expect(page.locator(".bn-editor [data-content-type='heading'] h1")).toHaveCount(1);
  await expect(page.getByRole("dialog", { name: "Import Markdown" })).toHaveCount(0);

  // Its aliases still find it.
  await page.keyboard.type("/md");
  await expect(menuItems.first()).toContainText("Import Markdown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Import Markdown" })).toBeVisible();
});

test("closes the slash menu with Escape and keeps the typed query", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/head");
  const slashMenu = page.locator(".bn-suggestion-menu");
  await expect(slashMenu).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(slashMenu).toHaveCount(0);
  await expectEditorFocused(page);
  await page.keyboard.type("er");
  await expect(page.locator(".bn-editor").getByText("/header", { exact: true })).toBeVisible();
});

// A Korean or Japanese input method can start a composition without the end reaching the page,
// for example when the input source is switched mid-composition. The menu's own Escape handling
// then waits for that composition forever; the key event's own flag says whether it is composing.
test("closes the slash menu with Escape after an input method left a composition open", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/head");
  const slashMenu = page.locator(".bn-suggestion-menu");
  await expect(slashMenu).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })));

  await page.keyboard.press("Escape");

  await expect(slashMenu).toHaveCount(0);
});

// An Escape that a Korean input method takes while composing belongs to the input method, which
// then commits the syllable. One press still closes the menu, once the composition has ended.
test("closes the slash menu after a Korean composition that Escape was pressed in ends", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/");
  const slashMenu = page.locator(".bn-suggestion-menu");
  await expect(slashMenu).toBeVisible();
  // The compositions Chrome reports while a Korean IME types 콜.
  const cdp = await page.context().newCDPSession(page);
  for (const text of ["ㅋ", "코", "콜"]) {
    await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
  }
  await expect(slashMenu.getByText("Callout", { exact: true })).toBeVisible();

  // Chrome reports this Escape as part of the composition.
  await page.keyboard.press("Escape");
  await cdp.send("Input.insertText", { text: "콜" });

  await expect(slashMenu).toHaveCount(0);
  await expect(page.locator(".bn-editor").getByText("/콜", { exact: true })).toBeVisible();
  await expectEditorFocused(page);
});

test("opens the slash menu upward from the lower half", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.type(`Block ${index}`);
    await page.keyboard.press("Enter");
  }

  const blocks = page.locator(".bn-editor > .bn-block-group > .bn-block-outer");
  const targetBlock = blocks.nth(20);
  await targetBlock.evaluate((block) => {
    block.scrollIntoView({ block: "end" });
  });
  await targetBlock.locator(".bn-inline-content").click();
  await page.keyboard.press("End");
  await expect.poll(() => page.evaluate(() => {
    const editorSurface = document.querySelector(
      "[data-testid='sticky-editor-surface']",
    );
    const target = [...document.querySelectorAll(
      ".bn-editor > .bn-block-group > .bn-block-outer",
    )][20];
    const surfaceRect = editorSurface.getBoundingClientRect();
    return target.getBoundingClientRect().top >=
      surfaceRect.top + surfaceRect.height / 2;
  })).toBe(true);
  await page.keyboard.type("/");

  const slashMenu = page.getByRole("listbox");
  await expect(slashMenu).toBeVisible();
  const slashMenuStyle = await slashMenu.evaluate((menu) => {
    const style = getComputedStyle(menu);
    return {
      backgroundColor: style.backgroundColor,
      paddingTop: Number.parseFloat(style.paddingTop),
    };
  });
  expect(slashMenuStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(slashMenuStyle.paddingTop).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => {
    const menu = document.querySelector(".bn-suggestion-menu[role='listbox']");
    const target = [...document.querySelectorAll(
      ".bn-editor > .bn-block-group > .bn-block-outer",
    )][20];
    const menuRect = menu.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return menuRect.top + menuRect.height / 2 <
      targetRect.top + targetRect.height / 2;
  })).toBe(true);
  await expect.poll(() => slashMenu.evaluate((menu) =>
    menu.getBoundingClientRect().height
  )).toBeLessThanOrEqual(400);
  await slashMenu.hover();
  await page.mouse.wheel(0, 10_000);
  await expect.poll(() => slashMenu.evaluate((menu) =>
    Math.round(menu.scrollTop + menu.clientHeight) >=
      Math.round(menu.scrollHeight) - 1
  )).toBe(true);
  await expect(slashMenu.getByRole("option").last()).toBeInViewport();
});

test("labels slash menu shortcuts the way Preferences labels shortcuts", async ({ page }) => {
  const isMac = process.platform === "darwin";
  await page.keyboard.press(modifierShortcut(","));
  const preferences = page.getByRole("dialog", { name: "Preferences window" });
  await preferences.getByRole("tab", { name: "Shortcuts" }).click();
  await expect(preferences.getByRole("button", { name: "Shortcut for New session" }))
    .toHaveText(isMac ? "⌘T" : "Ctrl+T");
  await preferences.getByRole("button", { name: "Close preferences" }).click();

  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/");
  const heading = page.locator(".bn-suggestion-menu-item").filter({
    has: page.getByText("Heading 1", { exact: true }),
  });
  await expect(heading).toContainText(isMac ? "⌘⌥1" : "Ctrl+Alt+1");
  await expect(page.locator(".bn-suggestion-menu")).not.toContainText(/ALT|-Alt-|⌘-/);
});

test("anchors the export menu to its button and hides the formatting toolbar while it is open", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("heading", { name: "NotePane", exact: true }).dblclick();
  const toolbar = page.locator(".bn-formatting-toolbar");
  await expect(toolbar).toBeVisible();

  await page.keyboard.press(modifierShortcut("Shift+E"));
  const menu = page.getByRole("menu", { name: "Export format" });
  await expect(menu).toBeVisible();
  await expect(toolbar).toHaveCount(0);
  const button = page.getByTestId("session-sidebar-footer").getByRole("button", { name: "Export" });
  await expect.poll(async () => {
    const menuBox = await menu.boundingBox();
    const buttonBox = await button.boundingBox();
    // The footer sits at the bottom of the window, so the menu opens above the button.
    return Math.abs(menuBox.x - buttonBox.x) <= 1 &&
      menuBox.y + menuBox.height <= buttonBox.y &&
      buttonBox.y - (menuBox.y + menuBox.height) <= 12;
  }).toBe(true);

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(toolbar).toBeVisible();

  // Without the sidebar, the shortcut opens the menu under the right end of the header.
  await page.getByRole("button", { name: "Switch to Sticky windows mode" }).click();
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-layout-mode", "sticky");
  await page.locator(".bn-editor").getByRole("heading", { name: "NotePane", exact: true }).click();
  await page.keyboard.press(modifierShortcut("Shift+E"));
  await expect(menu).toBeVisible();
  const header = page.getByTestId("sticky-header");
  await expect.poll(async () => {
    const menuBox = await menu.boundingBox();
    const headerBox = await header.boundingBox();
    const viewport = page.viewportSize();
    return menuBox.y >= headerBox.y + headerBox.height &&
      menuBox.y - (headerBox.y + headerBox.height) <= 12 &&
      viewport.width - (menuBox.x + menuBox.width) <= 24;
  }).toBe(true);
});
