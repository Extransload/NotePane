import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  expectEditorFocused,
  getBulletItemDepth,
  loadTemplatePreview,
  modifierShortcut,
  openStickyActionBar,
  pastePlainText,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

test("shows table of contents in tab mode only when enabled from preferences", async ({ page }) => {
  await loadTemplatePreview(page);
  await expect(page.getByTestId("editor-toc")).toHaveCount(0);

  await page.keyboard.press(modifierShortcut(","));
  const preferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferencesPanel).toBeVisible();
  const preferencesMetrics = await preferencesPanel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      height: Math.round(rect.height),
      minHeight: Number.parseFloat(style.minHeight),
    };
  });
  expect(preferencesMetrics.height).toBeGreaterThanOrEqual(560);
  expect(preferencesMetrics.minHeight).toBeGreaterThanOrEqual(560);
  await preferencesPanel.getByRole("tab", { name: "Editor" }).click();
  const tocSwitch = preferencesPanel.getByRole("switch", {
    name: "Show table of contents",
  });
  await expect(tocSwitch).toHaveAttribute("aria-checked", "false");
  await tocSwitch.click();
  await expect(tocSwitch).toHaveAttribute("aria-checked", "true");
  await preferencesPanel.getByRole("button", { name: "Close preferences" }).click();

  const tableOfContents = page.getByTestId("editor-toc");
  await expect(tableOfContents).toBeVisible();
  const tocMetrics = await tableOfContents.evaluate((toc) => {
    const list = toc.querySelector(".editor-toc-list");
    const entry = toc.querySelector(".editor-toc-entry");
    const editor = document.querySelector(".sticky-editor-surface .bn-editor");
    const tocStyle = getComputedStyle(toc);
    const listStyle = getComputedStyle(list);
    const entryStyle = getComputedStyle(entry);
    return {
      editorPaddingRight: Number.parseFloat(getComputedStyle(editor).paddingRight),
      entryTextOverflow: entryStyle.textOverflow,
      entryWhiteSpace: entryStyle.whiteSpace,
      listClientWidth: list.clientWidth,
      listOverflowX: listStyle.overflowX,
      listOverflowY: listStyle.overflowY,
      listScrollWidth: list.scrollWidth,
      maxHeight: Number.parseFloat(tocStyle.maxHeight),
      width: Math.round(toc.getBoundingClientRect().width),
    };
  });
  expect(tocMetrics.width).toBeLessThanOrEqual(48);
  expect(tocMetrics.maxHeight).toBeGreaterThanOrEqual(600);
  expect(tocMetrics.editorPaddingRight).toBe(0);
  expect(tocMetrics.entryWhiteSpace).toBe("normal");
  expect(tocMetrics.entryTextOverflow).toBe("clip");
  expect(tocMetrics.listOverflowX).toBe("hidden");
  expect(tocMetrics.listOverflowY).toBe("auto");
  expect(tocMetrics.listScrollWidth).toBeLessThanOrEqual(tocMetrics.listClientWidth);
  const activeHeading = tableOfContents.getByRole("button", {
    name: /Jump to NotePane, heading level 1/,
  });
  await expect(activeHeading).toHaveAttribute("aria-current", "location");
  await page.evaluate(() => {
    const surface = document.querySelector(".sticky-editor-surface");
    const heading = [...document.querySelectorAll(".sticky-editor-surface .bn-block-outer")]
      .find((element) => element.textContent?.includes("Launch checklist"));
    if (!surface || !heading) throw new Error("Launch checklist heading was not rendered");
    surface.scrollTop = Math.max(0, heading.offsetTop - 48);
    surface.dispatchEvent(new Event("scroll"));
  });
  await expect(tableOfContents.getByRole("button", {
    name: /Jump to Launch checklist, heading level 1/,
  })).toHaveAttribute("aria-current", "location");
  await tableOfContents.hover();
  await expect.poll(() => tableOfContents.evaluate((toc) => Math.round(toc.getBoundingClientRect().width))).toBeGreaterThanOrEqual(200);
  await expect(tableOfContents.getByText("Contents")).toBeVisible();
  await page.keyboard.press(modifierShortcut("+"));
  const fontSizeToast = page.locator(".editor-font-size-toast");
  await expect(fontSizeToast).toBeVisible();
  const overlayLayers = await page.evaluate(() => ({
    fontSizeToast: Number.parseInt(getComputedStyle(
      document.querySelector(".editor-font-size-toast"),
    ).zIndex, 10),
    tableOfContents: Number.parseInt(getComputedStyle(
      document.querySelector("[data-testid='editor-toc']"),
    ).zIndex, 10),
  }));
  expect(overlayLayers.fontSizeToast).toBeGreaterThan(overlayLayers.tableOfContents);
  await expect(tableOfContents.getByRole("button", {
    name: /Jump to NotePane, heading level 1/,
  })).toBeVisible();
  await expect(tableOfContents.getByRole("button", {
    name: /Jump to Launch checklist, heading level 1/,
  })).toBeVisible();

  await page.keyboard.press(modifierShortcut("Shift+O"));
  await expect(tableOfContents).toHaveCount(0);
  await page.keyboard.press(modifierShortcut("Shift+O"));
  await expect(tableOfContents).toBeVisible();

  await page.getByRole("button", { name: "Switch to Sticky windows mode" }).click();
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute(
    "data-layout-mode",
    "sticky",
  );
  await expect(page.getByTestId("editor-toc")).toHaveCount(0);

  await openStickyActionBar(page);
  await page.getByRole("button", { name: "Switch to Tab sessions mode" }).click();
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute(
    "data-layout-mode",
    "tabs",
  );
  await expect(page.getByTestId("editor-toc")).toBeVisible();

  await page.keyboard.press(modifierShortcut("Shift+T"));
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute(
    "data-layout-mode",
    "sticky",
  );
  await page.keyboard.press(modifierShortcut("Shift+T"));
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute(
    "data-layout-mode",
    "tabs",
  );
});

test("centers the editor by default and toggles a wide canvas from the control or shortcut", async ({ page }) => {
  await loadTemplatePreview(page);

  const surface = page.getByTestId("sticky-editor-surface");
  const widthMetrics = () => page.evaluate(() => {
    const surfaceElement = document.querySelector("[data-testid='sticky-editor-surface']");
    const editorElement = surfaceElement?.querySelector(".bn-editor");
    const codeElement = surfaceElement?.querySelector("[data-content-type='codeBlock']");
    if (!surfaceElement || !editorElement || !codeElement) throw new Error("Editor width elements were not rendered");
    return {
      mode: surfaceElement.getAttribute("data-editor-width"),
      surfaceLeft: surfaceElement.getBoundingClientRect().left,
      surfaceWidth: surfaceElement.getBoundingClientRect().width,
      editorWidth: editorElement.getBoundingClientRect().width,
      editorContentWidth: editorElement.clientWidth - Number.parseFloat(getComputedStyle(editorElement).paddingLeft) - Number.parseFloat(getComputedStyle(editorElement).paddingRight),
      editorLeft: editorElement.getBoundingClientRect().left,
      codeWidth: codeElement.getBoundingClientRect().width,
    };
  });

  const reading = await widthMetrics();
  expect(reading.mode).toBe("reading");
  expect(reading.editorWidth).toBeLessThan(reading.surfaceWidth - 120);
  expect(Math.abs(reading.editorLeft - reading.surfaceLeft - ((reading.surfaceWidth - reading.editorWidth) / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs(reading.codeWidth - reading.editorContentWidth)).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "Use wide editor" }).click();
  await expect(surface).toHaveAttribute("data-editor-width", "wide");
  await expect(page.getByRole("button", { name: "Use reading width" })).toBeVisible();

  const wide = await widthMetrics();
  expect(wide.editorWidth).toBeGreaterThan(reading.editorWidth + 100);
  expect(Math.abs(wide.codeWidth - wide.editorContentWidth)).toBeLessThanOrEqual(2);

  await page.keyboard.press(modifierShortcut("Shift+W"));
  await expect(surface).toHaveAttribute("data-editor-width", "reading");
});

test("keeps tab and command select-all outside the editor from moving chrome focus or selecting chrome", async ({ page }) => {
  const newSessionButton = page.getByRole("button", { name: "New session" });
  await newSessionButton.focus();
  await expect(newSessionButton).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(newSessionButton).toBeFocused();

  await page.keyboard.press(modifierShortcut("A"));
  const chromeSelection = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(chromeSelection).toBe("");

  await clickLastEmptyParagraph(page);
  await page.keyboard.type("select all target");
  await expect(page.getByRole("group", { name: "Editor typography" }))
    .toHaveCount(0);
  await page.keyboard.press(modifierShortcut("A"));
  const editorSelection = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(editorSelection.length).toBeGreaterThan(0);
});

test("selects all content when the document only has a toggle list block", async ({ page }) => {
  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await clickLastEmptyParagraph(page);

  await page.keyboard.type("/");
  const slashMenu = page.getByRole("listbox");
  await expect(slashMenu).toBeVisible();
  await slashMenu.getByText("Toggle List", { exact: true }).click();
  await page.keyboard.type("only toggle item");
  await expect(page.getByTestId("sticky-editor-surface").getByText("only toggle item"))
    .toBeVisible();

  await page.keyboard.press(modifierShortcut("A"));
  await expect.poll(async () =>
    await page.evaluate(() => window.getSelection()?.toString() ?? ""),
  ).toContain("only toggle item");
});

test("keeps keyboard focus inside the editor during repeated Tab", async ({ page }) => {
  await page.evaluate(() => {
    window.__outsideEditorFocusTargets = [];
    document.addEventListener(
      "focusin",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (!target.closest("[data-testid='sticky-editor-surface']")) {
          window.__outsideEditorFocusTargets.push(
            target.getAttribute("aria-label") ||
              target.getAttribute("data-testid") ||
              target.className ||
              target.tagName,
          );
        }
      },
      true,
    );
  });

  await clickLastEmptyParagraph(page);
  await page.keyboard.type("- parent");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- child");
  await page.getByText("child", { exact: true }).click();
  await expectEditorFocused(page);
  await expect.poll(() => getBulletItemDepth(page, "child")).toBe(1);

  await page.keyboard.press("Tab");
  await expectEditorFocused(page);
  await expect.poll(() => getBulletItemDepth(page, "child")).toBe(2);

  await page.keyboard.press("Shift+Tab");
  await expectEditorFocused(page);
  await expect.poll(() => getBulletItemDepth(page, "child")).toBe(1);

  await expectEditorFocused(page);
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    await expectEditorFocused(page);
  }
  await expect
    .poll(() => page.evaluate(() => window.__outsideEditorFocusTargets))
    .toEqual([]);
});

test("shows a blocking loading state while sticky windows are prepared", async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    const notes = Array.from({ length: 6 }, (_, index) => ({
      id: `mock-note-${index + 1}`,
      title: `Mock note ${index + 1}`,
      titleManuallyEdited: true,
      blocksJSON: null,
      markdown: "",
      theme: {},
      seedDemoContent: index === 0,
      editorFontScale: 1,
      editorFontFamily: "Inter",
      detached: false,
      trashedAt: null,
      createdAt: now + index,
      updatedAt: now + index,
    }));
    let layoutMode = "tabs";
    let layoutModeChangedListener = null;
    let layoutModeTransitionListener = null;

    window.blocknoteSticky = {
      getCurrentNoteId: async () => notes[0].id,
      getNote: async (noteId) => notes.find((note) => note.id === noteId) ?? notes[0],
      listNotes: async () => notes,
      listTrash: async () => [],
      getAppTheme: async () => ({ mode: "light" }),
      getLayoutMode: async () => layoutMode,
      getEditorPreferences: async () => ({}),
      listFonts: async () => [],
      saveContent: async () => undefined,
      updateAppearance: async () => undefined,
      updateLayoutMode: async (nextLayoutMode) =>
        new Promise((resolve) => {
          const previousLayoutMode = layoutMode;
          layoutMode = nextLayoutMode;
          layoutModeTransitionListener?.({
            phase: "start",
            sourceMode: previousLayoutMode,
            targetMode: nextLayoutMode,
            noteCount: notes.length,
          });
          window.__resolveLayoutModeUpdate = () => {
            layoutModeChangedListener?.(nextLayoutMode);
            layoutModeTransitionListener?.({
              phase: "finish",
              sourceMode: previousLayoutMode,
              targetMode: nextLayoutMode,
              noteCount: notes.length,
            });
            resolve(nextLayoutMode);
          };
        }),
      onLayoutModeChanged: (callback) => {
        layoutModeChangedListener = callback;
        return () => {
          layoutModeChangedListener = null;
        };
      },
      onLayoutModeTransition: (callback) => {
        layoutModeTransitionListener = callback;
        return () => {
          layoutModeTransitionListener = null;
        };
      },
    };
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
    .toBeVisible();

  await page.getByTestId("session-sidebar-footer")
    .getByRole("button", { name: "Switch to Sticky windows mode" })
    .click();

  const overlay = page.getByTestId("layout-transition-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("Opening sticky windows");
  await expect(overlay).toContainText("Preparing 6 sticky windows...");

  await page.evaluate(() => window.__resolveLayoutModeUpdate());
  await expect(overlay).toHaveCount(0);
});

test("uses a roomier top-level block rhythm", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("First block");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second block");

  const secondBlockMarginTop = await page.locator(
    ".bn-editor > .bn-block-group > .bn-block-outer",
  ).nth(1).evaluate((block) => Number.parseFloat(getComputedStyle(block).marginTop));
  expect(secondBlockMarginTop).toBeGreaterThanOrEqual(8);
});

test("renders editor bullets and checkboxes at a more visible size", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, "- Bullet visibility\n- [ ] Checkbox visibility");

  const editorSurface = page.getByTestId("sticky-editor-surface");
  await expect(editorSurface.getByText("Bullet visibility", { exact: true }))
    .toBeVisible();
  await expect(editorSurface.getByText("Checkbox visibility", { exact: true }))
    .toBeVisible();

  const markerMetrics = await page.evaluate(() => {
    const bullet = document.querySelector("[data-content-type='bulletListItem']");
    const bulletText = bullet?.querySelector(".bn-inline-content");
    const checkbox = document.querySelector(
      "[data-content-type='checkListItem'] input[type='checkbox']",
    );
    const checkboxRect = checkbox?.getBoundingClientRect();

    return {
      bulletFontSize: Number.parseFloat(getComputedStyle(bullet, "::before").fontSize),
      textFontSize: Number.parseFloat(getComputedStyle(bulletText).fontSize),
      checkboxWidth: checkboxRect?.width ?? 0,
      checkboxHeight: checkboxRect?.height ?? 0,
    };
  });

  expect(markerMetrics.bulletFontSize / markerMetrics.textFontSize)
    .toBeGreaterThanOrEqual(1.1);
  expect(Math.min(markerMetrics.checkboxWidth, markerMetrics.checkboxHeight))
    .toBeGreaterThanOrEqual(14);
});

test("keeps breathing room above and below the editor document", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  for (let index = 0; index < 34; index += 1) {
    if (index > 0) {
      await page.keyboard.press("Enter");
    }
    await page.keyboard.insertText(`scroll spacing line ${index + 1}`);
  }

  const spacingMetrics = await page.evaluate(() => {
    const surface = document.querySelector("[data-testid='sticky-editor-surface']");
    const editor = surface.querySelector(".bn-editor");
    const editorStyle = getComputedStyle(editor);
    const blocks = [...surface.querySelectorAll(".bn-block-outer")];
    const firstBlock = blocks[0];
    const lastBlock = blocks[blocks.length - 1];
    surface.scrollTop = 0;
    const surfaceTopRect = surface.getBoundingClientRect();
    const firstBlockRect = firstBlock.getBoundingClientRect();
    surface.scrollTop = surface.scrollHeight;
    const surfaceBottomRect = surface.getBoundingClientRect();
    const lastBlockRect = lastBlock.getBoundingClientRect();
    const point = {
      x: surfaceBottomRect.left + surfaceBottomRect.width / 2,
      y: surfaceBottomRect.bottom - 48,
    };

    if (point.y <= lastBlockRect.bottom + 8) {
      throw new Error("The editor bottom gutter did not create clickable empty space.");
    }

    return {
      editorPaddingTop: Number.parseFloat(editorStyle.paddingTop),
      editorPaddingBottom: Number.parseFloat(editorStyle.paddingBottom),
      emptyTailPoint: point,
      firstBlockTopGap: firstBlockRect.top - surfaceTopRect.top,
      lastBlockBottomGap: surfaceBottomRect.bottom - lastBlockRect.bottom,
      scrollTop: surface.scrollTop,
    };
  });
  expect(spacingMetrics.editorPaddingTop).toBeGreaterThanOrEqual(30);
  expect(spacingMetrics.editorPaddingBottom).toBeGreaterThanOrEqual(120);
  expect(spacingMetrics.firstBlockTopGap).toBeGreaterThanOrEqual(24);
  expect(spacingMetrics.lastBlockBottomGap).toBeGreaterThanOrEqual(72);
  expect(spacingMetrics.scrollTop).toBeGreaterThan(0);

  await page.mouse.click(
    spacingMetrics.emptyTailPoint.x,
    spacingMetrics.emptyTailPoint.y,
  );
  await page.keyboard.type("bottom empty space focus");

  await expect(page.getByTestId("sticky-editor-surface").getByText("bottom empty space focus"))
    .toBeVisible();
});
