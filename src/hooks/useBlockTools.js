import {
  useLayoutEffect,
  useState,
} from "react";

const EDITOR_SURFACE_SELECTOR = "[data-testid='sticky-editor-surface']";

/**
 * The blocks of the given content types in the note, as { blockId, element }, `element` being
 * the block's content. Kept in step with the editor's DOM, so a re-rendered block hands over its
 * new element.
 */
export function useBlockToolTargets(contentTypes) {
  const [targets, setTargets] = useState([]);

  useLayoutEffect(() => {
    const editorSurface = document.querySelector(EDITOR_SURFACE_SELECTOR);
    if (!editorSurface) {
      return undefined;
    }
    const selector = contentTypes
      .map((type) => `.bn-block-content[data-content-type='${type}']`)
      .join(", ");

    let animationFrame = null;
    const syncTargets = () => {
      animationFrame = null;
      const nextTargets = [...editorSurface.querySelectorAll(selector)].flatMap((element) => {
        const blockId = element.closest(".bn-block-outer[data-id]")?.dataset.id;
        return blockId ? [{ blockId, element }] : [];
      });

      setTargets((currentTargets) => {
        const unchanged =
          currentTargets.length === nextTargets.length &&
          currentTargets.every(
            (target, index) =>
              target.blockId === nextTargets[index].blockId &&
              target.element === nextTargets[index].element,
          );
        return unchanged ? currentTargets : nextTargets;
      });
    };
    const scheduleSync = () => {
      if (animationFrame !== null) {
        return;
      }
      animationFrame = window.requestAnimationFrame(syncTargets);
    };

    syncTargets();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(editorSurface, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
    // The content types are a module constant of each caller.
  }, []);

  return targets;
}

/**
 * Where a tool bar sits on the top-right corner of `anchorElement`, in the editor surface's
 * scroll coordinates (the bar is translated left by its own width in CSS); null until placed.
 * Placed again whenever the block, the surface or the note's layout changes.
 */
export function useBlockToolPosition(anchorElement) {
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    const editorSurface = anchorElement?.closest(EDITOR_SURFACE_SELECTOR);
    if (!editorSurface) {
      return undefined;
    }

    const updatePosition = () => {
      const anchorRect = anchorElement.getBoundingClientRect();
      const surfaceRect = editorSurface.getBoundingClientRect();
      const nextPosition = {
        top: anchorRect.top - surfaceRect.top + editorSurface.scrollTop + 8,
        left: anchorRect.right - surfaceRect.left + editorSurface.scrollLeft - 9,
      };
      setPosition((currentPosition) =>
        currentPosition &&
        Math.abs(currentPosition.top - nextPosition.top) < 0.5 &&
        Math.abs(currentPosition.left - nextPosition.left) < 0.5
          ? currentPosition
          : nextPosition,
      );
    };

    updatePosition();
    const editorDocument = anchorElement.closest(".bn-editor");
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(anchorElement);
    resizeObserver.observe(editorSurface);
    if (editorDocument) {
      resizeObserver.observe(editorDocument);
    }
    const layoutObserver = new MutationObserver(updatePosition);
    if (editorDocument) {
      layoutObserver.observe(editorDocument, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    window.addEventListener("resize", updatePosition);
    // A new block rises in without resizing, so the tool bar is placed again once it settles.
    editorDocument?.addEventListener("animationend", updatePosition);
    return () => {
      resizeObserver.disconnect();
      layoutObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
      editorDocument?.removeEventListener("animationend", updatePosition);
    };
  }, [anchorElement]);

  return position;
}

/** Whether the pointer is on `element`, followed by its pointer enter and leave. */
export function useHovered(element) {
  const [isHovered, setHovered] = useState(false);

  useLayoutEffect(() => {
    if (!element) {
      return undefined;
    }
    const show = () => setHovered(true);
    const hide = () => setHovered(false);
    setHovered(element.matches(":hover"));
    element.addEventListener("pointerenter", show);
    element.addEventListener("pointerleave", hide);
    return () => {
      element.removeEventListener("pointerenter", show);
      element.removeEventListener("pointerleave", hide);
    };
  }, [element]);

  return isHovered;
}
