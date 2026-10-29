import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

// Below this window width the expanded sidebar squeezes the editor, so the sidebar turns compact.
// CSS pixels, so the app zoom moves the breakpoint as it moves every other width.
export const NARROW_WINDOW_QUERY = "(max-width: 759.98px)";

function subscribeToQuery(query, onChange) {
  const list = window.matchMedia(query);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function useMediaQuery(query) {
  return useSyncExternalStore(
    useCallback((onChange) => subscribeToQuery(query, onChange), [query]),
    () => window.matchMedia(query).matches,
  );
}

/**
 * Whether the tabs sidebar is open. The user's choice in a wide window is kept as it is; a narrow
 * window shows the compact sidebar instead, until the user opens it there. That narrow-window
 * choice lasts until the window crosses the breakpoint again, so returning to a wide window
 * brings back the wide choice. `setIsSidebarOpen` takes a value or an updater, like a state
 * setter, and changes the choice of the width the window has now.
 */
export function useSidebarVisibility() {
  const isNarrow = useMediaQuery(NARROW_WINDOW_QUERY);
  const [isOpenWhenWide, setIsOpenWhenWide] = useState(true);
  const [narrowChoice, setNarrowChoice] = useState({ isNarrow, open: false });

  // Each crossing starts the narrow window compact again. Adjusted while rendering, so no frame
  // shows the choice made before the crossing.
  let isOpenWhenNarrow = narrowChoice.open;
  if (narrowChoice.isNarrow !== isNarrow) {
    isOpenWhenNarrow = false;
    setNarrowChoice({ isNarrow, open: false });
  }

  // The setter keeps one identity, as a state setter does, for callbacks that hold on to it.
  const isNarrowRef = useRef(isNarrow);
  isNarrowRef.current = isNarrow;
  const setIsSidebarOpen = useCallback((next) => {
    const resolve = (current) => (typeof next === "function" ? next(current) : next);
    if (isNarrowRef.current) {
      setNarrowChoice((choice) => ({ isNarrow: true, open: Boolean(resolve(choice.open)) }));
      return;
    }
    setIsOpenWhenWide((current) => Boolean(resolve(current)));
  }, []);

  return {
    isSidebarOpen: isNarrow ? isOpenWhenNarrow : isOpenWhenWide,
    setIsSidebarOpen,
  };
}
