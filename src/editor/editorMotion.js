import { createExtension } from "@blocknote/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

// Motion inside the editor content: toggles opening and closing. Durations and easing are the
// tokens of src/styles/editor-motion.css and src/styles/motion.css.
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

export const EditorMotion = createExtension({
  key: "notepane-editor-motion",
  prosemirrorPlugins: [
    new Plugin({
      key: new PluginKey("notepane-toggle-motion"),
      view: createToggleMotionView,
    }),
  ],
});
