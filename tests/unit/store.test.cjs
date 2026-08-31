const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  StickyStore,
  NOTE_PANE_BACKUP_FORMAT,
  NOTE_PANE_BACKUP_VERSION,
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
} = require("../../electron/store.cjs");

test("creates, saves, and reloads a local note", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);
  const note = store.createNote({ width: 900, height: 700 });

  store.updateContent({
    noteId: note.id,
    blocksJSON: JSON.stringify([{ type: "paragraph", content: "Saved" }]),
    markdown: "Saved",
  });
  store.updateBounds(note.id, { x: 25, y: 50, width: 1000, height: 800 });
  store.updateAppearance(note.id, {
    title: "  Project note  ",
    titleManuallyEdited: true,
    theme: {
      mode: "dark",
      tabBackgroundColor: "#B9E4FF",
      tabTextColor: "#111111",
      tabTextOpacity: 0.42,
    },
  });
  store.updateAppTheme({ mode: "dark" });
  store.setAlwaysOnTop(note.id, false);

  const reloadedStore = new StickyStore(directory);
  const reloaded = reloadedStore.getNote(note.id);

  assert.equal(reloaded.title, "Project note");
  assert.equal(reloaded.titleManuallyEdited, true);
  assert.equal(reloaded.markdown, "Saved");
  assert.match(reloaded.blocksJSON, /Saved/);
  assert.deepEqual(reloaded.bounds, { x: 25, y: 50, width: 1000, height: 800 });
  assert.deepEqual(reloaded.theme, {
    tabTextColor: "#111111",
    tabTextOpacity: 0.42,
  });
  assert.deepEqual(reloadedStore.getAppTheme(), {
    mode: "dark",
  });
  assert.equal(reloadedStore.getLayoutMode(), "tabs");
  assert.equal(reloaded.alwaysOnTop, false);
  assert.equal(reloaded.detached, false);
  assert.equal(reloaded.seedDemoContent, false);
});

test("stores, reloads, and restores note versions", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);
  const note = store.createNote({ width: 900, height: 700 });

  store.updateContent({
    noteId: note.id,
    blocksJSON: JSON.stringify([{ type: "paragraph", content: "First" }]),
    markdown: "First",
  });
  const first = store.createNoteVersion(note.id, { source: "manual" });
  store.updateContent({
    noteId: note.id,
    blocksJSON: JSON.stringify([{ type: "paragraph", content: "Second" }]),
    markdown: "Second",
  });
  const second = store.createNoteVersion(note.id, { source: "manual" });

  assert.equal(store.createNoteVersion(note.id).id, second.id);
  const reloadedVersions = new StickyStore(directory).listNoteVersions(note.id);
  assert.deepEqual(reloadedVersions.slice(0, 2).map((item) => item.id), [second.id, first.id]);
  assert.deepEqual(reloadedVersions.slice(0, 2).map((item) => item.source), ["manual", "manual"]);

  const restored = store.restoreNoteVersion(note.id, first.id);
  assert.match(restored.blocksJSON, /First/);
  assert.match(new StickyStore(directory).getNote(note.id).blocksJSON, /First/);
  assert.equal(store.listNoteVersions(note.id).length, 3);
  assert.equal(store.listNoteVersions(note.id).at(-1).source, "auto");
});

test("creates a note with an optional initial theme", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);
  const note = store.createNote(
    { width: 900, height: 700 },
    {
      theme: {
        tabTextColor: "#ffd7e8",
        tabTextOpacity: 1,
      },
    },
  );

  assert.deepEqual(note.theme, {
    tabTextColor: "#ffd7e8",
    tabTextOpacity: 1,
  });
  assert.deepEqual(new StickyStore(directory).getNote(note.id).theme, {
    tabTextColor: "#ffd7e8",
    tabTextOpacity: 1,
  });
});

test("creates an applied default template when requested", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);
  const note = store.createNote(
    { width: 900, height: 700 },
    { template: "default" },
  );

  assert.equal(note.title, "NotePane");
  assert.equal(note.seedDemoContent, false);
  assert.match(note.blocksJSON, /Launch checklist/);

  const reloaded = new StickyStore(directory).getNote(note.id);
  assert.equal(reloaded.title, "NotePane");
  assert.equal(reloaded.seedDemoContent, false);
  assert.match(reloaded.blocksJSON, /Workspace modes/);
});

test("marks only explicitly seeded notes for demo content", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);
  const initialNote = store.createNote(
    { width: 900, height: 700 },
    { seedDemoContent: true },
  );
  const laterNote = store.createNote({ width: 900, height: 700 });

  assert.equal(initialNote.seedDemoContent, true);
  assert.equal(laterNote.seedDemoContent, false);
  assert.equal(store.getNote(initialNote.id).seedDemoContent, true);
  assert.equal(store.getNote(laterNote.id).seedDemoContent, false);

  store.updateContent({
    noteId: initialNote.id,
    blocksJSON: JSON.stringify([{ type: "paragraph", content: "Edited" }]),
    markdown: "Edited",
  });

  assert.equal(store.getNote(initialNote.id).seedDemoContent, false);
});

test("reorders notes without changing creation timestamps", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);
  const firstNote = store.createNote({ width: 900, height: 700 });
  const secondNote = store.createNote({ width: 900, height: 700 });
  const thirdNote = store.createNote({ width: 900, height: 700 });

  const originalCreatedAt = new Map(
    store.listNotes().map((note) => [note.id, note.createdAt]),
  );
  const reordered = store.reorderNotes([
    thirdNote.id,
    firstNote.id,
    secondNote.id,
  ]);

  assert.deepEqual(reordered.notes.map((note) => note.id), [
    thirdNote.id,
    firstNote.id,
    secondNote.id,
  ]);
  assert.deepEqual(new StickyStore(directory).listNotes().map((note) => note.id), [
    thirdNote.id,
    firstNote.id,
    secondNote.id,
  ]);
  assert.deepEqual(
    new StickyStore(directory).listNotes().map((note) => note.createdAt),
    [thirdNote.id, firstNote.id, secondNote.id].map((noteId) =>
      originalCreatedAt.get(noteId),
    ),
  );
});

test("normalizes invalid blocks JSON and clamps window bounds", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);
  const note = store.createNote({ width: 10, height: 10 });

  assert.equal(note.bounds.width, 320);
  assert.equal(note.bounds.height, 260);

  store.updateContent({
    noteId: note.id,
    blocksJSON: "not-json",
    markdown: "Fallback",
  });

  assert.equal(store.getNote(note.id).blocksJSON, null);
  assert.equal(store.getNote(note.id).markdown, "Fallback");

  store.updateAppearance(note.id, {
    title: "",
    theme: {
      mode: "solarized",
      tabBackgroundColor: "yellow",
      tabTextColor: "black",
      tabTextOpacity: 5,
    },
  });

  assert.equal(store.getNote(note.id).title, "Fallback");
  assert.equal(store.getNote(note.id).titleManuallyEdited, false);
  assert.deepEqual(store.getNote(note.id).theme, {
    tabTextColor: null,
    tabTextOpacity: 1,
  });

  store.updateAppTheme({ mode: "solarized" });
  assert.deepEqual(store.getAppTheme(), {
    mode: "light",
  });
});

test("derives note titles from content until the title is manually edited", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);
  const note = store.createNote({ width: 900, height: 700 });
  const longTitle = "Automatic title should be sliced after the configured title length";

  assert.equal(note.title, "Untitled");
  assert.equal(note.titleManuallyEdited, false);

  store.updateContent({
    noteId: note.id,
    blocksJSON: JSON.stringify([
      { type: "paragraph" },
      { type: "heading", content: longTitle },
    ]),
    markdown: "",
  });
  assert.equal(store.getNote(note.id).title, longTitle.slice(0, 48));

  store.updateContent({
    noteId: note.id,
    blocksJSON: JSON.stringify([{ type: "paragraph" }]),
    markdown: "",
  });
  assert.equal(store.getNote(note.id).title, "Untitled");

  store.updateAppearance(note.id, {
    title: "Manual title",
    titleManuallyEdited: true,
    theme: {},
  });
  store.updateContent({
    noteId: note.id,
    blocksJSON: JSON.stringify([{ type: "paragraph", content: "Changed body" }]),
    markdown: "Changed body",
  });
  assert.equal(store.getNote(note.id).title, "Manual title");
  assert.equal(store.getNote(note.id).titleManuallyEdited, true);

  store.updateAppearance(note.id, {
    title: "   ",
    titleManuallyEdited: true,
    theme: {},
  });
  assert.equal(store.getNote(note.id).title, "Manual title");
});

test("updates the global app theme from dark back to light", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);

  assert.deepEqual(store.updateAppTheme({ mode: "dark" }), {
    mode: "dark",
  });
  assert.deepEqual(store.updateAppTheme({ mode: "light" }), {
    mode: "light",
  });

  const reloadedStore = new StickyStore(directory);

  assert.deepEqual(reloadedStore.getAppTheme(), {
    mode: "light",
  });
});

test("updates and persists the global layout mode", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);

  assert.equal(store.getLayoutMode(), "tabs");
  assert.equal(store.updateLayoutMode("sticky"), "sticky");
  assert.equal(store.updateLayoutMode("invalid"), "sticky");
  assert.equal(store.updateLayoutMode("tabs"), "tabs");

  const reloadedStore = new StickyStore(directory);

  assert.equal(reloadedStore.getLayoutMode(), "tabs");
});

test("detaches and reattaches notes for tab/window workflows", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);
  const note = store.createNote({ width: 900, height: 700 });

  assert.equal(note.detached, false);
  assert.equal(store.setDetached(note.id, true).detached, true);
  assert.equal(new StickyStore(directory).getNote(note.id).detached, true);
  assert.equal(store.setDetached(note.id, false).detached, false);
});

test("keeps editor typography global instead of updating per note appearance", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);
  const firstNote = store.createNote({ width: 900, height: 700 });
  const secondNote = store.createNote({ width: 900, height: 700 });

  assert.equal(firstNote.editorFontScale, 1);
  assert.equal(secondNote.editorFontScale, 1);
  assert.equal(firstNote.editorFontFamily, "system");
  assert.equal(secondNote.editorFontFamily, "system");

  store.updateAppearance(firstNote.id, {
    editorFontScale: 9,
    editorFontFamily: "local:Pretendard",
  });
  store.updateAppearance(secondNote.id, {
    editorFontScale: 0.38,
    editorFontFamily: "garamond",
  });

  const reloadedStore = new StickyStore(directory);

  assert.equal(reloadedStore.getNote(firstNote.id).editorFontScale, 1);
  assert.equal(reloadedStore.getNote(secondNote.id).editorFontScale, 1);
  assert.equal(reloadedStore.getNote(firstNote.id).editorFontFamily, "system");
  assert.equal(reloadedStore.getNote(secondNote.id).editorFontFamily, "system");
});

test("updates editor preferences and applies them to new notes", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);

  assert.deepEqual(store.getEditorPreferences(), {
    editorFontScale: 1,
    editorFontFamily: "system",
    appFontFamily: "inter",
    showTableOfContents: false,
    keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
    keyboardShortcutEnabled: DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
  });

  const keyboardShortcuts = {
    ...DEFAULT_KEYBOARD_SHORTCUTS,
    focusEditor: "Mod+Shift+F",
    toggleSidebar: "Mod+Shift+B",
  };
  const keyboardShortcutEnabled = {
    ...DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
    exportPdf: false,
    selectTabByNumber: false,
  };

  assert.deepEqual(store.updateEditorPreferences({
    editorFontScale: 1.5,
    editorFontFamily: "local:Pretendard",
    appFontFamily: "garamond",
    showTableOfContents: true,
    keyboardShortcuts,
    keyboardShortcutEnabled,
  }), {
    editorFontScale: 1.5,
    editorFontFamily: "local:Pretendard",
    appFontFamily: "garamond",
    showTableOfContents: true,
    keyboardShortcuts,
    keyboardShortcutEnabled,
  });

  const note = store.createNote({ width: 900, height: 700 });
  assert.equal(note.editorFontScale, 1.5);
  assert.equal(note.editorFontFamily, "local:Pretendard");

  const reloadedStore = new StickyStore(directory);
  assert.deepEqual(reloadedStore.getEditorPreferences(), {
    editorFontScale: 1.5,
    editorFontFamily: "local:Pretendard",
    appFontFamily: "garamond",
    showTableOfContents: true,
    keyboardShortcuts,
    keyboardShortcutEnabled,
  });
});

test("migrates legacy default sidebar shortcut away from Mod+B", () => {
  const legacyDirectory = createTemporaryDirectory();
  fs.mkdirSync(legacyDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(legacyDirectory, "notes.json"),
    JSON.stringify({
      version: 7,
      editorPreferences: {
        editorFontScale: 1,
        editorFontFamily: "system",
        showTableOfContents: false,
        keyboardShortcuts: {
          ...DEFAULT_KEYBOARD_SHORTCUTS,
          focusEditor: "Mod+Shift+F",
          toggleSidebar: "Mod+B",
        },
      },
      notes: [],
    }),
    "utf8",
  );

  const legacyStore = new StickyStore(legacyDirectory);
  const legacyShortcuts = legacyStore.getEditorPreferences().keyboardShortcuts;
  assert.equal(legacyShortcuts.focusEditor, "Mod+Shift+F");
  assert.equal(legacyShortcuts.toggleSidebar, "Mod+Shift+B");

  const currentDirectory = createTemporaryDirectory();
  fs.mkdirSync(currentDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(currentDirectory, "notes.json"),
    JSON.stringify({
      version: 8,
      editorPreferences: {
        editorFontScale: 1,
        editorFontFamily: "system",
        showTableOfContents: false,
        keyboardShortcuts: {
          ...DEFAULT_KEYBOARD_SHORTCUTS,
          toggleSidebar: "Mod+B",
        },
      },
      notes: [],
    }),
    "utf8",
  );

  const currentStore = new StickyStore(currentDirectory);
  assert.equal(
    currentStore.getEditorPreferences().keyboardShortcuts.toggleSidebar,
    "Mod+B",
  );
});

test("migrates legacy default tab move shortcuts away from arrows", () => {
  const directory = createTemporaryDirectory();
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "notes.json"),
    JSON.stringify({
      version: 9,
      editorPreferences: {
        editorFontScale: 1,
        editorFontFamily: "system",
        showTableOfContents: false,
        keyboardShortcuts: {
          ...DEFAULT_KEYBOARD_SHORTCUTS,
          moveTabLeft: "Mod+Shift+ArrowLeft",
          moveTabRight: "Mod+Shift+ArrowRight",
        },
      },
      notes: [],
    }),
    "utf8",
  );

  const store = new StickyStore(directory);
  const shortcuts = store.getEditorPreferences().keyboardShortcuts;
  assert.equal(shortcuts.moveTabLeft, "Mod+Shift+[");
  assert.equal(shortcuts.moveTabRight, "Mod+Shift+]");
  assert.deepEqual(
    store.getEditorPreferences().keyboardShortcutEnabled,
    DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
  );
});

test("migrates the legacy default layout mode shortcut away from Mod+Shift+M", () => {
  const legacyDirectory = createTemporaryDirectory();
  fs.mkdirSync(legacyDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(legacyDirectory, "notes.json"),
    JSON.stringify({
      version: 10,
      editorPreferences: {
        keyboardShortcuts: {
          ...DEFAULT_KEYBOARD_SHORTCUTS,
          toggleLayoutMode: "Mod+Shift+M",
        },
      },
      notes: [],
    }),
    "utf8",
  );

  const legacyStore = new StickyStore(legacyDirectory);
  assert.equal(
    legacyStore.getEditorPreferences().keyboardShortcuts.toggleLayoutMode,
    "Mod+Shift+T",
  );

  const currentDirectory = createTemporaryDirectory();
  fs.mkdirSync(currentDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(currentDirectory, "notes.json"),
    JSON.stringify({
      version: 11,
      editorPreferences: {
        keyboardShortcuts: {
          ...DEFAULT_KEYBOARD_SHORTCUTS,
          toggleLayoutMode: "Mod+Shift+M",
        },
      },
      notes: [],
    }),
    "utf8",
  );

  const currentStore = new StickyStore(currentDirectory);
  assert.equal(
    currentStore.getEditorPreferences().keyboardShortcuts.toggleLayoutMode,
    "Mod+Shift+M",
  );
});

test("migrates legacy always-on-top default to false", () => {
  const directory = createTemporaryDirectory();
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "notes.json"),
    JSON.stringify({
      version: 2,
      notes: [
        {
          id: "legacy-note",
          title: "Legacy",
          markdown: "",
          blocksJSON: null,
          bounds: { width: 900, height: 700 },
          theme: {},
          alwaysOnTop: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }),
    "utf8",
  );

  const store = new StickyStore(directory);

  assert.equal(store.getNote("legacy-note").alwaysOnTop, false);
});

test("migrates legacy note text color to sidebar tab accent only", () => {
  const directory = createTemporaryDirectory();
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "notes.json"),
    JSON.stringify({
      notes: [
        {
          id: "legacy-note",
          title: "Legacy",
          markdown: "",
          blocksJSON: null,
          bounds: { width: 900, height: 700 },
          theme: {
            mode: "dark",
            backgroundColor: "#B9E4FF",
            backgroundOpacity: 0.55,
            textColor: "#111111",
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }),
    "utf8",
  );

  const legacyNote = new StickyStore(directory).getNote("legacy-note");

  assert.deepEqual(legacyNote.theme, {
    tabTextColor: "#111111",
    tabTextOpacity: 1,
  });
});

test("migrates legacy per-note mode to global app theme", () => {
  const directory = createTemporaryDirectory();
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "notes.json"),
    JSON.stringify({
      notes: [
        {
          id: "legacy-note",
          title: "Legacy",
          markdown: "",
          blocksJSON: null,
          bounds: { width: 900, height: 700 },
          theme: {
            mode: "dark",
            tabTextColor: "#ffffff",
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }),
    "utf8",
  );

  const store = new StickyStore(directory);

  assert.deepEqual(store.getAppTheme(), {
    mode: "dark",
  });
  assert.deepEqual(store.getNote("legacy-note").theme, {
    tabTextColor: "#ffffff",
    tabTextOpacity: 1,
  });
});

test("moves notes to trash and creates a template after the last session closes", () => {
  const directory = createTemporaryDirectory();
  const store = new StickyStore(directory);
  const firstNote = store.createNote({ width: 900, height: 700 });
  const secondNote = store.createNote({ width: 900, height: 700 });

  const deleted = store.deleteNote(firstNote.id);

  assert.equal(deleted.deleted, true);
  assert.equal(deleted.activeNote.id, secondNote.id);
  assert.deepEqual(store.listNotes().map((note) => note.id), [secondNote.id]);
  assert.equal(store.getNote(firstNote.id), null);
  assert.deepEqual(store.listTrash().map((note) => note.id), [firstNote.id]);
  assert.equal(Number.isFinite(store.listTrash()[0].trashedAt), true);

  const finalDeleted = store.deleteNote(secondNote.id);

  assert.equal(finalDeleted.deleted, true);
  assert.equal(finalDeleted.activeNote.seedDemoContent, true);
  assert.equal(finalDeleted.activeNote.title, "NotePane");
  assert.match(finalDeleted.activeNote.blocksJSON, /NotePane/);
  assert.deepEqual(store.listNotes().map((note) => note.id), [
    finalDeleted.activeNote.id,
  ]);
  assert.deepEqual(
    store.listTrash().map((note) => note.id).sort(),
    [firstNote.id, secondNote.id].sort(),
  );

  const restored = store.restoreNote(firstNote.id);

  assert.equal(restored.restored, true);
  assert.equal(restored.activeNote.id, firstNote.id);
  assert.equal(restored.note.trashedAt, null);
  assert.deepEqual(store.listNotes().map((note) => note.id), [
    firstNote.id,
    finalDeleted.activeNote.id,
  ]);
  assert.deepEqual(store.listTrash().map((note) => note.id), [secondNote.id]);

  const deletedAgain = store.deleteNote(firstNote.id);
  const purged = store.purgeNote(firstNote.id);

  assert.equal(deletedAgain.deleted, true);
  assert.equal(purged.deleted, true);
  assert.deepEqual(store.listTrash().map((note) => note.id), [secondNote.id]);
  assert.deepEqual(store.listNotes().map((note) => note.id), [
    finalDeleted.activeNote.id,
  ]);
  assert.equal(store.restoreNote(firstNote.id).restored, false);
});

test("backs up a corrupted notes file and starts with an empty state", () => {
  const directory = createTemporaryDirectory();
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "notes.json"), "{broken", "utf8");

  const originalConsoleError = console.error;
  let store;
  try {
    console.error = () => {};
    store = new StickyStore(directory);
  } finally {
    console.error = originalConsoleError;
  }
  const backups = fs
    .readdirSync(directory)
    .filter((fileName) => fileName.startsWith("notes-corrupted-"));

  assert.deepEqual(store.listNotes(), []);
  assert.equal(backups.length, 1);
});

test("exports and restores a versioned portable workspace backup", () => {
  const sourceDirectory = createTemporaryDirectory();
  const sourceStore = new StickyStore(sourceDirectory);
  const activeNote = sourceStore.createNote({
    x: 32,
    y: 48,
    width: 980,
    height: 760,
  });
  const trashedNote = sourceStore.createNote({ width: 720, height: 640 });
  sourceStore.updateContent({
    noteId: activeNote.id,
    blocksJSON: JSON.stringify([{ type: "paragraph", content: "Portable data" }]),
    markdown: "Portable data",
  });
  sourceStore.updateAppearance(activeNote.id, {
    title: "Portable workspace",
    titleManuallyEdited: true,
    theme: { tabTextColor: "#2563eb", tabTextOpacity: 0.8 },
  });
  sourceStore.deleteNote(trashedNote.id);
  sourceStore.updateAppTheme({ mode: "dark" });
  sourceStore.updateLayoutMode("sticky");
  sourceStore.updateEditorPreferences({
    ...sourceStore.getEditorPreferences(),
    editorFontScale: 1.25,
    showTableOfContents: true,
  });

  const backup = sourceStore.createBackup({
    appVersion: "0.1.0",
    exportedAt: "2026-08-04T08:30:00.000Z",
  });
  assert.equal(backup.format, NOTE_PANE_BACKUP_FORMAT);
  assert.equal(backup.version, NOTE_PANE_BACKUP_VERSION);
  assert.equal(sourceStore.inspectBackup(backup).noteCount, 1);
  assert.equal(sourceStore.inspectBackup(backup).trashCount, 1);

  const targetDirectory = createTemporaryDirectory();
  const targetStore = new StickyStore(targetDirectory);
  const replacedNote = targetStore.createNote({ width: 800, height: 600 });
  targetStore.updateContent({
    noteId: replacedNote.id,
    blocksJSON: JSON.stringify([{ type: "paragraph", content: "Before import" }]),
    markdown: "Before import",
  });
  const automaticBackupPath = path.join(
    targetDirectory,
    "Backups",
    "before-import.notepane",
  );

  const restored = targetStore.restoreBackup(backup, {
    appVersion: "0.1.0",
    automaticBackupPath,
  });
  assert.equal(restored.noteCount, 1);
  assert.equal(restored.trashCount, 1);
  assert.equal(targetStore.getAppTheme().mode, "dark");
  assert.equal(targetStore.getLayoutMode(), "sticky");
  assert.equal(targetStore.getEditorPreferences().editorFontScale, 1.25);
  assert.equal(targetStore.getEditorPreferences().showTableOfContents, true);
  assert.equal(targetStore.getNote(activeNote.id).markdown, "Portable data");
  assert.deepEqual(targetStore.listTrash().map((note) => note.id), [trashedNote.id]);

  const safetyBackup = JSON.parse(fs.readFileSync(automaticBackupPath, "utf8"));
  assert.equal(safetyBackup.format, NOTE_PANE_BACKUP_FORMAT);
  assert.equal(safetyBackup.data.notes[0].id, replacedNote.id);
  assert.equal(safetyBackup.data.notes[0].markdown, "Before import");

  const reloadedStore = new StickyStore(targetDirectory);
  assert.equal(reloadedStore.getNote(activeNote.id).markdown, "Portable data");
  assert.deepEqual(reloadedStore.listTrash().map((note) => note.id), [trashedNote.id]);
});

test("rejects malformed, duplicate, and newer NotePane backups", () => {
  const store = new StickyStore(createTemporaryDirectory());
  const note = store.createNote({ width: 800, height: 600 });
  const backup = store.createBackup({ exportedAt: "2026-08-04T08:30:00.000Z" });

  assert.throws(
    () => store.inspectBackup({ ...backup, format: "json" }),
    /not a NotePane backup/i,
  );
  assert.throws(
    () => store.inspectBackup({ ...backup, version: NOTE_PANE_BACKUP_VERSION + 1 }),
    /newer version/i,
  );
  assert.throws(
    () => store.inspectBackup({
      ...backup,
      data: { ...backup.data, notes: [backup.data.notes[0], { ...backup.data.notes[0] }] },
    }),
    /duplicate note IDs/i,
  );
  assert.equal(store.getNote(note.id).id, note.id);
});

function createTemporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "notepane-store-"));
}
