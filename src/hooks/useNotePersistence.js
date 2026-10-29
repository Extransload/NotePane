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
  trackPendingSave,
} from "../model/pendingSaves.js";
import {
  useCallback,
  useRef,
} from "react";

const SAVE_DEBOUNCE_MS = 180;
const SAVE_RETRY_BASE_MS = 1000;
const SAVE_RETRY_MAX_MS = 5000;

/**
 * Writing the note back to disk. `scheduleSave` debounces ordinary typing,
 * `saveNow` writes immediately and keeps retrying with a backoff until the
 * write lands, and `saveVersionNow` snapshots a version. Writes are serialised
 * through one promise queue so a retry can never overtake a newer save, and a
 * flush can cut a retry wait short through `retryNowRef`.
 */
export function useNotePersistence({
  editor,
  isEditorDirtyRef,
  isVersionHistoryOpen,
  lastSavedBlocksRef,
  note,
  onNoteChanged,
  onSaveStateChanged,
  saveRetryTimerRef,
  saveTimerRef,
  setNoteVersions,
  setTitle,
}) {
  const saveQueueRef = useRef(Promise.resolve());
  const retryNowRef = useRef(null);

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

  const performSave = useCallback(async () => {
    const blocksJSON = JSON.stringify(editor.document);
    if (blocksJSON === lastSavedBlocksRef.current) {
      isEditorDirtyRef.current = false;
      return null;
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
    return savedNote ?? null;
  }, [editor, note.id, onNoteChanged]);

  const waitForRetry = useCallback((delayMs) => new Promise((resolve) => {
    const run = () => {
      window.clearTimeout(saveRetryTimerRef.current);
      saveRetryTimerRef.current = null;
      retryNowRef.current = null;
      resolve();
    };
    saveRetryTimerRef.current = window.setTimeout(run, delayMs);
    retryNowRef.current = run;
  }), []);

  const saveNow = useCallback((options = {}) => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!electronApi?.saveContent) {
      return saveQueueRef.current;
    }
    const maxAttempts = options.throwOnError ? 1 : Infinity;

    const pendingSave = saveQueueRef.current.then(async () => {
      for (let attempt = 1; ; attempt += 1) {
        try {
          const savedNote = await performSave();
          onSaveStateChanged?.({ status: "saved" });
          if (isEditorDirtyRef.current) {
            saveTimerRef.current = window.setTimeout(() => {
              saveTimerRef.current = null;
              void saveNow();
            }, SAVE_DEBOUNCE_MS);
          }
          return savedNote;
        } catch (error) {
          isEditorDirtyRef.current = true;
          onSaveStateChanged?.({ status: "failed", attempt, error });
          if (attempt >= maxAttempts) {
            throw error;
          }
          await waitForRetry(Math.min(SAVE_RETRY_BASE_MS * attempt, SAVE_RETRY_MAX_MS));
        }
      }
    });

    saveQueueRef.current = pendingSave.then(
      () => undefined,
      () => undefined,
    );
    return trackPendingSave(note.id, pendingSave);
  }, [note.id, onSaveStateChanged, performSave, waitForRetry]);

  const retrySaveNow = useCallback(() => {
    retryNowRef.current?.();
  }, []);

  const saveVersionNow = useCallback(async () => {
    await saveNow({ throwOnError: true });
    const blocksJSON = JSON.stringify(editor.document);
    const markdown = await editor.blocksToMarkdownLossy(editor.document);
    const version = await electronApi?.createNoteVersion?.({
      noteId: note.id,
      title: getNoteDisplayTitle(note, editor.document),
      titleManuallyEdited: isTitleManuallyEdited(note),
      blocksJSON,
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
    }, SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  return {
    getCurrentNoteSnapshot,
    retrySaveNow,
    saveNow,
    saveVersionNow,
    scheduleSave,
    updateAutomaticTitleFromBlocks,
  };
}
