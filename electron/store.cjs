const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const DEFAULT_NOTE_TITLE = "Untitled";
const NOTE_PANE_BACKUP_FORMAT = "notepane-backup";
const NOTE_PANE_BACKUP_VERSION = 1;
const NOTE_HISTORY_VERSION = 2;
const MAX_NOTE_HISTORY = 50;
const NOTE_HISTORY_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_NOTE_TITLE_MAX_LENGTH = 48;
const DEFAULT_APP_THEME = Object.freeze({
  mode: "light",
});
const DEFAULT_LAYOUT_MODE = "tabs";
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
const DEFAULT_EDITOR_FONT_SCALE = 1;
const MIN_EDITOR_FONT_SCALE = 0.38;
const MAX_EDITOR_FONT_SCALE = 9;
const DEFAULT_EDITOR_FONT_FAMILY = "system";
const DEFAULT_APP_FONT_FAMILY = "inter";
const DEFAULT_KEYBOARD_SHORTCUTS = Object.freeze({
  newSession: "Mod+T",
  newNote: "Mod+N",
  closeWindow: "Mod+W",
  focusEditor: "Mod+Enter",
  previousTab: "Mod+Alt+ArrowLeft",
  nextTab: "Mod+Alt+ArrowRight",
  moveTabLeft: "Mod+Shift+[",
  moveTabRight: "Mod+Shift+]",
  toggleSidebar: "Mod+Shift+B",
  toggleLayoutMode: "Mod+Shift+T",
  toggleTableOfContents: "Mod+Shift+O",
  toggleThemeMode: "Mod+Shift+L",
  exportPdf: "Mod+Shift+E",
  preferences: "Mod+,",
  increaseEditorFontSize: "Mod+=",
  decreaseEditorFontSize: "Mod+-",
  attachDetachedNote: "Mod+Shift+D",
  toggleAlwaysOnTop: "Mod+Shift+P",
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
  editorFontScale: DEFAULT_EDITOR_FONT_SCALE,
  editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
  appFontFamily: DEFAULT_APP_FONT_FAMILY,
  showTableOfContents: false,
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
    this.state = {
      appTheme: DEFAULT_APP_THEME,
      layoutMode: DEFAULT_LAYOUT_MODE,
      editorPreferences: DEFAULT_EDITOR_PREFERENCES,
      notes: [],
    };
    this.load();
    this.loadHistory();
  }

  load() {
    if (!fs.existsSync(this.filePath)) {
      this.state = {
        appTheme: DEFAULT_APP_THEME,
        layoutMode: DEFAULT_LAYOUT_MODE,
        editorPreferences: DEFAULT_EDITOR_PREFERENCES,
        notes: [],
      };
      return;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      const parsedObject = parsed && typeof parsed === "object" ? parsed : {};
      const notes = Array.isArray(parsed) ? parsed : parsedObject.notes;
      const rawNotes = Array.isArray(notes) ? notes : [];
      const version = Number.isFinite(parsedObject.version)
        ? parsedObject.version
        : 1;
      const resetLegacyAlwaysOnTop = version < 3;
      const editorPreferences = normalizeEditorPreferences(
        migrateLegacyEditorPreferences(parsedObject.editorPreferences, version),
      );
      this.state = {
        appTheme: normalizeAppTheme(
          Array.isArray(parsed)
            ? inferLegacyAppTheme(rawNotes)
            : parsedObject.appTheme ?? inferLegacyAppTheme(rawNotes),
        ),
        layoutMode: normalizeLayoutMode(parsedObject.layoutMode),
        editorPreferences,
        notes: backfillMissingSortOrders(
          rawNotes.map((note) =>
            normalizeNote(note, { resetLegacyAlwaysOnTop, editorPreferences }),
          ),
        ),
      };
    } catch (error) {
      this.backupCorruptedFile();
      this.state = {
        appTheme: DEFAULT_APP_THEME,
        layoutMode: DEFAULT_LAYOUT_MODE,
        editorPreferences: DEFAULT_EDITOR_PREFERENCES,
        notes: [],
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
      this.history = parsed && typeof parsed.notes === "object" ? parsed.notes : {};
    } catch (error) {
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
      blocksJSON: normalizeBlocksJSON(snapshot.blocksJSON ?? note.blocksJSON),
      markdown: typeof snapshot.markdown === "string" ? snapshot.markdown : note.markdown,
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
      detached: false,
      seedDemoContent,
      editorFontScale: Object.hasOwn(options, "editorFontScale")
        ? options.editorFontScale
        : editorPreferences.editorFontScale,
      editorFontFamily: Object.hasOwn(options, "editorFontFamily")
        ? options.editorFontFamily
        : editorPreferences.editorFontFamily,
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
    note.detached = false;
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
      detached: false,
      seedDemoContent: true,
      editorFontScale: sourceNote.editorFontScale ?? editorPreferences.editorFontScale,
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
    note.detached = false;
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

    const nextBlocksJSON = normalizeBlocksJSON(blocksJSON);
    const nextMarkdown = typeof markdown === "string" ? markdown : "";
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

  setDetached(noteId, detached) {
    const note = this.getNote(noteId);
    if (!note) {
      return null;
    }

    note.detached = Boolean(detached);
    note.updatedAt = Date.now();
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
      data: JSON.parse(JSON.stringify(this.state)),
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
    this.state = normalizedBackup.data;
    try {
      this.save();
    } catch (error) {
      this.state = previousState;
      throw error;
    }
    return this.inspectBackup(normalizedBackup);
  }

  save() {
    writeJsonAtomic(this.filePath, {
      version: 11,
      appTheme: this.state.appTheme,
      layoutMode: this.state.layoutMode,
      editorPreferences: this.state.editorPreferences,
      notes: this.state.notes,
    });
  }

  backupCorruptedFile() {
    if (!fs.existsSync(this.filePath)) {
      return;
    }

    const timestamp = new Date().toISOString().replaceAll(":", "-");
    const backupPath = path.join(
      this.directoryPath,
      `notes-corrupted-${timestamp}.json`,
    );
    try {
      fs.copyFileSync(this.filePath, backupPath);
    } catch {
      // Best-effort backup only.
    }
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

  const editorPreferences = normalizeEditorPreferences(data.editorPreferences);
  const notes = backfillMissingSortOrders(
    data.notes.map((note) => normalizeNote(note, { editorPreferences })),
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
      editorPreferences,
      notes,
    },
  };
}

function normalizeBackupExportedAt(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("The NotePane backup has an invalid export date.");
  }
  return new Date(value).toISOString();
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
}

function normalizeNote(value, options = {}) {
  const now = Date.now();
  const source = value && typeof value === "object" ? value : {};
  const resetLegacyAlwaysOnTop = Boolean(options.resetLegacyAlwaysOnTop);
  const editorPreferences = normalizeEditorPreferences(options.editorPreferences);
  const blocksJSON = normalizeBlocksJSON(source.blocksJSON);
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
    detached: typeof source.detached === "boolean" ? source.detached : false,
    seedDemoContent: typeof source.seedDemoContent === "boolean"
      ? source.seedDemoContent
      : false,
    editorFontScale: normalizeEditorFontScale(
      source.editorFontScale,
      editorPreferences.editorFontScale,
    ),
    editorFontFamily: normalizeEditorFontFamily(
      source.editorFontFamily,
      editorPreferences.editorFontFamily,
    ),
    trashedAt: normalizeTimestamp(source.trashedAt),
    sortOrder: normalizeSortOrder(source.sortOrder),
    createdAt: Number.isFinite(source.createdAt) ? source.createdAt : now,
    updatedAt: Number.isFinite(source.updatedAt) ? source.updatedAt : now,
  };
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
  const source = value && typeof value === "object" ? value : {};
  const keyboardShortcuts = source.keyboardShortcuts;
  if (!keyboardShortcuts || typeof keyboardShortcuts !== "object") {
    return value;
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

function normalizeAppTheme(value, fallback = DEFAULT_APP_THEME) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackTheme = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_APP_THEME;

  if (source.mode === "dark" || source.mode === "light") {
    return {
      mode: source.mode,
    };
  }

  return {
    mode: fallbackTheme.mode === "dark" ? "dark" : "light",
  };
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

function normalizeEditorPreferences(
  value,
  fallback = DEFAULT_EDITOR_PREFERENCES,
) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackSource = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_EDITOR_PREFERENCES;

  return {
    editorFontScale: normalizeEditorFontScale(
      source.editorFontScale,
      fallbackSource.editorFontScale,
    ),
    editorFontFamily: normalizeEditorFontFamily(
      source.editorFontFamily,
      fallbackSource.editorFontFamily,
    ),
    appFontFamily: normalizeAppFontFamily(
      source.appFontFamily,
      fallbackSource.appFontFamily,
    ),
    showTableOfContents:
      typeof source.showTableOfContents === "boolean"
        ? source.showTableOfContents
        : Boolean(fallbackSource.showTableOfContents),
    keyboardShortcuts: normalizeKeyboardShortcuts(
      source.keyboardShortcuts,
      fallbackSource.keyboardShortcuts,
    ),
    keyboardShortcutEnabled: normalizeKeyboardShortcutEnabled(
      source.keyboardShortcutEnabled,
      fallbackSource.keyboardShortcutEnabled,
    ),
  };
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

function normalizeEditorFontScale(value, fallback = DEFAULT_EDITOR_FONT_SCALE) {
  const numericValue = Number(value);
  const fallbackValue = Number(fallback);
  const resolvedValue = Number.isFinite(numericValue)
    ? numericValue
    : Number.isFinite(fallbackValue)
      ? fallbackValue
      : DEFAULT_EDITOR_FONT_SCALE;

  return Math.round(
    clamp(resolvedValue, MIN_EDITOR_FONT_SCALE, MAX_EDITOR_FONT_SCALE) * 100,
  ) / 100;
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

module.exports = {
  StickyStore,
  NOTE_PANE_BACKUP_FORMAT,
  NOTE_PANE_BACKUP_VERSION,
  DEFAULT_NOTE_TITLE,
  DEFAULT_APP_THEME,
  DEFAULT_LAYOUT_MODE,
  DEFAULT_NOTE_THEME,
  DEFAULT_THEME,
  DEFAULT_EDITOR_FONT_SCALE,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_APP_FONT_FAMILY,
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
};
