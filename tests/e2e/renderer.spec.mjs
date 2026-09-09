import { expect, test } from "@playwright/test";

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

async function expectStickyTableChromeReadable(page) {
  await page.getByRole("table").hover();
  const lastCell = page.getByRole("cell", { name: "Export PDF" }).last();
  await lastCell.hover();
  await lastCell.click();
  await lastCell.hover();

  await expect(page.locator(".bn-extend-button").first()).toBeVisible();
  await expect(page.locator(".bn-table-handle, .bn-table-cell-handle").first())
    .toBeVisible();
  await expect(page.locator(".bn-table-cell-handle").first()).toBeHidden();
  await expect.poll(() => getStickyTableChromeSnapshot(page)).toMatchObject({
    hasExtendButton: true,
    hasTableHandle: true,
    controlTextContrastIsReadable: true,
    controlSurfaceUsesStickyTone: true,
    controlShadowIsVisible: true,
  });

  await page.locator(".bn-table-handle, .bn-table-cell-handle").first().click();
  const tableMenu = page.locator(".bn-table-handle-menu, .bn-menu-dropdown")
    .filter({ has: page.locator("[role='menuitem']") })
    .first();
  await expect(tableMenu).toBeVisible();
  await page.locator(".bn-table-handle-menu [role='menuitem'], .bn-menu-dropdown [role='menuitem']")
    .first()
    .hover();
  await expect.poll(() => getStickyTableMenuSnapshot(page)).toMatchObject({
    menuTextContrastIsReadable: true,
    menuSurfaceUsesPortalTone: true,
    menuHoverUsesPortalTone: true,
    menuShadowIsVisible: true,
  });
  await page.keyboard.press("Escape");
}

async function expectStickyPlaceholderReadable(page) {
  await clickLastEmptyParagraph(page);

  await expect.poll(() => getStickyPlaceholderSnapshot(page)).toMatchObject({
    hasPlaceholder: true,
    placeholderUsesMutedTone: true,
    placeholderContrastIsReadable: true,
  });
}

async function getStickyTableChromeSnapshot(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='sticky-shell']");
    const controls = [...document.querySelectorAll(
      ".bn-table-handle, .bn-table-cell-handle, .bn-extend-button",
    )].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity) > 0.01
      );
    });
    const firstControl = controls[0];
    const firstExtendButton = controls.find((element) =>
      element.classList.contains("bn-extend-button"),
    );
    const firstTableHandle = controls.find((element) =>
      element.classList.contains("bn-table-handle") ||
      element.classList.contains("bn-table-cell-handle"),
    );
    const parseColor = (color) => {
      const normalizedColor = color.trim();
      if (/^#[0-9a-f]{6}$/i.test(normalizedColor)) {
        return {
          r: Number.parseInt(normalizedColor.slice(1, 3), 16),
          g: Number.parseInt(normalizedColor.slice(3, 5), 16),
          b: Number.parseInt(normalizedColor.slice(5, 7), 16),
          a: 1,
        };
      }
      const channels = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      return {
        r: channels[0] ?? 0,
        g: channels[1] ?? 0,
        b: channels[2] ?? 0,
        a: channels[3] ?? 1,
      };
    };
    const formatRgb = ({ r, g, b }) =>
      `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    const compositeColor = (foregroundColor, backgroundColor) => {
      const foreground = parseColor(foregroundColor);
      const background = parseColor(backgroundColor);
      const alpha = foreground.a;
      return formatRgb({
        r: foreground.r * alpha + background.r * (1 - alpha),
        g: foreground.g * alpha + background.g * (1 - alpha),
        b: foreground.b * alpha + background.b * (1 - alpha),
      });
    };
    const luminance = (color) => {
      const { r, g, b } = parseColor(color);
      const [red, green, blue] = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const contrastRatio = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const colorDistance = (firstColor, secondColor) => {
      const first = parseColor(firstColor);
      const second = parseColor(secondColor);
      return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
    };
    const shellStyle = getComputedStyle(shell);
    const shellBackground =
      shellStyle.getPropertyValue("--sticky-effective-bg").trim() ||
      shellStyle.backgroundColor;
    const controlStyle = firstControl ? getComputedStyle(firstControl) : null;
    const controlBackground = controlStyle?.backgroundColor ?? shellBackground;
    const visibleControlBackground = compositeColor(controlBackground, shellBackground);

    return {
      controlCount: controls.length,
      hasExtendButton: Boolean(firstExtendButton),
      hasTableHandle: Boolean(firstTableHandle),
      controlTextContrastIsReadable:
        contrastRatio(controlStyle?.color ?? "transparent", visibleControlBackground) >= 4.5,
      controlSurfaceUsesStickyTone:
        colorDistance(visibleControlBackground, shellBackground) >= 4 &&
        colorDistance(visibleControlBackground, shellBackground) <= 64,
      controlShadowIsVisible:
        Boolean(controlStyle) && controlStyle.boxShadow !== "none",
    };
  });
}

async function getStickyTableMenuSnapshot(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='sticky-shell']");
    const menus = [...document.querySelectorAll(
      ".bn-table-handle-menu, .bn-menu-dropdown, .mantine-Menu-dropdown",
    )].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity) > 0.01
      );
    });
    const menu = menus[0];
    const item = menu?.querySelector("[role='menuitem'], .mantine-Menu-item");
    const parseColor = (color) => {
      const normalizedColor = color.trim();
      if (/^#[0-9a-f]{6}$/i.test(normalizedColor)) {
        return {
          r: Number.parseInt(normalizedColor.slice(1, 3), 16),
          g: Number.parseInt(normalizedColor.slice(3, 5), 16),
          b: Number.parseInt(normalizedColor.slice(5, 7), 16),
          a: 1,
        };
      }
      const channels = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      return {
        r: channels[0] ?? 0,
        g: channels[1] ?? 0,
        b: channels[2] ?? 0,
        a: channels[3] ?? 1,
      };
    };
    const luminance = (color) => {
      const { r, g, b } = parseColor(color);
      const [red, green, blue] = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const contrastRatio = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const colorDistance = (firstColor, secondColor) => {
      const first = parseColor(firstColor);
      const second = parseColor(secondColor);
      return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
    };
    const shellStyle = getComputedStyle(shell);
    const bodyStyle = getComputedStyle(document.body);
    const menuStyle = menu ? getComputedStyle(menu) : null;
    const itemStyle = item ? getComputedStyle(item) : null;
    const expectedMenuBackground = bodyStyle
      .getPropertyValue("--sticky-portal-menu-bg")
      .trim();
    const expectedMenuHoverBackground = bodyStyle
      .getPropertyValue("--sticky-portal-menu-hover-bg")
      .trim();
    const shellBackground = shellStyle
      .getPropertyValue("--sticky-effective-bg")
      .trim();

    return {
      menuTextContrastIsReadable:
        Boolean(menuStyle) &&
        contrastRatio(itemStyle?.color ?? menuStyle.color, menuStyle.backgroundColor) >= 4.5,
      menuSurfaceUsesPortalTone:
        Boolean(menuStyle) &&
        colorDistance(menuStyle.backgroundColor, expectedMenuBackground) <= 2,
      menuHoverUsesPortalTone:
        Boolean(itemStyle) &&
        colorDistance(itemStyle.backgroundColor, expectedMenuHoverBackground) <= 2,
      menuShadowIsVisible:
        Boolean(menuStyle) && menuStyle.boxShadow !== "none",
      menuSeparatesFromShell:
        Boolean(menuStyle) &&
        colorDistance(menuStyle.backgroundColor, shellBackground) >= 4,
    };
  });
}

async function getStickyPlaceholderSnapshot(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='sticky-shell']");
    const shellStyle = getComputedStyle(shell);
    const shellBackground = shellStyle
      .getPropertyValue("--sticky-effective-bg")
      .trim();
    const expectedPlaceholderColor = shellStyle
      .getPropertyValue("--sticky-muted-color")
      .trim();
    const placeholders = [...document.querySelectorAll(".bn-editor .bn-block-content")]
      .map((element) => {
        const style = getComputedStyle(element, "::after");
        return {
          color: style.color,
          content: style.content,
        };
      })
      .filter(({ content }) => content && content !== "none" && content !== "\"\"");
    const placeholder = placeholders[0];
    const parseColor = (color) => {
      const normalizedColor = color.trim();
      if (/^#[0-9a-f]{6}$/i.test(normalizedColor)) {
        return {
          r: Number.parseInt(normalizedColor.slice(1, 3), 16),
          g: Number.parseInt(normalizedColor.slice(3, 5), 16),
          b: Number.parseInt(normalizedColor.slice(5, 7), 16),
          a: 1,
        };
      }
      const channels = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      return {
        r: channels[0] ?? 0,
        g: channels[1] ?? 0,
        b: channels[2] ?? 0,
        a: channels[3] ?? 1,
      };
    };
    const formatRgb = ({ r, g, b }) =>
      `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    const compositeColor = (foregroundColor, backgroundColor) => {
      const foreground = parseColor(foregroundColor);
      const background = parseColor(backgroundColor);
      const alpha = foreground.a;
      return formatRgb({
        r: foreground.r * alpha + background.r * (1 - alpha),
        g: foreground.g * alpha + background.g * (1 - alpha),
        b: foreground.b * alpha + background.b * (1 - alpha),
      });
    };
    const luminance = (color) => {
      const { r, g, b } = parseColor(color);
      const [red, green, blue] = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const contrastRatio = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const colorDistance = (firstColor, secondColor) => {
      const first = parseColor(firstColor);
      const second = parseColor(secondColor);
      return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b);
    };
    const visiblePlaceholderColor = placeholder
      ? compositeColor(placeholder.color, shellBackground)
      : "transparent";

    return {
      hasPlaceholder: Boolean(placeholder),
      placeholderUsesMutedTone:
        Boolean(placeholder) &&
        colorDistance(placeholder.color, expectedPlaceholderColor) <= 2,
      placeholderContrastIsReadable:
        Boolean(placeholder) &&
        contrastRatio(visiblePlaceholderColor, shellBackground) >= 3,
    };
  });
}

async function getStickyContrastSnapshot(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='sticky-shell']");
    const header = document.querySelector("[data-testid='sticky-header']");
    const settingsButton = document.querySelector(".sticky-settings-button");
    const editor = document.querySelector(".bn-editor");
    const codeBlock = document.querySelector(
      ".bn-editor [data-content-type='codeBlock']",
    );
    const codeBlockPre = codeBlock?.querySelector("pre");
    const code =
      codeBlock?.querySelector("code") ?? document.querySelector(".bn-editor code");
    const tableCell = document.querySelector(
      ".bn-editor td, .bn-editor th, .bn-editor .bn-table-cell",
    );
    const codeBlockStyle = codeBlock ? getComputedStyle(codeBlock) : null;
    const codeBlockPreStyle = codeBlockPre ? getComputedStyle(codeBlockPre) : null;
    const codeStyle = code ? getComputedStyle(code) : null;
    const tableCellStyle = tableCell ? getComputedStyle(tableCell) : null;
    const parseColor = (color) => {
      const normalizedColor = color.trim();
      if (normalizedColor === "transparent") {
        return { r: 0, g: 0, b: 0, a: 0 };
      }
      if (/^#[0-9a-f]{6}$/i.test(normalizedColor)) {
        return {
          r: Number.parseInt(normalizedColor.slice(1, 3), 16),
          g: Number.parseInt(normalizedColor.slice(3, 5), 16),
          b: Number.parseInt(normalizedColor.slice(5, 7), 16),
          a: 1,
        };
      }
      const channels = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
      return {
        r: channels[0] ?? 0,
        g: channels[1] ?? 0,
        b: channels[2] ?? 0,
        a: channels[3] ?? 1,
      };
    };
    const formatRgb = ({ r, g, b }) =>
      `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
    const compositeColor = (foregroundColor, backgroundColor) => {
      const foreground = parseColor(foregroundColor);
      const background = parseColor(backgroundColor);
      const alpha = foreground.a;
      return formatRgb({
        r: foreground.r * alpha + background.r * (1 - alpha),
        g: foreground.g * alpha + background.g * (1 - alpha),
        b: foreground.b * alpha + background.b * (1 - alpha),
      });
    };
    const luminance = (color) => {
      const { r, g, b } = parseColor(color);
      const [red, green, blue] = [r, g, b].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const contrastRatio = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const shellStyle = getComputedStyle(shell);
    const shellBackground =
      shellStyle.getPropertyValue("--sticky-effective-bg").trim() ||
      shellStyle.backgroundColor;
    const codeBackgroundColor = [
      codeBlockStyle?.backgroundColor,
      codeBlockPreStyle?.backgroundColor,
      codeStyle?.backgroundColor,
    ].find((backgroundColor) => backgroundColor && parseColor(backgroundColor).a > 0) ??
      shellBackground;
    const codeBackground = compositeColor(codeBackgroundColor, shellBackground);
    const codeBlockRadius = Number.parseFloat(
      codeBlockStyle?.borderTopLeftRadius ?? "0",
    );
    const codeBlockPreRadius = Number.parseFloat(
      codeBlockPreStyle?.borderTopLeftRadius ?? "0",
    );
    const codeTextColor = codeStyle?.color ?? codeBlockStyle?.color ?? shellStyle.color;
    const codeTokenElements = codeBlock
      ? [
          codeBlock,
          ...codeBlock.querySelectorAll(
            "pre, code, span, [style*='color'], [class*='token'], [class*='hljs'], [class*='cm-']",
          ),
        ].filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return Boolean(
            element.textContent?.trim() &&
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0,
          );
        })
      : [];
    const codeTokenContrasts = codeTokenElements.map((element) =>
      contrastRatio(getComputedStyle(element).color, codeBackground),
    );
    const codeTokenContrastMin = codeTokenContrasts.length > 0
      ? Math.min(...codeTokenContrasts)
      : 0;
    const codeTokenDistinctColorCount = new Set(
      codeTokenElements.map((element) => getComputedStyle(element).color),
    ).size;
    const tableBorderColor = tableCellStyle?.borderTopColor ?? shellStyle
      .getPropertyValue("--sticky-table-border-color");
    const visibleTableBorderColor = compositeColor(tableBorderColor, shellBackground);
    const settingsButtonColor = getComputedStyle(settingsButton).color;
    const headerBackgroundColor = getComputedStyle(header).backgroundColor;

    return {
      textColor: shellStyle.getPropertyValue("--sticky-text-color").trim(),
      settingsButtonColor,
      headerIsOpaque: parseColor(headerBackgroundColor).a >= 0.96,
      editorTextContrastIsReadable:
        contrastRatio(getComputedStyle(editor).color, shellBackground) >= 4.5,
      codeTextContrastIsReadable:
        contrastRatio(codeTextColor, codeBackground) >= 4.5,
      codeBackgroundIsDark: luminance(codeBackground) <= 0.04,
      codeBlockClipsRoundedBackground:
        codeBlockStyle?.overflow === "hidden" &&
        codeBlockRadius >= 8 &&
        Math.abs(codeBlockRadius - codeBlockPreRadius) <= 1,
      codeTokenContrastMin: Number(codeTokenContrastMin.toFixed(2)),
      codeTokenContrastIsReadable: codeTokenContrastMin >= 4.5,
      codeTokenDistinctColorCount,
      codeSyntaxHighlightingIsPreserved: codeTokenDistinctColorCount >= 3,
      tableBorderColor,
      visibleTableBorderColor,
      tableBorderContrastIsReadable:
        contrastRatio(visibleTableBorderColor, shellBackground) >= 3,
      settingsButtonContrastIsReadable:
        contrastRatio(settingsButtonColor, shellBackground) >= 4.5,
    };
  });
}

async function expectAdaptiveTooltipPlacement(page, label, expectedPlacement) {
  await page.getByRole("button", { name: label }).hover();

  await expect(page.locator(".adaptive-tooltip")).toBeVisible();
  await expect.poll(async () =>
    await page.evaluate(() => {
      const tooltip = document.querySelector(".adaptive-tooltip");
      if (!tooltip) {
        return null;
      }

      const rect = tooltip.getBoundingClientRect();
      return {
        bottomInsideViewport: rect.bottom <= window.innerHeight - 1,
        leftInsideViewport: rect.left >= 1,
        placement: tooltip.getAttribute("data-placement"),
        rightInsideViewport: rect.right <= window.innerWidth - 1,
        topInsideViewport: rect.top >= 1,
      };
    }),
  ).toMatchObject({
    bottomInsideViewport: true,
    leftInsideViewport: true,
    placement: expectedPlacement,
    rightInsideViewport: true,
    topInsideViewport: true,
  });
}

async function getHeaderHeight(page) {
  return await page.evaluate(() => {
    return document.querySelector("[data-testid='sticky-header']")
      ?.getBoundingClientRect().height;
  });
}

async function expectActiveTabColor(page, property, expectedValue) {
  await expect.poll(async () => {
    return await page.evaluate(() => {
      const activeTab = document.querySelector(".session-tab-row.active");
      return activeTab ? getComputedStyle(activeTab) : null;
    });
  }).not.toBeNull();

  await expect.poll(async () => {
    return await page.evaluate((styleProperty) => {
      const activeTab = document.querySelector(".session-tab-row.active");
      return getComputedStyle(activeTab)[styleProperty];
    }, property);
  }).toBe(expectedValue);
}

async function getTabCssValue(page, tabIndex, property) {
  return await page.evaluate(
    ({ targetTabIndex, styleProperty }) => {
      const tab = document.querySelectorAll(".session-tab-row")[targetTabIndex];
      return getComputedStyle(tab)[styleProperty];
    },
    { targetTabIndex: tabIndex, styleProperty: property },
  );
}

async function getSessionTabNoteIds(page) {
  return await page.evaluate(() =>
    [...document.querySelectorAll(".session-tab-row")]
      .map((row) => row.getAttribute("data-note-id"))
      .filter(Boolean),
  );
}

async function getActiveSessionTabNoteId(page) {
  return await page.evaluate(() => {
    const activeTab = document.querySelector("[role='tab'][aria-selected='true']");
    return activeTab?.closest(".session-tab-row")?.getAttribute("data-note-id") ?? null;
  });
}

async function expectSessionTabReorderAnimation(page) {
  const animatedRowCount = await page.evaluate(() =>
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve(document.querySelectorAll(".session-tab-row.is-reorder-animating").length);
        });
      });
    }),
  );
  expect(animatedRowCount).toBeGreaterThan(0);
  await expect(page.locator(".session-tab-row.is-reorder-animating")).toHaveCount(0);
}

async function dragSessionTab(page, sourceIndex, targetIndex, placement = "after") {
  const rows = page.locator(".session-tab-row");
  await rows.nth(sourceIndex).locator(".session-tab-button").hover();
  await expect(page.locator(".adaptive-tooltip")).toBeVisible();

  const sourceBox = await rows.nth(sourceIndex).boundingBox();
  const targetBox = await rows.nth(targetIndex).boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Could not measure session tabs for drag reorder.");
  }

  const targetY =
    placement === "before"
      ? targetBox.y + targetBox.height * 0.25
      : targetBox.y + targetBox.height * 0.75;

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await expect(page.locator(".adaptive-tooltip")).toHaveCount(0);
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetY,
    { steps: 8 },
  );
  await expectSessionTabReorderAnimation(page);
  await page.mouse.up();
}

async function moveSessionToTrash(page, tabIndex) {
  await page.locator(".session-tab-row").nth(tabIndex).hover();
  await page.locator(".session-delete-button").nth(tabIndex).click();
  const moveConfirmDialog = page.getByRole("dialog", {
    name: "Move session to trash confirmation",
  });
  await expect(moveConfirmDialog).toBeVisible();
  await moveConfirmDialog.getByRole("button", { name: /Yes, move .* to trash/ })
    .click();
  await expect(moveConfirmDialog).toHaveCount(0);
}

async function expectNewSessionButtonBelowLastTab(page) {
  await expect(page.locator(".session-tab-row.is-entering")).toHaveCount(0);

  const layout = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".session-tab-row")];
    const lastRow = rows.at(-1);
    const addButton = document.querySelector(".session-add-button");
    const sidebar = document.querySelector("[data-testid='session-sidebar']");

    if (!lastRow || !addButton || !sidebar) {
      return null;
    }

    const lastRowRect = lastRow.getBoundingClientRect();
    const addButtonRect = addButton.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();

    return {
      gapFromLastTab: Math.round(addButtonRect.top - lastRowRect.bottom),
      distanceFromSidebarBottom: Math.round(sidebarRect.bottom - addButtonRect.bottom),
    };
  });

  expect(layout).not.toBeNull();
  expect(layout.gapFromLastTab).toBeGreaterThanOrEqual(0);
  expect(layout.gapFromLastTab).toBeLessThanOrEqual(14);
  expect(layout.distanceFromSidebarBottom).toBeGreaterThan(160);
}

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

test("creates four toggle heading levels with Notion-style shortcuts", async ({ page }) => {
  await clickLastEmptyParagraph(page);

  for (const [headingShortcut, level, text] of [
    ["#", 1, "Toggle heading one"],
    ["##", 2, "Toggle heading two"],
    ["###", 3, "Toggle heading three"],
    ["####", 4, "Toggle heading four"],
  ]) {
    await page.keyboard.type(headingShortcut);
    await page.keyboard.press("Space");
    await expect(page.locator(`[data-content-type='heading'] h${level}`).last())
      .toBeVisible();
    await page.keyboard.type(">");
    await page.keyboard.press("Space");
    const emptyToggleHeading = page.locator(
      `[data-content-type='heading'][data-is-toggleable='true']:has(h${level})`,
    ).last();
    await expect(emptyToggleHeading.locator(".bn-toggle-wrapper"))
      .toHaveAttribute("data-show-children", "false");
    await expect(emptyToggleHeading.locator(
      "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
    ).getByRole("button", {
      name: "Empty toggle. Click to add a block.",
    })).toHaveCount(0);
    await expect.poll(() => emptyToggleHeading.evaluate((element) => {
      const style = getComputedStyle(element, "::after");
      return {
        content: style.content,
        position: style.position,
        fontStyle: style.fontStyle,
      };
    })).toEqual({
      content: `"Heading ${level}"`,
      position: "absolute",
      fontStyle: "normal",
    });
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");

    const heading = page.getByRole("heading", { name: text, level });
    await expect(heading).toBeVisible();
    await expect(heading.locator("xpath=ancestor::*[@data-content-type='heading'][1]"))
      .toHaveAttribute("data-is-toggleable", "true");
  }

  const headingFontSizes = await Promise.all([
    "Toggle heading one",
    "Toggle heading two",
    "Toggle heading three",
    "Toggle heading four",
  ].map((name) => page.getByRole("heading", { name }).evaluate(
    (heading) => Number.parseFloat(getComputedStyle(heading).fontSize),
  )));
  expect(headingFontSizes).toEqual([30, 24, 20, 16]);
});

test("creates and focuses the first child when Enter ends a toggle heading", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("#");
  await page.keyboard.press("Space");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.type("Toggle parent");
  await page.keyboard.press("Enter");
  await page.keyboard.type("First child");

  const toggleOuter = page.getByRole("heading", {
    name: "Toggle parent",
    level: 1,
  }).locator("xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]");
  const child = page.getByText("First child", { exact: true });
  await expect(child).toBeVisible();
  await expect(toggleOuter.evaluate((outer, childElement) => (
    outer.contains(childElement)
  ), await child.elementHandle())).resolves.toBe(true);
  await expect(page.locator(
    ".bn-editor > .bn-block-group > .bn-block-outer > .bn-block-content",
  ).filter({ hasText: /^First child$/ })).toHaveCount(0);

  await page.getByRole("heading", { name: "Toggle parent", level: 1 })
    .evaluate((heading) => {
      heading.closest(".ProseMirror").focus();
      const range = document.createRange();
      range.selectNodeContents(heading);
      range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
  await page.keyboard.press("Enter");
  await page.keyboard.type("New first child");
  const newFirstChild = page.getByText("New first child", { exact: true });
  await expect(newFirstChild).toBeVisible();
  await expect(toggleOuter.evaluate((outer, elements) => {
    const [newChildElement, retainedChildElement] = elements;
    return outer.contains(newChildElement) &&
      outer.contains(retainedChildElement) &&
      Boolean(newChildElement.compareDocumentPosition(retainedChildElement) &
        Node.DOCUMENT_POSITION_FOLLOWING);
  }, [await newFirstChild.elementHandle(), await child.elementHandle()]))
    .resolves.toBe(true);
});

test("uses identical Enter behavior for ordinary and heading toggles", async ({ page }) => {
  for (const { shortcut, title, selector } of [
    {
      shortcut: ">",
      title: "Ordinary parent",
      selector: "[data-content-type='toggleListItem']",
    },
    {
      shortcut: "# >",
      title: "Heading parent",
      selector: "[data-content-type='heading'][data-is-toggleable='true']",
    },
  ]) {
    await clickLastEmptyParagraph(page);
    for (const token of shortcut.split(" ")) {
      await page.keyboard.type(token);
      await page.keyboard.press("Space");
    }
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
    await page.keyboard.type(`${title} child`);

    const toggle = page.locator(selector).filter({ hasText: title }).last();
    const child = page.getByText(`${title} child`, { exact: true });
    await expect(child).toBeVisible();
    await expect(toggle.evaluate((element, childElement) => (
      element.closest(".bn-block-outer").contains(childElement)
    ), await child.elementHandle())).resolves.toBe(true);

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
  }
});

test("removes empty ordinary and heading toggles without losing heading format", async ({ page }) => {
  for (const { shortcut, selector, typedText, resultSelector } of [
    {
      shortcut: ">",
      selector: "[data-content-type='toggleListItem']",
      typedText: "After ordinary toggle",
      resultSelector: "[data-content-type='paragraph']",
    },
    {
      shortcut: "# >",
      selector: "[data-content-type='heading'][data-is-toggleable='true']",
      typedText: "After heading toggle",
      resultSelector: "[data-content-type='heading']:has(h1):not([data-is-toggleable='true'])",
    },
  ]) {
    await clickLastEmptyParagraph(page);
    for (const token of shortcut.split(" ")) {
      await page.keyboard.type(token);
      await page.keyboard.press("Space");
    }
    const toggleBlocks = page.locator(selector);
    const toggleCount = await toggleBlocks.count();
    await expect(toggleBlocks.last()).toBeVisible();
    await page.keyboard.press("Enter");
    await page.keyboard.type(typedText);

    await expect(toggleBlocks).toHaveCount(toggleCount - 1);
    await expect(page.locator(selector).filter({ hasText: typedText }))
      .toHaveCount(0);
    await expect(page.locator(resultSelector).filter({ hasText: typedText }))
      .toBeVisible();
    await page.keyboard.press("Enter");
  }
});

test("backs out of an empty heading toggle one format at a time", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("#");
  await page.keyboard.press("Space");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const headingToggle = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h1)",
  );
  await expect(headingToggle).toBeVisible();

  await page.keyboard.press("Backspace");

  const heading = page.locator(
    "[data-content-type='heading']:has(h1):not([data-is-toggleable='true'])",
  );
  await expect(headingToggle).toHaveCount(0);
  await expect(heading).toBeVisible();

  await page.keyboard.press("Backspace");

  await expect(heading).toHaveCount(0);
  const paragraph = page.locator("[data-content-type='paragraph']").last();
  await expect(paragraph).toBeVisible();

  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const ordinaryToggle = page.locator("[data-content-type='toggleListItem']").last();
  await expect(ordinaryToggle).toBeVisible();
  await expect(ordinaryToggle.locator(".bn-toggle-wrapper"))
    .toHaveAttribute("data-show-children", "false");
  await expect(ordinaryToggle.locator(
    "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
  ).getByRole("button", {
    name: "Empty toggle. Click to add a block.",
  })).toHaveCount(0);

  await page.keyboard.press("Backspace");
  await expect(ordinaryToggle).toHaveCount(0);
  await expect(page.locator("[data-content-type='paragraph']").last()).toBeVisible();
});

test("preserves toggle children when an empty title removes its toggle format", async ({ page }) => {
  for (const { shortcut, title, selector, resultSelector } of [
    {
      shortcut: ">",
      title: "Ordinary with child",
      selector: "[data-content-type='toggleListItem']",
      resultSelector: "[data-content-type='paragraph']",
    },
    {
      shortcut: "# >",
      title: "Heading with child",
      selector: "[data-content-type='heading'][data-is-toggleable='true']",
      resultSelector: "[data-content-type='heading']:has(h1):not([data-is-toggleable='true'])",
    },
  ]) {
    await createBlankSession(page);
    await clickLastEmptyParagraph(page);
    for (const token of shortcut.split(" ")) {
      await page.keyboard.type(token);
      await page.keyboard.press("Space");
    }
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
    await page.keyboard.type(`${title} retained child`);

    const toggle = page.locator(selector).filter({ hasText: title }).last();
    const titleElement = toggle.locator(":scope .bn-inline-content").first();
    await titleElement.evaluate((element) => {
      element.closest(".ProseMirror").focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Enter");
    await page.keyboard.type(`${title} title`);

    await expect(page.locator(selector).filter({ hasText: title })).toHaveCount(0);
    const resultBlock = page.locator(resultSelector).filter({
      hasText: `${title} title`,
    });
    await expect(resultBlock).toBeVisible();
    const resultOuter = resultBlock.locator(
      "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
    );
    await expect(resultOuter.getByText(`${title} retained child`, { exact: true }))
      .toBeVisible();
  }
});

test("keeps regular heading Enter and toggle heading Shift+Enter behavior", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("# Regular heading");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Regular sibling");
  const regularHeadingOuter = page.getByRole("heading", {
    name: "Regular heading",
    level: 1,
  }).locator("xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]");
  const regularSibling = page.getByText("Regular sibling", { exact: true });
  await expect(regularSibling).toBeVisible();
  await expect(regularHeadingOuter.evaluate((outer, siblingElement) => (
    outer.contains(siblingElement)
  ), await regularSibling.elementHandle())).resolves.toBe(false);

  await page.keyboard.press("Enter");
  await page.keyboard.type("#");
  await page.keyboard.press("Space");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.type("Toggle line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("break");
  await expect(page.getByRole("heading", { name: /Toggle line\s*break/, level: 1 }))
    .toBeVisible();
});

test("top-aligns multiline toggle heading arrows", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("#");
  await page.keyboard.press("Space");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.type("First line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Second line");

  const toggleHeading = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h1)",
  ).last();
  await expect(toggleHeading).toBeVisible();
  const alignment = await toggleHeading.evaluate((content) => {
    const wrapper = content.querySelector(".bn-toggle-wrapper");
    const button = content.querySelector(".bn-toggle-button");
    const heading = content.querySelector("h1");
    const wrapperRect = wrapper.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    return {
      buttonTopOffset: Math.round(buttonRect.top - wrapperRect.top),
      buttonCenter: buttonRect.top + buttonRect.height / 2,
      headingCenter: headingRect.top + headingRect.height / 2,
    };
  });
  expect(alignment.buttonTopOffset).toBeLessThanOrEqual(1);
  expect(alignment.buttonCenter).toBeLessThan(alignment.headingCenter);
});

test("top-aligns multiline ordinary toggle arrows with the empty child action", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.type("First line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Second line");

  const toggle = page.locator("[data-content-type='toggleListItem']").last();
  await expect(toggle).toBeVisible();
  const outer = toggle.locator(
    "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
  );
  await toggle.locator(".bn-toggle-button").click();
  await expect(outer.getByRole("button", {
    name: "Empty toggle. Click to add a block.",
  })).toBeVisible();

  const alignment = await toggle.evaluate((content) => {
    const wrapper = content.querySelector(".bn-toggle-wrapper");
    const button = content.querySelector(".bn-toggle-button");
    const title = content.querySelector(".bn-inline-content");
    const wrapperRect = wrapper.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    return {
      buttonTopOffset: Math.round(buttonRect.top - wrapperRect.top),
      buttonCenter: buttonRect.top + buttonRect.height / 2,
      titleCenter: titleRect.top + titleRect.height / 2,
    };
  });
  expect(alignment.buttonTopOffset).toBeLessThanOrEqual(1);
  expect(alignment.buttonCenter).toBeLessThan(alignment.titleCenter);
});

test("shows level-specific placeholders for empty headings", async ({ page }) => {
  await clickLastEmptyParagraph(page);

  for (const [shortcut, level] of [
    ["#", 1],
    ["##", 2],
    ["###", 3],
    ["####", 4],
  ]) {
    await page.keyboard.type(shortcut);
    await page.keyboard.press("Space");
    const heading = page.locator(`[data-content-type='heading']:has(h${level})`).last();
    await expect(heading).toBeVisible();
    await expect.poll(() => heading.evaluate((element) =>
      getComputedStyle(element, "::after").content
    )).toBe(`"Heading ${level}"`);
    await page.keyboard.type(`Level ${level}`);
    await page.keyboard.press("Enter");
  }
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

test("creates a Notion-style toggle with greater-than and Space", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.type("Shortcut toggle");

  const toggle = page
    .locator("[data-content-type='toggleListItem']")
    .filter({ hasText: "Shortcut toggle" });
  await expect(toggle).toBeVisible();
  await expect(toggle.locator(".bn-inline-content")).toHaveText("Shortcut toggle");

  const toggleButton = toggle.locator(".bn-toggle-button");
  const buttonTopBeforeLineBreak = (await toggleButton.boundingBox())?.y;
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Second toggle line");
  await expect.poll(() =>
    toggle.locator(".bn-inline-content").evaluate((element) => element.innerText),
  ).toBe("Shortcut toggle\nSecond toggle line");

  const alignment = await toggle.evaluate((element) => {
    const button = element.querySelector(".bn-toggle-button");
    const content = element.querySelector(".bn-inline-content");
    const firstTextNode = document
      .createTreeWalker(content, NodeFilter.SHOW_TEXT)
      .nextNode();
    const firstLineRange = document.createRange();
    firstLineRange.selectNodeContents(firstTextNode);
    const buttonRect = button.getBoundingClientRect();
    const firstLineRect = firstLineRange.getBoundingClientRect();
    return {
      buttonTop: buttonRect.top,
      firstLineCenterDelta: Math.abs(
        buttonRect.top + buttonRect.height / 2 -
          (firstLineRect.top + firstLineRect.height / 2),
      ),
    };
  });
  expect(Math.abs(alignment.buttonTop - buttonTopBeforeLineBreak))
    .toBeLessThanOrEqual(1);
  expect(alignment.firstLineCenterDelta).toBeLessThanOrEqual(2);
  await expect(
    page.locator("[data-content-type='quote']").filter({ hasText: "Shortcut toggle" }),
  ).toHaveCount(0);
});

test("converts greater-than at the start of an existing line into a toggle", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Existing line");
  await page.keyboard.press("Home");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const toggle = page
    .locator("[data-content-type='toggleListItem']")
    .filter({ hasText: "Existing line" });
  await expect(toggle).toBeVisible();
  await expect(toggle.locator(".bn-inline-content")).toHaveText("Existing line");
  await expect(
    page.locator("[data-content-type='quote']").filter({ hasText: "Existing line" }),
  ).toHaveCount(0);
});

test("undoes toggle conversion without consuming its shortcut marker", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Existing undo line");
  await page.keyboard.press("Home");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const ordinaryToggle = page.locator("[data-content-type='toggleListItem']")
    .filter({ hasText: "Existing undo line" });
  await expect(ordinaryToggle).toBeVisible();

  await page.keyboard.press(modifierShortcut("Z"));

  const restoredParagraph = page.locator("[data-content-type='paragraph']")
    .filter({ hasText: "> Existing undo line" });
  await expect(ordinaryToggle).toHaveCount(0);
  await expect(restoredParagraph.locator(".bn-inline-content"))
    .toHaveText("> Existing undo line");

  await page.keyboard.press(modifierShortcut("Shift+Z"));
  await expect(ordinaryToggle).toBeVisible();

  await createBlankSession(page);
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("##");
  await page.keyboard.press("Space");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const headingToggle = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h2)",
  ).last();
  await expect(headingToggle).toBeVisible();

  await page.keyboard.press(modifierShortcut("Z"));

  const restoredHeading = page.locator(
    "[data-content-type='heading']:has(h2):not([data-is-toggleable='true'])",
  ).last();
  await expect(headingToggle).toHaveCount(0);
  await expect(restoredHeading.locator(".bn-inline-content")).toHaveText("> ");

  await page.keyboard.press(modifierShortcut("Shift+Z"));
  await expect(headingToggle).toBeVisible();
});

test("changes heading levels inside toggle mode as nested format layers", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.type("Nested parent");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Retained nested child");

  const focusTitleStart = async (selector) => {
    await page.locator(selector).last().locator(".bn-inline-content")
      .evaluate((element) => {
        element.closest(".ProseMirror").focus();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
  };

  await focusTitleStart("[data-content-type='toggleListItem']");
  await page.keyboard.type("##");
  await page.keyboard.press("Space");

  const headingTwoToggle = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h2)",
  ).last();
  await expect(headingTwoToggle.locator(".bn-inline-content"))
    .toHaveText("Nested parent");
  const headingTwoOuter = headingTwoToggle.locator(
    "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
  );
  await expect(headingTwoOuter.getByText("Retained nested child", { exact: true }))
    .toBeVisible();
  await expect(headingTwoToggle.locator(".bn-toggle-wrapper"))
    .toHaveAttribute("data-show-children", "true");

  await page.keyboard.press(modifierShortcut("Z"));
  const restoredOrdinaryToggle = page.locator("[data-content-type='toggleListItem']")
    .filter({ hasText: "## Nested parent" });
  await expect(restoredOrdinaryToggle.locator(".bn-inline-content"))
    .toHaveText("## Nested parent");
  await expect(restoredOrdinaryToggle.locator(
    "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
  ).getByText("Retained nested child", { exact: true })).toBeVisible();

  await page.keyboard.press(modifierShortcut("Shift+Z"));
  await expect(headingTwoToggle.locator(".bn-inline-content"))
    .toHaveText("Nested parent");

  await focusTitleStart(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h2)",
  );
  await page.keyboard.type("###");
  await page.keyboard.press("Space");

  const headingThreeToggle = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h3)",
  ).last();
  await expect(headingThreeToggle.locator(".bn-inline-content"))
    .toHaveText("Nested parent");

  await page.keyboard.press(modifierShortcut("Z"));
  await expect(headingTwoToggle.locator(".bn-inline-content"))
    .toHaveText("### Nested parent");

  await page.keyboard.press(modifierShortcut("Shift+Z"));
  await expect(headingThreeToggle.locator(".bn-inline-content"))
    .toHaveText("Nested parent");
});

test("adds toggle mode without flattening heading base format", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, "# Existing heading\n- [ ] Existing checkbox");

  const heading = page.getByRole("heading", {
    name: "Existing heading",
    level: 1,
  });
  await heading.click();
  await page.keyboard.press("Home");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const checkboxText = page.getByText("Existing checkbox", { exact: true });
  await checkboxText.click();
  await page.keyboard.press("Home");
  await page.keyboard.type(">");
  await page.keyboard.press("Space");

  const headingToggle = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h1)",
  ).filter({ hasText: "Existing heading" });
  await expect(headingToggle).toBeVisible();
  await expect(headingToggle.locator(".bn-inline-content"))
    .toHaveText("Existing heading");
  await expect(page.getByRole("heading", {
    name: "Existing heading",
    level: 1,
  })).toBeVisible();

  const checkboxToggle = page.locator("[data-content-type='toggleListItem']")
    .filter({ hasText: "Existing checkbox" });
  await expect(checkboxToggle).toBeVisible();
  await expect(checkboxToggle.locator(".bn-inline-content"))
    .toHaveText("Existing checkbox");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
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

test("toggles checklist and toggle heading without shell interference", async ({ page }) => {
  await loadTemplatePreview(page);
  const checkbox = page.getByRole("checkbox").first();
  await expect(checkbox).not.toBeChecked();
  await checkbox.click();
  await expect(checkbox).toBeChecked();

  const toggleHeadingButton = page
    .locator(".bn-block-outer")
    .filter({ hasText: "Launch checklist" })
    .locator("button")
    .first();
  await toggleHeadingButton.click();
  await expect(page.getByText("Use this template when the workspace is clear"))
    .toBeVisible();
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

  await page.keyboard.press(modifierShortcut("Shift+L"));
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

  const exportStyle = await inlineCode.evaluate((element) => {
    document.body.classList.add("is-exporting");
    const style = getComputedStyle(element);
    const values = {
      backgroundColor: style.backgroundColor,
      color: style.color,
    };
    document.body.classList.remove("is-exporting");
    return values;
  });
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
  await expect(page.locator(".bn-drag-handle-menu:visible").getByRole("menuitem"))
    .toHaveCount(3);
  await expect(page.getByRole("menuitem", { name: /header/i })).toHaveCount(0);
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
  await page.keyboard.press(modifierShortcut("Shift+L"));
  await expect(page.getByTestId("sticky-shell"))
    .toHaveAttribute("data-theme-mode", "dark");

  const darkHighlight = await openBlockMenu();
  expect(darkHighlight.backgroundColor).not.toBe(lightHighlight.backgroundColor);
  expect(darkHighlight.boxShadow).not.toBe(lightHighlight.boxShadow);
});

test("focuses table cells without changing their drag selection behavior", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const activeCell = page.getByRole("cell", { name: "Tabs" }).first();
  const tableCellCount = await page.locator(".bn-editor table td, .bn-editor table th").count();
  await activeCell.getByText("Tabs", { exact: true }).click();

  const focusedCellStyle = await activeCell.evaluate((cell) => {
      const style = getComputedStyle(cell);
      return {
        backgroundColor: style.backgroundColor,
        borderWidth: style.borderWidth,
        boxShadow: style.boxShadow,
        transitionDuration: style.transitionDuration,
      };
    });
  expect(focusedCellStyle).toEqual({
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderWidth: "1px",
    boxShadow: "rgba(139, 92, 246, 0.58) 0px 0px 0px 2px inset",
    transitionDuration: "0s",
  });

  await expect(page.locator(".bn-table-handle, .bn-table-cell-handle").first())
    .toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator(".bn-editor .selectedCell"))
    .toHaveText("Tabs");
  const singleCellSelectionStyle = await page.locator(".bn-editor .selectedCell")
    .evaluate((cell) => {
      const style = getComputedStyle(cell, "::after");
      return {
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
      };
    });
  expect(singleCellSelectionStyle).toEqual({
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    boxShadow: "none",
  });

  await page.keyboard.press("Escape");
  await expect(page.locator(".bn-editor"))
    .not.toHaveClass(/ProseMirror-focused/);
  await expect.poll(() => page.locator(".bn-editor .selectedCell").evaluate((cell) => (
    getComputedStyle(cell, "::after").backgroundColor
  ))).toBe("rgba(0, 0, 0, 0)");
  await expect(page.locator(".bn-formatting-toolbar:visible")).toHaveCount(0);

  await activeCell.getByText("Tabs", { exact: true }).click();
  await page.keyboard.press("Escape");
  const nextCell = page.getByRole("cell", {
    name: "Drafting, comparing, and organizing sessions",
  }).first();
  await nextCell.click({ modifiers: ["Shift"] });
  await expect(page.getByTestId("sticky-editor-surface"))
    .toHaveClass(/has-multi-table-cell-selection/);
  const multiCellSelectionStyle = await page.locator(".bn-editor .selectedCell")
    .first()
    .evaluate((cell) => {
      const style = getComputedStyle(cell, "::after");
      return {
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
      };
    });
  expect(multiCellSelectionStyle).toEqual({
    backgroundColor: "rgba(139, 92, 246, 0.12)",
    boxShadow: "none",
  });

  await activeCell.getByText("Tabs", { exact: true }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".bn-editor .selectedCell"))
    .toHaveText("Drafting, comparing, and organizing sessions");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".bn-editor .selectedCell"))
    .toHaveText("Keeping an active note above other windows");

  await activeCell.getByText("Tabs", { exact: true }).click();
  await page.keyboard.insertText("한글");
  await page.keyboard.press("Tab");
  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection();
    const node = selection?.focusNode;
    const cell = (node instanceof Element ? node : node?.parentElement)?.closest("td, th");
    return {
      cellText: cell?.textContent,
      offset: selection?.focusOffset,
      textLength: node?.textContent?.length,
    };
  })).toMatchObject({
    cellText: "Drafting, comparing, and organizing sessions",
    offset: "Drafting, comparing, and organizing sessions".length,
    textLength: "Drafting, comparing, and organizing sessions".length,
  });

  await page.keyboard.press(modifierShortcut("A"));
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("Drafting, comparing, and organizing sessions");
  await expect(page.locator(".bn-editor .selectedCell")).toHaveCount(0);

  await page.keyboard.press(modifierShortcut("A"));
  await expect(page.locator(".bn-editor .selectedCell")).toHaveCount(1);

  await page.keyboard.press(modifierShortcut("A"));
  await expect.poll(() => page.evaluate(() => {
    return {
      selectedCellCount: document.querySelectorAll(".bn-editor .selectedCell").length,
    };
  })).toMatchObject({
    selectedCellCount: tableCellCount,
  });

  await page.keyboard.press(modifierShortcut("A"));
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toContain("NotePane");
});

test("moves one table cell when Tab completes a Korean IME composition", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const activeCell = page.getByRole("cell", { name: "Tabs" }).first();
  await activeCell.getByText("Tabs", { exact: true }).click();
  await page.keyboard.insertText("ㄱ");

  await page.locator(".bn-editor").evaluate((editor) => {
    editor.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: "Tab",
    }));
    editor.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
  });
  await page.keyboard.press("Tab");

  await expect.poll(() => page.evaluate(() => {
    const selection = window.getSelection();
    const node = selection?.focusNode;
    return (node instanceof Element ? node : node?.parentElement)
      ?.closest("td, th")?.textContent;
  })).toBe("Drafting, comparing, and organizing sessions");
});

test("merges and splits selected table cells with Command+Shift+M", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const firstCell = page.getByRole("cell", { name: "Tabs" }).first();
  const nextCell = page.getByRole("cell", {
    name: "Drafting, comparing, and organizing sessions",
  }).first();
  await firstCell.click();
  await page.keyboard.press("Escape");
  await nextCell.click({ modifiers: ["Shift"] });

  const formattingToolbar = page.locator(".bn-formatting-toolbar:visible");
  await expect(formattingToolbar).toBeVisible();
  await expect(formattingToolbar.locator(".notepane-formatting-type-row"))
    .toHaveCount(0);
  const mergeButton = formattingToolbar.getByRole("button", {
    name: "Merge selected cells",
  });
  await expect(mergeButton).toBeVisible();
  const mergeIconSize = await mergeButton.locator("svg").evaluate((icon) => {
    const rect = icon.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });
  expect(mergeIconSize).toEqual({ height: 21, width: 21 });
  await mergeButton.hover();
  const mergeTooltip = page.locator(".bn-tooltip:visible");
  await expect(mergeTooltip).toContainText("Merge selected cells");
  await expect(mergeTooltip).toContainText(/M/);

  const firstTableRow = page.getByRole("table").getByRole("row").nth(1);
  await expect(firstTableRow.getByRole("cell")).toHaveCount(3);
  await page.keyboard.press(modifierShortcut("Shift+M"));
  await expect(firstTableRow.getByRole("cell")).toHaveCount(2);

  const mergedCell = firstTableRow.getByRole("cell").first();
  await mergedCell.click();
  await page.keyboard.press("Escape");
  const splitButton = page.locator(".bn-formatting-toolbar:visible").getByRole(
    "button",
    { name: "Split merged cell" },
  );
  await expect(splitButton).toBeVisible();
  await splitButton.hover();
  const splitTooltip = page.locator(".bn-tooltip:visible");
  await expect(splitTooltip).toContainText("Split merged cell");
  await expect(splitTooltip).toContainText(/M/);
  await page.keyboard.press(modifierShortcut("Shift+M"));
  await expect(firstTableRow.getByRole("cell")).toHaveCount(3);
});

test("resizes selected table cells live and auto-fits columns on double click", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const cell = page.getByRole("cell", { name: "Tabs" }).first();
  await cell.click();

  const dragColumnEdge = async (distance) => {
    const box = await cell.boundingBox();
    await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width - 1 + distance,
      box.y + box.height / 2,
      { steps: 5 },
    );
  };

  const initialWidth = (await cell.boundingBox()).width;
  await dragColumnEdge(60);
  const liveFocusedWidth = (await cell.boundingBox()).width;
  expect(liveFocusedWidth).toBeGreaterThan(initialWidth + 40);
  await expect.poll(async () => (
    await cell.boundingBox()
  )?.width).toBeCloseTo(liveFocusedWidth, 0);
  await page.mouse.up();

  await page.keyboard.press("Escape");
  await expect(cell).toHaveClass(/selectedCell/);
  const selectedWidthBeforeDrag = (await cell.boundingBox()).width;
  await expect(page.locator(".bn-formatting-toolbar:visible"))
    .toHaveClass(/is-table-context/);
  const selectedBox = await cell.boundingBox();
  await expect(page.evaluate(({ x, y }) => (
    document.elementFromPoint(x, y)?.closest("td, th") !== null
  ), {
    x: selectedBox.x + selectedBox.width - 1,
    y: selectedBox.y + selectedBox.height / 2,
  })).resolves.toBe(true);
  await dragColumnEdge(40);
  expect((await cell.boundingBox()).width)
    .toBeGreaterThan(selectedWidthBeforeDrag + 25);
  await page.mouse.up();

  const widenedWidth = (await cell.boundingBox()).width;
  const widenedBox = await cell.boundingBox();
  await page.mouse.dblclick(
    widenedBox.x + widenedBox.width - 1,
    widenedBox.y + widenedBox.height / 2,
  );
  await expect.poll(async () => (await cell.boundingBox()).width)
    .toBeLessThan(widenedWidth - 40);
  expect((await cell.boundingBox()).width).toBeLessThan(90);
});

test("copies a table when its block is selected from the six-dot handle", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();

  const table = page.getByRole("table").first();
  const tableBlock = table.locator("xpath=ancestor::div[contains(@class, 'bn-block-outer')][1]");
  await tableBlock.hover();
  const dragHandle = page.locator(".bn-side-menu [data-test='dragHandle']:visible").last();
  await expect(dragHandle).toBeVisible();
  await dragHandle.click();
  await page.keyboard.press(modifierShortcut("C"));

  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("Tabs");
});

test("promotes a cross-block text drag into a block selection", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();

  const start = page.getByText("A focused workspace for persistent notes", { exact: false }).first();
  const end = page.getByText("Create one session per meeting", { exact: false }).first();
  const startBox = await start.boundingBox();
  const endBox = await end.boundingBox();
  expect(startBox).not.toBeNull();
  expect(endBox).not.toBeNull();

  await page.mouse.move(startBox.x + 8, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox.x + endBox.width - 8, endBox.y + endBox.height / 2, { steps: 8 });
  const selectedBlocks = page.locator('.bn-editor [data-block-selected="true"]');
  await expect(selectedBlocks).not.toHaveCount(0);
  const expandedCount = await selectedBlocks.count();
  expect(expandedCount).toBeGreaterThan(1);
  await page.mouse.move(startBox.x + 20, startBox.y + startBox.height / 2, { steps: 4 });
  await expect(selectedBlocks).toHaveCount(1);
  await page.mouse.move(endBox.x + 30, endBox.y + endBox.height / 2, { steps: 8 });
  await expect(selectedBlocks).toHaveCount(expandedCount);
  await page.mouse.up();
  await expect(selectedBlocks).toHaveCount(expandedCount);
  await expect(page.locator('.bn-editor')).toHaveAttribute('data-block-selection', 'true');
  expect(await selectedBlocks.first().locator(':scope > .bn-block').evaluate(el => getComputedStyle(el).backgroundColor))
    .not.toBe("rgba(0, 0, 0, 0)");
  await page.keyboard.press(modifierShortcut("C"));

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("A focused workspace for persistent notes");
  expect(copied).toContain("Create one session per meeting");
  expect(copied).not.toContain("Pin a sticky window");
  expect(await start.evaluate(el => getComputedStyle(el, '::selection').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await start.click();
  await expect(selectedBlocks).toHaveCount(0);
});

test("keeps the focused table cell border attached through scroll and column resize", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const cell = page.getByRole("cell", {
    name: "Drafting, comparing, and organizing sessions",
  }).first();
  await cell.click();
  await expectFocusedTableCellBorderToMatch(page, cell);

  await page.getByTestId("sticky-editor-surface").evaluate((surface) => {
    surface.scrollTop += 120;
    surface.dispatchEvent(new Event("scroll"));
  });
  await expectFocusedTableCellBorderToMatch(page, cell);

  const cellBox = await cell.boundingBox();
  await page.mouse.move(cellBox.x + cellBox.width - 1, cellBox.y + cellBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(cellBox.x + cellBox.width + 35, cellBox.y + cellBox.height / 2);
  await page.mouse.up();
  await expectFocusedTableCellBorderToMatch(page, cell);
});

test("keeps the focused cell when extending table rows or columns", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  await page.getByRole("button", { name: "Switch to Sticky windows mode" }).click();
  const focusedCell = page.getByRole("cell", {
    name: "Drafting, comparing, and organizing sessions",
  }).first();
  await focusedCell.click();
  const lastCell = page.getByRole("cell", { name: "Export PDF" }).last();
  await lastCell.hover();

  const addColumnButton = page.locator(
    ".bn-extend-button-add-remove-columns",
  ).first();
  await expect(addColumnButton).toBeVisible();
  const addColumnButtonBox = await addColumnButton.boundingBox();
  await page.mouse.move(
    addColumnButtonBox.x + addColumnButtonBox.width / 2,
    addColumnButtonBox.y + addColumnButtonBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    addColumnButtonBox.x + addColumnButtonBox.width + 220,
    addColumnButtonBox.y + addColumnButtonBox.height / 2,
    { steps: 4 },
  );
  await expectFocusedTableCellBorderToMatch(page, focusedCell);
  await page.mouse.up();
  await expectFocusedTableCellBorderToMatch(page, focusedCell);

  await lastCell.hover();
  const addRowButton = page.locator(
    ".bn-extend-button-add-remove-rows",
  ).first();
  await expect(addRowButton).toBeVisible();
  await addRowButton.click();
  await expectFocusedTableCellBorderToMatch(page, focusedCell);
});

test("does not focus the first cell when clicking blank table surface", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const focusedCell = page.getByRole("cell", {
    name: "Drafting, comparing, and organizing sessions",
  }).first();
  await focusedCell.click();
  await expectFocusedTableCellBorderToMatch(page, focusedCell);

  await page.getByRole("table").evaluate((table) => {
    table.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
    }));
    table.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      cancelable: true,
    }));
    table.dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      button: 0,
    }));
  });

  await expect.poll(() => focusedCell.evaluate((cell) => (
    getComputedStyle(cell).boxShadow
  ))).not.toContain("0px 0px 0px 2px");
});

test("auto-fits table columns from the current font size within the editor width", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();
  const tableCells = page.locator(".bn-editor table td");
  const tabsCellIndex = await tableCells.evaluateAll((cells) => (
    cells.findIndex((cellElement) => cellElement.textContent.trim() === "Tabs")
  ));
  const cell = tableCells.nth(tabsCellIndex);
  await expect(cell).toContainText("Tabs");
  const initialTableBounds = await page.evaluate(() => ({
    tableWidth: document.querySelector(".bn-editor table")?.getBoundingClientRect().width ?? 0,
    innerWidth: document.querySelector(".bn-editor .tableWrapper-inner")?.getBoundingClientRect().width ?? 0,
  }));
  expect(initialTableBounds.tableWidth).toBeGreaterThanOrEqual(
    initialTableBounds.innerWidth - 1,
  );
  const autoFitColumn = async () => {
    const box = await cell.boundingBox();
    await page.mouse.dblclick(
      box.x + box.width - 1,
      box.y + box.height / 2,
    );
  };

  await cell.click();
  await autoFitColumn();
  const defaultFontWidth = (await cell.boundingBox()).width;

  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press(modifierShortcut("+"));
  }
  await expect.poll(() => page.locator(".bn-editor").evaluate((editor) => (
    Number.parseFloat(getComputedStyle(editor).fontSize)
  ))).toBeGreaterThan(20);
  await autoFitColumn();
  await expect.poll(async () => (await cell.boundingBox()).width)
    .toBeGreaterThan(defaultFontWidth + 8);

  await cell.click();
  await page.keyboard.press(modifierShortcut("A"));
  await page.keyboard.type("unbroken-value-".repeat(80));
  await autoFitColumn();

  const bounds = await page.evaluate(() => ({
    columnWidth: document.querySelector(".bn-editor td").getBoundingClientRect().width,
    editorWidth: document.querySelector(".bn-editor").clientWidth,
  }));
  expect(bounds.columnWidth).toBeLessThanOrEqual(bounds.editorWidth + 1);
});

test("keeps resized tables inside a local horizontal scroller", async ({ page }) => {
  await loadTemplatePreview(page);
  await page.getByRole("button", { name: "Use this template" }).click();

  const geometry = await page.getByRole("table").first().evaluate((table) => {
    const wrapper = table.closest(".tableWrapper");
    const surface = table.closest("[data-testid='sticky-editor-surface']");
    for (const cell of table.querySelectorAll("td, th")) {
      cell.setAttribute("data-colwidth", "520");
    }
    for (const column of table.querySelectorAll("col")) {
      column.style.width = "520px";
    }
    table.style.setProperty("width", "1560px", "important");

    return {
      wrapperClientWidth: wrapper?.clientWidth ?? 0,
      wrapperScrollWidth: wrapper?.scrollWidth ?? 0,
      surfaceClientWidth: surface?.clientWidth ?? 0,
      surfaceScrollWidth: surface?.scrollWidth ?? 0,
    };
  });

  expect(geometry.wrapperScrollWidth).toBeGreaterThan(geometry.wrapperClientWidth);
  expect(geometry.surfaceScrollWidth).toBeLessThanOrEqual(
    geometry.surfaceClientWidth + 1,
  );
});

test("deletes the current block with Command+X when no text is selected", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("delete this block");
  await page.keyboard.press(modifierShortcut("X"));

  await expect(page.getByText("delete this block")).toHaveCount(0);
  await expect(page.getByRole("paragraph").filter({ hasText: /^$/ }).last())
    .toBeVisible();
});

test("shows image download and crop actions in one toolbar", async ({ page }) => {
  await loadTemplatePreview(page);
  const image = page.locator("img.bn-visual-media").first();
  await image.click();

  const imageTools = page.locator(".notepane-formatting-toolbar:visible");
  await expect(imageTools).toBeVisible();
  await expect(imageTools.locator(".notepane-file-download-button")).toBeVisible();
  await expect(imageTools.getByRole("button", { name: "Crop image" })).toBeVisible();
  await imageTools.getByRole("button", { name: "Replace image" }).click();
  const replacePanel = page.locator(".bn-panel:visible");
  await expect(replacePanel).toBeVisible();
  await expect(replacePanel.locator("[data-test='upload-input']")).toBeVisible();
  await expect.poll(async () => (
    await replacePanel.boundingBox()
  )?.width).toBeGreaterThanOrEqual(480);
  await page.keyboard.press("Escape");
  await expect(replacePanel).toHaveCount(0);
  await image.click();
  await expect(imageTools).toBeVisible();
  await imageTools.getByRole("button", { name: "Crop image" }).click();
  const cropDialog = page.getByRole("dialog", { name: "Crop image" });
  await expect(cropDialog).toBeVisible();
  const cropVisuals = await cropDialog.evaluate((dialog) => {
    const frame = dialog.querySelector(".crop-image-frame");
    const image = dialog.querySelector(".crop-image-canvas img");
    const selection = dialog.querySelector(".crop-selection");
    const frameRect = frame?.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    const selectionStyle = selection && getComputedStyle(selection);
    return {
      imageFitsFrame: Boolean(
        frameRect && imageRect &&
          imageRect.left >= frameRect.left &&
          imageRect.right <= frameRect.right &&
          imageRect.top >= frameRect.top &&
          imageRect.bottom <= frameRect.bottom,
      ),
      grid: selectionStyle?.backgroundImage ?? "",
      mask: selectionStyle?.boxShadow ?? "",
    };
  });
  expect(cropVisuals.imageFitsFrame).toBe(true);
  expect(cropVisuals.grid).toContain("linear-gradient");
  expect(cropVisuals.mask).not.toContain("9999");
  await expect(cropDialog.locator(".crop-resize-handle")).toHaveCount(8);

  const originalSource = await cropDialog
    .locator(".crop-image-canvas img")
    .getAttribute("src");
  const cropImage = cropDialog.locator(".crop-image-canvas img");
  const cropImageBox = await cropImage.boundingBox();
  expect(cropImageBox).not.toBeNull();
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.width).toBeCloseTo(cropImageBox.width, 0);
  const resizeFromHandle = async (handle, x, y) => {
    const handleBox = await cropDialog
      .getByRole("button", { name: `Resize crop from ${handle}`, exact: true })
      .boundingBox();
    expect(handleBox).not.toBeNull();
    await page.mouse.move(handleBox.x + (handleBox.width / 2), handleBox.y + (handleBox.height / 2));
    await page.mouse.down();
    await page.mouse.move(cropImageBox.x + (cropImageBox.width * x), cropImageBox.y + (cropImageBox.height * y));
    await page.mouse.up();
  };
  await resizeFromHandle("right", 0.8, 0.5);
  await resizeFromHandle("bottom", 0.5, 0.8);
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.width).toBeCloseTo(cropImageBox.width * 0.8, 0);
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.height).toBeCloseTo(cropImageBox.height * 0.8, 0);
  const selectionBox = await cropDialog.locator(".crop-selection").boundingBox();
  expect(selectionBox).not.toBeNull();
  await page.mouse.move(
    selectionBox.x + (selectionBox.width / 2),
    selectionBox.y + (selectionBox.height / 2),
  );
  await page.mouse.down();
  await page.mouse.move(
    selectionBox.x + (selectionBox.width / 2) + (cropImageBox.width * 0.1),
    selectionBox.y + (selectionBox.height / 2) + (cropImageBox.height * 0.1),
  );
  await page.mouse.up();
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.x).toBeCloseTo(cropImageBox.x + (cropImageBox.width * 0.1), 0);
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.y).toBeCloseTo(cropImageBox.y + (cropImageBox.height * 0.1), 0);
  await cropDialog.getByRole("button", { name: "Apply crop" }).click();
  await expect(cropDialog).toHaveCount(0);

  await image.click();
  await imageTools.getByRole("button", { name: "Crop image" }).click();
  await expect(cropDialog).toBeVisible();
  await expect(cropDialog.locator(".crop-image-canvas img")).toHaveAttribute(
    "src",
    originalSource,
  );
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.width).toBeCloseTo(cropImageBox.width * 0.8, 0);
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.height).toBeCloseTo(cropImageBox.height * 0.8, 0);
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.x).toBeCloseTo(cropImageBox.x + (cropImageBox.width * 0.1), 0);
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.y).toBeCloseTo(cropImageBox.y + (cropImageBox.height * 0.1), 0);

  await cropDialog.getByRole("button", { name: "Apply crop" }).click();
  await expect(cropDialog).toHaveCount(0);
  await image.click();
  await imageTools.getByRole("button", { name: "Crop image" }).click();
  await expect(cropDialog.locator(".crop-image-canvas img")).toHaveAttribute(
    "src",
    originalSource,
  );
});

async function clickLastEmptyParagraph(page) {
  const emptyParagraphs = page.getByRole("paragraph").filter({ hasText: /^$/ });
  await emptyParagraphs.last().scrollIntoViewIfNeeded();
  await emptyParagraphs.last().click();
}

async function expectEditorFocused(page) {
  await expect.poll(async () =>
    await page.evaluate(() => {
      const activeElement = document.activeElement;
      return Boolean(activeElement?.closest?.(".bn-editor"));
    }),
  ).toBe(true);
}

async function expectFocusedTableCellBorderToMatch(page, cell) {
  await expect.poll(async () => {
    return await cell.evaluate((element) => (
      getComputedStyle(element).boxShadow.includes("0px 0px 0px 2px")
    ));
  }).toBe(true);
}

async function getBulletItemDepth(page, text) {
  return await page.evaluate((targetText) => {
    const content = [...document.querySelectorAll("[data-content-type='bulletListItem']")]
      .find((element) => element.textContent?.trim() === targetText);
    const outer = content?.closest(".bn-block-outer");
    let depth = 0;
    let current = outer?.parentElement;
    while (current) {
      if (current.classList?.contains("bn-block-group")) {
        depth += 1;
      }
      current = current.parentElement;
    }
    return depth;
  }, text);
}

async function pastePlainText(page, text) {
  await pasteClipboardText(page, { plainText: text });
}

async function pasteClipboardText(page, { plainText, html = "" }) {
  await page.evaluate((clipboardText) => {
    const editor = document.querySelector(".bn-editor");
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", clipboardText.plainText);
    if (clipboardText.html) {
      clipboardData.setData("text/html", clipboardText.html);
    }
    editor.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  }, { plainText, html });
}

async function getInlineStyledTextColor(page, text, styleType, value) {
  return await page.evaluate(({ text, styleType, value }) => {
    const styledElement = [...document.querySelectorAll(
      `[data-style-type='${styleType}'][data-value='${value}']`,
    )].find((element) => element.textContent === text);

    return styledElement ? getComputedStyle(styledElement).color : "";
  }, { styleType, text, value });
}

async function getInlineStyledTextBackground(page, text, styleType, value) {
  return await page.evaluate(({ text, styleType, value }) => {
    const styledElement = [...document.querySelectorAll(
      `[data-style-type='${styleType}'][data-value='${value}']`,
    )].find((element) => element.textContent === text);

    return styledElement ? getComputedStyle(styledElement).backgroundColor : "";
  }, { styleType, text, value });
}

async function getActionIconColors(page) {
  return await page.evaluate(() => {
    const readColor = (selector) => {
      const element = document.querySelector(selector);

      return element ? getComputedStyle(element).color : "";
    };

    return {
      export: readColor(
        "[data-testid='session-sidebar-footer'] .export-icon-button .notepane-action-icon",
      ),
      layout: readColor(
        "[data-testid='session-sidebar-footer'] .layout-mode-button .notepane-action-icon",
      ),
      sidebar: readColor(".sidebar-toggle .notepane-action-icon"),
      preferences: readColor(
        "[data-testid='session-sidebar-footer'] .settings-icon-button .notepane-action-icon",
      ),
      trash: readColor(
        "[data-testid='session-sidebar-footer'] .trash-icon-button .notepane-action-icon",
      ),
    };
  });
}

async function getStickyHeaderActionChrome(page) {
  return await page.evaluate(() => {
    const actionList = document.querySelector(".sticky-header-action-list");
    const preview = document.querySelector(".sticky-header-action-preview");
    const previewIcon = preview?.querySelector(".notepane-action-icon");
    const previewPin = preview?.querySelector(".notepane-icon-pin");
    const actionListStyle = actionList ? getComputedStyle(actionList) : null;
    const previewStyle = preview ? getComputedStyle(preview) : null;
    const previewPinStyle = previewPin ? getComputedStyle(previewPin) : null;
    const header = document.querySelector("[data-testid='sticky-header']");

    return {
      actionListOpacity: actionListStyle?.opacity ?? "",
      actionListPointerEvents: actionListStyle?.pointerEvents ?? "",
      previewActionLabel: preview?.getAttribute("aria-label") ?? "",
      previewIconClass: previewIcon?.getAttribute("class") ?? "",
      previewOpacity: previewStyle?.opacity ?? "",
      previewRightGap:
        header && preview
          ? Math.round(
              header.getBoundingClientRect().right -
                preview.getBoundingClientRect().right,
            )
          : -1,
      previewWidth: preview ? Math.round(preview.getBoundingClientRect().width) : -1,
      previewPinCount: previewPin ? 1 : 0,
      previewPinFill: previewPinStyle?.fill ?? "",
      previewPinState: previewPin?.getAttribute("data-pin-state") ?? "",
    };
  });
}

async function openStickyActionBar(page) {
  const actionToggle = page.locator(".sticky-header-action-preview");
  if ((await actionToggle.getAttribute("aria-expanded")) !== "true") {
    await actionToggle.click();
  }
  await expect(actionToggle).toHaveAttribute("aria-expanded", "true");
}

function expectDistinctIconColors(iconColors) {
  expect(new Set(Object.values(iconColors)).size).toBe(Object.keys(iconColors).length);
  expect(iconColors.export).not.toBe(iconColors.trash);
  expect(iconColors.preferences).not.toBe(iconColors.export);
  expect(iconColors.layout).not.toBe(iconColors.sidebar);
}

async function expectSystemSymbolIcons(page) {
  const iconAudit = await page.evaluate(() => {
    return [...document.querySelectorAll(".notepane-action-icon")].map((icon) => ({
      family: icon.getAttribute("data-icon-family"),
      pack: icon.getAttribute("data-icon-pack"),
      className: icon.getAttribute("class") ?? "",
      fill: getComputedStyle(icon).fill,
      strokeLinecap: getComputedStyle(icon).strokeLinecap,
      strokeLinejoin: getComputedStyle(icon).strokeLinejoin,
    }));
  });

  expect(iconAudit.length).toBeGreaterThanOrEqual(2);
  for (const icon of iconAudit) {
    expect(icon.family).toBe("system-symbol");
    expect(icon.pack).toBe("lucide");
    expect(icon.className).toContain("lucide");
    expect(icon.fill).toBe("none");
    expect(icon.strokeLinecap).toBe("round");
    expect(icon.strokeLinejoin).toBe("round");
  }
}

async function expectFloatingTypographyMenu(page, ariaLabel, options = {}) {
  await expect.poll(async () => {
    return await page.evaluate(({ label, maxWidth }) => {
      const menu = document.querySelector(`[role='listbox'][aria-label='${label}']`);
      const editorSurface = document.querySelector("[data-testid='sticky-editor-surface']");
      if (!menu || !editorSurface) {
        return null;
      }

      const menuRect = menu.getBoundingClientRect();
      return {
        bottomInsideViewport: menuRect.bottom <= window.innerHeight,
        escapesEditorSurface: !editorSurface.contains(menu),
        leftInsideViewport: menuRect.left >= 0,
        parentTag: menu.parentElement?.tagName ?? "",
        position: getComputedStyle(menu).position,
        rightInsideViewport: menuRect.right <= window.innerWidth,
        topInsideViewport: menuRect.top >= 0,
        widthInsideLimit: maxWidth == null || menuRect.width <= maxWidth,
      };
    }, {
      label: ariaLabel,
      maxWidth: options.maxWidth ?? null,
    });
  }).toMatchObject({
    bottomInsideViewport: true,
    escapesEditorSurface: true,
    leftInsideViewport: true,
    parentTag: "BODY",
    position: "fixed",
    rightInsideViewport: true,
    topInsideViewport: true,
    widthInsideLimit: true,
  });
}

async function expectBlockNoteFloatingMenuInsideViewport(
  page,
  selector,
  minimumHeight = 1,
  expectedPosition = "fixed",
) {
  await expect.poll(async () => {
    return await page.evaluate(({ menuSelector, minimumHeight }) => {
      const visibleMenu = [...document.querySelectorAll(menuSelector)].find((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) > 0.01 &&
          rect.width > 0 &&
          rect.height > 0
        );
      });

      if (!visibleMenu) {
        return null;
      }

      const rect = visibleMenu.getBoundingClientRect();
      return {
        bottomInsideViewport: rect.bottom <= window.innerHeight,
        heightEnough: rect.height >= minimumHeight,
        height: Math.round(rect.height),
        leftInsideViewport: rect.left >= 0,
        position: getComputedStyle(visibleMenu).position,
        rightInsideViewport: rect.right <= window.innerWidth,
        topInsideViewport: rect.top >= 0,
      };
    }, { menuSelector: selector, minimumHeight });
  }).toMatchObject({
    bottomInsideViewport: true,
    heightEnough: true,
    leftInsideViewport: true,
    position: expectedPosition,
    rightInsideViewport: true,
    topInsideViewport: true,
  });
}

async function getEditorScaleMetrics(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='sticky-shell']");
    const header = document.querySelector("[data-testid='sticky-header']");
    const sidebar = document.querySelector("[data-testid='session-sidebar']");
    const editorSurface = document.querySelector("[data-testid='sticky-editor-surface']");
    const editor = document.querySelector(".bn-editor");

    return {
      editorFontScale: getComputedStyle(shell)
        .getPropertyValue("--editor-font-scale")
        .trim() || "1",
      appFontFamily: getComputedStyle(shell)
        .getPropertyValue("--notepane-ui-font")
        .trim(),
      sidebarFontFamily: getComputedStyle(sidebar).fontFamily,
      editorFontFamily: getComputedStyle(editor).fontFamily,
      shellFontSize: Math.round(Number.parseFloat(getComputedStyle(shell).fontSize)),
      headerHeight: Math.round(header.getBoundingClientRect().height),
      sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
      editorFontSize: Math.round(Number.parseFloat(getComputedStyle(editor).fontSize) * 100) / 100,
      editorSurfaceFontSize: Math.round(Number.parseFloat(getComputedStyle(editorSurface).fontSize) * 100) / 100,
    };
  });
}

async function loadTemplatePreview(page) {
  await page.goto("/?template=1");
  await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
    .toBeVisible();
}

async function createBlankSession(page) {
  await page.getByRole("button", { name: "New session" }).click();
  await chooseBlankSessionTemplate(page);
}

async function chooseBlankSessionTemplate(page) {
  const templateDialog = page.getByRole("dialog", { name: "Create new session" });
  await expect(templateDialog).toHaveCount(0);
}

async function expectEditorToBeFocused(page) {
  await expect.poll(() => page.evaluate(() => {
    return Boolean(document.activeElement?.closest(".bn-editor"));
  })).toBe(true);
}

function modifierShortcut(key) {
  return `${process.platform === "darwin" ? "Meta" : "Control"}+${key}`;
}

function modifierOptionShortcut(key) {
  return `${process.platform === "darwin" ? "Meta" : "Control"}+Alt+${key}`;
}
