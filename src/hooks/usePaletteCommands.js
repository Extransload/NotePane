import { useMemo } from "react";
import { listBuiltInThemes } from "../style/themes.js";
import { PREFERENCE_PAGES } from "../ui/preferencesWindow.jsx";

/**
 * The commands the search palette runs (src/model/commands.js matches them to the query). Each
 * is { id, title, keywords, shortcut, run }: `shortcut` names the keyboard command whose key the
 * row shows. Commands that need the tabs window are left out of a sticky window.
 */
export function usePaletteCommands({
  activeThemeId,
  createFolderAndRename,
  duplicateSessionNote,
  exportNote,
  folders,
  isTabsLayout,
  note,
  onAppThemeChanged,
  onEditorWidthChange,
  onMoveNoteToFolder,
  openOverlay,
  openFindInNote,
  openPreferencesPage,
  openSessionAsSticky,
  openVersionHistory,
  adjustAppZoom,
  requestDeleteSessionNote,
  requestNewSession,
  requestSessionRename,
  resetAppZoom,
  setIsSidebarOpen,
  toggleLayoutMode,
  toggleTableOfContents,
}) {
  return useMemo(() => {
    const commands = [];
    const add = (id, title, run, extra = {}) => commands.push({ id, title, run, ...extra });
    const folderOfNote = folders.find((folder) => folder.id === note.folderId) ?? null;

    add("new-note", "New note", requestNewSession, { keywords: "session page create add", shortcut: "newSession" });
    if (isTabsLayout) {
      add("new-folder", "New folder", () => void createFolderAndRename(), { keywords: "group create add" });
      add("rename-note", "Rename note", () => requestSessionRename(note), { keywords: "title" });
    }
    add("duplicate-note", "Duplicate note", () => void duplicateSessionNote(note), { keywords: "copy clone" });
    if (isTabsLayout) {
      for (const folder of folders) {
        if (folder.id !== folderOfNote?.id) {
          add(`move-to-${folder.id}`, `Move note to ${folder.name}`, () => void onMoveNoteToFolder(note.id, folder.id), {
            keywords: "folder group",
          });
        }
      }
      if (folderOfNote) {
        add("remove-from-folder", `Take note out of ${folderOfNote.name}`, () => void onMoveNoteToFolder(note.id, null), {
          keywords: "folder group remove ungroup",
        });
      }
      add("open-as-sticky", "Open note as sticky window", () => void openSessionAsSticky(note), {
        keywords: "detach float window",
      });
    }
    add("move-to-trash", "Move note to Trash", () => requestDeleteSessionNote(note), { keywords: "delete remove close" });
    add("find-in-note", "Find in note", openFindInNote, { keywords: "search text", shortcut: "findInNote" });
    add("version-history", "Version history", () => void openVersionHistory(), { keywords: "versions restore undo snapshot" });
    add("export-pdf", "Export as PDF", () => void exportNote("pdf"), { keywords: "print save download" });
    add("export-markdown", "Export as Markdown", () => void exportNote("md"), { keywords: "md save download" });
    add("export-window", "Export…", () => openOverlay("exportDialog"), {
      keywords: "html image png folder all notes options",
    });
    if (isTabsLayout) {
      add("toggle-sidebar", "Show or hide the sidebar", () => setIsSidebarOpen((value) => !value), {
        keywords: "sidebar tabs panel toggle", shortcut: "toggleSidebar",
      });
    }
    add("toggle-layout", isTabsLayout ? "Switch to sticky windows" : "Switch to tab sessions", toggleLayoutMode, {
      keywords: "layout mode sticky tabs windows", shortcut: "toggleLayoutMode",
    });
    if (isTabsLayout) {
      add("toggle-toc", "Show or hide the table of contents", toggleTableOfContents, {
        keywords: "toc outline headings contents", shortcut: "toggleTableOfContents",
      });
    }
    add("toggle-width", "Toggle wide text", () => onEditorWidthChange?.((value) => !value), {
      keywords: "width full wide narrow", shortcut: "toggleEditorWidth",
    });
    add("zoom-in", "Zoom in", () => adjustAppZoom(1), { keywords: "bigger larger", shortcut: "zoomIn" });
    add("zoom-out", "Zoom out", () => adjustAppZoom(-1), { keywords: "smaller", shortcut: "zoomOut" });
    add("zoom-reset", "Actual size", resetAppZoom, { keywords: "zoom reset 100", shortcut: "resetZoom" });
    if (isTabsLayout) {
      for (const page of PREFERENCE_PAGES) {
        add(`settings-${page.id}`, `Settings: ${page.label}`, () => openPreferencesPage(page.id), {
          keywords: "preferences options", shortcut: page.id === "theme" ? "preferences" : undefined,
        });
      }
    }
    for (const theme of listBuiltInThemes()) {
      if (theme.id !== activeThemeId) {
        add(`theme-${theme.id}`, `Theme: ${theme.label}`, () => onAppThemeChanged(theme.id), {
          keywords: `colour color appearance ${theme.scheme}`,
        });
      }
    }
    return commands;
  }, [
    activeThemeId,
    adjustAppZoom,
    createFolderAndRename,
    duplicateSessionNote,
    exportNote,
    folders,
    isTabsLayout,
    note,
    onAppThemeChanged,
    onEditorWidthChange,
    onMoveNoteToFolder,
    openOverlay,
    openFindInNote,
    openPreferencesPage,
    openSessionAsSticky,
    openVersionHistory,
    requestDeleteSessionNote,
    requestNewSession,
    requestSessionRename,
    resetAppZoom,
    setIsSidebarOpen,
    toggleLayoutMode,
    toggleTableOfContents,
  ]);
}
