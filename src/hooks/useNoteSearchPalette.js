import {
  electronApi,
} from "../constants.js";
import {
  getNoteDisplayTitle,
} from "../model/notes.js";
import {
  blocksToPlainText,
  collectNoteTags,
  createNoteTextReader,
  filterSearchEntries,
  parseSearchQuery,
  resolveFolderFilter,
  searchNotes,
} from "../model/search.js";
import {
  parseCommandQuery,
} from "../model/commands.js";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * The Mod+P note search palette: its query, ranked results, and where a chosen
 * result goes. A blank query works as a plain note switch, so it never opens
 * the find bar. `#tag` and `folder:Name` tokens in the query filter the notes
 * before the text is matched, so filters alone list every note they keep.
 */
export function useNoteSearchPalette({
  editor,
  folders,
  normalizedLayoutMode,
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
  const [storedFolders, setStoredFolders] = useState(null);
  const readNoteText = useMemo(() => createNoteTextReader(), []);
  const parsedQuery = useMemo(() => parseSearchQuery(query ?? ""), [query]);
  const paletteFolders = useMemo(
    () => storedFolders ?? (Array.isArray(folders) ? folders : []),
    [folders, storedFolders],
  );
  const sourceNotes = storedNotes ?? notes;

  // The tags in use, plus any the query names that no note carries any more,
  // so its chip still shows and can be turned off.
  const paletteTags = useMemo(() => {
    if (query === null) {
      return [];
    }
    const inUse = collectNoteTags(sourceNotes);
    return [...inUse, ...parsedQuery.tags.filter((tag) => !inUse.includes(tag))];
  }, [parsedQuery.tags, query, sourceNotes]);

  const results = useMemo(() => {
    // ">" lists commands only (src/model/commands.js).
    if (query === null || parseCommandQuery(query).commandsOnly) {
      return [];
    }
    // The current note may have edits still waiting on the save debounce, so
    // it is read from the live editor instead of the stored copy.
    const entries = sourceNotes.map((candidate) => ({
      note: candidate,
      title: getNoteDisplayTitle(candidate),
      body: candidate.id === note.id
        ? blocksToPlainText(editor.document)
        : readNoteText(candidate),
    }));
    const filtered = filterSearchEntries(entries, {
      tags: parsedQuery.tags,
      folderId: resolveFolderFilter(parsedQuery.folder, paletteFolders),
      folders: paletteFolders,
    });
    return searchNotes(filtered, parsedQuery.text);
  }, [editor, note.id, paletteFolders, parsedQuery, query, readNoteText, sourceNotes]);

  // Opens the palette on a query, such as "#launch " from a tag chip on a note.
  const openPaletteWithQuery = useCallback(async (initialQuery) => {
    setQuery(typeof initialQuery === "string" ? initialQuery : "");
    // Other windows save straight to the main process, and this window's note
    // list only refreshes when a title changes, so search the stored notes.
    const [latestNotes, latestFolders] = await Promise.all([
      electronApi?.listNotes?.(),
      electronApi?.listFolders?.(),
    ]);
    if (Array.isArray(latestNotes)) {
      setStoredNotes(latestNotes);
    }
    if (Array.isArray(latestFolders)) {
      setStoredFolders(latestFolders);
    }
  }, []);

  const openPalette = useCallback(() => openPaletteWithQuery(""), [openPaletteWithQuery]);

  const dismissPalette = useCallback(() => {
    setQuery(null);
    setStoredNotes(null);
    setStoredFolders(null);
  }, []);

  const closePalette = useCallback(() => {
    dismissPalette();
    editor.focus();
  }, [dismissPalette, editor]);

  const chooseResult = useCallback(async (result) => {
    // Only the text is found in the note; tag and folder filters have done their part.
    const findQuery = parsedQuery.text.trim();
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
    if (normalizedLayoutMode === "tabs") {
      if (findQuery) {
        onFindRequested({ noteId: targetId, query: findQuery });
      }
      const landedNoteId = await selectSidebarNote(targetId);
      // A switch that fails, for example because another window trashed the
      // note, must not leave the request to open find on a later visit.
      if (findQuery && landedNoteId !== targetId) {
        onPendingFindHandled();
      }
      return;
    }
    await electronApi?.revealNote?.({ noteId: targetId, query: findQuery });
  }, [
    dismissPalette,
    editor,
    normalizedLayoutMode,
    note.id,
    onFindRequested,
    onPendingFindHandled,
    openFind,
    parsedQuery.text,
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
    folders: paletteFolders,
    tags: paletteTags,
    setQuery,
    openPalette,
    openPaletteWithQuery,
    closePalette,
    chooseResult,
  };
}
