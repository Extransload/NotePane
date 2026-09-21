import {
  BlockDragSelection,
} from "./editor/blockDragSelection.js";
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
  DEFAULT_APP_THEME,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_SCALE,
  DEFAULT_EDITOR_PREFERENCES,
  DEFAULT_LAYOUT_MODE,
  DEFAULT_THEME,
  DEFAULT_TITLE,
  EDITOR_FONT_SCALE_STEP,
  EXPORT_TOAST_TIMEOUT_MS,
  FONT_SIZE_TOAST_TIMEOUT_MS,
  LAYOUT_TRANSITION_TIMEOUT_MS,
  MAX_MARKDOWN_IMPORT_FILE_SIZE,
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
  cutCurrentBlocks,
  extractTableOfContentsEntries,
  findBlockById,
  findImageBlockBySource,
  focusLastEditorBlock,
  getBlocksForClipboard,
  getEditorBlockElement,
  isBlankTableSurfacePointer,
  isEmptyEditorSurfacePointer,
  isEmptyParagraphBlock,
  isEmptySessionDocument,
  scrollEditorBlockIntoView,
} from "./editor/blocks.js";
import {
  isStandaloneWebUrl,
  normalizeCopiedEditorPlainText,
  normalizePastedMarkdownForBlockNote,
} from "./editor/clipboard.js";
import {
  useBlockNoteFloatingMenuGuard,
} from "./editor/floatingMenus.js";
import {
  downloadInBrowser,
  ensurePngName,
  getStoredImageCrop,
  imageFileName,
  preventFocusLoss,
  uploadFile,
} from "./editor/images.js";
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
  isTitleManuallyEdited,
  mergeNotes,
  mergeTrashedNotes,
  normalizeOrderedNoteIds,
  normalizeTitle,
  parseBlocksJSON,
  reorderNotesByIds,
} from "./model/notes.js";
import {
  editorFontScaleToSize,
  getEditorFontFamilyCss,
  getEditorFontFamilyOptions,
  normalizeAppTheme,
  normalizeEditorFontScale,
  normalizeEditorPreferences,
  normalizeLayoutMode,
  normalizeTheme,
} from "./model/preferences.js";
import {
  getSessionTabStyle,
  getStickyShellStyle,
  resolveSessionTabAccentColor,
  resolveStickyAccentColor,
} from "./style/themeStyles.js";
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
  TrashButton,
} from "./ui/controls.jsx";
import {
  SessionCloseConfirmDialog,
  SessionTrashConfirmDialog,
  StickySettingsWindow,
  StickyTrashConfirmDialog,
} from "./ui/dialogs.jsx";
import {
  DockIcon,
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
import { useEditorSurfaceShortcuts } from "./hooks/useEditorSurfaceShortcuts.js";
import {
  useChromeShortcuts,
  useSessionNumberShortcuts,
  useTabModeShortcuts,
} from "./hooks/useKeyboardCommands.js";
import { useNotePersistence } from "./hooks/useNotePersistence.js";
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

function App() {
  const [note, setNote] = useState(null);
  const [notes, setNotes] = useState([]);
  const [trashedNotes, setTrashedNotes] = useState([]);
  const [appTheme, setAppTheme] = useState(DEFAULT_APP_THEME);
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
          editorFontScale: DEFAULT_EDITOR_FONT_SCALE,
          editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
	          detached: false,
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
            editorFontScale: DEFAULT_EDITOR_FONT_SCALE,
            editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
            detached: false,
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
          editorFontScale: editorPreferences.editorFontScale,
          editorFontFamily: editorPreferences.editorFontFamily,
          detached: false,
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
        detached: false,
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
        detached: false,
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

  const updateAppThemeMode = useCallback(async (mode) => {
    const nextAppTheme = normalizeAppTheme({ mode });
    setAppTheme(nextAppTheme);
    await electronApi?.updateAppTheme?.(nextAppTheme);
  }, []);

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

  const detachNote = useCallback(async (noteId) => {
    const result = await electronApi?.detachNote?.(noteId);
    if (!result) {
      return;
    }

    if (Array.isArray(result.notes)) {
      setNotes(result.notes);
    }
    if (result.activeNote) {
      setNote(result.activeNote);
    }
  }, []);

  const attachNote = useCallback(async (noteId) => {
    const result = await electronApi?.attachNote?.(noteId);
    if (!result) {
      return;
    }

    if (Array.isArray(result.notes)) {
      setNotes(result.notes);
    }
    if (result.activeNote) {
      setNote(result.activeNote);
    }
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
        onAppThemeModeChanged={updateAppThemeMode}
        onLayoutModeChanged={updateLayoutMode}
        onDetachNote={detachNote}
        onAttachNote={attachNote}
        onReorderNotes={reorderNotes}
        onSessionMovedToTrash={showSessionMovedToTrashToast}
        installedFontFamilies={installedFontFamilies}
        editorPreferences={editorPreferences}
        onEditorPreferencesChanged={updateEditorPreferences}
        recentEditorColors={recentEditorColors}
        onEditorColorUsed={rememberRecentEditorColor}
        layoutTransition={layoutTransition}
      />
      {sessionUndoToast && (
        <StickyToast
        toast={{
            message:
              sessionUndoToast.source === "close"
                ? `${sessionUndoToast.title} closed.`
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
  onAppThemeModeChanged,
  onLayoutModeChanged,
  onDetachNote,
  onAttachNote,
  onReorderNotes,
  onSessionMovedToTrash,
  installedFontFamilies,
  editorPreferences,
  onEditorPreferencesChanged,
  recentEditorColors,
  onEditorColorUsed,
  layoutTransition,
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
    extensions: [BlockDragSelection],
    initialContent: initialEditorContent,
    tabBehavior: "prefer-indent",
    tables: {
      splitCells: true,
      cellBackgroundColor: true,
      cellTextColor: true,
      headers: true,
    },
    uploadFile,
    pasteHandler: ({ event, editor, defaultPasteHandler }) => {
      const plainText = event.clipboardData?.getData("text/plain") ?? "";
      if (plainText && !isSelectionInsideCodeBlock(editor)) {
        if (
          isStandaloneWebUrl(plainText) &&
          hasEditorRangeSelection(editor)
        ) {
          editor.insertInlineContent(plainText.trim(), { updateSelection: true });
          return true;
        }

        const normalizedPaste = normalizePastedMarkdownForBlockNote(plainText);
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
  useBlockNoteFloatingMenuGuard();
  const codeBlockToolTargets = useCodeBlockToolTargets();

  useEffect(() => {
    const copySelectedBlock = (event) => {
      if (
        event.type !== "copy" ||
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
      const externalHTML = editor.blocksToHTMLLossy(selectedBlocks);
      const clipboardHTML = editor.blocksToFullHTML(selectedBlocks);
      const markdown = editor.blocksToMarkdownLossy(selectedBlocks);
      event.clipboardData.clearData();
      event.clipboardData.setData("blocknote/html", clipboardHTML);
      event.clipboardData.setData("text/html", externalHTML);
      event.clipboardData.setData("text/plain", markdown);
      return true;
    };

    const normalizeEditorClipboardText = (event) => {
      if (copySelectedBlock(event)) {
        return;
      }
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

    document.addEventListener("copy", normalizeEditorClipboardText, true);
    document.addEventListener("cut", normalizeEditorClipboardText, true);
    return () => {
      document.removeEventListener("copy", normalizeEditorClipboardText, true);
      document.removeEventListener("cut", normalizeEditorClipboardText, true);
    };
  }, [editor]);

  const [title, setTitle] = useState(initialDisplayTitle);
  const editorSurfaceRef = useRef(null);
  const suppressFocusedTableCellRef = useRef(false);
  const pendingTableExtensionFocusRef = useRef(null);
  const focusedTableDecorationsRef = useRef(null);
  const [isTableCellSelectionDismissed, setIsTableCellSelectionDismissed] =
    useState(false);
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
  const editorFontScale = normalizedEditorPreferences.editorFontScale;
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
    };
  }, [appFontFamily, appFontOptions]);
  const appThemeMode = normalizeAppTheme(appTheme).mode;
  const normalizedLayoutMode = normalizeLayoutMode(layoutMode);
  const effectiveLayoutMode =
    normalizedLayoutMode === "sticky" || note.detached ? "sticky" : "tabs";
  const dockedNotes = useMemo(
    () => notes.filter((candidate) => !candidate.detached),
    [notes],
  );
  const visibleSessionNotes = dockedNotes.length > 0 ? dockedNotes : notes;
  const visibleSessionNoteIds = useMemo(
    () => visibleSessionNotes.map((sessionNote) => sessionNote.id),
    [visibleSessionNotes],
  );
  const noteIndexById = useMemo(
    () => new Map(notes.map((candidate, index) => [candidate.id, index])),
    [notes],
  );
  const noteIndex = noteIndexById.get(note.id) ?? 0;
  const stickyAccentColor = resolveStickyAccentColor(theme, noteIndex);
  const stickyChromeStyle = useMemo(
    () =>
      effectiveLayoutMode === "sticky"
        ? getStickyShellStyle(theme, stickyAccentColor, appThemeMode)
        : {},
    [appThemeMode, effectiveLayoutMode, stickyAccentColor, theme],
  );
  const shellStyle = {
    ...stickyChromeStyle,
    ...appTypographyStyle,
    "--editor-font-scale": String(editorFontScale),
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
        effectiveLayoutMode === "tabs" &&
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
    editorFontSizeToast,
    exportToast,
    hideExportToast,
    showEditorFontSizeToast,
    showExportToast,
  } = useStickyToasts();
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
  const sessionTabRowsRef = useRef(new Map());
  const previousSessionTabRectsRef = useRef(null);
  const lastSavedBlocksRef = useRef("");
  const isSidebarCompact = effectiveLayoutMode === "tabs" && !isSidebarOpen;
  const sidebarState = isSidebarCompact ? "compact" : "expanded";
  const sidebarStyle = {
    "--session-sidebar-width": `${
      isSidebarCompact ? SIDEBAR_COMPACT_WIDTH : sidebarWidth
    }px`,
  };
  const isTableOfContentsVisible =
    effectiveLayoutMode === "tabs" &&
    showTableOfContents &&
    tableOfContentsEntries.length > 0;
  const shouldRenderChromeHeader =
    effectiveLayoutMode === "sticky" || !isWindowsRuntime();

  useEffect(() => {
    document.body.classList.toggle("theme-dark", appThemeMode === "dark");
    document.body.classList.toggle("theme-light", appThemeMode === "light");
    document.body.dataset.themeMode = appThemeMode;

    return () => {
      document.body.classList.remove("theme-dark", "theme-light");
      delete document.body.dataset.themeMode;
    };
  }, [appThemeMode]);

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

  useEffect(() => {
    if (effectiveLayoutMode !== "sticky") {
      setIsStickySettingsOpen(false);
      setIsStickyTrashConfirmOpen(false);
      setIsStickyActionBarOpen(false);
    }
    if (effectiveLayoutMode !== "tabs") {
      setPendingSessionTrashNote(null);
      setPendingSessionCloseNote(null);
    }
  }, [effectiveLayoutMode, note.id]);

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

  const refreshTableOfContents = useCallback(() => {
    setTableOfContentsEntries(extractTableOfContentsEntries(editor.document));
  }, [editor]);

  useEffect(() => {
    const surface = editorSurfaceRef.current;
    if (!surface || !isTableOfContentsVisible || tableOfContentsEntries.length === 0) {
      setActiveTableOfContentsEntryIds([]);
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

      appearanceTimerRef.current = window.setTimeout(() => {
        const payload = {
          noteId: note.id,
          title: normalizeTitle(nextTitle),
          theme: normalizeTheme(nextTheme),
        };
        if (Object.hasOwn(options, "titleManuallyEdited")) {
          payload.titleManuallyEdited = Boolean(options.titleManuallyEdited);
        }
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

    sessionAppearanceTimerRef.current = window.setTimeout(() => {
      void electronApi.updateAppearance({
        noteId: sessionNote.id,
        title: getNoteDisplayTitle(sessionNote),
        titleManuallyEdited: isTitleManuallyEdited(sessionNote),
        theme: normalizeTheme(nextTheme),
      });
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
      const nextPreferences = normalizeEditorPreferences(
        nextEditorPreferences,
        normalizedEditorPreferences,
      );
      const didFontSizeChange =
        nextPreferences.editorFontScale !== editorFontScale;

      void onEditorPreferencesChanged?.(nextPreferences);

      if (didFontSizeChange) {
        showEditorFontSizeToast(nextPreferences.editorFontScale);
      }
    },
    [
      editorFontScale,
      normalizedEditorPreferences,
      onEditorPreferencesChanged,
      showEditorFontSizeToast,
    ],
  );

  const updateEditorFontScale = useCallback(
    (nextEditorFontScale) => {
      const normalizedEditorFontScale = normalizeEditorFontScale(nextEditorFontScale);
      updateGlobalEditorPreferences({
        ...normalizedEditorPreferences,
        editorFontScale: normalizedEditorFontScale,
      });
    },
    [normalizedEditorPreferences, updateGlobalEditorPreferences],
  );

  const toggleTableOfContents = useCallback(() => {
    updateGlobalEditorPreferences({
      ...normalizedEditorPreferences,
      showTableOfContents: !showTableOfContents,
    });
  }, [normalizedEditorPreferences, showTableOfContents, updateGlobalEditorPreferences]);

  const adjustEditorFontScale = useCallback(
    (direction) => {
      updateEditorFontScale(
        normalizeEditorFontScale(editorFontScale + direction * EDITOR_FONT_SCALE_STEP),
      );
    },
    [editorFontScale, updateEditorFontScale],
  );

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

  const openPreferencesPage = useCallback((pageId = "general") => {
    setPreferencesInitialPage(normalizePreferencePageId(pageId));
    setIsColorPanelOpen(false);
    setIsStickySettingsOpen(false);
    setIsStickyTrashConfirmOpen(false);
    setPendingSessionTrashNote(null);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    setIsPreferencesWindowOpen(true);
  }, []);

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

  const openTrashPreferences = useCallback(() => {
    openPreferencesPage("trash");
  }, [openPreferencesPage]);

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
      if (isPdf) {
        await nextAnimationFrame();
        await nextAnimationFrame();
      }
      const markdown = isPdf
        ? undefined
        : await editor.blocksToMarkdownLossy(editor.document);
      const result = await electronApi?.exportNote({
        noteId: note.id,
        title: normalizeTitle(title),
        type,
        markdown,
      });

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
      const blocks = editor.tryParseMarkdownToBlocks(markdown);
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
      if (
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
  }, [matchesEnabledKeyboardShortcut, openPreferences]);

  useChromeShortcuts({
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

      const block = findImageBlockBySource(editor.document, image.currentSrc || image.src);
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

    document.addEventListener("click", handleImageClick, true);
    return () => {
      document.removeEventListener("click", handleImageClick, true);
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

  const openCropDialog = useCallback(() => {
    const block = findBlockById(editor.document, activeImageBlockId);
    const url = block?.props?.originalUrl || block?.props?.url;
    if (!url) {
      return;
    }

    setCropState({
      blockId: block.id,
      sourceUrl: url,
      crop: getStoredImageCrop(block.props),
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
        effectiveLayoutMode !== "sticky" ||
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
    [effectiveLayoutMode],
  );

  const applyCrop = useCallback(
    (croppedDataUrl, crop) => {
      const block = findBlockById(editor.document, cropState?.blockId);
      if (!block) {
        return;
      }

      editor.updateBlock(block, {
        props: {
          url: croppedDataUrl,
          originalUrl: block.props.originalUrl || block.props.url,
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
    [cropState?.blockId, editor, scheduleSave],
  );

  const selectSidebarNote = useCallback(
    async (noteId) => {
      if (noteId === note.id) {
        return;
      }

      await saveNow();
      await onSelectNote(noteId);
    },
    [note.id, onSelectNote, saveNow],
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
    if (effectiveLayoutMode !== "tabs") {
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
    effectiveLayoutMode,
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
      if (effectiveLayoutMode !== "tabs") {
        return null;
      }

      const normalizedOrderedNoteIds = normalizeOrderedNoteIds(orderedNoteIds);
      if (normalizedOrderedNoteIds.length === 0) {
        return null;
      }

      captureSessionTabRects();
      return await onReorderNotes?.(normalizedOrderedNoteIds, options);
    },
    [captureSessionTabRects, effectiveLayoutMode, onReorderNotes],
  );

  const moveCurrentSessionNote = useCallback(
    async (direction) => {
      if (effectiveLayoutMode !== "tabs" || visibleSessionNoteIds.length <= 1) {
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
      effectiveLayoutMode,
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
      if (effectiveLayoutMode !== "tabs" || visibleSessionNotes.length <= 1) {
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
    [effectiveLayoutMode, note.id, selectSidebarNote, visibleSessionNotes],
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
    effectiveLayoutMode,
    matchesEnabledKeyboardShortcut,
    moveCurrentSessionNote,
    selectRelativeSessionNote,
    visibleSessionNotes,
  });

  const detachSessionNote = useCallback(
    async (sessionNote, event) => {
      if (normalizedLayoutMode !== "tabs" || sessionNote.detached) {
        return;
      }

      const sidebar = document.querySelector(".session-sidebar");
      const bounds = sidebar?.getBoundingClientRect();
      const isOutsideSidebar =
        bounds &&
        (event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom);

      if (!isOutsideSidebar) {
        return;
      }

      await saveNow();
      await onDetachNote(sessionNote.id);
    },
    [normalizedLayoutMode, onDetachNote, saveNow],
  );

  const {
    attachDraggedNote,
    dropSessionTab,
    endSessionTabDrag,
    handleSessionTabDragOver,
    handleSessionTabsDragOver,
    previewSessionTabReorder,
    startSessionTabDrag,
  } = useSessionTabDrag({
    detachSessionNote,
    draggingSessionNoteId,
    normalizedLayoutMode,
    onAttachNote,
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

  const focusLastBlockFromEmptySurface = useCallback(
    (event) => {
      if (!isEmptyEditorSurfacePointer(event)) {
        return;
      }

      event.preventDefault();
      focusLastEditorBlock(editor);
    },
    [editor],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (saveRetryTimerRef.current) {
        window.clearTimeout(saveRetryTimerRef.current);
      }
      if (appearanceTimerRef.current) {
        window.clearTimeout(appearanceTimerRef.current);
      }
      if (sessionAppearanceTimerRef.current) {
        window.clearTimeout(sessionAppearanceTimerRef.current);
      }
    };
  }, []);

  return (
    <main
      className={`sticky-shell theme-${appThemeMode} layout-${effectiveLayoutMode} sidebar-${sidebarState}`}
      style={shellStyle}
      data-testid="sticky-shell"
      data-theme-mode={appThemeMode}
      data-layout-mode={effectiveLayoutMode}
    >
      {shouldRenderChromeHeader && (
        <header
          className="sticky-header"
          data-testid="sticky-header"
          data-window-drag-handle={effectiveLayoutMode === "sticky" ? "true" : undefined}
          onPointerDown={startHeaderWindowDrag}
        >
        <div className="sticky-drag-strip" aria-hidden="true" />
        <div
          className={`sticky-header-actions${
            isStickyActionBarOpen ? " is-open" : ""
          }`}
          aria-label="Sticky controls"
        >
          {effectiveLayoutMode === "sticky" && (
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
                onClick={() => {
                  if (isStickyActionBarOpen) {
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
          {note.detached && normalizedLayoutMode === "tabs" && (
            <button
              type="button"
              className="dock-note-button has-tooltip"
              aria-label="Dock note into tabs"
              data-tooltip={formatShortcutTooltip(
                "Dock to tabs",
                getEnabledShortcut("attachDetachedNote"),
              )}
              onMouseDown={preventFocusLoss}
              onClick={() => void onAttachNote(note.id)}
            >
              <DockIcon />
            </button>
          )}
        </div>
        </header>
      )}
      <div className="sticky-body">
        {effectiveLayoutMode === "tabs" && (
          <aside
            className={`session-sidebar ${isSidebarCompact ? "is-compact" : ""}`}
            data-testid="session-sidebar"
            data-sidebar-state={sidebarState}
            style={sidebarStyle}
            onDragOver={(event) => {
              if (event.dataTransfer?.types.includes("application/x-notepane-note")) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => void attachDraggedNote(event)}
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
                        appThemeMode,
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
                        appThemeMode,
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
                      onDragEnd={(event) => void endSessionTabDrag(sessionNote, event)}
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
                          onClick={() => void selectSidebarNote(sessionNote.id)}
                          onDoubleClick={(event) => {
                            event.preventDefault();
                            startSessionRename(sessionNote);
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
                            onClick={() => void selectSidebarNote(sessionNote.id)}
                            onDoubleClick={(event) => {
                              event.preventDefault();
                              startSessionRename(sessionNote);
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
                <TrashButton onClick={openTrashPreferences} />
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
          onMouseDown={focusLastBlockFromEmptySurface}
        >
          {editorFontSizeToast && (
            <div
              className="editor-font-size-toast"
              role="status"
              aria-live="polite"
            >
              {editorFontSizeToast}
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
            theme={appThemeMode}
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
          theme={appThemeMode}
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
          variant="sticky"
          defaultColor={
            effectiveLayoutMode === "sticky" ? stickyAccentColor : undefined
          }
          onChange={updateTheme}
          onClose={() => setIsColorPanelOpen(false)}
        />
      )}
      {sessionColorPanelNote && (
        <ColorPanel
          theme={normalizeTheme(sessionColorPanelNote.theme)}
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
          appThemeMode={appThemeMode}
          editorPreferences={editorPreferences}
          keyboardShortcuts={keyboardShortcuts}
          appFontOptions={appFontOptions}
          fontOptions={editorFontOptions}
          trashedNotes={trashedNotes}
          onAppThemeModeChange={onAppThemeModeChanged}
          onEditorPreferencesChange={updateGlobalEditorPreferences}
          onExportBackup={exportDataBackup}
          onImportBackup={importDataBackup}
          onRestoreTrashedNote={onRestoreTrashedNote}
          onPurgeTrashedNote={onPurgeTrashedNote}
          onClose={() => setIsPreferencesWindowOpen(false)}
        />
      )}
      {exportToast && <StickyToast toast={exportToast} />}
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

createRoot(document.getElementById("root")).render(<App />);

