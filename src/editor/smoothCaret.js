// The smooth caret: a drawn caret that glides to each new caret position, as TablePeek's
// CodeMirror cursor does. The browser's own caret cannot be animated, so while the drawn one shows
// the surface carries `data-smooth-caret`, which makes the native caret transparent
// (src/styles/caret.css). An attribute rather than a class, because React rewrites the surface's
// className whenever it renders. Whenever the drawn caret is not shown, the attribute is gone and
// the native caret is back.
//
// The caret is a child of the editor surface, the scroll container, so scrolling carries it. Its
// place is the ProseMirror selection head (`coordsAtPos`, the rect the browser gives a collapsed
// range there) in the surface's scroll coordinates. It is drawn only for a text cursor in the
// focused editor of a focused window, never for a range, block or cell selection, and never while
// an IME composes: Korean input shows the native caret from compositionstart until the update
// after compositionend.
//
// Only small moves glide. The first appearance, a click, a scroll, a resize or a zoom, and a jump
// of more than three lines snap. Reduced motion, print and export are handled in CSS: the caret
// snaps under reduced motion, and is not drawn in print or while a note is exported.
//
// Every write goes to the caret element and the surface's class list, never into the DOM
// ProseMirror owns, and every measurement waits for one animation frame, so a burst of events
// costs one read and one write.

// The caret is 2px wide (src/styles/caret.css); this centres it on the native caret's line.
const CARET_HALF_WIDTH = 1;
const IDLE_BEFORE_BLINK_MS = 500;
const SNAP_DISTANCE_IN_LINES = 3;
const MODIFIER_KEYS = new Set(["Shift", "Meta", "Control", "Alt", "CapsLock"]);

export function installSmoothCaret(editor, surface) {
  const ownerDocument = surface.ownerDocument;
  const view = ownerDocument.defaultView;
  const caret = ownerDocument.createElement("div");
  caret.className = "smooth-caret";
  caret.setAttribute("aria-hidden", "true");
  caret.hidden = true;
  surface.append(caret);

  let frame = 0;
  let unsnapFrame = 0;
  let blinkTimer = 0;
  let snapNext = true;
  let composing = false;
  let shown = null;
  // Which side of a soft wrap the browser draws its caret on (see caretCoords): after End or
  // Cmd+Right the line's end, after a click or an Up or Down arrow the side nearer that column, in
  // the surface's scroll coordinates.
  let atLineEnd = false;
  let goalX = null;
  let movingVertically = false;

  const toSurfaceX = (clientX) =>
    clientX - surface.getBoundingClientRect().left - surface.clientLeft + surface.scrollLeft;

  // Where a line wraps, one position is both the end of a line and the start of the next, and the
  // browser keeps which of the two its caret is on without telling the page. It is the start of the
  // next line, as coordsAtPos gives, unless the caret was put at the line's end or at a column.
  const caretCoords = (editorView, pos) => {
    const after = editorView.coordsAtPos(pos, 1);
    if (!atLineEnd && goalX === null) {
      return after;
    }
    const before = editorView.coordsAtPos(pos, -1);
    if (Math.abs(before.top - after.top) < (after.bottom - after.top) / 2) {
      return after;
    }
    if (atLineEnd) {
      return before;
    }
    return Math.abs(toSurfaceX(before.left) - goalX) < Math.abs(toSurfaceX(after.left) - goalX)
      ? before
      : after;
  };

  const readNavigationKey = (event) => {
    // A modifier pressed on its own moves nothing: Cmd+Right is read when the arrow goes down.
    if (MODIFIER_KEYS.has(event.key)) {
      return;
    }
    atLineEnd = !event.shiftKey && (
      event.key === "End" ||
      (event.key === "ArrowRight" && event.metaKey) ||
      (event.key === "e" && event.ctrlKey && !event.metaKey)
    );
    const vertical = (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      !(event.metaKey || event.ctrlKey || event.altKey);
    // A run of Up and Down keeps the column the first one started from, as the browser does.
    if (!vertical) {
      goalX = null;
    } else if (!movingVertically) {
      goalX = shown?.x ?? null;
    }
    movingVertically = vertical;
  };
  const readPointer = (event) => {
    atLineEnd = false;
    movingVertically = false;
    goalX = toSurfaceX(event.clientX);
    scheduleSnap();
  };

  // An inner scroller, a wide table's, clips the text it has scrolled out of view, and the native
  // caret with it. The caret is not drawn where its text is clipped by an element between it and
  // the surface, which itself carries the caret.
  const isClippedInsideSurface = (editorView, pos, coords) => {
    const { node } = editorView.domAtPos(pos);
    const middle = (coords.top + coords.bottom) / 2;
    for (
      let element = node.nodeType === 1 ? node : node.parentElement;
      element && element !== surface;
      element = element.parentElement
    ) {
      const style = view.getComputedStyle(element);
      if (style.overflowX === "visible" && style.overflowY === "visible") {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (
        coords.left < rect.left - 1 ||
        coords.left > rect.right + 1 ||
        middle < rect.top ||
        middle > rect.bottom
      ) {
        return true;
      }
    }
    return false;
  };

  const readCaret = () => {
    const editorView = editor.prosemirrorView;
    if (
      !editorView ||
      editorView.isDestroyed ||
      composing ||
      editorView.composing ||
      !ownerDocument.hasFocus() ||
      !editorView.hasFocus() ||
      !ownerDocument.getSelection()?.isCollapsed
    ) {
      return null;
    }
    // Only a TextSelection has a $cursor, and only while it is collapsed.
    const { selection } = editorView.state;
    if (!selection.$cursor) {
      return null;
    }
    const coords = caretCoords(editorView, selection.head);
    const height = coords.bottom - coords.top;
    if (!(height > 0) || isClippedInsideSurface(editorView, selection.head, coords)) {
      return null;
    }
    const surfaceRect = surface.getBoundingClientRect();
    return {
      x: coords.left - surfaceRect.left - surface.clientLeft + surface.scrollLeft,
      y: coords.top - surfaceRect.top - surface.clientTop + surface.scrollTop,
      height,
    };
  };

  const stopBlinking = () => {
    view.clearTimeout(blinkTimer);
    caret.classList.remove("is-blinking");
  };

  // Solid while the caret moves, blinking once it has rested; removing the class restarts the
  // blink from its visible half.
  const restartBlink = () => {
    stopBlinking();
    blinkTimer = view.setTimeout(() => caret.classList.add("is-blinking"), IDLE_BEFORE_BLINK_MS);
  };

  const hide = () => {
    if (!shown) {
      return;
    }
    shown = null;
    stopBlinking();
    caret.hidden = true;
    delete surface.dataset.smoothCaret;
  };

  const update = () => {
    frame = 0;
    const next = readCaret();
    if (!next) {
      hide();
      return;
    }
    const snap = snapNext || !shown ||
      Math.abs(next.y - shown.y) > SNAP_DISTANCE_IN_LINES * Math.max(next.height, shown.height);
    snapNext = false;
    if (shown && next.x === shown.x && next.y === shown.y && next.height === shown.height) {
      return;
    }
    if (snap) {
      // The transition stays off for the frame that paints the new place.
      caret.classList.add("is-snapping");
      view.cancelAnimationFrame(unsnapFrame);
      unsnapFrame = view.requestAnimationFrame(() => {
        unsnapFrame = 0;
        caret.classList.remove("is-snapping");
      });
    }
    caret.style.transform = `translate(${next.x - CARET_HALF_WIDTH}px, ${next.y}px)`;
    caret.style.height = `${next.height}px`;
    if (!shown) {
      caret.hidden = false;
      surface.dataset.smoothCaret = "shown";
    }
    shown = next;
    restartBlink();
  };

  const schedule = () => {
    if (!frame) {
      frame = view.requestAnimationFrame(update);
    }
  };
  const scheduleSnap = () => {
    snapNext = true;
    schedule();
  };

  // The native caret comes back at once for the IME's composition.
  const startComposition = () => {
    composing = true;
    hide();
  };
  const endComposition = () => {
    composing = false;
    scheduleSnap();
  };

  const unsubscribers = [
    editor.onChange(schedule),
    editor.onSelectionChange(schedule),
  ];
  const listeners = [
    [ownerDocument, "selectionchange", schedule],
    [ownerDocument, "focusin", scheduleSnap],
    [ownerDocument, "focusout", scheduleSnap],
    [surface, "input", schedule],
    [surface, "compositionstart", startComposition],
    [surface, "compositionend", endComposition],
    [surface, "keydown", readNavigationKey, { capture: true }],
    [surface, "pointerdown", readPointer, { capture: true }],
    // Captured, so a wide table scrolling inside the note counts too: scroll does not bubble.
    [surface, "scroll", scheduleSnap, { capture: true, passive: true }],
    [view, "focus", scheduleSnap],
    [view, "blur", scheduleSnap],
    // App zoom changes the page zoom, which resizes the viewport.
    [view, "resize", scheduleSnap],
    [ownerDocument.fonts, "loadingdone", scheduleSnap],
  ];
  for (const [target, type, listener, options] of listeners) {
    target?.addEventListener(type, listener, options);
  }
  const resizeObserver = new view.ResizeObserver(scheduleSnap);
  resizeObserver.observe(surface);
  const content = editor.prosemirrorView?.dom;
  if (content) {
    resizeObserver.observe(content);
  }

  // Blocks move after the transaction that moved them: BlockNote slides a block's margin as it
  // nests or unnests, and a new block rises in (src/editor/editorMotion.js). A caret measured
  // once would stay where the text was, before the indent or beside the old one. While anything
  // in the note moves, the caret is measured every frame and sits on the text, then measured
  // once more when it has settled. A looping animation does not count, and the follow gives up
  // after a second.
  let followFrame = 0;
  let followUntil = 0;
  const isMoving = () => content?.getAnimations({ subtree: true }).some((animation) =>
    animation.playState === "running" &&
    animation.effect?.getComputedTiming?.().iterations !== Infinity) ?? false;
  const follow = () => {
    followFrame = 0;
    snapNext = true;
    update();
    if (isMoving() && view.performance.now() < followUntil) {
      followFrame = view.requestAnimationFrame(follow);
    } else {
      scheduleSnap();
    }
  };
  const startFollowing = () => {
    followUntil = view.performance.now() + 1000;
    if (!followFrame) {
      followFrame = view.requestAnimationFrame(follow);
    }
  };
  const motionEvents = ["transitionrun", "animationstart", "transitionend", "animationend"];
  for (const type of motionEvents) {
    content?.addEventListener(type, startFollowing);
  }
  scheduleSnap();

  return {
    // Fonts or zoom changed: measure again, without a glide.
    refresh: scheduleSnap,
    destroy() {
      for (const unsubscribe of unsubscribers) {
        unsubscribe?.();
      }
      for (const [target, type, listener, options] of listeners) {
        target?.removeEventListener(type, listener, options);
      }
      for (const type of motionEvents) {
        content?.removeEventListener(type, startFollowing);
      }
      resizeObserver.disconnect();
      view.cancelAnimationFrame(frame);
      view.cancelAnimationFrame(unsnapFrame);
      view.cancelAnimationFrame(followFrame);
      view.clearTimeout(blinkTimer);
      delete surface.dataset.smoothCaret;
      caret.remove();
    },
  };
}
