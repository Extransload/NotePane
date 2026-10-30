import {
  cutBlocks,
  resolveBlocksForCut,
  resolveBlocksForMenuBlock,
} from "../editor/blocks.js";
import {
  createBlockSetSelection,
} from "../editor/blockSelection.js";
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
  finishActiveTableColumnResize,
  previewActiveTableColumnResize,
  startActiveTableColumnResize,
} from "../editor/tableColumnSizing.js";
import { deleteTableHandleLine } from "../editor/tableLineDelete.js";
import {
  hasEditorRangeSelection,
  isDragHandleMenuTarget,
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
  isInsideDialog,
  isVisibleElement,
} from "../utils/dom.js";
import {
  SideMenuExtension,
} from "@blocknote/core/extensions";
import {
  mergeCells,
  splitCell,
} from "prosemirror-tables";
import {
  hasPlatformModifier,
} from "../model/keyboardShortcuts.js";
import {
  useEffect,
  useRef,
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
  // Read through refs so the listeners register once; re-registering them
  // moves them behind listeners added later, which changes who sees a key first.
  const stateRef = useRef({ activeImageBlockId, isEditorActive, recentEditorColors, scheduleSave, updateFocusedTableCell });
  useEffect(() => {
    stateRef.current = { activeImageBlockId, isEditorActive, recentEditorColors, scheduleSave, updateFocusedTableCell };
  }, [activeImageBlockId, isEditorActive, recentEditorColors, scheduleSave, updateFocusedTableCell]);

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

      if (!hasPlatformModifier(event) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const isRepeatRecentColorShortcut = key === "h" && event.shiftKey;
      // Only a plain Mod+X cuts the block; Mod+Shift+X is not a cut.
      const isCutShortcut = key === "x" && !event.shiftKey;
      if (key !== "a" && !isCutShortcut && !isRepeatRecentColorShortcut) {
        return;
      }

      if (isEditableFormTarget(event.target)) {
        return;
      }

      // The open six-dot menu holds focus outside the editor and stands for its
      // block. The side menu stays frozen on that block while the menu is open,
      // but the handle-click hint ends at any click or plain key in the menu, so
      // the block comes from the side menu and never from the caret.
      if (isCutShortcut && isDragHandleMenuTarget(event.target)) {
        event.preventDefault();
        const sideMenu = editor.getExtension(SideMenuExtension);
        const blocks = resolveBlocksForMenuBlock(editor, sideMenu?.store.state?.block?.id);
        void cutBlocks(editor, blocks, stateRef.current.scheduleSave)
          .catch(() => {
            // The block can change while the clipboard write is pending; the
            // menu still has to close.
          })
          .finally(() => {
            editor.domElement?.removeAttribute("data-notepane-handle-block-id");
            sideMenu?.unfreezeMenu();
            editor.focus();
          });
        return;
      }

      const isEditorTarget = stateRef.current.isEditorActive && isEditorShortcutTarget(event.target);
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
        const recentColor = stateRef.current.recentEditorColors[0];
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

      const blocksToCut = resolveBlocksForCut(editor, stateRef.current.activeImageBlockId);
      if (blocksToCut.length === 0) {
        return;
      }
      event.preventDefault();
      void cutBlocks(editor, blocksToCut, stateRef.current.scheduleSave);
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

      // Tab outside the editor is blocked so it cannot wander from the body or the
      // window chrome (sidebar, header, toolbars) into chrome controls. The
      // exceptions are form fields and anything inside a dialog (Preferences, crop,
      // sticky settings, search palette, colour panel): there Tab keeps its normal
      // meaning and moves between the dialog's own controls.
      if (!isEditorShortcutTarget(event.target)) {
        if (isInsideDialog(event.target)) {
          return;
        }
        if (!isEditableFormTarget(event.target)) {
          event.preventDefault();
          if (stateRef.current.isEditorActive) {
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

      // Escape from selected cells selects the table block, as in Notion. The editor keeps focus,
      // so Cmd+Z works straight away, after a row or column handle action too.
      if (selection?.$anchorCell && selection?.$headCell) {
        event.preventDefault();
        event.stopPropagation();
        const { $anchorCell } = selection;
        let depth = $anchorCell.depth;
        while (depth > 0 && $anchorCell.node(depth).type.name !== "blockContainer") {
          depth -= 1;
        }
        const tableBlock = createBlockSetSelection(view.state.doc, [$anchorCell.node(depth).attrs.id]);
        if (tableBlock) {
          view.dispatch(view.state.tr.setSelection(tableBlock));
        }
        setIsTableCellSelectionDismissed(true);
        setIsEditorActive(true);
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
        !hasPlatformModifier(event) ||
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
        window.requestAnimationFrame(() => stateRef.current.updateFocusedTableCell());
      }
    };

    // Window capture listeners run before prosemirror-tables' own drag handlers.
    const handleTableColumnResizeMouseDownCapture = (event) => {
      startActiveTableColumnResize(editor, event);
    };

    const handleTableColumnResizeMouseMoveCapture = (event) => {
      if (previewActiveTableColumnResize(editor, event)) {
        window.requestAnimationFrame(() => stateRef.current.updateFocusedTableCell());
      }
    };

    const handleTableColumnResizeMouseUpCapture = (event) => {
      if (finishActiveTableColumnResize(editor, event)) {
        window.requestAnimationFrame(() => stateRef.current.updateFocusedTableCell());
      }
    };

    // With a table handle's menu open, Delete or Backspace removes its row or column, whether the
    // editor or the menu has focus.
    const handleTableLineDeleteKeyDownCapture = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const inEditor = Boolean(target && editor.prosemirrorView?.dom.contains(target));
      const inHandleMenu = Boolean(
        target?.closest(".bn-table-handle-menu") && !target.closest("input, textarea"),
      );
      if (
        (event.key !== "Delete" && event.key !== "Backspace") ||
        event.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        (!inEditor && !inHandleMenu)
      ) {
        return;
      }
      if (deleteTableHandleLine(editor)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleTableLineDeleteKeyDownCapture, true);
    document.addEventListener("keydown", handleEditorKeyDownCapture, true);
    document.addEventListener("keydown", handleTextSelectionToolbarEscape, true);
    document.addEventListener("keydown", handleTableCellArrowKeyDownCapture, true);
    document.addEventListener("keydown", handleTableCellModeEscapeKeyDownCapture, true);
    document.addEventListener("keydown", handleTableCellMergeSplitKeyDownCapture, true);
    document.addEventListener("dblclick", handleTableColumnDoubleClickCapture, true);
    window.addEventListener("mousedown", handleTableColumnResizeMouseDownCapture, true);
    window.addEventListener("mousemove", handleTableColumnResizeMouseMoveCapture, true);
    window.addEventListener("mouseup", handleTableColumnResizeMouseUpCapture, true);
    document.addEventListener("keydown", handleEditorTabKeyDown);
    return () => {
      document.removeEventListener("keydown", handleTableLineDeleteKeyDownCapture, true);
      document.removeEventListener("keydown", handleEditorKeyDownCapture, true);
      document.removeEventListener("keydown", handleTextSelectionToolbarEscape, true);
      document.removeEventListener("keydown", handleTableCellArrowKeyDownCapture, true);
      document.removeEventListener("keydown", handleTableCellModeEscapeKeyDownCapture, true);
      document.removeEventListener("keydown", handleTableCellMergeSplitKeyDownCapture, true);
      document.removeEventListener("dblclick", handleTableColumnDoubleClickCapture, true);
      window.removeEventListener("mousedown", handleTableColumnResizeMouseDownCapture, true);
      window.removeEventListener("mousemove", handleTableColumnResizeMouseMoveCapture, true);
      window.removeEventListener("mouseup", handleTableColumnResizeMouseUpCapture, true);
      document.removeEventListener("keydown", handleEditorTabKeyDown);
    };
  }, [editor, setIsEditorActive, setIsTableCellSelectionDismissed]);
}
