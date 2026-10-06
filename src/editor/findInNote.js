import { createExtension } from "@blocknote/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findMatchRanges } from "../model/search.js";

// Find in note. Matches live in plugin state and render as decorations, so
// searching never changes the document, the undo history or the save state.

export const findInNotePluginKey = new PluginKey("notepaneFindInNote");
const EMPTY_FIND_STATE = Object.freeze({ query: "", matches: [], index: -1 });

// The text of each textblock with the document position of every character,
// so a match found in the string maps back to positions. Leaf inline nodes
// such as hard breaks become a newline so a match cannot span them.
function collectTextblocks(doc) {
  const textblocks = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true;
    }
    let text = "";
    const positions = [];
    node.forEach((child, offset) => {
      const childPos = pos + 1 + offset;
      if (child.isText) {
        for (let index = 0; index < child.text.length; index += 1) {
          text += child.text[index];
          positions.push(childPos + index);
        }
      } else {
        text += "\n";
        positions.push(childPos);
      }
    });
    textblocks.push({ text, positions });
    return false;
  });
  return textblocks;
}

export function findMatchesInDoc(doc, query) {
  if (!query) {
    return [];
  }
  const matches = [];
  for (const { text, positions } of collectTextblocks(doc)) {
    for (const { start, end } of findMatchRanges(text, query)) {
      matches.push({ from: positions[start], to: positions[end - 1] + 1 });
    }
  }
  return matches;
}

function indexNearest(matches, pos) {
  if (matches.length === 0) {
    return -1;
  }
  const index = matches.findIndex((match) => match.from >= pos);
  return index < 0 ? 0 : index;
}

const findInNotePlugin = new Plugin({
  key: findInNotePluginKey,
  state: {
    init: () => EMPTY_FIND_STATE,
    apply(tr, value, _oldState, newState) {
      const meta = tr.getMeta(findInNotePluginKey);
      if (meta?.type === "setQuery") {
        const matches = findMatchesInDoc(newState.doc, meta.query);
        return { query: meta.query, matches, index: indexNearest(matches, meta.from) };
      }
      if (meta?.type === "step") {
        const count = value.matches.length;
        return count === 0
          ? value
          : { ...value, index: (value.index + meta.delta + count) % count };
      }
      if (meta?.type === "clear") {
        return EMPTY_FIND_STATE;
      }
      if (tr.docChanged && value.query) {
        const current = value.matches[value.index];
        const matches = findMatchesInDoc(newState.doc, value.query);
        const anchor = current ? tr.mapping.map(current.from) : 0;
        return { query: value.query, matches, index: indexNearest(matches, anchor) };
      }
      return value;
    },
  },
  props: {
    decorations(state) {
      const { matches, index } = findInNotePluginKey.getState(state);
      if (matches.length === 0) {
        return DecorationSet.empty;
      }
      return DecorationSet.create(
        state.doc,
        matches.map((match, matchIndex) =>
          Decoration.inline(match.from, match.to, {
            class: matchIndex === index
              ? "notepane-find-match is-current"
              : "notepane-find-match",
          }),
        ),
      );
    },
  },
});

export const FindInNote = createExtension({
  key: "notepaneFindInNote",
  prosemirrorPlugins: [findInNotePlugin],
});

function getView(editor) {
  const view = editor?.prosemirrorView;
  return view && !view.isDestroyed ? view : null;
}

function dispatchFindMeta(editor, meta) {
  const view = getView(editor);
  if (!view) {
    return;
  }
  view.dispatch(
    view.state.tr
      .setMeta(findInNotePluginKey, meta)
      .setMeta("addToHistory", false),
  );
}

export function setFindQuery(editor, query) {
  const from = getView(editor)?.state.selection.from ?? 0;
  dispatchFindMeta(editor, { type: "setQuery", query, from });
}

export function stepFind(editor, delta) {
  dispatchFindMeta(editor, { type: "step", delta });
}

export function clearFind(editor) {
  dispatchFindMeta(editor, { type: "clear" });
}

export function getFindState(editor) {
  const state = getView(editor)?.state;
  return (state && findInNotePluginKey.getState(state)) ?? EMPTY_FIND_STATE;
}

function getCurrentFindMatch(editor) {
  const { matches, index } = getFindState(editor);
  return matches[index] ?? null;
}

export function selectCurrentFindMatch(editor) {
  const view = getView(editor);
  const match = getCurrentFindMatch(editor);
  if (!view || !match) {
    return;
  }
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)),
  );
}

// Opens every collapsed toggle that contains the position, skipping the block
// that holds the position itself: a match in a toggle title is already visible.
function expandTogglesAround(view, pos) {
  const $pos = view.state.doc.resolve(pos);
  let isOwnBlock = true;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "blockContainer") {
      continue;
    }
    if (isOwnBlock) {
      isOwnBlock = false;
      continue;
    }
    const outer = view.dom.querySelector(`.bn-block-outer[data-id="${CSS.escape(node.attrs.id)}"]`);
    const wrapper = outer
      ? [...outer.querySelectorAll(".bn-toggle-wrapper")]
        .find((element) => element.closest(".bn-block-outer") === outer)
      : null;
    if (wrapper?.getAttribute("data-show-children") === "false") {
      wrapper.querySelector(".bn-toggle-button")?.click();
    }
  }
}

export function revealCurrentFindMatch(editor) {
  const view = getView(editor);
  const match = getCurrentFindMatch(editor);
  if (!view || !match) {
    return;
  }
  expandTogglesAround(view, match.from);
  const { node } = view.domAtPos(match.from);
  const element = node instanceof Element ? node : node?.parentElement;
  element?.scrollIntoView({ block: "center" });
}

export function getFindSeedText(editor) {
  const view = getView(editor);
  const selection = view?.state.selection;
  if (!selection || selection.empty || selection.$from.parent !== selection.$to.parent) {
    return undefined;
  }
  const text = view.state.doc.textBetween(selection.from, selection.to).trim();
  return text || undefined;
}
