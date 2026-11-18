import { createExtension } from "@blocknote/core";
import { Plugin } from "@tiptap/pm/state";

// Lists typed as text, which BlockNote's list shortcuts do not turn into list blocks: a paragraph
// that starts with "a) ", "b. ", "(c) ", "2) " or "(3) " continues on Enter with the next marker
// ("b) " after "a) ", "3) " after "2) "), as the bullet and numbered lists do. Enter on an item
// that holds only its marker ends the list, leaving an empty line. Escape right after Enter has
// added a marker takes it back (dismissTextListContinuation, called by the editor surface's
// Escape handler), so a line that only looked like a list stays plain. "1. " is not here: it
// becomes a numbered list block.
const MARKER = /^(\()?([a-z]|[A-Z]|\d{1,4})([.)]) /;

export function parseTextListMarker(text) {
  const match = MARKER.exec(text);
  if (!match) {
    return null;
  }
  const [marker, open, value, close] = match;
  // "(a. " is not a marker; "(a) " is.
  if (open && close !== ")") {
    return null;
  }
  return { marker, open: open ?? "", value, close };
}

// The marker after `marker`, or null after "z" or "Z".
export function nextTextListMarker({ open, value, close }) {
  let next;
  if (/^\d+$/.test(value)) {
    next = String(Number(value) + 1);
  } else if (value === "z" || value === "Z") {
    return null;
  } else {
    next = String.fromCharCode(value.charCodeAt(0) + 1);
  }
  return `${open}${next}${close} `;
}

// The marker Enter last added in each editor: { blockId, marker }.
const continuations = new WeakMap();

function paragraphAtSelection(state) {
  const { selection } = state;
  if (!selection.empty) {
    return null;
  }
  const { $from } = selection;
  const content = $from.parent;
  if (content.type.name !== "paragraph" || $from.depth < 2) {
    return null;
  }
  const container = $from.node($from.depth - 1);
  if (container.type.name !== "blockContainer") {
    return null;
  }
  return { $from, content, container, contentStart: $from.start() };
}

function isPlainEnter(event) {
  return event.key === "Enter" && !event.isComposing && event.keyCode !== 229 &&
    !(event.shiftKey || event.altKey || event.ctrlKey || event.metaKey);
}

/**
 * Takes back the marker Enter has just added, when the caret still sits right after it with
 * nothing typed and no other key pressed since. Returns whether it did.
 */
export function dismissTextListContinuation(view) {
  const marker = continuations.get(view);
  const paragraph = paragraphAtSelection(view.state);
  if (!marker || !paragraph || paragraph.content.textContent !== marker) {
    return false;
  }
  continuations.delete(view);
  const { contentStart } = paragraph;
  view.dispatch(view.state.tr.delete(contentStart, contentStart + marker.length));
  return true;
}

export const TextLists = createExtension(() => {
  // Set by an Enter in a text list item; the split that Enter makes then gets the next marker.
  let pending = null;
  let editorView = null;
  return {
    key: "notepane-text-lists",
    prosemirrorPlugins: [new Plugin({
      props: {
        handleDOMEvents: {
          keydown(view, event) {
            pending = null;
            // Escape reaches the editor surface's handler first, which takes the marker back.
            if (event.key !== "Escape") {
              continuations.delete(view);
            }
            if (!isPlainEnter(event)) {
              return false;
            }
            const paragraph = paragraphAtSelection(view.state);
            const parsed = paragraph && parseTextListMarker(paragraph.content.textContent);
            if (!parsed) {
              return false;
            }
            // An item with nothing after its marker ends the list.
            if (paragraph.content.textContent.trim() === parsed.marker.trim()) {
              event.preventDefault();
              const { contentStart } = paragraph;
              view.dispatch(view.state.tr.delete(contentStart, contentStart + paragraph.content.content.size));
              continuations.delete(view);
              return true;
            }
            const marker = nextTextListMarker(parsed);
            if (marker && paragraph.$from.parentOffset >= parsed.marker.length) {
              pending = { sourceBlockId: paragraph.container.attrs.id, marker };
            }
            return false;
          },
        },
      },
      view: (view) => {
        editorView = view;
        return {
          destroy() {
            continuations.delete(view);
            editorView = null;
          },
        };
      },
      appendTransaction(transactions, _oldState, newState) {
        if (!pending || !transactions.some((transaction) => transaction.docChanged)) {
          return null;
        }
        const { sourceBlockId, marker } = pending;
        pending = null;
        const paragraph = paragraphAtSelection(newState);
        if (!paragraph || paragraph.$from.parentOffset !== 0) {
          return null;
        }
        // The new item is the block right after the one Enter was pressed in.
        const { $from } = paragraph;
        const previous = newState.doc.resolve($from.before($from.depth - 1)).nodeBefore;
        if (previous?.attrs.id !== sourceBlockId) {
          return null;
        }
        if (editorView) {
          continuations.set(editorView, marker);
        }
        return newState.tr.insertText(marker, paragraph.contentStart);
      },
    })],
  };
})();
