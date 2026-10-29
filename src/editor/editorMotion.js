import { createExtension } from "@blocknote/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Motion inside the editor content: toggles opening and closing, blocks the user creates rising in,
// moved blocks settling into place, and a checklist box popping as it is ticked. Durations and easing are the tokens of
// src/styles/editor-motion.css and src/styles/motion.css.
//
// Everything here animates through the Web Animations API, which writes no attribute or style
// into the DOM ProseMirror owns, so its DOM observer never sees a mutation. Nothing animates under
// prefers-reduced-motion, while printing, or while a note is exported (body.is-exporting).

const TOGGLE_ANIMATION_ID = "notepane-toggle";

export function isEditorMotionAllowed(element) {
  const view = element.ownerDocument.defaultView;
  return Boolean(view) &&
    !view.matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !view.matchMedia("print").matches &&
    !element.ownerDocument.body.classList.contains("is-exporting");
}

// A duration token such as `180ms` or `0.18s`, in milliseconds.
export function readMotionDuration(element, token) {
  const value = getComputedStyle(element).getPropertyValue(token).trim();
  const amount = Number.parseFloat(value);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return value.endsWith("ms") ? amount : amount * 1000;
}

function motionTiming(element, durationToken) {
  return {
    duration: readMotionDuration(element, durationToken),
    easing: getComputedStyle(element).getPropertyValue("--notepane-motion-ease-out").trim() || "ease-out",
  };
}

// While it animates, a closed toggle's children stay displayed (BlockNote hides them with
// `display: none` the moment the toggle closes). `clip` keeps margins collapsing as they do at
// rest, so the open height at the end is the height the children take without the animation.
const SHOWN_CHILDREN = { display: "block", overflow: "clip" };

function runningToggleAnimation(group) {
  return group.getAnimations().find((animation) => animation.id === TOGGLE_ANIMATION_ID);
}

// Starts the children's height and opacity from where they are now: zero or full height, or the
// height an interrupted animation had reached.
function animateToggleChildren(group, open, timing = motionTiming(group, "--notepane-motion-toggle-duration")) {
  const running = runningToggleAnimation(group);
  const from = running
    ? { height: group.getBoundingClientRect().height, opacity: Number(getComputedStyle(group).opacity) }
    : null;
  running?.cancel();
  if (!isEditorMotionAllowed(group) || !(timing.duration > 0)) {
    return;
  }

  const animation = group.animate([SHOWN_CHILDREN, SHOWN_CHILDREN], {
    id: TOGGLE_ANIMATION_ID,
    ...timing,
  });
  const height = group.getBoundingClientRect().height;
  animation.effect.setKeyframes(open
    ? [
      { ...SHOWN_CHILDREN, height: `${from?.height ?? 0}px`, opacity: from?.opacity ?? 0 },
      { ...SHOWN_CHILDREN, height: `${height}px`, opacity: 1 },
    ]
    : [
      { ...SHOWN_CHILDREN, height: `${from?.height ?? height}px`, opacity: from?.opacity ?? 1 },
      { ...SHOWN_CHILDREN, height: "0px", opacity: 0 },
    ]);
}

// A toggle that opens inside one still opening (find in note opens every collapsed toggle around
// a match) changes the height the outer one must end at. The outer one heads for its new height
// in the time it has left, so it never ends short and jumps.
function retargetOpeningAncestors(group) {
  for (let ancestor = group.parentElement?.closest(".bn-block-group"); ancestor;
    ancestor = ancestor.parentElement?.closest(".bn-block-group")) {
    const running = runningToggleAnimation(ancestor);
    const keyframes = running?.effect.getKeyframes();
    if (!keyframes || Number(keyframes.at(-1).opacity) !== 1) {
      continue;
    }
    const { duration, easing } = running.effect.getTiming();
    const remaining = Math.max(0, duration - (running.currentTime ?? 0));
    animateToggleChildren(ancestor, true, { duration: remaining, easing });
  }
}

function toggleChildrenOf(wrapper) {
  return wrapper.closest(".bn-block")?.querySelector(":scope > .bn-block-group") ?? null;
}

// BlockNote opens and closes a toggle by flipping `data-show-children` on its wrapper: the
// chevron, find in note, and a child added by Enter or paste all go through it. A wrapper that
// renders already open or closed, on note load or when ProseMirror redraws the block, sets the
// attribute before it is in the document, so only a real change is observed here.
function createToggleMotionView(view) {
  const observer = new MutationObserver((records) => {
    const firstOldValues = new Map();
    for (const record of records) {
      if (!firstOldValues.has(record.target)) {
        firstOldValues.set(record.target, record.oldValue);
      }
    }
    for (const [wrapper, oldValue] of firstOldValues) {
      const shown = wrapper.getAttribute("data-show-children");
      const group = wrapper.isConnected ? toggleChildrenOf(wrapper) : null;
      if (!group || oldValue === shown || !["true", "false"].includes(shown)) {
        continue;
      }
      animateToggleChildren(group, shown === "true");
      if (shown === "true") {
        retargetOpeningAncestors(group);
      }
    }
  });
  observer.observe(view.dom, {
    subtree: true,
    attributes: true,
    attributeFilter: ["data-show-children"],
    attributeOldValue: true,
  });
  return {
    destroy: () => observer.disconnect(),
  };
}

// Blocks the user creates (Enter, the slash menu, a paste, a drop) rise in once. A ProseMirror
// decoration puts `notepane-block-enter` on each new block for one CSS animation and is removed when
// it ends, so the class never comes back when ProseMirror draws the block again. Loading or
// switching a note builds a new editor and creates no block through a transaction.
const blockEnterKey = new PluginKey("notepane-block-enter");
const BLOCK_ENTER_CLASS = "notepane-block-enter";
const BLOCK_ENTER_ANIMATION = "notepaneBlockEnter";
const BLOCK_NODE_TYPES = new Set(["blockContainer", "columnList"]);
// More new blocks than this in one step is a whole note arriving (a template, an import, a
// restored version), not blocks the user is placing.
const MAX_ENTERING_BLOCKS = 12;

// The ids of block nodes in a step's inserted content. Block content (text, tables) is not
// searched: blocks never sit inside it.
function insertedBlockIds(transaction) {
  const ids = new Set();
  for (const step of transaction.steps) {
    step.slice?.content.descendants((node) => {
      if (BLOCK_NODE_TYPES.has(node.type.name) && node.attrs.id) {
        ids.add(node.attrs.id);
      }
      return node.type.spec.group !== "blockContent";
    });
  }
  return ids;
}

function blockIdsOf(doc) {
  const ids = new Set();
  doc.descendants((node) => {
    if (BLOCK_NODE_TYPES.has(node.type.name)) {
      ids.add(node.attrs.id);
    }
    return node.type.spec.group !== "blockContent";
  });
  return ids;
}

// Undo and redo bring back blocks that were there before; they reappear in place. BlockNote gives a
// new block its id in a transaction appended to the user's, which carries the user's as its root.
function isHistoryStep(transaction) {
  const root = transaction.getMeta("appendedTransaction") ?? transaction;
  return Boolean(root.getMeta("history$"));
}

function createEnteringBlockDecorations(transaction, oldDoc, view) {
  if (!transaction.docChanged || isHistoryStep(transaction) || !view || !isEditorMotionAllowed(view.dom)) {
    return [];
  }
  const candidates = insertedBlockIds(transaction);
  if (!candidates.size) {
    return [];
  }
  const existing = blockIdsOf(oldDoc);
  const entering = [...candidates].filter((id) => !existing.has(id));
  if (!entering.length || entering.length > MAX_ENTERING_BLOCKS) {
    return [];
  }
  const wanted = new Set(entering);
  const decorations = [];
  transaction.doc.descendants((node, pos) => {
    if (BLOCK_NODE_TYPES.has(node.type.name) && wanted.has(node.attrs.id)) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: BLOCK_ENTER_CLASS }, {
        blockId: node.attrs.id,
      }));
    }
    return node.type.spec.group !== "blockContent";
  });
  return decorations;
}

function createBlockEnterPlugin() {
  let editorView = null;
  return new Plugin({
    key: blockEnterKey,
    state: {
      init: () => DecorationSet.empty,
      apply(transaction, decorations, oldState) {
        let next = decorations.map(transaction.mapping, transaction.doc);
        const ended = transaction.getMeta(blockEnterKey);
        if (ended) {
          next = next.remove(next.find(undefined, undefined, (spec) => ended.includes(spec.blockId)));
        }
        const entering = createEnteringBlockDecorations(transaction, oldState.doc, editorView);
        return entering.length ? next.add(transaction.doc, entering) : next;
      },
    },
    props: {
      decorations: (state) => blockEnterKey.getState(state),
    },
    view(view) {
      editorView = view;
      const finish = (blockIds) => {
        const pending = blockEnterKey.getState(view.state)
          .find(undefined, undefined, (spec) => blockIds.includes(spec.blockId));
        if (pending.length) {
          view.dispatch(view.state.tr
            .setMeta(blockEnterKey, pending.map((decoration) => decoration.spec.blockId))
            .setMeta("addToHistory", false));
        }
      };
      // A nested new block does not animate on its own (its new parent carries it), so the parent's
      // end clears the classes inside it too.
      const onAnimationEnd = (event) => {
        if (event.animationName !== BLOCK_ENTER_ANIMATION || !(event.target instanceof Element)) {
          return;
        }
        const blocks = [event.target, ...event.target.querySelectorAll(`.${BLOCK_ENTER_CLASS}`)];
        finish(blocks.map((block) => block.getAttribute("data-id")).filter(Boolean));
      };
      // A block that never paints, such as one inside a closed toggle, sends no animation event.
      let fallback = 0;
      const clearLeftovers = () => {
        const leftovers = blockEnterKey.getState(view.state).find();
        if (leftovers.length) {
          finish(leftovers.map((decoration) => decoration.spec.blockId));
        }
      };
      view.dom.addEventListener("animationend", onAnimationEnd);
      view.dom.addEventListener("animationcancel", onAnimationEnd);
      return {
        update(updatedView, previousState) {
          if (blockEnterKey.getState(updatedView.state) === blockEnterKey.getState(previousState)) {
            return;
          }
          window.clearTimeout(fallback);
          if (blockEnterKey.getState(updatedView.state).find().length) {
            fallback = window.setTimeout(
              clearLeftovers,
              readMotionDuration(updatedView.dom, "--notepane-motion-block-enter-duration") * 4 + 200,
            );
          }
        },
        destroy() {
          editorView = null;
          window.clearTimeout(fallback);
          view.dom.removeEventListener("animationend", onAnimationEnd);
          view.dom.removeEventListener("animationcancel", onAnimationEnd);
        },
      };
    },
  });
}

// Blocks moved by a drag and drop (the six-dot handle) or by Mod+Shift+ArrowUp/Down glide from
// where they were drawn to their new place (FLIP): their positions are read before the event's own
// handlers change the document, and each block that moved starts at its old offset and settles.
// The blocks a move pushes aside glide too. Positions are relative to the editor, so the scroll a
// move brings with it does not count as movement.
const MOVABLE_BLOCK_SELECTOR = ".bn-block-outer[data-id], .notepane-column-list[data-id]";
const BLOCK_MOVE_ANIMATION_ID = "notepane-block-move";

function isBlockMoveKey(event) {
  return (event.key === "ArrowUp" || event.key === "ArrowDown") &&
    event.shiftKey && (event.metaKey || event.ctrlKey) && !event.altKey;
}

function readBlockPositions(view) {
  const origin = view.dom.getBoundingClientRect();
  const positions = new Map();
  for (const block of view.dom.querySelectorAll(MOVABLE_BLOCK_SELECTOR)) {
    const rect = block.getBoundingClientRect();
    if (rect.height > 0) {
      positions.set(block.getAttribute("data-id"), { x: rect.left - origin.left, y: rect.top - origin.top });
    }
  }
  return positions;
}

function settleMovedBlocks(view, positionsBefore) {
  for (const block of view.dom.querySelectorAll(MOVABLE_BLOCK_SELECTOR)) {
    for (const animation of block.getAnimations()) {
      if (animation.id === BLOCK_MOVE_ANIMATION_ID) {
        animation.cancel();
      }
    }
  }
  const origin = view.dom.getBoundingClientRect();
  const viewportHeight = view.dom.ownerDocument.defaultView.innerHeight;
  const timing = motionTiming(view.dom, "--notepane-motion-block-move-duration");
  const moving = [];
  for (const block of view.dom.querySelectorAll(MOVABLE_BLOCK_SELECTOR)) {
    const before = positionsBefore.get(block.getAttribute("data-id"));
    // A block inside one that moves travels with it.
    if (!before || moving.some((parent) => parent.contains(block))) {
      continue;
    }
    const rect = block.getBoundingClientRect();
    const dx = before.x - (rect.left - origin.left);
    const dy = before.y - (rect.top - origin.top);
    if ((Math.abs(dx) < 1 && Math.abs(dy) < 1) || rect.bottom < 0 || rect.top > viewportHeight) {
      continue;
    }
    moving.push(block);
    block.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], {
      id: BLOCK_MOVE_ANIMATION_ID,
      ...timing,
    });
  }
}

function createBlockMoveView(view) {
  const ownerDocument = view.dom.ownerDocument;
  let positionsBefore = null;
  let forget = 0;
  // Capture listeners on the document run before ProseMirror's and the block handlers' own.
  const readPositionsBeforeMove = (event) => {
    if (event.type === "keydown" && !(isBlockMoveKey(event) && view.hasFocus())) {
      return;
    }
    if (!isEditorMotionAllowed(view.dom)) {
      return;
    }
    positionsBefore = readBlockPositions(view);
    window.clearTimeout(forget);
    // A key or drop that moved nothing leaves no positions for a later change to use.
    forget = window.setTimeout(() => {
      positionsBefore = null;
    });
  };
  ownerDocument.addEventListener("keydown", readPositionsBeforeMove, true);
  ownerDocument.addEventListener("drop", readPositionsBeforeMove, true);
  return {
    update(updatedView, previousState) {
      if (!positionsBefore || updatedView.state.doc === previousState.doc) {
        return;
      }
      const positions = positionsBefore;
      positionsBefore = null;
      settleMovedBlocks(updatedView, positions);
    },
    destroy() {
      window.clearTimeout(forget);
      ownerDocument.removeEventListener("keydown", readPositionsBeforeMove, true);
      ownerDocument.removeEventListener("drop", readPositionsBeforeMove, true);
    },
  };
}

// A checklist box the user ticks pops once. BlockNote stores the tick from the box's change event
// and may draw the item again, so the box is looked up after the editor has updated.
const CHECK_POP_ANIMATION_ID = "notepane-check-pop";

function checkBoxOf(view, blockId) {
  return view.dom.querySelector(
    `.bn-block-outer[data-id="${CSS.escape(blockId)}"] > .bn-block > [data-content-type="checkListItem"] input[type="checkbox"]`,
  );
}

function popCheckBox(box) {
  box.animate([{ scale: 1 }, { scale: 1.15 }, { scale: 1 }], {
    id: CHECK_POP_ANIMATION_ID,
    ...motionTiming(box, "--notepane-motion-check-duration"),
  });
}

function createCheckPopView(view) {
  let tickedBlockId = null;
  let forget = 0;
  const rememberTick = (event) => {
    const box = event.target;
    if (
      !(box instanceof HTMLInputElement) ||
      box.type !== "checkbox" ||
      !box.checked ||
      !box.closest('[data-content-type="checkListItem"]') ||
      !isEditorMotionAllowed(view.dom)
    ) {
      return;
    }
    tickedBlockId = box.closest(".bn-block-outer")?.getAttribute("data-id") ?? null;
    window.clearTimeout(forget);
    forget = window.setTimeout(() => {
      tickedBlockId = null;
    });
  };
  view.dom.addEventListener("change", rememberTick, true);
  return {
    update(updatedView) {
      if (!tickedBlockId) {
        return;
      }
      const box = checkBoxOf(updatedView, tickedBlockId);
      tickedBlockId = null;
      if (box?.checked) {
        popCheckBox(box);
      }
    },
    destroy() {
      window.clearTimeout(forget);
      view.dom.removeEventListener("change", rememberTick, true);
    },
  };
}

// Each editor gets its own plugins: a plugin's view state belongs to one editor view.
export const EditorMotion = createExtension(() => ({
  key: "notepane-editor-motion",
  prosemirrorPlugins: [
    new Plugin({
      key: new PluginKey("notepane-toggle-motion"),
      view: createToggleMotionView,
    }),
    createBlockEnterPlugin(),
    new Plugin({
      key: new PluginKey("notepane-block-move-motion"),
      view: createBlockMoveView,
    }),
    new Plugin({
      key: new PluginKey("notepane-check-pop-motion"),
      view: createCheckPopView,
    }),
  ],
}))();
