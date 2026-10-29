import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_LAYOUT_MODE,
  DEFAULT_THEME,
  DEFAULT_TITLE,
  TRASH_UNDO_TOAST_TIMEOUT_MS,
  electronApi,
} from "../constants.js";
import {
  NOTE_PANE_TEMPLATE_BLOCKS_JSON,
} from "../editor/schema.jsx";
import {
  createTemplateSessionNote,
  mergeNotes,
  mergeTrashedNotes,
  normalizeTitle,
  reorderNotesByIds,
} from "../model/notes.js";
import { hasPendingSave, waitForPendingSave } from "../model/pendingSaves.js";
import {
  normalizeAppTheme,
  normalizeEditorPreferences,
  normalizeLayoutMode,
} from "../model/preferences.js";

/**
 * The window's session list: the open note, every session and the trash, their
 * create, select, reorder, trash, restore and purge commands (with the browser
 * preview's in-memory equivalents), and the undo toast shown after a session
 * moves to Trash. The startup load also hands the stored app theme, layout mode
 * and editor preferences to the setters App owns.
 */
export function useSessionList({
  editorPreferences,
  layoutMode,
  setAppTheme,
  setEditorPreferences,
  setLayoutMode,
}) {
  const [note, setNote] = useState(null);
  const [notes, setNotes] = useState([]);
  const [trashedNotes, setTrashedNotes] = useState([]);
  const [sessionUndoToast, setSessionUndoToast] = useState(null);
  const sessionUndoToastTimerRef = useRef(null);

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

  const noteRef = useRef(note);
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  // Showing a note whose previous editor is still writing would load the
  // pre-save content from disk and then save it back over the edit.
  const adoptNote = useCallback(async (candidate) => {
    if (!candidate?.id || !hasPendingSave(candidate.id)) {
      setNote(candidate);
      return candidate;
    }
    await waitForPendingSave(candidate.id);
    const freshNote = (await electronApi?.getNote?.(candidate.id)) ?? candidate;
    setNotes((currentNotes) => mergeNotes(currentNotes, freshNote));
    setNote(freshNote);
    return freshNote;
  }, []);

  useEffect(() => {
    return electronApi?.onNotesChanged?.((payload) => {
      const nextNotes = Array.isArray(payload?.notes) ? payload.notes : [];
      const nextTrashedNotes = Array.isArray(payload?.trash) ? payload.trash : null;
      const activeNote = payload?.activeNote;

      setNotes(nextNotes);
      if (nextTrashedNotes) {
        setTrashedNotes(nextTrashedNotes);
      }
      const currentNoteId = noteRef.current?.id;
      const candidate = activeNote?.id
        ? activeNote
        : nextNotes.find((item) => item.id === currentNoteId) ?? nextNotes[0] ?? null;
      if (!candidate) {
        return;
      }
      if (candidate.id !== currentNoteId) {
        void adoptNote(candidate);
        return;
      }
      setNote(candidate);
    });
  }, [adoptNote]);

  const selectNote = useCallback(
    async (noteId) => {
      const nextNote = electronApi
        ? await electronApi.activateNote(noteId)
        : notes.find((candidate) => candidate.id === noteId);

      if (nextNote) {
        setNotes((currentNotes) => mergeNotes(currentNotes, nextNote));
        return adoptNote(nextNote);
      }
      return null;
    },
    [adoptNote, notes],
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

  // A new session holding a copy of `source` (title, blocks, Markdown and colour), shown in
  // this window. The desktop app creates a blank note, saves the content and the title into it,
  // then opens it; the browser preview copies it in memory.
  const duplicateSidebarNote = useCallback(async (source) => {
    const title = `${normalizeTitle(source.title)} copy`;
    const blocksJSON =
      source.blocksJSON ?? (source.seedDemoContent ? NOTE_PANE_TEMPLATE_BLOCKS_JSON : null);
    const markdown = source.markdown ?? "";
    const theme = source.theme ?? DEFAULT_THEME;

    if (!electronApi) {
      const now = Date.now();
      const copy = {
        id: crypto.randomUUID(),
        title,
        titleManuallyEdited: true,
        blocksJSON,
        markdown,
        theme,
        seedDemoContent: false,
        editorFontFamily: editorPreferences.editorFontFamily,
        trashedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      setNotes((currentNotes) => mergeNotes(currentNotes, copy));
      setNote(copy);
      return copy;
    }

    const created = await electronApi.createNote({ template: "blank" });
    if (blocksJSON) {
      await electronApi.saveContent({ noteId: created.id, blocksJSON, markdown });
    }
    const named = await electronApi.updateAppearance({
      noteId: created.id,
      title,
      titleManuallyEdited: true,
      theme,
    });
    setNotes((currentNotes) => mergeNotes(currentNotes, named ?? created));
    const activatedNote = await electronApi.activateNote(created.id);
    return adoptNote(activatedNote ?? named ?? created);
  }, [adoptNote, editorPreferences]);

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
          await adoptNote(nextNote);
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
    [adoptNote, note, notes, trashedNotes],
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
          await adoptNote(nextNote);
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
    [adoptNote, trashedNotes],
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
          await adoptNote(result.activeNote);
        }
        return;
      }

      setTrashedNotes((currentTrashedNotes) =>
        currentTrashedNotes.filter((candidate) => candidate.id !== noteId),
      );
    },
    [adoptNote],
  );

  const updateNoteInList = useCallback((updatedNote) => {
    setNotes((currentNotes) => mergeNotes(currentNotes, updatedNote));
    setNote((currentNote) =>
      currentNote?.id === updatedNote.id
        ? { ...currentNote, ...updatedNote }
      : currentNote,
    );
  }, []);

  return {
    createSidebarNote,
    deleteSidebarNote,
    duplicateSidebarNote,
    note,
    notes,
    purgeTrashedNote,
    reorderNotes,
    restoreTrashedNote,
    selectNote,
    sessionUndoToast,
    showSessionMovedToTrashToast,
    trashedNotes,
    undoSessionMoveToTrash,
    updateNoteInList,
  };
}
