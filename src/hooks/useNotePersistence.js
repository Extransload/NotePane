import {
  electronApi,
} from "../constants.js";
import {
  deriveAutomaticTitleFromBlocks,
  getNoteDisplayTitle,
  isTitleManuallyEdited,
  normalizeTitle,
} from "../model/notes.js";
import {
  useCallback,
  useRef,
} from "react";
/**
 * Writing the note back to disk. `scheduleSave` debounces ordinary typing,
 * `saveNow` flushes immediately and retries once on failure, and
 * `saveVersionNow` snapshots a version. Writes are serialised through one
 * promise queue so a retry can never overtake a newer save.
 */
export function useNotePersistence({
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
}) {
  const saveQueueRef = useRef(Promise.resolve());

  const updateAutomaticTitleFromBlocks = useCallback(
    (blocks) => {
      if (isTitleManuallyEdited(note)) {
        return normalizeTitle(note.title);
      }

      const nextTitle = deriveAutomaticTitleFromBlocks(blocks);
      setTitle((currentTitle) => currentTitle === nextTitle ? currentTitle : nextTitle);
      if (normalizeTitle(note.title) !== nextTitle || note.titleManuallyEdited !== false) {
        onNoteChanged({
          ...note,
          title: nextTitle,
          titleManuallyEdited: false,
        });
      }
      return nextTitle;
    },
    [note, onNoteChanged],
  );

  const getCurrentNoteSnapshot = useCallback(() => ({
    ...note,
    title: getNoteDisplayTitle(note, editor.document),
    titleManuallyEdited: isTitleManuallyEdited(note),
    blocksJSON: JSON.stringify(editor.document),
  }), [editor, note]);

  const saveNow = useCallback((options = {}) => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!electronApi?.saveContent) {
      return saveQueueRef.current;
    }

    const pendingSave = saveQueueRef.current.then(async () => {
      const blocksJSON = JSON.stringify(editor.document);
      if (blocksJSON === lastSavedBlocksRef.current) {
        isEditorDirtyRef.current = false;
        return;
      }

      let markdown = "";
      try {
        markdown = await editor.blocksToMarkdownLossy(editor.document);
      } catch {
        markdown = "";
      }

      const savedNote = await electronApi.saveContent({
        noteId: note.id,
        blocksJSON,
        markdown,
      });
      lastSavedBlocksRef.current = blocksJSON;
      isEditorDirtyRef.current = JSON.stringify(editor.document) !== blocksJSON;
      if (savedNote?.id) {
        setTitle(getNoteDisplayTitle(savedNote, editor.document));
        onNoteChanged(savedNote);
      }
      if (isEditorDirtyRef.current) {
        saveTimerRef.current = window.setTimeout(() => {
          saveTimerRef.current = null;
          void saveNow();
        }, 180);
      }
    });

    saveQueueRef.current = pendingSave.catch(() => {
      isEditorDirtyRef.current = true;
      if (saveRetryTimerRef.current) {
        window.clearTimeout(saveRetryTimerRef.current);
      }
      saveRetryTimerRef.current = window.setTimeout(() => {
        saveRetryTimerRef.current = null;
        void saveNow();
      }, 1000);
    });

    return options.throwOnError ? pendingSave : saveQueueRef.current;
  }, [editor, note.id, onNoteChanged]);

  const saveVersionNow = useCallback(async () => {
    await saveNow({ throwOnError: true });
    const markdown = await editor.blocksToMarkdownLossy(editor.document);
    const version = await electronApi?.createNoteVersion?.({
      noteId: note.id,
      title: getNoteDisplayTitle(note, editor.document),
      titleManuallyEdited: isTitleManuallyEdited(note),
      blocksJSON: JSON.stringify(editor.document),
      markdown,
      source: "manual",
    });
    if (version && isVersionHistoryOpen) {
      setNoteVersions((current) => [
        version,
        ...current.filter((item) => item.id !== version.id),
      ]);
    }
    return version;
  }, [editor, isVersionHistoryOpen, note, saveNow]);

  const scheduleSave = useCallback(() => {
    if (!electronApi) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveNow();
    }, 180);
  }, [saveNow]);

  return {
    getCurrentNoteSnapshot,
    saveNow,
    saveVersionNow,
    scheduleSave,
    updateAutomaticTitleFromBlocks,
  };
}
