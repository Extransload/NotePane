import { createExtension } from "@blocknote/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { getBlockSetIds, isBlockSetSelection } from "./blockSelection.js";

export const BlockDragSelection = createExtension({
  key: "notepaneBlockDragSelection",
  prosemirrorPlugins: [new Plugin({
    props: {
      decorations(state) {
        if (!isBlockSetSelection(state.selection)) return DecorationSet.empty;
        const ids = new Set(getBlockSetIds(state.selection));
        const decorations = [];
        state.doc.descendants((node, pos) => {
          if (node.type.name !== "blockContainer" || !ids.has(node.attrs.id)) return;
          decorations.push(Decoration.node(pos, pos + node.nodeSize, { "data-block-selected": "true" }));
          return false;
        });
        return DecorationSet.create(state.doc, decorations);
      },
      attributes(state) {
        return { "data-block-selection": isBlockSetSelection(state.selection) ? "true" : "false" };
      },
    },
  })],
});
