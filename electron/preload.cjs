const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("blocknoteSticky", {
  platform: process.platform,
  getCurrentNoteId: () => ipcRenderer.invoke("notes:get-current-id"),
  getNote: (noteId) => ipcRenderer.invoke("notes:get", noteId),
  listNotes: () => ipcRenderer.invoke("notes:list"),
  listTrash: () => ipcRenderer.invoke("trash:list"),
  createNote: (options) => ipcRenderer.invoke("notes:create", options),
  reorderNotes: (noteIds) => ipcRenderer.invoke("notes:reorder", noteIds),
  deleteNote: (noteId) => ipcRenderer.invoke("notes:delete", noteId),
  restoreNote: (noteId) => ipcRenderer.invoke("trash:restore", noteId),
  purgeNote: (noteId) => ipcRenderer.invoke("trash:purge", noteId),
  activateNote: (noteId) => ipcRenderer.invoke("notes:activate", noteId),
  getAppTheme: () => ipcRenderer.invoke("app-theme:get"),
  updateAppTheme: (payload) => ipcRenderer.invoke("app-theme:update", payload),
  getLayoutMode: () => ipcRenderer.invoke("layout-mode:get"),
  updateLayoutMode: (layoutMode) =>
    ipcRenderer.invoke("layout-mode:update", layoutMode),
  getEditorPreferences: () => ipcRenderer.invoke("editor-preferences:get"),
  updateEditorPreferences: (payload) =>
    ipcRenderer.invoke("editor-preferences:update", payload),
  saveContent: (payload) => ipcRenderer.invoke("notes:save-content", payload),
  listNoteVersions: (noteId) => ipcRenderer.invoke("notes:versions:list", noteId),
  createNoteVersion: (payload) => ipcRenderer.invoke("notes:versions:create", payload),
  restoreNoteVersion: (payload) => ipcRenderer.invoke("notes:versions:restore", payload),
  updateAppearance: (payload) =>
    ipcRenderer.invoke("notes:update-appearance", payload),
  detachNote: (noteId) => ipcRenderer.invoke("notes:detach", noteId),
  attachNote: (noteId) => ipcRenderer.invoke("notes:attach", noteId),
  exportNote: (payload) => ipcRenderer.invoke("export:note", payload),
  exportBackup: () => ipcRenderer.invoke("backup:export"),
  importBackup: () => ipcRenderer.invoke("backup:import"),
  saveAsset: (payload) => ipcRenderer.invoke("assets:save-url", payload),
  listFonts: () => ipcRenderer.invoke("fonts:list"),
  moveWindowBy: (payload) => ipcRenderer.invoke("window:move-by", payload),
  closeCurrentWindow: () => ipcRenderer.invoke("window:close-current"),
  setAlwaysOnTop: (alwaysOnTop) =>
    ipcRenderer.invoke("window:set-always-on-top", alwaysOnTop),
  onOpenPreferences: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("preferences:open", listener);
    return () => ipcRenderer.removeListener("preferences:open", listener);
  },
  onCreateNoteRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("notes:create-requested", listener);
    return () => ipcRenderer.removeListener("notes:create-requested", listener);
  },
  onCloseTabRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("tabs:close-requested", listener);
    return () => ipcRenderer.removeListener("tabs:close-requested", listener);
  },
  onAppThemeChanged: (callback) => {
    const listener = (_event, appTheme) => callback(appTheme);
    ipcRenderer.on("app-theme:changed", listener);
    return () => ipcRenderer.removeListener("app-theme:changed", listener);
  },
  onLayoutModeChanged: (callback) => {
    const listener = (_event, layoutMode) => callback(layoutMode);
    ipcRenderer.on("layout-mode:changed", listener);
    return () => ipcRenderer.removeListener("layout-mode:changed", listener);
  },
  onLayoutModeTransition: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("layout-mode:transition", listener);
    return () => ipcRenderer.removeListener("layout-mode:transition", listener);
  },
  onEditorPreferencesChanged: (callback) => {
    const listener = (_event, editorPreferences) => callback(editorPreferences);
    ipcRenderer.on("editor-preferences:changed", listener);
    return () => ipcRenderer.removeListener("editor-preferences:changed", listener);
  },
  onNotesChanged: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("notes:changed", listener);
    return () => ipcRenderer.removeListener("notes:changed", listener);
  },
});
