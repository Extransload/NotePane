import {
  getNodeById,
} from "@blocknote/core";
import {
  TableMap,
  columnResizingPluginKey,
} from "prosemirror-tables";

const MIN_AUTO_FIT_COLUMN_WIDTH = 35;
const MEASURED_TYPOGRAPHY_PROPERTIES = [
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "fontStretch",
  "fontVariant",
  "lineHeight",
  "letterSpacing",
  "textTransform",
  "textIndent",
];

export function autoFitActiveTableColumn(editor, eventTarget) {
  const view = editor?.prosemirrorView;
  const pluginState = view
    ? columnResizingPluginKey.getState(view.state)
    : null;
  const cellPosition = pluginState?.activeHandle;
  const targetCell = eventTarget instanceof Element
    ? eventTarget.closest("td, th")
    : null;
  const tableElement = targetCell?.closest("table");
  if (!view || !tableElement || !(cellPosition >= 0)) {
    return false;
  }

  const column = getTableColumnAtCellPosition(view.state.doc, cellPosition);
  const widths = readDrawnColumnWidths(tableElement, column.table);
  if (!widths) {
    return false;
  }
  const width = measureAutoFitColumnWidth(
    tableElement,
    column.index,
    getMaximumAutoFitColumnWidth(tableElement),
  );
  if (!Number.isFinite(width)) {
    return false;
  }
  widths[column.index] = width;
  return dispatchColumnWidths(view, column.tableStart - 1, widths);
}

// Notion resizes one column at a time: the other columns keep the width they are drawn at and the
// table is as wide as its columns add up to. A table nobody resized has no column widths and fills
// its block (src/styles/blocknote.css), so a drag gives every column its drawn width in the same
// transaction as the dragged one, and one undo restores the table. prosemirror-tables previews a
// drag on the dragged column alone and commits only that column, so NotePane draws the drag from
// CSS variables its preview does not touch (the session class) and commits it before
// prosemirror-tables does: the window capture listeners in src/hooks/useEditorSurfaceShortcuts.js.
const columnResizeSessions = new WeakMap();
const COLUMN_RESIZE_SESSION_CLASS = "notepane-table-column-resizing";

// On mousedown, before prosemirror-tables starts the drag on a column border it hovers.
export function startActiveTableColumnResize(editor, event) {
  const view = editor?.prosemirrorView;
  const pluginState = view
    ? columnResizingPluginKey.getState(view.state)
    : null;
  if (
    !view?.editable ||
    !pluginState ||
    pluginState.activeHandle < 0 ||
    pluginState.dragging ||
    !(event.target instanceof Node) ||
    !view.dom.contains(event.target)
  ) {
    return false;
  }

  endColumnResizeSession(view);
  const column = getTableColumnAtCellPosition(view.state.doc, pluginState.activeHandle);
  const tableElement = findTableElementAtPosition(view, column.tableStart);
  const widths = tableElement ? readDrawnColumnWidths(tableElement, column.table) : null;
  if (!widths) {
    return false;
  }
  const session = {
    tableElement,
    tablePosition: column.tableStart - 1,
    columnIndex: column.index,
    startX: event.clientX,
    widths,
  };
  columnResizeSessions.set(view, session);
  tableElement.classList.add(COLUMN_RESIZE_SESSION_CLASS);
  drawColumnResizeSession(session, widths);
  return true;
}

export function previewActiveTableColumnResize(editor, event) {
  const view = editor?.prosemirrorView;
  const session = view ? columnResizeSessions.get(view) : null;
  if (!session) {
    return false;
  }
  if (!columnResizingPluginKey.getState(view.state)?.dragging) {
    endColumnResizeSession(view);
    return false;
  }
  // The button came up outside the window, where no mouseup reaches it.
  if (event.buttons === 0) {
    return finishActiveTableColumnResize(editor, event);
  }
  drawColumnResizeSession(session, getDraggedColumnWidths(session, event));
  return true;
}

// On mouseup, before prosemirror-tables commits the dragged column alone: commits every column in
// one transaction that also ends the drag, so prosemirror-tables has nothing left to commit. A
// click on a border that does not move it changes nothing.
export function finishActiveTableColumnResize(editor, event) {
  const view = editor?.prosemirrorView;
  const session = view ? columnResizeSessions.get(view) : null;
  if (!session) {
    return false;
  }
  const transaction = event.clientX === session.startX
    ? view.state.tr
    : buildColumnWidthsTransaction(
      view.state,
      session.tablePosition,
      getDraggedColumnWidths(session, event),
    );
  if (!transaction) {
    endColumnResizeSession(view);
    return false;
  }
  if (columnResizingPluginKey.getState(view.state)?.dragging) {
    transaction.setMeta(columnResizingPluginKey, { setDragging: null });
  }
  view.dispatch(transaction);
  endColumnResizeSession(view);
  return true;
}

function getDraggedColumnWidths(session, event) {
  const widths = session.widths.slice();
  widths[session.columnIndex] = Math.max(
    MIN_AUTO_FIT_COLUMN_WIDTH,
    session.widths[session.columnIndex] + event.clientX - session.startX,
  );
  return widths;
}

function drawColumnResizeSession({ tableElement }, widths) {
  const cols = tableElement.querySelectorAll(":scope > colgroup > col");
  widths.forEach((width, index) => {
    cols[index]?.style.setProperty("--notepane-column-width", `${width}px`);
  });
  tableElement.style.setProperty(
    "--notepane-table-width",
    `${widths.reduce((total, width) => total + width, 0)}px`,
  );
}

function endColumnResizeSession(view) {
  const session = columnResizeSessions.get(view);
  if (!session) {
    return;
  }
  columnResizeSessions.delete(view);
  const { tableElement } = session;
  tableElement.classList.remove(COLUMN_RESIZE_SESSION_CLASS);
  tableElement.style.removeProperty("--notepane-table-width");
  tableElement.querySelectorAll(":scope > colgroup > col").forEach((col) => {
    col.style.removeProperty("--notepane-column-width");
  });
}

// Every column's width as the table draws it: the width the document gives it, else its rendered
// width rounded down, so the columns never add up to more than the table they replace.
function readDrawnColumnWidths(tableElement, table) {
  const cols = [...tableElement.querySelectorAll(":scope > colgroup > col")];
  const map = TableMap.get(table);
  if (cols.length !== map.width) {
    return null;
  }
  const documentWidths = [];
  table.firstChild?.forEach((cell) => {
    for (let index = 0; index < cell.attrs.colspan; index += 1) {
      documentWidths.push(cell.attrs.colwidth?.[index] || 0);
    }
  });
  return cols.map((col, index) => documentWidths[index] || Math.max(
    MIN_AUTO_FIT_COLUMN_WIDTH,
    Math.floor(col.getBoundingClientRect().width),
  ));
}

// Notion's "Fit to width": scales every column by the same factor so the table is exactly as wide
// as the text column it sits in, in one undo step. A wide table's scroller reaches past the column
// (src/styles/blocknote.css), so the room is the block's width less the scroller's handle padding.
export function fitTableToWidth(editor, blockId) {
  const view = editor?.prosemirrorView;
  const blockInfo = view ? getNodeById(blockId, view.state.doc) : null;
  const tableElement = editor?.domElement?.querySelector(
    `.bn-block-outer[data-id="${CSS.escape(blockId)}"] table`,
  );
  const scroller = tableElement?.closest(".tableWrapper");
  const column = scroller?.parentElement;
  if (!blockInfo || !column) {
    return false;
  }

  const renderedWidths = [...tableElement.querySelectorAll(":scope > colgroup > col")]
    .map((col) => col.getBoundingClientRect().width);
  const renderedTotal = renderedWidths.reduce((total, width) => total + width, 0);
  const scrollerStyle = getComputedStyle(scroller);
  // The table's outer border adds to its columns' widths.
  const tableBorderWidth = Math.max(
    0,
    Math.ceil(tableElement.getBoundingClientRect().width - renderedTotal),
  );
  const availableWidth = Math.floor(
    column.clientWidth -
      Number.parseFloat(scrollerStyle.paddingLeft || "0") -
      Number.parseFloat(scrollerStyle.paddingRight || "0") -
      tableBorderWidth,
  );
  if (!(renderedTotal > 0) || !(availableWidth > 0)) {
    return false;
  }

  const scale = availableWidth / renderedTotal;
  const widths = renderedWidths.map((width) => (
    Math.max(MIN_AUTO_FIT_COLUMN_WIDTH, Math.floor(width * scale))
  ));
  widths[widths.length - 1] += Math.max(
    0,
    availableWidth - widths.reduce((total, width) => total + width, 0),
  );
  return dispatchColumnWidths(view, blockInfo.posBeforeNode + 1, widths);
}

function getTableColumnAtCellPosition(doc, cellPosition) {
  const $cell = doc.resolve(cellPosition);
  const table = $cell.node(-1);
  const map = TableMap.get(table);
  const tableStart = $cell.start(-1);
  return {
    index: map.colCount($cell.pos - tableStart) + $cell.nodeAfter.attrs.colspan - 1,
    map,
    table,
    tableStart,
  };
}

function measureAutoFitColumnWidth(table, columnIndex, maximumWidth) {
  const measurements = [];
  for (const row of table.rows) {
    let currentColumn = 0;
    for (const cell of row.cells) {
      const span = Math.max(1, cell.colSpan || 1);
      if (columnIndex >= currentColumn && columnIndex < currentColumn + span) {
        measurements.push(measureCellContentWidth(cell) / span);
        break;
      }
      currentColumn += span;
    }
  }

  if (measurements.length === 0) {
    return Number.NaN;
  }
  return Math.max(
    MIN_AUTO_FIT_COLUMN_WIDTH,
    Math.min(maximumWidth, Math.ceil(Math.max(...measurements))),
  );
}

function measureCellContentWidth(cell) {
  const style = getComputedStyle(cell);
  const measurement = document.createElement("div");
  measurement.setAttribute("aria-hidden", "true");
  Object.assign(measurement.style, {
    position: "fixed",
    top: "-10000px",
    left: "-10000px",
    width: "max-content",
    maxWidth: "none",
    paddingLeft: style.paddingLeft,
    paddingRight: style.paddingRight,
    borderLeftWidth: style.borderLeftWidth,
    borderRightWidth: style.borderRightWidth,
    borderStyle: "solid",
    boxSizing: "border-box",
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontStyle: style.fontStyle,
    fontWeight: style.fontWeight,
    fontStretch: style.fontStretch,
    fontVariant: style.fontVariant,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    whiteSpace: "nowrap",
    visibility: "hidden",
    pointerEvents: "none",
  });

  const content = cell.cloneNode(true);
  copyRenderedTypography(cell, content);
  content.querySelectorAll(".column-resize-handle").forEach((handle) => {
    handle.remove();
  });
  measurement.append(...content.childNodes);
  document.body.append(measurement);
  const width = measurement.getBoundingClientRect().width;
  measurement.remove();
  return width;
}

function copyRenderedTypography(sourceRoot, cloneRoot) {
  const sourceElements = [sourceRoot, ...sourceRoot.querySelectorAll("*")];
  const cloneElements = [cloneRoot, ...cloneRoot.querySelectorAll("*")];
  sourceElements.forEach((source, index) => {
    const clone = cloneElements[index];
    if (!clone?.style) {
      return;
    }
    const style = getComputedStyle(source);
    for (const property of MEASURED_TYPOGRAPHY_PROPERTIES) {
      clone.style[property] = style[property];
    }
  });
}

function getMaximumAutoFitColumnWidth(table) {
  const editor = table.closest(".bn-editor");
  const container = editor ?? table.parentElement ?? table;
  const style = getComputedStyle(container);
  const horizontalPadding =
    Number.parseFloat(style.paddingLeft || "0") +
    Number.parseFloat(style.paddingRight || "0");
  return Math.max(
    MIN_AUTO_FIT_COLUMN_WIDTH,
    Math.floor(container.clientWidth - horizontalPadding),
  );
}

function findTableElementAtPosition(view, tableStart) {
  let node = view.domAtPos(tableStart).node;
  while (node && node.nodeName !== "TABLE") {
    node = node.parentNode;
  }
  return node instanceof HTMLTableElement ? node : null;
}

function dispatchColumnWidths(view, tablePosition, widths) {
  const transaction = buildColumnWidthsTransaction(view.state, tablePosition, widths);
  if (!transaction?.docChanged) {
    return false;
  }
  view.dispatch(transaction);
  return true;
}

// One transaction giving every column of the table at `tablePosition` its width in `widths`.
function buildColumnWidthsTransaction(state, tablePosition, widths) {
  const table = state.doc.nodeAt(tablePosition);
  if (table?.type.spec.tableRole !== "table") {
    return null;
  }
  const map = TableMap.get(table);
  if (map.width !== widths.length) {
    return null;
  }

  const tableStart = tablePosition + 1;
  const transaction = state.tr;
  for (const relativePosition of new Set(map.map)) {
    const cell = table.nodeAt(relativePosition);
    const firstColumn = map.colCount(relativePosition);
    const colwidth = widths.slice(firstColumn, firstColumn + cell.attrs.colspan);
    if (cell.attrs.colwidth?.every((width, index) => width === colwidth[index])) {
      continue;
    }
    transaction.setNodeMarkup(tableStart + relativePosition, null, {
      ...cell.attrs,
      colwidth,
    });
  }

  return transaction;
}
