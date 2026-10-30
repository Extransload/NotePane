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
  const zoomGauge = page.locator(".app-zoom-gauge");
  await expect(zoomGauge).toBeVisible();
  const overlayLayers = await page.evaluate(() => ({
    zoomGauge: Number.parseInt(getComputedStyle(
      document.querySelector(".app-zoom-gauge"),
    ).zIndex, 10),
    tableOfContents: Number.parseInt(getComputedStyle(
      document.querySelector("[data-testid='editor-toc']"),
    ).zIndex, 10),
  }));
  expect(overlayLayers.zoomGauge).toBeGreaterThan(overlayLayers.tableOfContents);
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
    // BlockNote pads .bn-block, so the real text column is narrower than the
    // editor's own content box. Compare against a paragraph, not a computed value.
    const paragraphElement = surfaceElement?.querySelector("[data-content-type='paragraph']");
    if (!surfaceElement || !editorElement || !codeElement || !paragraphElement) throw new Error("Editor width elements were not rendered");
    return {
      mode: surfaceElement.getAttribute("data-editor-width"),
      surfaceLeft: surfaceElement.getBoundingClientRect().left,
      surfaceWidth: surfaceElement.getBoundingClientRect().width,
      editorWidth: editorElement.getBoundingClientRect().width,
      editorContentWidth: editorElement.clientWidth - Number.parseFloat(getComputedStyle(editorElement).paddingLeft) - Number.parseFloat(getComputedStyle(editorElement).paddingRight),
      editorLeft: editorElement.getBoundingClientRect().left,
      codeWidth: codeElement.getBoundingClientRect().width,
      paragraphWidth: paragraphElement.getBoundingClientRect().width,
    };
  });

  const reading = await widthMetrics();
  expect(reading.mode).toBe("reading");
  expect(reading.editorWidth).toBeLessThan(reading.surfaceWidth - 120);
  expect(Math.abs(reading.editorLeft - reading.surfaceLeft - ((reading.surfaceWidth - reading.editorWidth) / 2))).toBeLessThanOrEqual(2);
  expect(Math.abs(reading.codeWidth - reading.paragraphWidth)).toBeLessThanOrEqual(2);

  await page.getByRole("button", { name: "Use wide editor" }).click();
  await expect(surface).toHaveAttribute("data-editor-width", "wide");
  await expect(page.getByRole("button", { name: "Use reading width" })).toBeVisible();

  const wide = await widthMetrics();
  expect(wide.editorWidth).toBeGreaterThan(reading.editorWidth + 100);
  expect(Math.abs(wide.codeWidth - wide.paragraphWidth)).toBeLessThanOrEqual(2);

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
      editorFontFamily: "Inter",
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

test("lets Tab move focus between controls inside the preferences dialog", async ({ page }) => {
  await page.keyboard.press(modifierShortcut(","));
  const preferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferencesPanel).toBeVisible();

  const closeButton = preferencesPanel.getByRole("button", { name: "Close preferences" });
  await closeButton.focus();
  await expect(closeButton).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(closeButton).not.toBeFocused();
  await expect.poll(async () =>
    await preferencesPanel.evaluate((panel) =>
      panel.contains(document.activeElement) && document.activeElement !== panel,
    ),
  ).toBe(true);

  await page.keyboard.press("Shift+Tab");
  await expect(closeButton).toBeFocused();
});

// A sticky window is too small for Preferences. The shortcut is left unhandled so that in
// Electron the app menu decides where Preferences opens.
test("keeps preferences closed in the sticky layout", async ({ page }) => {
  const preferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await page.getByRole("button", { name: "Switch to Sticky windows mode" }).click();
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-layout-mode", "sticky");
  await page.evaluate(() => {
    window.addEventListener("keydown", (event) => {
      if (event.key === ",") window.preferencesShortcutPrevented = event.defaultPrevented;
    });
  });

  await page.keyboard.press(modifierShortcut(","));
  await expect.poll(() => page.evaluate(() => window.preferencesShortcutPrevented)).toBe(false);
  await expect(preferencesPanel).toHaveCount(0);

  await openStickyActionBar(page);
  await page.getByRole("button", { name: "Switch to Tab sessions mode" }).click();
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-layout-mode", "tabs");
  await page.keyboard.press(modifierShortcut(","));
  await expect(preferencesPanel).toBeVisible();
});

// The table of contents refreshes on every editor change. A refresh that replaced unchanged
// state with new arrays chained synchronous renders until fast typing hit React's nested
// update limit, which threw inside the editor transaction and could drop the keystroke's work.
test("keeps fast typing inside React's nested update limit", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await clickLastEmptyParagraph(page);
  for (let line = 0; line < 60; line += 1) {
    await page.keyboard.type(line % 4 === 0 ? `# heading ${line}` : `line ${line}`);
    await page.keyboard.press("Enter");
  }

  await expect(page.getByTestId("sticky-editor-surface").getByText("line 59", { exact: true }))
    .toBeVisible();
  expect(errors).toEqual([]);
});

async function openFirstBlockMenu(page) {
  const heading = page.getByRole("heading", { name: "NotePane", exact: true });
  const rect = await heading.boundingBox();
  await page.mouse.move(rect.x + 40, rect.y + rect.height / 2);
  await page.locator(".bn-side-menu").getByRole("button", { name: "Open block menu" }).click();
  const blockMenu = page.locator(".bn-drag-handle-menu:visible");
  await expect(blockMenu).toBeVisible();
  return blockMenu;
}

const getAnimationName = (locator) =>
  locator.evaluate((element) => getComputedStyle(element).animationName);

test("animates menus and panels open unless the system asks for reduced motion", async ({ page }) => {
  await loadTemplatePreview(page);
  const editorSurface = page.getByTestId("sticky-editor-surface");
  const preferencesWindow = page.getByRole("dialog", { name: "Preferences window" });
  const blockMenu = await openFirstBlockMenu(page);
  expect(await getAnimationName(blockMenu)).toBe("notepaneMenuFadeIn");
  expect(await getAnimationName(editorSurface)).toBe("notepaneMenuFadeIn");
  await page.keyboard.press("Escape");
  await expect(blockMenu).toHaveCount(0);
  await page.keyboard.press(modifierShortcut(","));
  expect(await getAnimationName(preferencesWindow)).toBe("notepaneDialogIn");
  await preferencesWindow.getByRole("button", { name: "Close preferences" }).click();

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await getAnimationName(editorSurface)).toBe("none");
  await page.keyboard.press(modifierShortcut(","));
  expect(await getAnimationName(preferencesWindow)).toBe("none");
  await preferencesWindow.getByRole("button", { name: "Close preferences" }).click();
  const reducedBlockMenu = await openFirstBlockMenu(page);
  expect(await getAnimationName(reducedBlockMenu)).toBe("none");
  await page.getByRole("menuitem", { name: "Turn into" }).click();
  const turnIntoPanel = page.locator(".notepane-block-menu-subpanel[data-panel='turn-into']");
  await expect(turnIntoPanel).toBeVisible();
  expect(await getAnimationName(turnIntoPanel)).toBe("none");
});

// Resolves with how the first element matching `selector` looks when it turns
// data-state="closing" (usePresence in src/hooks/usePresence.js). Registered before the close.
async function watchForClosing(page, selector, innerSelector = null) {
  await page.evaluate(({ selector, innerSelector }) => {
    window.__closingOverlay = new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const element = document.querySelector(`${selector}[data-state="closing"]`);
        if (!element) {
          return;
        }
        observer.disconnect();
        const style = getComputedStyle(element);
        const inner = innerSelector ? element.querySelector(innerSelector) : null;
        resolve({
          animationName: style.animationName,
          ariaHidden: element.getAttribute("aria-hidden"),
          inert: element.inert,
          innerAnimationName: inner ? getComputedStyle(inner).animationName : null,
          pointerEvents: style.pointerEvents,
        });
      });
      observer.observe(document.body, { attributeFilter: ["data-state"], attributes: true, subtree: true });
    });
  }, { selector, innerSelector });
  return () => page.evaluate(() => window.__closingOverlay);
}

test("keeps a closing menu or dialog inert and hidden until its exit animation ends", async ({ page }) => {
  await page.keyboard.press(modifierShortcut(","));
  const preferences = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferences).toBeVisible();
  const preferencesClosing = await watchForClosing(page, ".preferences-backdrop", ".preferences-window");
  await preferences.getByRole("button", { name: "Close preferences" }).click();
  expect(await preferencesClosing()).toEqual({
    animationName: "notepaneFadeOut",
    ariaHidden: "true",
    inert: true,
    innerAnimationName: "notepaneDialogOut",
    pointerEvents: "none",
  });
  // Role locators stop finding it at once; the element leaves once its exit has run.
  await expect(preferences).toHaveCount(0);
  await expect(page.locator(".preferences-backdrop")).toHaveCount(0);

  await page.locator(".session-tab-row").first().click({ button: "right" });
  const tabMenu = page.getByRole("menu", { name: /Session options/ });
  await expect(tabMenu).toBeVisible();
  const menuClosing = await watchForClosing(page, ".session-tab-context-menu");
  await page.keyboard.press("Escape");
  expect(await menuClosing()).toMatchObject({
    animationName: "notepaneMenuOut",
    ariaHidden: "true",
    inert: true,
    pointerEvents: "none",
  });
  await expect(tabMenu).toHaveCount(0);
  await expect(page.locator(".session-tab-context-menu")).toHaveCount(0);
});

test("removes a closed dialog at once when the system asks for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press(modifierShortcut(","));
  const preferences = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferences).toBeVisible();
  const remainsAfterClose = await page.evaluate(async () => {
    const backdrop = document.querySelector(".preferences-backdrop");
    backdrop.querySelector("button[aria-label='Close preferences']").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return backdrop.isConnected;
  });
  expect(remainsAfterClose).toBe(false);
});

test("a reload keeps the window's colours until the app shows again", async ({ page }) => {
  const shellBackground = await page.locator(".sticky-shell")
    .evaluate((shell) => getComputedStyle(shell).backgroundColor);
  let releaseApp;
  const appHeld = new Promise((resolve) => {
    releaseApp = resolve;
  });
  // Holding the app's script keeps the reloaded page at the paint it starts with.
  const appScript = /\/src\/main\.jsx(\?|$)/;
  await page.route(appScript, async (route) => {
    await appHeld;
    await route.continue();
  });
  await page.reload({ waitUntil: "commit" });
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-boot", "reload");
  expect(await page.evaluate(() => ({
    paint: getComputedStyle(document.documentElement, "::before").backgroundColor,
    app: getComputedStyle(document.getElementById("root")).opacity,
  }))).toEqual({ paint: shellBackground, app: "0" });

  releaseApp();
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  await expect(html).not.toHaveAttribute("data-boot");
  await page.unroute(appScript);
});

test("a reloaded window shows its app at once when the system asks for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-boot");
  expect(await page.locator("#root").evaluate((app) => app.getAnimations().length)).toBe(0);
});

test("opens the first block's six-dot menu inside the editor surface, clear of the sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 760 });
  await loadTemplatePreview(page);
  const blockMenu = await openFirstBlockMenu(page);

  await expect.poll(() => blockMenu.evaluate((menu) => {
    const menuRect = menu.getBoundingClientRect();
    const surfaceRect = document.querySelector("[data-testid='sticky-editor-surface']")
      .getBoundingClientRect();
    const handleRect = document.querySelector(".bn-side-menu").getBoundingClientRect();
    return {
      insideSurface:
        menuRect.left >= surfaceRect.left &&
        menuRect.right <= surfaceRect.right &&
        menuRect.top >= surfaceRect.top &&
        menuRect.bottom <= surfaceRect.bottom,
      rightOfHandle: menuRect.left >= handleRect.right,
    };
  })).toEqual({ insideSurface: true, rightOfHandle: true });
});

test("turns the sidebar compact in a narrow window without losing the wide-window choice", async ({ page }) => {
  const sidebar = page.getByTestId("session-sidebar");
  const toggle = page.locator(".sidebar-toggle");
  await page.setViewportSize({ width: 1180, height: 760 });
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "expanded");

  await page.setViewportSize({ width: 700, height: 600 });
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "compact");
  await expect.poll(async () => (await sidebar.boundingBox()).width).toBeLessThan(80);

  // Opened by hand in the narrow window, it stays open there.
  await toggle.click();
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "expanded");

  await page.setViewportSize({ width: 1180, height: 760 });
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "expanded");

  // Hidden by hand in a wide window: a narrow window keeps it compact, and the wide window
  // still remembers it hidden.
  await toggle.click();
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "compact");
  await page.setViewportSize({ width: 700, height: 600 });
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "compact");
  await page.setViewportSize({ width: 1180, height: 760 });
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "compact");

  // Shown again while wide, it returns after the window was narrow and compact in between.
  await toggle.click();
  await page.setViewportSize({ width: 700, height: 600 });
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "compact");
  await page.setViewportSize({ width: 1180, height: 760 });
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "expanded");
});

test("lays Preferences out as a sidebar of pages beside a scrolling page of cards", async ({ page }) => {
  await page.keyboard.press(modifierShortcut(","));
  const preferences = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferences).toBeVisible();
  // The window scales in (src/styles/motion.css); measure it once that has finished.
  await preferences.evaluate((element) => Promise.all(
    element.getAnimations({ subtree: true }).map((animation) => animation.finished),
  ));
  const sidebar = preferences.getByRole("tablist", { name: "Preferences pages" });
  const sidebarBox = await sidebar.boundingBox();
  expect(Math.round(sidebarBox.width)).toBe(180);
  await expect(sidebar.getByRole("tab")).toHaveText(["General", "Editor", "Trash", "Shortcuts"]);
  expect(await sidebar.locator("[role='tab'] svg").count()).toBe(4);

  for (const pageName of ["General", "Editor", "Trash", "Shortcuts"]) {
    await sidebar.getByRole("tab", { name: pageName }).click();
    const panel = preferences.getByRole("tabpanel");
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText(pageName);
    const layout = await panel.evaluate((element) => {
      const cards = [...element.querySelectorAll(".preferences-card")];
      const overflowing = cards.flatMap((card) => {
        const cardBox = card.getBoundingClientRect();
        return [...card.querySelectorAll("*")]
          .filter((child) => {
            const box = child.getBoundingClientRect();
            return box.width > 0 && (box.left < cardBox.left - 1 || box.right > cardBox.right + 1);
          })
          .map((child) => child.className || child.tagName);
      });
      return {
        cards: cards.map((card) => card.querySelector(".preferences-card-title")?.textContent),
        overflowing,
      };
    });
    expect(layout.cards.length, pageName).toBeGreaterThan(0);
    expect(layout.overflowing, pageName).toEqual([]);
  }

  // The page scrolls on its own; the sidebar stays put.
  await sidebar.getByRole("tab", { name: "General" }).click();
  const body = preferences.locator(".preferences-page-body");
  await body.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect((await sidebar.boundingBox()).y).toBe(sidebarBox.y);
  await expect(preferences.getByRole("button", { name: "Close preferences" })).toBeInViewport();
});
