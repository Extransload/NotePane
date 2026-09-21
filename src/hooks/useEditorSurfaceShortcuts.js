import {
  cutCurrentBlocks,
} from "../editor/blocks.js";
import {
  applyEditorColor,
} from "../editor/colorFormatting.jsx";
import {
  getCurrentTableCellRange,
  hasVisibleTextSelection,
  isCurrentTableCellContentSelected,
  isCurrentTableFullySelected,
  isCurrentTableSelection,
  moveSelectedTableCell,
  moveTableTextCursorToAdjacentCell,
  selectAllBlocks,
  selectCurrentCodeBlockContent,
  selectCurrentTable,
  selectCurrentTableCell,
  selectCurrentTableCellContent,
} from "../editor/selection.js";
import {
  autoFitActiveTableColumn,
  previewActiveTableColumnResize,
} from "../editor/tableColumnSizing.js";
import {
  hasEditorRangeSelection,
  isEditorShortcutTarget,
  isSelectionInsideCodeBlock,
} from "../editor/targets.js";
import {
  handleToggleBackspace,
  handleToggleEnter,
  handleToggleSpace,
} from "../editor/toggleKeyboard.js";
import {
  isEditableFormTarget,
  isVisibleElement,
} from "../utils/dom.js";
import {
  mergeCells,
  splitCell,
} from "prosemirror-tables";
import {
  useEffect,
} from "react";
/**
 * Every capture-phase handler that the editor surface needs: toggle-list keys,
 * table cell navigation and merge/split, the text selection toolbar escape,
 * column auto-fit on double click, and Tab handling. They are registered as a
 * single unit so their capture order stays fixed.
 */
export function useEditorSurfaceShortcuts({
  activeImageBlockId,
  editor,
  isEditorActive,
  recentEditorColors,
  scheduleSave,
  setIsEditorActive,
  setIsTableCellSelectionDismissed,
  updateFocusedTableCell,
}) {
  useEffect(() => {
    const handleEditorKeyDownCapture = (event) => {
      if (
        isEditorShortcutTarget(event.target) &&
        handleToggleBackspace(editor, event)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setIsEditorActive(true);
        return;
      }

      if (
        isEditorShortcutTarget(event.target) &&
        handleToggleEnter(editor, event)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setIsEditorActive(true);
        return;
      }

      if (
        event.key === " " &&
        !(event.metaKey || event.ctrlKey || event.altKey) &&
        !isEditableFormTarget(event.target) &&
        isEditorShortcutTarget(event.target) &&
        handleToggleSpace(editor, event)
      ) {
        event.preventDefault();
        setIsEditorActive(true);
        return;
      }

      if (event.key === "Tab") {
        if (isEditorShortcutTarget(event.target)) {
          setIsEditorActive(true);
          if (event.isComposing) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          if (moveTableTextCursorToAdjacentCell(editor, event.shiftKey ? -1 : 1)) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const isRepeatRecentColorShortcut = key === "h" && event.shiftKey;
      if (key !== "a" && key !== "x" && !isRepeatRecentColorShortcut) {
        return;
      }

      if (isEditableFormTarget(event.target)) {
        return;
      }

      const isEditorTarget = isEditorActive && isEditorShortcutTarget(event.target);
      if (!isEditorTarget) {
        if (isRepeatRecentColorShortcut) {
          return;
        }
        if (!isEditableFormTarget(event.target)) {
          event.preventDefault();
        }
        return;
      }

      if (isRepeatRecentColorShortcut) {
        event.preventDefault();
        const recentColor = recentEditorColors[0];
        if (recentColor && hasEditorRangeSelection(editor)) {
          applyEditorColor(editor, recentColor);
          setIsEditorActive(true);
        }
        return;
      }

      if (key === "a") {
        event.preventDefault();
        if (isCurrentTableSelection(editor)) {
          if (isCurrentTableFullySelected(editor)) {
            selectAllBlocks(editor);
          } else {
            selectCurrentTable(editor);
          }
          return;
        }
        const tableCellRange = getCurrentTableCellRange(
          editor.prosemirrorView?.state.selection,
        );
        if (tableCellRange) {
          if (isCurrentTableCellContentSelected(editor, tableCellRange)) {
            selectCurrentTableCell(editor);
          } else {
            selectCurrentTableCellContent(editor);
          }
          return;
        }
        if (isSelectionInsideCodeBlock(editor)) {
          selectCurrentCodeBlockContent(editor);
          return;
        }
        selectAllBlocks(editor);
        return;
      }

      if (hasVisibleTextSelection()) {
        return;
      }

      event.preventDefault();
      void cutCurrentBlocks(editor, activeImageBlockId, scheduleSave);
    };

    const handleTextSelectionToolbarEscape = (event) => {
      if (
        event.key !== "Escape" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        !isEditorShortcutTarget(event.target) ||
        editor.prosemirrorView?.state.selection.empty ||
        editor.prosemirrorView?.state.selection.$anchorCell ||
        !isVisibleElement(document.querySelector(".bn-formatting-toolbar"))
      ) {
        return;
      }

      window.requestAnimationFrame(() => {
        if (!isVisibleElement(document.querySelector(".bn-formatting-toolbar"))) {
          editor.focus();
          setIsEditorActive(true);
        }
      });
    };

    const handleEditorTabKeyDown = (event) => {
      if (event.key !== "Tab") {
        return;
      }

      if (!isEditorShortcutTarget(event.target)) {
        if (!isEditableFormTarget(event.target)) {
          event.preventDefault();
          if (isEditorActive) {
            editor.focus();
          }
        }
        return;
      }

      setIsEditorActive(true);
      if (!event.defaultPrevented) {
        event.preventDefault();
      }
      window.requestAnimationFrame(() => {
        if (!isEditorShortcutTarget(document.activeElement)) {
          editor.focus();
        }
      });
    };

    const handleTableCellArrowKeyDownCapture = (event) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        !isEditorShortcutTarget(event.target)
      ) {
        return;
      }

      if (moveSelectedTableCell(editor, event.key)) {
        event.preventDefault();
        event.stopPropagation();
        setIsEditorActive(true);
      }
    };

    const handleTableCellModeEscapeKeyDownCapture = (event) => {
      const view = editor.prosemirrorView;
      const selection = view?.state.selection;
      if (
        event.key !== "Escape" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        !isEditorShortcutTarget(event.target)
      ) {
        return;
      }

      if (selection?.$anchorCell && selection?.$headCell) {
        event.preventDefault();
        event.stopPropagation();
        view.dom.blur();
        setIsTableCellSelectionDismissed(true);
        setIsEditorActive(false);
        return;
      }

      if (!selection?.empty) {
        return;
      }

      if (selectCurrentTableCell(editor)) {
        event.preventDefault();
        event.stopPropagation();
        setIsEditorActive(true);
      }
    };

    const handleTableCellMergeSplitKeyDownCapture = (event) => {
      if (
        event.key.toLowerCase() !== "m" ||
        !(event.metaKey || event.ctrlKey) ||
        !event.shiftKey ||
        event.altKey ||
        !isEditorShortcutTarget(event.target)
      ) {
        return;
      }

      const view = editor.prosemirrorView;
      const selection = view?.state.selection;
      if (!view || !selection?.$anchorCell || !selection?.$headCell) {
        return;
      }

      const selectedCell = selection.$anchorCell.nodeAfter;
      const isSingleCell = selection.$anchorCell.pos === selection.$headCell.pos;
      const isMergedCell = Boolean(
        selectedCell &&
          (selectedCell.attrs.colspan > 1 || selectedCell.attrs.rowspan > 1),
      );
      const command = isSingleCell && isMergedCell ? splitCell : mergeCells;
      if (command(view.state, view.dispatch)) {
        event.preventDefault();
        event.stopPropagation();
        view.focus();
      }
    };

    const handleTableColumnDoubleClickCapture = (event) => {
      if (
        event.button !== 0 ||
        !isEditorShortcutTarget(event.target) ||
        !(event.target instanceof Element) ||
        !event.target.closest("td, th")
      ) {
        return;
      }

      if (autoFitActiveTableColumn(editor, event.target)) {
        event.preventDefault();
        event.stopPropagation();
        window.requestAnimationFrame(updateFocusedTableCell);
      }
    };

    const handleTableColumnResizeMouseMoveCapture = (event) => {
      if (previewActiveTableColumnResize(editor, event)) {
        window.requestAnimationFrame(updateFocusedTableCell);
      }
    };

    document.addEventListener("keydown", handleEditorKeyDownCapture, true);
    document.addEventListener("keydown", handleTextSelectionToolbarEscape, true);
    document.addEventListener("keydown", handleTableCellArrowKeyDownCapture, true);
    document.addEventListener("keydown", handleTableCellModeEscapeKeyDownCapture, true);
    document.addEventListener("keydown", handleTableCellMergeSplitKeyDownCapture, true);
    document.addEventListener("dblclick", handleTableColumnDoubleClickCapture, true);
    window.addEventListener("mousemove", handleTableColumnResizeMouseMoveCapture, true);
    document.addEventListener("keydown", handleEditorTabKeyDown);
    return () => {
      document.removeEventListener("keydown", handleEditorKeyDownCapture, true);
      document.removeEventListener("keydown", handleTextSelectionToolbarEscape, true);
      document.removeEventListener("keydown", handleTableCellArrowKeyDownCapture, true);
      document.removeEventListener("keydown", handleTableCellModeEscapeKeyDownCapture, true);
      document.removeEventListener("keydown", handleTableCellMergeSplitKeyDownCapture, true);
      document.removeEventListener("dblclick", handleTableColumnDoubleClickCapture, true);
      window.removeEventListener("mousemove", handleTableColumnResizeMouseMoveCapture, true);
      document.removeEventListener("keydown", handleEditorTabKeyDown);
    };
  }, [
    activeImageBlockId,
    editor,
    isEditorActive,
    recentEditorColors,
    scheduleSave,
    updateFocusedTableCell,
  ]);
}
