import {
  BlockDragSelection,
} from "./editor/blockDragSelection.js";
import {
  isBlockSetSelection,
  replaceBlockSelectionWithParagraph,
} from "./editor/blockSelection.js";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createRoot,
} from "react-dom/client";
import "@blocknote/core/fonts/inter.css";
import {
  BlockNoteView,
} from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  useCreateBlockNote,
} from "@blocknote/react";
import {
  size,
} from "@floating-ui/react";
import {
  columnResizingPluginKey,
  mergeCells,
  splitCell,
} from "prosemirror-tables";
import {
  Decoration,
  DecorationSet,
} from "@tiptap/pm/view";
import {
  Check,
  History,
  Plus,
  X,
} from "lucide-react";
import {
  RecentColorFormattingToolbarController,
  applyEditorColor,
  rememberEditorColor,
} from "./editor/colorFormatting.jsx";
import {
  BlockMenuHighlightController,
  NotePaneSideMenuController,
} from "./editor/sideMenu.jsx";
import {
  autoFitActiveTableColumn,
  previewActiveTableColumnResize,
} from "./editor/tableColumnSizing.js";
import {
  handleToggleBackspace,
  handleToggleEnter,
  handleToggleSpace,
} from "./editor/toggleKeyboard.js";
import {
  DEFAULT_APP_ZOOM,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_EDITOR_PREFERENCES,
  DEFAULT_LAYOUT_MODE,
  DEFAULT_THEME,
  DEFAULT_TITLE,
  EXPORT_TOAST_TIMEOUT_MS,
  LAYOUT_TRANSITION_TIMEOUT_MS,
  MAX_MARKDOWN_IMPORT_FILE_SIZE,
  PENDING_RENAME_TIMEOUT_MS,
  SESSION_TAB_ENTER_MS,
  SESSION_TAB_EXIT_MS,
  SIDEBAR_COLLAPSE_WIDTH,
  SIDEBAR_COMPACT_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  TRASH_UNDO_TOAST_TIMEOUT_MS,
  electronApi,
} from "./constants.js";
import {
  areTableOfContentsEntriesEqual,
  cutCurrentBlocks,
  extractTableOfContentsEntries,
  findBlockById,
  findImageBlockForElement,
  focusLastEditorBlock,
  getBlocksForClipboard,
  getEditorBlockElement,
  isBlankTableSurfacePointer,
  isEmptyParagraphBlock,
  isEmptySessionDocument,
  scrollEditorBlockIntoView,
} from "./editor/blocks.js";
import {
  guardPasteSerialisation,
  isStandaloneWebUrl,
  normalizeCopiedEditorPlainText,
  normalizePastedMarkdownForBlockNote,
  setBlocksClipboardData,
  withSelfRemovingChangeSubscriptions,
} from "./editor/clipboard.js";
import {
  setActiveCodeTheme,
  withCodeTheme,
} from "./editor/codeHighlighter.js";
import {
  useBlockNoteFloatingMenuGuard,
} from "./editor/floatingMenus.js";
import {
  canCopyImageToClipboard,
  copyImageToClipboard,
  downloadInBrowser,
  ensurePngName,
  getCropSource,
  imageFileName,
  isFileTransfer,
  preventFocusLoss,
  uploadFile,
  storeDataUrlAsAsset,
} from "./editor/images.js";
import { computeCalloutDropPosition } from "./editor/callout.jsx";
import { FILE_INSERTION_FAILED_EVENT, FileDrop, pasteFiles } from "./editor/fileInsertion.js";
import { MarkdownShortcutUndo } from "./editor/markdownShortcuts.js";
import {
  EMPTY_BLOCKS,
  NOTE_PANE_TEMPLATE_BLOCKS,
  NOTE_PANE_TEMPLATE_BLOCKS_JSON,
  schema,
} from "./editor/schema.jsx";
import {
  getCurrentTableCellRange,
  getFocusedTableCellSnapshot,
  getTableCellElementForSnapshot,
  hasVisibleTextSelection,
  isCurrentTableCellContentSelected,
  isCurrentTableFullySelected,
  isCurrentTableSelection,
  moveSelectedTableCell,
  moveTableTextCursorToAdjacentCell,
  restoreFocusedTableCell,
  selectAllBlocks,
  selectCurrentCodeBlockContent,
  selectCurrentTable,
  selectCurrentTableCell,
  selectCurrentTableCellContent,
} from "./editor/selection.js";
import {
  NotePaneSlashMenuController,
} from "./editor/slashMenu.jsx";
import {
  hasEditorRangeSelection,
  isEditorShortcutTarget,
  isSelectionInsideCodeBlock,
} from "./editor/targets.js";
import {
  formatShortcutTooltip,
  getSessionShortcutLabel,
  isKeyboardShortcutEnabled,
  isShortcutRecorderTarget,
  isWindowsRuntime,
  matchesKeyboardShortcut,
} from "./model/keyboardShortcuts.js";
import {
  createTemplateSessionNote,
  deriveAutomaticTitleFromBlocks,
  getNoteDisplayTitle,
  getNoteIndexById,
  isTitleManuallyEdited,
  mergeNotes,
  mergeTrashedNotes,
  normalizeOrderedNoteIds,
  normalizeTitle,
  parseBlocksJSON,
  reorderNotesByIds,
} from "./model/notes.js";
import {
  getEditorFontFamilyCss,
  getEditorFontFamilyOptions,
  normalizeAppTheme,
  normalizeEditorPreferences,
  normalizeLayoutMode,
  normalizeTheme,
  stepAppZoom,
} from "./model/preferences.js";
import {
  getSessionTabStyle,
  getStickyShellStyle,
  resolveSessionTabAccentColor,
  resolveStickyAccentColor,
} from "./style/themeStyles.js";
import {
  applyThemeToDocument,
  getExportTheme,
  readInitialThemeId,
  withExportTheme,
} from "./style/applyTheme.js";
import {
  getTheme,
} from "./style/themes.js";
import {
  AdaptiveTooltipPortal,
} from "./ui/AdaptiveTooltip.jsx";
import {
  CodeBlockTools,
  useCodeBlockToolTargets,
} from "./ui/CodeBlockTools.jsx";
import {
  CropDialog,
} from "./ui/CropDialog.jsx";
import {
  ColorPanel,
} from "./ui/colorPanel.jsx";
import {
  EditorWidthSwitch,
  ExportPdfButton,
  LayoutModeSwitch,
  PreferencesButton,
  StickyPinButton,
  StickySettingsButton,
  StickyTrashButton,
} from "./ui/controls.jsx";
import {
  SessionCloseConfirmDialog,
  SessionTrashConfirmDialog,
  StickySettingsWindow,
  StickyTrashConfirmDialog,
} from "./ui/dialogs.jsx";
import {
  EllipsisIcon,
  NotePaneWordmark,
  SidebarToggleIcon,
} from "./ui/icons.jsx";
import {
  ExportFormatMenu,
  MarkdownImportDialog,
  SessionTabContextMenu,
} from "./ui/menus.jsx";
import {
  AppZoomGauge,
  LayoutTransitionOverlay,
  StickyToast,
  TableOfContentsRail,
  VersionHistoryPanel,
} from "./ui/overlays.jsx";
import {
  PreferencesWindow,
  normalizePreferencePageId,
} from "./ui/preferencesWindow.jsx";
import {
  isEditableFormTarget,
  isPointInsideElement,
  isVisibleElement,
} from "./utils/dom.js";
import { useAppliedTheme } from "./hooks/useAppliedTheme.js";
import { useEditorSurfaceShortcuts } from "./hooks/useEditorSurfaceShortcuts.js";
import { useFindInNote } from "./hooks/useFindInNote.js";
import { FindInNote, getFindSeedText } from "./editor/findInNote.js";
import { FindBar } from "./ui/FindBar.jsx";
import { useNoteSearchPalette } from "./hooks/useNoteSearchPalette.js";
import { SearchPalette } from "./ui/SearchPalette.jsx";
import {
  useChromeShortcuts,
  useSessionNumberShortcuts,
  useTabModeShortcuts,
} from "./hooks/useKeyboardCommands.js";
import { useNotePersistence } from "./hooks/useNotePersistence.js";
import { usePendingSaveFlush } from "./hooks/usePendingSaveFlush.js";
import { useSessionTabDrag } from "./hooks/useSessionTabDrag.js";
import { useStickyToasts } from "./hooks/useStickyToasts.js";
import {
  animateSessionTabReorder,
  collectNewSessionTabIds,
  getReorderedNoteIdsForDrop,
  getSessionTabRects,
} from "./utils/sessionTabAnimation.js";
import {
  arraysEqual,
  clamp,
  delay,
  moveArrayItem,
  nextAnimationFrame,
} from "./utils/values.js";
import "./styles.css";

function App({ bindTestThemeSetter }) {
  const [note, setNote] = useState(null);
  const [notes, setNotes] = useState([]);
  const [trashedNotes, setTrashedNotes] = useState([]);
  const [pendingFind, setPendingFind] = useState(null);
  // The note whose tab a double click asked to rename while its first click was still switching
  // to it. The switch remounts StickyEditor, so the request waits here for the new one.
  const [pendingRenameNoteId, setPendingRenameNoteId] = useState(null);
  // A rename asked for by a double click on another tab belongs to the switch that click starts; a
  // request that no switch picks up soon must not open the field on a later visit.
  useEffect(() => {
    if (!pendingRenameNoteId) {
      return undefined;
    }
    const timer = window.setTimeout(() => setPendingRenameNoteId(null), PENDING_RENAME_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [pendingRenameNoteId]);
  const [appTheme, setAppTheme] = useState(() =>
    normalizeAppTheme({ themeId: readInitialThemeId() }),
  );
  const [layoutMode, setLayoutMode] = useState(DEFAULT_LAYOUT_MODE);
  const [installedFontFamilies, setInstalledFontFamilies] = useState([]);
  const [editorPreferences, setEditorPreferences] = useState(
    DEFAULT_EDITOR_PREFERENCES,
  );
  const [recentEditorColors, setRecentEditorColors] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isEditorWide, setIsEditorWide] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sessionUndoToast, setSessionUndoToast] = useState(null);
  const [layoutTransition, setLayoutTransition] = useState(null);
  const sessionUndoToastTimerRef = useRef(null);
  const layoutTransitionTimerRef = useRef(null);

  const rememberRecentEditorColor = useCallback((colorChoice) => {
    setRecentEditorColors((currentColors) =>
      rememberEditorColor(currentColors, colorChoice),
    );
  }, []);

  const clearLayoutTransition = useCallback(() => {
    if (layoutTransitionTimerRef.current) {
      window.clearTimeout(layoutTransitionTimerRef.current);
      layoutTransitionTimerRef.current = null;
    }
    setLayoutTransition(null);
  }, []);

  const showLayoutTransition = useCallback(
    (payload = {}) => {
      if (layoutTransitionTimerRef.current) {
        window.clearTimeout(layoutTransitionTimerRef.current);
        layoutTransitionTimerRef.current = null;
      }

      setLayoutTransition({
        sourceMode: normalizeLayoutMode(payload.sourceMode),
        targetMode: normalizeLayoutMode(payload.targetMode),
        noteCount: Number.isFinite(payload.noteCount)
          ? payload.noteCount
          : notes.length,
      });
      layoutTransitionTimerRef.current = window.setTimeout(() => {
        setLayoutTransition(null);
        layoutTransitionTimerRef.current = null;
      }, LAYOUT_TRANSITION_TIMEOUT_MS);
    },
    [notes.length],
  );

  const hideSessionUndoToast = useCallback(() => {
    if (sessionUndoToastTimerRef.current) {
      window.clearTimeout(sessionUndoToastTimerRef.current);
      sessionUndoToastTimerRef.current = null;
    }
    setSessionUndoToast(null);
  }, []);

  const showSessionMovedToTrashToast = useCallback(({ noteId, title, source = "trash" }) => {
    if (sessionUndoToastTimerRef.current) {
      window.clearTimeout(sessionUndoToastTimerRef.current);
      sessionUndoToastTimerRef.current = null;
    }

    setSessionUndoToast({
      noteId,
      title: normalizeTitle(title),
      source,
    });
    sessionUndoToastTimerRef.current = window.setTimeout(() => {
      setSessionUndoToast(null);
      sessionUndoToastTimerRef.current = null;
    }, TRASH_UNDO_TOAST_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (sessionUndoToastTimerRef.current) {
        window.clearTimeout(sessionUndoToastTimerRef.current);
      }
      if (layoutTransitionTimerRef.current) {
        window.clearTimeout(layoutTransitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNote() {
      const noteId = new URLSearchParams(window.location.search).get("noteId");

      if (!electronApi) {
        const previewNote = {
          id: noteId || "browser-preview",
          title: DEFAULT_TITLE,
          titleManuallyEdited: false,
          blocksJSON: null,
          markdown: "",
          theme: DEFAULT_THEME,
          seedDemoContent: new URLSearchParams(window.location.search)
            .get("template") === "1",
          editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
	          trashedAt: null,
	          sortOrder: notes.length + 1,
	          createdAt: Date.now(),
	          updatedAt: Date.now(),
	        };
        setNotes([previewNote]);
        setTrashedNotes([]);
        setNote(previewNote);
        setLayoutMode(DEFAULT_LAYOUT_MODE);
        return;
      }

      const resolvedNoteId = noteId || await electronApi.getCurrentNoteId();
      const [
        loadedNotes,
        loadedAppTheme,
        loadedLayoutMode,
        loadedEditorPreferences,
        loadedTrashedNotes,
      ] = await Promise.all([
        electronApi.listNotes(),
        electronApi.getAppTheme?.(),
        electronApi.getLayoutMode?.(),
        electronApi.getEditorPreferences?.(),
        electronApi.listTrash?.(),
      ]);
      const loadedNote = resolvedNoteId
        ? await electronApi.getNote(resolvedNoteId)
        : null;

      if (!cancelled) {
        setAppTheme(normalizeAppTheme(loadedAppTheme));
        setLayoutMode(normalizeLayoutMode(loadedLayoutMode));
        setEditorPreferences(normalizeEditorPreferences(loadedEditorPreferences));
        const fallbackNote =
          loadedNote ??
          loadedNotes[0] ?? {
            id: "missing-note",
            title: DEFAULT_TITLE,
            titleManuallyEdited: false,
            blocksJSON: null,
            markdown: "",
            theme: DEFAULT_THEME,
            seedDemoContent: false,
            editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
            trashedAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        setNotes(mergeNotes(loadedNotes, fallbackNote));
        setTrashedNotes(Array.isArray(loadedTrashedNotes) ? loadedTrashedNotes : []);
        setNote(fallbackNote);
      }
    }

    loadNote();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return electronApi?.onAppThemeChanged?.((nextAppTheme) => {
      setAppTheme(normalizeAppTheme(nextAppTheme));
    });
  }, []);

  useEffect(() => {
    return electronApi?.onLayoutModeChanged?.((nextLayoutMode) => {
      setLayoutMode(normalizeLayoutMode(nextLayoutMode));
    });
  }, []);

  useEffect(() => {
    return electronApi?.onLayoutModeTransition?.((payload) => {
      if (payload?.phase === "start") {
        showLayoutTransition(payload);
        return;
      }

      if (payload?.phase === "finish") {
        clearLayoutTransition();
      }
    });
  }, [clearLayoutTransition, showLayoutTransition]);

  useEffect(() => {
    return electronApi?.onNotesChanged?.((payload) => {
      const nextNotes = Array.isArray(payload?.notes) ? payload.notes : [];
      const nextTrashedNotes = Array.isArray(payload?.trash) ? payload.trash : null;
      const activeNote = payload?.activeNote;

      setNotes(nextNotes);
      if (nextTrashedNotes) {
        setTrashedNotes(nextTrashedNotes);
      }
      setNote((currentNote) => {
        if (activeNote?.id) {
          return activeNote;
        }

        return (
          nextNotes.find((candidate) => candidate.id === currentNote?.id) ??
          nextNotes[0] ??
          currentNote
        );
      });
    });
  }, []);

  useEffect(() => {
    if (!electronApi?.takePendingFind) {
      return undefined;
    }
    // Pull on startup for a window created by a reveal, and on `find:open` for a
    // window that was already loaded. Whichever comes first takes the query.
    const takePendingFind = async () => {
      const request = await electronApi.takePendingFind();
      if (request) {
        setPendingFind(request);
      }
    };
    void takePendingFind();
    return electronApi.onFindOpenRequested?.(() => void takePendingFind());
  }, []);

  useEffect(() => {
    return electronApi?.onEditorPreferencesChanged?.((nextEditorPreferences) => {
      setEditorPreferences(normalizeEditorPreferences(nextEditorPreferences));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInstalledFonts() {
      const fontFamilies = await electronApi?.listFonts?.();
      if (!cancelled && Array.isArray(fontFamilies)) {
        setInstalledFontFamilies(fontFamilies);
      }
    }

    void loadInstalledFonts();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectNote = useCallback(
    async (noteId) => {
      const nextNote = electronApi
        ? await electronApi.activateNote(noteId)
        : notes.find((candidate) => candidate.id === noteId);

      if (nextNote) {
        setNote(nextNote);
        setNotes((currentNotes) => mergeNotes(currentNotes, nextNote));
      }
      return nextNote ?? null;
    },
    [notes],
  );

  const createSidebarNote = useCallback(async (options = {}) => {
    const template = options?.template === "default" ? "default" : "blank";
    const nextNote = electronApi
      ? await electronApi.createNote({ template })
      : {
          id: crypto.randomUUID(),
          title: template === "default" ? "NotePane" : DEFAULT_TITLE,
          titleManuallyEdited: false,
          blocksJSON:
            template === "default" ? NOTE_PANE_TEMPLATE_BLOCKS_JSON : null,
          markdown: "",
          theme: DEFAULT_THEME,
          seedDemoContent: false,
          editorFontFamily: editorPreferences.editorFontFamily,
          trashedAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

    setNotes((currentNotes) => mergeNotes(currentNotes, nextNote));

    if (electronApi) {
      const currentLayoutMode = normalizeLayoutMode(
        await electronApi.getLayoutMode?.() ?? layoutMode,
      );
      if (currentLayoutMode === "sticky") {
        return nextNote;
      }

      const activatedNote = await electronApi.activateNote(nextNote.id);
      setNote(activatedNote ?? nextNote);
      return;
    }

    setNote(nextNote);
  }, [editorPreferences, layoutMode, notes.length]);

  const reorderNotes = useCallback(
    async (orderedNoteIds, options = {}) => {
      const shouldPersist = options.persist !== false;
      setNotes((currentNotes) => reorderNotesByIds(currentNotes, orderedNoteIds));

      if (!electronApi || !shouldPersist) {
        return null;
      }

      const result = await electronApi.reorderNotes?.(orderedNoteIds);
      if (Array.isArray(result?.notes)) {
        setNotes(result.notes);
      }
      if (result?.activeNote) {
        setNote(result.activeNote);
      }
      return result;
    },
    [],
  );

  const deleteSidebarNote = useCallback(
    async (noteId, noteSnapshot = null) => {
      if (electronApi) {
        const result = await electronApi.deleteNote(noteId);
        const nextNotes = Array.isArray(result?.notes)
          ? result.notes
          : await electronApi.listNotes();
        const nextTrashedNotes = Array.isArray(result?.trash)
          ? result.trash
          : await electronApi.listTrash?.();
        const nextNote =
          result?.activeNote ??
          (note?.id === noteId
            ? nextNotes[0]
            : nextNotes.find((candidate) => candidate.id === note?.id));

        setNotes(nextNotes);
        if (Array.isArray(nextTrashedNotes)) {
          setTrashedNotes(nextTrashedNotes);
        }
        if (nextNote) {
          setNote(nextNote);
        }
        return result;
      }

      const storedDeletedNote = notes.find((candidate) => candidate.id === noteId);
      const deletedNote =
        noteSnapshot?.id === noteId
          ? { ...storedDeletedNote, ...noteSnapshot }
          : storedDeletedNote;
      if (!deletedNote) {
        return {
          deleted: false,
          notes,
          trash: trashedNotes,
          activeNote: note,
        };
      }
      const deletedNoteIndex = notes.findIndex((candidate) => candidate.id === noteId);
      const nextNotes = notes.filter((candidate) => candidate.id !== noteId);
      const now = Date.now();
      const trashedNote = {
        ...deletedNote,
        alwaysOnTop: false,
        trashedAt: now,
        updatedAt: now,
      };
      const templateNote =
        nextNotes.length === 0 ? createTemplateSessionNote(deletedNote, now) : null;
      const visibleNotes = templateNote ? [templateNote] : nextNotes;
      setNotes(visibleNotes);
      setTrashedNotes((currentTrashedNotes) =>
        mergeTrashedNotes(currentTrashedNotes, trashedNote),
      );
      const nextNote =
        templateNote ??
        (note?.id === noteId
          ? nextNotes[deletedNoteIndex] ?? nextNotes[deletedNoteIndex - 1] ?? null
          : note);
      if (nextNote) {
        setNote(nextNote);
      }

      return {
        deleted: true,
        notes: visibleNotes,
        trash: mergeTrashedNotes(trashedNotes, trashedNote),
        activeNote: nextNote,
      };
    },
    [note, notes, trashedNotes],
  );

  const restoreTrashedNote = useCallback(
    async (noteId, options = {}) => {
      if (electronApi) {
        const result = await electronApi.restoreNote?.(noteId);
        const nextNotes = Array.isArray(result?.notes)
          ? result.notes
          : await electronApi.listNotes();
        const nextTrashedNotes = Array.isArray(result?.trash)
          ? result.trash
          : await electronApi.listTrash?.();
        const restoredNote = result?.note ?? nextNotes.find((candidate) => candidate.id === noteId);
        const nextNote =
          options.activate && restoredNote
            ? await electronApi.activateNote(restoredNote.id)
            : result?.activeNote ?? restoredNote ?? nextNotes[0] ?? null;

        setNotes(nextNotes);
        if (Array.isArray(nextTrashedNotes)) {
          setTrashedNotes(nextTrashedNotes);
        }
        if (nextNote) {
          setNote(nextNote);
        }
        return {
          ...result,
          activeNote: nextNote,
        };
      }

      const restoredNote = trashedNotes.find((candidate) => candidate.id === noteId);
      if (!restoredNote) {
        return;
      }

      const activeNote = {
        ...restoredNote,
        alwaysOnTop: false,
        trashedAt: null,
        updatedAt: Date.now(),
      };
      setTrashedNotes((currentTrashedNotes) =>
        currentTrashedNotes.filter((candidate) => candidate.id !== noteId),
      );
      setNotes((currentNotes) => mergeNotes(currentNotes, activeNote));
      if (options.activate) {
        setNote(activeNote);
      } else {
        setNote((currentNote) => currentNote ?? activeNote);
      }
      return {
        restored: true,
        note: activeNote,
        activeNote,
      };
    },
    [trashedNotes],
  );

  const undoSessionMoveToTrash = useCallback(async () => {
    const noteId = sessionUndoToast?.noteId;
    if (!noteId) {
      return;
    }

    hideSessionUndoToast();
    await restoreTrashedNote(noteId, { activate: true });
  }, [hideSessionUndoToast, restoreTrashedNote, sessionUndoToast?.noteId]);

  const purgeTrashedNote = useCallback(
    async (noteId) => {
      if (electronApi) {
        const result = await electronApi.purgeNote?.(noteId);
        const nextTrashedNotes = Array.isArray(result?.trash)
          ? result.trash
          : await electronApi.listTrash?.();
        if (Array.isArray(result?.notes)) {
          setNotes(result.notes);
        }
        if (Array.isArray(nextTrashedNotes)) {
          setTrashedNotes(nextTrashedNotes);
        }
        if (result?.activeNote) {
          setNote(result.activeNote);
        }
        return;
      }

      setTrashedNotes((currentTrashedNotes) =>
        currentTrashedNotes.filter((candidate) => candidate.id !== noteId),
      );
    },
    [],
  );

  const updateNoteInList = useCallback((updatedNote) => {
    setNotes((currentNotes) => mergeNotes(currentNotes, updatedNote));
    setNote((currentNote) =>
      currentNote?.id === updatedNote.id
        ? { ...currentNote, ...updatedNote }
      : currentNote,
    );
  }, []);

  const updateAppTheme = useCallback(async (themeId) => {
    const nextAppTheme = normalizeAppTheme({ themeId });
    setAppTheme(nextAppTheme);
    await electronApi?.updateAppTheme?.(nextAppTheme);
  }, []);

  // Dev-only test hook (src/style/sentinelThemes.js); null in production.
  useEffect(() => bindTestThemeSetter?.(updateAppTheme), [bindTestThemeSetter, updateAppTheme]);

  const updateLayoutMode = useCallback(async (mode) => {
    const previousLayoutMode = normalizeLayoutMode(layoutMode);
    const nextLayoutMode = normalizeLayoutMode(mode);
    const isChangingMode = previousLayoutMode !== nextLayoutMode;

    if (isChangingMode) {
      showLayoutTransition({
        sourceMode: previousLayoutMode,
        targetMode: nextLayoutMode,
        noteCount: notes.length,
      });
    }

    setLayoutMode(nextLayoutMode);
    try {
      const resolvedLayoutMode = await electronApi?.updateLayoutMode?.(nextLayoutMode);
      if (resolvedLayoutMode) {
        setLayoutMode(normalizeLayoutMode(resolvedLayoutMode));
      }
    } catch (error) {
      setLayoutMode(previousLayoutMode);
      console.error("Layout mode update failed", error);
    } finally {
      if (isChangingMode) {
        clearLayoutTransition();
      }
    }
  }, [clearLayoutTransition, layoutMode, notes.length, showLayoutTransition]);

  const updateEditorPreferences = useCallback(async (nextEditorPreferences) => {
    const normalizedEditorPreferences =
      normalizeEditorPreferences(nextEditorPreferences);
    setEditorPreferences(normalizedEditorPreferences);
    await electronApi?.updateEditorPreferences?.(normalizedEditorPreferences);
  }, []);

  if (!note) {
    return <div className="loading">Loading BlockNote…</div>;
  }

  return (
    <>
      <StickyEditor
        key={note.id}
        note={note}
        notes={notes}
        trashedNotes={trashedNotes}
        appTheme={appTheme}
        layoutMode={layoutMode}
        isSidebarOpen={isSidebarOpen}
        isEditorWide={isEditorWide}
        onEditorWidthChange={setIsEditorWide}
        setIsSidebarOpen={setIsSidebarOpen}
        sidebarWidth={sidebarWidth}
        setSidebarWidth={setSidebarWidth}
        onCreateNote={createSidebarNote}
        onDeleteNote={deleteSidebarNote}
        onRestoreTrashedNote={restoreTrashedNote}
        onPurgeTrashedNote={purgeTrashedNote}
        onSelectNote={selectNote}
        onNoteChanged={updateNoteInList}
        onAppThemeChanged={updateAppTheme}
        onLayoutModeChanged={updateLayoutMode}
        onReorderNotes={reorderNotes}
        onSessionMovedToTrash={showSessionMovedToTrashToast}
        installedFontFamilies={installedFontFamilies}
        editorPreferences={editorPreferences}
        onEditorPreferencesChanged={updateEditorPreferences}
        recentEditorColors={recentEditorColors}
        onEditorColorUsed={rememberRecentEditorColor}
        layoutTransition={layoutTransition}
        pendingFind={pendingFind}
        onFindRequested={setPendingFind}
        onPendingFindHandled={() => setPendingFind(null)}
        pendingRenameNoteId={pendingRenameNoteId}
        onRenameRequested={setPendingRenameNoteId}
        onPendingRenameHandled={() => setPendingRenameNoteId(null)}
      />
      {sessionUndoToast && (
        <StickyToast
        toast={{
            message:
              sessionUndoToast.source === "close"
                ? `${sessionUndoToast.title} closed and moved to Trash.`
                : `${sessionUndoToast.title} moved to Trash.`,
            tone: "success",
            action: {
              label: "Undo",
              onClick: () => void undoSessionMoveToTrash(),
            },
          }}
        />
      )}
    </>
  );
}

function StickyEditor({
  note,
  notes,
  trashedNotes,
  appTheme,
  layoutMode,
  isSidebarOpen,
  isEditorWide,
  onEditorWidthChange,
  setIsSidebarOpen,
  sidebarWidth,
  setSidebarWidth,
  onCreateNote,
  onDeleteNote,
  onRestoreTrashedNote,
  onPurgeTrashedNote,
  onSelectNote,
  onNoteChanged,
  onAppThemeChanged,
  onLayoutModeChanged,
  onReorderNotes,
  onSessionMovedToTrash,
  installedFontFamilies,
  editorPreferences,
  onEditorPreferencesChanged,
  recentEditorColors,
  onEditorColorUsed,
  layoutTransition,
  pendingFind,
  onFindRequested,
  onPendingFindHandled,
  pendingRenameNoteId,
  onRenameRequested,
  onPendingRenameHandled,
}) {
  const parsedStoredBlocks = useMemo(
    () => parseBlocksJSON(note.blocksJSON),
    [note.blocksJSON],
  );
  const initialEditorContent = useMemo(
    () =>
      parsedStoredBlocks ??
      (note.seedDemoContent ? NOTE_PANE_TEMPLATE_BLOCKS : EMPTY_BLOCKS),
    [note.seedDemoContent, parsedStoredBlocks],
  );
  const initialDisplayTitle = useMemo(
    () => getNoteDisplayTitle(note, initialEditorContent),
    [initialEditorContent, note],
  );

  const editor = useCreateBlockNote({
    schema,
    extensions: [BlockDragSelection, FindInNote, FileDrop, MarkdownShortcutUndo],
    initialContent: initialEditorContent,
    tabBehavior: "prefer-indent",
    // BlockNote paints this onto the drop cursor element, which resolves the token itself and
    // so follows a theme change without a new editor.
    dropCursor: {
      color: "var(--notepane-drop-cursor)",
      hooks: { computeDropPosition: computeCalloutDropPosition },
    },
    tables: {
      splitCells: true,
      cellBackgroundColor: true,
      cellTextColor: true,
      headers: true,
    },
    uploadFile,
    pasteHandler: ({ event, editor, defaultPasteHandler }) => {
      // BlockNote's own file paste cannot be undone in one step (see src/editor/fileInsertion.js).
      if (isFileTransfer(event.clipboardData)) {
        pasteFiles(editor, [...event.clipboardData.files]);
        return true;
      }
      const plainText = event.clipboardData?.getData("text/plain") ?? "";
      if (plainText && !isSelectionInsideCodeBlock(editor)) {
        const pasteView = editor.prosemirrorView;
        const isBlockSet = isBlockSetSelection(pasteView?.state.selection);
        if (
          isStandaloneWebUrl(plainText) &&
          (isBlockSet || hasEditorRangeSelection(editor))
        ) {
          // The default paste would link the selected blocks' text instead of replacing it,
          // and insertInlineContent sees only the first run.
          if (isBlockSet) {
            replaceBlockSelectionWithParagraph(pasteView);
          }
          editor.insertInlineContent(plainText.trim(), { updateSelection: true });
          return true;
        }

        // NotePane's own copies carry lossless blocknote/html, and VS Code
        // copies carry their language. BlockNote handles both, so their
        // Markdown-looking plain text must not be re-parsed here.
        const clipboardTypes = event.clipboardData?.types ?? [];
        if (
          clipboardTypes.includes("blocknote/html") ||
          clipboardTypes.includes("vscode-editor-data")
        ) {
          return defaultPasteHandler({
            prioritizeMarkdownOverHTML: true,
            plainTextAsMarkdown: true,
          });
        }

        const normalizedPaste = normalizePastedMarkdownForBlockNote(
          plainText,
          event.clipboardData?.getData("text/html") ?? "",
        );
        if (normalizedPaste.shouldPasteHTML) {
          return defaultPasteHandler({
            prioritizeMarkdownOverHTML: false,
            plainTextAsMarkdown: true,
          });
        }
        if (normalizedPaste.shouldPasteAsMarkdown) {
          editor.pasteMarkdown(normalizedPaste.markdown);
          return true;
        }
      }

      return defaultPasteHandler({
        prioritizeMarkdownOverHTML: true,
        plainTextAsMarkdown: true,
      });
    },
  });
  const findInNote = useFindInNote(editor);
  const { openFind } = findInNote;
  const openFindInNote = useCallback(
    () => openFind(getFindSeedText(editor)),
    [editor, openFind],
  );
  useBlockNoteFloatingMenuGuard();
  useEffect(() => guardPasteSerialisation(editor), [editor]);
  const codeBlockToolTargets = useCodeBlockToolTargets();

  useEffect(() => {
    const copySelectedBlock = (event) => {
      // The editor's own cut of a block set would serialise only its first
      // run but delete every run, so a block-set cut is handled here too.
      if (isEditableFormTarget(event.target)) {
        return false;
      }
      const isBlockSetCut =
        event.type === "cut" &&
        isEditorShortcutTarget(event.target) &&
        isBlockSetSelection(editor.prosemirrorView?.state.selection);
      if (
        (event.type !== "copy" && !isBlockSetCut) ||
        !event.clipboardData
      ) {
        return false;
      }

      const selectedBlocks = getBlocksForClipboard(editor);
      if (selectedBlocks.length === 0) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      setBlocksClipboardData(editor, selectedBlocks, event.clipboardData);
      if (isBlockSetCut) {
        const { state } = editor.prosemirrorView;
        editor.prosemirrorView.dispatch(
          state.tr.deleteSelection().scrollIntoView(),
        );
      }
      return true;
    };

    // Block copies must pre-empt the editor, so they run in the capture phase
    // and stop propagation once they own the clipboard.
    const writeSelectedBlocks = (event) => {
      copySelectedBlock(event);
    };

    // A text selection is serialised by the editor itself, so normalising has
    // to happen in the bubble phase, after the editor has written text/plain.
    const normalizeEditorClipboardText = (event) => {
      if (!isEditorShortcutTarget(event.target) || !event.clipboardData) {
        return;
      }

      const copiedPlainText = event.clipboardData.getData("text/plain");
      const selectedPlainText = window.getSelection()?.toString() ?? "";
      const normalizedPlainText = normalizeCopiedEditorPlainText(
        editor,
        copiedPlainText,
        selectedPlainText,
      );
      if (normalizedPlainText !== copiedPlainText) {
        event.clipboardData.setData("text/plain", normalizedPlainText);
      }
    };

    document.addEventListener("copy", writeSelectedBlocks, true);
    document.addEventListener("cut", writeSelectedBlocks, true);
    document.addEventListener("copy", normalizeEditorClipboardText);
    document.addEventListener("cut", normalizeEditorClipboardText);
    return () => {
      document.removeEventListener("copy", writeSelectedBlocks, true);
      document.removeEventListener("cut", writeSelectedBlocks, true);
      document.removeEventListener("copy", normalizeEditorClipboardText);
      document.removeEventListener("cut", normalizeEditorClipboardText);
    };
  }, [editor]);

  const [title, setTitle] = useState(initialDisplayTitle);
  const editorSurfaceRef = useRef(null);
  const suppressFocusedTableCellRef = useRef(false);
  const pendingTableExtensionFocusRef = useRef(null);
  const focusedTableDecorationsRef = useRef(null);
  const [isTableCellSelectionDismissed, setIsTableCellSelectionDismissed] =
    useState(false);
  // Escape on selected cells hides the formatting toolbar and keeps the editor focused, so the next
  // selection the user makes, by keyboard too, brings it back.
  useEffect(() => editor.onSelectionChange(() => setIsTableCellSelectionDismissed(false)), [editor]);
  const [isMultiTableCellSelection, setIsMultiTableCellSelection] = useState(
    false,
  );
  const updateFocusedTableCell = useCallback(() => {}, []);
  useEffect(() => {
    const view = editor.prosemirrorView;
    if (!view || view.isDestroyed) {
      return undefined;
    }
    const decorations = (state) => {
        if (
          suppressFocusedTableCellRef.current ||
          columnResizingPluginKey.getState(state)?.dragging
        ) {
          return DecorationSet.empty;
        }
        const selection = state.selection;
        const isSingleCellSelection = Boolean(
          selection.$anchorCell &&
            selection.$headCell &&
            selection.$anchorCell.pos === selection.$headCell.pos,
        );
        if (!selection.empty && !isSingleCellSelection && !pendingTableExtensionFocusRef.current) {
          return DecorationSet.empty;
        }
        const preservedCell = pendingTableExtensionFocusRef.current
          ? getTableCellElementForSnapshot(editor, pendingTableExtensionFocusRef.current)
          : null;
        const preservedRange = preservedCell
          ? getCurrentTableCellRange({
              $from: state.doc.resolve(view.posAtDOM(preservedCell, 0)),
            })
          : null;
        const cellRange = preservedRange || getCurrentTableCellRange(selection);
        const cellNode = cellRange ? state.doc.nodeAt(cellRange.cellPos) : null;
        if (!cellRange || !cellNode) {
          return DecorationSet.empty;
        }
        return DecorationSet.create(state.doc, [
          Decoration.node(
            cellRange.cellPos,
            cellRange.cellPos + cellNode.nodeSize,
            { class: "notepane-table-cell-focused" },
          ),
        ]);
      };
    focusedTableDecorationsRef.current = decorations;
    view.setProps({ decorations });
    return () => {
      if (!view.isDestroyed) {
        view.setProps({ decorations: undefined });
      }
      focusedTableDecorationsRef.current = null;
    };
  }, [editor]);
  useEffect(() => {
    const isTableExtensionButton = (target) => (
      target instanceof Element && target.closest(
        ".bn-extend-button-add-remove-columns, .bn-extend-button-add-remove-rows",
      )
    );
    const captureFocusedCellBeforeTableExtension = (event) => {
      if (!isTableExtensionButton(event.target)) {
        return;
      }

      pendingTableExtensionFocusRef.current = getFocusedTableCellSnapshot(editor);
    };
    const restoreFocusedCellAfterTableExtension = () => {
      const pendingSnapshot = pendingTableExtensionFocusRef.current;
      if (!pendingSnapshot) {
        return;
      }

      window.requestAnimationFrame(() => {
        const snapshot = pendingTableExtensionFocusRef.current;
        pendingTableExtensionFocusRef.current = null;
        if (snapshot && restoreFocusedTableCell(editor, snapshot)) {
          updateFocusedTableCell();
        }
      });
    };

    const handleTableExtensionMouseUp = () => {
      restoreFocusedCellAfterTableExtension();
    };
    const handleTableExtensionClick = (event) => {
      if (!(event.target instanceof Element) || !event.target.closest(
        ".bn-extend-button-add-remove-columns, .bn-extend-button-add-remove-rows",
      )) {
        return;
      }
      restoreFocusedCellAfterTableExtension();
    };

    document.addEventListener("mousedown", captureFocusedCellBeforeTableExtension, true);
    document.addEventListener("mouseup", handleTableExtensionMouseUp, true);
    document.addEventListener("click", handleTableExtensionClick, true);
    return () => {
      document.removeEventListener("mousedown", captureFocusedCellBeforeTableExtension, true);
      document.removeEventListener("mouseup", handleTableExtensionMouseUp, true);
      document.removeEventListener("click", handleTableExtensionClick, true);
    };
  }, [editor, updateFocusedTableCell]);
  const updateTableCellSelectionMode = useCallback(() => {
    const selection = editor.prosemirrorView?.state.selection;
    setIsMultiTableCellSelection(
      Boolean(
        selection?.$anchorCell &&
          selection?.$headCell &&
          selection.$anchorCell.pos !== selection.$headCell.pos,
      ),
    );
  }, [editor]);
  const [theme, setTheme] = useState(normalizeTheme(note.theme));
  const normalizedEditorPreferences = useMemo(
    () => normalizeEditorPreferences(editorPreferences),
    [editorPreferences],
  );
  const editorFontFamily = normalizedEditorPreferences.editorFontFamily;
  const appFontFamily = normalizedEditorPreferences.appFontFamily;
  const showTableOfContents = normalizedEditorPreferences.showTableOfContents;
  const keyboardShortcuts = normalizedEditorPreferences.keyboardShortcuts;
  const keyboardShortcutEnabled =
    normalizedEditorPreferences.keyboardShortcutEnabled;
  const matchesEnabledKeyboardShortcut = useCallback(
    (event, commandId) =>
      isKeyboardShortcutEnabled(keyboardShortcutEnabled, commandId) &&
      matchesKeyboardShortcut(event, keyboardShortcuts[commandId]),
    [keyboardShortcutEnabled, keyboardShortcuts],
  );
  const getEnabledShortcut = useCallback(
    (commandId) =>
      isKeyboardShortcutEnabled(keyboardShortcutEnabled, commandId)
        ? keyboardShortcuts[commandId]
        : "",
    [keyboardShortcutEnabled, keyboardShortcuts],
  );
  const editorFontOptions = useMemo(
    () => getEditorFontFamilyOptions(installedFontFamilies, editorFontFamily),
    [editorFontFamily, installedFontFamilies],
  );
  const appFontOptions = useMemo(
    () => getEditorFontFamilyOptions(installedFontFamilies, appFontFamily),
    [appFontFamily, installedFontFamilies],
  );
  const appTypographyStyle = useMemo(() => {
    const appFontFamilyCss = getEditorFontFamilyCss(
      appFontFamily,
      appFontOptions,
    );
    return {
      "--notepane-ui-font": appFontFamilyCss,
      "--notepane-display-font": appFontFamilyCss,
      "--notepane-app-zoom": String(normalizedEditorPreferences.appZoom),
    };
  }, [appFontFamily, appFontOptions, normalizedEditorPreferences.appZoom]);
  const activeTheme = useAppliedTheme(normalizeAppTheme(appTheme).themeId);
  const normalizedLayoutMode = normalizeLayoutMode(layoutMode);
  const visibleSessionNotes = notes;
  const visibleSessionNoteIds = useMemo(
    () => visibleSessionNotes.map((sessionNote) => sessionNote.id),
    [visibleSessionNotes],
  );
  const noteIndexById = useMemo(() => getNoteIndexById(notes), [notes]);
  const noteIndex = noteIndexById.get(note.id) ?? 0;
  const stickyAccentColor = resolveStickyAccentColor(theme, noteIndex);
  const stickyChromeStyle = useMemo(
    () =>
      normalizedLayoutMode === "sticky"
        ? getStickyShellStyle(theme, stickyAccentColor, activeTheme)
        : {},
    [activeTheme, normalizedLayoutMode, stickyAccentColor, theme],
  );
  const shellStyle = {
    ...stickyChromeStyle,
    ...appTypographyStyle,
    "--editor-font-family": getEditorFontFamilyCss(
      editorFontFamily,
      editorFontOptions,
    ),
  };
  const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
  const [isPreferencesWindowOpen, setIsPreferencesWindowOpen] = useState(false);
  const [preferencesInitialPage, setPreferencesInitialPage] = useState("general");
  const [isStickySettingsOpen, setIsStickySettingsOpen] = useState(false);
  const [isStickyTrashConfirmOpen, setIsStickyTrashConfirmOpen] = useState(false);
  const [isStickyActionBarOpen, setIsStickyActionBarOpen] = useState(false);
  const [isDefaultTemplateSuggestionVisible, setIsDefaultTemplateSuggestionVisible] =
    useState(
      () =>
        normalizedLayoutMode === "tabs" &&
        isEmptySessionDocument(initialEditorContent),
    );
  const [pendingSessionTrashNote, setPendingSessionTrashNote] = useState(null);
  const [pendingSessionCloseNote, setPendingSessionCloseNote] = useState(null);
  const [sessionTabMenu, setSessionTabMenu] = useState(null);
  const [sessionColorPanelNoteId, setSessionColorPanelNoteId] = useState(null);
  const [isEditorActive, setIsEditorActive] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [draftSessionTitle, setDraftSessionTitle] = useState("");
  const [isDraftSessionTitleDirty, setIsDraftSessionTitleDirty] = useState(false);
  const [enteringSessionIds, setEnteringSessionIds] = useState(() => new Set());
  const [removingSessionIds, setRemovingSessionIds] = useState(() => new Set());
  const [draggingSessionNoteId, setDraggingSessionNoteId] = useState(null);
  const [isPinned, setIsPinned] = useState(Boolean(note.alwaysOnTop));
  const [activeImageBlockId, setActiveImageBlockId] = useState(null);
  const [cropState, setCropState] = useState(null);
  const {
    exportToast,
    hideExportToast,
    showExportToast,
    showZoomGauge,
    zoomGauge,
  } = useStickyToasts();
  useEffect(() => {
    const reportFailedFile = (event) => {
      showExportToast(`Could not add ${event.detail.name}.`, "error");
    };
    window.addEventListener(FILE_INSERTION_FAILED_EVENT, reportFailedFile);
    return () => window.removeEventListener(FILE_INSERTION_FAILED_EVENT, reportFailedFile);
  }, [showExportToast]);
  const [exportFormatMenu, setExportFormatMenu] = useState(null);
  const [isMarkdownImportOpen, setIsMarkdownImportOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [noteVersions, setNoteVersions] = useState([]);
  const [isVersionBusy, setIsVersionBusy] = useState(false);
  const [tableOfContentsEntries, setTableOfContentsEntries] = useState(() =>
    extractTableOfContentsEntries(initialEditorContent),
  );
  const [activeTableOfContentsEntryIds, setActiveTableOfContentsEntryIds] =
    useState(() => (tableOfContentsEntries[0]?.id ? [tableOfContentsEntries[0].id] : []));
  const saveTimerRef = useRef(null);
  const saveRetryTimerRef = useRef(null);
  const isEditorDirtyRef = useRef(false);
  const appearanceTimerRef = useRef(null);
  const sessionAppearanceTimerRef = useRef(null);
  // Payloads waiting on the appearance debounce, sent on unmount instead of dropped.
  const pendingAppearanceRef = useRef(null);
  const pendingSessionAppearanceRef = useRef(null);
  const sessionTabRowsRef = useRef(new Map());
  const previousSessionTabRectsRef = useRef(null);
  const lastSavedBlocksRef = useRef("");
  const isSidebarCompact = normalizedLayoutMode === "tabs" && !isSidebarOpen;
  const sidebarState = isSidebarCompact ? "compact" : "expanded";
  const sidebarStyle = {
    "--session-sidebar-width": `${
      isSidebarCompact ? SIDEBAR_COMPACT_WIDTH : sidebarWidth
    }px`,
  };
  const isTableOfContentsVisible =
    normalizedLayoutMode === "tabs" &&
    showTableOfContents &&
    tableOfContentsEntries.length > 0;
  const shouldRenderChromeHeader =
    normalizedLayoutMode === "sticky" || !isWindowsRuntime();

  useEffect(() => {
    const portalStyleEntries = Object.entries({
      ...stickyChromeStyle,
      ...appTypographyStyle,
    });

    for (const [name, value] of portalStyleEntries) {
      document.body.style.setProperty(name, value);
    }

    return () => {
      for (const [name] of portalStyleEntries) {
        document.body.style.removeProperty(name);
      }
    };
  }, [appTypographyStyle, stickyChromeStyle]);

  useEffect(() => {
    setIsPinned(Boolean(note.alwaysOnTop));
  }, [note.alwaysOnTop, note.id]);

  useEffect(() => {
    setTitle(getNoteDisplayTitle(note, editor.document));
  }, [
    editor,
    note.blocksJSON,
    note.id,
    note.markdown,
    note.title,
    note.titleManuallyEdited,
  ]);

  // The window takes the page title as its own, which Mission Control and the Dock list it by.
  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    if (normalizedLayoutMode !== "sticky") {
      setIsStickySettingsOpen(false);
      setIsStickyTrashConfirmOpen(false);
      setIsStickyActionBarOpen(false);
    }
    if (normalizedLayoutMode !== "tabs") {
      setPendingSessionTrashNote(null);
      setPendingSessionCloseNote(null);
      setIsPreferencesWindowOpen(false);
    }
  }, [normalizedLayoutMode, note.id]);

  useEffect(() => {
    if (!pendingSessionTrashNote) {
      return;
    }

    const stillVisible = visibleSessionNotes.some(
      (sessionNote) => sessionNote.id === pendingSessionTrashNote.id,
    );
    if (!stillVisible) {
      setPendingSessionTrashNote(null);
    }
  }, [pendingSessionTrashNote, visibleSessionNotes]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (
        target.closest(".editor-font-setting-control") ||
        target.closest(".editor-floating-menu") ||
        target.closest(".session-tab-context-menu") ||
        target.closest(".export-format-menu") ||
        target.closest(".export-icon-button")
      ) {
        return;
      }

      setSessionTabMenu(null);
      setExportFormatMenu(null);
      if (!target.closest(".sticky-header-actions")) {
        setIsStickyActionBarOpen(false);
      }

      if (
        !target.closest("[data-testid='sticky-editor-surface']")
      ) {
        setIsEditorActive(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);

  useEffect(() => {
    if (parsedStoredBlocks || !note.markdown?.trim()) {
      return;
    }

    try {
      const blocks = editor.tryParseMarkdownToBlocks(note.markdown);
      if (blocks.length > 0) {
        editor.replaceBlocks(editor.document, blocks);
        setTableOfContentsEntries(extractTableOfContentsEntries(blocks));
      }
    } catch {
      const fallbackBlocks = [
        {
          type: "paragraph",
          content: note.markdown,
        },
      ];
      editor.replaceBlocks(editor.document, fallbackBlocks);
      setTableOfContentsEntries(extractTableOfContentsEntries(fallbackBlocks));
    }
  }, [editor, note.markdown, parsedStoredBlocks]);

  const {
    getCurrentNoteSnapshot,
    saveNow,
    saveVersionNow,
    scheduleSave,
    updateAutomaticTitleFromBlocks,
  } = useNotePersistence({
    editor,
    isEditorDirtyRef,
    isVersionHistoryOpen,
    lastSavedBlocksRef,
    note,
    onNoteChanged,
    saveRetryTimerRef,
    saveTimerRef,
    setNoteVersions,
    setTitle,
  });

  // Runs on every editor change. Unchanged entries and an already empty active list keep their
  // arrays, so React skips the renders: a new array each keystroke chained synchronous renders
  // until fast typing hit React's nested-update limit, which threw inside the editor's
  // transaction.
  const refreshTableOfContents = useCallback(() => {
    const entries = extractTableOfContentsEntries(editor.document);
    setTableOfContentsEntries((previous) => (
      areTableOfContentsEntriesEqual(previous, entries) ? previous : entries
    ));
  }, [editor]);

  useEffect(() => {
    const surface = editorSurfaceRef.current;
    if (!surface || !isTableOfContentsVisible || tableOfContentsEntries.length === 0) {
      setActiveTableOfContentsEntryIds((previous) => (previous.length === 0 ? previous : []));
      return undefined;
    }

    let frameId = 0;
    const updateActiveHeading = () => {
      frameId = 0;
      const surfaceTop = surface.getBoundingClientRect().top;
      const activationLine = surfaceTop + 48;
      const blocks = tableOfContentsEntries
        .map((entry) => ({ entry, element: getEditorBlockElement(entry.id) }))
        .filter(({ element }) => element);
      if (blocks.length === 0) return;

      const currentIndex = blocks.reduce((index, block, nextIndex) => (
        block.element.getBoundingClientRect().top <= activationLine ? nextIndex : index
      ), 0);
      const current = blocks[currentIndex];
      const activeIds = [current.entry.id];
      for (let index = currentIndex - 1; index >= 0; index -= 1) {
        if (blocks[index].entry.level < current.entry.level) {
          activeIds.push(blocks[index].entry.id);
          break;
        }
      }

      setActiveTableOfContentsEntryIds((previous) => (
        previous.length === activeIds.length && previous.every((id, index) => id === activeIds[index])
          ? previous
          : activeIds
      ));
    };
    const scheduleActiveHeadingUpdate = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updateActiveHeading);
    };

    surface.addEventListener("scroll", scheduleActiveHeadingUpdate, { passive: true });
    window.addEventListener("resize", scheduleActiveHeadingUpdate);
    scheduleActiveHeadingUpdate();
    return () => {
      surface.removeEventListener("scroll", scheduleActiveHeadingUpdate);
      window.removeEventListener("resize", scheduleActiveHeadingUpdate);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [isTableOfContentsVisible, tableOfContentsEntries]);

  const handleEditorChange = useCallback(() => {
    if (!isEmptySessionDocument(editor.document)) {
      setIsDefaultTemplateSuggestionVisible(false);
    }
    updateAutomaticTitleFromBlocks(editor.document);
    refreshTableOfContents();
    isEditorDirtyRef.current = true;
    scheduleSave();
  }, [editor, refreshTableOfContents, scheduleSave, updateAutomaticTitleFromBlocks]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (isEditorDirtyRef.current) {
        void saveNow();
      }
    }, 30000);
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden" && isEditorDirtyRef.current) {
        void saveNow();
      }
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flushWhenHidden);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flushWhenHidden);
    };
  }, [saveNow]);

  const openVersionHistory = useCallback(async () => {
    setIsVersionHistoryOpen(true);
    setIsVersionBusy(true);
    try {
      setNoteVersions(await electronApi?.listNoteVersions?.(note.id) ?? []);
    } finally {
      setIsVersionBusy(false);
    }
  }, [note.id]);

  const restoreVersion = useCallback(async (version) => {
    setIsVersionBusy(true);
    try {
      await saveNow();
      const restored = await electronApi?.restoreNoteVersion?.({ noteId: note.id, versionId: version.id });
      if (!restored) return;
      const blocks = JSON.parse(restored.blocksJSON);
      editor.replaceBlocks(editor.document, blocks);
      lastSavedBlocksRef.current = restored.blocksJSON;
      setTitle(restored.title);
      onNoteChanged(restored);
      setNoteVersions(await electronApi.listNoteVersions(note.id));
    } finally {
      setIsVersionBusy(false);
    }
  }, [editor, note.id, onNoteChanged, saveNow]);

  useEffect(() => {
    refreshTableOfContents();
  }, [note.id, refreshTableOfContents]);

  const scheduleAppearanceSave = useCallback(
    (nextTitle, nextTheme, options = {}) => {
      if (!electronApi) {
        return;
      }

      if (appearanceTimerRef.current) {
        window.clearTimeout(appearanceTimerRef.current);
      }

      const payload = {
        noteId: note.id,
        title: normalizeTitle(nextTitle),
        theme: normalizeTheme(nextTheme),
      };
      if (Object.hasOwn(options, "titleManuallyEdited")) {
        payload.titleManuallyEdited = Boolean(options.titleManuallyEdited);
      }
      pendingAppearanceRef.current = payload;
      appearanceTimerRef.current = window.setTimeout(() => {
        appearanceTimerRef.current = null;
        pendingAppearanceRef.current = null;
        void electronApi.updateAppearance(payload);
      }, 160);
    },
    [note.id],
  );

  const scheduleSessionAppearanceSave = useCallback((sessionNote, nextTheme) => {
    if (!electronApi || !sessionNote?.id) {
      return;
    }

    if (sessionAppearanceTimerRef.current) {
      window.clearTimeout(sessionAppearanceTimerRef.current);
    }

    const payload = {
      noteId: sessionNote.id,
      title: getNoteDisplayTitle(sessionNote),
      titleManuallyEdited: isTitleManuallyEdited(sessionNote),
      theme: normalizeTheme(nextTheme),
    };
    pendingSessionAppearanceRef.current = payload;
    sessionAppearanceTimerRef.current = window.setTimeout(() => {
      sessionAppearanceTimerRef.current = null;
      pendingSessionAppearanceRef.current = null;
      void electronApi.updateAppearance(payload);
    }, 160);
  }, []);

  const updateTheme = useCallback(
    (nextTheme) => {
      const normalizedTheme = normalizeTheme(nextTheme);
      setTheme(normalizedTheme);
      onNoteChanged({
        ...note,
        title: normalizeTitle(title),
        titleManuallyEdited: isTitleManuallyEdited(note),
        theme: normalizedTheme,
      });
      scheduleAppearanceSave(title, normalizedTheme);
    },
    [note, onNoteChanged, scheduleAppearanceSave, title],
  );

  const updateSessionNoteTheme = useCallback(
    (sessionNoteId, nextTheme) => {
      const targetNote =
        notes.find((sessionNote) => sessionNote.id === sessionNoteId) ??
        (note.id === sessionNoteId ? note : null);

      if (!targetNote) {
        return;
      }

      const normalizedTheme = normalizeTheme(nextTheme);
      const updatedNote = {
        ...targetNote,
        title: getNoteDisplayTitle(
          targetNote,
          targetNote.id === note.id ? editor.document : null,
        ),
        titleManuallyEdited: isTitleManuallyEdited(targetNote),
        theme: normalizedTheme,
      };

      if (targetNote.id === note.id) {
        setTheme(normalizedTheme);
      }

      onNoteChanged(updatedNote);
      scheduleSessionAppearanceSave(updatedNote, normalizedTheme);
    },
    [
      note,
      notes,
      editor,
      onNoteChanged,
      scheduleSessionAppearanceSave,
    ],
  );

  const updateGlobalEditorPreferences = useCallback(
    (nextEditorPreferences) => {
      void onEditorPreferencesChanged?.(normalizeEditorPreferences(
        nextEditorPreferences,
        normalizedEditorPreferences,
      ));
    },
    [normalizedEditorPreferences, onEditorPreferencesChanged],
  );

  // Cmd/Ctrl+=, - and 0 zoom the whole app as Notion does; Electron applies the stored zoom to every
  // window. The gauge also shows at either end, so a press that cannot zoom further still answers.
  const setAppZoom = useCallback(
    (nextAppZoom) => {
      updateGlobalEditorPreferences({
        ...normalizedEditorPreferences,
        appZoom: nextAppZoom,
      });
      showZoomGauge(nextAppZoom);
    },
    [normalizedEditorPreferences, showZoomGauge, updateGlobalEditorPreferences],
  );

  const toggleTableOfContents = useCallback(() => {
    updateGlobalEditorPreferences({
      ...normalizedEditorPreferences,
      showTableOfContents: !showTableOfContents,
    });
  }, [normalizedEditorPreferences, showTableOfContents, updateGlobalEditorPreferences]);

  const adjustAppZoom = useCallback(
    (direction) => {
      setAppZoom(stepAppZoom(normalizedEditorPreferences.appZoom, direction));
    },
    [normalizedEditorPreferences.appZoom, setAppZoom],
  );

  const resetAppZoom = useCallback(() => {
    setAppZoom(DEFAULT_APP_ZOOM);
  }, [setAppZoom]);

  const selectTableOfContentsEntry = useCallback(
    (entry) => {
      const block = findBlockById(editor.document, entry?.id);
      if (!block) {
        return;
      }

      try {
        editor.focus();
        editor.setTextCursorPosition(block, "start");
      } catch {
        try {
          editor.setSelection(block, block);
        } catch {
          // The scroll target is still useful if this block type rejects selection.
        }
      }

      window.requestAnimationFrame(() => {
        scrollEditorBlockIntoView(entry.id);
      });
    },
    [editor],
  );

  const focusEditor = useCallback(() => {
    setIsEditorActive(true);
    window.requestAnimationFrame(() => {
      focusLastEditorBlock(editor);
    });
  }, [editor]);

  useEffect(() => {
    setIsEditorActive(true);
    const animationFrame = window.requestAnimationFrame(() => {
      // A note opened from note search has already focused its find field.
      if (isEditableFormTarget(document.activeElement)) {
        return;
      }
      focusLastEditorBlock(editor);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [editor]);

  const applyDefaultTemplate = useCallback(() => {
    const templateBlocks = JSON.parse(NOTE_PANE_TEMPLATE_BLOCKS_JSON);
    editor.replaceBlocks(editor.document, templateBlocks);
    setIsDefaultTemplateSuggestionVisible(false);
    handleEditorChange();
    focusEditor();
  }, [editor, focusEditor, handleEditorChange]);

  const useTemplateSession = useCallback(async () => {
    if (!note.seedDemoContent) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const blocksJSON = JSON.stringify(editor.document);
    let markdown = "";
    try {
      markdown = await editor.blocksToMarkdownLossy(editor.document);
    } catch {
      markdown = "";
    }

    lastSavedBlocksRef.current = blocksJSON;
    const savedNote = await electronApi?.saveContent({
      noteId: note.id,
      blocksJSON,
      markdown,
    });
    const nextNote = savedNote?.id
      ? savedNote
      : {
          ...note,
          blocksJSON,
          markdown,
          seedDemoContent: false,
          updatedAt: Date.now(),
        };

    setTitle(getNoteDisplayTitle(nextNote, editor.document));
    onNoteChanged(nextNote);
    focusEditor();
  }, [editor, focusEditor, note, onNoteChanged]);

  // A sticky window is too small for Preferences; it opens from the tabs window only.
  const canOpenPreferences = normalizedLayoutMode !== "sticky";

  const openPreferencesPage = useCallback((pageId = "general") => {
    if (!canOpenPreferences) {
      return;
    }
    setPreferencesInitialPage(normalizePreferencePageId(pageId));
    setIsColorPanelOpen(false);
    setIsStickySettingsOpen(false);
    setIsStickyTrashConfirmOpen(false);
    setPendingSessionTrashNote(null);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    setIsPreferencesWindowOpen(true);
  }, [canOpenPreferences]);

  const openPreferences = useCallback(() => {
    openPreferencesPage("general");
  }, [openPreferencesPage]);

  const requestNewSession = useCallback(() => {
    setIsColorPanelOpen(false);
    setIsStickySettingsOpen(false);
    setIsStickyTrashConfirmOpen(false);
    setPendingSessionTrashNote(null);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    setIsPreferencesWindowOpen(false);
    void onCreateNote({ template: "blank" });
  }, [onCreateNote]);

  const openStickySettings = useCallback(() => {
    setIsColorPanelOpen(false);
    setIsPreferencesWindowOpen(false);
    setIsStickyTrashConfirmOpen(false);
    setPendingSessionTrashNote(null);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    setIsStickySettingsOpen(true);
  }, []);

  const toggleLayoutMode = useCallback(() => {
    setIsColorPanelOpen(false);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    setIsPreferencesWindowOpen(false);
    setIsStickySettingsOpen(false);
    setIsStickyTrashConfirmOpen(false);
    setPendingSessionTrashNote(null);
    void onLayoutModeChanged(normalizedLayoutMode === "tabs" ? "sticky" : "tabs");
  }, [normalizedLayoutMode, onLayoutModeChanged]);

  const openSidebar = useCallback(() => {
    setSidebarWidth((currentWidth) =>
      Math.max(currentWidth || SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH),
    );
    setIsSidebarOpen(true);
  }, []);

  const togglePin = useCallback(async () => {
    const nextPinned = !isPinned;
    setIsPinned(nextPinned);
    setIsColorPanelOpen(false);
    onNoteChanged({
      ...note,
      title: normalizeTitle(title),
      titleManuallyEdited: isTitleManuallyEdited(note),
      theme,
      alwaysOnTop: nextPinned,
    });

    try {
      const resolvedPinned = electronApi
        ? await electronApi.setAlwaysOnTop(nextPinned)
        : nextPinned;
      setIsPinned(Boolean(resolvedPinned));
      onNoteChanged({
        ...note,
        title: normalizeTitle(title),
        titleManuallyEdited: isTitleManuallyEdited(note),
        theme,
        alwaysOnTop: Boolean(resolvedPinned),
      });
    } catch (error) {
      setIsPinned(!nextPinned);
      onNoteChanged({
        ...note,
        title: normalizeTitle(title),
        titleManuallyEdited: isTitleManuallyEdited(note),
        theme,
        alwaysOnTop: !nextPinned,
      });
      showExportToast(error.message || "Pin failed.", "error");
    }
  }, [isPinned, note, onNoteChanged, showExportToast, theme, title]);

  const closeCurrentWindow = useCallback(() => {
    setIsStickyActionBarOpen(false);
    void electronApi?.closeCurrentWindow?.();
  }, []);

  const exportNote = useCallback(async (type = "pdf") => {
    setExportFormatMenu(null);
    if (!electronApi) {
      showExportToast("Note export is available in the desktop app.", "error");
      return;
    }

    const isPdf = type === "pdf";
    showExportToast(`Exporting ${isPdf ? "PDF" : "Markdown"}...`, "progress", { timeout: 0 });
    if (isPdf) {
      document.body.classList.add("is-exporting");
    }
    try {
      const render = async () => {
        if (isPdf) {
          await nextAnimationFrame();
          await nextAnimationFrame();
        }
        const markdown = isPdf
          ? undefined
          : await editor.blocksToMarkdownLossy(editor.document);
        return electronApi?.exportNote({
          noteId: note.id,
          title: normalizeTitle(title),
          type,
          markdown,
        });
      };
      const result = isPdf
        ? await withExportTheme(() => withCodeTheme(getExportTheme().codeTheme, render))
        : await render();

      if (result?.canceled) {
        hideExportToast();
        return;
      }

      showExportToast(`${isPdf ? "PDF" : "Markdown"} exported`, "success");
    } catch (error) {
      showExportToast(error.message || `${isPdf ? "PDF" : "Markdown"} export failed.`, "error");
    } finally {
      if (isPdf) {
        document.body.classList.remove("is-exporting");
      }
    }
  }, [editor, hideExportToast, note.id, showExportToast, title]);

  const openExportFormatMenu = useCallback((event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setExportFormatMenu({
      x: Math.round(bounds.right),
      y: Math.round(bounds.top),
    });
  }, []);

  const importMarkdownFile = useCallback(async (file) => {
    if (!file || typeof file.text !== "function") {
      throw new Error("Choose a Markdown file to import.");
    }
    if (!/\.(md|markdown)$/i.test(file.name || "")) {
      throw new Error("Only .md and .markdown files can be imported.");
    }
    if (file.size > MAX_MARKDOWN_IMPORT_FILE_SIZE) {
      throw new Error("This Markdown file is larger than the 512 MB import limit.");
    }

    try {
      const markdown = await file.text();
      // The blocks pasting this Markdown gives. Paste parses BlockNote's HTML of the parsed blocks
      // once more, which drops whitespace BlockNote's Markdown parser keeps: a space at the start of
      // each line after a hard break, and runs of spaces.
      const blocks = editor.tryParseHTMLToBlocks(withSelfRemovingChangeSubscriptions(
        editor,
        () => editor.blocksToFullHTML(
          editor.tryParseMarkdownToBlocks(normalizePastedMarkdownForBlockNote(markdown).markdown),
        ),
      ));
      if (blocks.length === 0) {
        throw new Error("This Markdown file is empty.");
      }
      const cursorBlock = editor.getTextCursorPosition().block;
      const insertedBlocks = editor.insertBlocks(blocks, cursorBlock, "after");
      if (isEmptyParagraphBlock(cursorBlock)) {
        editor.removeBlocks([cursorBlock]);
      }
      const firstInsertedBlock = insertedBlocks?.[0];
      if (firstInsertedBlock) {
        editor.focus();
        try {
          editor.setTextCursorPosition(firstInsertedBlock, "start");
        } catch {
          // Media-only Markdown imports may not expose a text cursor.
        }
      }
      refreshTableOfContents();
      scheduleSave();
      setIsMarkdownImportOpen(false);
      showExportToast(`${file.name || "Markdown file"} imported`, "success");
    } catch (error) {
      throw new Error(error.message || "Markdown import failed.");
    }
  }, [editor, refreshTableOfContents, scheduleSave, showExportToast]);

  const exportDataBackup = useCallback(async () => {
    if (!electronApi?.exportBackup) {
      showExportToast("Data backup is available in the desktop app.", "error");
      return { canceled: true };
    }

    showExportToast("Exporting backup...", "progress", { timeout: 0 });
    try {
      await saveNow();
      const result = await electronApi.exportBackup();
      if (result?.canceled) {
        hideExportToast();
        return result;
      }
      showExportToast("Backup exported", "success");
      return result;
    } catch (error) {
      showExportToast(error.message || "Backup export failed.", "error");
      return { canceled: true, error: true };
    }
  }, [electronApi, hideExportToast, saveNow, showExportToast]);

  const importDataBackup = useCallback(async () => {
    if (!electronApi?.importBackup) {
      showExportToast("Data restore is available in the desktop app.", "error");
      return { canceled: true };
    }

    try {
      await saveNow();
      const result = await electronApi.importBackup();
      if (result?.canceled) {
        return result;
      }
      showExportToast("Backup imported", "success");
      return result;
    } catch (error) {
      showExportToast(error.message || "Backup import failed.", "error");
      return { canceled: true, error: true };
    }
  }, [electronApi, saveNow, showExportToast]);

  useEffect(() => {
    return electronApi?.onOpenPreferences?.(openPreferences);
  }, [openPreferences]);

  useEffect(() => {
    return electronApi?.onCreateNoteRequested?.(requestNewSession);
  }, [requestNewSession]);

  useEffect(() => {
    const handlePreferencesShortcut = (event) => {
      // Left unhandled in a sticky window, where the app menu item is disabled too.
      if (
        !canOpenPreferences ||
        isShortcutRecorderTarget(event.target) ||
        !matchesEnabledKeyboardShortcut(event, "preferences")
      ) {
        return;
      }

      event.preventDefault();
      openPreferences();
    };

    document.addEventListener("keydown", handlePreferencesShortcut, true);
    return () => {
      document.removeEventListener("keydown", handlePreferencesShortcut, true);
    };
  }, [canOpenPreferences, matchesEnabledKeyboardShortcut, openPreferences]);

  // Resolves to the id of the note the window landed on, or null when the
  // switch failed.
  const selectSidebarNote = useCallback(
    async (noteId) => {
      if (noteId === note.id) {
        return noteId;
      }

      await saveNow();
      const landedNote = await onSelectNote(noteId);
      return landedNote?.id ?? null;
    },
    [note.id, onSelectNote, saveNow],
  );

  const notePalette = useNoteSearchPalette({
    editor,
    normalizedLayoutMode,
    note,
    notes,
    onFindRequested,
    onPendingFindHandled,
    openFind,
    pendingFind,
    selectSidebarNote,
  });

  useChromeShortcuts({
    adjustAppZoom,
    openFindInNote,
    openSearchPalette: notePalette.openPalette,
    normalizedLayoutMode,
    exportNote,
    focusEditor,
    matchesEnabledKeyboardShortcut,
    onEditorWidthChange,
    requestNewSession,
    resetAppZoom,
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
  });

  useEffect(() => {
    if (
      !isColorPanelOpen &&
      !isPreferencesWindowOpen &&
      !isStickySettingsOpen &&
       !isStickyTrashConfirmOpen &&
       !isStickyActionBarOpen &&
      !isVersionHistoryOpen &&
       !pendingSessionTrashNote &&
       !pendingSessionCloseNote &&
      !sessionTabMenu &&
      !sessionColorPanelNoteId
      && !exportFormatMenu &&
      !isMarkdownImportOpen
    ) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsColorPanelOpen(false);
        setIsPreferencesWindowOpen(false);
        setIsStickySettingsOpen(false);
        setIsStickyTrashConfirmOpen(false);
        setIsStickyActionBarOpen(false);
        setIsVersionHistoryOpen(false);
        setPendingSessionTrashNote(null);
        setPendingSessionCloseNote(null);
        setSessionTabMenu(null);
        setSessionColorPanelNoteId(null);
        setExportFormatMenu(null);
        setIsMarkdownImportOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [
    isColorPanelOpen,
    isPreferencesWindowOpen,
    isStickySettingsOpen,
    isStickyTrashConfirmOpen,
    isStickyActionBarOpen,
    isVersionHistoryOpen,
    pendingSessionTrashNote,
    pendingSessionCloseNote,
    pendingSessionCloseNote,
    sessionColorPanelNoteId,
    sessionTabMenu,
    exportFormatMenu,
    isMarkdownImportOpen,
  ]);

  useEditorSurfaceShortcuts({
    activeImageBlockId,
    editor,
    isEditorActive,
    recentEditorColors,
    scheduleSave,
    setIsEditorActive,
    setIsTableCellSelectionDismissed,
    updateFocusedTableCell,
  });

  useEffect(() => {
    const handleImageClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (
        target.closest(".image-tools, .bn-formatting-toolbar, .crop-dialog")
      ) {
        return;
      }

      const image = target.closest("img.bn-visual-media");
      if (!image) {
        setActiveImageBlockId(null);
        return;
      }

      const block = findImageBlockForElement(editor.document, image);
      if (!block) {
        return;
      }

      setActiveImageBlockId(block.id);
      try {
        editor.setSelection(block, block);
      } catch {
        // Media selection is best-effort; the toolbar still works from block id.
      }
    };

    // BlockNote's caption and rename fields close on Enter or Escape and leave focus nowhere, so
    // Cmd+Z would do nothing until the user clicked back in. The editor takes focus back with the
    // file block still selected. This runs after the field's own key handler.
    const returnFocusFromFileField = (event) => {
      if (
        (event.key === "Enter" || event.key === "Escape") &&
        !event.isComposing &&
        event.target instanceof Element &&
        event.target.matches("input[name='file-caption'], input[name='file-name']")
      ) {
        editor.focus();
      }
    };

    document.addEventListener("click", handleImageClick, true);
    document.addEventListener("keydown", returnFocusFromFileField);
    return () => {
      document.removeEventListener("click", handleImageClick, true);
      document.removeEventListener("keydown", returnFocusFromFileField);
    };
  }, [editor]);

  const downloadActiveImage = useCallback(async (selectedBlock) => {
    const block = selectedBlock?.id
      ? findBlockById(editor.document, selectedBlock.id) ?? selectedBlock
      : findBlockById(editor.document, activeImageBlockId);
    const url = block?.props?.url;
    if (!url) {
      return;
    }

    const defaultName = block.props.name?.trim() || imageFileName("", url);
    if (electronApi?.saveAsset) {
      await electronApi.saveAsset({
        url,
        defaultName,
        kind: block.type === "image" ? "image" : "file",
      });
      return;
    }

    downloadInBrowser(url, defaultName);
  }, [activeImageBlockId, editor]);

  const copyActiveImage = useCallback(async (selectedBlock) => {
    const url = findBlockById(editor.document, selectedBlock?.id ?? activeImageBlockId)
      ?.props?.url;
    if (!url) {
      return;
    }

    try {
      await copyImageToClipboard(url);
      showExportToast("Image copied", "success");
    } catch (error) {
      showExportToast(error.message || "Image copy failed.", "error");
    }
  }, [activeImageBlockId, editor, showExportToast]);

  const openCropDialog = useCallback(() => {
    const block = findBlockById(editor.document, activeImageBlockId);
    const { url, crop } = getCropSource(block?.props);
    if (!url) {
      return;
    }

    setCropState({
      blockId: block.id,
      sourceUrl: url,
      crop,
    });
  }, [activeImageBlockId, editor]);

  const startHeaderWindowDrag = useCallback(
    (event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (isEditableFormTarget(target) ||
          target.closest("button, a, [role='button'], [role='switch'], [role='tab']"))
      ) {
        return;
      }

      if (
        event.button !== 0 ||
        normalizedLayoutMode !== "sticky" ||
        !electronApi?.moveWindowBy
      ) {
        return;
      }

      let previousScreenX = event.screenX;
      let previousScreenY = event.screenY;

      const moveWindow = (pointerEvent) => {
        const deltaX = pointerEvent.screenX - previousScreenX;
        const deltaY = pointerEvent.screenY - previousScreenY;
        previousScreenX = pointerEvent.screenX;
        previousScreenY = pointerEvent.screenY;

        if (deltaX === 0 && deltaY === 0) {
          return;
        }

        void electronApi.moveWindowBy({ deltaX, deltaY });
      };

      const stopWindowDrag = () => {
        window.removeEventListener("pointermove", moveWindow);
        window.removeEventListener("pointerup", stopWindowDrag);
        window.removeEventListener("pointercancel", stopWindowDrag);
      };

      event.currentTarget.setPointerCapture?.(event.pointerId);
      window.addEventListener("pointermove", moveWindow);
      window.addEventListener("pointerup", stopWindowDrag);
      window.addEventListener("pointercancel", stopWindowDrag);
    },
    [normalizedLayoutMode],
  );

  const applyCrop = useCallback(
    async (croppedDataUrl, crop) => {
      const croppedUrl = await storeDataUrlAsAsset(croppedDataUrl);
      const block = findBlockById(editor.document, cropState?.blockId);
      if (!block) {
        return;
      }

      editor.updateBlock(block, {
        props: {
          url: croppedUrl,
          originalUrl: cropState.sourceUrl,
          croppedUrl,
          cropX: crop.x,
          cropY: crop.y,
          cropWidth: crop.width,
          cropHeight: crop.height,
          name: ensurePngName(block.props.name || "cropped-image.png"),
          showPreview: true,
        },
      });
      setActiveImageBlockId(block.id);
      setCropState(null);
      scheduleSave();
    },
    [cropState, editor, scheduleSave],
  );


  const sessionColorPanelNote = useMemo(
    () =>
      visibleSessionNotes.find(
        (sessionNote) => sessionNote.id === sessionColorPanelNoteId,
      ) ??
      notes.find((sessionNote) => sessionNote.id === sessionColorPanelNoteId) ??
      null,
    [notes, sessionColorPanelNoteId, visibleSessionNotes],
  );

  const sessionTabMenuNote = useMemo(
    () =>
      visibleSessionNotes.find(
        (sessionNote) => sessionNote.id === sessionTabMenu?.noteId,
      ) ??
      notes.find((sessionNote) => sessionNote.id === sessionTabMenu?.noteId) ??
      null,
    [notes, sessionTabMenu, visibleSessionNotes],
  );

  const getSessionDisplayTitle = useCallback(
    (sessionNote) =>
      getNoteDisplayTitle(
        sessionNote,
        sessionNote?.id === note.id ? editor.document : null,
      ),
    [editor, note.id],
  );

  const openSessionTabMenu = useCallback((sessionNote, event) => {
    event.preventDefault();
    setPendingSessionTrashNote(null);
    setSessionColorPanelNoteId(null);
    setIsColorPanelOpen(false);
    setIsStickySettingsOpen(false);
    setIsPreferencesWindowOpen(false);
    setIsStickyTrashConfirmOpen(false);
    setSessionTabMenu({
      noteId: sessionNote.id,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const openSessionColorPanel = useCallback((sessionNoteId) => {
    setSessionTabMenu(null);
    setPendingSessionTrashNote(null);
    setSessionColorPanelNoteId(sessionNoteId);
    setIsColorPanelOpen(false);
    setIsStickySettingsOpen(false);
    setIsPreferencesWindowOpen(false);
    setIsStickyTrashConfirmOpen(false);
  }, []);

  useEffect(() => {
    const visibleIds = visibleSessionNotes.map((sessionNote) => sessionNote.id);

    const newSessionIds = collectNewSessionTabIds(visibleIds);

    if (newSessionIds.length === 0) {
      return undefined;
    }

    setEnteringSessionIds((currentIds) => {
      const nextIds = new Set(currentIds);
      newSessionIds.forEach((id) => nextIds.add(id));
      return nextIds;
    });

    const timerId = window.setTimeout(() => {
      setEnteringSessionIds((currentIds) => {
        const nextIds = new Set(currentIds);
        newSessionIds.forEach((id) => nextIds.delete(id));
        return nextIds;
      });
    }, SESSION_TAB_ENTER_MS);

    return () => window.clearTimeout(timerId);
  }, [visibleSessionNotes]);

  const startSessionRename = useCallback((sessionNote) => {
    setEditingSessionId(sessionNote.id);
    setDraftSessionTitle(getSessionDisplayTitle(sessionNote));
    setIsDraftSessionTitleDirty(false);
  }, [getSessionDisplayTitle]);

  // A double click on another tab switches to it with its first click, and the switch remounts this
  // component before, during or after the second click. A rename asked for before the remount
  // waits in App (pendingRenameNoteId) and starts here once this window shows that note.
  const requestSessionRename = useCallback((sessionNote) => {
    if (sessionNote.id === note.id) {
      startSessionRename(sessionNote);
      return;
    }
    onRenameRequested(sessionNote.id);
  }, [note.id, onRenameRequested, startSessionRename]);

  useEffect(() => {
    if (pendingRenameNoteId !== note.id) {
      return;
    }
    onPendingRenameHandled();
    startSessionRename(note);
  }, [note, onPendingRenameHandled, pendingRenameNoteId, startSessionRename]);

  // A switch that fails must not leave a rename waiting for a later visit.
  const selectSessionTab = useCallback(async (noteId) => {
    if ((await selectSidebarNote(noteId)) !== noteId) {
      onPendingRenameHandled();
    }
  }, [onPendingRenameHandled, selectSidebarNote]);

  const cancelSessionRename = useCallback(() => {
    setEditingSessionId(null);
    setDraftSessionTitle("");
    setIsDraftSessionTitleDirty(false);
  }, []);

  const commitSessionRename = useCallback(
    async (sessionNote) => {
      setEditingSessionId(null);
      setDraftSessionTitle("");
      setIsDraftSessionTitleDirty(false);

      if (!isDraftSessionTitleDirty) {
        return;
      }

      const normalizedTitle = normalizeTitle(
        draftSessionTitle,
        getSessionDisplayTitle(sessionNote),
      );

      const updatedNote = {
        ...sessionNote,
        title: normalizedTitle,
        titleManuallyEdited: true,
      };

      if (sessionNote.id === note.id) {
        setTitle(normalizedTitle);
        onNoteChanged({
          ...note,
          title: normalizedTitle,
          titleManuallyEdited: true,
          theme,
        });
        scheduleAppearanceSave(normalizedTitle, theme, {
          titleManuallyEdited: true,
        });
        return;
      }

      onNoteChanged(updatedNote);
      await electronApi?.updateAppearance({
        noteId: sessionNote.id,
        title: normalizedTitle,
        titleManuallyEdited: true,
        theme: normalizeTheme(sessionNote.theme),
      });
    },
    [
      draftSessionTitle,
      getSessionDisplayTitle,
      isDraftSessionTitleDirty,
      note,
      onNoteChanged,
      scheduleAppearanceSave,
      theme,
    ],
  );

  const requestDeleteSessionNote = useCallback(
    (sessionNote) => {
      if (removingSessionIds.has(sessionNote.id)) {
        return;
      }

      setEditingSessionId(null);
      setDraftSessionTitle("");
      setIsDraftSessionTitleDirty(false);
      setIsColorPanelOpen(false);
      setIsPreferencesWindowOpen(false);
      setIsStickySettingsOpen(false);
      setIsStickyTrashConfirmOpen(false);
      setSessionTabMenu(null);
      setSessionColorPanelNoteId(null);
      setPendingSessionTrashNote(sessionNote);
    },
    [removingSessionIds],
  );

  const deleteSessionNote = useCallback(
    async (sessionNote, options = {}) => {
      if (removingSessionIds.has(sessionNote.id)) {
        return;
      }

      setEditingSessionId(null);
      setDraftSessionTitle("");
      setIsDraftSessionTitleDirty(false);
      setRemovingSessionIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(sessionNote.id);
        return nextIds;
      });

      try {
        await delay(SESSION_TAB_EXIT_MS);
        await saveNow();
        const deletedSnapshot =
          sessionNote.id === note.id ? getCurrentNoteSnapshot() : sessionNote;
        const deletedTitle = getNoteDisplayTitle(
          deletedSnapshot,
          sessionNote.id === note.id ? editor.document : null,
        );
        const result = await onDeleteNote(
          sessionNote.id,
          deletedSnapshot,
        );
        if (result?.deleted === false) {
          showExportToast("Could not move session to Trash.", "error");
          return;
        }

        onSessionMovedToTrash?.({
          noteId: sessionNote.id,
          title: deletedTitle,
          source: options.source ?? "trash",
        });
      } finally {
        setRemovingSessionIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(sessionNote.id);
          return nextIds;
        });
      }
    },
    [
      editor.document,
      getCurrentNoteSnapshot,
      note.id,
      onDeleteNote,
      removingSessionIds,
      saveNow,
      showExportToast,
      onSessionMovedToTrash,
    ],
  );

  const hasSessionContent = useCallback(
    (sessionNote) => {
      if (sessionNote.id === note.id) {
        return !isEmptySessionDocument(editor.document);
      }

      if (sessionNote.seedDemoContent || Boolean(sessionNote.markdown?.trim())) {
        return true;
      }

      return !isEmptySessionDocument(parseBlocksJSON(sessionNote.blocksJSON) ?? EMPTY_BLOCKS);
    },
    [editor.document, note.id],
  );

  const requestCloseCurrentTab = useCallback(() => {
    if (normalizedLayoutMode !== "tabs") {
      closeCurrentWindow();
      return;
    }

    const currentSessionNote = visibleSessionNotes.find(
      (sessionNote) => sessionNote.id === note.id,
    );
    if (!currentSessionNote || removingSessionIds.has(currentSessionNote.id)) {
      return;
    }

    if (hasSessionContent(currentSessionNote)) {
      setPendingSessionCloseNote(currentSessionNote);
      return;
    }

    void deleteSessionNote(currentSessionNote, { source: "close" });
  }, [
    closeCurrentWindow,
    deleteSessionNote,
    normalizedLayoutMode,
    hasSessionContent,
    note.id,
    removingSessionIds,
    visibleSessionNotes,
  ]);

  const confirmCloseCurrentTab = useCallback(async () => {
    const sessionNote = pendingSessionCloseNote;
    if (!sessionNote) {
      return;
    }

    setPendingSessionCloseNote(null);
    await deleteSessionNote(sessionNote, { source: "close" });
  }, [deleteSessionNote, pendingSessionCloseNote]);

  useEffect(() => {
    return electronApi?.onCloseTabRequested?.(requestCloseCurrentTab);
  }, [requestCloseCurrentTab]);

  useEffect(() => {
    if (!pendingSessionCloseNote) {
      return;
    }

    if (!visibleSessionNotes.some((sessionNote) => sessionNote.id === pendingSessionCloseNote.id)) {
      setPendingSessionCloseNote(null);
    }
  }, [pendingSessionCloseNote, visibleSessionNotes]);

  useEffect(() => {
    const handleCloseShortcut = (event) => {
      if (
        !matchesEnabledKeyboardShortcut(event, "closeWindow") ||
        isShortcutRecorderTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      requestCloseCurrentTab();
    };

    document.addEventListener("keydown", handleCloseShortcut, true);
    return () => document.removeEventListener("keydown", handleCloseShortcut, true);
  }, [matchesEnabledKeyboardShortcut, requestCloseCurrentTab]);

  const confirmDeleteSessionNote = useCallback(async () => {
    const sessionNote = pendingSessionTrashNote;
    if (!sessionNote) {
      return;
    }

    setPendingSessionTrashNote(null);
    await deleteSessionNote(sessionNote);
  }, [deleteSessionNote, pendingSessionTrashNote]);

  const getSessionTabRowClassName = useCallback(
    (sessionNote) =>
      [
        "session-tab-row",
        sessionNote.id === note.id ? "active" : "",
        enteringSessionIds.has(sessionNote.id) ? "is-entering" : "",
        removingSessionIds.has(sessionNote.id) ? "is-leaving" : "",
        draggingSessionNoteId === sessionNote.id ? "is-dragging" : "",
      ]
        .filter(Boolean)
        .join(" "),
    [draggingSessionNoteId, enteringSessionIds, note.id, removingSessionIds],
  );

  const setSessionTabRowRef = useCallback((noteId, element) => {
    if (element) {
      sessionTabRowsRef.current.set(noteId, element);
      return;
    }

    sessionTabRowsRef.current.delete(noteId);
  }, []);

  const captureSessionTabRects = useCallback(() => {
    previousSessionTabRectsRef.current = getSessionTabRects(sessionTabRowsRef.current);
  }, []);

  const reorderSessionNotes = useCallback(
    async (orderedNoteIds, options = {}) => {
      if (normalizedLayoutMode !== "tabs") {
        return null;
      }

      const normalizedOrderedNoteIds = normalizeOrderedNoteIds(orderedNoteIds);
      if (normalizedOrderedNoteIds.length === 0) {
        return null;
      }

      captureSessionTabRects();
      return await onReorderNotes?.(normalizedOrderedNoteIds, options);
    },
    [captureSessionTabRects, normalizedLayoutMode, onReorderNotes],
  );

  const moveCurrentSessionNote = useCallback(
    async (direction) => {
      if (normalizedLayoutMode !== "tabs" || visibleSessionNoteIds.length <= 1) {
        return;
      }

      const currentIndex = visibleSessionNoteIds.indexOf(note.id);
      if (currentIndex < 0) {
        return;
      }

      const nextIndex = clamp(
        currentIndex + direction,
        0,
        visibleSessionNoteIds.length - 1,
        currentIndex,
      );
      if (nextIndex === currentIndex) {
        return;
      }

      await reorderSessionNotes(
        moveArrayItem(visibleSessionNoteIds, currentIndex, nextIndex),
        { persist: true },
      );
    },
    [
      normalizedLayoutMode,
      note.id,
      reorderSessionNotes,
      visibleSessionNoteIds,
    ],
  );

  useLayoutEffect(() => {
    const previousRects = previousSessionTabRectsRef.current;
    if (!previousRects) {
      return;
    }

    previousSessionTabRectsRef.current = null;
    animateSessionTabReorder(sessionTabRowsRef.current, previousRects);
  }, [visibleSessionNoteIds]);

  const selectRelativeSessionNote = useCallback(
    async (direction) => {
      if (normalizedLayoutMode !== "tabs" || visibleSessionNotes.length <= 1) {
        return;
      }

      const currentIndex = visibleSessionNotes.findIndex(
        (sessionNote) => sessionNote.id === note.id,
      );
      if (currentIndex < 0) {
        return;
      }

      const nextIndex =
        (currentIndex + direction + visibleSessionNotes.length) %
        visibleSessionNotes.length;
      const nextSessionNote = visibleSessionNotes[nextIndex];
      if (!nextSessionNote || nextSessionNote.id === note.id) {
        return;
      }

      await selectSidebarNote(nextSessionNote.id);
    },
    [normalizedLayoutMode, note.id, selectSidebarNote, visibleSessionNotes],
  );

  const requestMoveCurrentStickyNoteToTrash = useCallback(() => {
    if (notes.length <= 1) {
      showExportToast("At least one session must remain.", "error");
      return;
    }

    setIsColorPanelOpen(false);
    setIsPreferencesWindowOpen(false);
    setIsStickySettingsOpen(false);
    setPendingSessionTrashNote(null);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    setIsStickyTrashConfirmOpen(true);
  }, [notes.length, showExportToast]);

  const moveCurrentStickyNoteToTrash = useCallback(async () => {
    if (notes.length <= 1) {
      showExportToast("At least one session must remain.", "error");
      return;
    }

    setIsStickyTrashConfirmOpen(false);
    setIsColorPanelOpen(false);
    setIsPreferencesWindowOpen(false);
    setIsStickySettingsOpen(false);
    setPendingSessionTrashNote(null);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    await saveNow();
    await onDeleteNote(note.id, getCurrentNoteSnapshot());
  }, [
    getCurrentNoteSnapshot,
    note.id,
    notes.length,
    onDeleteNote,
    saveNow,
    showExportToast,
  ]);

  useSessionNumberShortcuts({
    keyboardShortcutEnabled,
    note,
    selectSidebarNote,
    visibleSessionNotes,
  });

  useTabModeShortcuts({
    normalizedLayoutMode,
    matchesEnabledKeyboardShortcut,
    moveCurrentSessionNote,
    selectRelativeSessionNote,
    visibleSessionNotes,
  });

  const {
    dropSessionTab,
    endSessionTabDrag,
    handleSessionTabDragOver,
    handleSessionTabsDragOver,
    previewSessionTabReorder,
    startSessionTabDrag,
  } = useSessionTabDrag({
    draggingSessionNoteId,
    normalizedLayoutMode,
    reorderSessionNotes,
    sessionTabRowsRef,
    setDraggingSessionNoteId,
    visibleSessionNoteIds,
  });

  const startSidebarResize = useCallback(
    (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = isSidebarOpen ? sidebarWidth : SIDEBAR_COMPACT_WIDTH;

      const resize = (pointerEvent) => {
        const nextWidth = startWidth + pointerEvent.clientX - startX;
        if (nextWidth <= SIDEBAR_COLLAPSE_WIDTH) {
          setIsSidebarOpen(false);
          return;
        }

        setSidebarWidth(clamp(nextWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH));
        setIsSidebarOpen(true);
      };

      const stopResize = () => {
        window.removeEventListener("pointermove", resize);
        window.removeEventListener("pointerup", stopResize);
        window.removeEventListener("pointercancel", stopResize);
      };

      window.addEventListener("pointermove", resize);
      window.addEventListener("pointerup", stopResize);
      window.addEventListener("pointercancel", stopResize);
    },
    [isSidebarOpen, sidebarWidth],
  );

  usePendingSaveFlush({
    appearanceTimerRef,
    isEditorDirtyRef,
    pendingAppearanceRef,
    pendingSessionAppearanceRef,
    saveNow,
    saveRetryTimerRef,
    saveTimerRef,
    sessionAppearanceTimerRef,
  });

  return (
    <main
      className={`sticky-shell layout-${normalizedLayoutMode} sidebar-${sidebarState}`}
      style={shellStyle}
      data-testid="sticky-shell"
      data-theme-mode={activeTheme.scheme}
      data-layout-mode={normalizedLayoutMode}
    >
      {shouldRenderChromeHeader && (
        <header
          className="sticky-header"
          data-testid="sticky-header"
          data-window-drag-handle={normalizedLayoutMode === "sticky" ? "true" : undefined}
          onPointerDown={startHeaderWindowDrag}
        >
        <div className="sticky-drag-strip" aria-hidden="true" />
        <div
          className={`sticky-header-actions${
            isStickyActionBarOpen ? " is-open" : ""
          }`}
          aria-label="Sticky controls"
        >
          {normalizedLayoutMode === "sticky" && (
            <>
              <div className="sticky-header-action-list">
                <StickyPinButton
                  isPinned={isPinned}
                  shortcut={getEnabledShortcut("toggleAlwaysOnTop")}
                  onClick={() => void togglePin()}
                />
                <ExportPdfButton
                  shortcut={getEnabledShortcut("exportPdf")}
                  onClick={openExportFormatMenu}
                />
                <button
                  type="button"
                  className="preferences-icon-button sticky-history-button has-tooltip"
                  aria-label="Version history"
                  data-tooltip="Version history"
                  onMouseDown={preventFocusLoss}
                  onClick={() => void openVersionHistory()}
                >
                  <History
                    className="notepane-action-icon notepane-icon-history"
                    data-icon-family="system-symbol"
                    data-icon-pack="lucide"
                    data-icon-tone="restore"
                    size={24}
                    strokeWidth={1.9}
                    aria-hidden="true"
                  />
                </button>
                <LayoutModeSwitch
                  mode={normalizedLayoutMode}
                  compact
                  shortcut={getEnabledShortcut("toggleLayoutMode")}
                  onChange={toggleLayoutMode}
                />
                <EditorWidthSwitch
                  wide={isEditorWide}
                  shortcut={getEnabledShortcut("toggleEditorWidth")}
                  onChange={() => onEditorWidthChange?.((value) => !value)}
                />
                <StickySettingsButton
                  active={isStickySettingsOpen}
                  onClick={openStickySettings}
                />
                <StickyTrashButton
                  onClick={requestMoveCurrentStickyNoteToTrash}
                />
              </div>
              <button
                type="button"
                className="sticky-header-action-preview has-tooltip"
                aria-label={
                  isStickyActionBarOpen
                    ? "Close window"
                    : "Show sticky actions"
                }
                aria-expanded={isStickyActionBarOpen}
                data-tooltip={
                  isStickyActionBarOpen
                    ? formatShortcutTooltip(
                        "Close window",
                        getEnabledShortcut("closeWindow"),
                      )
                    : "Show sticky actions"
                }
                onMouseDown={preventFocusLoss}
                onClick={(event) => {
                  if (isStickyActionBarOpen) {
                    // The first click of a double click opened the actions and turned this button
                    // into Close under the pointer; only a click of its own closes the window.
                    if (event.detail > 1) {
                      return;
                    }
                    closeCurrentWindow();
                    return;
                  }
                  setIsStickyActionBarOpen(true);
                }}
              >
                {isStickyActionBarOpen ? (
                  <X className="notepane-action-icon" data-icon-tone="delete" />
                ) : (
                  <EllipsisIcon />
                )}
              </button>
            </>
          )}
        </div>
        </header>
      )}
      <div className="sticky-body">
        {normalizedLayoutMode === "tabs" && (
          <aside
            className={`session-sidebar ${isSidebarCompact ? "is-compact" : ""}`}
            data-testid="session-sidebar"
            data-sidebar-state={sidebarState}
            style={sidebarStyle}
          >
            <div className="session-sidebar-topbar">
              <NotePaneWordmark />
              <button
                type="button"
                className="sidebar-toggle has-tooltip"
                aria-label={isSidebarCompact ? "Show sidebar" : "Hide sidebar"}
                data-tooltip={formatShortcutTooltip(
                  isSidebarCompact ? "Show sidebar" : "Hide sidebar",
                  getEnabledShortcut("toggleSidebar"),
                )}
                onMouseDown={preventFocusLoss}
                onClick={() => {
                  if (isSidebarCompact) {
                    openSidebar();
                    return;
                  }
                  setIsSidebarOpen(false);
                }}
              >
                <SidebarToggleIcon expanded={!isSidebarCompact} />
              </button>
            </div>
            <div className="session-sidebar-content" data-testid="session-sidebar-scroll">
              <div
                className="session-tabs"
                role="tablist"
                aria-label="Note sessions"
                onDragOver={handleSessionTabsDragOver}
                onDrop={(event) => void dropSessionTab(event)}
              >
                {visibleSessionNotes.map((sessionNote, index) =>
                  editingSessionId === sessionNote.id ? (
                    <div
                      key={sessionNote.id}
                      ref={(element) => setSessionTabRowRef(sessionNote.id, element)}
                      className={getSessionTabRowClassName(sessionNote)}
                      data-note-id={sessionNote.id}
                      style={getSessionTabStyle(
                        sessionNote.theme,
                        activeTheme,
                        noteIndexById.get(sessionNote.id) ?? index,
                      )}
                    >
                      <div
                        role="tab"
                        aria-selected={sessionNote.id === note.id}
                        className="session-tab-edit"
                      >
                        <span className="session-dot">{index + 1}</span>
                        <input
                          aria-label="Session name"
                          value={draftSessionTitle}
                          autoFocus
                          spellCheck={false}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) => {
                            setDraftSessionTitle(event.target.value);
                            setIsDraftSessionTitleDirty(true);
                          }}
                          onBlur={() => void commitSessionRename(sessionNote)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void commitSessionRename(sessionNote);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelSessionRename();
                            }
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div
                      key={sessionNote.id}
                      ref={(element) => setSessionTabRowRef(sessionNote.id, element)}
                      className={getSessionTabRowClassName(sessionNote)}
                      data-note-id={sessionNote.id}
                      style={getSessionTabStyle(
                        sessionNote.theme,
                        activeTheme,
                        noteIndexById.get(sessionNote.id) ?? index,
                      )}
                      draggable={normalizedLayoutMode === "tabs"}
                      aria-grabbed={
                        draggingSessionNoteId === sessionNote.id ? "true" : undefined
                      }
                      onContextMenu={(event) =>
                        openSessionTabMenu(sessionNote, event)
                      }
                      onDragStart={(event) => startSessionTabDrag(sessionNote, event)}
                      onDragOver={(event) => handleSessionTabDragOver(sessionNote, event)}
                      onDrop={(event) => void dropSessionTab(event)}
                      onDragEnd={(event) => void endSessionTabDrag(event)}
                    >
                      {isSidebarCompact ? (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={sessionNote.id === note.id}
                          className="session-tab-button has-tooltip"
                          data-tooltip={formatShortcutTooltip(
                            `Open ${getSessionDisplayTitle(sessionNote)}`,
                            isKeyboardShortcutEnabled(
                              keyboardShortcutEnabled,
                              "selectTabByNumber",
                            )
                              ? `Mod+${index + 1}`
                              : "",
                          )}
                          onMouseDown={(event) => {
                            if (event.button === 0 && event.detail > 1 && sessionNote.id !== note.id) {
                              requestSessionRename(sessionNote);
                            }
                          }}
                          onClick={() => void selectSessionTab(sessionNote.id)}
                          onDoubleClick={(event) => {
                            event.preventDefault();
                            requestSessionRename(sessionNote);
                          }}
                        >
                          <span className="session-dot">{index + 1}</span>
                          <span className="session-name">
                            {getSessionDisplayTitle(sessionNote)}
                          </span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="session-index-button session-delete-button has-tooltip"
                            aria-label={`Delete session ${getSessionDisplayTitle(sessionNote)}`}
                            disabled={removingSessionIds.has(sessionNote.id)}
                            data-tooltip={
                              sessionNote.id === note.id
                                ? "Move current session to Trash"
                                : "Move session to Trash"
                            }
                            onMouseDown={(event) => {
                              preventFocusLoss(event);
                              event.stopPropagation();
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              requestDeleteSessionNote(sessionNote);
                            }}
                          >
                            <span className="session-index-label">{index + 1}</span>
                            <span className="session-index-delete" aria-hidden="true">
                              <X
                                className="session-index-delete-icon"
                                size={14}
                                strokeWidth={2.25}
                              />
                            </span>
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={sessionNote.id === note.id}
                            className="session-tab-button has-tooltip"
                            data-tooltip={formatShortcutTooltip(
                              `Open ${getSessionDisplayTitle(sessionNote)}`,
                              isKeyboardShortcutEnabled(
                                keyboardShortcutEnabled,
                                "selectTabByNumber",
                              )
                                ? `Mod+${index + 1}`
                                : "",
                            )}
                            onMouseDown={(event) => {
                              if (event.button === 0 && event.detail > 1 && sessionNote.id !== note.id) {
                                requestSessionRename(sessionNote);
                              }
                            }}
                            onClick={() => void selectSessionTab(sessionNote.id)}
                            onDoubleClick={(event) => {
                              event.preventDefault();
                              requestSessionRename(sessionNote);
                            }}
                          >
                            <span className="session-name">
                              {getSessionDisplayTitle(sessionNote)}
                            </span>
                          </button>
                          <span className="session-tab-trailing">
                            {index < 9 && (
                              <span
                                className="session-shortcut"
                                aria-label={`Shortcut ${getSessionShortcutLabel(index)}`}
                              >
                                {isKeyboardShortcutEnabled(
                                  keyboardShortcutEnabled,
                                  "selectTabByNumber",
                                )
                                  ? getSessionShortcutLabel(index)
                                  : ""}
                              </span>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  ),
                )}
              </div>
              <button
                type="button"
                className="session-add-button has-tooltip"
                aria-label="New session"
                data-tooltip={formatShortcutTooltip(
                  "New session",
                  getEnabledShortcut("newSession"),
                )}
                onMouseDown={preventFocusLoss}
                onClick={requestNewSession}
              >
                <Plus
                  className="session-add-icon"
                  aria-hidden="true"
                  size={14}
                  strokeWidth={2.4}
                />
                <span>New session</span>
              </button>
            </div>
            <div
              className="session-sidebar-footer"
              data-testid="session-sidebar-footer"
              aria-label="Session sidebar controls"
            >
              <div className="session-sidebar-footer-row">
                <button
                  type="button"
                  className="preferences-icon-button has-tooltip"
                  aria-label="Version history"
                  data-tooltip="Version history"
                  onMouseDown={preventFocusLoss}
                  onClick={() => void openVersionHistory()}
                >
                  <History aria-hidden="true" size={17} strokeWidth={2} />
                </button>
                <ExportPdfButton
                  shortcut={getEnabledShortcut("exportPdf")}
                  onClick={openExportFormatMenu}
                />
                <PreferencesButton
                  shortcut={getEnabledShortcut("preferences")}
                  onClick={openPreferences}
                />
                <LayoutModeSwitch
                  mode={normalizedLayoutMode}
                  compact={isSidebarCompact}
                  shortcut={getEnabledShortcut("toggleLayoutMode")}
                  onChange={toggleLayoutMode}
                />
                <EditorWidthSwitch
                  wide={isEditorWide}
                  shortcut={getEnabledShortcut("toggleEditorWidth")}
                  onChange={() => onEditorWidthChange?.((value) => !value)}
                />
              </div>
            </div>
            <div
              className="sidebar-resize-handle"
              role="separator"
              aria-label="Resize sidebar"
              aria-orientation="vertical"
              onPointerDown={startSidebarResize}
            />
          </aside>
        )}
        <section
          ref={editorSurfaceRef}
          className={[
            "sticky-editor-surface",
            isTableOfContentsVisible ? "has-table-of-contents" : "",
            isEditorWide ? "is-editor-wide" : "is-editor-reading-width",
            note.seedDemoContent ? "is-template-session" : "",
            isMultiTableCellSelection ? "has-multi-table-cell-selection" : "",
          ].filter(Boolean).join(" ")}
          data-testid="sticky-editor-surface"
          data-editor-active={isEditorActive ? "true" : "false"}
          data-toc-visible={isTableOfContentsVisible ? "true" : "false"}
          data-editor-width={isEditorWide ? "wide" : "reading"}
          onFocusCapture={() => {
            setIsEditorActive(true);
            setIsTableCellSelectionDismissed(false);
          }}
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget;
            if (
              !(nextTarget instanceof Element) ||
              (!event.currentTarget.contains(nextTarget) &&
                !nextTarget.closest(".editor-floating-menu"))
            ) {
              setIsEditorActive(false);
            }
          }}
          onPointerDownCapture={(event) => {
            setIsEditorActive(true);
            setIsTableCellSelectionDismissed(false);
            suppressFocusedTableCellRef.current = isBlankTableSurfacePointer(event);
            if (suppressFocusedTableCellRef.current) {
              event.preventDefault();
              const view = editor.prosemirrorView;
              if (view && !view.isDestroyed) {
                view.setProps({ decorations: () => DecorationSet.empty });
              }
            }
          }}
          onPointerUpCapture={(event) => {
            if (!suppressFocusedTableCellRef.current) {
              const view = editor.prosemirrorView;
              if (view && !view.isDestroyed && focusedTableDecorationsRef.current) {
                view.setProps({ decorations: focusedTableDecorationsRef.current });
              }
              window.requestAnimationFrame(() => updateFocusedTableCell(event.target));
            }
          }}
          onClickCapture={(event) => {
            if (!suppressFocusedTableCellRef.current) {
              window.requestAnimationFrame(() => updateFocusedTableCell(event.target));
            }
          }}
        >
          {findInNote.isOpen && (
            <div className="find-bar-dock">
              <FindBar
                query={findInNote.query}
                current={findInNote.current}
                total={findInNote.total}
                focusRequest={findInNote.focusRequest}
                isFindShortcut={(event) => matchesEnabledKeyboardShortcut(event, "findInNote")}
                onQueryChange={findInNote.updateQuery}
                onStep={findInNote.step}
                onClose={findInNote.closeFind}
              />
            </div>
          )}
          {zoomGauge !== null && (
            <div className="app-zoom-gauge-dock">
              <AppZoomGauge zoom={zoomGauge} />
            </div>
          )}
          {isTableOfContentsVisible && (
            <TableOfContentsRail
              entries={tableOfContentsEntries}
              activeEntryIds={activeTableOfContentsEntryIds}
              onSelectEntry={selectTableOfContentsEntry}
            />
          )}
          {note.seedDemoContent && (
            <button
              type="button"
              className="template-use-button"
              aria-label="Use this template"
              onMouseDown={preventFocusLoss}
              onClick={() => void useTemplateSession()}
            >
              <Check className="template-use-icon" aria-hidden="true" />
              <span>Use this template</span>
            </button>
          )}
          {isDefaultTemplateSuggestionVisible && (
            <div className="default-template-suggestion" role="status">
              <span>Start with the default template?</span>
              <button
                type="button"
                onMouseDown={preventFocusLoss}
                onClick={applyDefaultTemplate}
              >
                <Plus className="default-template-suggestion-icon" aria-hidden="true" />
                Add default template
              </button>
            </div>
          )}
          <BlockNoteView
            editor={editor}
            theme={activeTheme.scheme}
            onChange={handleEditorChange}
            onSelectionChange={() => {
              window.requestAnimationFrame(() => {
                updateFocusedTableCell();
                updateTableCellSelectionMode();
              });
            }}
            portalElements={{ default: document.body }}
            formattingToolbar={false}
            sideMenu={false}
            slashMenu={false}
          >
            <NotePaneSlashMenuController
              editor={editor}
              onImportMarkdown={() => setIsMarkdownImportOpen(true)}
            />
            <RecentColorFormattingToolbarController
              recentColors={recentEditorColors}
              onColorUsed={onEditorColorUsed}
              onCropImage={openCropDialog}
              onDownloadImage={downloadActiveImage}
              onCopyImage={canCopyImageToClipboard() ? copyActiveImage : undefined}
              activeImageBlockId={activeImageBlockId}
              portalElement={document.body}
              hidden={isTableCellSelectionDismissed}
            />
            <BlockMenuHighlightController />
            <NotePaneSideMenuController
              recentColors={recentEditorColors}
              onColorUsed={onEditorColorUsed}
            />
          </BlockNoteView>
          {codeBlockToolTargets.map(({ blockId, element }) => (
            <CodeBlockTools
              key={`code-block-tools-${blockId}`}
              editor={editor}
              blockId={blockId}
              targetElement={element}
            />
          ))}
        </section>
      </div>
      {isVersionHistoryOpen && (
        <VersionHistoryPanel
          versions={noteVersions}
          isBusy={isVersionBusy}
          scheme={activeTheme.scheme}
          onClose={() => setIsVersionHistoryOpen(false)}
          onRestore={(version) => void restoreVersion(version)}
        />
      )}
      {layoutTransition && (
        <LayoutTransitionOverlay transition={layoutTransition} />
      )}
      {sessionTabMenu && sessionTabMenuNote && (
        <SessionTabContextMenu
          x={sessionTabMenu.x}
          y={sessionTabMenu.y}
          sessionNote={sessionTabMenuNote}
          activeTheme={activeTheme}
          onOpenColor={() => openSessionColorPanel(sessionTabMenuNote.id)}
        />
      )}
      {exportFormatMenu && (
        <ExportFormatMenu
          x={exportFormatMenu.x}
          y={exportFormatMenu.y}
          onExport={(type) => void exportNote(type)}
        />
      )}
      {isMarkdownImportOpen && (
        <MarkdownImportDialog
          onClose={() => setIsMarkdownImportOpen(false)}
          onImport={importMarkdownFile}
        />
      )}
      {isColorPanelOpen && (
        <ColorPanel
          theme={theme}
          activeTheme={activeTheme}
          variant="sticky"
          defaultColor={
            normalizedLayoutMode === "sticky" ? stickyAccentColor : undefined
          }
          onChange={updateTheme}
          onClose={() => setIsColorPanelOpen(false)}
        />
      )}
      {sessionColorPanelNote && (
        <ColorPanel
          theme={normalizeTheme(sessionColorPanelNote.theme)}
          activeTheme={activeTheme}
          variant="tabs"
          defaultColor={resolveSessionTabAccentColor(
            sessionColorPanelNote.theme,
            resolveStickyAccentColor(
              sessionColorPanelNote.theme,
              noteIndexById.get(sessionColorPanelNote.id) ?? 0,
            ),
          )}
          onChange={(nextTheme) =>
            updateSessionNoteTheme(sessionColorPanelNote.id, nextTheme)
          }
          onClose={() => setSessionColorPanelNoteId(null)}
        />
      )}
      {pendingSessionTrashNote && (
        <SessionTrashConfirmDialog
          noteTitle={getSessionDisplayTitle(pendingSessionTrashNote)}
          onCancel={() => setPendingSessionTrashNote(null)}
          onConfirm={() => void confirmDeleteSessionNote()}
        />
      )}
      {pendingSessionCloseNote && (
        <SessionCloseConfirmDialog
          noteTitle={getSessionDisplayTitle(pendingSessionCloseNote)}
          onCancel={() => setPendingSessionCloseNote(null)}
          onConfirm={() => void confirmCloseCurrentTab()}
        />
      )}
      {isStickySettingsOpen && (
        <StickySettingsWindow
          noteTitle={title}
          theme={theme}
          activeTheme={activeTheme}
          defaultColor={stickyAccentColor}
          onThemeChange={updateTheme}
          onClose={() => setIsStickySettingsOpen(false)}
        />
      )}
      {isStickyTrashConfirmOpen && (
        <StickyTrashConfirmDialog
          noteTitle={title}
          onCancel={() => setIsStickyTrashConfirmOpen(false)}
          onConfirm={() => void moveCurrentStickyNoteToTrash()}
        />
      )}
      {isPreferencesWindowOpen && (
        <PreferencesWindow
          initialPage={preferencesInitialPage}
          appThemeId={activeTheme.id}
          editorPreferences={editorPreferences}
          keyboardShortcuts={keyboardShortcuts}
          appFontOptions={appFontOptions}
          fontOptions={editorFontOptions}
          trashedNotes={trashedNotes}
          onAppThemeChange={onAppThemeChanged}
          onEditorPreferencesChange={updateGlobalEditorPreferences}
          onExportBackup={exportDataBackup}
          onImportBackup={importDataBackup}
          onRestoreTrashedNote={onRestoreTrashedNote}
          onPurgeTrashedNote={onPurgeTrashedNote}
          onClose={() => setIsPreferencesWindowOpen(false)}
        />
      )}
      {exportToast && <StickyToast toast={exportToast} />}
      {notePalette.query !== null && (
        <SearchPalette
          query={notePalette.query}
          results={notePalette.results}
          activeTheme={activeTheme}
          noteIndexById={notePalette.noteIndexById}
          onQueryChange={notePalette.setQuery}
          onChoose={(result) => void notePalette.chooseResult(result)}
          onClose={notePalette.closePalette}
        />
      )}
      <AdaptiveTooltipPortal />
      {cropState && (
        <CropDialog
          sourceUrl={cropState.sourceUrl}
          initialCrop={cropState.crop}
          onApply={applyCrop}
          onClose={() => setCropState(null)}
        />
      )}
    </main>
  );
}

function renderApp(bindTestThemeSetter = null) {
  // Before React mounts, so the first frame already has the window's theme and the first code
  // block is highlighted with its code theme.
  const initialTheme = getTheme(readInitialThemeId());
  applyThemeToDocument(initialTheme);
  setActiveCodeTheme(initialTheme.codeTheme);
  createRoot(document.getElementById("root")).render(
    <App bindTestThemeSetter={bindTestThemeSetter} />,
  );
}

// Dev-only: `?sentinelThemes` registers the leak detector's sentinel themes before the first
// theme is applied. Production builds drop this branch and the module it loads. If the dev chunk
// fails to load, the app still renders, without the sentinels; an error while rendering is not
// retried.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("sentinelThemes")) {
  import("./style/sentinelThemes.js").then(
    ({ installSentinelThemes }) => {
      renderApp(installSentinelThemes());
    },
    (error) => {
      console.error(error);
      renderApp();
    },
  );
} else {
  renderApp();
}

