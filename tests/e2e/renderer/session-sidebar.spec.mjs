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
  waitForEditorSelection,
  waitForSidebarToSettle,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

// The undo toast after a session moves to Trash, with its time bar.
async function showSessionUndoToast(page) {
  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await moveSessionToTrash(page, 1);
  const undoToast = page.locator(".sticky-toast").filter({ hasText: "moved to Trash." });
  await expect(undoToast).toBeVisible();
  return undoToast;
}

// The bar redraws every frame, so it is read from a frame drawn after the pointer moved.
const readTimeLeft = (timeBar) =>
  timeBar.evaluate((element) => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resolve(Number(element.style.getPropertyValue("--sticky-toast-time-left")));
    }));
  }));

test("holds the undo toast and its time bar while the pointer rests on it", async ({ page }) => {
  await page.clock.install();
  await page.reload();
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  const undoToast = await showSessionUndoToast(page);
  const timeBar = undoToast.getByTestId("sticky-toast-time");
  await expect(timeBar).toBeVisible();

  await undoToast.hover();
  const heldTimeLeft = await readTimeLeft(timeBar);
  expect(heldTimeLeft).toBeGreaterThan(0);
  expect(heldTimeLeft).toBeLessThanOrEqual(1);
  // Well past its 5.2 s timeout, the hovered toast is still there and its bar has not moved.
  await page.clock.runFor(12_000);
  await expect(undoToast).toBeVisible();
  expect(await readTimeLeft(timeBar)).toBe(heldTimeLeft);

  // Once the pointer leaves, the time that was left runs out.
  await page.mouse.move(600, 300);
  await page.clock.runFor(1_000);
  await expect.poll(() => readTimeLeft(timeBar)).toBeLessThan(heldTimeLeft);
  await page.clock.runFor(6_000);
  await expect(undoToast).toHaveCount(0);
});

test("shows and removes the undo toast without motion when the system asks for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const undoToast = await showSessionUndoToast(page);
  expect(await undoToast.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await expect(undoToast.getByTestId("sticky-toast-time")).toBeHidden();

  // Without an exit animation it unmounts in the task that hid it.
  const remainsAfterUndo = await undoToast.evaluate(async (element) => {
    element.querySelector(".sticky-toast-action").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return element.isConnected;
  });
  expect(remainsAfterUndo).toBe(false);
  await expect(page.getByRole("tab")).toHaveCount(2);
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

test("Cmd/Ctrl+Enter inside the editor leaves the caret where it is", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("first");
  await page.keyboard.press("Enter");
  await page.keyboard.type("second");
  await page.keyboard.press("Enter");
  await page.keyboard.type("third");
  const blocks = page.locator(".bn-editor .bn-block-content");
  const blockCount = await blocks.count();
  await page.locator(".bn-editor").getByText("second", { exact: true }).click();
  await page.keyboard.press("End");
  await waitForEditorSelection(page);

  await page.keyboard.press(modifierShortcut("Enter"));
  await page.keyboard.type("!");

  await expect(page.locator(".bn-editor").getByText("second!", { exact: true })).toBeVisible();
  await expect(blocks).toHaveCount(blockCount);
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
  await waitForSidebarToSettle(page);

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
    const layoutIcon = layoutButton.querySelector(".notepane-mode-switch-icon");
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
  expect(compactFooterMetrics.buttonRects).toHaveLength(5);
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
  await waitForSidebarToSettle(page);
  const expandedFooterMetrics = await page.evaluate(() => {
    const footer = document.querySelector("[data-testid='session-sidebar-footer']");
    const layoutButton = footer.querySelector(".layout-mode-button");
    const layoutIcon = layoutButton.querySelector(".notepane-mode-switch-icon");

    return {
      layoutButtonWidth: Math.round(layoutButton.getBoundingClientRect().width),
      layoutIconWidth: Math.round(layoutIcon.getBoundingClientRect().width),
      layoutIconMode: layoutIcon.getAttribute("data-icon-layout"),
      layoutIconTone: layoutIcon.getAttribute("data-icon-tone"),
      layoutIconFamily: layoutIcon.getAttribute("data-icon-family"),
    };
  });
  expect(expandedFooterMetrics.layoutButtonWidth).toBe(46);
  expect(expandedFooterMetrics.layoutIconWidth).toBe(18);
  expect(expandedFooterMetrics.layoutIconMode).toBe("expanded");
  expect(expandedFooterMetrics.layoutIconTone).toBe("sticky");
  expect(expandedFooterMetrics.layoutIconFamily).toBe("system-symbol");
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
  // The field takes the title's place and font, so the title does not jump as renaming starts.
  const title = page.locator(".session-name").first();
  const titleLook = await title.evaluate((element) => {
    const style = getComputedStyle(element);
    return { left: element.getBoundingClientRect().left, size: style.fontSize, weight: style.fontWeight };
  });
  await page.getByRole("tab").first().dblclick();
  const nameField = page.getByLabel("Session name");
  const fieldLook = await nameField.evaluate((element) => {
    const style = getComputedStyle(element);
    return { left: element.getBoundingClientRect().left, size: style.fontSize, weight: style.fontWeight };
  });
  expect(Math.abs(fieldLook.left - titleLook.left)).toBeLessThanOrEqual(1);
  expect({ size: fieldLook.size, weight: fieldLook.weight }).toEqual({ size: titleLook.size, weight: titleLook.weight });

  await nameField.fill("Renamed session");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("tab", { name: /Renamed session/ })).toBeVisible();
  await expect(page.getByLabel("Session name")).toHaveCount(0);
});

test("arrow keys move through the tabs, and into a tab menu the pointer opened", async ({ page }) => {
  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  const firstTab = page.getByRole("tab").first();
  const secondTab = page.getByRole("tab").nth(1);
  await firstTab.focus();
  await page.keyboard.press("ArrowDown");
  await expect(secondTab).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(firstTab).toBeFocused();
  await page.keyboard.press("End");
  await expect(secondTab).toBeFocused();
  await page.keyboard.press("Home");
  await expect(firstTab).toBeFocused();

  // Opened by the pointer, the menu takes the first arrow key; closing it gives focus back.
  await firstTab.click({ button: "right" });
  const menu = page.getByRole("menu", { name: /Session options/ });
  await expect(menu).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitem", { name: "Move to Trash" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menu.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(firstTab).toBeFocused();
});

test("keeps a long session title tooltip inside the window", async ({ page }) => {
  const title = "긴제목".repeat(30);
  await page.getByRole("tab").first().dblclick();
  await page.getByLabel("Session name").fill(title);
  await page.keyboard.press("Enter");

  const tab = page.getByRole("tab").first();
  await tab.hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(await tab.textContent());

  const bounds = await tooltip.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, height: rect.height, viewportWidth: window.innerWidth };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.width).toBeLessThanOrEqual(220);
  expect(bounds.height).toBeGreaterThan(30);
});

// The first click of a double click switches tabs, and the switch remounts the sidebar. In the
// desktop app it takes long enough that the second click can land before it, after it, or with its
// press before and its release after.
test("a right-button double press on another tab never opens its rename later", async ({ page }) => {
  const nameField = page.getByLabel("Session name");
  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  const firstTab = page.getByRole("tab").first();
  await firstTab.evaluate((tab) => {
    for (const [type, detail] of [["mousedown", 1], ["mouseup", 1], ["mousedown", 2], ["mouseup", 2]]) {
      tab.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 2, detail }));
    }
  });
  await firstTab.click();
  await expect(firstTab).toHaveAttribute("aria-selected", "true");
  await expect(nameField).toHaveCount(0);
});

test("renames an inactive session by double-clicking its tab", async ({ page }) => {
  const nameField = page.getByLabel("Session name");
  const firstTab = page.getByRole("tab", { name: /First session/ });
  const untitledTab = page.getByRole("tab", { name: /Untitled/ });
  await page.getByRole("tab").first().dblclick();
  await nameField.fill("First session");
  await page.keyboard.press("Enter");
  await createBlankSession(page);
  await expect(untitledTab).toHaveAttribute("aria-selected", "true");

  // Both clicks before the switch. Escape keeps the name.
  await firstTab.evaluate((tab) => {
    for (const [type, detail] of [
      ["mousedown", 1], ["mouseup", 1], ["click", 1],
      ["mousedown", 2], ["mouseup", 2], ["click", 2], ["dblclick", 2],
    ]) {
      tab.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, detail }));
    }
  });
  await expect(nameField).toBeFocused();
  await expect(nameField).toHaveValue("First session");
  await page.keyboard.press("Escape");
  await expect(nameField).toHaveCount(0);
  await expect(firstTab).toHaveAttribute("aria-selected", "true");

  // The second press before the switch, its release after it.
  const untitledTabElement = await untitledTab.elementHandle();
  await untitledTabElement.evaluate((tab) => {
    for (const [type, detail] of [["mousedown", 1], ["mouseup", 1], ["click", 1], ["mousedown", 2]]) {
      tab.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, detail }));
    }
  });
  await expect.poll(() => untitledTabElement.evaluate((tab) => tab.isConnected)).toBe(false);
  await page.locator(".session-tab-row").nth(1).getByRole("tab").dispatchEvent("mouseup", { detail: 2 });
  await expect(nameField).toBeFocused();
  await nameField.fill("Second session");
  await page.keyboard.press("Enter");
  await expect(nameField).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Second session/ }))
    .toHaveAttribute("aria-selected", "true");

  // The second click after the switch. A blank name keeps the old one.
  await firstTab.dblclick();
  await expect(nameField).toBeFocused();
  await nameField.fill("   ");
  await page.keyboard.press("Enter");
  await expect(nameField).toHaveCount(0);
  await expect(firstTab).toHaveAttribute("aria-selected", "true");
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

test("a trash confirmation opened while the previous one fades out moves its own session", async ({ page }) => {
  await createBlankSession(page);
  await createBlankSession(page);
  const tabs = page.getByRole("tablist", { name: "Note sessions" }).getByRole("tab");
  await expect(tabs).toHaveCount(3);
  // The first two sessions are not the open one, so moving them does not remount the editor.
  const firstRow = await page.locator(".session-tab-row").nth(0).elementHandle();
  const secondRow = await page.locator(".session-tab-row").nth(1).elementHandle();
  const confirmDialog = page.getByRole("dialog", { name: "Move session to trash confirmation" });
  const yes = confirmDialog.getByRole("button", { name: /Yes, move .* to trash/ });

  await firstRow.hover();
  await (await firstRow.$(".session-delete-button")).click();
  await expect(confirmDialog).toBeVisible();
  // A frozen timeline holds the first confirmation in its exit while the second one opens.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
  await yes.click();
  await expect(page.locator(".trash-confirm-dialog[data-state='closing'], [data-state='closing'] .trash-confirm-dialog"))
    .toHaveCount(1);
  await secondRow.hover();
  await (await secondRow.$(".session-delete-button")).click();
  await expect(confirmDialog).toBeVisible();
  // One move at a time: in the browser build two moves in flight each write the session list they
  // started from, so the later one would bring the earlier session back.
  await expect(page.getByRole("tablist", { name: "Note sessions" }))
    .not.toHaveAttribute("aria-busy", "true");
  await yes.click();
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });

  await expect(tabs).toHaveCount(1);
  await expect(confirmDialog).toHaveCount(0);
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

  await page.keyboard.press(modifierShortcut(","));
  const preferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferencesPanel).toBeVisible();
  await preferencesPanel.getByRole("tab", { name: "Trash" }).click();
  const trashRow = preferencesPanel
    .getByRole("list", { name: "Trash notes" })
    .getByRole("listitem")
    .filter({ hasText: "Sticky trash target" });
  await expect(trashRow).toBeVisible();
});

test("opens the session tab menu at the pointer, clamped inside the window", async ({ page }) => {
  const row = page.locator(".session-tab-row").first();
  const box = await row.boundingBox();
  await page.mouse.click(box.x + 20, box.y + 10, { button: "right" });
  const menu = page.getByRole("menu", { name: /Session options/ });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Rename",
    "Duplicate",
    "Color…",
    "New folder…",
    "Move to Trash",
  ]);
  // Open as sticky needs the desktop app's sticky windows.
  await expect(menu.getByRole("menuitem", { name: "Open as sticky" })).toHaveCount(0);
  // Measured once its opening animation has settled.
  await expect.poll(async () => {
    const menuBox = await menu.boundingBox();
    return Math.max(
      Math.abs(menuBox.x - (box.x + 20)),
      Math.abs(menuBox.y - (box.y + 10)),
    );
  }).toBeLessThanOrEqual(8);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // Opened near the bottom-right corner, the menu moves back inside the window.
  const viewport = page.viewportSize();
  await row.dispatchEvent("contextmenu", {
    button: 2,
    clientX: viewport.width - 4,
    clientY: viewport.height - 4,
  });
  await expect(menu).toBeVisible();
  await expect.poll(async () => {
    const rect = await menu.boundingBox();
    return rect.x >= 0 && rect.y >= 0 &&
      rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height;
  }).toBe(true);
});

test("renames, duplicates and moves a session to Trash from its tab menu", async ({ page }) => {
  await loadTemplatePreview(page);
  const menu = page.getByRole("menu", { name: /Session options/ });
  const tabs = page.getByRole("tab");

  await page.locator(".session-tab-row").first().click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Rename" }).click();
  await expect(menu).toHaveCount(0);
  const nameInput = page.getByLabel("Session name");
  await expect(nameInput).toBeFocused();
  await nameInput.fill("Roadmap");
  await nameInput.press("Enter");
  await expect(tabs.first()).toHaveText("Roadmap");

  await page.locator(".session-tab-row").first().click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveText("Roadmap copy");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Launch checklist" })).toBeVisible();

  await page.locator(".session-tab-row").nth(1).click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Move to Trash" }).click();
  const confirmDialog = page.getByRole("dialog", { name: "Move session to trash confirmation" });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: /Yes, move .* to trash/ }).click();
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toHaveText("Roadmap");
});

test("colours a tab in one click from its menu and clears it again", async ({ page }) => {
  const menu = page.getByRole("menu", { name: /Session options/ });
  const row = page.locator(".session-tab-row").first();
  await expect(row).toHaveClass(/\bis-plain\b/);

  await row.click({ button: "right" });
  await expect(menu.getByRole("button", { name: "No color" })).toHaveAttribute("aria-pressed", "true");
  await menu.getByRole("button", { name: "Pastel color 3" }).click();
  await expect(menu).toHaveCount(0);
  await expect(row).not.toHaveClass(/\bis-plain\b/);
  const colouredBackground = await row.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(colouredBackground).not.toBe("rgba(0, 0, 0, 0)");

  await row.click({ button: "right" });
  await expect(menu.getByRole("button", { name: "Pastel color 3" })).toHaveAttribute("aria-pressed", "true");
  await menu.getByRole("button", { name: "No color" }).click();
  await expect(row).toHaveClass(/\bis-plain\b/);
});

// Folders group the tabs. The browser preview keeps them in memory, like its sessions.
async function createFolder(page, name) {
  // Folders are made from the command palette (Cmd+P), not a sidebar button.
  await page.keyboard.press(modifierShortcut("P"));
  const palette = page.getByRole("dialog", { name: "Search notes" });
  await palette.getByRole("textbox", { name: "Search notes" }).fill(">new folder");
  await palette.getByRole("option", { name: /^New folder/ }).click();
  const nameInput = page.getByLabel("Folder name");
  await expect(nameInput).toBeFocused();
  await expect(nameInput).toHaveValue("New folder");
  await nameInput.fill(name);
  await nameInput.press("Enter");
  const header = page.getByRole("button", { name: `Folder ${name}`, exact: true });
  await expect(header).toBeVisible();
  return header;
}

async function moveTabToFolder(page, tabIndex, folderName) {
  const menu = page.getByRole("menu", { name: /Session options/ });
  await page.locator(".session-tab-row").nth(tabIndex).click({ button: "right" });
  await menu.getByRole("menuitem", { name: `Move to ${folderName}`, exact: true }).click();
  await expect(menu).toHaveCount(0);
}

function folderTabRows(page, folderName) {
  return page
    .locator(".session-folder")
    .filter({ has: page.getByRole("button", { name: `Folder ${folderName}`, exact: true }) })
    .locator(".session-tab-row");
}

test("creates a folder under New session and renames it in place", async ({ page }) => {
  const header = await createFolder(page, "Work");
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(header.locator(".session-folder-count")).toHaveText("0");
  const folderMenu = page.getByRole("menu", { name: "Folder options for Work" });
  const nameInput = page.getByLabel("Folder name");

  // Escape keeps the old name.
  await header.click({ button: "right" });
  await folderMenu.getByRole("menuitem", { name: "Rename" }).click();
  await expect(nameInput).toBeFocused();
  await nameInput.fill("Scratch");
  await nameInput.press("Escape");
  await expect(nameInput).toHaveCount(0);
  await expect(header).toBeVisible();

  // Leaving the field keeps what was typed.
  await header.click({ button: "right" });
  await folderMenu.getByRole("menuitem", { name: "Rename" }).click();
  await expect(nameInput).toBeFocused();
  await nameInput.fill("Projects");
  await page.getByTestId("sticky-editor-surface").click();
  await expect(page.getByRole("button", { name: "Folder Projects", exact: true })).toBeVisible();
  await expect(page.locator(".session-folder")).toHaveCount(1);
});

test("a folder name cut short shows in full in a tooltip", async ({ page }) => {
  const tooltip = page.getByRole("tooltip");
  const longName = "Projects and research archive";
  const longHeader = await createFolder(page, longName);
  await longHeader.hover();
  await expect(tooltip).toHaveText(longName);

  // A name with room to show needs none: two frames after the pointer reaches it, still none.
  const shortHeader = await createFolder(page, "Work");
  await page.getByTestId("sticky-editor-surface").hover();
  await expect(tooltip).toHaveCount(0);
  await shortHeader.hover();
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await expect(tooltip).toHaveCount(0);
});

test("moves a tab into a folder from its tab menu and back out", async ({ page }) => {
  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  const [firstId, secondId] = await getSessionTabNoteIds(page);
  const header = await createFolder(page, "Work");
  const menu = page.getByRole("menu", { name: /Session options/ });

  await page.locator(".session-tab-row").first().click({ button: "right" });
  await expect(menu.getByText("Folder", { exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Remove from folder" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Move to Work", exact: true }).click();
  await expect(menu).toHaveCount(0);

  // Ungrouped tabs come first, then the folder; the numbers and Cmd+1..9 follow that order.
  const workTabs = folderTabRows(page, "Work");
  await expect(workTabs).toHaveCount(1);
  await expect(workTabs.first()).toHaveAttribute("data-note-id", firstId);
  await expect.poll(() => getSessionTabNoteIds(page)).toEqual([secondId, firstId]);
  await expect(page.locator(".session-index-label")).toHaveText(["1", "2"]);
  await expect(header.locator(".session-folder-count")).toHaveText("1");
  await page.keyboard.press(modifierShortcut("2"));
  await expect.poll(() => getActiveSessionTabNoteId(page)).toBe(firstId);

  // A tab in a folder offers the way out, and no move to the folder it is in.
  await workTabs.first().click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "Move to Work", exact: true })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Remove from folder" }).click();
  await expect(workTabs).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(header.locator(".session-folder-count")).toHaveText("0");
});

test("collapses a folder from its header and keeps the open note in sight", async ({ page }) => {
  await createBlankSession(page);
  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(3);
  const [firstId, secondId, thirdId] = await getSessionTabNoteIds(page);
  const header = await createFolder(page, "Work");
  await moveTabToFolder(page, 0, "Work");
  await moveTabToFolder(page, 0, "Work");
  const workTabs = folderTabRows(page, "Work");
  await expect(workTabs).toHaveCount(2);
  await expect.poll(() => getSessionTabNoteIds(page)).toEqual([thirdId, firstId, secondId]);

  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(workTabs).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expect(header.locator(".session-folder-count")).toHaveText("2");
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(workTabs).toHaveCount(2);

  // The open note stays in sight inside a collapsed folder, numbered after the tabs above it.
  await workTabs.nth(1).locator(".session-tab-button").click();
  await expect.poll(() => getActiveSessionTabNoteId(page)).toBe(secondId);
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(workTabs).toHaveCount(1);
  await expect(workTabs.first()).toHaveAttribute("data-note-id", secondId);
  await expect(page.locator(".session-index-label")).toHaveText(["1", "2"]);

  // The header menu collapses and expands it too.
  await header.click({ button: "right" });
  await page
    .getByRole("menu", { name: "Folder options for Work" })
    .getByRole("menuitem", { name: "Expand" })
    .click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(workTabs).toHaveCount(2);
});

test("deleting a folder moves its notes out and deletes none", async ({ page }) => {
  await createBlankSession(page);
  const header = await createFolder(page, "Work");
  await moveTabToFolder(page, 0, "Work");
  await expect(folderTabRows(page, "Work")).toHaveCount(1);
  const noteIds = await getSessionTabNoteIds(page);

  await header.click({ button: "right" });
  const folderMenu = page.getByRole("menu", { name: "Folder options for Work" });
  await expect(folderMenu.getByRole("menuitem")).toHaveText([
    "New note in folder",
    "Rename",
    "Collapse",
    "Delete folder",
  ]);
  await folderMenu.getByRole("menuitem", { name: "Delete folder" }).click();

  // Nothing is lost, so there is no confirmation.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(header).toHaveCount(0);
  await expect(page.locator(".session-folder")).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(2);
  expect((await getSessionTabNoteIds(page)).toSorted()).toEqual(noteIds.toSorted());
});

test("creates a note in a folder and a folder from a tab's menu", async ({ page }) => {
  const header = await createFolder(page, "Work");
  await header.click({ button: "right" });
  await page
    .getByRole("menu", { name: "Folder options for Work" })
    .getByRole("menuitem", { name: "New note in folder" })
    .click();
  await chooseBlankSessionTemplate(page);
  const workTabs = folderTabRows(page, "Work");
  await expect(workTabs).toHaveCount(1);
  await expect(workTabs.getByRole("tab")).toHaveAttribute("aria-selected", "true");

  // New folder… moves the tab into a new folder whose name is ready to type.
  await page.locator(".session-tab-row").first().click({ button: "right" });
  await page
    .getByRole("menu", { name: /Session options/ })
    .getByRole("menuitem", { name: "New folder…" })
    .click();
  const nameInput = page.getByLabel("Folder name");
  await expect(nameInput).toBeFocused();
  await nameInput.fill("Ideas");
  await nameInput.press("Enter");
  await expect(folderTabRows(page, "Ideas")).toHaveCount(1);
  await expect(page.locator(".session-folder")).toHaveCount(2);
});

test("drops a dragged tab on a folder header to move it into the folder", async ({ page }) => {
  await createBlankSession(page);
  await expect(page.locator(".session-tab-row.is-entering")).toHaveCount(0);
  const [firstId] = await getSessionTabNoteIds(page);
  const header = await createFolder(page, "Work");

  const row = page.locator(".session-tab-row").first();
  const rowBox = await row.boundingBox();
  const headerBox = await header.boundingBox();
  await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    headerBox.x + headerBox.width / 2,
    headerBox.y + headerBox.height / 2,
    { steps: 8 },
  );
  // A held drag keeps sending dragover; the emulated one only sends it on a move, and a move
  // made while the tab order previews can be lost, so nudge the pointer on the header.
  let nudge = 0;
  await expect(async () => {
    nudge = nudge === 0 ? 1 : 0;
    await page.mouse.move(headerBox.x + headerBox.width / 2 + nudge, headerBox.y + headerBox.height / 2);
    await expect(header).toHaveClass(/\bis-drop-target\b/, { timeout: 500 });
  }).toPass();
  await page.mouse.up();

  const workTabs = folderTabRows(page, "Work");
  await expect(workTabs).toHaveCount(1);
  await expect(workTabs.first()).toHaveAttribute("data-note-id", firstId);
  await expect(header).not.toHaveClass(/\bis-drop-target\b/);
  await expect(page.getByRole("tab")).toHaveCount(2);
});

test("drags a tab out of its folder onto the ungrouped tabs, and back by its folder's tabs", async ({ page }) => {
  await createBlankSession(page);
  await createBlankSession(page);
  await expect(page.locator(".session-tab-row.is-entering")).toHaveCount(0);
  await createFolder(page, "Work");
  await moveTabToFolder(page, 0, "Work");
  const workTabs = folderTabRows(page, "Work");
  await expect(workTabs).toHaveCount(1);
  const movedId = await workTabs.first().getAttribute("data-note-id");
  const ungroupedRows = page.locator(".session-tabs > .session-tab-row");
  await expect(ungroupedRows).toHaveCount(2);

  // The emulated drag sends dragover only on a move, so keep moving until the tab lands.
  const dragTabOnto = async (source, target, settled) => {
    const sourceBox = await source.boundingBox();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    let nudge = 0;
    await expect(async () => {
      nudge = nudge === 0 ? 1 : 0;
      const targetBox = await target.boundingBox();
      await page.mouse.move(targetBox.x + targetBox.width / 2 + nudge, targetBox.y + 4, { steps: 4 });
      await settled();
    }).toPass();
    await page.mouse.up();
  };

  await dragTabOnto(workTabs.first(), ungroupedRows.first(), async () => {
    await expect(workTabs).toHaveCount(0, { timeout: 500 });
    await expect(ungroupedRows.first()).toHaveAttribute("data-note-id", movedId, { timeout: 500 });
  });
  await expect(page.locator(".session-tab-row.is-dragging")).toHaveCount(0);
  await expect(workTabs).toHaveCount(0);
  await expect(ungroupedRows).toHaveCount(3);
  await expect(ungroupedRows.first()).toHaveAttribute("data-note-id", movedId);

  // Dragged back over a tab in the folder, it joins the folder again.
  await moveTabToFolder(page, 1, "Work");
  await expect(workTabs).toHaveCount(1);
  await dragTabOnto(ungroupedRows.first(), workTabs.first(), async () => {
    await expect(workTabs).toHaveCount(2, { timeout: 500 });
  });
  await expect(workTabs).toHaveCount(2);
  await expect(workTabs.and(page.locator(`[data-note-id='${movedId}']`))).toHaveCount(1);
});

// The editor shell remounts for each note; its sidebar, folders and editor must not fade in again,
// which made the whole window blink on every switch.
test("switches sessions without fading the window in again", async ({ page }) => {
  await createBlankSession(page);
  await createBlankSession(page);
  await createFolder(page, "Work");
  await moveTabToFolder(page, 1, "Work");
  await expect(page.locator(".session-tab-row.is-entering")).toHaveCount(0);
  const fadesRunning = () => page.evaluate(() =>
    document.querySelector("[data-testid='sticky-shell']").getAnimations({ subtree: true })
      .filter((animation) => animation.animationName === "notepaneMenuFadeIn" && animation.playState === "running")
      .map((animation) => animation.effect.target.className));

  for (const row of [page.locator(".session-tabs > .session-tab-row").first(), folderTabRows(page, "Work").first()]) {
    await row.getByRole("tab").click();
    await expect(row.getByRole("tab")).toHaveAttribute("aria-selected", "true");
    expect(await fadesRunning()).toEqual([]);
  }
});

async function openSidebarSettings(page) {
  await page.keyboard.press(modifierShortcut(","));
  const settings = page.getByRole("dialog", { name: "Preferences window" });
  await expect(settings).toBeVisible();
  await settings.getByRole("tab", { name: "Sidebar", exact: true }).click();
  return settings;
}

// Tab colours as Tern has them: the open tab's fill with readable text, the other tabs' fill, and
// a border, on tabs without a colour of their own.
test("colours the open and other tabs from Settings", async ({ page }) => {
  await createBlankSession(page);
  const settings = await openSidebarSettings(page);
  await settings.locator("[data-setting-id='tabActiveFill']").getByRole("button", { name: "Green" }).click();
  await settings.locator("[data-setting-id='tabInactiveFill']").getByRole("button", { name: "Purple" }).click();
  await settings.locator("[data-setting-id='tabBorder']").getByRole("radio", { name: "None" }).click();
  await settings.getByRole("button", { name: "Close preferences" }).click();

  // A computed colour as 0..255 channels, whatever syntax the browser reports it in.
  const look = (row) => row.evaluate((element) => {
    const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const channels = (value) => {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = value;
      canvas.fillRect(0, 0, 1, 1);
      return [...canvas.getImageData(0, 0, 1, 1).data];
    };
    const style = getComputedStyle(element);
    return { background: channels(style.backgroundColor), color: channels(style.color), border: channels(style.borderTopColor) };
  });
  const open = page.locator(".session-tab-row.active");
  const other = page.locator(".session-tab-row:not(.active)").first();
  // Green #2f9e44 reads better with black text than white.
  await expect.poll(() => look(open)).toEqual({
    background: [47, 158, 68, 255],
    color: [0, 0, 0, 255],
    border: [0, 0, 0, 0],
  });
  await expect.poll(async () => (await look(other)).background).toEqual([139, 92, 246, 255]);
});

// Numbers and shortcuts turned off give their room to the title, and the delete button still
// shows on hover.
test("hidden tab numbers and shortcuts free their space for the title", async ({ page }) => {
  const row = page.locator(".session-tab-row").first();
  const titleWidth = () => row.locator(".session-tab-button").evaluate((button) => button.getBoundingClientRect().width);
  const widthWithBoth = await titleWidth();

  const settings = await openSidebarSettings(page);
  await settings.getByRole("switch", { name: "Show tab numbers" }).click();
  await settings.getByRole("switch", { name: "Show tab shortcuts" }).click();
  await settings.getByRole("button", { name: "Close preferences" }).click();

  await expect.poll(titleWidth).toBeGreaterThan(widthWithBoth + 40);
  await row.hover();
  const deleteButton = row.getByRole("button", { name: /^Delete session/ });
  await expect.poll(() => deleteButton.evaluate((button) => getComputedStyle(button).opacity)).toBe("1");
  const rowBox = await row.boundingBox();
  const deleteBox = await deleteButton.boundingBox();
  expect(deleteBox.x + deleteBox.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
  expect(deleteBox.x).toBeGreaterThan(rowBox.x + rowBox.width / 2);
  // Over the title's end, it still takes the click (Playwright fails a click another element would get).
  await deleteButton.click();
  await expect(page.getByRole("dialog", { name: "Move session to trash confirmation" })).toBeVisible();
});

// Numbers off with shortcuts on: the shortcut stays on the title's line, at the tab's right end.
test("hidden tab numbers keep each tab's shortcut on the title's line", async ({ page }) => {
  const row = page.locator(".session-tab-row").first();
  const rowHeight = (await row.boundingBox()).height;

  const settings = await openSidebarSettings(page);
  await settings.getByRole("switch", { name: "Show tab numbers" }).click();
  await settings.getByRole("button", { name: "Close preferences" }).click();

  const middle = (box) => box.y + box.height / 2;
  await expect.poll(async () => {
    const rowBox = await row.boundingBox();
    const titleBox = await row.locator(".session-name").boundingBox();
    const shortcutBox = await row.locator(".session-shortcut").boundingBox();
    return {
      height: rowBox.height,
      sameLine: Math.abs(middle(titleBox) - middle(shortcutBox)) <= 2,
      atRightEnd: shortcutBox.x > titleBox.x + titleBox.width,
    };
  }).toEqual({ height: rowHeight, sameLine: true, atRightEnd: true });
  // The delete button shows over the shortcut on hover and takes the click.
  await row.hover();
  await row.getByRole("button", { name: /^Delete session/ }).click();
  await expect(page.getByRole("dialog", { name: "Move session to trash confirmation" })).toBeVisible();
});

test("a first line longer than a title ends the tab's name in an ellipsis", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.insertText("A very long first line that goes on well past the forty-eight characters");
  const name = page.locator(".session-tab-row.active .session-name");
  await expect(name).toHaveText(/…$/);
  expect((await name.textContent()).length).toBeLessThanOrEqual(48);
});

test("a tab's tooltip waits under a resting pointer, then follows it to the next tab at once", async ({ page }) => {
  await createBlankSession(page);
  const tooltip = page.getByRole("tooltip");
  const twoFrames = () => page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.getByRole("tab").first().hover();
  await twoFrames();
  await expect(tooltip).toHaveCount(0);
  await expect(tooltip).toBeVisible();

  await page.getByRole("tab").nth(1).hover();
  await twoFrames();
  await expect(tooltip).toHaveCount(1);
});
