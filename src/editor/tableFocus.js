import { createExtension } from "@blocknote/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { columnResizingPluginKey } from "prosemirror-tables";
import {
  getCellSelectionEdgeDecorations,
  getCurrentTableCellRange,
  getFocusedTableCellSnapshot,
  getTableCellElementForSnapshot,
  restoreFocusedTableCell,
} from "./selection.js";

// Set by the Escape that leaves nothing selected (src/hooks/useEditorSurfaceShortcuts.js) until the
// selection or the document changes, so the caret it leaves in a table cell draws no focus ring.
export const selectionDismissedKey = new PluginKey("notepaneSelectionDismissed");

export const SelectionDismissed = createExtension(() => ({
  key: "notepane-selection-dismissed",
  prosemirrorPlugins: [
    new Plugin({
      key: selectionDismissedKey,
      state: {
        init: () => false,
        apply: (tr, isDismissed) => tr.getMeta(selectionDismissedKey)
          ?? (tr.selectionSet || tr.docChanged ? false : isDismissed),
      },
    }),
  ],
}))();

/**
 * Marks the table cell holding the caret with `notepane-table-cell-focused` and draws the
 * outline of a cell range, as the editor view's decorations. The decorations function is kept in
 * `focusedTableDecorationsRef` so a pointer gesture can lift it and put it back. Returns the
 * function that removes it, or undefined when the view is gone.
 */
export function installFocusedTableCellDecorations(editor, {
  focusedTableDecorationsRef,
  pendingTableExtensionFocusRef,
  suppressFocusedTableCellRef,
}) {
  const view = editor.prosemirrorView;
  if (!view || view.isDestroyed) {
    return undefined;
  }
  const decorations = (state) => {
    const rangeDecorations = getCellSelectionEdgeDecorations(state);
    if (
      suppressFocusedTableCellRef.current ||
      selectionDismissedKey.getState(state) ||
      columnResizingPluginKey.getState(state)?.dragging
    ) {
      return DecorationSet.create(state.doc, rangeDecorations);
    }
    const selection = state.selection;
    const isSingleCellSelection = Boolean(
      selection.$anchorCell &&
        selection.$headCell &&
        selection.$anchorCell.pos === selection.$headCell.pos,
    );
    if (!selection.empty && !isSingleCellSelection && !pendingTableExtensionFocusRef.current) {
      return DecorationSet.create(state.doc, rangeDecorations);
    }
    const preservedCell = pendingTableExtensionFocusRef.current
      ? getTableCellElementForSnapshot(editor, pendingTableExtensionFocusRef.current)
      : null;
    const preservedRange = preservedCell
      ? getCurrentTableCellRange({
          $from: state.doc.resolve(view.posAtDOM(preservedCell, 0)),
        })
      : null;
    const cellRange = preservedRange || getCurrentTableCellRange(selection);
    const cellNode = cellRange ? state.doc.nodeAt(cellRange.cellPos) : null;
    if (!cellRange || !cellNode) {
      return DecorationSet.create(state.doc, rangeDecorations);
    }
    return DecorationSet.create(state.doc, [
      Decoration.node(
        cellRange.cellPos,
        cellRange.cellPos + cellNode.nodeSize,
        { class: "notepane-table-cell-focused" },
      ),
      ...rangeDecorations,
    ]);
  };
  focusedTableDecorationsRef.current = decorations;
  view.setProps({ decorations });
  return () => {
    if (!view.isDestroyed) {
      view.setProps({ decorations: undefined });
    }
    focusedTableDecorationsRef.current = null;
  };
}

/**
 * Keeps the focused cell where it was when a table's add or remove row or column button is used,
 * calling `onRestore` once the cell is focused again. Returns the function that removes the
 * listeners.
 */
export function installTableExtensionFocusRestore(editor, {
  onRestore,
  pendingTableExtensionFocusRef,
}) {
  const isTableExtensionButton = (target) => (
    target instanceof Element && target.closest(
      ".bn-extend-button-add-remove-columns, .bn-extend-button-add-remove-rows",
    )
  );
  const captureFocusedCellBeforeTableExtension = (event) => {
    if (!isTableExtensionButton(event.target)) {
      return;
    }

    pendingTableExtensionFocusRef.current = getFocusedTableCellSnapshot(editor);
  };
  const restoreFocusedCellAfterTableExtension = () => {
    const pendingSnapshot = pendingTableExtensionFocusRef.current;
    if (!pendingSnapshot) {
      return;
    }

    window.requestAnimationFrame(() => {
      const snapshot = pendingTableExtensionFocusRef.current;
      pendingTableExtensionFocusRef.current = null;
      if (snapshot && restoreFocusedTableCell(editor, snapshot)) {
        onRestore();
      }
    });
  };

  const handleTableExtensionMouseUp = () => {
    restoreFocusedCellAfterTableExtension();
  };
  const handleTableExtensionClick = (event) => {
    if (!(event.target instanceof Element) || !event.target.closest(
      ".bn-extend-button-add-remove-columns, .bn-extend-button-add-remove-rows",
    )) {
      return;
    }
    restoreFocusedCellAfterTableExtension();
  };

  document.addEventListener("mousedown", captureFocusedCellBeforeTableExtension, true);
  document.addEventListener("mouseup", handleTableExtensionMouseUp, true);
  document.addEventListener("click", handleTableExtensionClick, true);
  return () => {
    document.removeEventListener("mousedown", captureFocusedCellBeforeTableExtension, true);
    document.removeEventListener("mouseup", handleTableExtensionMouseUp, true);
    document.removeEventListener("click", handleTableExtensionClick, true);
  };
}
