import {
  size,
} from "@floating-ui/react";
import {
  TextSelection,
} from "@tiptap/pm/state";
import {
  CellSelection,
} from "prosemirror-tables";

export function hasVisibleTextSelection() {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString());
}

export function selectAllBlocks(editor) {
  if (editor.document.length === 0) {
    return;
  }

  selectAllEditorDocument(editor);
  if (hasVisibleTextSelection()) {
    return;
  }

  try {
    editor.focus();
    editor.setSelection(editor.document[0], editor.document[editor.document.length - 1]);
  } catch {
    // Some block types only support the ProseMirror whole-document selection above.
  }
}

export function selectCurrentCodeBlockContent(editor) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  if (!view || !state || !state.selection.$from.parent.type.spec.code) {
    return false;
  }

  const codeBlockStart = state.selection.$from.start();
  const codeBlockEnd = state.selection.$from.end();
  const codeBlockSelection = TextSelection.between(
    state.doc.resolve(codeBlockStart),
    state.doc.resolve(codeBlockEnd),
  );
  view.dispatch(
    state.tr
      .setSelection(codeBlockSelection)
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

export function selectCurrentTableCell(editor) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  const cellRange = getCurrentTableCellRange(state?.selection);
  if (!view || !state || !cellRange) {
    return false;
  }

  view.dispatch(
    state.tr
      .setSelection(CellSelection.create(state.doc, cellRange.cellPos))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

export function selectCurrentTableCellContent(editor) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  const cellRange = getCurrentTableCellRange(state?.selection);
  if (!view || !state || !cellRange) {
    return false;
  }

  view.dispatch(
    state.tr
      .setSelection(TextSelection.between(
        state.doc.resolve(cellRange.from),
        state.doc.resolve(cellRange.to),
      ))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

export function isCurrentTableCellContentSelected(editor, cellRange) {
  const selectedText = window.getSelection()?.toString() ?? "";
  const cellNode = editor.prosemirrorView?.nodeDOM(cellRange.cellPos);
  const cellElement = cellNode instanceof Element
    ? cellNode.closest("td, th")
    : cellNode?.parentElement?.closest("td, th");
  return Boolean(selectedText && selectedText === cellElement?.textContent);
}

export function selectCurrentTable(editor) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  const cellPositions = getCurrentTableCellPositions(state?.selection);
  if (!view || !state || cellPositions.length === 0) {
    return false;
  }

  view.dispatch(
    state.tr
      .setSelection(CellSelection.create(
        state.doc,
        cellPositions[0],
        cellPositions[cellPositions.length - 1],
      ))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

export function isCurrentTableSelection(editor) {
  const selection = editor.prosemirrorView?.state.selection;
  return Boolean(selection?.$anchorCell && selection?.$headCell);
}

export function isCurrentTableFullySelected(editor) {
  const selection = editor.prosemirrorView?.state.selection;
  const cellPositions = getCurrentTableCellPositions(selection);
  return Boolean(
    selection?.$anchorCell &&
      selection?.$headCell &&
      cellPositions.length > 0 &&
      selection.$anchorCell.pos === cellPositions[0] &&
      selection.$headCell.pos === cellPositions[cellPositions.length - 1],
  );
}

export function moveTableTextCursorToAdjacentCell(editor, direction) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  const currentCellRange = getCurrentTableCellRange(state?.selection);
  if (!view || !state || !currentCellRange) {
    return false;
  }

  const cellPositions = getCurrentTableCellPositions(state.selection);
  const currentIndex = cellPositions.indexOf(currentCellRange.cellPos);
  const nextCellPosition = cellPositions[currentIndex + direction];
  if (currentIndex < 0 || typeof nextCellPosition !== "number") {
    return false;
  }

  const nextCellRange = getCurrentTableCellRange({
    $from: state.doc.resolve(nextCellPosition + 1),
  });
  if (!nextCellRange) {
    return false;
  }

  view.dispatch(
    state.tr
      .setSelection(TextSelection.near(state.doc.resolve(nextCellRange.to), -1))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

export function getCurrentTableCellPositions(selection) {
  const $from = selection?.$from;
  if (!$from) {
    return [];
  }

  let tableDepth = null;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.spec.tableRole === "table") {
      tableDepth = depth;
      break;
    }
  }
  if (tableDepth === null) {
    return [];
  }

  const tablePosition = $from.before(tableDepth);
  const cellPositions = [];
  $from.node(tableDepth).descendants((node, position) => {
    const tableRole = node.type.spec.tableRole;
    if (tableRole === "cell" || tableRole === "header_cell") {
      cellPositions.push(tablePosition + position + 1);
    }
  });
  return cellPositions;
}

export function moveSelectedTableCell(editor, key) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  const selection = state?.selection;
  const anchorCell = selection?.$anchorCell;
  const headCell = selection?.$headCell;
  if (
    !view ||
    !state ||
    !anchorCell ||
    !headCell ||
    anchorCell.pos !== headCell.pos
  ) {
    return false;
  }

  const currentNode = view.nodeDOM(anchorCell.pos);
  const currentCell = (currentNode instanceof Element ? currentNode : currentNode?.parentElement)
    ?.closest("td, th");
  const currentRow = currentCell?.parentElement;
  const table = currentCell?.closest("table");
  if (!currentCell || !currentRow || !table) {
    return false;
  }

  const rows = [...table.rows];
  const rowIndex = rows.indexOf(currentRow);
  const cellIndex = [...currentRow.cells].indexOf(currentCell);
  let targetCell = null;
  if (key === "ArrowLeft") {
    targetCell = currentRow.cells[cellIndex - 1] || null;
  } else if (key === "ArrowRight") {
    targetCell = currentRow.cells[cellIndex + 1] || null;
  } else {
    const targetRow = rows[rowIndex + (key === "ArrowUp" ? -1 : 1)];
    targetCell = targetRow?.cells[Math.min(cellIndex, targetRow.cells.length - 1)] || null;
  }
  if (!targetCell) {
    return false;
  }

  const targetPosition = view.posAtDOM(targetCell, 0);
  const targetRange = getCurrentTableCellRange({
    $from: state.doc.resolve(targetPosition),
  });
  if (!targetRange) {
    return false;
  }

  view.dispatch(
    state.tr
      .setSelection(CellSelection.create(state.doc, targetRange.cellPos))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

export function getCurrentTableCellRange(selection) {
  if (!selection) {
    return null;
  }

  const cellAnchor = selection.$anchorCell;
  if (cellAnchor?.nodeAfter?.type.spec.tableRole) {
    const cellNode = cellAnchor.nodeAfter;
    return {
      from: cellAnchor.pos + 1,
      to: cellAnchor.pos + cellNode.nodeSize - 1,
      cellPos: cellAnchor.pos,
    };
  }

  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const tableRole = $from.node(depth).type.spec.tableRole;
    if (tableRole === "cell" || tableRole === "header_cell") {
      return {
        from: $from.start(depth),
        to: $from.end(depth),
        cellPos: $from.before(depth),
      };
    }
  }

  return null;
}

export function getFocusedTableCellSnapshot(editor) {
  const view = editor.prosemirrorView;
  const selection = view?.state.selection;
  const cellRange = getCurrentTableCellRange(selection);
  if (!view || !selection?.empty || !cellRange) {
    return null;
  }

  const cellNode = view.nodeDOM(cellRange.cellPos);
  const cell = (cellNode instanceof Element ? cellNode : cellNode?.parentElement)
    ?.closest("td, th");
  const row = cell?.parentElement;
  const table = cell?.closest("table");
  const block = cell?.closest(".bn-block-outer[data-id]");
  if (!(row instanceof HTMLTableRowElement) || !table || !block?.dataset.id) {
    return null;
  }

  const rowIndex = Array.prototype.indexOf.call(table.rows, row);
  if (rowIndex < 0 || cell.cellIndex < 0) {
    return null;
  }

  return {
    blockId: block.dataset.id,
    rowIndex,
    columnIndex: cell.cellIndex,
  };
}

export function restoreFocusedTableCell(editor, snapshot) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  if (!view || !state) {
    return false;
  }

  const targetCell = getTableCellElementForSnapshot(editor, snapshot);
  if (!targetCell) {
    return false;
  }

  const cellPosition = view.posAtDOM(targetCell, 0);
  const cellRange = getCurrentTableCellRange({
    $from: state.doc.resolve(cellPosition),
  });
  if (!cellRange) {
    return false;
  }

  view.dispatch(
    state.tr
      .setSelection(TextSelection.near(state.doc.resolve(cellRange.to), -1))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

export function getTableCellElementForSnapshot(editor, snapshot) {
  const block = editor.prosemirrorView?.dom.querySelector(
    `.bn-block-outer[data-id="${CSS.escape(snapshot.blockId)}"]`,
  );
  const cell = block?.querySelector("table")?.rows[snapshot.rowIndex]
    ?.cells[snapshot.columnIndex];
  return cell instanceof HTMLTableCellElement ? cell : null;
}

export function selectAllEditorDocument(editor) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  if (!view || !state) {
    return;
  }

  const wholeTextSelection = TextSelection.between(
    state.doc.resolve(0),
    state.doc.resolve(state.doc.content.size),
  );

  view.dispatch(
    state.tr
      .setSelection(wholeTextSelection)
      .scrollIntoView(),
  );
  view.focus();
}
