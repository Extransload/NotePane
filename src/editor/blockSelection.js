import { closeHistory } from "@tiptap/pm/history";
import { Selection, SelectionRange, TextSelection } from "@tiptap/pm/state";
import { planSiblingMove } from "./blockSelectionRules.js";

// A selection of whole blockContainers: one range per run of adjacent siblings.
export class BlockSetSelection extends Selection {
  constructor(ranges) {
    super(ranges[0].$from, ranges.at(-1).$to, ranges);
  }
  get visible() { return false; }
  eq(other) {
    return other instanceof BlockSetSelection
      && other.ranges.length === this.ranges.length
      && other.ranges.every((range, i) => range.$from.pos === this.ranges[i].$from.pos && range.$to.pos === this.ranges[i].$to.pos);
  }
  map(doc, mapping) {
    return this.getBookmark().map(mapping).resolve(doc);
  }
  // Undo history restores a selection from its bookmark. The default bookmark is a text span from the
  // first run to the last, which would cover the unselected blocks between them.
  getBookmark() {
    return new BlockSetBookmark(this.ranges.map((range) => [range.$from.pos, range.$to.pos]));
  }
  toJSON() {
    return { type: "notepane-block-set", ranges: this.ranges.map((range) => [range.$from.pos, range.$to.pos]) };
  }
  static fromJSON(doc, json) {
    return new BlockSetSelection(json.ranges.map(([from, to]) => new SelectionRange(doc.resolve(from), doc.resolve(to))));
  }
}
Selection.jsonID("notepane-block-set", BlockSetSelection);

class BlockSetBookmark {
  constructor(spans) {
    this.spans = spans;
  }
  map(mapping) {
    return new BlockSetBookmark(this.spans.map(([from, to]) => [mapping.map(from, 1), mapping.map(to, -1)]));
  }
  // Rebuilds from ids so runs that became adjacent merge and partly deleted runs survive.
  resolve(doc) {
    const ids = this.spans.flatMap(([from, to]) => (from < to ? containerIdsIn(doc, from, to) : []));
    return createBlockSetSelection(doc, ids)
      ?? Selection.near(doc.resolve(Math.min(this.spans[0][0], doc.content.size)));
  }
}

export function createBlockSetSelection(doc, blockIds) {
  const wanted = new Set(blockIds);
  const spans = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "blockContainer" || !wanted.has(node.attrs.id)) return;
    const end = pos + node.nodeSize;
    const last = spans.at(-1);
    if (last && last[1] === pos) last[1] = end;
    else spans.push([pos, end]);
    return false;
  });
  if (!spans.length) return null;
  return new BlockSetSelection(spans.map(([from, to]) => new SelectionRange(doc.resolve(from), doc.resolve(to))));
}

export function isBlockSetSelection(selection) {
  return selection instanceof BlockSetSelection;
}

function containerIdsIn(doc, from, to) {
  const ids = [];
  for (let pos = from; pos < to;) {
    const node = doc.nodeAt(pos);
    if (!node) break;
    if (node.type.name === "blockContainer") ids.push(node.attrs.id);
    pos += node.nodeSize;
  }
  return ids;
}

export function getBlockSetIds(selection) {
  if (!isBlockSetSelection(selection)) return [];
  return selection.ranges.flatMap(({ $from, $to }) => containerIdsIn($from.doc, $from.pos, $to.pos));
}

export function getSelectedBlocks(editor) {
  const selection = editor.prosemirrorView?.state.selection;
  if (isBlockSetSelection(selection)) {
    return getBlockSetIds(selection).map((id) => editor.getBlock(id)).filter(Boolean);
  }
  return editor.getSelection()?.blocks ?? [];
}

// Removes every block of the block set and leaves the caret in one empty paragraph where the first
// run was, in one transaction. Later runs go first, so the first run's positions need no mapping.
export function replaceBlockSelectionWithParagraph(view) {
  const { state } = view;
  const { ranges } = state.selection;
  const { blockContainer, paragraph } = state.schema.nodes;
  const tr = state.tr;
  for (let i = ranges.length - 1; i > 0; i -= 1) tr.deleteRange(ranges[i].$from.pos, ranges[i].$to.pos);
  const start = ranges[0].$from.pos;
  tr.replaceWith(start, ranges[0].$to.pos, blockContainer.create(null, paragraph.create()));
  // Inside the new blockContainer, then inside its paragraph.
  tr.setSelection(TextSelection.create(tr.doc, start + 2));
  view.dispatch(tr.scrollIntoView());
}

// Tab and Shift+Tab on a block set: nests or unnests each selected block that can move, in one
// undo step, and keeps the same blocks selected. Blocks without inline content are skipped.
export function indentBlockSelection(editor, direction) {
  return editor.transact((tr) => {
    const ids = getBlockSetIds(tr.selection);
    if (!ids.length) return false;
    for (const id of ids) {
      if (!Array.isArray(editor.getBlock(id)?.content)) continue;
      editor.setTextCursorPosition(id, "start");
      if (direction > 0 && editor.canNestBlock()) editor.nestBlock();
      else if (direction < 0 && editor.canUnnestBlock()) editor.unnestBlock();
    }
    closeHistory(tr).setSelection(createBlockSetSelection(tr.doc, ids));
    return true;
  });
}

// Shift+Mod+ArrowUp/Down on a block set: every selected block passes its unselected neighbour
// within its own blockGroup, in one undo step. Nothing moves when any group is at its edge.
// The existing nodes move, so block ids are kept.
export function moveBlockSelection(editor, direction) {
  const view = editor.prosemirrorView;
  const { state } = view;
  const ids = getBlockSetIds(state.selection);
  if (!ids.length) return false;
  // Each run lies inside one blockGroup, keyed here by where that group's content starts.
  const plans = [...new Set(state.selection.ranges.map(({ $from }) => $from.start()))].map((start) => {
    const siblingIds = [];
    state.doc.resolve(start).parent.forEach((child) => siblingIds.push(child.attrs.id));
    return { start, siblingIds, order: planSiblingMove(siblingIds, ids, direction) };
  });
  if (plans.some(({ order }) => !order)) return true;

  const tr = state.tr;
  // Later groups first, so the earlier groups' positions need no mapping.
  for (const { start, siblingIds, order } of plans.reverse()) {
    const group = tr.doc.resolve(start).parent;
    const nodesById = new Map();
    group.forEach((child) => nodesById.set(child.attrs.id, child));
    // Replace only the span of children whose order changed.
    const first = order.findIndex((id, i) => id !== siblingIds[i]);
    const last = order.findLastIndex((id, i) => id !== siblingIds[i]);
    let from = start;
    for (let i = 0; i < first; i += 1) from += group.child(i).nodeSize;
    let to = from;
    for (let i = first; i <= last; i += 1) to += group.child(i).nodeSize;
    tr.replaceWith(from, to, order.slice(first, last + 1).map((id) => nodesById.get(id)));
  }
  tr.setSelection(createBlockSetSelection(tr.doc, ids));
  view.dispatch(closeHistory(tr).scrollIntoView());
  return true;
}
