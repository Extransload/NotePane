import { expect, test } from "@playwright/test";
import {
  chooseBlankSessionTemplate,
  clickLastEmptyParagraph,
  createBlankSession,
  dragSessionTab,
  expectEditorFocused,
  expectEditorToBeFocused,
  expectNewSessionButtonBelowLastTab,
  expectSessionTabReorderAnimation,
  getActiveSessionTabNoteId,
  getSessionTabNoteIds,
  loadTemplatePreview,
  modifierOptionShortcut,
  modifierShortcut,
  moveSessionToTrash,
  openStickyActionBar,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

test("starts with a blank first session", async ({ page }) => {
  await expect(page.getByTestId("sticky-shell")).toBeVisible();
  const isWindows = await page.evaluate(
    () => window.blocknoteSticky?.platform === "win32",
  );
  if (isWindows) {
    await expect(page.getByTestId("sticky-header")).toHaveCount(0);
  } else {
    await expect(page.getByTestId("sticky-header")).toBeVisible();
  }
  await expect(page.locator("[aria-label='NotePane wordmark']")).toBeVisible();
  await expect(page.getByTestId("session-sidebar").locator("[aria-label='NotePane wordmark']"))
    .toBeVisible();
  await expect(page.locator(".brand-wordmark-image-light")).toBeVisible();
  await expect(page.locator(".brand-wordmark-image-dark")).toBeHidden();
  await expect(page.locator(".sticky-header [aria-label='NotePane wordmark']"))
    .toHaveCount(0);
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
    .toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tab").first()).toHaveAccessibleName(/Untitled/);
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("offers the default template inline for every new session", async ({ page }) => {
  await page.getByRole("button", { name: "New session" }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("dialog", { name: "Create new session" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add default template" })).toBeVisible();
  await expectEditorToBeFocused(page);

  await page.getByRole("button", { name: "Add default template" }).click();
  await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Add default template" })).toHaveCount(0);
  await expectEditorToBeFocused(page);

  await page.getByRole("button", { name: "New session" }).click();
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add default template" })).toBeVisible();
  await expectEditorToBeFocused(page);
});

test("renders the NotePane template when requested", async ({ page }) => {
  await loadTemplatePreview(page);
  await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
    .toBeVisible();
  await expect(page.getByText("A focused workspace for persistent notes"))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: "Launch checklist" }))
    .toBeVisible();
  await expect(page.getByText("Create one session per meeting"))
    .toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Tabs" })).toBeVisible();
  await expect(page.getByText("Styled Text")).toBeVisible();
  await expect(page.getByTestId("sticky-editor-surface"))
    .toHaveClass(/is-template-session/);
  await expect(page.getByRole("button", { name: "Use this template" }))
    .toBeVisible();
  await page.getByRole("button", { name: "Use this template" }).click();
  await expect(page.getByRole("button", { name: "Use this template" }))
    .toHaveCount(0);
  await expect(page.getByTestId("sticky-editor-surface"))
    .not.toHaveClass(/is-template-session/);
  await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
    .toBeVisible();
});

test("creates and switches note sessions from the sidebar", async ({ page }) => {
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.locator(".session-shortcut").first()).toHaveText(/1/);
  await page.keyboard.press(modifierShortcut("T"));
  await chooseBlankSessionTemplate(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
  await createBlankSession(page);

  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.getByRole("tab").nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".session-shortcut").nth(1)).toHaveText(/2/);
  await expect(page.locator(".session-shortcut").nth(2)).toHaveText(/3/);
  await expectNewSessionButtonBelowLastTab(page);

  await page.keyboard.press(modifierShortcut("1"));
  await expect(page.getByRole("tab").nth(0)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press(modifierShortcut("2"));
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press(modifierOptionShortcut("ArrowRight"));
  await expect(page.getByRole("tab").nth(2)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press(modifierOptionShortcut("ArrowRight"));
  await expect(page.getByRole("tab").nth(0)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press(modifierOptionShortcut("ArrowLeft"));
  await expect(page.getByRole("tab").nth(2)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press(modifierShortcut("Enter"));
  await expectEditorFocused(page);
});

test("reorders session tabs with drag-and-drop and keyboard animation", async ({ page }) => {
  await page.keyboard.press(modifierShortcut("T"));
  await chooseBlankSessionTemplate(page);
  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(page.locator(".session-tab-row.is-entering")).toHaveCount(0);

  const initialOrder = await getSessionTabNoteIds(page);
  const activeNoteId = initialOrder[2];
  expect(await getActiveSessionTabNoteId(page)).toBe(activeNoteId);

  await page.keyboard.press(modifierShortcut("Shift+["));
  await expectSessionTabReorderAnimation(page);
  await expect.poll(() => getSessionTabNoteIds(page)).toEqual([
    initialOrder[0],
    initialOrder[2],
    initialOrder[1],
  ]);
  expect(await getActiveSessionTabNoteId(page)).toBe(activeNoteId);

  await page.keyboard.press(modifierShortcut("Shift+]"));
  await expectSessionTabReorderAnimation(page);
  await expect.poll(() => getSessionTabNoteIds(page)).toEqual(initialOrder);
  expect(await getActiveSessionTabNoteId(page)).toBe(activeNoteId);

  await dragSessionTab(page, 0, 2);
  await expect.poll(() => getSessionTabNoteIds(page)).toEqual([
    initialOrder[1],
    initialOrder[2],
    initialOrder[0],
  ]);
  expect(await getActiveSessionTabNoteId(page)).toBe(activeNoteId);
});

test("keeps the sidebar compact when creating a session", async ({ page }) => {
  const sidebar = page.getByTestId("session-sidebar");

  await page.keyboard.press(modifierShortcut("Shift+B"));
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "compact");
  await page.keyboard.press(modifierShortcut("Shift+B"));
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "expanded");

  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "compact");

  const compactWidth = await sidebar.evaluate((element) =>
    Math.round(element.getBoundingClientRect().width),
  );

  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "compact");
  await expect.poll(async () =>
    await sidebar.evaluate((element) =>
      Math.round(element.getBoundingClientRect().width),
    ),
  ).toBe(compactWidth);
});

test("scrolls the sidebar when many session tabs exist", async ({ page }) => {
  for (let index = 0; index < 24; index += 1) {
    await createBlankSession(page);
  }

  await expect(page.getByRole("tab")).toHaveCount(25);

  const scrollMetrics = await page.evaluate(() => {
    const sidebar = document.querySelector("[data-testid='session-sidebar']");
    const sidebarContent = document.querySelector("[data-testid='session-sidebar-scroll']");
    const addButton = document.querySelector(".session-add-button");
    const lastTab = document.querySelector(".session-tab-row:last-child");
    sidebarContent.scrollTop = sidebarContent.scrollHeight;

    return {
      sidebarTop: Math.round(sidebar.getBoundingClientRect().top),
      contentTop: Math.round(sidebarContent.getBoundingClientRect().top),
      clientHeight: sidebarContent.clientHeight,
      scrollHeight: sidebarContent.scrollHeight,
      scrollTop: sidebarContent.scrollTop,
      addButtonTop: Math.round(addButton.getBoundingClientRect().top),
      lastTabBottom: Math.round(lastTab.getBoundingClientRect().bottom),
    };
  });

  expect(scrollMetrics.contentTop).toBeGreaterThan(scrollMetrics.sidebarTop);
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  expect(scrollMetrics.scrollTop).toBeGreaterThan(0);
  expect(scrollMetrics.addButtonTop - scrollMetrics.lastTabBottom)
    .toBeGreaterThanOrEqual(0);
  expect(scrollMetrics.addButtonTop - scrollMetrics.lastTabBottom)
    .toBeLessThanOrEqual(16);
});

test("resizes and collapses the sidebar from its right edge", async ({ page }) => {
  const sidebar = page.getByTestId("session-sidebar");
  const resizeHandle = page.getByRole("separator", { name: "Resize sidebar" });
  const initialBox = await sidebar.boundingBox();
  const handleBox = await resizeHandle.boundingBox();

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 40);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 64, handleBox.y + 40);
  await page.mouse.up();

  const resizedBox = await sidebar.boundingBox();
  expect(Math.round(resizedBox.width)).toBeGreaterThan(Math.round(initialBox.width) + 36);

  const resizedHandleBox = await resizeHandle.boundingBox();
  await page.mouse.move(resizedHandleBox.x + resizedHandleBox.width / 2, resizedHandleBox.y + 40);
  await page.mouse.down();
  await page.mouse.move(resizedHandleBox.x - 260, resizedHandleBox.y + 40);
  await page.mouse.up();

  await expect(sidebar).toBeVisible();
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "compact");
  await expect(sidebar.locator("[aria-label='NotePane wordmark']")).toBeHidden();
  await expect(sidebar.locator(".brand-wordmark-image").first()).toBeHidden();
  await expect(sidebar.locator(".session-name").first()).toBeHidden();
  await expect(sidebar.locator(".session-shortcut").first()).toBeHidden();
  await expect(page.getByRole("button", { name: "Show sidebar" })).toBeVisible();
  const compactFooterMetrics = await page.evaluate(() => {
    const sidebarElement = document.querySelector("[data-testid='session-sidebar']");
    const footer = document.querySelector("[data-testid='session-sidebar-footer']");
    const layoutButton = footer.querySelector(".layout-mode-button");
    const layoutIcon = layoutButton.querySelector(".notepane-mode-transition-icon");
    const sidebarRect = sidebarElement.getBoundingClientRect();
    const sidebarCenterX = sidebarRect.left + sidebarRect.width / 2;
    const buttonRects = [...footer.querySelectorAll("button")].map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        centerDelta: Math.abs((rect.left + rect.width / 2) - sidebarCenterX),
        insideSidebar:
          rect.left >= sidebarRect.left &&
          rect.right <= sidebarRect.right,
      };
    });
    const iconRect = layoutIcon.getBoundingClientRect();

    return {
      buttonRects,
      layoutButtonWidth: Math.round(layoutButton.getBoundingClientRect().width),
      layoutIconWidth: Math.round(iconRect.width),
      layoutIconMode: layoutIcon.getAttribute("data-icon-layout"),
      transitionArrowCount: layoutIcon.querySelectorAll(".mode-transition-arrow, .mode-transition-arrow-head").length,
    };
  });
  expect(compactFooterMetrics.buttonRects).toHaveLength(4);
  expect(compactFooterMetrics.buttonRects.every((rect) => rect.insideSidebar)).toBe(true);
  expect(compactFooterMetrics.buttonRects.every((rect) => rect.centerDelta <= 1)).toBe(true);
  expect(compactFooterMetrics.buttonRects.every((rect) => rect.width === 32)).toBe(true);
  expect(compactFooterMetrics.buttonRects.every((rect) => rect.height === 30)).toBe(true);
  expect(compactFooterMetrics.layoutButtonWidth).toBe(32);
  expect(compactFooterMetrics.layoutIconWidth).toBe(20);
  expect(compactFooterMetrics.layoutIconMode).toBe("compact");
  expect(compactFooterMetrics.transitionArrowCount).toBe(0);

  await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(page.getByTestId("session-sidebar")).toBeVisible();
  await expect(page.getByTestId("session-sidebar")).toHaveAttribute("data-sidebar-state", "expanded");
  await expect(page.getByTestId("session-sidebar").getByRole("button", { name: "Hide sidebar" }))
    .toBeVisible();
  const expandedFooterMetrics = await page.evaluate(() => {
    const footer = document.querySelector("[data-testid='session-sidebar-footer']");
    const layoutButton = footer.querySelector(".layout-mode-button");
    const layoutIcon = layoutButton.querySelector(".notepane-mode-transition-icon");
    const tabGlyph = layoutIcon.querySelector(".mode-tabs-glyph");
    const stickyGlyph = layoutIcon.querySelector(".mode-sticky-glyph");
    const arrowRects = [
      ...layoutIcon.querySelectorAll(".mode-transition-arrow, .mode-transition-arrow-head"),
    ].map((element) => element.getBoundingClientRect());
    const tabGlyphRect = tabGlyph.getBoundingClientRect();
    const stickyGlyphRect = stickyGlyph.getBoundingClientRect();
    const arrowLeft = Math.min(...arrowRects.map((rect) => rect.left));
    const arrowRight = Math.max(...arrowRects.map((rect) => rect.right));
    const arrowCenterX = arrowLeft + (arrowRight - arrowLeft) / 2;
    const glyphGapCenterX = tabGlyphRect.right + (stickyGlyphRect.left - tabGlyphRect.right) / 2;

    return {
      layoutButtonWidth: Math.round(layoutButton.getBoundingClientRect().width),
      layoutIconWidth: Math.round(layoutIcon.getBoundingClientRect().width),
      layoutIconMode: layoutIcon.getAttribute("data-icon-layout"),
      transitionArrowCount: layoutIcon.querySelectorAll(".mode-transition-arrow, .mode-transition-arrow-head").length,
      transitionArrowCenterDelta: Math.abs(arrowCenterX - glyphGapCenterX),
    };
  });
  expect(expandedFooterMetrics.layoutButtonWidth).toBe(66);
  expect(expandedFooterMetrics.layoutIconWidth).toBe(58);
  expect(expandedFooterMetrics.layoutIconMode).toBe("transition");
  expect(expandedFooterMetrics.transitionArrowCount).toBe(2);
  expect(expandedFooterMetrics.transitionArrowCenterDelta).toBeLessThanOrEqual(1);
});

test("keeps the new session control aligned with session rows", async ({ page }) => {
  await createBlankSession(page);
  await expect(page.locator(".session-tab-row.is-entering")).toHaveCount(0);

  const metrics = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".session-tab-row")];
    const firstRow = rows[0];
    const lastRow = rows.at(-1);
    const addButton = document.querySelector(".session-add-button");
    const rowRect = firstRow.getBoundingClientRect();
    const lastRowRect = lastRow.getBoundingClientRect();
    const addRect = addButton.getBoundingClientRect();
    const secondRow = rows[1];
    const titleRect = secondRow.querySelector(".session-name").getBoundingClientRect();
    const indexRect = secondRow.querySelector(".session-index-label").getBoundingClientRect();
    const deleteRect = secondRow.querySelector(".session-index-delete").getBoundingClientRect();
    const shortcutRect = secondRow.querySelector(".session-shortcut").getBoundingClientRect();
    const addIconRect = addButton.querySelector(".session-add-icon").getBoundingClientRect();
    const addTextRect = addButton.querySelector("span").getBoundingClientRect();
    const centerY = (rect) => rect.top + rect.height / 2;
    const secondRowCenterY = centerY(secondRow.getBoundingClientRect());
    const addCenterY = centerY(addRect);

    return {
      rowLeft: Math.round(rowRect.left),
      addLeft: Math.round(addRect.left),
      rowWidth: Math.round(rowRect.width),
      addWidth: Math.round(addRect.width),
      rowHeight: Math.round(rowRect.height),
      addHeight: Math.round(addRect.height),
      addTopGap: Math.round(addRect.top - lastRowRect.bottom),
      addIconCenterDelta: Math.abs(centerY(addIconRect) - addCenterY),
      addTextCenterDelta: Math.abs(centerY(addTextRect) - addCenterY),
      deleteCenterDelta: Math.abs(centerY(deleteRect) - secondRowCenterY),
      indexCenterDelta: Math.abs(centerY(indexRect) - secondRowCenterY),
      shortcutCenterDelta: Math.abs(centerY(shortcutRect) - secondRowCenterY),
      titleCenterDelta: Math.abs(centerY(titleRect) - secondRowCenterY),
    };
  });

  expect(metrics.addLeft).toBe(metrics.rowLeft);
  expect(metrics.addWidth).toBe(metrics.rowWidth);
  expect(metrics.addHeight).toBeGreaterThanOrEqual(metrics.rowHeight);
  expect(metrics.addTopGap).toBeGreaterThanOrEqual(8);
  expect(metrics.addTopGap).toBeLessThanOrEqual(14);
  expect(metrics.addIconCenterDelta).toBeLessThanOrEqual(1);
  expect(metrics.addTextCenterDelta).toBeLessThanOrEqual(1);
  expect(metrics.deleteCenterDelta).toBeLessThanOrEqual(1);
  expect(metrics.indexCenterDelta).toBeLessThanOrEqual(1);
  expect(metrics.shortcutCenterDelta).toBeLessThanOrEqual(1);
  expect(metrics.titleCenterDelta).toBeLessThanOrEqual(1);
});

test("starts blank and shows the template after closing every tab", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
    .toHaveCount(0);
  await createBlankSession(page);

  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("new blank session");
  await expect(page.getByTestId("sticky-editor-surface").getByText("new blank session"))
    .toBeVisible();

  await page.locator(".session-delete-button").nth(1).click();
  let moveConfirmDialog = page.getByRole("dialog", {
    name: "Move session to trash confirmation",
  });
  await expect(moveConfirmDialog).toBeVisible();
  await moveConfirmDialog.getByRole("button", {
    name: /Yes, move new blank session to trash/,
  }).click();
  await expect(page.getByRole("tab")).toHaveCount(1);

  await page.locator(".session-delete-button").first().click();
  moveConfirmDialog = page.getByRole("dialog", {
    name: "Move session to trash confirmation",
  });
  await expect(moveConfirmDialog).toBeVisible();
  await moveConfirmDialog.getByRole("button", {
    name: /Yes, move Untitled to trash/,
  }).click();

  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.getByRole("tab").first()).toHaveAccessibleName(/NotePane/);
  await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
    .toBeVisible();
  await expect(page.getByText("A focused workspace for persistent notes"))
    .toBeVisible();
  await expect(page.getByTestId("sticky-editor-surface"))
    .toHaveClass(/is-template-session/);
  await expect(page.getByRole("button", { name: "Use this template" }))
    .toBeVisible();
});

test("renames a session by double-clicking its tab", async ({ page }) => {
  await page.getByRole("tab").first().dblclick();
  await page.getByLabel("Session name").fill("Renamed session");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("tab", { name: /Renamed session/ })).toBeVisible();
  await expect(page.getByLabel("Session name")).toHaveCount(0);
});

test("derives untitled session names from editor content", async ({ page }) => {
  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab").nth(1)).toHaveAccessibleName(/Untitled/);

  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Generated title from editor content");

  await expect(page.getByRole("tab", {
    name: /Generated title from editor content/,
  })).toBeVisible();
});

test("deletes sidebar sessions and keeps the last delete action available", async ({ page }) => {
  await createBlankSession(page);

  await expect(page.getByRole("tab")).toHaveCount(2);
  const secondDeleteButton = page.locator(".session-delete-button").nth(1);
  const secondIndexLabel = secondDeleteButton.locator(".session-index-label");
  const secondDeleteGlyph = secondDeleteButton.locator(".session-index-delete");
  const secondShortcut = page.locator(".session-tab-row").nth(1).locator(".session-shortcut");
  await expect(secondDeleteButton).toHaveAttribute(
    "aria-label",
    "Delete session Untitled",
  );
  const editorSurfaceBox = await page.getByTestId("sticky-editor-surface").boundingBox();
  await page.mouse.move(editorSurfaceBox.x + 24, editorSurfaceBox.y + 24);
  await expect(secondDeleteButton).toBeVisible();
  await expect(secondIndexLabel).toHaveCSS("opacity", "1");
  await expect(secondDeleteGlyph).toHaveCSS("opacity", "0");
  await expect(secondShortcut).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.getByRole("tab").nth(1).hover();
  await expect(secondIndexLabel).toHaveCSS("opacity", "0");
  await expect(secondDeleteGlyph).toHaveCSS("opacity", "1");
  await expect(secondShortcut).toHaveCSS("opacity", "1");
  const deleteButtonLeftGap = await page.evaluate(() => {
    const secondTab = document.querySelectorAll(".session-tab-row")[1];
    const deleteButton = secondTab.querySelector(".session-delete-button");
    const tabRect = secondTab.getBoundingClientRect();
    const deleteButtonRect = deleteButton.getBoundingClientRect();
    return Math.round(deleteButtonRect.left - tabRect.left);
  });
  expect(deleteButtonLeftGap).toBeGreaterThanOrEqual(0);
  expect(deleteButtonLeftGap).toBeLessThanOrEqual(4);
  await secondDeleteButton.click();

  let moveConfirmDialog = page.getByRole("dialog", {
    name: "Move session to trash confirmation",
  });
  await expect(moveConfirmDialog).toBeVisible();
  await expect(moveConfirmDialog.getByText("Move session to Trash?")).toBeVisible();
  await expect(moveConfirmDialog.getByText(/restore it from Trash or undo immediately/))
    .toBeVisible();
  await page.keyboard.press("Escape");
  await expect(moveConfirmDialog).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(2);

  await secondDeleteButton.click();
  moveConfirmDialog = page.getByRole("dialog", {
    name: "Move session to trash confirmation",
  });
  await expect(moveConfirmDialog).toBeVisible();
  await page.locator(".trash-confirm-backdrop").click({ position: { x: 8, y: 8 } });
  await expect(moveConfirmDialog).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(2);

  await secondDeleteButton.click();
  moveConfirmDialog = page.getByRole("dialog", {
    name: "Move session to trash confirmation",
  });
  await expect(moveConfirmDialog).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab")).toHaveCount(1);
  const undoToast = page.locator(".sticky-toast-success");
  await expect(undoToast).toContainText("Untitled moved to Trash.");
  await expect(undoToast.getByRole("button", { name: "Undo" })).toBeVisible();
  await undoToast.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("tab")).toHaveCount(2);

  await page.getByRole("tab").nth(1).hover();
  await page.locator(".session-delete-button").nth(1).click();
  moveConfirmDialog = page.getByRole("dialog", {
    name: "Move session to trash confirmation",
  });
  await expect(moveConfirmDialog).toBeVisible();
  await moveConfirmDialog.getByRole("button", { name: /Yes, move Untitled to trash/ })
    .click();
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(page.locator(".session-delete-button").first()).toBeEnabled();
  await expect(page.locator(".session-index-label").first()).toHaveCSS("opacity", "1");
  await expect(page.locator(".session-index-delete").first()).toHaveCSS("opacity", "0");

  await page.keyboard.press(modifierShortcut(","));
  const preferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferencesPanel).toBeVisible();
  await preferencesPanel.getByRole("tab", { name: "Trash" }).click();
  const trashList = preferencesPanel.getByRole("list", { name: "Trash notes" });
  const trashRow = trashList.getByRole("listitem").filter({ hasText: "Untitled" });
  await expect(trashRow).toBeVisible();
  await expect(trashRow.getByRole("button", { name: "Restore Untitled" })).toHaveCount(0);
  await expect(trashRow.getByRole("button", { name: "Delete permanently Untitled" }))
    .toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Note sessions" }).getByRole("tab"))
    .toHaveCount(1);

  await trashRow.click();
  await expect(preferencesPanel.getByText("1 selected")).toBeVisible();
  await preferencesPanel.getByRole("button", { name: "Restore 1 selected note" }).click();
  await expect(preferencesPanel.getByText("Trash is empty.")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Note sessions" }).getByRole("tab"))
    .toHaveCount(2);
  await preferencesPanel.getByRole("button", { name: "Close preferences" }).click();
  await expect(preferencesPanel).toHaveCount(0);

  await page.getByRole("tab").nth(1).hover();
  await page.locator(".session-delete-button").nth(1).click();
  moveConfirmDialog = page.getByRole("dialog", {
    name: "Move session to trash confirmation",
  });
  await expect(moveConfirmDialog).toBeVisible();
  await moveConfirmDialog.getByRole("button", { name: /Yes, move Untitled to trash/ })
    .click();
  await expect(page.getByRole("tablist", { name: "Note sessions" }).getByRole("tab"))
    .toHaveCount(1);
  await page.keyboard.press(modifierShortcut(","));
  const reopenedPreferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await reopenedPreferencesPanel.getByRole("tab", { name: "Trash" }).click();
  const reopenedTrashRow = reopenedPreferencesPanel
    .getByRole("list", { name: "Trash notes" })
    .getByRole("listitem")
    .filter({ hasText: "Untitled" });
  await expect(reopenedTrashRow.getByRole("button", { name: "Restore Untitled" }))
    .toHaveCount(0);
  await expect(reopenedTrashRow.getByRole("button", { name: "Delete permanently Untitled" }))
    .toHaveCount(0);
  await reopenedTrashRow.click();
  await expect(reopenedPreferencesPanel.getByText("1 selected")).toBeVisible();
  await reopenedPreferencesPanel.getByRole("button", {
    name: "Delete permanently 1 selected note",
  }).click();
  const confirmDialog = reopenedPreferencesPanel.getByRole("dialog", {
    name: "Delete permanently confirmation",
  });
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.getByText("This note cannot be recovered after deletion."))
    .toBeVisible();
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(reopenedTrashRow).toBeVisible();
  await expect(reopenedPreferencesPanel.getByText("1 selected")).toBeVisible();

  await reopenedPreferencesPanel.getByRole("button", {
    name: "Delete permanently 1 selected note",
  }).click();
  await reopenedPreferencesPanel
    .getByRole("button", { name: /Yes, permanently delete Untitled/ })
    .click();
  await expect(reopenedPreferencesPanel.getByText("Trash is empty.")).toBeVisible();
  await expect(reopenedTrashRow).toHaveCount(0);
});

test("wraps long session titles inside the trash confirmation dialog", async ({ page }) => {
  const longTitle =
    "benchmarkbenchmarkbenchmarkbenchmarkbenchmarkbenchmarkbenchmarkbenchmark" +
    " 맞습니다. 문서에서 ## 다음 작업 섹션을 제거했고 마지막 문장이 길게 이어지는 제목";
  await clickLastEmptyParagraph(page);
  await page.keyboard.insertText(longTitle);
  await expect(page.getByRole("tab").first()).toHaveAccessibleName(/benchmark/);

  await page.getByRole("tab").first().hover();
  await page.locator(".session-delete-button").first().click();
  const moveConfirmDialog = page.getByRole("dialog", {
    name: "Move session to trash confirmation",
  });
  await expect(moveConfirmDialog).toBeVisible();

  const wrappingMetrics = await moveConfirmDialog.evaluate((dialog) => {
    const title = dialog.querySelector(".trash-confirm-title");
    const message = dialog.querySelector(".trash-confirm-message");
    const note = dialog.querySelector(".trash-confirm-note");
    return {
      dialogClientWidth: dialog.clientWidth,
      dialogScrollWidth: dialog.scrollWidth,
      titleClientWidth: title.clientWidth,
      titleScrollWidth: title.scrollWidth,
      messageClientWidth: message.clientWidth,
      messageScrollWidth: message.scrollWidth,
      noteClientWidth: note.clientWidth,
      noteScrollWidth: note.scrollWidth,
      noteWhiteSpace: getComputedStyle(note).whiteSpace,
      noteOverflowWrap: getComputedStyle(note).overflowWrap,
    };
  });
  expect(wrappingMetrics.dialogScrollWidth).toBeLessThanOrEqual(
    wrappingMetrics.dialogClientWidth + 1,
  );
  expect(wrappingMetrics.titleScrollWidth).toBeLessThanOrEqual(
    wrappingMetrics.titleClientWidth + 1,
  );
  expect(wrappingMetrics.messageScrollWidth).toBeLessThanOrEqual(
    wrappingMetrics.messageClientWidth + 1,
  );
  expect(wrappingMetrics.noteScrollWidth).toBeLessThanOrEqual(
    wrappingMetrics.noteClientWidth + 1,
  );
  expect(wrappingMetrics.noteWhiteSpace).toBe("normal");
  expect(["anywhere", "break-word"]).toContain(wrappingMetrics.noteOverflowWrap);
});

test("selects trash notes for bulk restore and permanent delete", async ({ page }) => {
  await createBlankSession(page);
  await createBlankSession(page);
  await expect(page.getByRole("tablist", { name: "Note sessions" }).getByRole("tab"))
    .toHaveCount(3);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Trash preview target");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second preview line");
  await expect(page.getByTestId("sticky-editor-surface").getByText("Second preview line"))
    .toBeVisible();

  await moveSessionToTrash(page, 2);
  await moveSessionToTrash(page, 1);
  await expect(page.getByRole("tablist", { name: "Note sessions" }).getByRole("tab"))
    .toHaveCount(1);

  await page.keyboard.press(modifierShortcut(","));
  const preferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferencesPanel).toBeVisible();
  await preferencesPanel.getByRole("tab", { name: "Trash" }).click();
  const trashList = preferencesPanel.getByRole("list", { name: "Trash notes" });
  await expect(trashList.getByRole("listitem")).toHaveCount(2);
  await expect(trashList.getByRole("button", { name: /Restore Untitled/ })).toHaveCount(0);
  await expect(trashList.getByRole("button", { name: /Delete permanently Untitled/ }))
    .toHaveCount(0);
  const previewTrashRow = trashList.getByRole("listitem").filter({
    hasText: "Trash preview target",
  });
  await expect(previewTrashRow).toBeVisible();
  await expect(preferencesPanel.getByText("0 selected")).toBeVisible();
  await previewTrashRow.getByRole("button", { name: /Preview/ }).click();
  await expect(preferencesPanel.getByText("0 selected")).toBeVisible();
  await expect(previewTrashRow.getByRole("checkbox")).not.toBeChecked();
  const previewDialog = preferencesPanel.getByRole("dialog", {
    name: "Trash note preview",
  });
  await expect(previewDialog).toBeVisible();
  const previewContent = previewDialog.locator(".trash-preview-content");
  await expect(previewContent.getByText("Trash preview target")).toBeVisible();
  await expect(previewContent.getByText("Second preview line")).toBeVisible();
  await expect(previewContent).toHaveCSS("overflow-y", "auto");
  await previewDialog.getByRole("button", { name: "Close preview" }).click();
  await expect(previewDialog).toHaveCount(0);

  const firstTrashCheckbox = trashList.getByRole("checkbox").first();
  await trashList.getByRole("listitem").first().click();
  await expect(firstTrashCheckbox).toBeChecked();
  await expect(preferencesPanel.getByText("1 selected")).toBeVisible();
  await expect(preferencesPanel.getByRole("checkbox", { name: "Select all trash notes" }))
    .toHaveJSProperty("indeterminate", true);

  await preferencesPanel.getByRole("checkbox", { name: "Select all trash notes" }).check();
  await expect(preferencesPanel.getByText("2 selected")).toBeVisible();
  await preferencesPanel.getByRole("button", { name: "Restore 2 selected notes" }).click();
  await expect(preferencesPanel.getByText("Trash is empty.")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Note sessions" }).getByRole("tab"))
    .toHaveCount(3);
  await preferencesPanel.getByRole("button", { name: "Close preferences" }).click();
  await expect(preferencesPanel).toHaveCount(0);

  await moveSessionToTrash(page, 2);
  await moveSessionToTrash(page, 1);
  await page.keyboard.press(modifierShortcut(","));
  const reopenedPreferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await expect(reopenedPreferencesPanel).toBeVisible();
  await reopenedPreferencesPanel.getByRole("tab", { name: "Trash" }).click();
  const reopenedTrashList = reopenedPreferencesPanel.getByRole("list", {
    name: "Trash notes",
  });
  await expect(reopenedTrashList.getByRole("listitem")).toHaveCount(2);

  await reopenedPreferencesPanel.getByRole("checkbox", {
    name: "Select all trash notes",
  }).check();
  await expect(reopenedPreferencesPanel.getByText("2 selected")).toBeVisible();
  await reopenedPreferencesPanel.getByRole("button", {
    name: "Delete permanently 2 selected notes",
  }).click();
  const confirmDialog = reopenedPreferencesPanel.getByRole("dialog", {
    name: "Delete permanently confirmation",
  });
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.getByText("Delete selected permanently?")).toBeVisible();
  await expect(confirmDialog.getByText("These notes cannot be recovered after deletion."))
    .toBeVisible();
  await expect(confirmDialog.getByText("2 selected notes")).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(reopenedPreferencesPanel.getByText("2 selected")).toBeVisible();

  await reopenedPreferencesPanel.getByRole("button", {
    name: "Delete permanently 2 selected notes",
  }).click();
  await reopenedPreferencesPanel.getByRole("button", {
    name: "Yes, permanently delete 2 selected notes",
  }).click();
  await expect(reopenedPreferencesPanel.getByText("Trash is empty.")).toBeVisible();
  await expect(reopenedTrashList.getByRole("listitem")).toHaveCount(0);
});

test("moves the current sticky note to trash from the sticky header", async ({ page }) => {
  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(2);

  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Sticky trash target");
  await expect(page.getByRole("tab", { name: /Sticky trash target/ }))
    .toBeVisible();

  await page.getByRole("button", { name: "Switch to Sticky windows mode" }).click();
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute(
    "data-layout-mode",
    "sticky",
  );

  await openStickyActionBar(page);
  await page.getByRole("button", { name: "Move note to trash" }).click();
  const confirmDialog = page.getByRole("dialog", {
    name: "Move note to trash confirmation",
  });
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog.getByText("Move note to trash?")).toBeVisible();
  await expect(confirmDialog.getByText(/different from closing a sticky window/))
    .toBeVisible();
  await confirmDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute(
    "data-layout-mode",
    "sticky",
  );

  await openStickyActionBar(page);
  await page.getByRole("button", { name: "Move note to trash" }).click();
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: /Yes, move Sticky trash target to trash/ })
    .click();
  await openStickyActionBar(page);
  await page.getByRole("button", { name: "Switch to Tab sessions mode" }).click();
  await expect(page.getByRole("tablist", { name: "Note sessions" }).getByRole("tab"))
    .toHaveCount(1);

  await page.getByRole("button", { name: "Trash" }).click();
  const preferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferencesPanel).toBeVisible();
  const trashRow = preferencesPanel
    .getByRole("list", { name: "Trash notes" })
    .getByRole("listitem")
    .filter({ hasText: "Sticky trash target" });
  await expect(trashRow).toBeVisible();
});
