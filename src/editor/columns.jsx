import { createBlockSpecFromTiptapNode, createExtension, fixColumnList } from "@blocknote/core";
import { Node } from "@tiptap/core";
import { Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Columns lay blocks side by side. They use the node layout BlockNote core already knows
// (`columnList` holds two or more `column`s, a `column` holds blocks): core gives both an id,
// moves and removes blocks out of them, collapses a layout left with one column, and its side menu
// places itself beside a block in a column. BlockNote's own `@blocknote/xl-multi-column` package is
// GPL-3.0, which NotePane's MIT build cannot ship, so the nodes are defined here.

const MIN_COLUMN_SHARE = 0.15;

const ColumnListNode = Node.create({
  name: "columnList",
  group: "childContainer bnBlock blockGroupChild",
  content: "column column+",
  priority: 40,
  defining: true,
  parseHTML() {
    return [{ tag: "div[data-node-type=columnList]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const dom = document.createElement("div");
    for (const [attribute, value] of Object.entries(HTMLAttributes)) {
      dom.setAttribute(attribute, value);
    }
    dom.className = "bn-block-column-list notepane-column-list";
    dom.setAttribute("data-node-type", "columnList");
    return { dom, contentDOM: dom };
  },
});

const ColumnNode = Node.create({
  name: "column",
  group: "bnBlock childContainer",
  content: "blockContainer+",
  priority: 40,
  defining: true,
  addAttributes() {
    return {
      width: {
        default: 1,
        parseHTML: (element) => Number(element.getAttribute("data-width")) || 1,
        // Each column's share of the row is its width over the sum of the widths.
        renderHTML: (attributes) => ({
          "data-width": String(attributes.width),
          style: `flex-grow: ${attributes.width}`,
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-node-type=column]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const dom = document.createElement("div");
    for (const [attribute, value] of Object.entries(HTMLAttributes)) {
      dom.setAttribute(attribute, value);
    }
    dom.className = "bn-block-column notepane-column";
    dom.setAttribute("data-node-type", "column");
    return { dom, contentDOM: dom };
  },
});

const roundWidth = (width) => Math.round(width * 1000) / 1000;

// Sets the widths of the two columns either side of the gutter at `rightIndex` of the column list
// at `listPos`. ProseMirror redraws a column whose width changes, so the DOM always shows the state.
function setColumnWidths(view, listPos, rightIndex, [leftWidth, rightWidth], addToHistory) {
  const list = view.state.doc.nodeAt(listPos);
  if (list?.type.name !== "columnList" || rightIndex >= list.childCount) {
    return;
  }
  let rightPos = listPos + 1;
  for (let index = 0; index < rightIndex; index += 1) rightPos += list.child(index).nodeSize;
  const leftPos = rightPos - list.child(rightIndex - 1).nodeSize;
  const tr = view.state.tr
    .setNodeAttribute(leftPos, "width", leftWidth)
    .setNodeAttribute(rightPos, "width", rightWidth)
    .setMeta("addToHistory", addToHistory);
  view.dispatch(tr);
}

// The gutter between two columns: dragging it moves the boundary, as in Notion. The row follows the
// pointer through transactions kept out of the undo history; the drag's end puts the widths back
// and sets the final ones in one transaction that is, so one undo step restores the old ratio.
function createColumnGutter(view, getPos) {
  const gutter = document.createElement("div");
  gutter.className = "notepane-column-gutter";
  gutter.contentEditable = "false";
  gutter.dataset.testid = "column-resize-handle";
  gutter.setAttribute("aria-hidden", "true");

  gutter.addEventListener("mousedown", (event) => {
    const rightPos = getPos();
    if (event.button !== 0 || !view.editable || rightPos === undefined) {
      return;
    }
    const $right = view.state.doc.resolve(rightPos);
    const left = $right.nodeBefore;
    const right = $right.nodeAfter;
    if (left?.type.name !== "column" || right?.type.name !== "column") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const listPos = $right.before();
    const rightIndex = $right.index();
    const startWidths = [left.attrs.width, right.attrs.width];
    const total = startWidths[0] + startWidths[1];
    // The flex-grow shares split the columns' content widths, which leave out the left padding a
    // column after a gutter keeps for its side menu. The pointer holds the middle of the gutter.
    const leftDom = view.nodeDOM(rightPos - left.nodeSize);
    const rightDom = view.nodeDOM(rightPos);
    const paddingOf = (element) => Number.parseFloat(getComputedStyle(element).paddingLeft) || 0;
    const leftStart = leftDom.getBoundingClientRect().left + paddingOf(leftDom);
    const span = leftDom.getBoundingClientRect().width - paddingOf(leftDom)
      + rightDom.getBoundingClientRect().width - paddingOf(rightDom);
    const grabOffset = gutter.getBoundingClientRect().width / 2;
    let widths = startWidths;
    const ownerDocument = gutter.ownerDocument;
    ownerDocument.documentElement.classList.add("notepane-column-resizing");

    const onMove = (moveEvent) => {
      const share = Math.min(1 - MIN_COLUMN_SHARE, Math.max(MIN_COLUMN_SHARE, (moveEvent.clientX - grabOffset - leftStart) / span));
      const leftWidth = roundWidth(share * total);
      widths = [leftWidth, roundWidth(total - leftWidth)];
      setColumnWidths(view, listPos, rightIndex, widths, false);
    };
    const onUp = () => {
      ownerDocument.removeEventListener("mousemove", onMove, true);
      ownerDocument.removeEventListener("mouseup", onUp, true);
      ownerDocument.documentElement.classList.remove("notepane-column-resizing");
      if (widths === startWidths) {
        return;
      }
      setColumnWidths(view, listPos, rightIndex, startWidths, false);
      setColumnWidths(view, listPos, rightIndex, widths, true);
    };
    ownerDocument.addEventListener("mousemove", onMove, true);
    ownerDocument.addEventListener("mouseup", onUp, true);
  });
  return gutter;
}

function columnGutterDecorations(doc) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "columnList") {
      return true;
    }
    let childPos = pos + 1;
    node.forEach((column, _offset, index) => {
      if (index > 0) {
        decorations.push(Decoration.widget(childPos, createColumnGutter, {
          key: `column-gutter-${index}`,
          side: -1,
          ignoreSelection: true,
          stopEvent: () => true,
        }));
      }
      childPos += column.nodeSize;
    });
    return true;
  });
  return DecorationSet.create(doc, decorations);
}

const columnGutterKey = new PluginKey("notepaneColumnGutters");

const columnGutterPlugin = new Plugin({
  key: columnGutterKey,
  state: {
    init: (_config, state) => columnGutterDecorations(state.doc),
    apply: (tr, decorations) => (tr.docChanged ? columnGutterDecorations(tr.doc) : decorations),
  },
  props: {
    decorations: (state) => columnGutterKey.getState(state),
  },
});

// Backspace at the start of a column's first block stays in the column, rather than joining the
// block to the one above the layout or in the previous column. In an empty column, one empty
// paragraph, it removes the column, and a layout left with one column becomes that column's
// blocks, as in Notion. The caret goes to the end of what came before the column.
function backspaceAtColumnStart(editor) {
  return editor.transact((tr) => {
    const { selection } = tr;
    const { $from } = selection;
    if (!selection.empty || $from.parentOffset !== 0 || $from.depth < 3) {
      return false;
    }
    // The caret's content node, its blockContainer, then the column holding that blockContainer.
    const columnDepth = $from.depth - 2;
    const column = $from.node(columnDepth);
    if (column.type.name !== "column" || $from.index(columnDepth) !== 0) {
      return false;
    }
    const block = $from.node(columnDepth + 1);
    const isEmptyColumn = column.childCount === 1 && block.childCount === 1
      && block.firstChild.type.name === "paragraph" && block.firstChild.content.size === 0;
    if (isEmptyColumn) {
      const columnPos = $from.before(columnDepth);
      fixColumnList(tr, $from.before(columnDepth - 1));
      tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(columnPos, -1)), -1));
      tr.scrollIntoView();
    }
    return true;
  });
}

export const columnListBlockSpec = createBlockSpecFromTiptapNode(
  { node: ColumnListNode, type: "columnList", content: "none" },
  {},
  [createExtension({
    key: "notepane-columns",
    prosemirrorPlugins: [columnGutterPlugin],
    keyboardShortcuts: {
      Backspace: ({ editor }) => backspaceAtColumnStart(editor),
    },
  })],
);

export const columnBlockSpec = createBlockSpecFromTiptapNode(
  { node: ColumnNode, type: "column", content: "none" },
  { width: { default: 1, type: "number" } },
);

// Whether the caret is inside a column. Columns do not nest, as in Notion.
export function isSelectionInColumn(state) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "column") {
      return true;
    }
  }
  return false;
}

function isEmptyBlock(block) {
  const content = block.content;
  const isEmptyContent = Array.isArray(content) ? content.length === 0 : content == null;
  return isEmptyContent && !block.children?.length;
}

// The slash menu's "2 columns": two empty columns in place of an empty block, otherwise after the
// caret's block, with the caret in the first column.
export function insertTwoColumns(editor) {
  const current = editor.getTextCursorPosition().block;
  const columnList = {
    type: "columnList",
    children: [
      { type: "column", props: { width: 1 }, children: [{ type: "paragraph" }] },
      { type: "column", props: { width: 1 }, children: [{ type: "paragraph" }] },
    ],
  };
  const replacesCurrent = current.type === "paragraph" && isEmptyBlock(current);
  const [inserted] = replacesCurrent
    ? editor.replaceBlocks([current], [columnList]).insertedBlocks
    : editor.insertBlocks([columnList], current, "after");
  const firstParagraph = inserted?.children?.[0]?.children?.[0];
  if (firstParagraph) {
    editor.setTextCursorPosition(firstParagraph, "start");
  }
  return inserted;
}
