import { createExtension } from "@blocknote/core";
import { Plugin, Selection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { closeHistory } from "@tiptap/pm/history";

class BlockRangeSelection extends Selection {
  get visible() { return false; }
  eq(other) {
    return other instanceof BlockRangeSelection && other.from === this.from && other.to === this.to;
  }
  map(doc, mapping) {
    const from = mapping.mapResult(this.from, 1);
    const to = mapping.mapResult(this.to, -1);
    if (from.deleted || to.deleted || from.pos >= to.pos) return Selection.near(doc.resolve(from.pos));
    return new BlockRangeSelection(doc.resolve(from.pos), doc.resolve(to.pos));
  }
  toJSON() { return { type: "notepane-block-range", anchor: this.anchor, head: this.head }; }
  static fromJSON(doc, json) {
    return new BlockRangeSelection(doc.resolve(json.anchor), doc.resolve(json.head));
  }
}
Selection.jsonID("notepane-block-range", BlockRangeSelection);

export const BlockDragSelection = createExtension({
  key: "notepaneBlockDragSelection",
  prosemirrorPlugins: [new Plugin({
    props: {
      decorations(state) {
        if (!(state.selection instanceof BlockRangeSelection)) return DecorationSet.empty;
        const decorations = [];
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
          if (node.type.name !== "blockContainer") return;
          decorations.push(Decoration.node(pos, pos + node.nodeSize, { "data-block-selected": "true" }));
          return false;
        });
        return DecorationSet.create(state.doc, decorations);
      },
      attributes(state) {
        return { "data-block-selection": state.selection instanceof BlockRangeSelection ? "true" : "false" };
      },
    },
    view(view) {
      const document = view.dom.ownerDocument;
      let drag = null;
      const blockAt = (target) => {
        let block = target?.closest?.(".bn-block-outer[data-id]");
        if (!block || !view.dom.contains(block)) return null;
        // Select complete parent blocks when dragging across nested content.
        while (block.parentElement?.closest(".bn-block-outer[data-id]")) {
          block = block.parentElement.closest(".bn-block-outer[data-id]");
        }
        return block;
      };
      const select = (end) => {
        const ids = new Set([drag.start.dataset.id, end.dataset.id]);
        const bounds = [];
        view.state.doc.descendants((node, pos) => {
          if (node.type.name === "blockContainer" && ids.has(node.attrs.id)) {
            bounds.push([pos, pos + node.nodeSize]);
            return false;
          }
        });
        if (!bounds.length) return;
        const from = Math.min(...bounds.map(([a]) => a));
        const to = Math.max(...bounds.map(([, b]) => b));
        const selection = new BlockRangeSelection(view.state.doc.resolve(from), view.state.doc.resolve(to));
        if (!selection.eq(view.state.selection)) {
          view.dispatch(closeHistory(view.state.tr.setSelection(selection)));
        }
      };
      const down = (event) => {
        drag = null;
        if (event.button || event.ctrlKey || event.metaKey || event.altKey) return;
        if (!event.target.closest?.(".bn-inline-content") || event.target.closest("td, th, button, a, input, textarea")) return;
        const start = blockAt(event.target);
        if (start) drag = { start, active: false, end: start };
      };
      const move = (event) => {
        if (!drag || !(event.buttons & 1)) return;
        const end = blockAt(document.elementFromPoint(event.clientX, event.clientY));
        const rect = drag.start.getBoundingClientRect();
        if (!drag.active && end === drag.start && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) return;
        drag.active = true;
        if (end) drag.end = end;
        event.preventDefault();
        event.stopImmediatePropagation();
        select(drag.end);
      };
      const up = (event) => {
        if (drag?.active) {
          event.preventDefault();
          event.stopImmediatePropagation();
          select(drag.end);
        }
        drag = null;
      };
      const selectStart = (event) => { if (drag?.active) event.preventDefault(); };
      document.addEventListener("mousedown", down, true);
      document.addEventListener("mousemove", move, true);
      document.addEventListener("mouseup", up, true);
      document.addEventListener("selectstart", selectStart, true);
      return { update() {
        if (drag?.active && !(view.state.selection instanceof BlockRangeSelection)) {
          queueMicrotask(() => {
            if (!view.isDestroyed && drag?.active) select(drag.end);
          });
        }
      }, destroy() {
        document.removeEventListener("mousedown", down, true);
        document.removeEventListener("mousemove", move, true);
        document.removeEventListener("mouseup", up, true);
        document.removeEventListener("selectstart", selectStart, true);
      } };
    },
  })],
});
