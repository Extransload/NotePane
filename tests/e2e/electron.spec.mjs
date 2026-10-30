import { _electron as electron, expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Theme palettes, from the file the app reads them from.
const THEMES = JSON.parse(fs.readFileSync(path.join(process.cwd(), "electron", "themes.json"), "utf8"));
const themePalette = (themeId) => THEMES.find((theme) => theme.id === themeId).palette;

// Each test writes to its own temporary user-data and export directories.
// They are removed afterwards so runs do not leave hundreds behind in $TMPDIR.
const temporaryDirectories = [];

function createTemporaryDirectory(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

test.afterEach(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

// A suite running in the background must not flash note windows over the person's screen.
test("Electron test windows stay out of sight", async () => {
  const electronApp = await launchApp(createTemporaryDirectory("notepane-hidden-"));

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    expect(await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => window.getOpacity()))).toEqual([0]);
  } finally {
    await electronApp.close();
  }
});

test("Electron app opens a sticky window and persists editor content", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const exportDirectory = createTemporaryDirectory("notepane-export-");
  const electronApp = await launchApp(userDataDirectory, exportDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
      .toHaveCount(0);

    await page.getByRole("tab").first().dblclick();
    await page.getByLabel("Session name").fill("Project note");
    await page.keyboard.press("Enter");
    await chooseAppTheme(page, "notepane-dark");
    await clickMenuItem(electronApp, "Preferences");
    await expect(page.getByRole("dialog", { name: "Preferences window" }))
      .toBeVisible();
    await expect(page.getByLabel("RGB session tab color value")).toHaveCount(0);
    await page.getByRole("button", { name: "Close preferences" }).click();
    await expect(page.getByRole("dialog", { name: "Preferences window" }))
      .toHaveCount(0);

    await page.locator(".session-tab-row").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Color..." }).click();
    const sessionColorPanel = page.getByRole("dialog", { name: "Session color panel" });
    await expect(sessionColorPanel).toBeVisible();
    await page.getByLabel("RGB session tab color value").fill("rgb(255 255 255)");
    await sessionColorPanel.getByRole("button", { name: "Close preferences" }).click();
    await expect(sessionColorPanel)
      .toHaveCount(0);
    await page.addStyleTag({
      content: ".bn-editor { padding-bottom: 1400px !important; }",
    });
    await page.getByRole("paragraph").filter({ hasText: /^$/ }).last().click();
    await page.keyboard.insertText("electron persistence probe");
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menu", { name: "Export format" })
      .getByRole("menuitem", { name: /PDF/ })
      .click();
    await expect(page.locator(".sticky-toast-success"))
      .toHaveText("PDF exported");
    await expect(page.locator(".sticky-toast-success"))
      .toHaveCount(0, { timeout: 5000 });

    const notesPath = path.join(userDataDirectory, "notes.json");
    await expect.poll(() => fs.existsSync(notesPath)).toBe(true);
    await expect.poll(
      () => fs.existsSync(path.join(exportDirectory, "Project note.pdf")),
      { timeout: 20_000 },
    )
      .toBe(true);

    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menu", { name: "Export format" })
      .getByRole("menuitem", { name: /Markdown/ })
      .click();
    await expect(page.locator(".sticky-toast-success")).toHaveText("Markdown exported");
    await expect.poll(
      () => fs.existsSync(path.join(exportDirectory, "Project note.md")),
      { timeout: 20_000 },
    )
      .toBe(true);

    const persistedState = JSON.parse(fs.readFileSync(notesPath, "utf8"));
    const notes = persistedState.notes;
    expect(notes).toHaveLength(1);
    expect(persistedState.appTheme).toEqual({ themeId: "notepane-dark", mode: "dark" });
    expect(persistedState.layoutMode).toBe("tabs");
    expect(notes[0].title).toBe("Project note");
    expect(notes[0].theme.mode).toBeUndefined();
    expect(notes[0].theme.tabBackgroundColor).toBeUndefined();
    expect(notes[0].theme.tabTextColor).toBe("#ffffff");
    expect(notes[0].theme.tabTextOpacity).toBe(1);
    expect(notes[0].theme.backgroundColor).toBeUndefined();
    expect(notes[0].theme.backgroundOpacity).toBeUndefined();
    expect(notes[0].theme.textColor).toBeUndefined();
    expect(notes[0].markdown).toContain("electron persistence probe");
    expect(notes[0].blocksJSON).toContain("electron persistence probe");
    expect(notes[0].alwaysOnTop).toBe(false);
    expect(fs.statSync(path.join(exportDirectory, "Project note.pdf")).size)
      .toBeGreaterThan(1000);
    expect(fs.readFileSync(path.join(exportDirectory, "Project note.md"), "utf8"))
      .toContain("electron persistence probe");
    expect(fs.existsSync(path.join(exportDirectory, "Project note.png")))
      .toBe(false);
  } finally {
    await electronApp.close();
  }
});

test("a new window starts with the current theme applied", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-theme-");
  writeInitialNotes(userDataDirectory, [
    { id: "theme-note", title: "Theme note", createdAt: 1, updatedAt: 1 },
  ]);
  const notesPath = path.join(userDataDirectory, "notes.json");
  const storedState = JSON.parse(fs.readFileSync(notesPath, "utf8"));
  fs.writeFileSync(
    notesPath,
    JSON.stringify({ ...storedState, appTheme: { themeId: "notepane-dark", mode: "dark" } }),
    "utf8",
  );
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    // The first load starts before a script can be attached, so read it on a reload. A new
    // window has no theme of its own in session storage; forgetting the one this window applied
    // makes the reload start like a new window, from the theme the main process put in the URL.
    await page.addInitScript(() => sessionStorage.removeItem("notepane.appliedThemeId"));
    expect(await reloadAndReadFirstPaintTheme(page))
      .toEqual({ themeId: "notepane-dark", shellBackground: "#191919" });
    expect(new URL(page.url()).searchParams.get("themeId")).toBe("notepane-dark");
  } finally {
    await electronApp.close();
  }
});

test("a reloaded window starts with the theme chosen after it opened", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-theme-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    // The window opened under NotePane Light, and its URL still says so.
    expect(new URL(page.url()).searchParams.get("themeId")).toBe("notepane-light");
    await chooseAppTheme(page, "dracula");

    expect(await reloadAndReadFirstPaintTheme(page))
      .toEqual({ themeId: "dracula", shellBackground: themePalette("dracula").window });
  } finally {
    await electronApp.close();
  }
});

test("a TablePeek theme persists across a restart", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-theme-");
  const firstRun = await launchApp(userDataDirectory);
  try {
    const page = await firstRun.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await chooseAppTheme(page, "tablepeek-dark");
    await expect.poll(() => readStoredAppTheme(userDataDirectory))
      .toEqual({ themeId: "tablepeek-dark", mode: "dark" });
  } finally {
    await firstRun.close();
  }

  const secondRun = await launchApp(userDataDirectory);
  try {
    const page = await secondRun.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    expect(readStoredAppTheme(userDataDirectory)).toEqual({ themeId: "tablepeek-dark", mode: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme-id", "tablepeek-dark");
    expect(await readRootToken(page, "--sticky-shell-bg")).toBe(themePalette("tablepeek-dark").window);
  } finally {
    await secondRun.close();
  }
});

// Review Focus 5: the open window follows without a reload, the formatting toolbar that
// BlockNote portals into its body included. Preferences opens in the tabs window only, so that
// is the window open while the theme changes.
test("changing the theme updates the open window", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-theme-");
  writeInitialNotes(userDataDirectory, [
    {
      id: "first-note",
      title: "First note",
      markdown: "First window words",
      theme: { tabTextColor: "#d9efff", tabTextOpacity: 1 },
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await expectStartupCaretPlaced(page);

    // Shown once before the change, so its portal root already exists when the theme changes.
    const lightToolbar = await readFormattingToolbar(page, "First window words");
    expect(lightToolbar).toMatchObject({ portalled: true, colorScheme: "light" });

    await chooseAppTheme(page, "dracula");

    const liveToolbar = await readFormattingToolbar(page, "First window words");
    expect(liveToolbar).toMatchObject({ portalled: true, colorScheme: "dark" });
    expect(liveToolbar.background).not.toBe(lightToolbar.background);
    // The reference is the same window loaded under Dracula.
    await page.reload();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await expectStartupCaretPlaced(page);
    expect(await readFormattingToolbar(page, "First window words")).toEqual(liveToolbar);
  } finally {
    await electronApp.close();
  }
});

test("Cmd/Ctrl+= zooms every window, and the zoom persists", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-zoom-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", createdAt: 2, updatedAt: 2 },
  ]);
  const readZooms = (electronApp) => electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => Math.round(window.webContents.getZoomFactor() * 100)));
  // How much larger the page draws than its window, as a person sees the zoom.
  const readPageZoom = (page) => page.evaluate(() =>
    Math.round((window.outerWidth / window.innerWidth) * 100));
  const readStoredZoom = () => JSON.parse(fs.readFileSync(
    path.join(userDataDirectory, "notes.json"), "utf8",
  )).editorPreferences.appZoom;
  const expectWindowButtonsAt = async (electronApp, y) => {
    if (process.platform === "darwin") {
      await expect.poll(() => getAllWindowButtonPositions(electronApp))
        .toEqual([{ x: 14, y }, { x: 14, y }]);
    }
  };

  let electronApp = await launchApp(userDataDirectory);
  try {
    const tabsPage = await electronApp.firstWindow();
    await expect(tabsPage.getByTestId("sticky-editor-surface")).toBeVisible();
    await tabsPage.keyboard.press(modifierShortcut("="));
    await expect(tabsPage.getByRole("meter", { name: "Zoom" }))
      .toHaveAttribute("aria-valuetext", "110%");
    await expect.poll(() => readZooms(electronApp)).toEqual([110]);
    await expect.poll(() => readPageZoom(tabsPage)).toBe(110);
    await expect.poll(readStoredZoom).toBe(1.1);

    // Windows opened afterwards start at the zoom, and their buttons stay centred on the larger
    // header: 10 + 30 * 0.1 / 2, rounded.
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(() => readZooms(electronApp)).toEqual([110, 110]);
    await expectWindowButtonsAt(electronApp, 12);

    // Zooming from one window zooms them all.
    const secondPage = await getStickyPageByNoteId(electronApp, "second-note");
    await expect(secondPage.getByTestId("sticky-editor-surface")).toBeVisible();
    await secondPage.keyboard.press(modifierShortcut("0"));
    await expect.poll(() => readZooms(electronApp)).toEqual([100, 100]);
    await secondPage.keyboard.press(modifierShortcut("-"));
    await expect.poll(() => readZooms(electronApp)).toEqual([90, 90]);
    await expect.poll(() => readPageZoom(secondPage)).toBe(90);
    await expectWindowButtonsAt(electronApp, 9);
  } finally {
    await electronApp.close();
  }

  electronApp = await launchApp(userDataDirectory);
  try {
    await expect.poll(() => readZooms(electronApp)).toEqual([90, 90]);
    await expectWindowButtonsAt(electronApp, 9);

    // At 50% the sticky header is 15px, about the buttons' own height, so they stay inside it.
    const page = await getStickyPageByNoteId(electronApp, "first-note");
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    for (let press = 0; press < 4; press += 1) {
      await page.keyboard.press(modifierShortcut("-"));
    }
    await expect.poll(() => readZooms(electronApp)).toEqual([50, 50]);
    await expectWindowButtonsAt(electronApp, 1);
  } finally {
    await electronApp.close();
  }
});

test("Preferences opens in the tabs window and never in the sticky layout", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-preferences-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", createdAt: 2, updatedAt: 2 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const tabsPage = await electronApp.firstWindow();
    await expect(tabsPage.getByTestId("sticky-editor-surface")).toBeVisible();
    const preferences = tabsPage.getByRole("dialog", { name: "Preferences window" });

    expect(await isMenuItemEnabled(electronApp, "Preferences")).toBe(true);
    await clickMenuItem(electronApp, "Preferences");
    await expect(preferences).toBeVisible();

    // The sticky layout has no tabs window to open it in. Outside Windows the tabs window turns
    // into a sticky window in place, so Preferences left open there closes.
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(() => isMenuItemEnabled(electronApp, "Preferences")).toBe(false);
    if (process.platform !== "win32") {
      await expect(tabsPage.getByTestId("sticky-shell")).toHaveAttribute("data-layout-mode", "sticky");
      await expect(preferences).toHaveCount(0);
    }
  } finally {
    await electronApp.close();
  }
});

test("/import inserts a Markdown file as editor blocks", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-markdown-import-");
  const importDirectory = createTemporaryDirectory("notepane-markdown-source-");
  const importPath = path.join(importDirectory, "meeting-notes.md");
  fs.writeFileSync(
    importPath,
    "# Imported meeting notes\n\n- First decision\n- Second decision\n\nA **formatted** paragraph.",
  );
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await page.getByRole("paragraph").filter({ hasText: /^$/ }).last().click();
    await page.keyboard.type("/import");
    await page.getByText("Import Markdown", { exact: true }).click();
    const importDialog = page.getByRole("dialog", { name: "Import Markdown" });
    await expect(importDialog).toBeVisible();
    await importDialog.getByLabel("Choose Markdown file").setInputFiles(importPath);

    await expect(page.getByRole("heading", { name: "Imported meeting notes" }))
      .toBeVisible();
    await expect(page.getByText("First decision", { exact: true })).toBeVisible();
    await expect(page.getByText("formatted", { exact: true })).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test("Cmd/Ctrl+S immediately creates a version-history snapshot", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-version-history-");
  const exportDirectory = createTemporaryDirectory("notepane-version-history-export-");
  const electronApp = await launchApp(userDataDirectory, exportDirectory);

  try {
    const page = await electronApp.firstWindow();
    await page.getByRole("paragraph").filter({ hasText: /^$/ }).last().click();
    await page.keyboard.insertText("version shortcut snapshot");
    await page.keyboard.press(modifierShortcut("S"));
    await expect(page.locator(".sticky-toast-success")).toHaveText("Saved");

    const historyPath = path.join(userDataDirectory, "note-history.json");
    await expect.poll(() => fs.existsSync(historyPath)).toBe(true);
    await expect.poll(() => {
      const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
      return Object.values(history.notes).flat().some((version) =>
        version.markdown.includes("version shortcut snapshot"),
      );
    }).toBe(true);

    await page.getByRole("button", { name: "Version history" }).click();
    await expect(page.getByRole("dialog", { name: "Version history" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Version history" }))
      .toContainText("version shortcut snapshot");
    await expect(page.getByRole("dialog", { name: "Version history" }))
      .toContainText("Saved manually");
  } finally {
    await electronApp.close();
  }
});

test("Shift+Backslash then Space changes an empty paragraph into a quote", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-quote-shortcut-");
  const exportDirectory = createTemporaryDirectory("notepane-quote-shortcut-export-");
  const electronApp = await launchApp(userDataDirectory, exportDirectory);

  try {
    const page = await electronApp.firstWindow();
    await page.getByRole("paragraph").filter({ hasText: /^$/ }).last().click();
    await page.keyboard.press("Shift+\\");
    await page.keyboard.press("Space");
    await page.keyboard.type("Shortcut quote");
    await expect(page.locator("[data-content-type='quote']").filter({ hasText: "Shortcut quote" })).toBeVisible();
  } finally {
    await electronApp.close();
  }
});

test("Electron exports and imports a complete portable workspace backup", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const exportDirectory = createTemporaryDirectory("notepane-backup-export-");
  const importDirectory = createTemporaryDirectory("notepane-backup-import-");
  const importFilePath = path.join(importDirectory, "portable.notepane");
  writeInitialNotes(userDataDirectory, [
    {
      id: "current-note",
      title: "Current workspace",
      markdown: "Current data before import",
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  writePortableBackup(importFilePath, {
    appTheme: { mode: "dark" },
    layoutMode: "tabs",
    notes: [
      {
        id: "imported-note",
        title: "Imported workspace",
        titleManuallyEdited: true,
        blocksJSON: null,
        markdown: "Imported snapshot body",
        bounds: { x: 90, y: 90, width: 960, height: 720 },
        theme: { tabTextColor: "#2563eb", tabTextOpacity: 0.8 },
        alwaysOnTop: false,
        seedDemoContent: false,
        trashedAt: null,
        sortOrder: 1,
        createdAt: 10,
        updatedAt: 10,
      },
      {
        id: "imported-trash",
        title: "Imported trash",
        titleManuallyEdited: true,
        blocksJSON: null,
        markdown: "Trash snapshot body",
        bounds: { x: 110, y: 110, width: 720, height: 640 },
        theme: { tabTextColor: null, tabTextOpacity: 1 },
        alwaysOnTop: false,
        seedDemoContent: false,
        trashedAt: 20,
        sortOrder: 2,
        createdAt: 20,
        updatedAt: 20,
      },
    ],
  });

  const electronApp = await launchApp(userDataDirectory, exportDirectory, {
    BLOCKNOTE_STICKY_IMPORT_FILE: importFilePath,
    BLOCKNOTE_STICKY_IMPORT_CONFIRM: "1",
  });

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await page.getByText("Current data before import", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" with an immediate edit");
    await page.getByRole("button", { name: "Preferences" }).click();
    const preferences = page.getByRole("dialog", { name: "Preferences window" });
    await expect(preferences.getByText("Workspace backup")).toBeVisible();

    await preferences.getByRole("button", { name: "Export backup" }).click();
    await expect(page.locator(".sticky-toast-success")).toHaveText("Backup exported");
    await expect.poll(() => {
      return fs.readdirSync(exportDirectory)
        .find((fileName) => fileName.endsWith(".notepane")) ?? null;
    }).not.toBeNull();
    const exportedBackupPath = fs.readdirSync(exportDirectory)
      .find((fileName) => fileName.endsWith(".notepane"));
    const exportedBackup = JSON.parse(
      fs.readFileSync(path.join(exportDirectory, exportedBackupPath), "utf8"),
    );
    expect(exportedBackup.format).toBe("notepane-backup");
    expect(exportedBackup.version).toBe(1);
    expect(exportedBackup.data.notes[0].id).toBe("current-note");
    expect(exportedBackup.data.notes[0].markdown).toContain("with an immediate edit");

    const restoredWindowPromise = electronApp.waitForEvent("window");
    await preferences.getByRole("button", { name: "Import backup" }).click();
    const restoredPage = await restoredWindowPromise;
    await expect(restoredPage.getByTestId("sticky-editor-surface")).toBeVisible();
    await expect(restoredPage.getByRole("tab").first())
      .toHaveAccessibleName(/Imported workspace/);
    await expect(restoredPage.getByTestId("sticky-editor-surface"))
      .toContainText("Imported snapshot body");

    const restoredState = JSON.parse(
      fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8"),
    );
    // The backup holds an older build's { mode } only; it restores the matching NotePane theme.
    expect(restoredState.appTheme).toEqual({ themeId: "notepane-dark", mode: "dark" });
    expect(restoredState.notes.map((note) => note.id))
      .toEqual(["imported-note", "imported-trash"]);
    expect(restoredState.notes.find((note) => note.id === "imported-trash").trashedAt)
      .toBe(20);

    const safetyBackupNames = fs.readdirSync(path.join(userDataDirectory, "Backups"));
    expect(safetyBackupNames).toHaveLength(1);
    const safetyBackup = JSON.parse(
      fs.readFileSync(
        path.join(userDataDirectory, "Backups", safetyBackupNames[0]),
        "utf8",
      ),
    );
    expect(safetyBackup.data.notes[0].id).toBe("current-note");
    expect(safetyBackup.data.notes[0].markdown).toContain("with an immediate edit");
  } finally {
    await electronApp.close();
  }
});

test("Electron shows the NotePane template after the last tab is moved to trash", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
      .toHaveCount(0);

    const closedNoteId = await page.evaluate(async () => {
      const noteId = await window.blocknoteSticky.getCurrentNoteId();
      await window.blocknoteSticky.deleteNote(noteId);
      return noteId;
    });

    await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
      .toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(1);
    await expect(page.getByRole("tab").first()).toHaveAccessibleName(/NotePane/);
    await expect(page.getByText("A focused workspace for persistent notes"))
      .toBeVisible();

    await expect.poll(() => getStoredTrashState(userDataDirectory)).toEqual({
      activeNoteIds: [expect.any(String)],
      trashedNoteIds: [closedNoteId],
    });
    const persistedState = JSON.parse(
      fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8"),
    );
    const templateNote = persistedState.notes.find((note) => !note.trashedAt);
    expect(templateNote.seedDemoContent).toBe(true);
    expect(templateNote.title).toBe("NotePane");
    expect(templateNote.blocksJSON).toContain("Launch checklist");

    await expect(page.getByRole("button", { name: "Use this template" }))
      .toBeVisible();
    await page.getByRole("button", { name: "Use this template" }).click();
    await expect(page.getByRole("button", { name: "Use this template" }))
      .toHaveCount(0);
    await expect(page.getByTestId("sticky-editor-surface"))
      .not.toHaveClass(/is-template-session/);
    await expect.poll(() => {
      const nextState = JSON.parse(
        fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8"),
      );
      return nextState.notes.find((note) => !note.trashedAt)?.seedDemoContent;
    }).toBe(false);
  } finally {
    await electronApp.close();
  }
});

test("Electron keeps keyboard focus inside the editor during repeated Tab", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await page.bringToFront();
    await clickLastEmptyParagraph(page);
    await expectEditorFocused(page);
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

    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press("Tab");
      await expectEditorFocused(page);
    }
    await expect
      .poll(() => page.evaluate(() => window.__outsideEditorFocusTargets))
      .toEqual([]);
  } finally {
    await electronApp.close();
  }
});

test("Electron keeps sticky windows bound to their original sessions during new-note commands", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    {
      id: "first-note",
      title: "First note",
      markdown: "first sticky body",
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "second-note",
      title: "Second note",
      markdown: "second sticky body",
      createdAt: 2,
      updatedAt: 2,
    },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(2);

    const firstStickyPage = await getStickyPageByNoteId(electronApp, "first-note");
    const secondStickyPage = await getStickyPageByNoteId(electronApp, "second-note");
    await expect(firstStickyPage.getByTestId("sticky-editor-surface"))
      .toContainText("first sticky body");
    await expect(secondStickyPage.getByTestId("sticky-editor-surface"))
      .toContainText("second sticky body");

    await firstStickyPage.bringToFront();
    await expect.poll(() => getCurrentPageNoteId(firstStickyPage)).toBe("first-note");
    await firstStickyPage.keyboard.press(modifierShortcut("N"));
    await expect.poll(() => getCurrentPageNoteId(firstStickyPage)).toBe("first-note");
    await expect(firstStickyPage.getByTestId("sticky-editor-surface"))
      .toContainText("first sticky body");

    await clickMenuItem(electronApp, "New Note");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(3);
    await expect.poll(() => getCurrentPageNoteId(firstStickyPage)).toBe("first-note");

    const attemptedActivation = await firstStickyPage.evaluate(async () => {
      const note = await window.blocknoteSticky.activateNote("second-note");
      return {
        returnedNoteId: note?.id ?? null,
        currentNoteId: await window.blocknoteSticky.getCurrentNoteId(),
      };
    });
    expect(attemptedActivation).toEqual({
      returnedNoteId: "first-note",
      currentNoteId: "first-note",
    });
    await expect(firstStickyPage.getByTestId("sticky-editor-surface"))
      .toContainText("first sticky body");
  } finally {
    await electronApp.close();
  }
});

test("Electron flushes typing still waiting on the save debounce when windows are asked to flush", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    const editor = page.getByTestId("sticky-editor-surface");
    await expect(editor).toContainText("first body");

    await editor.getByText("first body").click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" typed right before teardown");
    // Ask right away, well inside the renderer's save debounce.
    const results = await electronApp.evaluate(() => globalThis.notepaneFlushEditorWindows());

    expect(results).toEqual(["done"]);
    const notes = JSON.parse(fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8")).notes;
    expect(notes.find((note) => note.id === "first-note")?.markdown)
      .toContain("typed right before teardown");
  } finally {
    await electronApp.close();
  }
});

test("Electron keeps running when saving window bounds fails", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("first body");

    // A read-only data folder makes every notes.json write fail.
    fs.chmodSync(userDataDirectory, 0o555);
    let failures;
    try {
      failures = await electronApp.evaluate(({ app, BrowserWindow }) => {
        const errors = [];
        const window = BrowserWindow.getAllWindows()[0];
        const emitters = [
          ["moved", () => window.emit("moved")],
          ["resized", () => window.emit("resized")],
          ["close", () => window.emit("close", { preventDefault() {} })],
          ["before-quit", () => app.emit("before-quit", { preventDefault() {} })],
        ];
        for (const [eventName, emit] of emitters) {
          try {
            emit();
          } catch (error) {
            errors.push(`${eventName}: ${error.code ?? error.message}`);
          }
        }
        return errors;
      });
    } finally {
      fs.chmodSync(userDataDirectory, 0o755);
    }

    expect(failures).toEqual([]);
  } finally {
    await electronApp.close();
  }
});

test("Electron saves a session rename committed by switching to another tab", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", markdown: "second body", createdAt: 2, updatedAt: 2 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("first body");

    await page.getByRole("tab", { name: /First note/ }).dblclick();
    await page.getByLabel("Session name").fill("Renamed first");
    await page.getByRole("tab", { name: /Second note/ }).click();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("second body");

    await expect.poll(async () => {
      const notes = await page.evaluate(() => window.blocknoteSticky.listNotes());
      return notes.find((note) => note.id === "first-note")?.title;
    }).toBe("Renamed first");
  } finally {
    await electronApp.close();
  }
});

test("Electron saves the latest typing when a new session is created right away", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    const editor = page.getByTestId("sticky-editor-surface");
    await expect(editor).toContainText("first body");

    await editor.getByText("first body").click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" typed just before new tab");
    await page.keyboard.press(modifierShortcut("T"));
    await expect(page.getByRole("tab")).toHaveCount(2);

    await expect.poll(async () => {
      const note = await page.evaluate(() => window.blocknoteSticky.getNote("first-note"));
      return note?.markdown ?? "";
    }).toContain("typed just before new tab");
  } finally {
    await electronApp.close();
  }
});

test("Electron exits a second instance that shares the same user data", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
  ]);
  const firstApp = await launchApp(userDataDirectory);
  let secondApp = null;

  try {
    const page = await firstApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("first body");

    // The second process may exit before Playwright attaches to it.
    secondApp = await launchApp(userDataDirectory).catch(() => null);
    if (secondApp) {
      await expect.poll(() => secondApp.process().exitCode, { timeout: 10_000 })
        .not.toBeNull();
    }

    await expect(page.getByTestId("sticky-editor-surface")).toContainText("first body");
  } finally {
    if (secondApp && secondApp.process().exitCode === null) {
      await secondApp.close();
    }
    await firstApp.close();
  }
});

test("Electron reopens a window saved on a disconnected display inside the screen", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
  ]);
  const notesPath = path.join(userDataDirectory, "notes.json");
  const state = JSON.parse(fs.readFileSync(notesPath, "utf8"));
  state.notes[0].bounds = { x: -20000, y: -20000, width: 960, height: 720 };
  fs.writeFileSync(notesPath, JSON.stringify(state), "utf8");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("first body");

    const { bounds, workArea } = await electronApp.evaluate(({ BrowserWindow, screen }) => ({
      bounds: BrowserWindow.getAllWindows()[0].getBounds(),
      workArea: screen.getPrimaryDisplay().workArea,
    }));
    expect(bounds.x).toBeGreaterThanOrEqual(workArea.x);
    expect(bounds.y).toBeGreaterThanOrEqual(workArea.y);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(workArea.x + workArea.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(workArea.y + workArea.height);
  } finally {
    await electronApp.close();
  }
});

test("Electron reopens a tabs window saved on a disconnected display inside the screen", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
  ]);
  const notesPath = path.join(userDataDirectory, "notes.json");
  const state = JSON.parse(fs.readFileSync(notesPath, "utf8"));
  state.tabsWindow = { alwaysOnTop: false, bounds: { x: -20000, y: -20000, width: 900, height: 600 } };
  fs.writeFileSync(notesPath, JSON.stringify(state), "utf8");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("first body");

    const { bounds, workArea } = await electronApp.evaluate(({ BrowserWindow, screen }) => ({
      bounds: BrowserWindow.getAllWindows()[0].getBounds(),
      workArea: screen.getPrimaryDisplay().workArea,
    }));
    expect(bounds).toMatchObject({ width: 900, height: 600 });
    expect(bounds.x).toBeGreaterThanOrEqual(workArea.x);
    expect(bounds.y).toBeGreaterThanOrEqual(workArea.y);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(workArea.x + workArea.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(workArea.y + workArea.height);
  } finally {
    await electronApp.close();
  }
});

// The tabs window has one size and place whichever tab is active, apart from the notes' sticky bounds.
test("Electron restores the tabs window bounds after sticky mode and after a restart", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "alpha", title: "Alpha", markdown: "alpha body", createdAt: 1, updatedAt: 1 },
    { id: "beta", title: "Beta", markdown: "beta body", createdAt: 2, updatedAt: 2 },
    { id: "gamma", title: "Gamma", markdown: "gamma body", createdAt: 3, updatedAt: 3 },
  ]);
  let electronApp = await launchApp(userDataDirectory);
  let movedBounds;

  try {
    const firstPage = await electronApp.firstWindow();
    await expect(firstPage.getByTestId("sticky-editor-surface")).toContainText("alpha body");
    const openedBounds = await getFirstWindowBounds(electronApp);

    // Sticky mode moves this window into the sticky grid; tabs mode brings it back.
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().filter((window) => window.isVisible()).length)).toBe(3);
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(() => readAllWindowBounds(electronApp)).toEqual([openedBounds]);

    await expect.poll(() => getOpenPages(electronApp).length).toBe(1);
    const page = getOpenPages(electronApp)[0];
    await page.getByRole("tab", { name: /Gamma/ }).click();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("gamma body");
    movedBounds = await electronApp.evaluate(({ BrowserWindow, screen }) => {
      const { workArea } = screen.getPrimaryDisplay();
      const window = BrowserWindow.getAllWindows()[0];
      window.setBounds({
        x: workArea.x + 40,
        y: workArea.y + 30,
        width: Math.min(1000, workArea.width - 80),
        height: Math.min(680, workArea.height - 60),
      });
      // A move or resize by hand ends with these events.
      window.emit("resized");
      window.emit("moved");
      return window.getBounds();
    });
    expect(movedBounds).not.toEqual(openedBounds);
  } finally {
    await electronApp.close();
  }

  electronApp = await launchApp(userDataDirectory);
  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    expect(await readAllWindowBounds(electronApp)).toEqual([movedBounds]);
  } finally {
    await electronApp.close();
  }
});

test("Electron runs every renderer sandboxed with the preload bridge intact", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-sandbox-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();

    const sandboxFlags = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) =>
        window.webContents.getLastWebPreferences().sandbox),
    );
    expect(sandboxFlags.length).toBeGreaterThan(0);
    expect(sandboxFlags).toEqual(sandboxFlags.map(() => true));
    expect(await page.evaluate(() => ({
      platform: window.blocknoteSticky?.platform,
      listNotes: typeof window.blocknoteSticky?.listNotes,
      require: typeof window.require,
    }))).toEqual({ platform: process.platform, listNotes: "function", require: "undefined" });
  } finally {
    await electronApp.close();
  }
});

test("Electron loads the packaged renderer under a Content Security Policy", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-csp-");
  writeInitialNotes(userDataDirectory, [
    {
      id: "csp-note",
      title: "CSP note",
      blocksJSON: JSON.stringify([
        { id: "image-block", type: "image", props: { url: `data:image/png;base64,${TINY_PNG_BASE64}` }, children: [] },
        { id: "text-block", type: "paragraph", content: [{ type: "text", text: "csp probe" }], children: [] },
      ]),
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("csp probe");
    const violations = [];
    page.on("console", (message) => {
      if (/Content Security Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    // Reload with the listener attached so violations during startup are seen.
    await page.reload();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("csp probe");
    await expect.poll(() => readEditorImage(page)).toEqual({
      src: expect.stringMatching(/^notepane-asset:\/\/local\/[0-9a-f]{64}\.png$/),
      loaded: true,
    });
    await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe("loaded");
    expect(violations).toEqual([]);

    const policy = await page.evaluate(() =>
      document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute("content") ?? null);
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);

    const inlineScriptRan = await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.__notepaneInlineScriptRan = true;";
      document.head.append(script);
      script.remove();
      return window.__notepaneInlineScriptRan === true;
    });
    expect(inlineScriptRan).toBe(false);
  } finally {
    await electronApp.close();
  }
});

test("Electron opens only web and mail links externally and never navigates the app window", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    const appUrl = page.url();
    await electronApp.evaluate(({ shell }) => {
      globalThis.openedExternalUrls = [];
      shell.openExternal = async (url) => {
        globalThis.openedExternalUrls.push(url);
      };
    });

    await page.evaluate(() => {
      window.open("file:///etc/hosts");
      window.open("smb://example.test/share");
      window.open("https://example.test/opened");
      window.open("mailto:someone@example.test");
    });
    await page.evaluate(() => {
      window.location.href = "https://example.test/navigated";
    }).catch(() => {});

    await expect.poll(() => electronApp.evaluate(() => globalThis.openedExternalUrls))
      .toEqual([
        "https://example.test/opened",
        "mailto:someone@example.test",
        "https://example.test/navigated",
      ]);
    // Playwright keeps waiting on the cancelled navigation, so read the DOM
    // through the main process instead of a locator.
    const pageState = await electronApp.evaluate(async ({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      return {
        url: contents.getURL(),
        hasEditor: await contents.executeJavaScript(
          "Boolean(document.querySelector('[data-testid=sticky-editor-surface]'))",
        ),
      };
    });
    expect(pageState).toEqual({ url: appUrl, hasEditor: true });
  } finally {
    await electronApp.close();
  }
});

test("Electron note search drops its find request when the tab switch fails", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", markdown: "second has the needle", createdAt: 2, updatedAt: 2 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    const editor = page.getByTestId("sticky-editor-surface");
    await expect(editor).toContainText("first body");
    await editor.getByText("first body").click();
    await page.keyboard.press(modifierShortcut("P"));
    const palette = page.getByRole("dialog", { name: "Search notes" });
    const input = palette.getByRole("textbox", { name: "Search notes" });
    await input.fill("needle");
    await expect(palette.getByRole("option")).toHaveCount(1);

    // Another window trashes the note while the palette still lists it.
    await page.evaluate(() => window.blocknoteSticky.deleteNote("second-note"));
    await expect(page.getByRole("tab", { name: /Second note/ })).toHaveCount(0);
    await input.press("Enter");
    await expect(palette).toHaveCount(0);
    expect(await getCurrentPageNoteId(page)).toBe("first-note");

    await page.evaluate(() => window.blocknoteSticky.restoreNote("second-note"));
    await page.getByRole("tab", { name: /Second note/ }).click();
    await expect(editor).toContainText("second has the needle");
    await expect.poll(() => getCurrentPageNoteId(page)).toBe("second-note");
    // Open the palette and close it again: a stale find request would have
    // opened the find bar by the time this round trip finishes.
    await page.keyboard.press(modifierShortcut("P"));
    await palette.getByRole("textbox", { name: "Search notes" }).press("Escape");
    await expect(page.getByRole("search", { name: "Find in note" })).toHaveCount(0);
  } finally {
    await electronApp.close();
  }
});

test("Electron reveal drops a find query its window never took", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", markdown: "second has the needle", createdAt: 2, updatedAt: 2 },
  ]);
  const electronApp = await launchApp(userDataDirectory);
  const countWindows = () => electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().length);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("first body");
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(countWindows).toBe(2);
    const firstStickyPage = await getStickyPageByNoteId(electronApp, "first-note");
    const secondStickyPage = await getStickyPageByNoteId(electronApp, "second-note");

    // The second window never hears `find:open`, then closes without taking it.
    const secondWindowId = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((window) =>
        new URL(window.webContents.getURL()).searchParams.get("noteId") === "second-note").id);
    await electronApp.evaluate(({ BrowserWindow }, windowId) => {
      const { webContents } = BrowserWindow.fromId(windowId);
      const send = webContents.send.bind(webContents);
      webContents.send = (channel, ...args) => {
        if (channel !== "find:open") {
          send(channel, ...args);
        }
      };
    }, secondWindowId);
    await firstStickyPage.evaluate(() =>
      window.blocknoteSticky.revealNote({ noteId: "second-note", query: "needle" }));
    expect(secondStickyPage.isClosed()).toBe(false);
    // Closed from the main process, which counts as closing it by hand, so the
    // test does not wait on a reply from the page that is closing.
    await electronApp.evaluate(({ BrowserWindow }, windowId) => {
      BrowserWindow.fromId(windowId).close();
    }, secondWindowId);
    await expect.poll(countWindows).toBe(1);

    await clickMenuItem(electronApp, "Show All NotePanes");
    await expect.poll(countWindows).toBe(2);
    const reopenedPage = await getStickyPageByNoteId(electronApp, "second-note");
    await expect(reopenedPage.getByTestId("sticky-editor-surface")).toContainText("second has the needle");
    await reopenedPage.bringToFront();
    await reopenedPage.getByTestId("sticky-editor-surface").getByText("second has the needle").click();
    await reopenedPage.keyboard.press(modifierShortcut("P"));
    await reopenedPage.getByRole("dialog", { name: "Search notes" })
      .getByRole("textbox", { name: "Search notes" }).press("Escape");
    await expect(reopenedPage.getByRole("search", { name: "Find in note" })).toHaveCount(0);
  } finally {
    await electronApp.close();
  }
});

test("Electron note search palette keeps a selection when the stored list is shorter", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", markdown: "second body", createdAt: 2, updatedAt: 2 },
    { id: "third-note", title: "Third note", markdown: "third body", createdAt: 3, updatedAt: 3 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    const editor = page.getByTestId("sticky-editor-surface");
    await expect(editor).toContainText("first body");
    const firstNote = await page.evaluate(() => window.blocknoteSticky.getNote("first-note"));
    // Hold the palette's stored-note request, then answer it with fewer notes
    // than the window lists, as when another window trashed them meanwhile.
    await electronApp.evaluate(({ ipcMain }, onlyNote) => {
      globalThis.releaseNotesList = [];
      ipcMain.removeHandler("notes:list");
      ipcMain.handle("notes:list", () => new Promise((resolve) => {
        globalThis.releaseNotesList.push(() => resolve([onlyNote]));
      }));
    }, firstNote);

    await editor.getByText("first body").click();
    await page.keyboard.press(modifierShortcut("P"));
    const palette = page.getByRole("dialog", { name: "Search notes" });
    const input = palette.getByRole("textbox", { name: "Search notes" });
    await expect(palette.getByRole("option")).toHaveCount(3);
    await input.press("ArrowUp");
    await expect(palette.getByRole("option").nth(2)).toHaveAttribute("aria-selected", "true");

    await expect.poll(() => electronApp.evaluate(() => globalThis.releaseNotesList.length))
      .toBeGreaterThan(0);
    await electronApp.evaluate(() => globalThis.releaseNotesList.forEach((release) => release()));
    await expect(palette.getByRole("option")).toHaveCount(1);
    await expect(palette.getByRole("option")).toHaveAttribute("aria-selected", "true");
    await input.press("Enter");

    await expect(palette).toHaveCount(0);
  } finally {
    await electronApp.close();
  }
});

test("Electron note search switches tabs and opens find on the match", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", markdown: "second has the needle", createdAt: 2, updatedAt: 2 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    const editor = page.getByTestId("sticky-editor-surface");
    await expect(editor).toContainText("first body");

    await editor.getByText("first body").click();
    await page.keyboard.press(modifierShortcut("P"));
    const palette = page.getByRole("dialog", { name: "Search notes" });
    await palette.getByRole("textbox", { name: "Search notes" }).fill("needle");
    await expect(palette.getByRole("option")).toHaveCount(1);
    await palette.getByRole("textbox", { name: "Search notes" }).press("Enter");

    await expect(editor).toContainText("second has the needle");
    await expect.poll(() => getCurrentPageNoteId(page)).toBe("second-note");
    const findBar = page.getByRole("search", { name: "Find in note" });
    await expect(findBar.getByRole("textbox", { name: "Find in note" })).toHaveValue("needle");
    await expect(findBar).toContainText("1 / 1");
  } finally {
    await electronApp.close();
  }
});

test("Electron note search leaves focus in the find field of the tab it opens", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", markdown: "needle one\n\nneedle two", createdAt: 2, updatedAt: 2 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    const editor = page.getByTestId("sticky-editor-surface");
    await editor.getByText("first body").click();
    await page.keyboard.press(modifierShortcut("P"));
    const palette = page.getByRole("dialog", { name: "Search notes" });
    await palette.getByRole("textbox", { name: "Search notes" }).fill("needle");
    await palette.getByRole("textbox", { name: "Search notes" }).press("Enter");

    await expect.poll(() => getCurrentPageNoteId(page)).toBe("second-note");
    const findBar = page.getByRole("search", { name: "Find in note" });
    await expect(findBar).toContainText("1 / 2");
    const blocks = editor.locator(".bn-block-content");
    const blockCount = await blocks.count();
    await expect(findBar.getByRole("textbox", { name: "Find in note" })).toBeFocused();

    // Enter steps to the next match and Escape closes find; neither edits the note.
    await page.keyboard.press("Enter");
    await expect(findBar).toContainText("2 / 2");
    await page.keyboard.press("Escape");
    await expect(findBar).toHaveCount(0);
    await expect(blocks).toHaveCount(blockCount);
  } finally {
    await electronApp.close();
  }
});

test("Electron note search reveals a sticky window, even one closed by hand", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", markdown: "second has the needle", createdAt: 2, updatedAt: 2 },
  ]);
  const electronApp = await launchApp(userDataDirectory);
  const countWindows = () => electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().length);
  const searchFrom = async (page, query) => {
    await page.bringToFront();
    await page.getByTestId("sticky-editor-surface").getByText("first body").click();
    await page.keyboard.press(modifierShortcut("P"));
    const input = page.getByRole("dialog", { name: "Search notes" })
      .getByRole("textbox", { name: "Search notes" });
    await input.fill(query);
    await input.press("Enter");
  };

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("first body");
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(countWindows).toBe(2);
    const firstStickyPage = await getStickyPageByNoteId(electronApp, "first-note");

    await searchFrom(firstStickyPage, "needle");
    let secondStickyPage = await getStickyPageByNoteId(electronApp, "second-note");
    let findBar = secondStickyPage.getByRole("search", { name: "Find in note" });
    await expect(findBar.getByRole("textbox", { name: "Find in note" })).toHaveValue("needle");
    await expect(findBar).toContainText("1 / 1");

    await secondStickyPage.evaluate(() => window.blocknoteSticky.closeCurrentWindow());
    await expect.poll(countWindows).toBe(1);

    await searchFrom(firstStickyPage, "needle");
    await expect.poll(countWindows).toBe(2);
    secondStickyPage = await getStickyPageByNoteId(electronApp, "second-note");
    findBar = secondStickyPage.getByRole("search", { name: "Find in note" });
    await expect(findBar.getByRole("textbox", { name: "Find in note" })).toHaveValue("needle");
  } finally {
    await electronApp.close();
  }
});

test("Electron reveal ignores a note that no longer exists", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("first body");

    const revealed = await page.evaluate(() =>
      window.blocknoteSticky.revealNote({ noteId: "missing-note", query: "x" }));

    expect(revealed).toBeNull();
    expect(await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    await electronApp.close();
  }
});

test("Electron note search sees text another sticky window just saved", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", markdown: "second body", createdAt: 2, updatedAt: 2 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("first body");
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    const firstStickyPage = await getStickyPageByNoteId(electronApp, "first-note");
    const secondStickyPage = await getStickyPageByNoteId(electronApp, "second-note");

    // The title is set by hand, so this edit does not broadcast a title change.
    await secondStickyPage.bringToFront();
    const secondEditor = secondStickyPage.getByTestId("sticky-editor-surface");
    await secondEditor.getByText("second body").click();
    await secondStickyPage.keyboard.press("End");
    await secondStickyPage.keyboard.insertText(" freshword");
    await expect.poll(async () => {
      const note = await firstStickyPage.evaluate(() => window.blocknoteSticky.getNote("second-note"));
      return note?.markdown ?? "";
    }).toContain("freshword");

    await firstStickyPage.bringToFront();
    await firstStickyPage.getByTestId("sticky-editor-surface").getByText("first body").click();
    await firstStickyPage.keyboard.press(modifierShortcut("P"));
    const palette = firstStickyPage.getByRole("dialog", { name: "Search notes" });
    await palette.getByRole("textbox", { name: "Search notes" }).fill("freshword");

    await expect(palette.getByRole("option")).toHaveCount(1);
  } finally {
    await electronApp.close();
  }
});

// A valid 1x1 PNG, small enough to inline in a test.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";

async function readEditorImage(page) {
  return await page.locator(".bn-editor img.bn-visual-media").first().evaluate((image) => ({
    src: image.getAttribute("src"),
    loaded: image.complete && image.naturalWidth > 0,
  }));
}

test("Electron stores pasted images as asset files and keeps exports self-contained", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const exportDirectory = createTemporaryDirectory("notepane-export-");
  const electronApp = await launchApp(userDataDirectory, exportDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await clickLastEmptyParagraph(page);
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const clipboardData = new DataTransfer();
      clipboardData.items.add(new File([bytes], "dot.png", { type: "image/png" }));
      document.querySelector(".bn-editor").dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }),
      );
    }, TINY_PNG_BASE64);

    await expect.poll(() => readEditorImage(page)).toEqual({
      src: expect.stringMatching(/^notepane-asset:\/\/local\/[0-9a-f]{64}\.png$/),
      loaded: true,
    });
    await expect.poll(() => {
      const state = JSON.parse(fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8"));
      return state.notes.some((note) => /notepane-asset:/.test(note.blocksJSON ?? ""));
    }).toBe(true);
    expect(fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8")).not.toContain(";base64,");

    const image = page.locator(".bn-editor img.bn-visual-media").first();
    const imageTools = page.locator(".notepane-formatting-toolbar:visible");
    await image.click();
    await imageTools.locator(".notepane-file-download-button").click();
    await expect.poll(() => fs.readdirSync(exportDirectory).filter((name) => name.endsWith(".png")))
      .toHaveLength(1);
    const downloadedName = fs.readdirSync(exportDirectory).find((name) => name.endsWith(".png"));
    expect(fs.readFileSync(path.join(exportDirectory, downloadedName)))
      .toEqual(Buffer.from(TINY_PNG_BASE64, "base64"));

    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menu", { name: "Export format" })
      .getByRole("menuitem", { name: /Markdown/ })
      .click();
    await expect.poll(() => fs.readdirSync(exportDirectory).filter((name) => name.endsWith(".md")))
      .toHaveLength(1);
    const markdownName = fs.readdirSync(exportDirectory).find((name) => name.endsWith(".md"));
    const markdown = fs.readFileSync(path.join(exportDirectory, markdownName), "utf8");
    expect(markdown).toContain(`data:image/png;base64,${TINY_PNG_BASE64}`);
    expect(markdown).not.toContain("notepane-asset:");

    await image.click();
    await imageTools.getByRole("button", { name: "Crop image" }).click();
    await page.getByRole("dialog", { name: "Crop image" })
      .getByRole("button", { name: "Apply crop" })
      .click();
    await expect.poll(() => readEditorImage(page)).toEqual({
      src: expect.stringMatching(/^notepane-asset:\/\/local\/[0-9a-f]{64}\.png$/),
      loaded: true,
    });
  } finally {
    await electronApp.close();
  }
});

test("Electron copies an asset image to the system clipboard as image data", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await clickLastEmptyParagraph(page);
    await page.evaluate((base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const clipboardData = new DataTransfer();
      clipboardData.items.add(new File([bytes], "dot.png", { type: "image/png" }));
      document.querySelector(".bn-editor").dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }),
      );
    }, TINY_PNG_BASE64);
    await expect.poll(() => readEditorImage(page)).toEqual({
      src: expect.stringMatching(/^notepane-asset:\/\/local\/[0-9a-f]{64}\.png$/),
      loaded: true,
    });

    await electronApp.evaluate(({ clipboard }) => clipboard.clear());
    await page.locator(".bn-editor img.bn-visual-media").first().click();
    await page.locator(".notepane-formatting-toolbar:visible")
      .getByRole("button", { name: "Copy image", exact: true })
      .click();

    await expect(page.getByRole("status").filter({ hasText: "Image copied" })).toBeVisible();
    await expect.poll(() => electronApp.evaluate(
      ({ clipboard }) => clipboard.readImage().getSize(),
    )).toEqual({ width: 1, height: 1 });
  } finally {
    await electronApp.close();
  }
});

test("Electron refuses bookmark metadata for local and non-web addresses", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    const results = await page.evaluate(async (urls) => Promise.all(urls.map((url) =>
      window.blocknoteSticky.fetchBookmarkMetadata(url).then(
        () => "fetched",
        (error) => String(error.message),
      ))), ["http://127.0.0.1:9/", "http://localhost/", "file:///etc/passwd", "http://[::1]/"]);

    expect(results[0]).toContain("Private network addresses cannot be bookmarked.");
    expect(results[1]).toContain("Local addresses cannot be bookmarked.");
    expect(results[2]).toContain("Only http and https addresses can be bookmarked.");
    expect(results[3]).toContain("Private network addresses cannot be bookmarked.");
  } finally {
    await electronApp.close();
  }
});

test("Electron moves an inline image from an older notes file into an asset", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    {
      id: "image-note",
      title: "Image note",
      blocksJSON: JSON.stringify([
        { id: "image-block", type: "image", props: { url: `data:image/png;base64,${TINY_PNG_BASE64}` }, children: [] },
        { id: "text-block", type: "paragraph", content: [{ type: "text", text: "after image" }], children: [] },
      ]),
      createdAt: 1,
      updatedAt: 1,
    },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("after image");

    await expect.poll(() => readEditorImage(page)).toEqual({
      src: expect.stringMatching(/^notepane-asset:\/\/local\/[0-9a-f]{64}\.png$/),
      loaded: true,
    });
    expect(fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8")).not.toContain(";base64,");
    expect(fs.readdirSync(userDataDirectory).some((name) => name.startsWith("notes.pre-assets-"))).toBe(true);
  } finally {
    await electronApp.close();
  }
});

test("Electron menu actions respect tabs/sticky modes and toggle always-on-top", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    let page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await expect(page.getByRole("heading", { name: "NotePane", exact: true }))
      .toHaveCount(0);

    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(1);

    await clickMenuItem(electronApp, "Toggle Table of Contents");
    await expect.poll(() => {
      const state = JSON.parse(
        fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8"),
      );
      return state.editorPreferences.showTableOfContents;
    }).toBe(true);

    await clickMenuItem(electronApp, "New Tab");
    await chooseBlankSessionTemplate(page);
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(1);
    await expect(page.getByRole("tab")).toHaveCount(2);

    await clickMenuItem(electronApp, "Close Tab");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(1);
    await expect(page.getByRole("tab")).toHaveCount(1);
    await expect.poll(() => getStoredTrashState(userDataDirectory)).toEqual({
      activeNoteIds: [expect.any(String)],
      trashedNoteIds: [expect.any(String)],
    });

    await clickMenuItem(electronApp, "New Note");
    await chooseBlankSessionTemplate(page);
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(1);
    await expect(page.getByRole("tab")).toHaveCount(2);

    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(2);
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().map((window) => window.getBounds());
      });
    }).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          width: 420,
          height: 340,
        }),
        ]),
      );

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().at(-1)?.close();
    });
    // Closing a sticky window records it as manually closed and does not
    // recreate it, so one window is left. Expecting the pre-close count of two
    // only passed when the poll sampled before Electron finished destroying it.
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(1);

    await clickMenuItem(electronApp, "Toggle Always On Top");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().some((window) =>
          window.isAlwaysOnTop(),
        );
      });
    }).toBe(true);
  } finally {
    await electronApp.close();
  }
});

test("Cmd/Ctrl+W closes the tab with confirmation", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-close-tab-shortcut-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    const emptyParagraph = page.getByRole("paragraph").filter({ hasText: /^$/ }).last();
    await emptyParagraph.click();
    await page.keyboard.insertText("Close me");

    await page.keyboard.press(modifierShortcut("W"));
    const closeDialog = page.getByRole("dialog", { name: "Close tab confirmation" });
    await expect(closeDialog).toBeVisible();
    // Closing a tab moves its note to Trash, and the dialog says so.
    await expect(closeDialog).toContainText("moves its note to Trash");
    await page.keyboard.press("Escape");
    await expect(closeDialog).toHaveCount(0);

    await page.keyboard.press(modifierShortcut("W"));
    await expect(closeDialog).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(closeDialog).toHaveCount(0);
    await expect(page.locator(".sticky-toast-success")).toContainText("Close me closed and moved to Trash.");
    await expect.poll(() => page.getByRole("tab").count()).toBe(1);
  } finally {
    await electronApp.close();
  }
});

test("Electron trash hides notes from tabs and sticky windows until restored", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    {
      id: "first-note",
      title: "First note",
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "second-note",
      title: "Second note",
      createdAt: 2,
      updatedAt: 2,
    },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(2);

    await page.evaluate(async () => {
      await window.blocknoteSticky.deleteNote("second-note");
    });
    await expect(page.getByRole("tab")).toHaveCount(1);
    await expect.poll(() => getStoredTrashState(userDataDirectory)).toEqual({
      activeNoteIds: ["first-note"],
      trashedNoteIds: ["second-note"],
    });

    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(1);

    await page.evaluate(async () => {
      await window.blocknoteSticky.restoreNote("second-note");
    });
    await expect.poll(() => getStoredTrashState(userDataDirectory)).toEqual({
      activeNoteIds: ["first-note", "second-note"],
      trashedNoteIds: [],
    });
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(2);

    const restoredPage = await getStickyPageByNoteId(electronApp, "second-note");
    await expect(restoredPage.getByTestId("sticky-shell"))
      .toHaveAttribute("data-layout-mode", "sticky");
  } finally {
    await electronApp.close();
  }
});

test("Electron sticky header trash confirms and does not duplicate fallback windows", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    {
      id: "first-note",
      title: "First note",
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "second-note",
      title: "Second note",
      createdAt: 2,
      updatedAt: 2,
    },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByRole("tab")).toHaveCount(2);
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(2);

    const secondStickyPage = await getStickyPageByNoteId(electronApp, "second-note");
    await secondStickyPage.bringToFront();
    await openStickyActionBar(secondStickyPage);
    await secondStickyPage.getByRole("button", { name: "Move note to trash" }).click();
    const confirmDialog = secondStickyPage.getByRole("dialog", {
      name: "Move note to trash confirmation",
    });
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText(/different from closing a sticky window/))
      .toBeVisible();
    await confirmDialog.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmDialog).toHaveCount(0);
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(2);

    await openStickyActionBar(secondStickyPage);
    await secondStickyPage.getByRole("button", { name: "Move note to trash" }).click();
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: /Yes, move Second note to trash/ })
      .click();

    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(1);
    await expect.poll(() => getStoredTrashState(userDataDirectory)).toEqual({
      activeNoteIds: ["first-note"],
      trashedNoteIds: ["second-note"],
    });
  } finally {
    await electronApp.close();
  }
});

test("Electron sticky close icon closes the current window with the platform shortcut", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    {
      id: "first-note",
      title: "First note",
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "second-note",
      title: "Second note",
      createdAt: 2,
      updatedAt: 2,
    },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByRole("tab")).toHaveCount(2);
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(2);

    const firstStickyPage = await getStickyPageByNoteId(electronApp, "first-note");
    await firstStickyPage.bringToFront();
    await openStickyActionBar(firstStickyPage);
    const closeButton = firstStickyPage.getByRole("button", { name: "Close window" });
    const closeShortcut = process.platform === "darwin" ? "⌘W" : "Ctrl+W";
    await expect(closeButton).toHaveAttribute(
      "data-tooltip",
      `Close window · ${closeShortcut}`,
    );
    try {
      await closeButton.evaluate((button) => button.click());
    } catch (error) {
      if (!String(error).includes("has been closed")) {
        throw error;
      }
    }

    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(1);
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().map((window) =>
          new URL(window.webContents.getURL()).searchParams.get("noteId"),
        );
      });
    }).toEqual(["second-note"]);
  } finally {
    await electronApp.close();
  }
});

// The first click turns "Show sticky actions" into "Close window" under the pointer, so the second
// click of a double click must not close the window.
test("Electron sticky actions toggle ignores the second click of a double click", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", createdAt: 2, updatedAt: 2 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByRole("tab")).toHaveCount(2);
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(() => readAllWindowBounds(electronApp).then((bounds) => bounds.length))
      .toBe(2);

    const secondStickyPage = await getStickyPageByNoteId(electronApp, "second-note");
    const actionToggle = secondStickyPage.locator(".sticky-header-action-preview");
    await expect(actionToggle).toHaveAttribute("aria-label", "Show sticky actions");
    await actionToggle.dblclick();
    await expect(actionToggle).toHaveAttribute("aria-label", "Close window");
    // Main handles a window's requests in order, so a close the clicks asked for is done by now.
    await getCurrentPageNoteId(secondStickyPage);
    expect(await readAllWindowBounds(electronApp)).toHaveLength(2);
    await expect(actionToggle).toHaveAttribute("aria-expanded", "true");

    // A separate click still closes it.
    await actionToggle.click().catch((error) => {
      if (!String(error).includes("closed")) {
        throw error;
      }
    });
    await expect.poll(() => readAllWindowBounds(electronApp).then((bounds) => bounds.length))
      .toBe(1);
  } finally {
    await electronApp.close();
  }
});

test("Electron creates sticky-mode tabs with a persisted default accent", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();

    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(1);

    await clickMenuItem(electronApp, "New Tab");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(2);

    await expect.poll(() => {
      const state = JSON.parse(
        fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8"),
      );
      return state.notes.map((note) => note.theme);
    }).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tabTextColor: "#ffd7e8",
          tabTextOpacity: 1,
        }),
      ]),
    );

    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(1);

    // The new tabs window and the closing sticky window of the same note share
    // a URL, and Playwright can still list the closing one. Read every open page
    // on each attempt instead of keeping a page picked mid-transition.
    await expect.poll(() =>
      readOpenPages(electronApp, (page) => page.getByRole("tab").count()),
    ).toContain(2);
    await expect.poll(async () => {
      const [tabStyle = null] = await readOpenPages(electronApp, (page) => page.evaluate(() => {
        const tab = [...document.querySelectorAll(".session-tab-row")]
          .find((candidate) =>
            candidate.getAttribute("style")?.includes("rgb(255 215 232 / 1)"),
          );
        return tab
          ? {
              background: getComputedStyle(tab).backgroundColor,
              color: getComputedStyle(tab).color,
              boxShadow: getComputedStyle(tab).boxShadow,
            }
          : null;
      }));
      return tabStyle;
    }).toEqual({
      background: "rgb(255, 215, 232)",
      color: "rgba(31, 31, 31, 0.72)",
      boxShadow: "rgba(31, 31, 31, 0.04) 0px 0px 0px 1px inset",
    });
  } finally {
    await electronApp.close();
  }
});

test("Electron exposes installed font families to the renderer", async () => {
  test.skip(process.platform !== "darwin", "Installed font enumeration currently uses macOS system_profiler.");

  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();

    await expect.poll(async () => {
      const currentPage = getOpenPages(electronApp)[0];
      if (!currentPage) {
        return 0;
      }

      try {
        return await currentPage.evaluate(async () => {
          const fonts = await window.blocknoteSticky?.listFonts?.();
          return Array.isArray(fonts) ? fonts.length : 0;
        });
      } catch {
        return 0;
      }
    }, { timeout: 25_000 }).toBeGreaterThan(0);
  } finally {
    await electronApp.close();
  }
});

test("Electron vertically centers macOS traffic lights for tabs and sticky windows", async () => {
  test.skip(process.platform !== "darwin", "macOS traffic lights are only available on darwin.");

  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    {
      id: "first-note",
      title: "First note",
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "second-note",
      title: "Second note",
      createdAt: 2,
      updatedAt: 2,
    },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-header")).toBeVisible();

    await expect.poll(async () => {
      return await getWindowButtonPosition(electronApp, 0);
    }).toEqual({ x: 14, y: 15 });
    await expect.poll(async () => {
      return await getAllWindowShadowStates(electronApp);
    }).toEqual([true]);

    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(2);

    await expect.poll(async () => {
      return await getAllWindowButtonPositions(electronApp);
    }).toEqual([
      { x: 14, y: 10 },
      { x: 14, y: 10 },
    ]);
    await expect.poll(async () => {
      return await getAllWindowShadowStates(electronApp);
    }).toEqual([true, true]);
  } finally {
    await electronApp.close();
  }
});

test("Electron uses the native Windows title bar and frame", async () => {
  test.skip(process.platform !== "win32", "Windows window chrome is only available on win32.");

  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await expect(page.getByTestId("sticky-header")).toHaveCount(0);
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows()[0]?.isMenuBarVisible();
      });
    }).toBe(true);
    const titleBarHeight = await page.evaluate(() => window.outerHeight - window.innerHeight);
    expect(titleBarHeight).toBeGreaterThan(24);

    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(() => getOpenPages(electronApp).length).toBe(1);
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows()[0]?.isMenuBarVisible();
      });
    }).toBe(false);
    // The closing tabs window can still be listed while the sticky window
    // opens. Read every open page on each attempt instead of keeping a page
    // picked mid-transition.
    await expect.poll(async () => {
      const stickyTitleBarHeights = await readOpenPages(electronApp, async (page) =>
        (await page.getByTestId("sticky-header").isVisible())
          ? page.evaluate(() => window.outerHeight - window.innerHeight)
          : null);
      return stickyTitleBarHeights.length === 1 && stickyTitleBarHeights[0] < 16;
    }).toBe(true);
  } finally {
    await electronApp.close();
  }
});

async function getWindowButtonPosition(electronApp, windowIndex) {
  return await electronApp.evaluate(({ BrowserWindow }, index) => {
    const window = BrowserWindow.getAllWindows()[index];
    return window?.getWindowButtonPosition?.()
      ?? window?.getTrafficLightPosition?.()
      ?? window?.__notepaneTrafficLightPosition
      ?? null;
  }, windowIndex);
}

async function getAllWindowButtonPositions(electronApp) {
  return await electronApp.evaluate(({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows().map((window) =>
      window?.getWindowButtonPosition?.()
        ?? window?.getTrafficLightPosition?.()
        ?? window?.__notepaneTrafficLightPosition
        ?? null
    );
  });
}

async function getAllWindowShadowStates(electronApp) {
  return await electronApp.evaluate(({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows().map((window) => window?.hasShadow?.() ?? null);
  });
}

async function getFirstWindowBounds(electronApp) {
  return await electronApp.evaluate(({ BrowserWindow }) => {
    return BrowserWindow.getAllWindows()[0]?.getBounds() ?? null;
  });
}

test("Electron returns to tab session mode after every sticky window is closed", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    {
      id: "first-note",
      title: "First note",
      theme: {
        tabTextColor: "#fff2b8",
        tabTextOpacity: 1,
      },
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "second-note",
      title: "Second note",
      theme: {
        tabTextColor: "#d9efff",
        tabTextOpacity: 1,
      },
      createdAt: 2,
      updatedAt: 2,
    },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(2);

    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(2);

    await electronApp.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.close();
      }
    });

    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(1);

    await expect.poll(() => {
      const state = JSON.parse(
        fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8"),
      );
      return state.layoutMode;
    }).toBe("tabs");

    await expect.poll(async () => {
      return await electronApp.evaluate(async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (!window) {
          return null;
        }

        return await window.webContents.executeJavaScript(
          "document.querySelector('[data-testid=\"sticky-shell\"]')?.dataset.layoutMode ?? null",
          true,
        );
      });
    }, { timeout: 20_000 }).toBe("tabs");
    // The menu follows the layout back, so Preferences opens again.
    expect(await isMenuItemEnabled(electronApp, "Preferences")).toBe(true);
  } finally {
    await electronApp.close();
  }
});

test("Electron sticky windows keep independent pin and color updates", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    {
      id: "first-note",
      title: "First note",
      theme: {
        tabTextColor: "#fff2b8",
        tabTextOpacity: 1,
      },
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "second-note",
      title: "Second note",
      theme: {
        tabTextColor: "#ffd7e8",
        tabTextOpacity: 1,
      },
      createdAt: 2,
      updatedAt: 2,
    },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(2);

    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().length;
      });
    }).toBe(2);

    const firstStickyPage = await getStickyPageByNoteId(electronApp, "first-note");
    const secondStickyPage = await getStickyPageByNoteId(electronApp, "second-note");
    await expect(firstStickyPage.getByTestId("sticky-title-drag-label"))
      .toHaveCount(0);
    await expect(secondStickyPage.getByTestId("sticky-title-drag-label"))
      .toHaveCount(0);

    await firstStickyPage.bringToFront();
    await openStickyActionBar(firstStickyPage);
    await firstStickyPage.getByRole("button", { name: "Pin window" }).click();
    await expect(firstStickyPage.getByRole("button", { name: "Unpin window" }))
      .toHaveAttribute("aria-pressed", "true");
    await secondStickyPage.bringToFront();
    await openStickyActionBar(secondStickyPage);
    await expect(secondStickyPage.getByRole("button", { name: "Pin window" }))
      .toHaveAttribute("aria-pressed", "false");
    await expect.poll(async () => {
      return await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().map((window) => ({
          noteId: new URL(window.webContents.getURL()).searchParams.get("noteId"),
          alwaysOnTop: window.isAlwaysOnTop(),
        }));
      });
    }).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          noteId: "first-note",
          alwaysOnTop: true,
        }),
        expect.objectContaining({
          noteId: "second-note",
          alwaysOnTop: false,
        }),
      ]),
    );
    await expect.poll(() => {
      const state = JSON.parse(
        fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8"),
      );
      return state.notes.map((note) => ({
        id: note.id,
        alwaysOnTop: note.alwaysOnTop,
      }));
    }).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "first-note",
          alwaysOnTop: true,
        }),
        expect.objectContaining({
          id: "second-note",
          alwaysOnTop: false,
        }),
      ]),
    );

    await firstStickyPage.bringToFront();
    const firstStickySettings = await openStickySettings(firstStickyPage);
    await firstStickySettings.getByRole("button", { name: "Pastel color 5" }).click();
    await expect(firstStickyPage.getByLabel("HEX sticky color value"))
      .toHaveValue("eadcff");

    await expect.poll(() => getShellBackground(firstStickyPage))
      .toBe("rgb(234, 220, 255)");
    await expect.poll(() => getShellBackground(secondStickyPage))
      .not.toBe("rgb(234, 220, 255)");
  } finally {
    await electronApp.close();
  }
});

// A colour change sends no title flag, so a title named by hand must not fall back to the first line.
test("Electron keeps a sticky note's hand-edited title when its colour changes", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "Alpha", markdown: "alpha", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Beta", markdown: "beta", createdAt: 2, updatedAt: 2 },
  ]);
  const readStoredNote = () => JSON.parse(
    fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8"),
  ).notes.find((note) => note.id === "second-note");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    const secondStickyPage = await getStickyPageByNoteId(electronApp, "second-note");
    await expect(secondStickyPage.getByTestId("sticky-editor-surface")).toContainText("beta");

    const settings = await openStickySettings(secondStickyPage);
    await settings.getByRole("button", { name: "Pastel color 5" }).click();
    await expect.poll(() => readStoredNote().theme.tabTextColor).toBe("#eadcff");
    expect(readStoredNote()).toMatchObject({ title: "Beta", titleManuallyEdited: true });
  } finally {
    await electronApp.close();
  }
});

// Tabs mode pins the tabs window, which no note owns, and each sticky window then shows its own note's pin.
test("Electron keeps the tabs window pin off the notes and out of sticky windows", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "alpha", title: "Alpha", markdown: "alpha body", createdAt: 1, updatedAt: 1 },
    { id: "beta", title: "Beta", markdown: "beta body", createdAt: 2, updatedAt: 2 },
    { id: "gamma", title: "Gamma", markdown: "gamma body", createdAt: 3, updatedAt: 3 },
  ]);
  let electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    const editor = page.getByTestId("sticky-editor-surface");
    await expect(editor).toContainText("alpha body");

    await page.getByRole("tab", { name: /Beta/ }).click();
    await expect(editor).toContainText("beta body");
    await clickMenuItem(electronApp, "Toggle Always On Top");
    await expect.poll(() => readWindowPins(electronApp))
      .toEqual([{ noteId: "beta", alwaysOnTop: true }]);
    await expect.poll(() => readStoredPins(userDataDirectory)).toEqual({
      tabsWindow: true,
      notes: { alpha: false, beta: false, gamma: false },
    });

    // The tabs window becomes Gamma's sticky window.
    await page.getByRole("tab", { name: /Gamma/ }).click();
    await expect(editor).toContainText("gamma body");
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(() => readWindowPins(electronApp)).toEqual([
      { noteId: "alpha", alwaysOnTop: false },
      { noteId: "beta", alwaysOnTop: false },
      { noteId: "gamma", alwaysOnTop: false },
    ]);
    const gammaPage = await getPageBoundToNote(electronApp, "gamma");
    await openStickyActionBar(gammaPage);
    await expect(gammaPage.getByRole("button", { name: "Pin window" }))
      .toHaveAttribute("aria-pressed", "false");

    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(() => readWindowPins(electronApp))
      .toEqual([{ noteId: "alpha", alwaysOnTop: true }]);
  } finally {
    await electronApp.close();
  }

  electronApp = await launchApp(userDataDirectory);
  try {
    await expect.poll(() => readWindowPins(electronApp))
      .toEqual([{ noteId: "alpha", alwaysOnTop: true }]);
  } finally {
    await electronApp.close();
  }
});

test("Electron keeps a pinned sticky note from pinning the tabs window", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "alpha", title: "Alpha", markdown: "alpha body", createdAt: 1, updatedAt: 1 },
    { id: "beta", title: "Beta", markdown: "beta body", createdAt: 2, updatedAt: 2 },
  ]);
  let electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("alpha body");
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(() => readWindowPins(electronApp)).toEqual([
      { noteId: "alpha", alwaysOnTop: false },
      { noteId: "beta", alwaysOnTop: false },
    ]);
    const alphaPage = await getPageBoundToNote(electronApp, "alpha");
    await openStickyActionBar(alphaPage);
    await alphaPage.getByRole("button", { name: "Pin window" }).click();
    await expect.poll(() => readWindowPins(electronApp)).toEqual([
      { noteId: "alpha", alwaysOnTop: true },
      { noteId: "beta", alwaysOnTop: false },
    ]);

    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(() => readWindowPins(electronApp))
      .toEqual([{ noteId: "alpha", alwaysOnTop: false }]);
    await expect.poll(() => readStoredPins(userDataDirectory)).toEqual({
      tabsWindow: false,
      notes: { alpha: true, beta: false },
    });
  } finally {
    await electronApp.close();
  }

  // Alpha is the active tab at launch, and Alpha's sticky window still comes back pinned.
  electronApp = await launchApp(userDataDirectory);
  try {
    await expect.poll(() => readWindowPins(electronApp))
      .toEqual([{ noteId: "alpha", alwaysOnTop: false }]);
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(() => readWindowPins(electronApp)).toEqual([
      { noteId: "alpha", alwaysOnTop: true },
      { noteId: "beta", alwaysOnTop: false },
    ]);
  } finally {
    await electronApp.close();
  }
});

// Mission Control and the Dock list windows by title, so each window carries the title of the note
// it shows, never the page's "NotePane".
test("Electron titles every window with the note it shows", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "alpha", title: "Alpha", markdown: "alpha body", createdAt: 1, updatedAt: 1 },
    { id: "beta", title: "Beta", markdown: "beta body", createdAt: 2, updatedAt: 2 },
  ]);
  let electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    const editor = page.getByTestId("sticky-editor-surface");
    await expect(editor).toContainText("alpha body");
    await expect.poll(() => readWindowTitles(electronApp))
      .toEqual([{ noteId: "alpha", title: "Alpha" }]);

    await page.getByRole("tab", { name: /Beta/ }).click();
    await expect(editor).toContainText("beta body");
    await expect.poll(() => readWindowTitles(electronApp))
      .toEqual([{ noteId: "beta", title: "Beta" }]);

    await page.getByRole("tab", { name: /Beta/ }).dblclick();
    await page.getByLabel("Session name").fill("Beta renamed");
    await page.keyboard.press("Enter");
    await expect.poll(() => readWindowTitles(electronApp))
      .toEqual([{ noteId: "beta", title: "Beta renamed" }]);

    // Recolouring the other tab saves that note's appearance, which leaves the title alone.
    await page.locator(".session-tab-row").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Color..." }).click();
    const sessionColorPanel = page.getByRole("dialog", { name: "Session color panel" });
    await page.getByLabel("RGB session tab color value").fill("rgb(255 255 255)");
    await sessionColorPanel.getByRole("button", { name: "Close preferences" }).click();
    await expect.poll(() => readStoredNote(userDataDirectory, "alpha").theme?.tabTextColor)
      .toBe("#ffffff");
    expect(await readWindowTitles(electronApp))
      .toEqual([{ noteId: "beta", title: "Beta renamed" }]);

    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(() => readWindowTitles(electronApp)).toEqual([
      { noteId: "alpha", title: "Alpha" },
      { noteId: "beta", title: "Beta renamed" },
    ]);
  } finally {
    await electronApp.close();
  }

  electronApp = await launchApp(userDataDirectory);
  try {
    await expect.poll(() => readWindowTitles(electronApp)).toEqual([
      { noteId: "alpha", title: "Alpha" },
      { noteId: "beta", title: "Beta renamed" },
    ]);
  } finally {
    await electronApp.close();
  }
});

// Cmd/Ctrl+S saves versions in a sticky window too, so its actions open the history, which has to
// fit a sticky window at its minimum size.
test("Electron opens version history from a minimum-size sticky window", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "alpha", title: "Alpha", markdown: "alpha body", createdAt: 1, updatedAt: 1 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    // With one note, the tabs window becomes Alpha's sticky window.
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("alpha body");
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-layout-mode", "sticky");
    await electronApp.browserWindow(page).then((window) =>
      window.evaluate((browserWindow) => browserWindow.setBounds({ width: 320, height: 260 })));
    await expect.poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]))
      .toEqual([320, 260]);

    await page.locator(".bn-editor").getByText("alpha body").click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" sticky snapshot");
    await page.keyboard.press(modifierShortcut("S"));
    await expect(page.locator(".sticky-toast-success")).toHaveText("Saved");

    await openStickyActionBar(page);
    const historyButton = page.getByRole("button", { name: "Version history" });
    await expect(historyButton).toBeInViewport({ ratio: 1 });
    await historyButton.click();
    const history = page.getByRole("dialog", { name: "Version history" });
    await expect(history).toContainText("Saved manually");
    await expect(history.locator(".version-history-preview"))
      .toContainText("alpha body sticky snapshot");

    // The whole panel shows, below the header band where the native window buttons sit.
    await expect(history).toBeInViewport({ ratio: 1 });
    const headerBottom = await page.getByTestId("sticky-header")
      .evaluate((header) => header.getBoundingClientRect().bottom);
    expect((await history.boundingBox()).y).toBeGreaterThanOrEqual(headerBottom);
    for (const control of [
      history.getByRole("button", { name: "Close version history" }),
      history.getByRole("button", { name: /Saved manually/ }),
      history.getByRole("button", { name: "Restore this version" }),
    ]) {
      await expect(control).toBeInViewport({ ratio: 1 });
    }
    await expect(history.locator(".version-history-preview .bn-editor"))
      .toBeInViewport({ ratio: 0.2 });

    await history.getByRole("button", { name: "Close version history" }).click();
    await expect(history).toHaveCount(0);
  } finally {
    await electronApp.close();
  }
});

test("Electron moves a sticky window when dragging its header", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();

    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect(page.getByTestId("sticky-shell")).toHaveAttribute(
      "data-layout-mode",
      "sticky",
    );

    const header = page.getByTestId("sticky-header");
    await expect(header).toBeVisible();

    const beforeBounds = await getFirstWindowBounds(electronApp);
    const headerBox = await header.boundingBox();
    const dragStartX = headerBox.x + 96;
    const dragStartY = headerBox.y + headerBox.height / 2;
    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(
      dragStartX + 72,
      dragStartY + 36,
      { steps: 6 },
    );
    await page.mouse.up();

    await expect.poll(async () => {
      const nextBounds = await getFirstWindowBounds(electronApp);
      return (
        nextBounds.x - beforeBounds.x >= 40 &&
        nextBounds.y - beforeBounds.y >= 20
      );
    }).toBe(true);
  } finally {
    await electronApp.close();
  }
});

// The packaged renderer runs from file://, where fetch() of a file beside the page fails and the CSP
// governs WebAssembly. One code block per WebAssembly formatter, each loading its module its own
// way: a fetched data: URL (clang-format), Vite's ?init helper (ruff, StyLua, shfmt, tex-fmt), and
// a brotli-compressed artifact expanded by brotli-dec-wasm (rustfmt, swift-format, Syntax Tree).
test("prettifies WebAssembly-formatted code blocks in the built app", async () => {
  const cases = [
    { language: "c", label: "C", input: "int main(){return 0;}", output: "int main() { return 0; }" },
    {
      language: "python",
      label: "Python",
      input: "result={'value':42}",
      output: "result = {\"value\": 42}",
    },
    { language: "lua", label: "Lua", input: "local x={1,2}", output: "local x = { 1, 2 }" },
    { language: "shellscript", label: "Shell", input: "if true;then echo hi;fi", output: "if true; then echo hi; fi" },
    {
      language: "latex",
      label: "LaTeX",
      input: "\\begin{itemize}\n\\item a\n\\end{itemize}",
      output: "\\begin{itemize}\n  \\item a\n\\end{itemize}",
    },
    { language: "rust", label: "Rust", input: "fn main(){let x=1;}", output: "fn main() {\n    let x = 1;\n}" },
    { language: "swift", label: "Swift", input: "let x=[1,2]", output: "let x = [1, 2]" },
    { language: "ruby", label: "Ruby", input: "def f(a,b) a+b end", output: "def f(a, b)\n  a + b\nend" },
  ];
  const userDataDirectory = createTemporaryDirectory("notepane-code-format-");
  writeInitialNotes(userDataDirectory, [{
    id: "code-note",
    title: "Code note",
    blocksJSON: JSON.stringify(cases.map(({ language, input }) => ({
      id: `code-${language}`,
      type: "codeBlock",
      props: { language },
      content: [{ type: "text", text: input, styles: {} }],
      children: [],
    }))),
    createdAt: 1,
    updatedAt: 1,
  }]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    expect(new URL(page.url()).protocol).toBe("file:");
    // WebAssembly compilation is the one thing script-src adds to 'self'.
    const scriptSource = await page.evaluate(() =>
      document.querySelector('meta[http-equiv="Content-Security-Policy"]').getAttribute("content")
        .split(";").map((directive) => directive.trim()).find((directive) => directive.startsWith("script-src")));
    expect(scriptSource).toBe("script-src 'self' 'wasm-unsafe-eval'");
    await expect(page.locator("[data-content-type='codeBlock']")).toHaveCount(cases.length);
    for (const { language, label, output } of cases) {
      const codeBlock = page.locator(`.bn-block-outer[data-id='code-${language}'] [data-content-type='codeBlock']`);
      await codeBlock.hover();
      const toolbar = page.getByRole("toolbar", { name: `${label} code block actions`, exact: true });
      await toolbar.getByRole("button", { name: `Prettify ${label} code`, exact: true }).click();
      await expect(toolbar.getByRole("button", { name: `${label} code prettified`, exact: true }))
        .toHaveText("Formatted");
      expect(await codeBlock.locator("code").evaluate((code) => code.textContent)).toBe(output);
    }
  } finally {
    await electronApp.close();
  }
});

async function launchApp(userDataDirectory, exportDirectory, extraEnvironment = {}) {
  return electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      BLOCKNOTE_STICKY_USER_DATA_DIR: userDataDirectory,
      BLOCKNOTE_STICKY_QUIET: "1",
      ...(exportDirectory
        ? { BLOCKNOTE_STICKY_EXPORT_DIR: exportDirectory }
        : {}),
      ...extraEnvironment,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
  });
}

function writePortableBackup(filePath, data) {
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        format: "notepane-backup",
        version: 1,
        exportedAt: "2026-08-04T08:30:00.000Z",
        app: { name: "NotePane", version: "0.1.0" },
        data: {
          appTheme: data.appTheme,
          layoutMode: data.layoutMode,
          editorPreferences: {},
          notes: data.notes,
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

test("duplicates a session and opens one in its own sticky window from the tab menu", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-tab-menu-");
  const notesPath = path.join(userDataDirectory, "notes.json");
  writeInitialNotes(userDataDirectory, [
    {
      id: "alpha-note",
      title: "Alpha",
      blocksJSON: JSON.stringify([{
        id: "alpha-block",
        type: "paragraph",
        props: { textColor: "default", backgroundColor: "default", textAlignment: "left" },
        content: [{ type: "text", text: "alpha body", styles: {} }],
        children: [],
      }]),
      markdown: "alpha body",
      createdAt: 1,
      updatedAt: 1,
    },
    { id: "beta-note", title: "Beta", createdAt: 2, updatedAt: 2 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    const editorSurface = page.getByTestId("sticky-editor-surface");
    await expect(editorSurface).toContainText("alpha body");
    const tabs = page.getByRole("tab");
    const sourceTitle = (await tabs.first().textContent()).trim();
    const copyTab = page.getByRole("tab", { name: `${sourceTitle} copy`, exact: true });

    await page.locator(".session-tab-row").first().click({ button: "right" });
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(tabs).toHaveCount(3);
    await expect(copyTab).toHaveAttribute("aria-selected", "true");
    await expect(editorSurface).toContainText("alpha body");
    await expect.poll(() => {
      const stored = JSON.parse(fs.readFileSync(notesPath, "utf8")).notes
        .find((note) => note.title === `${sourceTitle} copy`);
      return stored?.blocksJSON ?? "";
    }).toContain("alpha body");

    // The copy is the open note, so the tabs window moves off it before its sticky window opens.
    const stickyWindowPromise = electronApp.waitForEvent("window");
    await page.locator(".session-tab-row").nth(2).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Open as sticky" }).click();
    const stickyPage = await stickyWindowPromise;
    await expect(stickyPage.getByTestId("sticky-shell")).toHaveAttribute("data-layout-mode", "sticky");
    await expect(stickyPage.getByTestId("sticky-editor-surface")).toContainText("alpha body");
    await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-layout-mode", "tabs");
    await expect(copyTab).toHaveAttribute("aria-selected", "false");
    expect(JSON.parse(fs.readFileSync(notesPath, "utf8")).layoutMode).toBe("tabs");

    // Its tab brings the sticky window forward instead of opening the note in a second editor.
    await copyTab.click();
    await expect(copyTab).toHaveAttribute("aria-selected", "false");

    // Switching the sticky window to tabs puts the note back into the tabs window.
    await stickyPage.getByRole("button", { name: "Show sticky actions" }).click();
    await stickyPage.getByRole("button", { name: "Switch to Tab sessions mode" }).click();
    await expect.poll(() => electronApp.windows().length).toBe(1);
    await expect(copyTab).toHaveAttribute("aria-selected", "true");
    expect(JSON.parse(fs.readFileSync(notesPath, "utf8")).layoutMode).toBe("tabs");
  } finally {
    await electronApp.close();
  }
});

function writeInitialNotes(userDataDirectory, notes) {
  fs.mkdirSync(userDataDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDirectory, "notes.json"),
    JSON.stringify(
      {
        version: 3,
        appTheme: { themeId: "notepane-light", mode: "light" },
        layoutMode: "tabs",
        notes: notes.map((note, index) => ({
          id: note.id,
          title: note.title,
          blocksJSON: note.blocksJSON ?? null,
          markdown: note.markdown ?? "",
          bounds: {
            x: 80 + index * 24,
            y: 80 + index * 24,
            width: 960,
            height: 720,
          },
          theme: note.theme,
          seedDemoContent: Boolean(note.seedDemoContent),
          alwaysOnTop: false,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
}

function getStoredTrashState(userDataDirectory) {
  const state = JSON.parse(
    fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8"),
  );
  return {
    activeNoteIds: state.notes
      .filter((note) => !note.trashedAt)
      .map((note) => note.id),
    trashedNoteIds: state.notes
      .filter((note) => note.trashedAt)
      .map((note) => note.id),
  };
}

async function getStickyPageByNoteId(electronApp, noteId) {
  await expect.poll(async () => {
    const pages = getOpenPages(electronApp);
    const noteIds = await Promise.all(
      pages.map((page) => getPageNoteId(page)),
    );
    return noteIds.includes(noteId);
  }).toBe(true);

  for (const page of getOpenPages(electronApp)) {
    if (await getPageNoteId(page) === noteId) {
      return page;
    }
  }

  throw new Error(`Sticky page not found: ${noteId}`);
}

// Finds a page by the note its window shows now. A tabs window that becomes a sticky window keeps
// the note id of the URL it first loaded, so getStickyPageByNoteId cannot find it.
async function getPageBoundToNote(electronApp, noteId) {
  let match = null;
  await expect.poll(async () => {
    const pages = getOpenPages(electronApp);
    const noteIds = await Promise.all(
      pages.map((page) => getCurrentPageNoteId(page).catch(() => null)),
    );
    match = pages[noteIds.indexOf(noteId)] ?? null;
    return match !== null;
  }).toBe(true);
  return match;
}

// The note each open window shows now and whether it floats on top, ordered by note id. It reads
// through the pages: script run in a window that is closing never returns, while a closing page
// rejects and reads as null.
async function readWindowPins(electronApp) {
  const pins = await Promise.all(getOpenPages(electronApp).map(async (page) => ({
    noteId: await getCurrentPageNoteId(page).catch(() => null),
    alwaysOnTop: await electronApp.browserWindow(page)
      .then((window) => window.evaluate((browserWindow) => browserWindow.isAlwaysOnTop()))
      .catch(() => null),
  })));
  return pins.sort((a, b) => String(a.noteId).localeCompare(String(b.noteId)));
}

// The note each open window shows now and its native title, ordered by note id.
async function readWindowTitles(electronApp) {
  const titles = await Promise.all(getOpenPages(electronApp).map(async (page) => ({
    noteId: await getCurrentPageNoteId(page).catch(() => null),
    title: await electronApp.browserWindow(page)
      .then((window) => window.evaluate((browserWindow) => browserWindow.getTitle()))
      .catch(() => null),
  })));
  return titles.sort((a, b) => String(a.noteId).localeCompare(String(b.noteId)));
}

function readStoredNote(userDataDirectory, noteId) {
  const state = JSON.parse(
    fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8"),
  );
  return state.notes.find((note) => note.id === noteId);
}

function readStoredPins(userDataDirectory) {
  const state = JSON.parse(
    fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8"),
  );
  return {
    tabsWindow: state.tabsWindow?.alwaysOnTop ?? null,
    notes: Object.fromEntries(state.notes.map((note) => [note.id, note.alwaysOnTop])),
  };
}

function readAllWindowBounds(electronApp) {
  return electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => window.getBounds()));
}

// Runs `read` on every open page, skipping pages that close while being read
// and results that are null.
async function readOpenPages(electronApp, read) {
  const results = [];
  for (const page of getOpenPages(electronApp)) {
    const result = await read(page).catch(() => null);
    if (result !== null && result !== undefined) {
      results.push(result);
    }
  }
  return results;
}

function getOpenPages(electronApp) {
  return electronApp.windows().filter((page) => !page.isClosed());
}

async function openStickySettings(page) {
  await page.bringToFront();
  await openStickyActionBar(page);
  await page.getByRole("button", { name: "Sticky settings" }).click();
  const settingsPanel = page.getByRole("dialog", { name: "Sticky settings window" });
  await expect(settingsPanel).toBeVisible();
  return settingsPanel;
}

async function openStickyActionBar(page) {
  const actionToggle = page.locator(".sticky-header-action-preview");
  if ((await actionToggle.getAttribute("aria-expanded")) !== "true") {
    await actionToggle.click();
  }
  await expect(actionToggle).toHaveAttribute("aria-expanded", "true");
}

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

async function getCurrentPageNoteId(page) {
  return await page.evaluate(async () => {
    return await window.blocknoteSticky.getCurrentNoteId();
  });
}

async function getPageNoteId(page) {
  if (!page || page.isClosed()) {
    return null;
  }

  try {
    return new URL(page.url()).searchParams.get("noteId");
  } catch {
    return null;
  }
}

async function getShellBackground(page) {
  return await page.evaluate(() => {
    const shell = document.querySelector("[data-testid='sticky-shell']");
    return shell ? getComputedStyle(shell).backgroundColor : null;
  });
}

async function clickMenuItem(electronApp, label) {
  await electronApp.evaluate(({ Menu }, targetLabel) => {
    const menu = Menu.getApplicationMenu();
    const item = findMenuItem(menu, targetLabel);
    if (!item) {
      throw new Error(`Menu item not found: ${targetLabel}`);
    }
    item.click();

    function findMenuItem(menuOrSubmenu, labelToFind) {
      for (const item of menuOrSubmenu.items) {
        if (item.label === labelToFind) {
          return item;
        }
        if (item.submenu) {
          const nested = findMenuItem(item.submenu, labelToFind);
          if (nested) {
            return nested;
          }
        }
      }
      return null;
    }
  }, label);
}

async function isMenuItemEnabled(electronApp, label) {
  return electronApp.evaluate(({ Menu }, targetLabel) => {
    const findMenuItem = (menu) => {
      for (const item of menu.items) {
        if (item.label === targetLabel) {
          return item;
        }
        const nested = item.submenu ? findMenuItem(item.submenu) : null;
        if (nested) {
          return nested;
        }
      }
      return null;
    };
    const item = findMenuItem(Menu.getApplicationMenu());
    if (!item) {
      throw new Error(`Menu item not found: ${targetLabel}`);
    }
    return item.enabled;
  }, label);
}

async function chooseBlankSessionTemplate(page) {
  const templateDialog = page.getByRole("dialog", { name: "Create new session" });
  await expect(templateDialog).toHaveCount(0);
}

function modifierShortcut(key) {
  return `${process.platform === "darwin" ? "Meta" : "Control"}+${key}`;
}

// Chooses a theme as a user does: Preferences through its shortcut in a tabs window (a sticky
// window does not open it), the theme's card in General, then Close.
async function chooseAppTheme(page, themeId) {
  await page.bringToFront();
  await page.keyboard.press(modifierShortcut(","));
  const preferences = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferences).toBeVisible();
  await preferences.getByTestId(`theme-card-${themeId}`).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme-id", themeId);
  await preferences.getByRole("button", { name: "Close preferences" }).click();
  await expect(preferences).toHaveCount(0);
}

function readStoredAppTheme(userDataDirectory) {
  try {
    return JSON.parse(fs.readFileSync(path.join(userDataDirectory, "notes.json"), "utf8")).appTheme;
  } catch {
    return null;
  }
}

async function readRootToken(page, name) {
  return await page.evaluate(
    (token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(),
    name,
  );
}

// Reloads the window with a script that records the root at DOMContentLoaded: after the entry
// script has applied the first theme, before React has asked the main process for the stored one.
async function reloadAndReadFirstPaintTheme(page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const root = document.documentElement;
      window.__notepaneThemeAtDomContentLoaded = {
        themeId: root.dataset.themeId ?? null,
        shellBackground: getComputedStyle(root).getPropertyValue("--sticky-shell-bg").trim(),
      };
    });
  });
  await page.reload();
  await expect.poll(() =>
    page.evaluate(() => window.__notepaneThemeAtDomContentLoaded ?? null),
  ).not.toBeNull();
  return await page.evaluate(() => window.__notepaneThemeAtDomContentLoaded);
}

// One frame after its editor mounts, a window puts the caret in the last block (StickyEditor's
// focusLastEditorBlock effect), which replaces any selection made before it. In these notes the
// last block is empty, so its placeholder marks that the caret has landed.
async function expectStartupCaretPlaced(page) {
  await expect(page.locator(".bn-editor [data-is-empty-and-focused]")).toHaveCount(1);
}

// Selects the first word of `paragraphText` so BlockNote shows the formatting toolbar, which
// NotePane portals into body (the portal root a sticky window copies its note colours onto), and
// reads the toolbar's background and colour scheme once colour transitions have finished.
//
// The word is selected through the editor (Tiptap keeps itself on its DOM node as `editor`), so
// ProseMirror's selection and the DOM's agree at once. A mouse selection is not: 20 ms after the
// editor gains focus, which bringing a window to the front or a reload causes, ProseMirror writes
// its own selection back to the DOM if it has not read the DOM's yet, undoing a double-click.
async function readFormattingToolbar(page, paragraphText) {
  await page.bringToFront();
  await page.locator(".bn-editor").evaluate((editorElement, text) => {
    const paragraph = [...editorElement.querySelectorAll(".bn-inline-content")]
      .find((element) => element.textContent === text);
    const { editor } = editorElement;
    const from = editor.view.posAtDOM(paragraph, 0);
    editor.view.focus();
    editor.commands.setTextSelection({ from, to: from + text.split(" ")[0].length });
  }, paragraphText);
  const toolbar = page.locator(".bn-formatting-toolbar.notepane-formatting-toolbar:visible");
  await expect(toolbar).toBeVisible();
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => !(animation instanceof CSSTransition)),
  );
  return await toolbar.evaluate((element) => ({
    // Outside the React root, so it is the portalled copy that is being read.
    portalled: element.closest("#root") === null,
    background: getComputedStyle(element).backgroundColor,
    colorScheme: getComputedStyle(element).colorScheme,
  }));
}
