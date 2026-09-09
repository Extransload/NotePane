const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { fileURLToPath } = require("url");
const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  shell,
  dialog,
  screen,
} = require("electron");
const {
  StickyStore,
  DEFAULT_KEYBOARD_SHORTCUTS,
} = require("./store.cjs");

const APP_NAME = "NotePane";
const execFileAsync = promisify(execFile);
const ICON_PNG_PATH = path.join(__dirname, "..", "build", "icon.png");
const TABS_MIN_WIDTH = 640;
const TABS_MIN_HEIGHT = 500;
const STICKY_WINDOW_WIDTH = 420;
const STICKY_WINDOW_HEIGHT = 340;
const STICKY_MIN_WIDTH = 320;
const STICKY_MIN_HEIGHT = 260;
const STICKY_WINDOW_GAP = 18;
const STICKY_WINDOW_MARGIN = 28;
const TRAFFIC_LIGHT_X = 14;
const TABS_TRAFFIC_LIGHT_Y = 15;
const STICKY_TRAFFIC_LIGHT_Y = 10;
const LAYOUT_MODE_TRANSITION_READY_TIMEOUT_MS = 4500;
const STICKY_PASTEL_PALETTE = [
  "#fff2b8",
  "#ffd7e8",
  "#dff4d7",
  "#d9efff",
  "#eadcff",
  "#ffe4ca",
];
const windows = new Map();
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const userDataDirOverride = process.env.BLOCKNOTE_STICKY_USER_DATA_DIR;
const exportDirectoryOverride = process.env.BLOCKNOTE_STICKY_EXPORT_DIR;
const backupImportFileOverride = process.env.BLOCKNOTE_STICKY_IMPORT_FILE;
const backupImportConfirmOverride = process.env.BLOCKNOTE_STICKY_IMPORT_CONFIRM;
const MAX_BACKUP_FILE_SIZE = 512 * 1024 * 1024;

let store;
let quitting = false;
let backupOperationInProgress = false;
const manuallyClosedStickyNoteIds = new Set();
let installedFontsPromise = null;

if (isWsl()) {
  // WSL's X/Wayland bridge can tear down Electron's GPU process between launches.
  app.disableHardwareAcceleration();
}

if (userDataDirOverride) {
  app.setPath("userData", userDataDirOverride);
}

function isWsl() {
  return (
    process.platform === "linux" &&
    (Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) ||
      /microsoft|wsl/i.test(os.release()))
  );
}

function createWindow(note, options = {}) {
  const isPrimary = Boolean(options.primary);
  const trafficLightPosition = resolveTrafficLightPosition(isPrimary);
  const visibleBounds = normalizeWindowBounds(note.bounds, {
    minWidth: isPrimary ? TABS_MIN_WIDTH : STICKY_MIN_WIDTH,
    minHeight: isPrimary ? TABS_MIN_HEIGHT : STICKY_MIN_HEIGHT,
  });
  const window = new BrowserWindow({
    ...visibleBounds,
    minWidth: isPrimary ? TABS_MIN_WIDTH : STICKY_MIN_WIDTH,
    minHeight: isPrimary ? TABS_MIN_HEIGHT : STICKY_MIN_HEIGHT,
    title: note.title,
    ...getWindowChromeOptions(isPrimary, trafficLightPosition),
    hasShadow: true,
    alwaysOnTop: note.alwaysOnTop,
    icon: ICON_PNG_PATH,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  window.setWindowButtonVisibility?.(true);
  if (process.platform === "win32") {
    window.setMenuBarVisibility(isPrimary);
  }
  applyWindowChrome(window, isPrimary);

  windows.set(window.id, {
    window,
    noteId: note.id,
    primary: Boolean(options.primary),
  });

  window.__notepaneReadyToShow = false;
  window.once("ready-to-show", () => {
    window.__notepaneReadyToShow = true;
    window.show();
    window.focus();
  });

  window.on("moved", () => persistWindowBounds(window));
  window.on("resized", () => persistWindowBounds(window));
  window.on("close", () => persistWindowBounds(window));
  window.on("closed", () => {
    const closedEntry = windows.get(window.id);
    windows.delete(window.id);
    if (
      !quitting &&
      store?.getLayoutMode?.() === "sticky" &&
      closedEntry?.noteId &&
      !closedEntry.closingProgrammatically
    ) {
      manuallyClosedStickyNoteIds.add(closedEntry.noteId);
    }
    if (restoreTabsModeAfterLastStickyWindowClosed(closedEntry?.noteId)) {
      return;
    }
    if (!quitting && windows.size === 0) {
      app.dock?.show();
    }
  });

  if (devServerUrl) {
    window.loadURL(`${devServerUrl}?noteId=${encodeURIComponent(note.id)}`);
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
      query: { noteId: note.id },
    });
  }

  return window;
}

function getWindowChromeOptions(isPrimary, trafficLightPosition) {
  if (process.platform === "win32") {
    if (!isPrimary) {
      return {
        // Sticky windows keep their compact in-app header instead of a second
        // Windows caption bar.
        frame: false,
        transparent: false,
        backgroundColor: "#f7f7f5",
      };
    }

    return {
      // Keep Windows responsible for caption buttons, resize borders, and shadows.
      frame: true,
      transparent: false,
      backgroundColor: "#f7f7f5",
    };
  }

  return {
    frame: false,
    titleBarStyle: "hidden",
    trafficLightPosition,
    transparent: true,
    backgroundColor: "#00000000",
  };
}

function resolveTrafficLightPosition(isPrimary) {
  return {
    x: TRAFFIC_LIGHT_X,
    y: isPrimary ? TABS_TRAFFIC_LIGHT_Y : STICKY_TRAFFIC_LIGHT_Y,
  };
}

function applyTrafficLightPosition(window, isPrimary) {
  const trafficLightPosition = resolveTrafficLightPosition(Boolean(isPrimary));
  window.__notepaneTrafficLightPosition = trafficLightPosition;
  window.setWindowButtonPosition?.(trafficLightPosition);
  window.setTrafficLightPosition?.(trafficLightPosition);
}

function applyWindowChrome(window, isPrimary) {
  window.setHasShadow?.(true);
  if (process.platform === "darwin") {
    applyTrafficLightPosition(window, isPrimary);
  }
}

function createNewNoteWindow() {
  const layoutMode = store.getLayoutMode();
  const note = createNoteForLayoutMode(nextWindowBounds(), layoutMode);
  if (layoutMode === "sticky") {
    return createWindow(note);
  }

  const window = ensureTabsWindow(note.id);
  broadcastNotesChanged({ activeNote: note });
  return window;
}

function requestNewNoteWindow() {
  if (store.getLayoutMode() !== "tabs") {
    return createNewNoteWindow();
  }

  const window = getCommandTargetWindow();
  if (!window || window.isDestroyed()) {
    return createNewNoteWindow();
  }

  window.show();
  window.focus();
  window.webContents.send("notes:create-requested");
  return window;
}

function createNoteForLayoutMode(
  bounds,
  layoutMode = store.getLayoutMode(),
  creationOptions = {},
) {
  const options = {
    template: creationOptions?.template === "default" ? "default" : "blank",
  };
  if (layoutMode === "sticky") {
    options.theme = createDefaultStickyTheme(store.listNotes().length);
  }

  return store.createNote(bounds, options);
}

function createDefaultStickyTheme(noteIndex = 0) {
  const accentColor =
    STICKY_PASTEL_PALETTE[
      Math.abs(Number.isFinite(noteIndex) ? noteIndex : 0) %
        STICKY_PASTEL_PALETTE.length
    ];

  return {
    tabTextColor: accentColor,
    tabTextOpacity: 1,
  };
}

function showAllNotes() {
  manuallyClosedStickyNoteIds.clear();
  syncWindowsForLayoutMode(undefined, { reopenClosedStickyWindows: true });

  for (const { window } of windows.values()) {
    revealWindow(window);
  }
}

function focusNextWindow() {
  const liveWindows = [...windows.values()]
    .map((entry) => entry.window)
    .filter((window) => !window.isDestroyed());

  if (liveWindows.length === 0) {
    return;
  }

  const focused = BrowserWindow.getFocusedWindow();
  const index = focused ? liveWindows.indexOf(focused) : -1;
  liveWindows[(index + 1) % liveWindows.length].focus();
}

function closeFocusedTabOrWindow() {
  const window = getCommandTargetWindow();
  if (!window) {
    return;
  }

  if (store?.getLayoutMode?.() !== "sticky") {
    window.webContents.send("tabs:close-requested");
    return;
  }

  window.close();
}

function closeTabSession(noteId) {
  const dockedNotes = store.listNotes().filter((note) => !note.detached);
  if (dockedNotes.length === 0) {
    return;
  }

  const currentIndex = dockedNotes.findIndex((note) => note.id === noteId);
  if (currentIndex < 0) {
    return;
  }

  const fallbackNote =
    dockedNotes[currentIndex + 1] ?? dockedNotes[currentIndex - 1] ?? null;
  const result = store.deleteNote(noteId);
  const nextActiveNote =
    (fallbackNote ? store.getNote(fallbackNote.id) : null) ??
    result.activeNote ??
    getMainTabsNote();

  const primaryEntry = getPrimaryEntry();
  if (primaryEntry && nextActiveNote) {
    primaryEntry.noteId = nextActiveNote.id;
    primaryEntry.window.setTitle(nextActiveNote.title);
  }

  for (const entry of getEntriesForNote(noteId)) {
    closeWindowEntry(entry);
  }

  syncWindowsForLayoutMode(nextActiveNote?.id);
  broadcastNotesChanged({ activeNote: nextActiveNote });
}

function toggleFocusedAlwaysOnTop() {
  const window = getCommandTargetWindow();
  if (!window) {
    return;
  }

  const nextValue = !window.isAlwaysOnTop();
  window.setAlwaysOnTop(nextValue);

  const entry = windows.get(window.id);
  if (entry) {
    const updatedNote = store.setAlwaysOnTop(entry.noteId, nextValue);
    if (updatedNote) {
      broadcastNotesChanged({ activeNote: updatedNote });
    }
  }
}

function openPreferences() {
  const window = getCommandTargetWindow();

  if (!window || window.isDestroyed()) {
    return;
  }

  window.show();
  window.focus();
  window.webContents.send("preferences:open");
}

function getCommandTargetWindow() {
  return (
    BrowserWindow.getFocusedWindow() ??
    getPrimaryEntry()?.window ??
    BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed()) ??
    null
  );
}

function broadcastAppTheme(appTheme) {
  for (const { window } of windows.values()) {
    if (!window.isDestroyed()) {
      window.webContents.send("app-theme:changed", appTheme);
    }
  }
}

function broadcastLayoutMode(layoutMode) {
  for (const { window } of windows.values()) {
    if (!window.isDestroyed()) {
      window.webContents.send("layout-mode:changed", layoutMode);
    }
  }
}

function broadcastLayoutModeTransition(payload) {
  for (const { window } of windows.values()) {
    if (!window.isDestroyed()) {
      window.webContents.send("layout-mode:transition", payload);
    }
  }
}

function broadcastEditorPreferences(editorPreferences) {
  for (const { window } of windows.values()) {
    if (!window.isDestroyed()) {
      window.webContents.send("editor-preferences:changed", editorPreferences);
    }
  }
}

function broadcastNotesChanged(payload = {}) {
  const notes = store.listNotes();
  const trash = store.listTrash();
  for (const entry of windows.values()) {
    const { window } = entry;
    if (!window.isDestroyed()) {
      const activeNote = resolveActiveNoteForWindow(entry, payload.activeNote);
      window.webContents.send("notes:changed", {
        notes,
        trash,
        activeNote,
      });
    }
  }
}

function resolveActiveNoteForWindow(entry, activeNote) {
  if (!activeNote?.id) {
    return null;
  }

  if (entry.primary || entry.noteId === activeNote.id) {
    return activeNote;
  }

  return null;
}

function getPrimaryEntry() {
  return [...windows.values()].find(
    (entry) => entry.primary && !entry.window.isDestroyed(),
  );
}

function getEntriesForNote(noteId) {
  return [...windows.values()].filter(
    (entry) => entry.noteId === noteId && !entry.window.isDestroyed(),
  );
}

function getMainTabsNote(fallbackNoteId) {
  const notes = store.listNotes();
  const dockedNotes = notes.filter((note) => !note.detached);
  return (
    dockedNotes.find((note) => note.id === fallbackNoteId) ??
    dockedNotes[0] ??
    notes[0] ??
    null
  );
}

function ensureTabsWindow(activeNoteId) {
  const note = getMainTabsNote(activeNoteId);
  if (!note) {
    return null;
  }

  const primaryEntry = getPrimaryEntry();
  if (primaryEntry) {
    primaryEntry.noteId = note.id;
    primaryEntry.window.setMinimumSize(TABS_MIN_WIDTH, TABS_MIN_HEIGHT);
    primaryEntry.window.setTitle(note.title);
    primaryEntry.window.webContents.send("notes:changed", {
      notes: store.listNotes(),
      trash: store.listTrash(),
      activeNote: note,
    });
    primaryEntry.window.show();
    return primaryEntry.window;
  }

  return createWindow(note, { primary: true });
}

function waitForWindowReadyToShow(window, timeoutMs = LAYOUT_MODE_TRANSITION_READY_TIMEOUT_MS) {
  if (!window || window.isDestroyed() || window.__notepaneReadyToShow || window.isVisible()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let done = false;
    let timeoutId = null;

    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (!window.isDestroyed()) {
        window.removeListener("ready-to-show", finish);
        window.webContents.removeListener("did-finish-load", finish);
        window.webContents.removeListener("did-fail-load", finish);
      }
      resolve();
    };

    timeoutId = setTimeout(finish, timeoutMs);
    window.once("ready-to-show", finish);
    window.webContents.once("did-finish-load", finish);
    window.webContents.once("did-fail-load", finish);
  });
}

async function waitForWindowsReadyToShow(targetWindows) {
  const uniqueWindows = [...new Set(targetWindows)]
    .filter((window) => window && !window.isDestroyed());

  await Promise.all(uniqueWindows.map((window) => waitForWindowReadyToShow(window)));
}

function ensureWindowForNote(note) {
  const existing = getEntriesForNote(note.id)
    .find((entry) => !entry.primary);
  if (existing) {
    existing.window.setMinimumSize(STICKY_MIN_WIDTH, STICKY_MIN_HEIGHT);
    existing.window.setTitle(note.title);
    revealWindow(existing.window);
    return existing.window;
  }

  return createWindow(note);
}

function revealWindow(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  if (typeof window.showInactive === "function") {
    window.showInactive();
    return;
  }

  window.show();
}

function closeWindowEntry(entry) {
  if (!entry || entry.window.isDestroyed()) {
    return;
  }

  entry.closingProgrammatically = true;
  persistWindowBounds(entry.window);
  entry.window.close();
}

function restoreTabsModeAfterLastStickyWindowClosed(activeNoteId) {
  if (
    quitting ||
    windows.size !== 0 ||
    store?.getLayoutMode?.() !== "sticky"
  ) {
    return false;
  }

  const activeNote =
    (typeof activeNoteId === "string" ? store.getNote(activeNoteId) : null) ??
    getMainTabsNote();

  store.updateLayoutMode("tabs");
  manuallyClosedStickyNoteIds.clear();
  syncWindowsForLayoutMode(activeNote?.id);
  broadcastLayoutMode("tabs");
  broadcastNotesChanged({ activeNote });
  return true;
}

function recreateWindowsForLayoutMode(activeNoteId, options = {}) {
  const previousEntries = [...windows.values()];
  const notes = store.listNotes();
  const layoutMode = store.getLayoutMode();
  const nextWindows = [];

  // `frame` is immutable in Electron. Open replacements before tearing down
  // the old windows so Windows does not treat a layout transition as app exit.
  for (const entry of previousEntries) {
    entry.closingProgrammatically = true;
    entry.primary = false;
    if (options.persistExistingBounds !== false) {
      persistWindowBounds(entry.window);
    }
  }

  if (layoutMode === "sticky") {
    for (const note of notes) {
      nextWindows.push(createWindow(note));
    }
    if (options.arrangeStickyWindows) {
      arrangeStickyWindows(notes);
    }
  } else {
    const primaryNote = getMainTabsNote(activeNoteId);
    if (primaryNote) {
      nextWindows.push(createWindow(primaryNote, { primary: true }));
    }

    for (const note of notes) {
      if (note.detached && note.id !== primaryNote?.id) {
        nextWindows.push(createWindow(note));
      }
    }
  }

  for (const entry of previousEntries) {
    if (!entry.window.isDestroyed()) {
      entry.window.destroy();
    }
  }

  return nextWindows;
}

function syncWindowsForLayoutMode(activeNoteId, options = {}) {
  const notes = store.listNotes();
  const noteIds = new Set(notes.map((note) => note.id));
  const layoutMode = store.getLayoutMode();
  const targetWindows = new Set();

  for (const entry of [...windows.values()]) {
    if (!noteIds.has(entry.noteId)) {
      closeWindowEntry(entry);
    }
  }
  for (const closedNoteId of [...manuallyClosedStickyNoteIds]) {
    if (!noteIds.has(closedNoteId)) {
      manuallyClosedStickyNoteIds.delete(closedNoteId);
    }
  }

  if (layoutMode === "sticky") {
    for (const entry of windows.values()) {
      entry.primary = false;
      entry.window.setMinimumSize(STICKY_MIN_WIDTH, STICKY_MIN_HEIGHT);
      applyWindowChrome(entry.window, false);
      targetWindows.add(entry.window);
    }
    for (const note of notes) {
      if (
        manuallyClosedStickyNoteIds.has(note.id) &&
        !options.reopenClosedStickyWindows
      ) {
        continue;
      }
      const window = ensureWindowForNote(note);
      if (window) {
        targetWindows.add(window);
      }
    }
    if (options.arrangeStickyWindows) {
      arrangeStickyWindows(notes);
    }
    return [...targetWindows];
  }

  const primaryWindow = ensureTabsWindow(activeNoteId);
  const primaryId = primaryWindow?.id;
  if (primaryWindow) {
    targetWindows.add(primaryWindow);
  }
  const detachedIds = new Set(notes.filter((note) => note.detached).map((note) => note.id));

  for (const note of notes) {
    if (note.detached) {
      const window = ensureWindowForNote(note);
      if (window) {
        targetWindows.add(window);
      }
    }
  }

  for (const entry of [...windows.values()]) {
    if (entry.window.id === primaryId) {
      entry.primary = true;
      applyWindowChrome(entry.window, true);
      continue;
    }

    const note = store.getNote(entry.noteId);
    const shouldRemainDetached = note && detachedIds.has(note.id);
    if (!shouldRemainDetached) {
      closeWindowEntry(entry);
    }
  }

  return [...targetWindows];
}

async function updateLayoutMode(layoutMode, options = {}) {
  const previousLayoutMode = store.getLayoutMode();
  const nextLayoutMode = store.updateLayoutMode(layoutMode);
  const isChangingMode = previousLayoutMode !== nextLayoutMode;
  const activeNoteId = options.activeNoteId;

  if (isChangingMode) {
    broadcastLayoutModeTransition({
      phase: "start",
      sourceMode: previousLayoutMode,
      targetMode: nextLayoutMode,
      noteCount: store.listNotes().length,
    });
  }

  try {
    if (nextLayoutMode === "sticky") {
      manuallyClosedStickyNoteIds.clear();
    }
    buildMenu();
    const windowSyncOptions = {
      reopenClosedStickyWindows: nextLayoutMode === "sticky",
      arrangeStickyWindows:
        previousLayoutMode !== "sticky" && nextLayoutMode === "sticky",
    };
    const targetWindows = isChangingMode && process.platform === "win32"
      ? recreateWindowsForLayoutMode(activeNoteId, windowSyncOptions)
      : syncWindowsForLayoutMode(activeNoteId, windowSyncOptions);
    broadcastLayoutMode(nextLayoutMode);
    broadcastNotesChanged();
    await waitForWindowsReadyToShow(targetWindows ?? []);
    return nextLayoutMode;
  } finally {
    if (isChangingMode) {
      broadcastLayoutModeTransition({
        phase: "finish",
        sourceMode: previousLayoutMode,
        targetMode: nextLayoutMode,
        noteCount: store.listNotes().length,
      });
    }
  }
}

function arrangeStickyWindows(notes) {
  const visibleNotes = notes.filter(
    (note) => !manuallyClosedStickyNoteIds.has(note.id),
  );
  if (visibleNotes.length === 0) {
    return;
  }

  const workArea = screen.getPrimaryDisplay().workArea;
  const availableWidth = Math.max(
    STICKY_WINDOW_WIDTH,
    workArea.width - STICKY_WINDOW_MARGIN * 2,
  );
  const columns = Math.max(
    1,
    Math.min(
      visibleNotes.length,
      Math.floor(
        (availableWidth + STICKY_WINDOW_GAP) /
          (STICKY_WINDOW_WIDTH + STICKY_WINDOW_GAP),
      ),
    ),
  );

  visibleNotes.forEach((note, index) => {
    const entry = getEntriesForNote(note.id).find((candidate) => !candidate.primary);
    if (!entry || entry.window.isDestroyed()) {
      return;
    }

    const row = Math.floor(index / columns);
    const column = index % columns;
    const bounds = {
      x: workArea.x +
        STICKY_WINDOW_MARGIN +
        column * (STICKY_WINDOW_WIDTH + STICKY_WINDOW_GAP),
      y: workArea.y +
        STICKY_WINDOW_MARGIN +
        row * (STICKY_WINDOW_HEIGHT + STICKY_WINDOW_GAP),
      width: STICKY_WINDOW_WIDTH,
      height: STICKY_WINDOW_HEIGHT,
    };

    entry.window.setBounds(bounds, true);
    store.updateBounds(note.id, bounds);
  });
}

function buildMenu() {
  const isTabsMode = store?.getLayoutMode?.() !== "sticky";
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: getMenuItemLabel("Preferences", "preferences"),
          accelerator:
            process.platform === "win32"
              ? undefined
              : getMenuAccelerator("preferences"),
          click: openPreferences,
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New Tab",
          accelerator: isTabsMode ? getMenuAccelerator("newSession") : undefined,
          click: requestNewNoteWindow,
        },
        {
          label: "New Note",
          accelerator: isTabsMode ? getMenuAccelerator("newNote") : undefined,
          click: requestNewNoteWindow,
        },
        { type: "separator" },
        {
          label: isTabsMode ? "Close Tab" : "Close Window",
          accelerator: getMenuAccelerator("closeWindow"),
          click: closeFocusedTabOrWindow,
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Table of Contents",
          accelerator: getMenuAccelerator("toggleTableOfContents"),
          click: toggleTableOfContents,
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Window",
      submenu: [
        {
          label: "Show All NotePanes",
          accelerator: "CommandOrControl+Shift+0",
          click: showAllNotes,
        },
        {
          label: "Cycle Through NotePanes",
          accelerator: "CommandOrControl+`",
          click: focusNextWindow,
        },
        {
          label: "Toggle Tabs / Sticky Mode",
          accelerator: getMenuAccelerator("toggleLayoutMode"),
          click: () => {
            const nextMode = store.getLayoutMode() === "tabs" ? "sticky" : "tabs";
            void updateLayoutMode(nextMode);
          },
        },
        {
          label: "Toggle Always On Top",
          accelerator: getMenuAccelerator("toggleAlwaysOnTop"),
          click: toggleFocusedAlwaysOnTop,
        },
        { type: "separator" },
        { role: "minimize" },
        { role: "front" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function toggleTableOfContents() {
  const editorPreferences = store?.getEditorPreferences?.();
  if (!editorPreferences) {
    return;
  }

  const nextEditorPreferences = store.updateEditorPreferences({
    ...editorPreferences,
    showTableOfContents: !editorPreferences.showTableOfContents,
  });
  buildMenu();
  broadcastEditorPreferences(nextEditorPreferences);
}

function getMenuShortcut(commandId) {
  const editorPreferences = store?.getEditorPreferences?.();
  if (editorPreferences?.keyboardShortcutEnabled?.[commandId] === false) {
    return undefined;
  }

  const shortcut =
    editorPreferences?.keyboardShortcuts?.[commandId] ??
    DEFAULT_KEYBOARD_SHORTCUTS[commandId];

  return typeof shortcut === "string" && shortcut.trim() ? shortcut : undefined;
}

function getMenuAccelerator(commandId) {
  const shortcut = getMenuShortcut(commandId);
  return shortcut ? electronAcceleratorForShortcut(shortcut) : undefined;
}

function getMenuItemLabel(label, commandId) {
  if (process.platform !== "win32") {
    return label;
  }

  const shortcut = getMenuShortcut(commandId);
  return shortcut ? `${label}\t${formatWindowsShortcutLabel(shortcut)}` : label;
}

function formatWindowsShortcutLabel(shortcut) {
  return shortcut
    .split("+")
    .map((token) => {
      if (token === "Mod" || token === "CommandOrControl") {
        return "Ctrl";
      }
      if (token === "Comma" || token === "comma") {
        return ",";
      }
      return token;
    })
    .join("+");
}

function electronAcceleratorForShortcut(shortcut) {
  if (typeof shortcut !== "string" || shortcut.trim() === "") {
    return undefined;
  }

  return shortcut
    .split("+")
    .map((token) => {
      if (token === "Mod") {
        return "CommandOrControl";
      }
      if (token === "ArrowLeft") {
        return "Left";
      }
      if (token === "ArrowRight") {
        return "Right";
      }
      if (token === "ArrowUp") {
        return "Up";
      }
      if (token === "ArrowDown") {
        return "Down";
      }
      if (token === "=") {
        return "Plus";
      }
      return token;
    })
    .join("+");
}

function persistWindowBounds(window) {
  if (!window || window.isDestroyed()) {
    return;
  }

  const entry = windows.get(window.id);
  if (!entry) {
    return;
  }

  store.updateBounds(entry.noteId, window.getBounds());
}

function getNoteIdForWebContents(webContents) {
  const window = BrowserWindow.fromWebContents(webContents);
  if (!window) {
    return null;
  }

  return windows.get(window.id)?.noteId ?? null;
}

function installIpcHandlers() {
  ipcMain.handle("notes:get-current-id", (event) => {
    return getNoteIdForWebContents(event.sender);
  });

  ipcMain.handle("app-theme:get", () => {
    return store.getAppTheme();
  });

  ipcMain.handle("app-theme:update", (_event, payload) => {
    const appTheme = store.updateAppTheme(payload);
    broadcastAppTheme(appTheme);
    return appTheme;
  });

  ipcMain.handle("layout-mode:get", () => {
    return store.getLayoutMode();
  });

  ipcMain.handle("layout-mode:update", async (_event, layoutMode) => {
    return updateLayoutMode(layoutMode, {
      activeNoteId: getNoteIdForWebContents(_event.sender),
    });
  });

  ipcMain.handle("editor-preferences:get", () => {
    return store.getEditorPreferences();
  });

  ipcMain.handle("editor-preferences:update", (_event, payload) => {
    const editorPreferences = store.updateEditorPreferences(payload);
    buildMenu();
    broadcastEditorPreferences(editorPreferences);
    return editorPreferences;
  });

  ipcMain.handle("notes:get", (event, noteId) => {
    const resolvedNoteId = noteId || getNoteIdForWebContents(event.sender);
    return resolvedNoteId ? store.getNote(resolvedNoteId) : null;
  });

  ipcMain.handle("notes:list", () => {
    return store.listNotes();
  });

  ipcMain.handle("trash:list", () => {
    return store.listTrash();
  });

  ipcMain.handle("notes:create", (event, creationOptions) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const layoutMode = store.getLayoutMode();
    const note = createNoteForLayoutMode(
      window?.getBounds() ?? nextWindowBounds(),
      layoutMode,
      creationOptions,
    );
    if (layoutMode === "sticky") {
      createWindow(note);
    }
    broadcastNotesChanged({ activeNote: note });
    return note;
  });

  ipcMain.handle("notes:reorder", (event, noteIds) => {
    const result = store.reorderNotes(noteIds);
    const currentNoteId = getNoteIdForWebContents(event.sender);
    const activeNote =
      (currentNoteId ? store.getNote(currentNoteId) : null) ??
      getMainTabsNote();

    broadcastNotesChanged({ activeNote });

    return {
      ...result,
      activeNote,
    };
  });

  ipcMain.handle("notes:delete", (event, noteId) => {
    if (typeof noteId !== "string") {
      return {
        deleted: false,
        notes: store.listNotes(),
        trash: store.listTrash(),
        activeNote: null,
      };
    }

    const currentNoteId = getNoteIdForWebContents(event.sender);
    const currentNoteBeforeDelete = currentNoteId
      ? store.getNote(currentNoteId)
      : null;
    const result = store.deleteNote(noteId);
    const nextActiveNote =
      noteId === currentNoteId
        ? result.activeNote
        : currentNoteBeforeDelete ?? result.activeNote;

    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && nextActiveNote) {
      const entry = windows.get(window.id);
      if (entry?.primary && noteId === currentNoteId) {
        entry.noteId = nextActiveNote.id;
        window.setTitle(nextActiveNote.title);
      } else if (entry?.noteId !== noteId) {
        window.setTitle(nextActiveNote.title);
      }
    }

    for (const entry of getEntriesForNote(noteId)) {
      closeWindowEntry(entry);
    }
    syncWindowsForLayoutMode(nextActiveNote?.id);
    broadcastNotesChanged({ activeNote: nextActiveNote });

    return {
      ...result,
      activeNote: nextActiveNote,
    };
  });

  ipcMain.handle("trash:restore", (event, noteId) => {
    const result = typeof noteId === "string"
      ? store.restoreNote(noteId)
      : {
          restored: false,
          note: null,
          notes: store.listNotes(),
          trash: store.listTrash(),
          activeNote: null,
        };

    const restoredNote = result.restored ? result.note : null;
    const currentNoteId = getNoteIdForWebContents(event.sender);
    const activeNote =
      (currentNoteId ? store.getNote(currentNoteId) : null) ??
      getMainTabsNote() ??
      restoredNote;

    if (restoredNote) {
      syncWindowsForLayoutMode(activeNote?.id, {
        reopenClosedStickyWindows: true,
      });
    }
    broadcastNotesChanged({ activeNote });

    return {
      ...result,
      activeNote,
    };
  });

  ipcMain.handle("trash:purge", (event, noteId) => {
    const result = typeof noteId === "string"
      ? store.purgeNote(noteId)
      : {
          deleted: false,
          notes: store.listNotes(),
          trash: store.listTrash(),
        };
    const currentNoteId = getNoteIdForWebContents(event.sender);
    const activeNote =
      (currentNoteId ? store.getNote(currentNoteId) : null) ??
      getMainTabsNote();

    broadcastNotesChanged({ activeNote });

    return {
      ...result,
      activeNote,
    };
  });

  ipcMain.handle("notes:activate", (event, noteId) => {
    const note = typeof noteId === "string" ? store.getNote(noteId) : null;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!note || !window) {
      return null;
    }

    const entry = windows.get(window.id);
    if (
      store.getLayoutMode() === "sticky" &&
      entry &&
      !entry.primary &&
      entry.noteId &&
      entry.noteId !== note.id
    ) {
      return store.getNote(entry.noteId);
    }

    if (entry?.noteId) {
      store.updateBounds(entry.noteId, window.getBounds());
      entry.noteId = note.id;
    }

    window.setTitle(note.title);
    return note;
  });

  ipcMain.handle("notes:detach", (event, noteId) => {
    const note = typeof noteId === "string" ? store.setDetached(noteId, true) : null;
    if (!note) {
      return {
        notes: store.listNotes(),
        activeNote: null,
      };
    }

    createWindow(note);

    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    const currentEntry = currentWindow ? windows.get(currentWindow.id) : null;
    const nextActiveNote = getMainTabsNote(currentEntry?.noteId);
    if (currentEntry?.primary && nextActiveNote) {
      currentEntry.noteId = nextActiveNote.id;
      currentWindow.setTitle(nextActiveNote.title);
    }

    broadcastNotesChanged({ activeNote: nextActiveNote });

    return {
      notes: store.listNotes(),
      activeNote: nextActiveNote,
    };
  });

  ipcMain.handle("notes:attach", (event, noteId) => {
    const note = typeof noteId === "string" ? store.setDetached(noteId, false) : null;
    if (!note) {
      return {
        notes: store.listNotes(),
        activeNote: null,
      };
    }

    const sourceWindow = BrowserWindow.fromWebContents(event.sender);
    const sourceEntry = sourceWindow ? windows.get(sourceWindow.id) : null;
    const primaryWindow = ensureTabsWindow(note.id);
    syncWindowsForLayoutMode(note.id);
    broadcastNotesChanged({ activeNote: note });

    if (sourceEntry && !sourceEntry.primary && sourceWindow && sourceWindow.id !== primaryWindow?.id) {
      closeWindowEntry(sourceEntry);
    }

    primaryWindow?.focus();

    return {
      notes: store.listNotes(),
      activeNote: note,
    };
  });

  ipcMain.handle("notes:save-content", (event, payload) => {
    const resolvedNoteId =
      payload?.noteId || getNoteIdForWebContents(event.sender);
    if (!resolvedNoteId) {
      return null;
    }

    const previousNote = store.getNote(resolvedNoteId);
    const previousTitle = previousNote?.title;
    const wasTemplateSeed = previousNote?.seedDemoContent === true;
    const note = store.updateContent({
      noteId: resolvedNoteId,
      blocksJSON: payload?.blocksJSON,
      markdown: payload?.markdown,
    });

    if (note && (note.title !== previousTitle || wasTemplateSeed)) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window && note.title) {
        window.setTitle(note.title);
      }
      broadcastNotesChanged({ activeNote: note });
    }

    return note;
  });

  ipcMain.handle("notes:update-appearance", (event, payload) => {
    const resolvedNoteId =
      payload?.noteId || getNoteIdForWebContents(event.sender);
    if (!resolvedNoteId) {
      return null;
    }

    const note = store.updateAppearance(resolvedNoteId, {
      title: payload?.title,
      titleManuallyEdited: payload?.titleManuallyEdited,
      theme: payload?.theme,
    });

    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && note?.title) {
      window.setTitle(note.title);
    }

    if (note) {
      broadcastNotesChanged({ activeNote: note });
    }

    return note;
  });

  ipcMain.handle("notes:versions:list", (event, noteId) => {
    const resolvedNoteId = noteId || getNoteIdForWebContents(event.sender);
    return resolvedNoteId ? store.listNoteVersions(resolvedNoteId) : [];
  });

  ipcMain.handle("notes:versions:create", (event, payload) => {
    const resolvedNoteId = payload?.noteId || getNoteIdForWebContents(event.sender);
    return resolvedNoteId ? store.createNoteVersion(resolvedNoteId, payload) : null;
  });

  ipcMain.handle("notes:versions:restore", (event, payload) => {
    const resolvedNoteId = payload?.noteId || getNoteIdForWebContents(event.sender);
    const note = resolvedNoteId
      ? store.restoreNoteVersion(resolvedNoteId, payload?.versionId)
      : null;
    if (note) broadcastNotesChanged({ activeNote: note });
    return note;
  });

  ipcMain.handle("export:note", async (event, payload) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error("No active window found for export.");
    }

    const title = sanitizeFileName(payload?.title, "notepane-note");
    const type = payload?.type ?? "pdf";
    if (type === "md") {
      if (typeof payload?.markdown !== "string") {
        throw new Error("Markdown export content is missing.");
      }
      return saveBuffer({
        window,
        buffer: Buffer.from(payload.markdown, "utf8"),
        defaultName: `${title}.md`,
        dialogTitle: "Export note as Markdown",
        filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
      });
    }

    if (type !== "pdf") {
      throw new Error("Unsupported note export format.");
    }

    const buffer = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: { marginType: "none" },
    });
    return saveBuffer({
      window,
      buffer,
      defaultName: `${title}.pdf`,
      dialogTitle: "Export note as PDF",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
  });

  ipcMain.handle("backup:export", async (event) => withBackupOperation(async () => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error("No active window found for backup export.");
    }

    await waitForPendingEditorSaves();
    const backup = store.createBackup({ appVersion: app.getVersion() });
    const defaultName = `NotePane Backup ${formatBackupTimestamp(new Date())}.notepane`;
    const result = await saveBuffer({
      window,
      buffer: Buffer.from(JSON.stringify(backup, null, 2), "utf8"),
      defaultName,
      dialogTitle: "Export NotePane backup",
      filters: [{ name: "NotePane Backup", extensions: ["notepane"] }],
    });

    return {
      ...result,
      summary: result.canceled ? null : store.inspectBackup(backup),
    };
  }));

  ipcMain.handle("backup:import", async (event) => withBackupOperation(async () => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error("No active window found for backup import.");
    }

    const selection = await selectBackupFile(window);
    if (selection.canceled || !selection.filePath) {
      return { canceled: true, imported: false };
    }

    const backup = readBackupFile(selection.filePath);
    const summary = store.inspectBackup(backup);
    const confirmation = backupImportConfirmOverride === "1"
      ? { response: 0 }
      : await dialog.showMessageBox(window, {
          type: "warning",
          title: "Import NotePane backup?",
          message: "Replace the current NotePane workspace?",
          detail:
            `${summary.noteCount} active note${summary.noteCount === 1 ? "" : "s"} and ` +
            `${summary.trashCount} trash item${summary.trashCount === 1 ? "" : "s"} will be imported. ` +
            "Your current workspace will be backed up automatically first.",
          buttons: ["Import backup", "Cancel"],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        });
    if (confirmation.response !== 0) {
      return { canceled: true, imported: false, summary };
    }

    await waitForPendingEditorSaves();
    const automaticBackupPath = path.join(
      app.getPath("userData"),
      "Backups",
      `Before import ${formatBackupTimestamp(new Date())}.notepane`,
    );
    const restoredSummary = store.restoreBackup(backup, {
      appVersion: app.getVersion(),
      automaticBackupPath,
    });
    const activeNote = store.listNotes()[0];
    manuallyClosedStickyNoteIds.clear();

    setTimeout(() => {
      if (!activeNote) {
        return;
      }
      recreateWindowsForLayoutMode(activeNote.id, {
        persistExistingBounds: false,
      });
      buildMenu();
    }, 50);

    return {
      canceled: false,
      imported: true,
      summary: restoredSummary,
      automaticBackupPath,
    };
  }));

  ipcMain.handle("assets:save-url", async (event, payload) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const asset = await readAssetFromUrl(payload?.url);
    const isImage = payload?.kind !== "file";
    const defaultName = sanitizeFileName(
      payload?.defaultName,
      `${isImage ? "image" : "file"}.${extensionForMime(asset.mimeType)}`,
    );

    return saveBuffer({
      window,
      buffer: asset.buffer,
      defaultName,
      dialogTitle: isImage ? "Save image" : "Save file",
      filters: isImage
        ? [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }]
        : [{ name: "All files", extensions: ["*"] }],
    });
  });

  ipcMain.handle("fonts:list", async () => {
    return await listInstalledFonts();
  });

  ipcMain.handle("window:set-always-on-top", (event, alwaysOnTop) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      return false;
    }

    window.setAlwaysOnTop(Boolean(alwaysOnTop));
    const noteId = getNoteIdForWebContents(event.sender);
    if (noteId) {
      const updatedNote = store.setAlwaysOnTop(noteId, Boolean(alwaysOnTop));
      if (updatedNote) {
        broadcastNotesChanged({ activeNote: updatedNote });
      }
    }
    return Boolean(alwaysOnTop);
  });

  ipcMain.handle("window:close-current", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) {
      return false;
    }

    window.close();
    return true;
  });

  ipcMain.handle("window:move-by", (event, payload) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || (window.isMovable && !window.isMovable())) {
      return null;
    }

    const deltaX = Number(payload?.deltaX);
    const deltaY = Number(payload?.deltaY);
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
      return window.getBounds();
    }

    const [x, y] = window.getPosition();
    window.setPosition(
      Math.round(x + deltaX),
      Math.round(y + deltaY),
      false,
    );
    return window.getBounds();
  });
}

async function withBackupOperation(callback) {
  if (backupOperationInProgress) {
    throw new Error("Another backup operation is already in progress.");
  }

  backupOperationInProgress = true;
  try {
    return await callback();
  } finally {
    backupOperationInProgress = false;
  }
}

async function waitForPendingEditorSaves() {
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function saveBuffer({ window, buffer, defaultName, dialogTitle, filters }) {
  if (exportDirectoryOverride) {
    fs.mkdirSync(exportDirectoryOverride, { recursive: true });
    const filePath = path.join(exportDirectoryOverride, defaultName);
    fs.writeFileSync(filePath, buffer);
    return { canceled: false, filePath };
  }

  const result = await dialog.showSaveDialog(window, {
    title: dialogTitle,
    defaultPath: defaultName,
    filters,
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true, filePath: null };
  }

  fs.writeFileSync(result.filePath, buffer);
  return { canceled: false, filePath: result.filePath };
}

async function selectBackupFile(window) {
  if (backupImportFileOverride) {
    return { canceled: false, filePath: backupImportFileOverride };
  }

  const result = await dialog.showOpenDialog(window, {
    title: "Import NotePane backup",
    properties: ["openFile"],
    filters: [{ name: "NotePane Backup", extensions: ["notepane"] }],
  });
  return {
    canceled: result.canceled || result.filePaths.length === 0,
    filePath: result.filePaths[0] ?? null,
  };
}

function readBackupFile(filePath) {
  const fileSize = fs.statSync(filePath).size;
  if (fileSize > MAX_BACKUP_FILE_SIZE) {
    throw new Error("This NotePane backup is larger than the 512 MB import limit.");
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("This NotePane backup file is not valid JSON.");
    }
    throw error;
  }
}

function formatBackupTimestamp(date) {
  return date.toISOString().replace("T", " ").replace(/[:]/g, "-").replace("Z", "");
}

async function readAssetFromUrl(url) {
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("Missing image URL.");
  }

  if (url.startsWith("data:")) {
    return readDataUrl(url);
  }

  if (url.startsWith("file:")) {
    return {
      buffer: fs.readFileSync(fileURLToPath(url)),
      mimeType: mimeForExtension(path.extname(fileURLToPath(url))),
    };
  }

  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Image download failed with HTTP ${response.status}.`);
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type")?.split(";")[0] || "image/png",
    };
  }

  throw new Error("Unsupported image URL.");
}

function readDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL.");
  }

  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const data = match[3] || "";
  return {
    buffer: isBase64
      ? Buffer.from(data, "base64")
      : Buffer.from(decodeURIComponent(data), "utf8"),
    mimeType,
  };
}

function sanitizeFileName(value, fallback) {
  const source = typeof value === "string" && value.trim() ? value : fallback;
  return source
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || fallback;
}

function extensionForMime(mimeType) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    case "image/png":
    default:
      return "png";
  }
}

function mimeForExtension(extension) {
  switch (extension.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".png":
    default:
      return "image/png";
  }
}

async function listInstalledFonts() {
  if (!installedFontsPromise) {
    installedFontsPromise = resolveInstalledFonts().catch(() => []);
  }

  return await installedFontsPromise;
}

async function resolveInstalledFonts() {
  if (process.platform === "darwin") {
    const { stdout } = await execFileAsync(
      "/usr/sbin/system_profiler",
      ["SPFontsDataType", "-json", "-detailLevel", "mini"],
      {
        timeout: 20_000,
        maxBuffer: 24 * 1024 * 1024,
      },
    );

    return extractFontFamiliesFromSystemProfiler(stdout);
  }

  return [];
}

function extractFontFamiliesFromSystemProfiler(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }

  const fontFamilies = new Set();
  const fontItems = Array.isArray(parsed?.SPFontsDataType)
    ? parsed.SPFontsDataType
    : [];

  for (const item of fontItems) {
    if (item?.enabled === "no" || item?.valid === "no") {
      continue;
    }

    const typefaces = Array.isArray(item?.typefaces) ? item.typefaces : [];
    for (const typeface of typefaces) {
      if (typeface?.enabled === "no" || typeface?.valid === "no") {
        continue;
      }

      const family = normalizeInstalledFontFamily(
        typeface?.family || typeface?.fullname || typeface?._name,
      );
      if (family) {
        fontFamilies.add(family);
      }
    }
  }

  return [...fontFamilies].sort((left, right) =>
    left.localeCompare(right, undefined, {
      sensitivity: "base",
      numeric: true,
    }),
  );
}

function normalizeInstalledFontFamily(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function nextWindowBounds() {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  const base = focusedWindow?.getBounds() ?? { width: 960, height: 720 };
  const offset = (windows.size % 8) * 28;
  return {
    x: Number.isFinite(base.x) ? base.x + offset : undefined,
    y: Number.isFinite(base.y) ? base.y - offset : undefined,
    width: base.width,
    height: base.height,
  };
}

function normalizeWindowBounds(bounds, options = {}) {
  const fallback = {
    width: 960,
    height: 720,
  };
  const width = clamp(
    bounds?.width ?? fallback.width,
    options.minWidth ?? TABS_MIN_WIDTH,
    2400,
  );
  const height = clamp(
    bounds?.height ?? fallback.height,
    options.minHeight ?? TABS_MIN_HEIGHT,
    1800,
  );
  const normalized = { width, height };

  if (Number.isFinite(bounds?.x) && Number.isFinite(bounds?.y)) {
    normalized.x = bounds.x;
    normalized.y = bounds.y;
  }

  return normalized;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

app.whenReady().then(() => {
  app.name = APP_NAME;
  app.setName(APP_NAME);

  store = new StickyStore(app.getPath("userData"));
  installIpcHandlers();
  buildMenu();

  if (store.listNotes().length === 0) {
    store.createNote(nextWindowBounds());
  }

  syncWindowsForLayoutMode();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      showAllNotes();
      if (BrowserWindow.getAllWindows().length === 0) {
        createNewNoteWindow();
      }
    }
  });
});

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});

app.on("before-quit", () => {
  quitting = true;
  for (const { window } of windows.values()) {
    persistWindowBounds(window);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
