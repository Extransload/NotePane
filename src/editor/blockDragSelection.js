import { createExtension } from "@blocknote/core";
import { closeHistory } from "@tiptap/pm/history";
import { Plugin, Selection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { clamp } from "../utils/values.js";
import { createBlockSetSelection, getBlockSetIds, isBlockSetSelection } from "./blockSelection.js";
import { normalizeTouchedBlocks } from "./blockSelectionRules.js";
import { focusLastEditorBlock, isEmptyEditorSurfacePointer } from "./blocks.js";

const MARQUEE_THRESHOLD = 4;
const AUTO_SCROLL_BAND = 40;
const AUTO_SCROLL_MAX_SPEED = 18;
const SURFACE_SELECTOR = "[data-testid='sticky-editor-surface']";
const BLOCK_OUTER_SELECTOR = ".bn-block-outer[data-id]";

// The `{ id, ancestorIds }` record of a block's `.bn-block-outer`, ancestors outermost first.
function blockRecord(outer) {
  const ancestorIds = [];
  for (let parent = outer.parentElement?.closest(BLOCK_OUTER_SELECTOR); parent;
    parent = parent.parentElement?.closest(BLOCK_OUTER_SELECTOR)) {
    ancestorIds.unshift(parent.dataset.id);
  }
  return { id: outer.dataset.id, ancestorIds };
}

// Blocks whose own row (`.bn-block-content`, not their children) overlaps `rect` on both axes, in
// document order. `rect` is in client coordinates.
export function collectTouchedBlocks(editorDom, rect) {
  const touched = [];
  for (const content of editorDom.querySelectorAll(".bn-block-content")) {
    const box = content.getBoundingClientRect();
    // A hidden row, such as a collapsed toggle's child, has an empty box.
    if (!box.width || !box.height) continue;
    if (box.left >= rect.right || box.right <= rect.left || box.top >= rect.bottom || box.bottom <= rect.top) continue;
    const outer = content.closest(BLOCK_OUTER_SELECTOR);
    if (outer) touched.push(blockRecord(outer));
  }
  return touched;
}

// Records for `ids`, in document order whatever order `ids` is in.
function blockRecordsFor(editorDom, ids) {
  const wanted = new Set(ids);
  return [...editorDom.querySelectorAll(BLOCK_OUTER_SELECTOR)]
    .filter((outer) => wanted.has(outer.dataset.id))
    .map(blockRecord);
}

// Scrolls `surface` on every animation frame while the pointer (client coordinates) is within the
// band at its top or bottom edge, even when the pointer does not move, and calls `onScroll` after
// each step that moved it. Returns the stop function.
function startEdgeAutoScroll(surface, getPointer, onScroll) {
  const win = surface.ownerDocument.defaultView;
  const speed = (distanceToEdge) =>
    Math.ceil(((AUTO_SCROLL_BAND - Math.max(distanceToEdge, 0)) / AUTO_SCROLL_BAND) * AUTO_SCROLL_MAX_SPEED);
  let frame = win.requestAnimationFrame(step);
  function step() {
    // Scheduled first, so a stop from inside `onScroll` cancels it.
    frame = win.requestAnimationFrame(step);
    const { y } = getPointer();
    const box = surface.getBoundingClientRect();
    const before = surface.scrollTop;
    if (y - box.top < AUTO_SCROLL_BAND) surface.scrollTop -= speed(y - box.top);
    else if (box.bottom - y < AUTO_SCROLL_BAND) surface.scrollTop += speed(box.bottom - y);
    if (surface.scrollTop !== before) onScroll();
  }
  return () => win.cancelAnimationFrame(frame);
}

// A press on the empty editor surface draws a rectangle once the pointer has moved, and
// block-selects every block the rectangle touches while it is drawn. A press that never moves is
// a click, which focuses the last block.
function marqueeView(editor, view) {
  const doc = view.dom.ownerDocument;
  const win = doc.defaultView;
  let gesture = null;

  // Content coordinates scroll with the document, kept inside it so the overlay never grows it.
  function contentPoint(surface, clientX, clientY) {
    const box = surface.getBoundingClientRect();
    return {
      x: clamp(clientX - box.left + surface.scrollLeft, 0, surface.scrollWidth),
      y: clamp(clientY - box.top + surface.scrollTop, 0, surface.scrollHeight),
    };
  }

  // A marquee that touches nothing shows the press-time selection, collapsed if it was a block set.
  function pressTimeSelection() {
    const { selection } = gesture;
    const { doc: current } = view.state;
    if (!isBlockSetSelection(selection) && selection.$anchor.doc === current) return selection;
    return Selection.near(current.resolve(Math.min(selection.from, current.content.size)));
  }

  function update() {
    const { surface, start, pointer, overlay } = gesture;
    const end = contentPoint(surface, pointer.x, pointer.y);
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);
    const box = surface.getBoundingClientRect();
    const dx = box.left - surface.scrollLeft;
    const dy = box.top - surface.scrollTop;
    const touched = collectTouchedBlocks(view.dom, {
      left: left + dx, top: top + dy, right: right + dx, bottom: bottom + dy,
    });
    // A Shift marquee adds to the press-time block set, so the selection can skip blocks.
    const ids = normalizeTouchedBlocks(gesture.baseIds.length
      ? blockRecordsFor(view.dom, [...gesture.baseIds, ...touched.map(({ id }) => id)])
      : touched);
    Object.assign(overlay.style, {
      left: `${left}px`, top: `${top}px`, width: `${right - left}px`, height: `${bottom - top}px`,
    });

    const key = ids.join(" ");
    if (key === gesture.key) return;
    gesture.key = key;
    const selection = ids.length ? createBlockSetSelection(view.state.doc, ids) : pressTimeSelection();
    if (selection && !selection.eq(view.state.selection)) {
      view.dispatch(closeHistory(view.state.tr.setSelection(selection)));
    }
  }

  function onMouseDown(event) {
    if (!isEmptyEditorSurfacePointer(event) || event.ctrlKey || event.altKey) return;
    const surface = event.target.closest(SURFACE_SELECTOR);
    if (!surface.contains(view.dom)) return;
    event.preventDefault();
    end();
    gesture = {
      surface,
      start: contentPoint(surface, event.clientX, event.clientY),
      press: { x: event.clientX, y: event.clientY },
      pointer: { x: event.clientX, y: event.clientY },
      // Empty unless Shift is held and a block set is selected. Meta replaces, like no modifier.
      baseIds: event.shiftKey ? getBlockSetIds(view.state.selection) : [],
      selection: view.state.selection,
      overlay: null,
      stopAutoScroll: null,
      key: null,
    };
    listen(true);
  }

  function onMouseMove(event) {
    // No primary button means it was released outside the window.
    if ((event.buttons & 1) === 0) {
      release();
      return;
    }
    gesture.pointer = { x: event.clientX, y: event.clientY };
    if (!gesture.overlay) {
      if (Math.hypot(event.clientX - gesture.press.x, event.clientY - gesture.press.y) < MARQUEE_THRESHOLD) return;
      gesture.overlay = doc.createElement("div");
      gesture.overlay.className = "notepane-marquee";
      gesture.overlay.dataset.testid = "block-marquee";
      gesture.surface.append(gesture.overlay);
      // Keys must reach the blocks the marquee selects, even when the press began with focus
      // elsewhere, such as in the find bar. ProseMirror focuses without scrolling.
      if (!view.hasFocus()) view.focus();
      // The start corner is in content coordinates, so a scroll grows the rectangle: hit-test again.
      const current = gesture;
      gesture.stopAutoScroll = startEdgeAutoScroll(gesture.surface, () => current.pointer, update);
    }
    update();
  }

  function onMouseUp(event) {
    if (event.button === 0) release();
  }

  function release() {
    const isClick = !gesture.overlay;
    end();
    if (isClick) focusLastEditorBlock(editor);
  }

  // Escape and blur end the marquee and keep the selection it made.
  function onKeyDown(event) {
    if (event.key !== "Escape" || !gesture.overlay) return;
    event.preventDefault();
    event.stopPropagation();
    end();
  }

  function preventSelectStart(event) {
    event.preventDefault();
  }

  function end() {
    gesture?.stopAutoScroll?.();
    gesture?.overlay?.remove();
    gesture = null;
    listen(false);
  }

  const gestureListeners = [
    [doc, "mousemove", onMouseMove, true],
    [doc, "mouseup", onMouseUp, true],
    [doc, "keydown", onKeyDown, true],
    [doc, "selectstart", preventSelectStart, true],
    [win, "blur", end, false],
  ];
  function listen(on) {
    for (const [target, type, handler, capture] of gestureListeners) {
      if (on) target.addEventListener(type, handler, capture);
      else target.removeEventListener(type, handler, capture);
    }
  }

  doc.addEventListener("mousedown", onMouseDown, true);
  return {
    destroy() {
      doc.removeEventListener("mousedown", onMouseDown, true);
      end();
    },
  };
}

export const BlockDragSelection = createExtension(({ editor }) => ({
  key: "notepaneBlockDragSelection",
  prosemirrorPlugins: [new Plugin({
    view: (view) => marqueeView(editor, view),
    props: {
      handleDOMEvents: {
        // Chromium reads a press inside the block set's hidden DOM range as the start of a drag
        // of that range, so a text drag would only move the caret. Drop the block set first.
        mousedown(view, event) {
          if (event.button !== 0 || !isBlockSetSelection(view.state.selection)) return false;
          if (!event.target.closest?.(".bn-inline-content")) return false;
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (pos) {
            const selection = Selection.near(view.state.doc.resolve(pos.pos));
            view.dispatch(closeHistory(view.state.tr.setSelection(selection)));
          }
          return false;
        },
      },
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
}))();
