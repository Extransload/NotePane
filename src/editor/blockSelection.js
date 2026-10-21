import { Selection, SelectionRange } from "@tiptap/pm/state";

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
    const ranges = [];
    for (const range of this.ranges) {
      const from = mapping.mapResult(range.$from.pos, 1);
      const to = mapping.mapResult(range.$to.pos, -1);
      if (from.deleted || to.deleted || from.pos >= to.pos) continue;
      ranges.push(new SelectionRange(doc.resolve(from.pos), doc.resolve(to.pos)));
    }
    if (!ranges.length) return Selection.near(doc.resolve(mapping.map(this.ranges[0].$from.pos, 1)));
    return new BlockSetSelection(ranges);
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

export function getBlockSetIds(selection) {
  if (!isBlockSetSelection(selection)) return [];
  const ids = [];
  for (const { $from, $to } of selection.ranges) {
    $from.doc.nodesBetween($from.pos, $to.pos, (node) => {
      if (node.type.name !== "blockContainer") return;
      ids.push(node.attrs.id);
      return false;
    });
  }
  return ids;
}

export function getSelectedBlocks(editor) {
  const selection = editor.prosemirrorView?.state.selection;
  if (isBlockSetSelection(selection)) {
    return getBlockSetIds(selection).map((id) => editor.getBlock(id)).filter(Boolean);
  }
  return editor.getSelection()?.blocks ?? [];
}
