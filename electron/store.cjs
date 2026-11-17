const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { AssetStore, hasBase64DataUrl } = require("./assetStore.cjs");
const { writeFileAtomic } = require("./atomicWrite.cjs");
// The renderer reads the same file (src/style/themes.js), so theme ids live in one place.
const THEMES = require("./themes.json");

const DEFAULT_NOTE_TITLE = "Untitled";
const NOTE_PANE_BACKUP_FORMAT = "notepane-backup";
const NOTE_PANE_BACKUP_VERSION = 1;
const NOTE_HISTORY_VERSION = 2;
const MAX_NOTE_HISTORY = 50;
const NOTE_HISTORY_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_NOTE_TITLE_MAX_LENGTH = 48;
const DEFAULT_FOLDER_NAME = "New folder";
const MAX_FOLDER_NAME_LENGTH = 60;
// Twins of MAX_TAG_LENGTH and MAX_TAGS_PER_NOTE in src/model/tags.js.
const MAX_TAG_LENGTH = 32;
const MAX_TAGS_PER_NOTE = 20;
const DEFAULT_APP_THEME = Object.freeze({
  themeId: "notepane-light",
  mode: "light",
});
const DEFAULT_LAYOUT_MODE = "tabs";
// The tabs window shows every note, so its pin and bounds belong to the app rather than to the
// active note. `bounds` stays null until the window first saves them.
const DEFAULT_TABS_WINDOW = Object.freeze({ alwaysOnTop: false, bounds: null });
const MIN_NOTE_BOUNDS_WIDTH = 320;
const MIN_NOTE_BOUNDS_HEIGHT = 260;
const DEFAULT_NOTE_THEME = Object.freeze({
  tabTextColor: null,
  tabTextOpacity: 1,
});
const DEFAULT_THEME = DEFAULT_NOTE_THEME;
const NOTE_PANE_TEMPLATE_BLOCKS = Object.freeze([
  {
    type: "heading",
    content: "NotePane",
  },
  {
    type: "paragraph",
    content: "A focused workspace for persistent notes, fast session switching, and polished exports.",
  },
  {
    type: "quote",
    content:
      "Capture the work, split the context into sessions, and keep the right pane visible when it matters.",
  },
  {
    id: "template-launch-checklist",
    type: "heading",
    props: { isToggleable: true },
    content: "Launch checklist",
    children: [
      {
        type: "paragraph",
        content: "Use this template when the workspace is clear and you are ready to start a new thread.",
      },
    ],
  },
  {
    type: "checkListItem",
    content: "Create one session per meeting, paper, decision, or workstream.",
  },
  {
    type: "checkListItem",
    content: "Pin a sticky window for reference notes that need to stay in view.",
  },
  {
    type: "checkListItem",
    content: "Tune app and editor typography from Preferences before a long writing pass.",
  },
  {
    type: "heading",
    content: "Workspace modes",
  },
  {
    type: "table",
    content: {
      type: "tableContent",
      rows: [
        {
          cells: ["Mode", "Best for", "Action"],
        },
        {
          cells: ["Tabs", "Drafting, comparing, and organizing sessions", "New session"],
        },
        {
          cells: ["Sticky", "Keeping an active note above other windows", "Switch mode"],
        },
        {
          cells: ["Export", "Turning a finished note into a clean PDF", "Export PDF"],
        },
      ],
    },
  },
  {
    type: "image",
    props: {
      url: "https://placehold.co/960x360/1f2937/f8fafc.png?text=NotePane+Workspace",
      caption: "NotePane workspace preview",
    },
  },
  {
    type: "heading",
    content: "Session brief",
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Objective:",
        styles: { bold: true },
      },
      {
        type: "text",
        text: " Define the outcome before adding supporting notes.",
        styles: {},
      },
    ],
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Styled Text",
        styles: {
          bold: true,
          italic: true,
        },
      },
      {
        type: "text",
        text: " can mark the part that needs a decision or follow-up.",
        styles: {},
      },
    ],
  },
  {
    id: "template-follow-up",
    type: "toggleListItem",
    content: "Follow-up",
    children: [
      {
        type: "paragraph",
        content: "Add owners, dates, or unresolved questions before exporting.",
      },
    ],
  },
  {
    type: "codeBlock",
    props: { language: "javascript" },
    content:
      'const session = {\n  status: "ready",\n  panes: ["tabs", "sticky"],\n  export: "polished",\n};',
  },
  {
    type: "paragraph",
  },
]);
const NOTE_PANE_TEMPLATE_BLOCKS_JSON = JSON.stringify(NOTE_PANE_TEMPLATE_BLOCKS);
const DEFAULT_EDITOR_FONT_FAMILY = "system";
const DEFAULT_APP_FONT_FAMILY = "inter";
const APP_ZOOM_LEVELS = Object.freeze([0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]);
const DEFAULT_APP_ZOOM = 1;
const DEFAULT_KEYBOARD_SHORTCUTS = Object.freeze({
  newSession: "Mod+T",
  newNote: "Mod+N",
  closeWindow: "Mod+W",
  focusEditor: "Mod+Enter",
  searchNotes: "Mod+P",
  findInNote: "Mod+F",
  previousTab: "Mod+Alt+ArrowLeft",
  nextTab: "Mod+Alt+ArrowRight",
  moveTabLeft: "Mod+Shift+[",
  moveTabRight: "Mod+Shift+]",
  toggleSidebar: "Mod+Shift+B",
  toggleLayoutMode: "Mod+Shift+T",
  toggleTableOfContents: "Mod+Shift+O",
  exportPdf: "Mod+Shift+E",
  preferences: "Mod+,",
  zoomIn: "Mod+=",
  zoomOut: "Mod+-",
  resetZoom: "Mod+0",
  toggleAlwaysOnTop: "Mod+Shift+P",
});
// The editor font-size shortcuts became the app zoom shortcuts. A stored binding and its on/off
// choice move to the new command.
const RENAMED_KEYBOARD_SHORTCUT_COMMANDS = Object.freeze({
  increaseEditorFontSize: "zoomIn",
  decreaseEditorFontSize: "zoomOut",
});
const KEYBOARD_SHORTCUT_COMMAND_IDS = Object.keys(DEFAULT_KEYBOARD_SHORTCUTS);
const KEYBOARD_SHORTCUT_TOGGLE_COMMAND_IDS = [
  ...KEYBOARD_SHORTCUT_COMMAND_IDS,
  "selectTabByNumber",
];
const DEFAULT_KEYBOARD_SHORTCUT_ENABLED = Object.freeze(
  Object.fromEntries(
    KEYBOARD_SHORTCUT_TOGGLE_COMMAND_IDS.map((commandId) => [commandId, true]),
  ),
);
const LEGACY_DEFAULT_TOGGLE_SIDEBAR_SHORTCUT = "Mod+B";
const LEGACY_DEFAULT_MOVE_TAB_LEFT_SHORTCUT = "Mod+Shift+ArrowLeft";
const LEGACY_DEFAULT_MOVE_TAB_RIGHT_SHORTCUT = "Mod+Shift+ArrowRight";
const LEGACY_DEFAULT_TOGGLE_LAYOUT_MODE_SHORTCUT = "Mod+Shift+M";
const DEFAULT_EDITOR_PREFERENCES = Object.freeze({
  editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
  appFontFamily: DEFAULT_APP_FONT_FAMILY,
  appZoom: DEFAULT_APP_ZOOM,
  showTableOfContents: false,
  smoothCaret: true,
  launchIntro: true,
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
  keyboardShortcutEnabled: DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
});
const LOCAL_FONT_VALUE_PREFIX = "local:";
const EDITOR_FONT_FAMILIES = new Set([
  "system",
  "inter",
  "sf-pro",
  "avenir",
  "helvetica",
  "arial",
  "verdana",
  "trebuchet",
  "serif",
  "mono",
  "rounded",
  "georgia",
  "palatino",
  "garamond",
  "times",
  "menlo",
  "courier",
]);

class StickyStore {
  constructor(userDataPath) {
    this.directoryPath = userDataPath;
    this.filePath = path.join(userDataPath, "notes.json");
    this.historyFilePath = path.join(userDataPath, "note-history.json");
    this.history = {};
    this.loadIssues = [];
    // Bumped when a backup replaces the workspace, so a save from a window that
    // still shows the old workspace can be told apart and refused.
    this.generation = 0;
    this.assets = new AssetStore(path.join(userDataPath, "assets"));
    this.state = {
      appTheme: DEFAULT_APP_THEME,
      layoutMode: DEFAULT_LAYOUT_MODE,
      tabsWindow: DEFAULT_TABS_WINDOW,
      editorPreferences: DEFAULT_EDITOR_PREFERENCES,
      notes: [],
      folders: [],
    };
    this.load();
    this.loadHistory();
    this.migrateInlineAssets();
  }

  // Moves base64 data URLs out of notes.json and note-history.json into
  // content-addressed asset files, then deletes assets nothing references.
  // With no data URL left it changes nothing, so it is safe on every startup.
  migrateInlineAssets() {
    // A file that failed to load was replaced by an empty state. Collecting
    // garbage against that state would delete every asset it referenced.
    if (this.loadIssues.length > 0) {
      return;
    }

    const notesNeedMigration = this.state.notes.some(hasInlineAsset);
    const historyNeedsMigration = Object.values(this.history)
      .some((versions) => Array.isArray(versions) && versions.some(hasInlineAsset));

    if (notesNeedMigration || historyNeedsMigration) {
      let notes;
      let history;
      try {
        // Every asset is written before either workspace file is touched, so a
        // failure here leaves both files exactly as they were.
        notes = this.state.notes.map((note) => this.externalizeContent(note));
        history = Object.fromEntries(
          Object.entries(this.history).map(([noteId, versions]) => [
            noteId,
            Array.isArray(versions)
              ? versions.map((version) => this.externalizeContent(version))
              : versions,
          ]),
        );
      } catch (error) {
        console.error("[NotePane] Failed to move inline images into asset files:", error);
        return;
      }

      const timestamp = new Date().toISOString().replaceAll(":", "-");
      try {
        if (notesNeedMigration) {
          fs.copyFileSync(
            this.filePath,
            path.join(this.directoryPath, `notes.pre-assets-${timestamp}.json`),
          );
          this.state = { ...this.state, notes };
          this.save();
        }
        if (historyNeedsMigration) {
          fs.copyFileSync(
            this.historyFilePath,
            path.join(this.directoryPath, `note-history.pre-assets-${timestamp}.json`),
          );
          this.history = history;
          this.saveHistory();
        }
      } catch (error) {
        console.error("[NotePane] Failed to write the asset migration:", error);
        return;
      }
    }

    try {
      this.assets.collectGarbage(this.listReferencedAssetUrls());
    } catch (error) {
      console.error("[NotePane] Failed to delete unused asset files:", error);
    }
  }

  externalizeContent(record) {
    return {
      ...record,
      blocksJSON: this.assets.externalizeDataUrls(record.blocksJSON),
      markdown: this.assets.externalizeDataUrls(record.markdown),
    };
  }

  listReferencedAssetUrls() {
    const referenced = new Set();
    const collect = (record) => {
      for (const url of AssetStore.referencedUrls(`${record?.blocksJSON ?? ""}\n${record?.markdown ?? ""}`)) {
        referenced.add(url);
      }
    };
    this.state.notes.forEach(collect);
    for (const versions of Object.values(this.history)) {
      if (Array.isArray(versions)) {
        versions.forEach(collect);
      }
    }
    // The background pictures the user added stay in Preferences > Background until removed,
    // so they count as referenced while the look lists them.
    const { background } = normalizeLook(this.state.editorPreferences?.look);
    for (const url of [background.picture, ...background.pictures]) {
      if (url.startsWith("notepane-asset:")) {
        referenced.add(url);
      }
    }
    return referenced;
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      this.state = {
        appTheme: DEFAULT_APP_THEME,
        layoutMode: DEFAULT_LAYOUT_MODE,
        tabsWindow: DEFAULT_TABS_WINDOW,
        editorPreferences: DEFAULT_EDITOR_PREFERENCES,
        notes: [],
        folders: [],
      };
      return;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      const parsedObject = parsed && typeof parsed === "object" ? parsed : {};
      const notes = Array.isArray(parsed) ? parsed : parsedObject.notes;
      if (!Array.isArray(notes)) {
        throw new Error("notes.json does not contain a notes list.");
      }
      const rawNotes = notes;
      const version = Number.isFinite(parsedObject.version)
        ? parsedObject.version
        : 1;
      const resetLegacyAlwaysOnTop = version < 3;
      const editorPreferences = normalizeEditorPreferences(
        migrateLegacyEditorPreferences(parsedObject.editorPreferences, version),
      );
      const folders = normalizeFolders(parsedObject.folders);
      this.state = {
        appTheme: normalizeAppTheme(
          Array.isArray(parsed)
            ? inferLegacyAppTheme(rawNotes)
            : parsedObject.appTheme ?? inferLegacyAppTheme(rawNotes),
        ),
        layoutMode: normalizeLayoutMode(parsedObject.layoutMode),
        tabsWindow: normalizeTabsWindow(parsedObject.tabsWindow),
        editorPreferences,
        notes: clearMissingFolderIds(
          backfillMissingSortOrders(
            rawNotes.map((note) =>
              normalizeNote(note, { resetLegacyAlwaysOnTop, editorPreferences }),
            ),
          ),
          folders,
        ),
        folders,
      };
      for (const [index, note] of this.state.notes.entries()) {
        if (note.unreadableBlocksJSON && !rawNotes[index]?.unreadableBlocksJSON) {
          this.loadIssues.push({
            kind: "note",
            fileName: path.basename(this.filePath),
            noteTitle: note.title,
            message: "The note's editor data could not be read.",
          });
        }
      }
      // Before the tabs window had its own record, pinning it pinned the note it showed, and at
      // launch it opened on the first listed note (getMainTabsNote in main.cjs). That note's pin
      // becomes the tabs window's, and the note keeps it for its own sticky window.
      if (parsedObject.tabsWindow === undefined && this.state.layoutMode === "tabs") {
        this.state.tabsWindow = {
          ...this.state.tabsWindow,
          alwaysOnTop: this.listNotes()[0]?.alwaysOnTop === true,
        };
      }
    } catch (error) {
      this.backupCorruptedFile(this.filePath, "notes-corrupted", error);
      this.state = {
        appTheme: DEFAULT_APP_THEME,
        layoutMode: DEFAULT_LAYOUT_MODE,
        tabsWindow: DEFAULT_TABS_WINDOW,
        editorPreferences: DEFAULT_EDITOR_PREFERENCES,
        notes: [],
        folders: [],
      };
      console.error("[NotePane] Failed to load notes.json:", error);
    }
  }

  getAppTheme() {
    return { ...this.state.appTheme };
  }

  updateAppTheme(appTheme) {
    this.state.appTheme = normalizeAppTheme(appTheme, this.state.appTheme);
    this.save();
    return this.getAppTheme();
  }

  getLayoutMode() {
    return this.state.layoutMode;
  }

  updateLayoutMode(layoutMode) {
    this.state.layoutMode = normalizeLayoutMode(layoutMode, this.state.layoutMode);
    this.save();
    return this.getLayoutMode();
  }

  getTabsWindow() {
    return { ...this.state.tabsWindow };
  }

  setTabsWindowAlwaysOnTop(alwaysOnTop) {
    this.state.tabsWindow = { ...this.state.tabsWindow, alwaysOnTop: Boolean(alwaysOnTop) };
    this.save();
    return this.getTabsWindow();
  }

  updateTabsWindowBounds(bounds) {
    this.state.tabsWindow = normalizeTabsWindow({ ...this.state.tabsWindow, bounds });
    this.save();
    return this.getTabsWindow();
  }

  getEditorPreferences() {
    return { ...this.state.editorPreferences };
  }

  updateEditorPreferences(editorPreferences) {
    this.state.editorPreferences = normalizeEditorPreferences(
      editorPreferences,
      this.state.editorPreferences,
    );
    this.save();
    return this.getEditorPreferences();
  }

  listNotes() {
    return this.state.notes
      .filter((note) => !isTrashedNote(note))
      .sort(sortNotesByOrder);
  }

  listTrash() {
    return this.state.notes
      .filter(isTrashedNote)
      .sort((a, b) =>
        (b.trashedAt ?? 0) - (a.trashedAt ?? 0) ||
        (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
      );
  }

  getNote(noteId) {
    const note = this.getStoredNote(noteId);
    return note && !isTrashedNote(note) ? note : null;
  }

  getStoredNote(noteId) {
    return this.state.notes.find((note) => note.id === noteId) ?? null;
  }

  loadHistory() {
    if (!fs.existsSync(this.historyFilePath)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.historyFilePath, "utf8"));
      const notes = parsed?.notes;
      this.history = notes && typeof notes === "object" && !Array.isArray(notes) ? notes : {};
    } catch (error) {
      this.backupCorruptedFile(this.historyFilePath, "note-history-corrupted", error);
      this.history = {};
      console.error("[NotePane] Failed to load note-history.json:", error);
    }
  }

  saveHistory() {
    writeJsonAtomic(this.historyFilePath, {
      version: NOTE_HISTORY_VERSION,
      notes: this.history,
    });
  }

  listNoteVersions(noteId) {
    return Array.isArray(this.history[noteId]) ? [...this.history[noteId]] : [];
  }

  createNoteVersion(noteId, snapshot = {}) {
    const note = this.getNote(noteId);
    if (!note) return null;
    const version = {
      id: randomUUID(),
      createdAt: Date.now(),
      title: typeof snapshot.title === "string" ? snapshot.title : note.title,
      titleManuallyEdited: Boolean(snapshot.titleManuallyEdited ?? note.titleManuallyEdited),
      blocksJSON: normalizeBlocksJSON(
        this.assets.externalizeDataUrls(snapshot.blocksJSON ?? note.blocksJSON),
      ),
      markdown: this.assets.externalizeDataUrls(
        typeof snapshot.markdown === "string" ? snapshot.markdown : note.markdown,
      ),
      source:
        snapshot.source === "manual" || snapshot.source === "restore"
          ? snapshot.source
          : "auto",
    };
    const versions = this.listNoteVersions(noteId);
    const latest = versions[0];
    if (latest && latest.blocksJSON === version.blocksJSON && latest.markdown === version.markdown) {
      return latest;
    }
    this.history[noteId] = [version, ...versions].slice(0, MAX_NOTE_HISTORY);
    this.saveHistory();
    return version;
  }

  restoreNoteVersion(noteId, versionId) {
    const version = this.listNoteVersions(noteId).find((item) => item.id === versionId);
    if (!version) return null;
    const current = this.getNote(noteId);
    this.createNoteVersion(noteId, { ...current, source: "restore" });
    const note = this.updateContent({
      noteId,
      blocksJSON: version.blocksJSON,
      markdown: version.markdown,
    });
    if (note && version.titleManuallyEdited) {
      note.title = version.title;
      note.titleManuallyEdited = true;
      this.save();
    }
    return note;
  }

  createNote(bounds, options = {}) {
    const now = Date.now();
    const useDefaultTemplate = options?.template === "default";
    const seedDemoContent = Boolean(options?.seedDemoContent);
    const editorPreferences = this.getEditorPreferences();
    const note = normalizeNote({
      id: randomUUID(),
      title: DEFAULT_NOTE_TITLE,
      titleManuallyEdited: false,
      blocksJSON: useDefaultTemplate ? NOTE_PANE_TEMPLATE_BLOCKS_JSON : null,
      markdown: "",
      bounds,
      theme: options?.theme ?? DEFAULT_NOTE_THEME,
      alwaysOnTop: false,
      seedDemoContent,
      editorFontFamily: Object.hasOwn(options, "editorFontFamily")
        ? options.editorFontFamily
        : editorPreferences.editorFontFamily,
      // "New note in folder" creates the note inside it, so it never shows outside first.
      folderId: this.getFolder(options?.folderId) ? options.folderId : null,
      tags: [],
      trashedAt: null,
      sortOrder: nextNoteSortOrder(this.state.notes),
      createdAt: now,
      updatedAt: now,
    });

    this.state.notes.push(note);
    this.save();
    return note;
  }

  deleteNote(noteId) {
    const note = this.getNote(noteId);
    const activeNotes = this.listNotes();
    if (!note) {
      return {
        deleted: false,
        notes: activeNotes,
        trash: this.listTrash(),
        activeNote: activeNotes[0] ?? null,
      };
    }

    const sortedNotes = activeNotes;
    const sortedIndex = sortedNotes.findIndex((candidate) => candidate.id === noteId);
    const fallbackActiveNote =
      sortedNotes[sortedIndex + 1] ?? sortedNotes[sortedIndex - 1] ?? null;

    const now = Date.now();
    note.trashedAt = now;
    note.alwaysOnTop = false;
    note.updatedAt = now;
    const templateNote =
      activeNotes.length === 1 ? this.createTemplateSessionNote(note, now) : null;
    this.save();

    const activeNote =
      templateNote ??
      (fallbackActiveNote
        ? this.getNote(fallbackActiveNote.id)
        : this.listNotes()[0] ?? null);

    return {
      deleted: true,
      notes: this.listNotes(),
      trash: this.listTrash(),
      activeNote,
    };
  }

  createTemplateSessionNote(sourceNote = {}, timestamp = Date.now()) {
    const editorPreferences = this.getEditorPreferences();
    const note = normalizeNote({
      id: randomUUID(),
      title: "NotePane",
      titleManuallyEdited: false,
      blocksJSON: NOTE_PANE_TEMPLATE_BLOCKS_JSON,
      markdown: "",
      bounds: sourceNote.bounds,
      theme: DEFAULT_NOTE_THEME,
      alwaysOnTop: false,
      seedDemoContent: true,
      editorFontFamily:
        sourceNote.editorFontFamily ?? editorPreferences.editorFontFamily,
      trashedAt: null,
      sortOrder: nextNoteSortOrder(this.state.notes),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    this.state.notes.push(note);
    return note;
  }

  restoreNote(noteId) {
    const note = this.getStoredNote(noteId);
    if (!note || !isTrashedNote(note)) {
      return {
        restored: false,
        note: null,
        notes: this.listNotes(),
        trash: this.listTrash(),
        activeNote: this.listNotes()[0] ?? null,
      };
    }

    note.trashedAt = null;
    note.alwaysOnTop = false;
    note.updatedAt = Date.now();
    this.save();

    return {
      restored: true,
      note,
      notes: this.listNotes(),
      trash: this.listTrash(),
      activeNote: note,
    };
  }

  purgeNote(noteId) {
    const noteIndex = this.state.notes.findIndex(
      (note) => note.id === noteId && isTrashedNote(note),
    );
    if (noteIndex < 0) {
      return {
        deleted: false,
        notes: this.listNotes(),
        trash: this.listTrash(),
      };
    }

    this.state.notes.splice(noteIndex, 1);
    delete this.history[noteId];
    this.save();
    this.saveHistory();

    return {
      deleted: true,
      notes: this.listNotes(),
      trash: this.listTrash(),
    };
  }

  reorderNotes(orderedNoteIds) {
    const orderedIds = normalizeOrderedNoteIds(orderedNoteIds);
    const activeNotes = this.listNotes();
    if (orderedIds.length === 0 || activeNotes.length <= 1) {
      return {
        notes: activeNotes,
        trash: this.listTrash(),
      };
    }

    const activeNotesById = new Map(activeNotes.map((note) => [note.id, note]));
    const nextOrderedNotes = [];
    const seenIds = new Set();

    for (const noteId of orderedIds) {
      const note = activeNotesById.get(noteId);
      if (!note || seenIds.has(note.id)) {
        continue;
      }
      nextOrderedNotes.push(note);
      seenIds.add(note.id);
    }

    for (const note of activeNotes) {
      if (!seenIds.has(note.id)) {
        nextOrderedNotes.push(note);
      }
    }

    nextOrderedNotes.forEach((note, index) => {
      note.sortOrder = index + 1;
    });
    this.save();

    return {
      notes: this.listNotes(),
      trash: this.listTrash(),
    };
  }

  updateAppearance(noteId, appearance) {
    const note = this.getNote(noteId);
    if (!note) {
      return null;
    }

    if (Object.hasOwn(appearance ?? {}, "titleManuallyEdited")) {
      note.titleManuallyEdited = Boolean(appearance.titleManuallyEdited);
    }

    if (Object.hasOwn(appearance ?? {}, "title")) {
      note.title = normalizeTitle(
        appearance.title,
        note.title || deriveAutomaticTitleFromContent(note.blocksJSON, note.markdown),
      );
    } else if (!note.titleManuallyEdited) {
      note.title = deriveAutomaticTitleFromContent(note.blocksJSON, note.markdown);
    }

    if (Object.hasOwn(appearance ?? {}, "theme")) {
      note.theme = normalizeTheme(appearance.theme, note.theme);
    }

    note.updatedAt = Date.now();
    this.save();
    return note;
  }

  updateContent({ noteId, blocksJSON, markdown }) {
    const note = this.getNote(noteId);
    if (!note) {
      return null;
    }

    const nextBlocksJSON = normalizeBlocksJSON(this.assets.externalizeDataUrls(blocksJSON));
    const nextMarkdown = typeof markdown === "string"
      ? this.assets.externalizeDataUrls(markdown)
      : "";
    const contentChanged = note.blocksJSON !== nextBlocksJSON || note.markdown !== nextMarkdown;
    const latestVersion = this.listNoteVersions(noteId)[0];
    if (
      contentChanged &&
      (!latestVersion || Date.now() - latestVersion.createdAt >= NOTE_HISTORY_INTERVAL_MS)
    ) {
      this.createNoteVersion(noteId, { ...note, source: "auto" });
    }
    note.blocksJSON = nextBlocksJSON;
    note.markdown = nextMarkdown;
    if (!note.titleManuallyEdited) {
      note.title = deriveAutomaticTitleFromContent(note.blocksJSON, note.markdown);
    }
    note.seedDemoContent = false;
    note.updatedAt = Date.now();
    this.save();
    return note;
  }

  updateBounds(noteId, bounds) {
    const note = this.getNote(noteId);
    if (!note || !bounds) {
      return null;
    }

    note.bounds = normalizeBounds(bounds, note.bounds);
    note.updatedAt = Date.now();
    this.save();
    return note;
  }

  setAlwaysOnTop(noteId, alwaysOnTop) {
    const note = this.getNote(noteId);
    if (!note) {
      return null;
    }

    note.alwaysOnTop = Boolean(alwaysOnTop);
    note.updatedAt = Date.now();
    this.save();
    return note;
  }

  listFolders() {
    return this.state.folders.map((folder) => ({ ...folder }));
  }

  getFolder(folderId) {
    return typeof folderId === "string"
      ? this.state.folders.find((folder) => folder.id === folderId) ?? null
      : null;
  }

  createFolder(payload = {}) {
    const folder = {
      id: randomUUID(),
      name: normalizeFolderName(payload?.name, DEFAULT_FOLDER_NAME),
      collapsed: false,
    };
    this.state.folders.push(folder);
    this.save();
    return { ...folder };
  }

  // Changes only the fields the payload carries, like updateAppearance. A blank
  // name keeps the current one, so clearing the rename field cannot leave a
  // folder without a header.
  updateFolder(payload = {}) {
    const folder = this.getFolder(payload?.id);
    if (!folder) {
      return null;
    }

    if (Object.hasOwn(payload, "name")) {
      folder.name = normalizeFolderName(payload.name, folder.name);
    }
    if (Object.hasOwn(payload, "collapsed")) {
      folder.collapsed = Boolean(payload.collapsed);
    }
    this.save();
    return { ...folder };
  }

  // Deleting a folder loses nothing: its notes, trashed ones included, move out
  // to the ungrouped tabs.
  deleteFolder(folderId) {
    const index = this.state.folders.findIndex((folder) => folder.id === folderId);
    if (index < 0) {
      return false;
    }

    this.state.folders.splice(index, 1);
    for (const note of this.state.notes) {
      if (note.folderId === folderId) {
        note.folderId = null;
      }
    }
    this.save();
    return true;
  }

  moveFolder(payload = {}) {
    const index = this.state.folders.findIndex((folder) => folder.id === payload?.id);
    const toIndex = Math.trunc(Number(payload?.toIndex));
    if (index < 0 || !Number.isFinite(toIndex)) {
      return this.listFolders();
    }

    const [folder] = this.state.folders.splice(index, 1);
    this.state.folders.splice(clamp(toIndex, 0, this.state.folders.length), 0, folder);
    this.save();
    return this.listFolders();
  }

  // A folder id that names no folder means no folder. A note that changes group
  // takes the next sort order, so it lands at the end of the group it joins.
  setNoteFolder(payload = {}) {
    const note = this.getNote(payload?.noteId);
    if (!note) {
      return null;
    }

    const folderId = this.getFolder(payload.folderId) ? payload.folderId : null;
    if (note.folderId !== folderId) {
      note.folderId = folderId;
      note.sortOrder = nextNoteSortOrder(this.state.notes);
      this.save();
    }
    return note;
  }

  setNoteTags(payload = {}) {
    const note = this.getNote(payload?.noteId);
    if (!note) {
      return null;
    }

    note.tags = normalizeNoteTags(payload.tags);
    this.save();
    return note;
  }

  createBackup(options = {}) {
    return {
      format: NOTE_PANE_BACKUP_FORMAT,
      version: NOTE_PANE_BACKUP_VERSION,
      exportedAt:
        typeof options.exportedAt === "string"
          ? options.exportedAt
          : new Date().toISOString(),
      app: {
        name: "NotePane",
        version:
          typeof options.appVersion === "string" ? options.appVersion : null,
      },
      // Assets are inlined so the backup stays one self-contained file that
      // older app versions can import.
      data: {
        ...JSON.parse(JSON.stringify(this.state)),
        notes: this.state.notes.map((note) => ({
          ...JSON.parse(JSON.stringify(note)),
          blocksJSON: this.assets.inlineAssetUrls(note.blocksJSON),
          markdown: this.assets.inlineAssetUrls(note.markdown),
        })),
      },
    };
  }

  inspectBackup(value) {
    const normalizedBackup = normalizeBackup(value);
    const notes = normalizedBackup.data.notes;
    return {
      format: normalizedBackup.format,
      version: normalizedBackup.version,
      exportedAt: normalizedBackup.exportedAt,
      appVersion: normalizedBackup.app.version,
      noteCount: notes.filter((note) => !isTrashedNote(note)).length,
      trashCount: notes.filter(isTrashedNote).length,
    };
  }

  restoreBackup(value, options = {}) {
    const normalizedBackup = normalizeBackup(value);
    const automaticBackupPath = options.automaticBackupPath;

    if (typeof automaticBackupPath === "string" && automaticBackupPath) {
      writeJsonAtomic(
        automaticBackupPath,
        this.createBackup({ appVersion: options.appVersion }),
      );
    }

    const previousState = this.state;
    this.state = {
      ...normalizedBackup.data,
      notes: normalizedBackup.data.notes.map((note) => this.externalizeContent(note)),
    };
    try {
      this.save();
    } catch (error) {
      this.state = previousState;
      throw error;
    }
    this.generation += 1;
    return this.inspectBackup(normalizedBackup);
  }

  getGeneration() {
    return this.generation;
  }

  save() {
    writeJsonAtomic(this.filePath, {
      // Version 12 added folders and the notes' folderId and tags. An older file
      // loads with no folders and every note ungrouped and untagged.
      version: 12,
      appTheme: this.state.appTheme,
      layoutMode: this.state.layoutMode,
      tabsWindow: this.state.tabsWindow,
      editorPreferences: this.state.editorPreferences,
      notes: this.state.notes,
      folders: this.state.folders,
    });
  }

  getLoadIssues() {
    return this.loadIssues.map((issue) => ({ ...issue }));
  }

  // Moves an unreadable file aside so the next save cannot overwrite it, and
  // records it so the app can tell the user. A rename needs no free space,
  // unlike a copy, so it still works when a full disk caused the damage.
  backupCorruptedFile(filePath, backupPrefix, error) {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const backupPath = path.join(
      this.directoryPath,
      `${backupPrefix}-${timestamp}.json`,
    );
    let preservedPath = backupPath;
    try {
      fs.renameSync(filePath, backupPath);
    } catch {
      try {
        fs.copyFileSync(filePath, backupPath);
      } catch {
        preservedPath = null;
      }
    }
    this.loadIssues.push({
      fileName: path.basename(filePath),
      backupPath: preservedPath,
      message: error?.message ?? String(error),
    });
  }
}

function normalizeBackup(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
  if (!source || source.format !== NOTE_PANE_BACKUP_FORMAT) {
    throw new Error("This is not a NotePane backup file.");
  }
  if (source.version !== NOTE_PANE_BACKUP_VERSION) {
    throw new Error(
      source.version > NOTE_PANE_BACKUP_VERSION
        ? "This backup was created by a newer version of NotePane."
        : "This NotePane backup version is not supported.",
    );
  }

  const data = source.data && typeof source.data === "object" && !Array.isArray(source.data)
    ? source.data
    : null;
  if (!data || !Array.isArray(data.notes)) {
    throw new Error("The NotePane backup does not contain valid note data.");
  }

  const noteIds = new Set();
  for (const note of data.notes) {
    if (!note || typeof note !== "object" || Array.isArray(note)) {
      throw new Error("The NotePane backup contains an invalid note.");
    }
    if (typeof note.id !== "string" || !note.id.trim() || noteIds.has(note.id)) {
      throw new Error("The NotePane backup contains invalid or duplicate note IDs.");
    }
    if (note.blocksJSON !== null && note.blocksJSON !== undefined) {
      if (normalizeBlocksJSON(note.blocksJSON) === null) {
        throw new Error(`The note \"${normalizeTitle(note.title)}\" has invalid editor data.`);
      }
    }
    noteIds.add(note.id);
  }

  const editorPreferences = normalizeEditorPreferences(
    renameLegacyShortcutPreferences(data.editorPreferences),
  );
  const folders = normalizeFolders(data.folders);
  const notes = clearMissingFolderIds(
    backfillMissingSortOrders(
      data.notes.map((note) => normalizeNote(note, { editorPreferences })),
    ),
    folders,
  );
  if (!notes.some((note) => !isTrashedNote(note))) {
    throw new Error("The NotePane backup must contain at least one active note.");
  }

  return {
    format: NOTE_PANE_BACKUP_FORMAT,
    version: NOTE_PANE_BACKUP_VERSION,
    exportedAt: normalizeBackupExportedAt(source.exportedAt),
    app: {
      name: "NotePane",
      version:
        typeof source.app?.version === "string" ? source.app.version : null,
    },
    data: {
      appTheme: normalizeAppTheme(data.appTheme),
      layoutMode: normalizeLayoutMode(data.layoutMode),
      tabsWindow: normalizeTabsWindow(data.tabsWindow),
      editorPreferences,
      notes,
      folders,
    },
  };
}

function normalizeBackupExportedAt(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("The NotePane backup has an invalid export date.");
  }
  return new Date(value).toISOString();
}

function hasInlineAsset(record) {
  return hasBase64DataUrl(record?.blocksJSON) || hasBase64DataUrl(record?.markdown);
}

function writeJsonAtomic(filePath, value) {
  writeFileAtomic(filePath, JSON.stringify(value, null, 2));
}

function normalizeNote(value, options = {}) {
  const now = Date.now();
  const source = value && typeof value === "object" ? value : {};
  const resetLegacyAlwaysOnTop = Boolean(options.resetLegacyAlwaysOnTop);
  const editorPreferences = normalizeEditorPreferences(options.editorPreferences);
  const blocksJSON = normalizeBlocksJSON(source.blocksJSON);
  // Editor data that no longer parses is kept beside the note instead of being
  // dropped, so a later save cannot destroy the only copy of the content.
  const unreadableBlocksJSON =
    blocksJSON === null && typeof source.blocksJSON === "string" && source.blocksJSON.trim() !== ""
      ? source.blocksJSON
      : typeof source.unreadableBlocksJSON === "string"
        ? source.unreadableBlocksJSON
        : null;
  const markdown = typeof source.markdown === "string" ? source.markdown : "";
  const normalizedSourceTitle = normalizeTitle(source.title);
  const titleManuallyEdited = normalizeTitleManuallyEdited(
    source,
    normalizedSourceTitle,
  );
  const title = titleManuallyEdited
    ? normalizedSourceTitle
    : deriveAutomaticTitleFromContent(blocksJSON, markdown);

  return {
    id: typeof source.id === "string" && source.id ? source.id : randomUUID(),
    title,
    titleManuallyEdited,
    blocksJSON,
    ...(unreadableBlocksJSON ? { unreadableBlocksJSON } : {}),
    markdown,
    bounds: normalizeBounds(source.bounds, {
      width: 960,
      height: 720,
    }),
    theme: normalizeTheme(source.theme),
    alwaysOnTop: resetLegacyAlwaysOnTop
      ? false
      : typeof source.alwaysOnTop === "boolean"
        ? source.alwaysOnTop
        : false,
    seedDemoContent: typeof source.seedDemoContent === "boolean"
      ? source.seedDemoContent
      : false,
    editorFontFamily: normalizeEditorFontFamily(
      source.editorFontFamily,
      editorPreferences.editorFontFamily,
    ),
    folderId: typeof source.folderId === "string" && source.folderId ? source.folderId : null,
    tags: normalizeNoteTags(source.tags),
    trashedAt: normalizeTimestamp(source.trashedAt),
    sortOrder: normalizeSortOrder(source.sortOrder),
    createdAt: Number.isFinite(source.createdAt) ? source.createdAt : now,
    updatedAt: Number.isFinite(source.updatedAt) ? source.updatedAt : now,
  };
}

// Folders in display order. An entry that is not an object is dropped, and so is
// a second folder with an id already used, which no note could tell apart.
function normalizeFolders(value) {
  const folders = [];
  const folderIds = new Set();
  for (const source of Array.isArray(value) ? value : []) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      continue;
    }
    const id = typeof source.id === "string" && source.id ? source.id : randomUUID();
    if (folderIds.has(id)) {
      continue;
    }
    folderIds.add(id);
    folders.push({
      id,
      name: normalizeFolderName(source.name, DEFAULT_FOLDER_NAME),
      collapsed: source.collapsed === true,
    });
  }
  return folders;
}

// Trimmed and cut to MAX_FOLDER_NAME_LENGTH characters; a blank name takes the fallback.
function normalizeFolderName(value, fallback) {
  const name = typeof value === "string" ? value.trim() : "";
  return name ? [...name].slice(0, MAX_FOLDER_NAME_LENGTH).join("").trim() : fallback;
}

// A note that names a folder no longer listed would sit in no section of the
// sidebar, so it is treated as ungrouped.
function clearMissingFolderIds(notes, folders) {
  const folderIds = new Set(folders.map((folder) => folder.id));
  for (const note of notes) {
    if (note.folderId && !folderIds.has(note.folderId)) {
      note.folderId = null;
    }
  }
  return notes;
}

// Twin of normalizeTag in src/model/tags.js: trimmed, without leading "#",
// lower-cased, inner whitespace as "-". A tag outside 1..MAX_TAG_LENGTH
// characters is dropped rather than cut.
function normalizeNoteTag(value) {
  const tag = String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/^#+/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const length = [...tag].length;
  return length >= 1 && length <= MAX_TAG_LENGTH ? tag : "";
}

// Twin of normalizeTags in src/model/tags.js: unique valid tags in the order
// they were added, at most MAX_TAGS_PER_NOTE.
function normalizeNoteTags(values) {
  const tags = [];
  for (const value of Array.isArray(values) ? values : []) {
    const tag = normalizeNoteTag(value);
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
      if (tags.length === MAX_TAGS_PER_NOTE) {
        break;
      }
    }
  }
  return tags;
}

function sortNotesByOrder(a, b) {
  return (
    (a.sortOrder ?? Number.POSITIVE_INFINITY) -
      (b.sortOrder ?? Number.POSITIVE_INFINITY) ||
    (a.createdAt ?? 0) - (b.createdAt ?? 0)
  );
}

function nextNoteSortOrder(notes) {
  return notes
    .filter((note) => !isTrashedNote(note))
    .reduce(
      (maximum, note) =>
        Math.max(maximum, Number.isFinite(note.sortOrder) ? note.sortOrder : 0),
      0,
    ) + 1;
}

function backfillMissingSortOrders(notes) {
  const usedOrders = new Set(
    notes
      .map((note) => note.sortOrder)
      .filter((sortOrder) => Number.isFinite(sortOrder) && sortOrder > 0),
  );
  let nextSortOrder = notes.reduce(
    (maximum, note) =>
      Math.max(maximum, Number.isFinite(note.sortOrder) ? note.sortOrder : 0),
    0,
  ) + 1;

  for (const note of [...notes].sort(sortNotesByCreatedAt)) {
    if (Number.isFinite(note.sortOrder) && note.sortOrder > 0) {
      continue;
    }

    while (usedOrders.has(nextSortOrder)) {
      nextSortOrder += 1;
    }
    note.sortOrder = nextSortOrder;
    usedOrders.add(nextSortOrder);
    nextSortOrder += 1;
  }

  return notes;
}

function sortNotesByCreatedAt(a, b) {
  return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

function normalizeOrderedNoteIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((noteId) => typeof noteId === "string" && noteId);
}

function normalizeSortOrder(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : null;
}

function isTrashedNote(note) {
  return Number.isFinite(note?.trashedAt) && note.trashedAt > 0;
}

function normalizeTimestamp(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : null;
}

function normalizeTitle(value, fallback = DEFAULT_NOTE_TITLE) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 80) : fallback;
}

function normalizeTitleManuallyEdited(source, normalizedTitle) {
  if (typeof source.titleManuallyEdited === "boolean") {
    return source.titleManuallyEdited;
  }

  return normalizedTitle !== DEFAULT_NOTE_TITLE;
}

function deriveAutomaticTitleFromContent(blocksJSON, markdown) {
  const blocks = parseBlocksJSON(blocksJSON);
  const titleFromBlocks = normalizeAutomaticTitleText(
    extractFirstPlainTextFromBlocks(blocks),
  );
  if (titleFromBlocks !== DEFAULT_NOTE_TITLE) {
    return titleFromBlocks;
  }

  return normalizeAutomaticTitleText(extractFirstMarkdownLine(markdown));
}

function normalizeAutomaticTitleText(value) {
  if (typeof value !== "string") {
    return DEFAULT_NOTE_TITLE;
  }

  const normalizedText = value.replace(/\s+/g, " ").trim();
  return normalizedText
    ? normalizedText.slice(0, AUTO_NOTE_TITLE_MAX_LENGTH)
    : DEFAULT_NOTE_TITLE;
}

function parseBlocksJSON(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function extractFirstPlainTextFromBlocks(blocks) {
  if (!Array.isArray(blocks)) {
    return "";
  }

  for (const block of blocks) {
    const contentText = extractPlainText(block?.content);
    if (contentText.trim()) {
      return contentText;
    }

    const childText = extractFirstPlainTextFromBlocks(block?.children);
    if (childText.trim()) {
      return childText;
    }
  }

  return "";
}

function extractPlainText(value) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(extractPlainText).join("");
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  if (typeof value.text === "string") {
    return value.text;
  }

  if (Array.isArray(value.rows)) {
    return value.rows
      .flatMap((row) => Array.isArray(row?.cells) ? row.cells : [])
      .map(extractPlainText)
      .find((text) => text.trim()) ?? "";
  }

  return extractPlainText(value.content);
}

function extractFirstMarkdownLine(markdown) {
  if (typeof markdown !== "string") {
    return "";
  }

  const line = markdown
    .split(/\r?\n/)
    .find((candidate) => stripMarkdownTitleSyntax(candidate).trim());

  return line ? stripMarkdownTitleSyntax(line) : "";
}

function stripMarkdownTitleSyntax(value) {
  return String(value)
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "");
}

function migrateLegacyEditorPreferences(value, version = 1) {
  const source = renameLegacyShortcutPreferences(value);
  const keyboardShortcuts = source.keyboardShortcuts;
  if (!keyboardShortcuts || typeof keyboardShortcuts !== "object") {
    return source;
  }

  const nextKeyboardShortcuts = { ...keyboardShortcuts };
  const parsedToggleSidebar = parseKeyboardShortcut(
    keyboardShortcuts.toggleSidebar,
  );
  if (
    version < 8 &&
    parsedToggleSidebar &&
    formatKeyboardShortcutValue(parsedToggleSidebar) ===
      LEGACY_DEFAULT_TOGGLE_SIDEBAR_SHORTCUT
  ) {
    nextKeyboardShortcuts.toggleSidebar =
      DEFAULT_KEYBOARD_SHORTCUTS.toggleSidebar;
  }

  if (
    version < 10 &&
    normalizeKeyboardShortcut(keyboardShortcuts.moveTabLeft) ===
      LEGACY_DEFAULT_MOVE_TAB_LEFT_SHORTCUT
  ) {
    nextKeyboardShortcuts.moveTabLeft =
      DEFAULT_KEYBOARD_SHORTCUTS.moveTabLeft;
  }

  if (
    version < 10 &&
    normalizeKeyboardShortcut(keyboardShortcuts.moveTabRight) ===
      LEGACY_DEFAULT_MOVE_TAB_RIGHT_SHORTCUT
  ) {
    nextKeyboardShortcuts.moveTabRight =
      DEFAULT_KEYBOARD_SHORTCUTS.moveTabRight;
  }

  if (
    version < 11 &&
    normalizeKeyboardShortcut(keyboardShortcuts.toggleLayoutMode) ===
      LEGACY_DEFAULT_TOGGLE_LAYOUT_MODE_SHORTCUT
  ) {
    nextKeyboardShortcuts.toggleLayoutMode =
      DEFAULT_KEYBOARD_SHORTCUTS.toggleLayoutMode;
  }

  return {
    ...source,
    keyboardShortcuts: nextKeyboardShortcuts,
  };
}

// Applies RENAMED_KEYBOARD_SHORTCUT_COMMANDS to stored preferences, from notes.json or from a backup
// an older version exported.
function renameLegacyShortcutPreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...source,
    keyboardShortcuts: renameLegacyShortcutCommands(source.keyboardShortcuts),
    keyboardShortcutEnabled: renameLegacyShortcutCommands(source.keyboardShortcutEnabled),
  };
}

function renameLegacyShortcutCommands(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  const renamed = { ...value };
  for (const [legacyId, commandId] of Object.entries(RENAMED_KEYBOARD_SHORTCUT_COMMANDS)) {
    if (Object.hasOwn(renamed, legacyId)) {
      if (!Object.hasOwn(renamed, commandId)) {
        renamed[commandId] = renamed[legacyId];
      }
      delete renamed[legacyId];
    }
  }
  return renamed;
}

// Same rules as normalizeAppTheme in src/model/preferences.js (tests/unit/themes.test.cjs checks
// that they agree). `mode` is always the theme's scheme, so an older build still reads a
// sensible light or dark value.
function normalizeAppTheme(value, fallback = DEFAULT_APP_THEME) {
  const themeId =
    resolveAppThemeId(value) ??
    resolveAppThemeId(fallback) ??
    DEFAULT_APP_THEME.themeId;

  return {
    themeId,
    mode: THEMES.find((theme) => theme.id === themeId).scheme,
  };
}

// A known theme id wins. Otherwise a legacy mode, or the mode stored beside an unknown id
// (for example after a downgrade), picks the matching NotePane theme.
function resolveAppThemeId(value) {
  const source = value && typeof value === "object" ? value : {};
  if (THEMES.some((theme) => theme.id === source.themeId)) {
    return source.themeId;
  }
  if (source.mode === "dark") {
    return "notepane-dark";
  }
  if (source.mode === "light") {
    return "notepane-light";
  }
  return null;
}

function inferLegacyAppTheme(rawNotes) {
  const legacyTheme = rawNotes
    .map((note) => note?.theme)
    .find((theme) => theme?.mode === "dark" || theme?.mode === "light");

  return normalizeAppTheme(legacyTheme);
}

function normalizeLayoutMode(value, fallback = DEFAULT_LAYOUT_MODE) {
  if (value === "sticky" || value === "tabs") {
    return value;
  }

  return fallback === "sticky" ? "sticky" : "tabs";
}

function normalizeTabsWindow(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    alwaysOnTop: source.alwaysOnTop === true,
    bounds: source.bounds && typeof source.bounds === "object"
      ? normalizeBounds(source.bounds, { width: 960, height: 720 })
      : null,
  };
}

function normalizeEditorPreferences(
  value,
  fallback = DEFAULT_EDITOR_PREFERENCES,
) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackSource = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_EDITOR_PREFERENCES;

  return {
    editorFontFamily: normalizeEditorFontFamily(
      source.editorFontFamily,
      fallbackSource.editorFontFamily,
    ),
    appFontFamily: normalizeAppFontFamily(
      source.appFontFamily,
      fallbackSource.appFontFamily,
    ),
    appZoom: normalizeAppZoom(source.appZoom, fallbackSource.appZoom),
    showTableOfContents:
      typeof source.showTableOfContents === "boolean"
        ? source.showTableOfContents
        : Boolean(fallbackSource.showTableOfContents),
    // On unless turned off; a stored file from before the setting has none.
    smoothCaret:
      typeof source.smoothCaret === "boolean"
        ? source.smoothCaret
        : fallbackSource.smoothCaret !== false,
    // On unless turned off, like smoothCaret.
    launchIntro:
      typeof source.launchIntro === "boolean"
        ? source.launchIntro
        : fallbackSource.launchIntro !== false,
    ...normalizeKeyboardShortcutPreferences(source, fallbackSource),
    // A partial update without a look keeps the previous one.
    look: normalizeLook(source.look ?? fallbackSource.look),
  };
}

function normalizeKeyboardShortcutPreferences(source, fallbackSource) {
  const keyboardShortcuts = normalizeKeyboardShortcuts(
    source.keyboardShortcuts,
    fallbackSource.keyboardShortcuts,
  );
  const keyboardShortcutEnabled = normalizeKeyboardShortcutEnabled(
    source.keyboardShortcutEnabled,
    fallbackSource.keyboardShortcutEnabled,
  );
  return {
    keyboardShortcuts,
    keyboardShortcutEnabled: disableShadowingDefaultShortcuts(
      source.keyboardShortcuts,
      source.keyboardShortcutEnabled,
      keyboardShortcuts,
      keyboardShortcutEnabled,
    ),
  };
}

// A command missing from the stored shortcuts (one added after they were
// saved) takes its default keys. When the user already bound those keys to
// another enabled command, the user's binding wins and the new command starts
// disabled. Mirrors `disableShadowingDefaultShortcuts` in
// `src/model/keyboardShortcuts.js`.
function disableShadowingDefaultShortcuts(
  storedShortcuts,
  storedEnabled,
  keyboardShortcuts,
  keyboardShortcutEnabled,
) {
  if (!storedShortcuts || typeof storedShortcuts !== "object") {
    return keyboardShortcutEnabled;
  }
  const explicitEnabled =
    storedEnabled && typeof storedEnabled === "object" ? storedEnabled : {};
  const isStored = (commandId) =>
    Boolean(parseKeyboardShortcut(storedShortcuts[commandId]));
  const userKeys = new Set(
    KEYBOARD_SHORTCUT_COMMAND_IDS
      .filter((commandId) =>
        isStored(commandId) && keyboardShortcutEnabled[commandId] !== false)
      .map((commandId) => keyboardShortcuts[commandId]),
  );
  const nextEnabled = { ...keyboardShortcutEnabled };
  for (const commandId of KEYBOARD_SHORTCUT_COMMAND_IDS) {
    if (
      !isStored(commandId) &&
      typeof explicitEnabled[commandId] !== "boolean" &&
      userKeys.has(keyboardShortcuts[commandId])
    ) {
      nextEnabled[commandId] = false;
    }
  }
  return nextEnabled;
}

function normalizeKeyboardShortcuts(
  value,
  fallback = DEFAULT_KEYBOARD_SHORTCUTS,
) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackSource = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_KEYBOARD_SHORTCUTS;
  const normalizedShortcuts = {};

  for (const commandId of KEYBOARD_SHORTCUT_COMMAND_IDS) {
    normalizedShortcuts[commandId] = normalizeKeyboardShortcut(
      source[commandId],
      fallbackSource[commandId] ?? DEFAULT_KEYBOARD_SHORTCUTS[commandId],
    );
  }

  return normalizedShortcuts;
}

function normalizeKeyboardShortcutEnabled(
  value,
  fallback = DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackSource = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_KEYBOARD_SHORTCUT_ENABLED;
  const normalizedEnabled = {};

  for (const commandId of KEYBOARD_SHORTCUT_TOGGLE_COMMAND_IDS) {
    normalizedEnabled[commandId] =
      typeof source[commandId] === "boolean"
        ? source[commandId]
        : fallbackSource[commandId] !== false;
  }

  return normalizedEnabled;
}

function normalizeKeyboardShortcut(value, fallback) {
  const parsedShortcut = parseKeyboardShortcut(value);
  if (parsedShortcut) {
    return formatKeyboardShortcutValue(parsedShortcut);
  }

  const parsedFallback = parseKeyboardShortcut(fallback);
  return parsedFallback
    ? formatKeyboardShortcutValue(parsedFallback)
    : DEFAULT_KEYBOARD_SHORTCUTS.focusEditor;
}

function parseKeyboardShortcut(value) {
  if (typeof value !== "string") {
    return null;
  }

  const tokens = value
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length < 2) {
    return null;
  }

  const shortcut = {
    mod: false,
    alt: false,
    shift: false,
    key: "",
  };

  for (const token of tokens) {
    const normalizedToken = token.toLowerCase();
    if (
      normalizedToken === "mod" ||
      normalizedToken === "cmd" ||
      normalizedToken === "command" ||
      normalizedToken === "ctrl" ||
      normalizedToken === "control" ||
      normalizedToken === "commandorcontrol" ||
      normalizedToken === "cmdorctrl"
    ) {
      shortcut.mod = true;
      continue;
    }

    if (normalizedToken === "alt" || normalizedToken === "option") {
      shortcut.alt = true;
      continue;
    }

    if (normalizedToken === "shift") {
      shortcut.shift = true;
      continue;
    }

    if (shortcut.key) {
      return null;
    }

    shortcut.key = normalizeKeyboardShortcutKey(token);
    if (!shortcut.key) {
      return null;
    }
  }

  return shortcut.mod && shortcut.key ? shortcut : null;
}

function normalizeKeyboardShortcutKey(value) {
  const token = String(value ?? "").trim();
  const normalizedToken = token.toLowerCase();
  const namedKeys = {
    arrowleft: "ArrowLeft",
    left: "ArrowLeft",
    arrowright: "ArrowRight",
    right: "ArrowRight",
    arrowup: "ArrowUp",
    up: "ArrowUp",
    arrowdown: "ArrowDown",
    down: "ArrowDown",
    enter: "Enter",
    return: "Enter",
    escape: "Escape",
    esc: "Escape",
    comma: ",",
    period: ".",
    dot: ".",
    slash: "/",
    backslash: "\\",
    backquote: "`",
    braceleft: "[",
    "{": "[",
    bracketleft: "[",
    leftbracket: "[",
    braceright: "]",
    "}": "]",
    bracketright: "]",
    rightbracket: "]",
    equal: "=",
    plus: "=",
    minus: "-",
    space: "Space",
  };

  if (namedKeys[normalizedToken]) {
    return namedKeys[normalizedToken];
  }

  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(token)) {
    return token.toUpperCase();
  }

  if (/^[a-z]$/i.test(token)) {
    return token.toUpperCase();
  }

  if (/^[0-9]$/.test(token)) {
    return token;
  }

  if (token.length === 1 && ",./;'[]\\=`-".includes(token)) {
    return token;
  }

  return null;
}

function formatKeyboardShortcutValue(shortcut) {
  return [
    shortcut.mod ? "Mod" : "",
    shortcut.alt ? "Alt" : "",
    shortcut.shift ? "Shift" : "",
    shortcut.key,
  ].filter(Boolean).join("+");
}

function normalizeTheme(value, fallback = DEFAULT_NOTE_THEME) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackTheme = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_NOTE_THEME;
  const migratedTabTextColor =
    normalizeHexColor(source.textColor, null) &&
    source.textColor.toLowerCase() !== "#211b0c"
      ? source.textColor.toLowerCase()
      : fallbackTheme.tabTextColor ?? DEFAULT_NOTE_THEME.tabTextColor;

  return {
    tabTextColor: normalizeHexColor(
      source.tabTextColor,
      migratedTabTextColor,
    ),
    tabTextOpacity: normalizeOpacity(
      source.tabTextOpacity,
      fallbackTheme.tabTextOpacity,
    ),
  };
}

function normalizeHexColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
    ? value.toLowerCase()
    : fallback;
}

function normalizeOpacity(value, fallback = DEFAULT_NOTE_THEME.tabTextOpacity) {
  const hasExplicitValue =
    typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "");
  const numericValue = hasExplicitValue ? Number(value) : NaN;
  if (Number.isFinite(numericValue)) {
    return clamp(numericValue, 0, 1);
  }

  const hasFallbackValue =
    typeof fallback === "number" ||
    (typeof fallback === "string" && fallback.trim() !== "");
  const fallbackValue = hasFallbackValue ? Number(fallback) : NaN;
  return Number.isFinite(fallbackValue)
    ? clamp(fallbackValue, 0, 1)
    : DEFAULT_NOTE_THEME.tabTextOpacity;
}

// Snaps to the nearest zoom step. Mirrors `normalizeAppZoom` in src/model/preferences.js.
function normalizeAppZoom(value, fallback = DEFAULT_APP_ZOOM) {
  const numericValue = Number(value);
  const fallbackValue = Number(fallback);
  const resolvedValue = Number.isFinite(numericValue)
    ? numericValue
    : Number.isFinite(fallbackValue)
      ? fallbackValue
      : DEFAULT_APP_ZOOM;

  return APP_ZOOM_LEVELS.reduce((nearest, level) =>
    Math.abs(level - resolvedValue) < Math.abs(nearest - resolvedValue) ? level : nearest);
}

function normalizeEditorFontFamily(value, fallback = DEFAULT_EDITOR_FONT_FAMILY) {
  const normalizedValue = normalizeEditorFontFamilyValue(value);
  if (isAllowedEditorFontFamily(normalizedValue)) {
    return normalizedValue;
  }

  const normalizedFallback = normalizeEditorFontFamilyValue(fallback);
  return isAllowedEditorFontFamily(normalizedFallback)
    ? normalizedFallback
    : DEFAULT_EDITOR_FONT_FAMILY;
}

function normalizeAppFontFamily(value, fallback = DEFAULT_APP_FONT_FAMILY) {
  const normalizedValue = normalizeEditorFontFamilyValue(value);
  if (isAllowedEditorFontFamily(normalizedValue)) {
    return normalizedValue;
  }

  const normalizedFallback = normalizeEditorFontFamilyValue(fallback);
  return isAllowedEditorFontFamily(normalizedFallback)
    ? normalizedFallback
    : DEFAULT_APP_FONT_FAMILY;
}

function normalizeEditorFontFamilyValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.replace(/\s+/g, " ").trim();
  if (trimmedValue.toLowerCase().startsWith(LOCAL_FONT_VALUE_PREFIX)) {
    const family = trimmedValue
      .slice(LOCAL_FONT_VALUE_PREFIX.length)
      .replace(/["\\]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    return family ? `${LOCAL_FONT_VALUE_PREFIX}${family}` : "";
  }

  return trimmedValue.toLowerCase();
}

function isAllowedEditorFontFamily(value) {
  return (
    EDITOR_FONT_FAMILIES.has(value) ||
    (
      typeof value === "string" &&
      value.startsWith(LOCAL_FONT_VALUE_PREFIX) &&
      value.length > LOCAL_FONT_VALUE_PREFIX.length
    )
  );
}

function normalizeBlocksJSON(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function normalizeBounds(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  return {
    x: Number.isFinite(source.x) ? source.x : fallback.x,
    y: Number.isFinite(source.y) ? source.y : fallback.y,
    width: clamp(
      Number.isFinite(source.width) ? source.width : fallback.width,
      MIN_NOTE_BOUNDS_WIDTH,
      2400,
    ),
    height: clamp(
      Number.isFinite(source.height) ? source.height : fallback.height,
      MIN_NOTE_BOUNDS_HEIGHT,
      1800,
    ),
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

// Twin of normalizeLook in src/model/look.js, with the same defaults, ranges and steps
// (tests/unit/look.test.cjs checks that they agree). The renderer bundles the built-in
// pictures; here only their ids are needed.
const LOOK_AREAS = ["sidebar", "header", "editor", "menus", "settings"];
const LOOK_BUILTIN_BACKGROUND_IDS = ["builtin:dawn"];
const LOOK_BACKGROUND_POSITIONS = [
  "left top",
  "center top",
  "right top",
  "left center",
  "center",
  "right center",
  "left bottom",
  "center bottom",
  "right bottom",
];
const LOOK_ASSET_URL_PATTERN = /^notepane-asset:\/\/local\/[0-9a-f]{64}\.[a-z0-9]{1,5}$/;
const LOOK_MAX_BACKGROUND_PICTURES = 12;
const DEFAULT_LOOK = Object.freeze({
  accentColor: null,
  corners: "default",
  fonts: Object.freeze({
    editorSize: 16,
    lineHeight: 1.5,
    letterSpacing: 0,
    blockSpacing: 0,
    textWidth: 820,
    headingFont: "same",
    headingWeight: 700,
    codeFont: "system",
    codeSize: 14,
    codeLigatures: true,
  }),
  background: Object.freeze({
    type: "none",
    color: "#dfe7f2",
    from: "#f7d9cf",
    to: "#c9d7f7",
    angle: 135,
    picture: "builtin:dawn",
    pictures: Object.freeze([]),
    fit: "cover",
    position: "center",
    blur: 0,
    brightness: 100,
    saturation: 100,
    tint: "#1b2a4a",
    tintAmount: 0,
    behindStickies: true,
    dimInDark: true,
  }),
  surfaces: Object.freeze({
    sidebar: Object.freeze({ fill: null, opacity: 72, blur: 16, border: "hairline" }),
    header: Object.freeze({ fill: null, opacity: 60, blur: 12, border: "hairline" }),
    editor: Object.freeze({ fill: null, opacity: 82, blur: 0, border: "none" }),
    menus: Object.freeze({ fill: null, opacity: 88, blur: 24, border: "hairline" }),
    settings: Object.freeze({ fill: null, opacity: 92, blur: 24, border: "hairline" }),
  }),
  tabs: Object.freeze({
    style: "outline",
    height: "regular",
    radius: 7,
    showNumbers: true,
    showShortcuts: true,
    colorStrength: 100,
    newTabColor: "none",
  }),
});

const asLookObject = (value) =>
  (value && typeof value === "object" && !Array.isArray(value) ? value : {});

function normalizeLookNumber(value, fallback, min, max, step) {
  const numeric =
    typeof value === "number" || (typeof value === "string" && value.trim() !== "")
      ? Number(value)
      : NaN;
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const snapped = min + Math.round((Math.min(Math.max(numeric, min), max) - min) / step) * step;
  return Math.min(Number(snapped.toFixed(2)), max);
}

function normalizeLookChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback;
}

function normalizeLookBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function isLookAssetUrl(value) {
  return typeof value === "string" && LOOK_ASSET_URL_PATTERN.test(value);
}

function normalizeLook(value) {
  const source = asLookObject(value);
  const fonts = asLookObject(source.fonts);
  const background = asLookObject(source.background);
  const surfaces = asLookObject(source.surfaces);
  const tabs = asLookObject(source.tabs);
  const defaultFonts = DEFAULT_LOOK.fonts;
  const defaultBackground = DEFAULT_LOOK.background;
  const defaultTabs = DEFAULT_LOOK.tabs;
  const pictures = [
    ...new Set(Array.isArray(background.pictures) ? background.pictures.filter(isLookAssetUrl) : []),
  ].slice(0, LOOK_MAX_BACKGROUND_PICTURES);
  return {
    accentColor: normalizeHexColor(source.accentColor, null),
    corners: normalizeLookChoice(source.corners, ["sharp", "default", "round"], DEFAULT_LOOK.corners),
    fonts: {
      editorSize: normalizeLookNumber(fonts.editorSize, defaultFonts.editorSize, 12, 24, 1),
      lineHeight: normalizeLookNumber(fonts.lineHeight, defaultFonts.lineHeight, 1.2, 2.2, 0.05),
      letterSpacing: normalizeLookNumber(fonts.letterSpacing, defaultFonts.letterSpacing, -0.03, 0.08, 0.01),
      blockSpacing: normalizeLookNumber(fonts.blockSpacing, defaultFonts.blockSpacing, 0, 24, 1),
      textWidth: normalizeLookNumber(fonts.textWidth, defaultFonts.textWidth, 560, 1100, 20),
      headingFont: normalizeLookChoice(
        fonts.headingFont,
        ["same", "serif", "display", "rounded"],
        defaultFonts.headingFont,
      ),
      headingWeight: normalizeLookChoice(Number(fonts.headingWeight), [600, 700, 800], defaultFonts.headingWeight),
      codeFont: normalizeLookChoice(
        fonts.codeFont,
        ["system", "menlo", "jetbrains", "courier"],
        defaultFonts.codeFont,
      ),
      codeSize: normalizeLookNumber(fonts.codeSize, defaultFonts.codeSize, 11, 20, 1),
      codeLigatures: normalizeLookBoolean(fonts.codeLigatures, defaultFonts.codeLigatures),
    },
    background: {
      type: normalizeLookChoice(background.type, ["none", "color", "gradient", "picture"], defaultBackground.type),
      color: normalizeHexColor(background.color, defaultBackground.color),
      from: normalizeHexColor(background.from, defaultBackground.from),
      to: normalizeHexColor(background.to, defaultBackground.to),
      angle: normalizeLookNumber(background.angle, defaultBackground.angle, 0, 360, 1),
      picture:
        LOOK_BUILTIN_BACKGROUND_IDS.includes(background.picture) || isLookAssetUrl(background.picture)
          ? background.picture
          : defaultBackground.picture,
      pictures,
      fit: normalizeLookChoice(background.fit, ["cover", "contain", "tile"], defaultBackground.fit),
      position: normalizeLookChoice(background.position, LOOK_BACKGROUND_POSITIONS, defaultBackground.position),
      blur: normalizeLookNumber(background.blur, defaultBackground.blur, 0, 64, 1),
      brightness: normalizeLookNumber(background.brightness, defaultBackground.brightness, 40, 160, 1),
      saturation: normalizeLookNumber(background.saturation, defaultBackground.saturation, 0, 200, 1),
      tint: normalizeHexColor(background.tint, defaultBackground.tint),
      tintAmount: normalizeLookNumber(background.tintAmount, defaultBackground.tintAmount, 0, 80, 1),
      behindStickies: normalizeLookBoolean(background.behindStickies, defaultBackground.behindStickies),
      dimInDark: normalizeLookBoolean(background.dimInDark, defaultBackground.dimInDark),
    },
    surfaces: Object.fromEntries(
      LOOK_AREAS.map((area) => {
        const surface = asLookObject(surfaces[area]);
        const fallback = DEFAULT_LOOK.surfaces[area];
        return [area, {
          fill: normalizeHexColor(surface.fill, null),
          opacity: normalizeLookNumber(surface.opacity, fallback.opacity, 0, 100, 1),
          blur: normalizeLookNumber(surface.blur, fallback.blur, 0, 40, 1),
          border: normalizeLookChoice(surface.border, ["none", "hairline", "strong"], fallback.border),
        }];
      }),
    ),
    tabs: {
      style: normalizeLookChoice(tabs.style, ["plain", "outline", "filled"], defaultTabs.style),
      height: normalizeLookChoice(tabs.height, ["compact", "regular", "tall"], defaultTabs.height),
      radius: normalizeLookNumber(tabs.radius, defaultTabs.radius, 0, 14, 1),
      showNumbers: normalizeLookBoolean(tabs.showNumbers, defaultTabs.showNumbers),
      showShortcuts: normalizeLookBoolean(tabs.showShortcuts, defaultTabs.showShortcuts),
      colorStrength: normalizeLookNumber(tabs.colorStrength, defaultTabs.colorStrength, 20, 100, 1),
      newTabColor: normalizeLookChoice(tabs.newTabColor, ["none", "cycle"], defaultTabs.newTabColor),
    },
  };
}

module.exports = {
  StickyStore,
  NOTE_PANE_BACKUP_FORMAT,
  NOTE_PANE_BACKUP_VERSION,
  DEFAULT_NOTE_TITLE,
  DEFAULT_APP_THEME,
  DEFAULT_LAYOUT_MODE,
  DEFAULT_NOTE_THEME,
  DEFAULT_THEME,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_APP_FONT_FAMILY,
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
  normalizeAppTheme,
  normalizeAppZoom,
  normalizeBlocksJSON,
  normalizeEditorPreferences,
  normalizeLook,
  normalizeNoteTags,
};
