import {
  electronApi,
} from "../constants.js";
import {
  getNoteDisplayTitle,
} from "../model/notes.js";
import {
  blocksToPlainText,
  createNoteTextReader,
  searchNotes,
} from "../model/search.js";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * The Mod+P note search palette: its query, ranked results, and where a chosen
 * result goes. A blank query works as a plain note switch, so it never opens
 * the find bar.
 */
export function useNoteSearchPalette({
  editor,
  effectiveLayoutMode,
  note,
  notes,
  onFindRequested,
  onPendingFindHandled,
  openFind,
  pendingFind,
  selectSidebarNote,
}) {
  const [query, setQuery] = useState(null);
  const [storedNotes, setStoredNotes] = useState(null);
  const readNoteText = useMemo(() => createNoteTextReader(), []);

  const results = useMemo(() => {
    if (query === null) {
      return [];
    }
    // The current note may have edits still waiting on the save debounce, so
    // it is read from the live editor instead of the stored copy.
    const entries = (storedNotes ?? notes).map((candidate) => ({
      note: candidate,
      title: getNoteDisplayTitle(candidate),
      body: candidate.id === note.id
        ? blocksToPlainText(editor.document)
        : readNoteText(candidate),
    }));
    return searchNotes(entries, query);
  }, [editor, note.id, notes, query, readNoteText, storedNotes]);

  const openPalette = useCallback(async () => {
    setQuery("");
    // Other windows save straight to the main process, and this window's note
    // list only refreshes when a title changes, so search the stored notes.
    const latestNotes = await electronApi?.listNotes?.();
    if (Array.isArray(latestNotes)) {
      setStoredNotes(latestNotes);
    }
  }, []);

  const dismissPalette = useCallback(() => {
    setQuery(null);
    setStoredNotes(null);
  }, []);

  const closePalette = useCallback(() => {
    dismissPalette();
    editor.focus();
  }, [dismissPalette, editor]);

  const chooseResult = useCallback(async (result) => {
    const findQuery = (query ?? "").trim();
    dismissPalette();
    const targetId = result.note.id;
    if (targetId === note.id) {
      if (findQuery) {
        openFind(findQuery);
      } else {
        editor.focus();
      }
      return;
    }
    const isTabsWindow = effectiveLayoutMode === "tabs" && !note.detached;
    if (isTabsWindow && !result.note.detached) {
      if (findQuery) {
        onFindRequested({ noteId: targetId, query: findQuery });
      }
      await selectSidebarNote(targetId);
      return;
    }
    await electronApi?.revealNote?.({ noteId: targetId, query: findQuery });
  }, [
    dismissPalette,
    editor,
    effectiveLayoutMode,
    note.detached,
    note.id,
    onFindRequested,
    openFind,
    query,
    selectSidebarNote,
  ]);

  useEffect(() => {
    if (pendingFind?.noteId !== note.id) {
      return;
    }
    onPendingFindHandled();
    if (pendingFind.query.trim()) {
      openFind(pendingFind.query);
    }
  }, [note.id, onPendingFindHandled, openFind, pendingFind]);

  return {
    query,
    results,
    setQuery,
    openPalette,
    closePalette,
    chooseResult,
  };
}
