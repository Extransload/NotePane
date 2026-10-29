import {
  hasPlatformModifier,
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
 * layout mode, app zoom and table of contents.
 */
export function useChromeShortcuts({
  adjustAppZoom,
  closeOverlay,
  normalizedLayoutMode,
  exportNote,
  focusEditor,
  matchesEnabledKeyboardShortcut,
  onEditorWidthChange,
  openFindInNote,
  openOverlay,
  openSearchPalette,
  requestNewSession,
  resetAppZoom,
  saveVersionNow,
  setIsSidebarOpen,
  showExportToast,
  toggleLayoutMode,
  toggleTableOfContents,
}) {
  useEffect(() => {
    const handleChromeShortcut = (event) => {
      if (isShortcutRecorderTarget(event.target)) {
        return;
      }

      if (hasPlatformModifier(event) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveVersionNow().then(
          () => showExportToast("Saved", "success"),
          () => showExportToast("Save failed", "error"),
        );
        return;
      }

      // Zoom belongs to the whole app, so it also works from a text field or Preferences. None of
      // these keys edits text.
      if (matchesEnabledKeyboardShortcut(event, "zoomIn")) {
        event.preventDefault();
        adjustAppZoom(1);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "zoomOut")) {
        event.preventDefault();
        adjustAppZoom(-1);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "resetZoom")) {
        event.preventDefault();
        resetAppZoom();
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, .preferences-window")
      ) {
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "findInNote")) {
        event.preventDefault();
        openFindInNote();
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "searchNotes")) {
        event.preventDefault();
        openSearchPalette();
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

      if (matchesEnabledKeyboardShortcut(event, "exportPdf")) {
        event.preventDefault();
        // Leaves the sticky Trash confirmation open, unlike opening an exclusive panel.
        closeOverlay(
          "colorPanel",
          "stickySettings",
          "sessionTrashConfirm",
          "sessionTabMenu",
          "sessionColorPanel",
          "preferencesWindow",
        );
        openOverlay("exportFormatMenu", {
          x: Math.round(window.innerWidth / 2),
          y: 52,
        });
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "toggleSidebar")) {
        event.preventDefault();
        setIsSidebarOpen((value) => !value);
        return;
      }

      // Moves focus back into the editor. Inside it already, the caret stays where it is, and the
      // key is still swallowed: Chromium on Windows and Linux reads Ctrl+Enter as a new line.
      if (matchesEnabledKeyboardShortcut(event, "focusEditor")) {
        event.preventDefault();
        if (!(event.target instanceof Element && event.target.closest(".bn-editor"))) {
          focusEditor();
        }
        return;
      }

      if (
        (
          matchesEnabledKeyboardShortcut(event, "newSession") ||
          matchesEnabledKeyboardShortcut(event, "newNote")
        ) &&
        normalizedLayoutMode === "tabs"
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
    normalizedLayoutMode,
    matchesEnabledKeyboardShortcut,
    adjustAppZoom,
    closeOverlay,
    exportNote,
    focusEditor,
    requestNewSession,
    toggleTableOfContents,
    onEditorWidthChange,
    openFindInNote,
    openOverlay,
    openSearchPalette,
    resetAppZoom,
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

      if (!hasPlatformModifier(event) || event.altKey || event.shiftKey) {
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
  normalizedLayoutMode,
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

      if (normalizedLayoutMode !== "tabs" || visibleSessionNotes.length <= 1) {
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
    normalizedLayoutMode,
    matchesEnabledKeyboardShortcut,
    moveCurrentSessionNote,
    selectRelativeSessionNote,
    visibleSessionNotes.length,
  ]);
}
