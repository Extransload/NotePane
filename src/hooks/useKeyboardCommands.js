import {
  isKeyboardShortcutEnabled,
  isShortcutRecorderTarget,
} from "../model/keyboardShortcuts.js";
import {
  useEffect,
} from "react";
// Application-level keyboard commands. Each hook stays a separate effect and
// is called from its original position in StickyEditor so listener
// registration order is unchanged.

/**
 * Window chrome commands: save, export, preferences, colour panel, sidebar,
 * layout mode, theme, font size and table of contents.
 */
export function useChromeShortcuts({
  adjustEditorFontScale,
  appThemeMode,
  effectiveLayoutMode,
  exportNote,
  focusEditor,
  matchesEnabledKeyboardShortcut,
  note,
  onAppThemeModeChanged,
  onAttachNote,
  onEditorWidthChange,
  requestNewSession,
  saveVersionNow,
  setExportFormatMenu,
  setIsColorPanelOpen,
  setIsPreferencesWindowOpen,
  setIsSidebarOpen,
  setIsStickySettingsOpen,
  setPendingSessionTrashNote,
  setSessionColorPanelNoteId,
  setSessionTabMenu,
  showExportToast,
  toggleLayoutMode,
  toggleTableOfContents,
}) {
  useEffect(() => {
    const handleChromeShortcut = (event) => {
      if (isShortcutRecorderTarget(event.target)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveVersionNow().then(
          () => showExportToast("Saved", "success"),
          () => showExportToast("Save failed", "error"),
        );
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, .preferences-window")
      ) {
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "toggleLayoutMode")) {
        event.preventDefault();
        toggleLayoutMode();
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "toggleTableOfContents")) {
        event.preventDefault();
        toggleTableOfContents();
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "toggleEditorWidth")) {
        event.preventDefault();
        onEditorWidthChange?.((value) => !value);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "toggleThemeMode")) {
        event.preventDefault();
        void onAppThemeModeChanged(appThemeMode === "dark" ? "light" : "dark");
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "exportPdf")) {
        event.preventDefault();
        setIsColorPanelOpen(false);
        setIsStickySettingsOpen(false);
        setPendingSessionTrashNote(null);
        setSessionTabMenu(null);
        setSessionColorPanelNoteId(null);
        setIsPreferencesWindowOpen(false);
        setExportFormatMenu({
          x: Math.round(window.innerWidth / 2),
          y: 52,
        });
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "increaseEditorFontSize")) {
        event.preventDefault();
        adjustEditorFontScale(1);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "decreaseEditorFontSize")) {
        event.preventDefault();
        adjustEditorFontScale(-1);
        return;
      }

      if (
        matchesEnabledKeyboardShortcut(event, "attachDetachedNote") &&
        note.detached
      ) {
        event.preventDefault();
        void onAttachNote(note.id);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "toggleSidebar")) {
        event.preventDefault();
        setIsSidebarOpen((value) => !value);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "focusEditor")) {
        event.preventDefault();
        focusEditor();
        return;
      }

      if (
        (
          matchesEnabledKeyboardShortcut(event, "newSession") ||
          matchesEnabledKeyboardShortcut(event, "newNote")
        ) &&
        effectiveLayoutMode === "tabs"
      ) {
        event.preventDefault();
        requestNewSession();
      }
    };

    document.addEventListener("keydown", handleChromeShortcut, true);
    return () => {
      document.removeEventListener("keydown", handleChromeShortcut, true);
    };
  }, [
    appThemeMode,
    effectiveLayoutMode,
    matchesEnabledKeyboardShortcut,
    note.detached,
    note.id,
    onAppThemeModeChanged,
    onAttachNote,
    adjustEditorFontScale,
    exportNote,
    focusEditor,
    requestNewSession,
    toggleTableOfContents,
    onEditorWidthChange,
    toggleLayoutMode,
    saveVersionNow,
    showExportToast,
  ]);
}

/**
 * Cmd/Ctrl+1..9 selects a session by its position in the sidebar.
 */
export function useSessionNumberShortcuts({
  keyboardShortcutEnabled,
  note,
  selectSidebarNote,
  visibleSessionNotes,
}) {
  useEffect(() => {
    const handleSessionShortcut = (event) => {
      if (isShortcutRecorderTarget(event.target)) {
        return;
      }

      if (!isKeyboardShortcutEnabled(keyboardShortcutEnabled, "selectTabByNumber")) {
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, .preferences-window")
      ) {
        return;
      }

      const sessionIndex = Number(event.key) - 1;
      if (!Number.isInteger(sessionIndex) || sessionIndex < 0 || sessionIndex > 8) {
        return;
      }

      const sessionNote = visibleSessionNotes[sessionIndex];
      if (!sessionNote || sessionNote.id === note.id) {
        return;
      }

      event.preventDefault();
      void selectSidebarNote(sessionNote.id);
    };

    document.addEventListener("keydown", handleSessionShortcut, true);
    return () => {
      document.removeEventListener("keydown", handleSessionShortcut, true);
    };
  }, [keyboardShortcutEnabled, note.id, selectSidebarNote, visibleSessionNotes]);
}

/**
 * Tab-mode only: move the current session in the tab strip and step between
 * neighbouring sessions.
 */
export function useTabModeShortcuts({
  effectiveLayoutMode,
  matchesEnabledKeyboardShortcut,
  moveCurrentSessionNote,
  selectRelativeSessionNote,
  visibleSessionNotes,
}) {
  useEffect(() => {
    const handleTabModeShortcut = (event) => {
      if (isShortcutRecorderTarget(event.target)) {
        return;
      }

      if (event.target instanceof Element && event.target.closest("input, textarea, select")) {
        return;
      }

      if (effectiveLayoutMode !== "tabs" || visibleSessionNotes.length <= 1) {
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "moveTabLeft")) {
        event.preventDefault();
        event.stopPropagation();
        void moveCurrentSessionNote(-1);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "moveTabRight")) {
        event.preventDefault();
        event.stopPropagation();
        void moveCurrentSessionNote(1);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "previousTab")) {
        event.preventDefault();
        event.stopPropagation();
        void selectRelativeSessionNote(-1);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "nextTab")) {
        event.preventDefault();
        event.stopPropagation();
        void selectRelativeSessionNote(1);
      }
    };

    document.addEventListener("keydown", handleTabModeShortcut, true);
    return () => {
      document.removeEventListener("keydown", handleTabModeShortcut, true);
    };
  }, [
    effectiveLayoutMode,
    matchesEnabledKeyboardShortcut,
    moveCurrentSessionNote,
    selectRelativeSessionNote,
    visibleSessionNotes.length,
  ]);
}
