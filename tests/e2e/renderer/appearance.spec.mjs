import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  expectActiveTabColor,
  expectAdaptiveTooltipPlacement,
  expectDistinctIconColors,
  expectFloatingTypographyMenu,
  expectStickyPlaceholderReadable,
  expectStickyTableChromeReadable,
  expectSystemSymbolIcons,
  getActionIconColors,
  getEditorScaleMetrics,
  getHeaderHeight,
  getStickyContrastSnapshot,
  getStickyHeaderActionChrome,
  getTabCssValue,
  loadTemplatePreview,
  modifierShortcut,
  openStickyActionBar,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

test("keeps sticky chrome outside the editable BlockNote surface", async ({ page }) => {
  await expect(page.getByTestId("session-sidebar")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Note sessions" })).toBeVisible();
  await expect(page.getByLabel("Session name")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Theme" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Theme mode" })).toHaveCount(0);
  await expect(page.getByTestId("session-sidebar-footer")).toBeVisible();
  await expect(page.getByTestId("session-sidebar-footer").getByRole("button", { name: "Export" }))
    .toBeVisible();
  await expect(page.getByTestId("session-sidebar-footer").getByRole("button", { name: "Preferences" }))
    .toBeVisible();
  await expect(page.getByTestId("session-sidebar-footer").getByRole("button", { name: "Trash" }))
    .toBeVisible();
  await expect(page.getByTestId("session-sidebar-footer").locator(".notepane-icon-export"))
    .toHaveClass(/lucide-file-down/);
  await expect(page.getByTestId("session-sidebar-footer").locator(".notepane-icon-settings"))
    .toHaveClass(/lucide-cog/);
  await expect(page.getByTestId("session-sidebar-footer").locator(".notepane-icon-trash"))
    .toHaveClass(/lucide-trash-2/);
  await page.getByTestId("session-sidebar-footer")
    .getByRole("button", { name: "Trash" })
    .click();
  const trashPreferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await expect(trashPreferencesPanel).toBeVisible();
  await expect(trashPreferencesPanel.getByRole("tab", { name: "Trash" }))
    .toHaveAttribute("aria-selected", "true");
  await expect(trashPreferencesPanel.getByText("Trash is empty.")).toBeVisible();
  await trashPreferencesPanel.getByRole("button", { name: "Close preferences" }).click();
  await expect(trashPreferencesPanel).toHaveCount(0);
  await expect(page.getByTestId("session-sidebar-footer").getByRole("button", { name: "Switch to Sticky windows mode" }))
    .toBeVisible();
  await expect(page.getByRole("slider", { name: "Theme color" })).toHaveCount(0);
  await expect(page.getByLabel("Background transparency")).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Color opacity" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  await expect(page.locator("[aria-label='NotePane wordmark']")).toBeVisible();
  await expect(page.getByTestId("session-sidebar").locator("[aria-label='NotePane wordmark']"))
    .toBeVisible();
  await expect(page.getByTestId("session-sidebar").getByRole("button", { name: "Hide sidebar" }))
    .toBeVisible();
  await expect(
    page.locator(
      ".sticky-header input[aria-label='Session name'], .sticky-header input[aria-label='Note title']",
    ),
  ).toHaveCount(0);
  await expect(page.locator(".session-settings")).toHaveCount(0);
  await expect(page.locator(".color-panel")).toHaveCount(0);
  await expect(page.getByText("BlockNote Sticky")).toHaveCount(0);
  await expect(page.locator(".sticky-grip")).toHaveCount(0);

  await clickLastEmptyParagraph(page);
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();

  const dragRegions = await page.evaluate(() => {
    const header = document.querySelector("[data-testid='sticky-header']");
    const editorSurface = document.querySelector("[data-testid='sticky-editor-surface']");
    const sidebar = document.querySelector("[data-testid='session-sidebar']");
    const sidebarTopbar = document.querySelector(".session-sidebar-topbar");
    const sidebarFooter = document.querySelector(".session-sidebar-footer");
    const stickyBody = document.querySelector(".sticky-body");
    const toggle = document.querySelector(".sidebar-toggle");
    const actions = document.querySelector(".sticky-header-actions");
    const topbarRect = sidebarTopbar.getBoundingClientRect();
    const toggleRect = toggle.getBoundingClientRect();
    return {
      header: getComputedStyle(header).getPropertyValue("-webkit-app-region"),
      editorSurface: getComputedStyle(editorSurface).getPropertyValue("-webkit-app-region"),
      sidebar: getComputedStyle(sidebar).getPropertyValue("-webkit-app-region"),
      sidebarTopbar: getComputedStyle(sidebarTopbar).getPropertyValue("-webkit-app-region"),
      sidebarFooter: getComputedStyle(sidebarFooter).getPropertyValue("-webkit-app-region"),
      sidebarAnimationName: getComputedStyle(sidebar).animationName,
      stickyBodyAnimationName: getComputedStyle(stickyBody).animationName,
      toggle: getComputedStyle(toggle).getPropertyValue("-webkit-app-region"),
      toggleBackground: getComputedStyle(toggle).backgroundColor,
      toggleBorderStyle: getComputedStyle(toggle).borderStyle,
      toggleBoxShadow: getComputedStyle(toggle).boxShadow,
      toggleCenterDelta: Math.abs(
        (toggleRect.top + toggleRect.height / 2) -
          (topbarRect.top + topbarRect.height / 2),
      ),
      actions: getComputedStyle(actions).getPropertyValue("-webkit-app-region"),
      editorScrollbarColor: getComputedStyle(editorSurface)
        .getPropertyValue("scrollbar-color"),
      editorScrollbarWidth: getComputedStyle(editorSurface)
        .getPropertyValue("scrollbar-width"),
      editorScrollbarTrackVar: getComputedStyle(editorSurface)
        .getPropertyValue("--sticky-scrollbar-track"),
      editorScrollbarThumbVar: getComputedStyle(editorSurface)
        .getPropertyValue("--sticky-scrollbar-thumb"),
      editorScrollbarThumb: getComputedStyle(
        editorSurface,
        "::-webkit-scrollbar-thumb",
      ).backgroundColor,
      sidebarScrollbarThumb: getComputedStyle(
        sidebar.querySelector(".session-sidebar-content"),
        "::-webkit-scrollbar-thumb",
      ).backgroundColor,
    };
  });

  expect(dragRegions.header).toBe("drag");
  expect(dragRegions.editorSurface).toBe("no-drag");
  expect(dragRegions.sidebar).toBe("no-drag");
  expect(dragRegions.sidebarTopbar).toBe("no-drag");
  expect(dragRegions.sidebarFooter).toBe("no-drag");
  expect(dragRegions.sidebarAnimationName).toBe("none");
  expect(dragRegions.stickyBodyAnimationName).toBe("none");
  expect(dragRegions.toggle).toBe("no-drag");
  expect(dragRegions.toggleBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(dragRegions.toggleBorderStyle).toBe("solid");
  expect(dragRegions.toggleBoxShadow).not.toBe("none");
  expect(dragRegions.toggleCenterDelta).toBeLessThanOrEqual(1);
  expect(dragRegions.actions).toBe("no-drag");
  expect(dragRegions.editorScrollbarColor).toBe("rgba(0, 0, 0, 0) rgba(0, 0, 0, 0)");
  expect(dragRegions.editorScrollbarWidth).toBe("none");
  expect(dragRegions.editorScrollbarTrackVar).toContain("color-mix");
  expect(dragRegions.editorScrollbarThumbVar).toContain("color-mix");
  expect(dragRegions.editorScrollbarThumb).toBe("rgba(0, 0, 0, 0)");
  expect(dragRegions.sidebarScrollbarThumb).not.toBe("rgb(255, 255, 255)");
});

test("keeps light/dark mode global across sidebar sessions", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await expect(page.locator(".brand-wordmark-image-light")).toBeVisible();
  await expect(page.locator(".brand-wordmark-image-dark")).toBeHidden();
  const lightIconColors = await getActionIconColors(page);
  expectDistinctIconColors(lightIconColors);
  await expectSystemSymbolIcons(page);
  await expect(page.getByRole("switch", { name: "Theme mode" })).toHaveCount(0);

  await page.keyboard.press(modifierShortcut("Shift+L"));
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-theme-mode", "dark");
  await expect(page.locator(".brand-wordmark-image-light")).toBeHidden();
  await expect(page.locator(".brand-wordmark-image-dark")).toBeVisible();
  await clickLastEmptyParagraph(page);
  await expect.poll(async () => {
    const darkIconColors = await getActionIconColors(page);
    return {
      changed: Object.keys(lightIconColors).every(
        (key) => darkIconColors[key] !== lightIconColors[key],
      ),
      distinct: new Set(Object.values(darkIconColors)).size,
    };
  }).toEqual({
    changed: true,
    distinct: Object.keys(lightIconColors).length,
  });
  const darkIconColors = await getActionIconColors(page);
  expectDistinctIconColors(darkIconColors);
  expect(darkIconColors.layout).not.toBe(lightIconColors.layout);
  expect(darkIconColors.sidebar).not.toBe(lightIconColors.sidebar);
  expect(darkIconColors.export).not.toBe(lightIconColors.export);
  expect(darkIconColors.trash).not.toBe(lightIconColors.trash);
  await expect.poll(async () => {
    return await page.evaluate(() => ({
      bodyThemeMode: document.body.dataset.themeMode,
      bodyHasDarkClass: document.body.classList.contains("theme-dark"),
      bodyPanelBackground: getComputedStyle(document.body)
        .getPropertyValue("--sticky-panel-bg")
        .trim(),
      blockNoteColorSchemes: [...document.querySelectorAll(".bn-root")]
        .map((element) => element.getAttribute("data-color-scheme")),
    }));
  }).toMatchObject({
    bodyThemeMode: "dark",
    bodyHasDarkClass: true,
    bodyPanelBackground: "#242424",
    blockNoteColorSchemes: expect.arrayContaining(["dark"]),
  });

  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-theme-mode", "dark");

  await page.getByRole("tab").first().click();
  await expect(page.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-theme-mode", "dark");

  await page.keyboard.press(modifierShortcut("Shift+L"));
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-theme-mode", "light");
  await expect(page.locator(".brand-wordmark-image-light")).toBeVisible();
  await expect(page.locator(".brand-wordmark-image-dark")).toBeHidden();
  await expect.poll(async () => {
    return await page.evaluate(() => ({
      bodyThemeMode: document.body.dataset.themeMode,
      bodyHasLightClass: document.body.classList.contains("theme-light"),
      bodyPanelBackground: getComputedStyle(document.body)
        .getPropertyValue("--sticky-panel-bg")
        .trim(),
      blockNoteColorSchemes: [...document.querySelectorAll(".bn-root")]
        .map((element) => element.getAttribute("data-color-scheme")),
    }));
  }).toMatchObject({
    bodyThemeMode: "light",
    bodyHasLightClass: true,
    bodyPanelBackground: "#f5f5f2",
    blockNoteColorSchemes: expect.arrayContaining(["light"]),
  });
});

test("changes editor font size globally with shortcuts", async ({ page }) => {
  const before = await getEditorScaleMetrics(page);

  await expect(page.getByRole("group", { name: "Editor typography" }))
    .toHaveCount(0);

  await page.keyboard.press(modifierShortcut("+"));
  await expect.poll(() => getEditorScaleMetrics(page)).toMatchObject({
    editorFontScale: "1.08",
    shellFontSize: before.shellFontSize,
    headerHeight: before.headerHeight,
    sidebarWidth: before.sidebarWidth,
  });
  await expect(page.locator(".editor-font-size-toast"))
    .toHaveText("Font size 17px");
  await expect(page.locator(".editor-font-size-toast"))
    .toHaveCount(0, { timeout: 3000 });
  await expect(page.getByRole("group", { name: "Editor typography" }))
    .toHaveCount(0);

  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => getEditorScaleMetrics(page)).toMatchObject({
    editorFontScale: "1.08",
    shellFontSize: before.shellFontSize,
    headerHeight: before.headerHeight,
    sidebarWidth: before.sidebarWidth,
  });

  await page.keyboard.press(modifierShortcut("-"));
  await expect.poll(() => getEditorScaleMetrics(page)).toMatchObject({
    editorFontScale: "1",
    shellFontSize: before.shellFontSize,
    headerHeight: before.headerHeight,
    sidebarWidth: before.sidebarWidth,
  });
  await expect(page.locator(".editor-font-size-toast"))
    .toHaveText("Font size 16px");

  await page.getByRole("tab").first().click();
  await expect(page.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => getEditorScaleMetrics(page)).toMatchObject({
    editorFontScale: "1",
    shellFontSize: before.shellFontSize,
    headerHeight: before.headerHeight,
    sidebarWidth: before.sidebarWidth,
  });
});

test("changes editor typography globally from preferences", async ({ page }) => {
  const before = await getEditorScaleMetrics(page);

  await page.keyboard.press(modifierShortcut(","));
  const preferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferencesPanel).toBeVisible();
  await expect(preferencesPanel.getByRole("tab", { name: "General" }))
    .toHaveAttribute("aria-selected", "true");
  const appThemeLabelGap = await preferencesPanel
    .locator(".preference-setting-row")
    .first()
    .evaluate((row) => {
      const title = row.querySelector(".preference-setting-title");
      const description = row.querySelector(".preferences-section-description");
      const titleRect = title.getBoundingClientRect();
      const descriptionRect = description.getBoundingClientRect();
      return Math.round(descriptionRect.top - titleRect.bottom);
    });
  expect(appThemeLabelGap).toBeGreaterThanOrEqual(3);
  const appFontRow = preferencesPanel.locator(".app-font-family-setting");
  await expect(appFontRow.getByText("App font")).toBeVisible();
  await expect(appFontRow.getByLabel("App font family")).toHaveValue("Inter");
  await expect(preferencesPanel.getByText("Workspace backup")).toBeVisible();
  const exportBackupButton = preferencesPanel.getByRole("button", {
    name: "Export backup",
  });
  const importBackupButton = preferencesPanel.getByRole("button", {
    name: "Import backup",
  });
  await expect(exportBackupButton).toBeVisible();
  await expect(importBackupButton).toBeVisible();
  await exportBackupButton.click();
  await expect(page.locator(".sticky-toast-error"))
    .toHaveText("Data backup is available in the desktop app.");
  await importBackupButton.click();
  await expect(page.locator(".sticky-toast-error"))
    .toHaveText("Data restore is available in the desktop app.");
  await appFontRow.getByLabel("App font family").fill("avenir");
  await expect(page.getByRole("listbox", { name: "App font family options" }))
    .toBeVisible();
  await expectFloatingTypographyMenu(page, "App font family options", {
    maxWidth: 238,
  });
  await page.getByRole("option", { name: "Avenir" }).click();
  await expect(page.locator("#preferences-editor")).toHaveCount(0);
  await preferencesPanel.getByRole("tab", { name: "Editor" }).click();
  await expect(preferencesPanel.getByRole("tab", { name: "Editor" }))
    .toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#preferences-editor .preferences-section-title"))
    .toHaveText("Editor");
  await expect(page.getByText("Font family and size apply to every session tab."))
    .toBeVisible();
  const fontFamilyRow = preferencesPanel.locator(".editor-font-family-setting");
  const fontSizeRow = preferencesPanel.locator(".editor-font-size-setting");
  await expect(fontFamilyRow.getByText("Font family")).toBeVisible();
  await expect(fontSizeRow.getByText("Font size")).toBeVisible();
  await expect(fontSizeRow.getByLabel("Editor font size")).toHaveValue("16");
  await expect(fontFamilyRow.getByLabel("Editor font family")).toHaveValue("System");
  await expect(page.getByRole("button", { name: "Open font size menu" }))
    .toBeVisible();

  await fontFamilyRow.getByLabel("Editor font family").fill("gar");
  await expect(page.getByRole("listbox", { name: "Font family options" }))
    .toBeVisible();
  await expectFloatingTypographyMenu(page, "Font family options", {
    maxWidth: 238,
  });
  await expect(page.getByRole("option", { name: "Garamond" })).toBeVisible();
  await page.getByRole("option", { name: "Garamond" }).click();
  await fontSizeRow.getByLabel("Editor font size").fill("24");
  await expect(fontSizeRow.getByLabel("Editor font size")).toHaveValue("24");
  await fontSizeRow.getByRole("button", { name: "Open font size menu" }).click();
  await expect(page.getByRole("listbox", { name: "Editor font size presets" }))
    .toBeVisible();
  await expectFloatingTypographyMenu(page, "Editor font size presets", {
    maxWidth: 104,
  });
  await page.getByRole("option", { name: "48" }).click();
  await expect(fontSizeRow.getByLabel("Editor font size")).toHaveValue("48");
  await fontSizeRow.getByLabel("Editor font size").fill("24");
  await page.getByRole("button", { name: "Close preferences" }).click();

  await expect.poll(() => getEditorScaleMetrics(page)).toMatchObject({
    appFontFamily: expect.stringContaining("Avenir"),
    sidebarFontFamily: expect.stringContaining("Avenir"),
    editorFontScale: "1.5",
    editorFontFamily: expect.stringContaining("Garamond"),
    shellFontSize: before.shellFontSize,
    headerHeight: before.headerHeight,
    sidebarWidth: before.sidebarWidth,
  });

  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => getEditorScaleMetrics(page)).toMatchObject({
    appFontFamily: expect.stringContaining("Avenir"),
    sidebarFontFamily: expect.stringContaining("Avenir"),
    editorFontScale: "1.5",
    editorFontFamily: expect.stringContaining("Garamond"),
    shellFontSize: before.shellFontSize,
    headerHeight: before.headerHeight,
    sidebarWidth: before.sidebarWidth,
  });

  await page.getByRole("tab").first().click();
  await expect(page.getByRole("tab").first()).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => getEditorScaleMetrics(page)).toMatchObject({
    appFontFamily: expect.stringContaining("Avenir"),
    editorFontScale: "1.5",
    editorFontFamily: expect.stringContaining("Garamond"),
  });
});

test("supports light/dark mode and readable sidebar tab background customization", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => {
    window.EyeDropper = class {
      async open() {
        return { sRGBHex: "#00ff31" };
      }
    };
  });

  await expect(page.getByRole("switch", { name: "Theme mode" })).toHaveCount(0);

  await page.keyboard.press(modifierShortcut("Shift+L"));
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-theme-mode", "dark");
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const shell = document.querySelector("[data-testid='sticky-shell']");
      const editor = document.querySelector(".bn-editor");
      const activeTab = document.querySelector(".session-tab-row.active");
      return {
        shellBackground: getComputedStyle(shell).backgroundColor,
        editorText: getComputedStyle(editor).color,
        activeTabBackground: getComputedStyle(activeTab).backgroundColor,
      };
    });
  }).toMatchObject({
    shellBackground: "rgb(25, 25, 25)",
    editorText: "rgb(241, 241, 239)",
    activeTabBackground: "rgb(224, 213, 162)",
  });

  await page.keyboard.press(modifierShortcut("Shift+L"));
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-theme-mode", "light");

  await page.keyboard.press(modifierShortcut(","));
  const preferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferencesPanel).toBeVisible();
  await expect(preferencesPanel.getByRole("tablist", { name: "Preferences pages" }))
    .toBeVisible();
  await expect(preferencesPanel.getByRole("tab", { name: "General" }))
    .toHaveAttribute("aria-selected", "true");
  await expect(preferencesPanel.getByRole("switch", { name: "Theme mode" })).toBeVisible();
  await expect(preferencesPanel.getByText("Keyboard shortcuts")).toHaveCount(0);
  await expect(preferencesPanel.getByLabel("Editor font size")).toHaveCount(0);
  await preferencesPanel.getByRole("tab", { name: "Editor" }).click();
  await expect(preferencesPanel.getByLabel("Editor font size")).toBeVisible();
  await expect(preferencesPanel.getByRole("switch", { name: "Theme mode" })).toHaveCount(0);
  await preferencesPanel.getByRole("tab", { name: "Shortcuts" }).click();
  await expect(preferencesPanel.getByText("Keyboard shortcuts")).toBeVisible();
  await preferencesPanel.getByRole("tab", { name: "Trash" }).click();
  await expect(preferencesPanel.getByText("Trash is empty.")).toBeVisible();
  await expect(preferencesPanel.getByText("Keyboard shortcuts")).toHaveCount(0);
  await expect(preferencesPanel.getByText("Appearance")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Color wheel mode" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Tab color target" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tab background" })).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Tab background color" })).toHaveCount(0);
  await expect(page.getByRole("slider", { name: "Session tab color" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Eyedropper" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(preferencesPanel).toHaveCount(0);

  await page.locator(".session-tab-row").first().click({ button: "right" });
  const sessionMenu = page.getByRole("menu", { name: /Session options/ });
  await expect(sessionMenu).toBeVisible();
  await expect(sessionMenu.getByRole("menuitem", { name: "Color..." })).toBeVisible();
  await expect(sessionMenu.getByRole("menuitem", { name: "Reset color" })).toHaveCount(0);
  await sessionMenu.getByRole("menuitem", { name: "Color..." }).click();

  const sessionColorPanel = page.getByRole("dialog", { name: "Session color panel" });
  await expect(sessionColorPanel).toBeVisible();
  await page.setViewportSize({ width: 640, height: 360 });
  await expect.poll(async () =>
    await page.evaluate(() => {
      const panel = document.querySelector(".color-panel");
      const body = panel?.querySelector(".preferences-panel-body");
      const rect = panel?.getBoundingClientRect();

      return {
        bodyCanScroll: body ? body.scrollHeight > body.clientHeight : false,
        bodyOverflowY: body ? getComputedStyle(body).overflowY : "",
        bottomInsideViewport: rect ? rect.bottom <= window.innerHeight : false,
      };
    }),
  ).toMatchObject({
    bodyCanScroll: true,
    bodyOverflowY: "auto",
    bottomInsideViewport: true,
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole("slider", { name: "Session tab color" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Eyedropper" })).toBeEnabled();
  await expect(page.getByRole("slider", { name: "Color brightness" })).toBeVisible();
  await expect(page.getByLabel("HEX session tab color value")).toHaveValue("fff2b8");
  const opacitySlider = page.getByRole("slider", { name: "Color opacity" });
  await expect(opacitySlider).toBeVisible();
  await expect(opacitySlider).toHaveValue("1");

  const editorSurfaceBox = await page.getByTestId("sticky-editor-surface").boundingBox();
  await page.mouse.move(editorSurfaceBox.x + 24, editorSurfaceBox.y + 24);
  await expect.poll(() => getTabCssValue(page, 0, "backgroundColor"))
    .toBe("rgb(255, 242, 184)");
  const initialActiveBackground = await getTabCssValue(page, 0, "backgroundColor");
  await page.getByRole("button", { name: "Eyedropper" }).click();
  await expect(page.getByLabel("HEX session tab color value")).toHaveValue(/^00ff31$/);
  await expectActiveTabColor(page, "backgroundColor", "rgb(0, 255, 49)");
  await expectActiveTabColor(page, "color", "rgb(31, 31, 31)");
  await opacitySlider.evaluate((input) => {
    input.value = "0.42";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(opacitySlider).toHaveValue("0.42");
  await expectActiveTabColor(page, "backgroundColor", "rgba(0, 255, 49, 0.42)");
  await expectActiveTabColor(page, "color", "rgb(31, 31, 31)");
  await expect(page.getByLabel("HSL session tab color value"))
    .toHaveValue(/\/ 42%\)$/);
  await expect(page.getByLabel("RGB session tab color value"))
    .toHaveValue(/\/ 42%\)$/);
  await expect(page.getByLabel("LCH session tab color value"))
    .toHaveValue(/\/ 42%\)$/);

  const copiedRgbValue = await page.getByLabel("RGB session tab color value").inputValue();
  await page.getByRole("button", { name: "Copy RGB" }).click();
  await expect.poll(async () =>
    await page.evaluate(() => navigator.clipboard.readText()),
  ).toBe(copiedRgbValue);
  await opacitySlider.evaluate((input) => {
    input.value = "1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expectActiveTabColor(page, "backgroundColor", "rgb(0, 255, 49)");
  await page.mouse.move(editorSurfaceBox.x + 24, editorSurfaceBox.y + 24);
  expect(await getTabCssValue(page, 0, "backgroundColor")).not.toBe(initialActiveBackground);

  const wheel = page.getByRole("slider", { name: "Session tab color" });
  const box = await wheel.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 2);
  await expect(page.getByLabel("HEX session tab color value")).toHaveValue(/^ff[0-9a-f]{4}$/);

  await page.getByLabel("Color brightness").evaluate((input) => {
    input.value = "0.86";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
  await expect(page.getByLabel("Color brightness")).toHaveValue("0.86");

  await expect(page.getByLabel("HEX session tab color value")).toHaveValue(/[0-9a-f]{6}/);
  await expect(page.getByLabel("HSL session tab color value")).toHaveValue(/hsl\(/);
  await expect(page.getByLabel("RGB session tab color value")).toHaveValue(/rgb\(/);
  await expect(page.getByLabel("LCH session tab color value")).toHaveValue(/lch\(/);
  await expect(page.getByRole("button", { name: "Copy HEX" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy HSL" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy RGB" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy LCH" })).toBeVisible();

  await page.getByLabel("HEX session tab color value").fill("00ff31");
  await expectActiveTabColor(page, "backgroundColor", "rgb(0, 255, 49)");
  await expectActiveTabColor(page, "color", "rgb(31, 31, 31)");
  await page.keyboard.press("Escape");
  await expect(sessionColorPanel).toHaveCount(0);

  await createBlankSession(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(page.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true");

  const tabStates = await page.evaluate(() => {
    const [inactiveTab, activeTab] = document.querySelectorAll(".session-tab-row");
    const inactiveStyle = getComputedStyle(inactiveTab);
    const activeStyle = getComputedStyle(activeTab);

    return {
      inactiveBackground: inactiveStyle.backgroundColor,
      inactiveBoxShadow: inactiveStyle.boxShadow,
      activeBackground: activeStyle.backgroundColor,
      activeBorderColor: activeStyle.borderColor,
      activeBoxShadow: activeStyle.boxShadow,
    };
  });
  expect(tabStates.inactiveBackground).toBe("rgb(0, 255, 49)");
  expect(tabStates.activeBackground).toBe("rgb(255, 215, 232)");
  expect(tabStates.activeBorderColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(tabStates.activeBoxShadow).not.toBe(tabStates.inactiveBoxShadow);
  expect(tabStates.activeBoxShadow).not.toBe("none");

  await page.locator(".session-tab-row").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Color..." }).click();
  await expect(page.getByRole("slider", { name: "Session tab color" })).toBeVisible();

  await page.getByLabel("HSL session tab color value").fill("hsl(0deg 100% 50%)");
  await expect.poll(() => getTabCssValue(page, 0, "backgroundColor"))
    .toBe("rgb(255, 0, 0)");
  await expect.poll(() => getTabCssValue(page, 0, "color"))
    .toBe("rgba(251, 251, 250, 0.72)");

  await page.getByLabel("RGB session tab color value").fill("rgb(0 0 255)");
  await expect.poll(() => getTabCssValue(page, 0, "backgroundColor"))
    .toBe("rgb(0, 0, 255)");
  await expect.poll(() => getTabCssValue(page, 0, "color"))
    .toBe("rgba(251, 251, 250, 0.72)");

  await page.getByLabel("LCH session tab color value").fill("lch(100% 0 0deg)");
  await expect.poll(() => getTabCssValue(page, 0, "backgroundColor"))
    .toBe("rgb(255, 255, 255)");
  await expect.poll(() => getTabCssValue(page, 0, "color"))
    .toBe("rgba(31, 31, 31, 0.72)");

  const styles = await page.evaluate(() => ({
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    removedGlobalBackgroundVar: getComputedStyle(
      document.querySelector("[data-testid='sticky-shell']"),
    ).getPropertyValue("--sticky-bg-rgb"),
  }));

  expect(styles.bodyBackground).toBe("rgba(0, 0, 0, 0)");
  expect(styles.removedGlobalBackgroundVar).toBe("");
});

test("customizes keyboard shortcuts from preferences", async ({ page }) => {
  const sidebar = page.getByTestId("session-sidebar");
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "expanded");

  await page.keyboard.press(modifierShortcut(","));
  const preferencesPanel = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferencesPanel).toBeVisible();
  await preferencesPanel.getByRole("tab", { name: "Shortcuts" }).click();

  const preferencesShortcut = preferencesPanel.getByRole("button", {
    name: "Shortcut for Preferences",
  });
  await expect(preferencesShortcut).toContainText(",");
  await expect(preferencesShortcut).not.toContainText("Comma");

  const moveTabLeftShortcut = preferencesPanel.getByRole("button", {
    name: "Shortcut for Move tab left",
  });
  const moveTabRightShortcut = preferencesPanel.getByRole("button", {
    name: "Shortcut for Move tab right",
  });
  await expect(moveTabLeftShortcut).toContainText("[");
  await expect(moveTabLeftShortcut).toContainText(/Shift|⇧/);
  await expect(moveTabRightShortcut).toContainText("]");
  await expect(moveTabRightShortcut).toContainText(/Shift|⇧/);
  await expect(preferencesPanel.getByRole("switch", {
    name: "Enable Open tab by number shortcut",
  })).toHaveAttribute("aria-checked", "true");

  const toggleSidebarShortcut = preferencesPanel.getByRole("button", {
    name: "Shortcut for Toggle sidebar",
  });
  const toggleSidebarSwitch = preferencesPanel.getByRole("switch", {
    name: "Enable Toggle sidebar shortcut",
  });
  await expect(toggleSidebarSwitch).toHaveAttribute("aria-checked", "true");
  await expect(toggleSidebarShortcut).toContainText("B");
  await expect(toggleSidebarShortcut).toContainText(/Shift|⇧/);
  await toggleSidebarShortcut.click();
  await expect(toggleSidebarShortcut).toHaveText("Recording");
  await page.keyboard.press(modifierShortcut("Shift+Y"));
  await expect(toggleSidebarShortcut).toContainText("Y");
  await toggleSidebarSwitch.click();
  await expect(toggleSidebarSwitch).toHaveAttribute("aria-checked", "false");

  await preferencesPanel.getByRole("button", { name: "Close preferences" }).click();
  await expect(preferencesPanel).toHaveCount(0);

  await page.keyboard.press(modifierShortcut("Shift+Y"));
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "expanded");

  await page.keyboard.press(modifierShortcut(","));
  await expect(preferencesPanel).toBeVisible();
  await preferencesPanel.getByRole("tab", { name: "Shortcuts" }).click();
  await preferencesPanel.getByRole("switch", {
    name: "Enable Toggle sidebar shortcut",
  }).click();
  await preferencesPanel.getByRole("button", { name: "Close preferences" }).click();
  await expect(preferencesPanel).toHaveCount(0);

  await page.keyboard.press(modifierShortcut("Shift+Y"));
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "compact");
  await page.keyboard.press(modifierShortcut("Shift+Y"));
  await expect(sidebar).toHaveAttribute("data-sidebar-state", "expanded");
});

test("uses sticky pastel color and carries it back to the session tab", async ({ page }) => {
  const tabModeHeaderHeight = await getHeaderHeight(page);
  const defaultTabBackground = await getTabCssValue(page, 0, "backgroundColor");
  expect(defaultTabBackground).toBe("rgb(255, 242, 184)");
  const tabsModeButtonMetrics = await page.evaluate(() => {
    const footer = document.querySelector("[data-testid='session-sidebar-footer']");
    const button = footer.querySelector(".layout-mode-button");
    const icon = button.querySelector(".notepane-action-icon");
    const buttonRect = button.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();

    return {
      buttonWidth: Math.round(buttonRect.width),
      footerControlCount: footer.querySelectorAll("button").length,
      headerLayoutButtonCount: document.querySelectorAll(
        ".sticky-header-actions .layout-mode-button",
      ).length,
      iconWidth: Math.round(iconRect.width),
      iconTone: icon.getAttribute("data-icon-tone"),
      labelCount: button.querySelectorAll(".layout-mode-label").length,
      targetMode: button.getAttribute("data-layout-mode-target"),
    };
  });

  expect(tabsModeButtonMetrics.buttonWidth).toBe(66);
  expect(tabsModeButtonMetrics.footerControlCount).toBe(4);
  expect(tabsModeButtonMetrics.headerLayoutButtonCount).toBe(0);
  expect(tabsModeButtonMetrics.iconWidth).toBe(58);
  expect(tabsModeButtonMetrics.iconTone).toBe("sticky");
  expect(tabsModeButtonMetrics.labelCount).toBe(0);
  expect(tabsModeButtonMetrics.targetMode).toBe("sticky");

  await page.getByTestId("session-sidebar-footer")
    .getByRole("button", { name: "Switch to Sticky windows mode" })
    .click();
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute(
    "data-layout-mode",
    "sticky",
  );
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const shell = document.querySelector("[data-testid='sticky-shell']");
      return getComputedStyle(shell).backgroundColor;
    });
  }).toBe(defaultTabBackground);
  await expect(page.getByRole("group", { name: "Editor typography" }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sticky color" }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show editor tools" }))
    .toHaveCount(0);
  const stickyPinButton = page.getByRole("button", { name: "Pin window" });
  const stickySettingsButton = page.getByRole("button", { name: "Sticky settings" });
  const stickyTrashButton = page.getByRole("button", { name: "Move note to trash" });
  const stickyModeButton = page.getByRole("button", { name: "Switch to Tab sessions mode" });
  await expect.poll(() => getStickyHeaderActionChrome(page)).toMatchObject({
    actionListOpacity: "0",
    actionListPointerEvents: "none",
    previewIconClass: expect.stringContaining("lucide-ellipsis"),
    previewActionLabel: "Show sticky actions",
    previewOpacity: "1",
    previewRightGap: 7,
    previewWidth: 24,
    previewPinCount: 0,
  });

  await page.locator(".sticky-header-actions").hover();
  await expect.poll(() => getStickyHeaderActionChrome(page)).toMatchObject({
    actionListOpacity: "0",
    actionListPointerEvents: "none",
    previewActionLabel: "Show sticky actions",
    previewOpacity: "1",
    previewRightGap: 7,
    previewWidth: 24,
  });

  await openStickyActionBar(page);
  await expect(stickyPinButton).toBeVisible();
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  await expect(stickyModeButton).toBeVisible();
  await expect(stickySettingsButton).toBeVisible();
  await expect(stickyTrashButton).toBeVisible();
  await expect(page.getByRole("button", { name: "Close window" })).toBeVisible();
  await expect.poll(() => getStickyHeaderActionChrome(page)).toMatchObject({
    actionListOpacity: "1",
    actionListPointerEvents: "auto",
    previewActionLabel: "Close window",
    previewIconClass: expect.stringContaining("lucide-x"),
    previewOpacity: "0.72",
    previewRightGap: 7,
    previewWidth: 24,
  });

  await expect.poll(async () => await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='sticky-shell']");
    const header = document.querySelector("[data-testid='sticky-header']");
    const surface = document.querySelector("[data-testid='sticky-editor-surface']");
    const action = document.querySelector(".sticky-settings-button");
    const actionIcon = action.querySelector(".notepane-action-icon");
    const modeButton = document.querySelector(".sticky-header-actions .layout-mode-button");
    const modeIcon = modeButton.querySelector(".notepane-action-icon");
    const headerActions = document.querySelector(".sticky-header-actions");
    const actionPreview = headerActions.querySelector(".sticky-header-action-preview");
    const headerActionButtons = [...headerActions.querySelectorAll("button")];
    const shellBefore = getComputedStyle(shell, "::before");
    const headerStyle = getComputedStyle(header);
    const actionStyle = getComputedStyle(action);

    return {
      shellBorderStyle: getComputedStyle(shell).borderTopStyle,
      shellBorderWidth: getComputedStyle(shell).borderTopWidth,
      shellRadius: getComputedStyle(shell).borderTopLeftRadius,
      shellBoxShadow: getComputedStyle(shell).boxShadow,
      shellMargin: getComputedStyle(shell).marginTop,
      shellBeforeBackground: shellBefore.backgroundImage,
      shellBeforeBackdrop:
        shellBefore.getPropertyValue("-webkit-backdrop-filter") ||
        shellBefore.backdropFilter,
      shellBeforeContent: shellBefore.content,
      headerBackground: headerStyle.backgroundColor,
      headerBackgroundIsOpaque: headerStyle.backgroundColor !== "rgba(0, 0, 0, 0)",
      headerBorderColor: headerStyle.borderBottomColor,
      headerBoxShadow: headerStyle.boxShadow,
      headerShadowIsVisible: headerStyle.boxShadow !== "none",
      headerPosition: headerStyle.position,
      headerTitleCount: document.querySelectorAll("[data-testid='sticky-title-drag-label']").length,
      headerTitleFormCount: document.querySelectorAll(".sticky-title-form").length,
      surfacePaddingTop: getComputedStyle(surface).paddingTop,
      actionRadius: getComputedStyle(action).borderTopLeftRadius,
      actionWidth: Math.round(action.getBoundingClientRect().width),
      actionHeight: Math.round(action.getBoundingClientRect().height),
      actionBackground: actionStyle.backgroundColor,
      actionBorder: actionStyle.borderTopColor,
      actionShadow: actionStyle.boxShadow,
      actionIconWidth: Math.round(actionIcon.getBoundingClientRect().width),
      actionIconClass: actionIcon.getAttribute("class"),
      actionIconTone: actionIcon.getAttribute("data-icon-tone"),
      headerActionButtonLabels: headerActionButtons.map((button) =>
        button.getAttribute("aria-label")
      ),
      headerActionButtonCount: headerActions.querySelectorAll("button").length,
      headerActionButtonWidths: headerActionButtons.map((button) =>
        Math.round(button.getBoundingClientRect().width)
      ),
      headerActionDisplay: getComputedStyle(headerActions).display,
      previewRightGap: Math.round(
        header.getBoundingClientRect().right -
          actionPreview.getBoundingClientRect().right,
      ),
      modeIconLayout: modeIcon.getAttribute("data-icon-layout"),
      modeIconWidth: Math.round(modeIcon.getBoundingClientRect().width),
      modeTarget: modeButton.getAttribute("data-layout-mode-target"),
    };
  })).toMatchObject({
    shellBorderStyle: "none",
    shellBorderWidth: "0px",
    shellRadius: "0px",
    shellMargin: "0px",
    actionRadius: "7px",
    actionWidth: 24,
    actionHeight: 24,
    actionBorder: "rgba(0, 0, 0, 0)",
    actionShadow: "none",
    actionIconWidth: 16,
    actionIconClass: expect.stringContaining("lucide-palette"),
    actionIconTone: "palette",
    headerActionButtonLabels: [
      "Pin window",
      "Export",
      "Switch to Tab sessions mode",
      "Sticky settings",
      "Move note to trash",
      "Close window",
    ],
    headerActionButtonCount: 6,
    headerActionButtonWidths: [24, 24, 24, 24, 24, 24],
    headerTitleCount: 0,
    headerTitleFormCount: 0,
    headerBackground: "rgb(255, 248, 217)",
    headerBackgroundIsOpaque: true,
    headerBorderColor: "rgba(0, 0, 0, 0)",
    headerShadowIsVisible: true,
    headerPosition: "absolute",
    surfacePaddingTop: "30px",
    headerActionDisplay: "flex",
    previewRightGap: 7,
    modeIconLayout: "compact",
    modeIconWidth: 16,
    modeTarget: "tabs",
    shellBoxShadow: "none",
    shellBeforeBackground: "none",
    shellBeforeBackdrop: "none",
    shellBeforeContent: "none",
  });

  await expect(stickyPinButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".sticky-header-actions .sticky-pin-button .notepane-icon-pin"))
    .toHaveAttribute("data-pin-state", "unpinned");
  await stickyPinButton.click();
  const stickyUnpinButton = page.getByRole("button", { name: "Unpin window" });
  await expect(stickyUnpinButton).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".sticky-header-actions .sticky-pin-button .notepane-icon-pin"))
    .toHaveAttribute("data-pin-state", "pinned");
  await expect.poll(() =>
    page.evaluate(() =>
      getComputedStyle(document.querySelector(".sticky-header-actions .sticky-pin-button .notepane-icon-pin")).fill,
    ),
  ).toBe("rgb(216, 59, 59)");
  await page.mouse.move(120, 120);
  await expect.poll(() => getStickyHeaderActionChrome(page)).toMatchObject({
    actionListOpacity: "1",
    previewOpacity: "0.72",
    previewPinCount: 0,
  });
  await stickyUnpinButton.click();
  await expect(page.getByRole("button", { name: "Pin window" }))
    .toHaveAttribute("aria-pressed", "false");

  await clickLastEmptyParagraph(page);
  await expect(page.getByRole("button", { name: "Show editor tools" }))
    .toHaveCount(0);
  await expect(page.getByRole("group", { name: "Editor typography" }))
    .toHaveCount(0);

  await openStickyActionBar(page);
  await stickySettingsButton.click();
  const settingsPanel = page.getByRole("dialog", { name: "Sticky settings window" });
  await expect(settingsPanel).toBeVisible();
  await expect(settingsPanel.getByRole("group", { name: "Editor typography" }))
    .toHaveCount(0);
  await expect(settingsPanel.getByRole("button", { name: "Sticky color" }))
    .toHaveCount(0);
  await expect(settingsPanel.getByRole("slider", { name: "Sticky color" }))
    .toBeVisible();
  await expect(settingsPanel.getByRole("button", { name: "Pin window" }))
    .toHaveCount(0);
  await expect(settingsPanel.getByRole("button", { name: "Switch to Tab sessions mode" }))
    .toHaveCount(0);
  const stickySettingsMetrics = await page.evaluate(() => {
    const windowElement = document.querySelector(".sticky-settings-window");
    const colorSection = windowElement.querySelector(".color-settings-section");

    return {
      colorSectionInsideModal: windowElement.contains(colorSection),
      modeButtonCount: windowElement.querySelectorAll(".layout-mode-button").length,
      pinButtonCount: windowElement.querySelectorAll(".sticky-pin-button").length,
      windowSectionTitles: [...windowElement.querySelectorAll(".preferences-section-title")]
        .map((element) => element.textContent),
    };
  });
  expect(stickySettingsMetrics).toMatchObject({
    colorSectionInsideModal: true,
    modeButtonCount: 0,
    pinButtonCount: 0,
  });
  expect(stickySettingsMetrics.windowSectionTitles).toContain("Appearance");
  expect(stickySettingsMetrics.windowSectionTitles).not.toContain("Window");

  await expect(settingsPanel.getByRole("group", { name: "Editor typography" }))
    .toHaveCount(0);
  await expect(settingsPanel.getByRole("button", { name: "Pin window" }))
    .toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Theme mode" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hide sidebar" })).toHaveCount(0);
  await expect(page.locator("[aria-label='NotePane wordmark']")).toHaveCount(0);
  await expect.poll(() => getHeaderHeight(page)).toBeLessThan(tabModeHeaderHeight);

  await expect(page.getByRole("group", { name: "Pastel colors" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Sticky color" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Color opacity" })).toBeVisible();

  await page.getByRole("button", { name: "Pastel color 2" }).click();
  await expect(page.getByLabel("HEX sticky color value")).toHaveValue("ffd7e8");
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const shell = document.querySelector("[data-testid='sticky-shell']");
      return getComputedStyle(shell).backgroundColor;
    });
  }).toBe("rgb(255, 215, 232)");

  await page.getByLabel("Color opacity").evaluate((input) => {
    input.value = "0.5";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const shell = document.querySelector("[data-testid='sticky-shell']");
      return getComputedStyle(shell).backgroundColor;
    });
  }).toBe("rgba(255, 215, 232, 0.5)");

  await page.keyboard.press("Escape");
  await expect(settingsPanel).toHaveCount(0);
  await openStickyActionBar(page);
  await page.getByRole("button", { name: "Switch to Tab sessions mode" }).click();
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute(
    "data-layout-mode",
    "tabs",
  );
  await expect(page.getByRole("button", { name: "Pin window" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "Theme mode" })).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(1);
  await expectActiveTabColor(page, "backgroundColor", "rgba(255, 215, 232, 0.5)");
  await expectActiveTabColor(page, "color", "rgb(31, 31, 31)");
});

test("keeps sticky editor chrome readable against dark custom backgrounds", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Switch to Sticky windows mode" }).click();
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute(
    "data-layout-mode",
    "sticky",
  );

  await expect(page.getByRole("button", { name: "Show editor tools" }))
    .toHaveCount(0);
  await openStickyActionBar(page);
  await page.getByRole("button", { name: "Sticky settings" }).click();
  const settingsPanel = page.getByRole("dialog", { name: "Sticky settings window" });
  await expect(settingsPanel).toBeVisible();

  await page.getByLabel("HEX sticky color value").fill("ffffff");
  await expect.poll(() => getStickyContrastSnapshot(page)).toMatchObject({
    textColor: "#37352f",
    headerIsOpaque: true,
    editorTextContrastIsReadable: true,
    codeTextContrastIsReadable: true,
    codeTokenContrastIsReadable: true,
    codeBackgroundIsDark: true,
    codeBlockClipsRoundedBackground: true,
    codeSyntaxHighlightingIsPreserved: true,
    tableBorderContrastIsReadable: true,
    settingsButtonContrastIsReadable: true,
  });

  await page.getByLabel("HEX sticky color value").fill("202020");

  await expect.poll(() => getStickyContrastSnapshot(page)).toMatchObject({
    textColor: "#f7f7f4",
    headerIsOpaque: true,
    editorTextContrastIsReadable: true,
    codeTextContrastIsReadable: true,
    codeTokenContrastIsReadable: true,
    codeBackgroundIsDark: true,
    codeBlockClipsRoundedBackground: true,
    codeSyntaxHighlightingIsPreserved: true,
    tableBorderContrastIsReadable: true,
    settingsButtonContrastIsReadable: true,
  });

  await page.keyboard.press("Escape");
  await expectStickyTableChromeReadable(page);
  await expectStickyPlaceholderReadable(page);

  await page.keyboard.press(modifierShortcut("Shift+L"));
  await openStickyActionBar(page);
  await page.getByRole("button", { name: "Sticky settings" }).click();
  await page.getByLabel("HEX sticky color value").fill("ffffff");
  await page.getByLabel("Color opacity").evaluate((input) => {
    input.value = "0.35";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect.poll(() => getStickyContrastSnapshot(page)).toMatchObject({
    textColor: "#f7f7f4",
    codeTextContrastIsReadable: true,
    codeTokenContrastIsReadable: true,
    codeBackgroundIsDark: true,
    codeBlockClipsRoundedBackground: true,
    codeSyntaxHighlightingIsPreserved: true,
    tableBorderContrastIsReadable: true,
    settingsButtonContrastIsReadable: true,
  });
  await page.keyboard.press("Escape");
  await expectStickyTableChromeReadable(page);
  await expectStickyPlaceholderReadable(page);
});

test("keeps sticky dark-mode icon tooltips readable", async ({ page }) => {
  await page.getByRole("button", { name: "Switch to Sticky windows mode" }).click();
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute(
    "data-layout-mode",
    "sticky",
  );
  await page.keyboard.press(modifierShortcut("Shift+L"));

  await openStickyActionBar(page);
  await page.getByRole("button", { name: "Sticky settings" }).hover();
  await expect(page.locator(".adaptive-tooltip")).toBeVisible();

  const tooltipContrast = await page.evaluate(() => {
    const tooltip = document.querySelector(".adaptive-tooltip");
    if (!tooltip) {
      return 0;
    }

    const parseColor = (value) =>
      value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
    const luminance = ([red, green, blue]) => {
      const channels = [red, green, blue].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const style = getComputedStyle(tooltip);
    const foreground = luminance(parseColor(style.color));
    const background = luminance(parseColor(style.backgroundColor));
    return (Math.max(foreground, background) + 0.05) /
      (Math.min(foreground, background) + 0.05);
  });

  expect(tooltipContrast).toBeGreaterThanOrEqual(4.5);
});

test("keeps adaptive tooltips visible from every viewport edge", async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector("#tooltip-boundary-fixtures")?.remove();
    const container = document.createElement("div");
    container.id = "tooltip-boundary-fixtures";
    const fixtures = [
      {
        label: "Bottom edge tooltip",
        style: { bottom: "2px", left: "50%", transform: "translateX(-50%)" },
      },
      {
        label: "Top edge tooltip",
        style: { left: "50%", top: "2px", transform: "translateX(-50%)" },
      },
      {
        label: "Right edge tooltip",
        style: { right: "2px", top: "160px" },
      },
      {
        label: "Left edge tooltip",
        style: { left: "2px", top: "220px" },
      },
    ];

    for (const fixture of fixtures) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "has-tooltip";
      button.textContent = fixture.label;
      button.setAttribute("data-tooltip", `${fixture.label} should stay visible`);
      Object.assign(button.style, {
        position: "fixed",
        zIndex: "900",
        width: "24px",
        height: "24px",
        overflow: "hidden",
        border: "0",
        padding: "0",
        opacity: "0.01",
        pointerEvents: "auto",
        ...fixture.style,
      });
      container.append(button);
    }

    document.body.append(container);
  });

  await expectAdaptiveTooltipPlacement(page, "Bottom edge tooltip", "top");
  await expectAdaptiveTooltipPlacement(page, "Top edge tooltip", "bottom");
  await expectAdaptiveTooltipPlacement(page, "Right edge tooltip", "bottom");
  await expectAdaptiveTooltipPlacement(page, "Left edge tooltip", "bottom");
});

test("keeps the sticky header draggable without title chrome", async ({ page }) => {
  await page.getByRole("button", { name: "Switch to Sticky windows mode" }).click();
  await expect(page.getByTestId("sticky-shell")).toHaveAttribute(
    "data-layout-mode",
    "sticky",
  );

  await expect(page.getByLabel("Note title")).toHaveCount(0);
  await expect(page.getByTestId("sticky-title-drag-label")).toHaveCount(0);
  await expect(page.locator(".sticky-title-form")).toHaveCount(0);

  const headerRegions = await page.evaluate(() => {
    const header = document.querySelector("[data-testid='sticky-header']");
    const trashButton = document.querySelector(".sticky-trash-button");

    return {
      headerRegion: getComputedStyle(header).getPropertyValue("-webkit-app-region"),
      headerDragHandle: header.getAttribute("data-window-drag-handle"),
      headerHeight: Math.round(header.getBoundingClientRect().height),
      trashButtonCursor: getComputedStyle(trashButton).cursor,
    };
  });

  expect(headerRegions.headerRegion).toBe("drag");
  expect(headerRegions.headerDragHandle).toBe("true");
  expect(headerRegions.headerHeight).toBe(30);
  expect(headerRegions.trashButtonCursor).toBe("pointer");
  await page.getByTestId("sticky-header").dblclick({
    position: {
      x: 220,
      y: 14,
    },
  });
  await expect(page.getByLabel("Note title")).toHaveCount(0);
  await expect(page.getByTestId("sticky-title-drag-label")).toHaveCount(0);
});
