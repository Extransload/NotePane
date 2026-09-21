import {
  isPointInsideElement,
} from "../utils/dom.js";
import {
  getReorderedNoteIdsForDrop,
} from "../utils/sessionTabAnimation.js";
import {
  arraysEqual,
} from "../utils/values.js";
import {
  useCallback,
  useRef,
} from "react";
/**
 * Drag and drop for the session tab strip: reordering tabs within the strip,
 * previewing the drop position, and accepting a session dragged in from
 * another window. The drag bookkeeping refs live here because nothing
 * outside this interaction reads them.
 */
export function useSessionTabDrag({
  detachSessionNote,
  draggingSessionNoteId,
  normalizedLayoutMode,
  onAttachNote,
  reorderSessionNotes,
  sessionTabRowsRef,
  setDraggingSessionNoteId,
  visibleSessionNoteIds,
}) {
  const dragOriginalSessionOrderRef = useRef(null);
  const dragPreviewSessionOrderRef = useRef(null);
  const dragHasReorderedRef = useRef(false);
  const dragDroppedInsideRef = useRef(false);

  const startSessionTabDrag = useCallback(
    (sessionNote, event) => {
      if (normalizedLayoutMode !== "tabs" || sessionNote.detached) {
        return;
      }

      dragOriginalSessionOrderRef.current = visibleSessionNoteIds;
      dragPreviewSessionOrderRef.current = visibleSessionNoteIds;
      dragHasReorderedRef.current = false;
      dragDroppedInsideRef.current = false;
      setDraggingSessionNoteId(sessionNote.id);
      event.dataTransfer?.setData("application/x-notepane-note", sessionNote.id);
      event.dataTransfer?.setData("application/x-notepane-session-reorder", sessionNote.id);
      event.dataTransfer.effectAllowed = "move";
    },
    [normalizedLayoutMode, visibleSessionNoteIds],
  );

  const previewSessionTabReorder = useCallback(
    (sourceNoteId, targetNoteId, insertionSide = "before") => {
      if (!sourceNoteId || !targetNoteId || sourceNoteId === targetNoteId) {
        return;
      }

      const nextOrder = getReorderedNoteIdsForDrop(
        visibleSessionNoteIds,
        sourceNoteId,
        targetNoteId,
        insertionSide,
      );
      if (arraysEqual(nextOrder, visibleSessionNoteIds)) {
        return;
      }

      dragHasReorderedRef.current = true;
      dragPreviewSessionOrderRef.current = nextOrder;
      void reorderSessionNotes(nextOrder, { persist: false });
    },
    [reorderSessionNotes, visibleSessionNoteIds],
  );

  const handleSessionTabDragOver = useCallback(
    (sessionNote, event) => {
      const sourceNoteId = draggingSessionNoteId ??
        event.dataTransfer?.getData("application/x-notepane-session-reorder");
      if (!sourceNoteId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      const rect = event.currentTarget.getBoundingClientRect();
      previewSessionTabReorder(
        sourceNoteId,
        sessionNote.id,
        event.clientY > rect.top + rect.height / 2 ? "after" : "before",
      );
    },
    [draggingSessionNoteId, previewSessionTabReorder],
  );

  const handleSessionTabsDragOver = useCallback(
    (event) => {
      const sourceNoteId = draggingSessionNoteId ??
        event.dataTransfer?.getData("application/x-notepane-session-reorder");
      if (!sourceNoteId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      const firstNoteId = visibleSessionNoteIds[0];
      const lastNoteId = visibleSessionNoteIds.at(-1);
      const firstRow = firstNoteId ? sessionTabRowsRef.current.get(firstNoteId) : null;
      const lastRow = lastNoteId ? sessionTabRowsRef.current.get(lastNoteId) : null;

      if (firstNoteId && firstRow && event.clientY < firstRow.getBoundingClientRect().top) {
        previewSessionTabReorder(sourceNoteId, firstNoteId, "before");
        return;
      }

      if (lastNoteId && lastRow && event.clientY > lastRow.getBoundingClientRect().bottom) {
        previewSessionTabReorder(sourceNoteId, lastNoteId, "after");
      }
    },
    [draggingSessionNoteId, previewSessionTabReorder, visibleSessionNoteIds],
  );

  const dropSessionTab = useCallback(
    async (event) => {
      const sourceNoteId = draggingSessionNoteId ??
        event.dataTransfer?.getData("application/x-notepane-session-reorder");
      if (!sourceNoteId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragDroppedInsideRef.current = true;
      if (dragHasReorderedRef.current) {
        await reorderSessionNotes(dragPreviewSessionOrderRef.current ?? visibleSessionNoteIds, {
          persist: true,
        });
      }
    },
    [draggingSessionNoteId, reorderSessionNotes, visibleSessionNoteIds],
  );

  const endSessionTabDrag = useCallback(
    async (sessionNote, event) => {
      const droppedInside = dragDroppedInsideRef.current;
      const originalOrder = dragOriginalSessionOrderRef.current;
      const previewOrder = dragPreviewSessionOrderRef.current;
      const hasReordered = dragHasReorderedRef.current;
      const endedInsideSessionTabs = isPointInsideElement(
        event,
        document.querySelector(".session-tabs"),
      );
      dragOriginalSessionOrderRef.current = null;
      dragPreviewSessionOrderRef.current = null;
      dragHasReorderedRef.current = false;
      dragDroppedInsideRef.current = false;
      setDraggingSessionNoteId(null);

      if (!droppedInside && hasReordered) {
        if (endedInsideSessionTabs && previewOrder) {
          await reorderSessionNotes(previewOrder, { persist: true });
        } else if (originalOrder) {
          await reorderSessionNotes(originalOrder, { persist: false });
        }
      }

      if (!droppedInside && !endedInsideSessionTabs) {
        await detachSessionNote(sessionNote, event);
      }
    },
    [detachSessionNote, reorderSessionNotes],
  );

  const attachDraggedNote = useCallback(
    async (event) => {
      if (event.dataTransfer?.types.includes("application/x-notepane-session-reorder")) {
        return;
      }

      const noteId = event.dataTransfer?.getData("application/x-notepane-note");
      if (!noteId) {
        return;
      }

      event.preventDefault();
      await onAttachNote(noteId);
    },
    [onAttachNote],
  );

  return {
    attachDraggedNote,
    dropSessionTab,
    endSessionTabDrag,
    handleSessionTabDragOver,
    handleSessionTabsDragOver,
    previewSessionTabReorder,
    startSessionTabDrag,
  };
}
