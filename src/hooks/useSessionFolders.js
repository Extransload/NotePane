import {
  useCallback,
  useRef,
  useState,
} from "react";
import { DEFAULT_FOLDER_NAME } from "../model/folders.js";

/**
 * The tabs sidebar's folder interactions: renaming a folder in place on its
 * header, creating one (from the New folder row or a tab's menu) and starting
 * its rename, opening a header's menu, and dropping a dragged tab on a header
 * to move it into that folder. The folders themselves live in useSessionList.
 */
export function useSessionFolders({
  cancelSessionTabReorder,
  draggingSessionNoteId,
  onCreateFolder,
  onMoveNoteToFolder,
  onRenameFolder,
  openOverlay,
}) {
  const [editingFolderId, setEditingFolderId] = useState(null);
  const [draftFolderName, setDraftFolderName] = useState("");
  const [folderDropTargetId, setFolderDropTargetId] = useState(null);
  // Enter commits and unmounts the field, and its blur may still arrive; the ref
  // lets only the first of the two commit.
  const editingFolderIdRef = useRef(null);

  const startFolderRename = useCallback((folder) => {
    editingFolderIdRef.current = folder.id;
    setEditingFolderId(folder.id);
    setDraftFolderName(folder.name);
  }, []);

  const cancelFolderRename = useCallback(() => {
    editingFolderIdRef.current = null;
    setEditingFolderId(null);
  }, []);

  const commitFolderRename = useCallback((folderId, name) => {
    if (editingFolderIdRef.current !== folderId) {
      return;
    }
    editingFolderIdRef.current = null;
    setEditingFolderId(null);
    void onRenameFolder(folderId, name);
  }, [onRenameFolder]);

  const createFolderAndRename = useCallback(async () => {
    const folder = await onCreateFolder(DEFAULT_FOLDER_NAME);
    if (folder) {
      startFolderRename(folder);
    }
    return folder;
  }, [onCreateFolder, startFolderRename]);

  // The tab menu's New folder…: the tab moves into the new folder, whose name is
  // then ready to type.
  const moveSessionToNewFolder = useCallback(async (noteId) => {
    const folder = await onCreateFolder(DEFAULT_FOLDER_NAME);
    if (!folder) {
      return;
    }
    await onMoveNoteToFolder(noteId, folder.id);
    startFolderRename(folder);
  }, [onCreateFolder, onMoveNoteToFolder, startFolderRename]);

  const openFolderMenu = useCallback((folder, event) => {
    event.preventDefault();
    openOverlay("folderMenu", {
      folderId: folder.id,
      x: event.clientX,
      y: event.clientY,
    });
  }, [openOverlay]);

  // Only a tab dragged from this sidebar can land on a header, so headers ignore
  // files and text dragged in from elsewhere. These run in the tab list's capture
  // phase and find the header by position: the dragged tab follows the pointer as
  // the order previews and can cover a header, which then gets no drag events. Over
  // a header the drag is a move into that folder, so no reorder previews there.
  const handleFolderDragOverCapture = useCallback((event) => {
    if (!draggingSessionNoteId) {
      return;
    }
    const folderId = folderHeaderAt(event)?.dataset.folderId ?? null;
    setFolderDropTargetId(folderId);
    if (!folderId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  }, [draggingSessionNoteId]);

  // A drop on a header is a move, not a reorder: the tabs go back to the order
  // the drag started from, then the tab joins the folder at its end.
  const handleFolderDropCapture = useCallback(async (event) => {
    const noteId = draggingSessionNoteId;
    const folderId = noteId ? folderHeaderAt(event)?.dataset.folderId : null;
    if (!folderId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setFolderDropTargetId(null);
    await cancelSessionTabReorder();
    await onMoveNoteToFolder(noteId, folderId);
  }, [cancelSessionTabReorder, draggingSessionNoteId, onMoveNoteToFolder]);

  return {
    cancelFolderRename,
    changeDraftFolderName: setDraftFolderName,
    commitFolderRename,
    createFolderAndRename,
    draftFolderName,
    editingFolderId,
    // The highlight ends with the drag, even when the drop lands elsewhere.
    folderDropTargetId: draggingSessionNoteId ? folderDropTargetId : null,
    handleFolderDragOverCapture,
    handleFolderDropCapture,
    moveSessionToNewFolder,
    openFolderMenu,
    startFolderRename,
  };
}

function folderHeaderAt(event) {
  return document.elementsFromPoint(event.clientX, event.clientY)
    .find((element) => element.classList.contains("session-folder-header")) ?? null;
}
