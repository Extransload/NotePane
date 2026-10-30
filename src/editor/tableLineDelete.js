import { CellSelection } from "prosemirror-tables";

// An open table handle menu has its row or column selected (src/editor/tableHandles.jsx), and the
// keys work its own Delete item, so they remove, undo and close exactly as the item does. Cells
// selected some other way, even a whole row of them, keep having their contents cleared.
export function deleteTableHandleLine(editor) {
  const selection = editor?.prosemirrorView?.state.selection;
  if (
    !(selection instanceof CellSelection) ||
    !(selection.isRowSelection() || selection.isColSelection())
  ) {
    return false;
  }
  const menuDelete = [...document.querySelectorAll(".bn-table-handle-menu [role='menuitem']")]
    .find((item) => !item.closest("[inert]") && item.textContent.trim() === "Delete");
  if (!menuDelete) {
    return false;
  }
  menuDelete.click();
  return true;
}
