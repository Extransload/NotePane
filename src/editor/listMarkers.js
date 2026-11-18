import { createExtension } from "@blocknote/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// List markers change with nesting as in Notion: bullets go •, ◦, ▪ and numbers 1., a., i., then
// both start over. BlockNote's own stylesheet stops at the third level (every deeper bullet is ▪,
// every number a number), and CSS cannot count nesting past what its selectors spell out, so this
// plugin marks each bullet and numbered item with its depth among the items of its own kind above
// it, modulo 3 (`data-list-depth`), and src/styles/blocknote.css draws the marker from that.
const LIST_TYPES = new Set(["bulletListItem", "numberedListItem"]);
const MARKER_CYCLE = 3;

const listMarkersKey = new PluginKey("notepane-list-markers");

function getListDecorations(doc) {
  const decorations = [];
  // depthByType: how many items of each list type enclose the node being visited.
  const visit = (node, pos, depthByType) => {
    node.forEach((child, offset) => {
      const childPos = pos + offset;
      if (child.type.name !== "blockContainer") {
        if (child.type.spec.group !== "blockContent") {
          visit(child, childPos + 1, depthByType);
        }
        return;
      }
      const content = child.firstChild;
      const type = content?.type.name;
      let nested = depthByType;
      if (LIST_TYPES.has(type)) {
        const depth = depthByType[type] ?? 0;
        const contentPos = childPos + 1;
        decorations.push(Decoration.node(contentPos, contentPos + content.nodeSize, {
          "data-list-depth": String(depth % MARKER_CYCLE),
        }));
        nested = { ...depthByType, [type]: depth + 1 };
      }
      // The blockContainer's children after its content: the nested blockGroup.
      child.forEach((grandchild, grandchildOffset) => {
        if (grandchild.type.name === "blockGroup") {
          visit(grandchild, childPos + 1 + grandchildOffset + 1, nested);
        }
      });
    });
  };
  visit(doc, 0, {});
  return DecorationSet.create(doc, decorations);
}

export const ListMarkers = createExtension(() => ({
  key: "notepane-list-markers",
  prosemirrorPlugins: [new Plugin({
    key: listMarkersKey,
    state: {
      init: (_config, state) => getListDecorations(state.doc),
      apply: (transaction, decorations) =>
        transaction.docChanged ? getListDecorations(transaction.doc) : decorations,
    },
    props: {
      decorations: (state) => listMarkersKey.getState(state),
    },
  })],
}))();
