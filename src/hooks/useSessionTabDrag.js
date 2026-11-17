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
  useMemo,
  useRef,
} from "react";
/**
 * Drag and drop for the session tab strip: reordering tabs and previewing the drop position.
 * A tab dragged over a tab of another group (the ungrouped tabs or a folder) joins that group,
 * shown at once and stored on the drop; above the first tab it leaves its folder. A cancelled
 * drag puts the order and the folder back. The drag bookkeeping refs live here because nothing
 * outside this interaction reads them.
 */
export function useSessionTabDrag({
  draggingSessionNoteId,
  normalizedLayoutMode,
  onMoveNoteToFolder,
  onPreviewNoteFolder,
  reorderSessionNotes,
  sessionGrouping,
  sessionTabRowsRef,
  setDraggingSessionNoteId,
  visibleSessionNoteIds,
}) {
  const dragOriginalSessionOrderRef = useRef(null);
  const dragPreviewSessionOrderRef = useRef(null);
  const dragHasReorderedRef = useRef(false);
  const dragDroppedInsideRef = useRef(false);
  // { noteId, folderId }: the dragged session's folder when the drag started.
  const dragOriginalFolderRef = useRef(null);
  const endSessionTabDragRef = useRef(null);

  // The group each session shows in: its folder's id, or null for the ungrouped tabs.
  const groupIdByNoteId = useMemo(() => {
    const groups = new Map(sessionGrouping.ungrouped.map((sessionNote) => [sessionNote.id, null]));
    for (const section of sessionGrouping.sections) {
      for (const sessionNote of section.notes) {
        groups.set(sessionNote.id, section.folder.id);
      }
    }
    return groups;
  }, [sessionGrouping]);

  const startSessionTabDrag = useCallback(
    (sessionNote, event) => {
      if (normalizedLayoutMode !== "tabs") {
        return;
      }

      dragOriginalSessionOrderRef.current = visibleSessionNoteIds;
      dragPreviewSessionOrderRef.current = visibleSessionNoteIds;
      dragHasReorderedRef.current = false;
      dragDroppedInsideRef.current = false;
      dragOriginalFolderRef.current = {
        noteId: sessionNote.id,
        folderId: groupIdByNoteId.get(sessionNote.id) ?? null,
      };
      setDraggingSessionNoteId(sessionNote.id);
      event.dataTransfer?.setData("application/x-notepane-session-reorder", sessionNote.id);
      event.dataTransfer.effectAllowed = "move";
      // A tab that changes group is drawn again in its new group, and the browser still sends
      // dragend to the row the drag started on, now out of the page, where React's listener at
      // the root never hears it. A listener on that row itself does.
      event.currentTarget.addEventListener(
        "dragend",
        (dragEndEvent) => void endSessionTabDragRef.current?.(dragEndEvent),
        { once: true },
      );
    },
    [groupIdByNoteId, normalizedLayoutMode, visibleSessionNoteIds],
  );

  // Shows the dragged tab in `folderId`'s group. The order follows on the next dragover, once
  // the tab is drawn in its new group (a reorder is kept within each group).
  const previewSessionFolder = useCallback(
    (sourceNoteId, folderId) => {
      if (!groupIdByNoteId.has(sourceNoteId) || groupIdByNoteId.get(sourceNoteId) === folderId) {
        return false;
      }
      onPreviewNoteFolder?.(sourceNoteId, folderId);
      return true;
    },
    [groupIdByNoteId, onPreviewNoteFolder],
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
      if (sessionNote.id !== sourceNoteId
        && previewSessionFolder(sourceNoteId, groupIdByNoteId.get(sessionNote.id) ?? null)) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      previewSessionTabReorder(
        sourceNoteId,
        sessionNote.id,
        event.clientY > rect.top + rect.height / 2 ? "after" : "before",
      );
    },
    [draggingSessionNoteId, groupIdByNoteId, previewSessionFolder, previewSessionTabReorder],
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

      // Above the first tab is the top of the ungrouped tabs, out of any folder.
      if (firstNoteId && firstRow && event.clientY < firstRow.getBoundingClientRect().top) {
        if (!previewSessionFolder(sourceNoteId, null)) {
          previewSessionTabReorder(sourceNoteId, firstNoteId, "before");
        }
        return;
      }

      if (lastNoteId && lastRow && event.clientY > lastRow.getBoundingClientRect().bottom) {
        if (!previewSessionFolder(sourceNoteId, groupIdByNoteId.get(lastNoteId) ?? null)) {
          previewSessionTabReorder(sourceNoteId, lastNoteId, "after");
        }
      }
    },
    [
      draggingSessionNoteId,
      groupIdByNoteId,
      previewSessionFolder,
      previewSessionTabReorder,
      sessionTabRowsRef,
      visibleSessionNoteIds,
    ],
  );

  // Stores where the drag left the tab: its new folder first, as the store puts a session that
  // changes group at the group's end, then the order on screen.
  const storeDraggedSession = useCallback(
    async (previewOrder) => {
      const original = dragOriginalFolderRef.current;
      const folderId = original ? groupIdByNoteId.get(original.noteId) ?? null : null;
      if (original && folderId !== original.folderId) {
        await onMoveNoteToFolder?.(original.noteId, folderId);
        await reorderSessionNotes(previewOrder ?? visibleSessionNoteIds, { persist: true });
        return;
      }
      if (dragHasReorderedRef.current) {
        await reorderSessionNotes(previewOrder ?? visibleSessionNoteIds, { persist: true });
      }
    },
    [groupIdByNoteId, onMoveNoteToFolder, reorderSessionNotes, visibleSessionNoteIds],
  );

  const restoreDraggedSessionFolder = useCallback(() => {
    const original = dragOriginalFolderRef.current;
    if (original && (groupIdByNoteId.get(original.noteId) ?? null) !== original.folderId) {
      onPreviewNoteFolder?.(original.noteId, original.folderId);
    }
  }, [groupIdByNoteId, onPreviewNoteFolder]);

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
      await storeDraggedSession(dragPreviewSessionOrderRef.current);
    },
    [draggingSessionNoteId, storeDraggedSession],
  );

  // A drop that is not a reorder, such as a tab dropped on a folder header,
  // first puts the tabs back in the order and folder the drag started from. Marking the drop
  // as handled keeps the drag's end from saving the abandoned preview.
  const cancelSessionTabReorder = useCallback(async () => {
    const originalOrder = dragOriginalSessionOrderRef.current;
    const hasReordered = dragHasReorderedRef.current;
    dragDroppedInsideRef.current = true;
    dragHasReorderedRef.current = false;
    restoreDraggedSessionFolder();
    dragOriginalFolderRef.current = null;
    if (hasReordered && originalOrder) {
      await reorderSessionNotes(originalOrder, { persist: false });
    }
  }, [reorderSessionNotes, restoreDraggedSessionFolder]);

  const endSessionTabDrag = useCallback(
    async (event) => {
      const droppedInside = dragDroppedInsideRef.current;
      const originalOrder = dragOriginalSessionOrderRef.current;
      const previewOrder = dragPreviewSessionOrderRef.current;
      const original = dragOriginalFolderRef.current;
      const hasChangedFolder = Boolean(original)
        && (groupIdByNoteId.get(original.noteId) ?? null) !== original.folderId;
      const hasReordered = dragHasReorderedRef.current;
      const endedInsideSessionTabs = isPointInsideElement(
        event,
        document.querySelector(".session-tabs"),
      );
      setDraggingSessionNoteId(null);

      if (!droppedInside && (hasReordered || hasChangedFolder)) {
        if (endedInsideSessionTabs) {
          await storeDraggedSession(previewOrder);
        } else {
          restoreDraggedSessionFolder();
          if (originalOrder) {
            await reorderSessionNotes(originalOrder, { persist: false });
          }
        }
      }
      dragOriginalSessionOrderRef.current = null;
      dragPreviewSessionOrderRef.current = null;
      dragHasReorderedRef.current = false;
      dragDroppedInsideRef.current = false;
      dragOriginalFolderRef.current = null;
    },
    [groupIdByNoteId, reorderSessionNotes, restoreDraggedSessionFolder, storeDraggedSession],
  );
  endSessionTabDragRef.current = endSessionTabDrag;

  return {
    cancelSessionTabReorder,
    dropSessionTab,
    handleSessionTabDragOver,
    handleSessionTabsDragOver,
    previewSessionTabReorder,
    startSessionTabDrag,
  };
}
