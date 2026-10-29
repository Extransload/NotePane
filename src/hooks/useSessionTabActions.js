import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  SESSION_TAB_EXIT_MS,
  electronApi,
} from "../constants.js";
import {
  isEmptySessionDocument,
} from "../editor/blocks.js";
import {
  EMPTY_BLOCKS,
} from "../editor/schema.jsx";
import {
  isShortcutRecorderTarget,
} from "../model/keyboardShortcuts.js";
import {
  getNoteDisplayTitle,
  normalizeTitle,
  parseBlocksJSON,
} from "../model/notes.js";
import {
  normalizeTheme,
} from "../model/preferences.js";
import {
  delay,
} from "../utils/values.js";

/**
 * The session tab commands: inline rename (a rename asked for while a double click is still
 * switching tabs included), duplicating a session, opening one as its own sticky window, moving a
 * session to Trash behind its confirmation and exit animation, and closing the current tab with
 * Cmd/Ctrl+W or the app menu.
 */
export function useSessionTabActions({
  closeCurrentWindow,
  closeOverlay,
  editor,
  getCurrentNoteSnapshot,
  getSessionDisplayTitle,
  matchesEnabledKeyboardShortcut,
  normalizedLayoutMode,
  note,
  onDeleteNote,
  onDuplicateNote,
  onNoteChanged,
  onPendingRenameHandled,
  onRenameRequested,
  onSessionMovedToTrash,
  openOverlay,
  pendingRenameNoteId,
  pendingSessionCloseNote,
  pendingSessionTrashNote,
  saveNow,
  scheduleAppearanceSave,
  selectSidebarNote,
  setTitle,
  showExportToast,
  theme,
  visibleSessionNotes,
}) {
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [draftSessionTitle, setDraftSessionTitle] = useState("");
  const [isDraftSessionTitleDirty, setIsDraftSessionTitleDirty] = useState(false);
  const [removingSessionIds, setRemovingSessionIds] = useState(() => new Set());

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

  // Saves the open note first, so a copy of it, or of the stored note, has every edit.
  const duplicateSessionNote = useCallback(async (sessionNote) => {
    try {
      await saveNow();
      const isCurrent = sessionNote.id === note.id;
      let markdown = sessionNote.markdown ?? "";
      if (isCurrent) {
        try {
          markdown = await editor.blocksToMarkdownLossy(editor.document);
        } catch {
          markdown = "";
        }
      }
      await onDuplicateNote({
        ...(isCurrent ? { ...getCurrentNoteSnapshot(), theme } : sessionNote),
        title: getSessionDisplayTitle(sessionNote),
        markdown,
      });
    } catch (error) {
      showExportToast(error.message || "Could not duplicate the session.", "error");
    }
  }, [
    editor,
    getCurrentNoteSnapshot,
    getSessionDisplayTitle,
    note.id,
    onDuplicateNote,
    saveNow,
    showExportToast,
    theme,
  ]);

  // Desktop tabs layout only. The note opens in its own sticky window while the app stays in tabs;
  // when it is the open note, this window first moves to the next session (or the previous one).
  const openSessionAsSticky = useCallback(async (sessionNote) => {
    if (!electronApi?.openStickyNote || normalizedLayoutMode !== "tabs") {
      return;
    }
    try {
      if (sessionNote.id === note.id) {
        const index = visibleSessionNotes.findIndex((candidate) => candidate.id === note.id);
        const neighbour = visibleSessionNotes[index + 1] ?? visibleSessionNotes[index - 1];
        if (!neighbour || (await selectSidebarNote(neighbour.id)) !== neighbour.id) {
          return;
        }
      }
      await electronApi.openStickyNote(sessionNote.id);
    } catch (error) {
      showExportToast(error.message || "Could not open the sticky window.", "error");
    }
  }, [normalizedLayoutMode, note.id, selectSidebarNote, showExportToast, visibleSessionNotes]);

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
      openOverlay("sessionTrashConfirm", sessionNote);
    },
    [openOverlay, removingSessionIds],
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
      openOverlay("sessionCloseConfirm", currentSessionNote);
      return;
    }

    void deleteSessionNote(currentSessionNote, { source: "close" });
  }, [
    closeCurrentWindow,
    openOverlay,
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

    closeOverlay("sessionCloseConfirm");
    await deleteSessionNote(sessionNote, { source: "close" });
  }, [closeOverlay, deleteSessionNote, pendingSessionCloseNote]);

  useEffect(() => {
    return electronApi?.onCloseTabRequested?.(requestCloseCurrentTab);
  }, [requestCloseCurrentTab]);

  useEffect(() => {
    if (!pendingSessionCloseNote) {
      return;
    }

    if (!visibleSessionNotes.some((sessionNote) => sessionNote.id === pendingSessionCloseNote.id)) {
      closeOverlay("sessionCloseConfirm");
    }
  }, [closeOverlay, pendingSessionCloseNote, visibleSessionNotes]);

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

    closeOverlay("sessionTrashConfirm");
    await deleteSessionNote(sessionNote);
  }, [closeOverlay, deleteSessionNote, pendingSessionTrashNote]);

  const changeDraftSessionTitle = useCallback((value) => {
    setDraftSessionTitle(value);
    setIsDraftSessionTitleDirty(true);
  }, []);

  return {
    cancelSessionRename,
    changeDraftSessionTitle,
    commitSessionRename,
    confirmCloseCurrentTab,
    confirmDeleteSessionNote,
    draftSessionTitle,
    duplicateSessionNote,
    editingSessionId,
    openSessionAsSticky,
    removingSessionIds,
    requestDeleteSessionNote,
    requestSessionRename,
    selectSessionTab,
    startSessionRename,
  };
}
