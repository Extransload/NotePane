import { _electron as electron, expect, test } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
    await page.keyboard.press(modifierShortcut("Shift+L"));
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
    expect(persistedState.appTheme.mode).toBe("dark");
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
        detached: false,
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
        detached: false,
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
    expect(restoredState.appTheme.mode).toBe("dark");
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

test("Electron keeps the tabs window on its session while a detached note is edited", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    {
      id: "first-note",
      title: "First note",
      markdown: "first docked body",
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: "second-note",
      // The default title keeps the title derived from the first line.
      title: "Untitled",
      markdown: "second detached body",
      createdAt: 2,
      updatedAt: 2,
    },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const tabsPage = await electronApp.firstWindow();
    const tabsEditor = tabsPage.getByTestId("sticky-editor-surface");
    await expect(tabsEditor).toContainText("first docked body");

    await tabsPage.evaluate(() => window.blocknoteSticky.detachNote("second-note"));
    const detachedPage = await getStickyPageByNoteId(electronApp, "second-note");
    const detachedEditor = detachedPage.getByTestId("sticky-editor-surface");
    await expect(detachedEditor).toContainText("second detached body");

    // Editing the first line renames the detached note, which broadcasts the
    // updated note to every window.
    await detachedPage.bringToFront();
    await detachedEditor.getByText("second detached body").click();
    await detachedPage.keyboard.press("End");
    await detachedPage.keyboard.insertText(" edited");
    await expect.poll(async () => {
      const notes = await tabsPage.evaluate(() => window.blocknoteSticky.listNotes());
      return notes.find((note) => note.id === "second-note")?.title;
    }).toBe("second detached body edited");

    await expect.poll(() => getCurrentPageNoteId(tabsPage)).toBe("first-note");
    await expect(tabsEditor).toContainText("first docked body");
    await expect(tabsEditor).not.toContainText("second detached body");
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
    await page.keyboard.press("Escape");
    await expect(closeDialog).toHaveCount(0);

    await page.keyboard.press(modifierShortcut("W"));
    await expect(closeDialog).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(closeDialog).toHaveCount(0);
    await expect(page.locator(".sticky-toast-success")).toContainText("closed");
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
    await firstStickyPage.waitForTimeout(450);

    await expect.poll(() => getShellBackground(firstStickyPage))
      .toBe("rgb(234, 220, 255)");
    await expect.poll(() => getShellBackground(secondStickyPage))
      .not.toBe("rgb(234, 220, 255)");
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

function writeInitialNotes(userDataDirectory, notes) {
  fs.mkdirSync(userDataDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(userDataDirectory, "notes.json"),
    JSON.stringify(
      {
        version: 3,
        appTheme: { mode: "light" },
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
          detached: false,
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

async function chooseBlankSessionTemplate(page) {
  const templateDialog = page.getByRole("dialog", { name: "Create new session" });
  await expect(templateDialog).toHaveCount(0);
}

function modifierShortcut(key) {
  return `${process.platform === "darwin" ? "Meta" : "Control"}+${key}`;
}
