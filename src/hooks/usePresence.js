import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// Whether `element` is running a CSS animation of its own. Transitions do not count: only an
// animation ends with the `animationend` the exit waits for.
function hasRunningAnimation(element) {
  if (!element?.isConnected || typeof element.getAnimations !== "function") {
    return false;
  }
  return element
    .getAnimations()
    .some((animation) => "animationName" in animation && animation.playState === "running");
}

/**
 * Calls `onExited` once the element in `elementRef` has finished its exit animation: on its own
 * `animationend` (or `animationcancel`, when reduced motion or an export turns it off midway),
 * never on one bubbling up from a child. When no animation runs, because reduced motion or an
 * export turns it off or the element is not rendered, `onExited` is called before the browser
 * paints. `exiting` is truthy while the element animates out; a new truthy value names a new
 * element to wait for. `onExited` must keep its identity.
 */
export function useExitAnimation(elementRef, exiting, onExited) {
  useLayoutEffect(() => {
    if (!exiting) {
      return undefined;
    }
    const element = elementRef.current;
    if (!hasRunningAnimation(element)) {
      onExited();
      return undefined;
    }
    const handleEnd = (event) => {
      if (event.target === element) {
        onExited();
      }
    };
    element.addEventListener("animationend", handleEnd);
    element.addEventListener("animationcancel", handleEnd);
    return () => {
      element.removeEventListener("animationend", handleEnd);
      element.removeEventListener("animationcancel", handleEnd);
    };
  }, [elementRef, exiting, onExited]);
}

/**
 * Keeps an overlay mounted while it animates out. `value` is the overlay's payload while open
 * (any value but null, undefined or false) and empty while closed. Once it empties, `value` keeps
 * the last payload, so the overlay can still render, and `rootProps` mark its root element
 * `data-state="closing"`, `inert` and `aria-hidden` until that element's exit animation ends
 * (src/styles/motion.css gives each overlay its exit and `pointer-events: none`). A payload that
 * arrives while closing starts a new `generation`: Presence mounts a fresh overlay for it, so
 * nothing the closing one held carries over (a confirmation already given, a focused field), as
 * when closing removed an overlay at once. A caller of usePresence itself keeps its element unless
 * it keys it with `generation`.
 *
 * Spread `rootProps` on the overlay's root element; its `ref` must reach that element.
 */
export function usePresence(value) {
  const isOpen = value !== null && value !== undefined && value !== false;
  const [retained, setRetained] = useState(isOpen ? value : null);
  const [isClosing, setIsClosing] = useState(false);
  const [generation, setGeneration] = useState(0);
  const elementRef = useRef(null);

  if (isOpen && (retained !== value || isClosing)) {
    if (isClosing) {
      setGeneration((current) => current + 1);
    }
    setRetained(value);
    setIsClosing(false);
  } else if (!isOpen && retained !== null && !isClosing) {
    setIsClosing(true);
  }

  const finishExit = useCallback(() => {
    setRetained(null);
    setIsClosing(false);
  }, []);
  useExitAnimation(elementRef, isClosing, finishExit);

  return {
    generation,
    isClosing,
    isMounted: retained !== null,
    rootProps: {
      ref: elementRef,
      "data-state": isClosing ? "closing" : "open",
      inert: isClosing || undefined,
      "aria-hidden": isClosing ? "true" : undefined,
    },
    value: retained,
  };
}

const PresenceContext = createContext(null);

const ALWAYS_OPEN = { isClosing: false, rootProps: {} };

/**
 * Renders `children(payload)` while `when` holds a payload and while the overlay it renders
 * animates out. The overlay reads `rootProps` and `isClosing` with `usePresenceContext()`.
 */
export function Presence({ when, children }) {
  const presence = usePresence(when);
  if (!presence.isMounted) {
    return null;
  }
  return createElement(
    PresenceContext.Provider,
    { key: presence.generation, value: presence },
    children(presence.value),
  );
}

// The presence of the overlay being rendered; outside `Presence` it is always open.
export function usePresenceContext() {
  return useContext(PresenceContext) ?? ALWAYS_OPEN;
}

// One callback ref that sets every ref given, for a root element that already had a ref.
export function useMergedRefs(...refs) {
  return useCallback((node) => {
    for (const ref of refs) {
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    }
  }, refs);
}
