import { Selection, SelectionRange, TextSelection } from "@tiptap/pm/state";

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
    // Rebuild from ids so runs that become adjacent merge and partly deleted runs survive.
    const ids = [];
    for (const range of this.ranges) {
      const from = mapping.map(range.$from.pos, 1);
      const to = mapping.map(range.$to.pos, -1);
      if (from < to) ids.push(...containerIdsIn(doc, from, to));
    }
    return createBlockSetSelection(doc, ids)
      ?? Selection.near(doc.resolve(Math.min(mapping.map(this.ranges[0].$from.pos, 1), doc.content.size)));
  }
  toJSON() {
    return { type: "notepane-block-set", ranges: this.ranges.map((range) => [range.$from.pos, range.$to.pos]) };
  }
  static fromJSON(doc, json) {
    return new BlockSetSelection(json.ranges.map(([from, to]) => new SelectionRange(doc.resolve(from), doc.resolve(to))));
  }
}
Selection.jsonID("notepane-block-set", BlockSetSelection);

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
