import {
  useEffect,
} from "react";
import {
  clamp,
} from "../utils/values.js";

export const FLOATING_EDITOR_MENU_MARGIN = 8;

export const FLOATING_EDITOR_MENU_GAP = 5;

export const BLOCKNOTE_FLOATING_MENU_SELECTOR = [
  ".bn-menu-dropdown",
  ".mantine-Popover-dropdown",
  "[data-menu-dropdown='true']",
].join(", ");

export const BLOCKNOTE_NESTED_COLOR_ITEM_SELECTOR = [
  ".bn-color-picker-dropdown [data-test^='text-color-']",
  ".bn-color-picker-dropdown [data-test^='background-color-']",
].join(", ");

// A block menu's Turn into and Colors panel, which opens beside the menu inside it.
const BLOCK_MENU_SUBPANEL_SELECTOR = ".notepane-block-menu-subpanel";

export const BLOCKNOTE_VISIBLE_OVERFLOW_MENU_SELECTOR = [
  ".bn-drag-handle-menu",
  ".bn-table-handle-menu",
].join(", ");

export function useBlockNoteFloatingMenuGuard() {
  useEffect(() => {
    let animationFrame = 0;

    const schedulePositionUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = window.requestAnimationFrame(repositionBlockNoteFloatingMenus);
      });
    };
    const scheduleDelayedPositionUpdate = (event) => {
      if (isBlockNoteFloatingMenuInteraction(event)) {
        return;
      }

      schedulePositionUpdate();
      window.setTimeout(schedulePositionUpdate, 0);
      window.setTimeout(schedulePositionUpdate, 80);
      window.setTimeout(schedulePositionUpdate, 180);
    };

    const observer = new MutationObserver(schedulePositionUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", schedulePositionUpdate);
    window.addEventListener("scroll", scheduleDelayedPositionUpdate, true);
    document.addEventListener("mousedown", scheduleDelayedPositionUpdate, true);
    document.addEventListener(
      "pointerup",
      dispatchBlockNoteColorItemClick,
      true,
    );
    document.addEventListener("pointerup", scheduleDelayedPositionUpdate, true);
    document.addEventListener("click", scheduleDelayedPositionUpdate);
    document.addEventListener("keydown", scheduleDelayedPositionUpdate, true);
    document.addEventListener("selectionchange", scheduleDelayedPositionUpdate);
    scheduleDelayedPositionUpdate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", schedulePositionUpdate);
      window.removeEventListener("scroll", scheduleDelayedPositionUpdate, true);
      document.removeEventListener("mousedown", scheduleDelayedPositionUpdate, true);
      document.removeEventListener(
        "pointerup",
        dispatchBlockNoteColorItemClick,
        true,
      );
      document.removeEventListener("pointerup", scheduleDelayedPositionUpdate, true);
      document.removeEventListener("click", scheduleDelayedPositionUpdate);
      document.removeEventListener("keydown", scheduleDelayedPositionUpdate, true);
      document.removeEventListener("selectionchange", scheduleDelayedPositionUpdate);
    };
  }, []);
}

export function dispatchBlockNoteColorItemClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const colorItem = target.closest(BLOCKNOTE_NESTED_COLOR_ITEM_SELECTOR);
  if (!(colorItem instanceof HTMLElement)) {
    return;
  }

  const colorMenu = colorItem.closest(".bn-color-picker-dropdown");
  if (!colorMenu) {
    return;
  }
  if (colorMenu.classList.contains("notion-color-picker-dropdown")) {
    return;
  }

  colorItem.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    }),
  );
}

export function isBlockNoteFloatingMenuInteraction(event) {
  const target = event?.target;
  return target instanceof Element && Boolean(target.closest(BLOCKNOTE_FLOATING_MENU_SELECTOR));
}

export function repositionBlockNoteFloatingMenus() {
  for (const element of document.querySelectorAll(BLOCKNOTE_FLOATING_MENU_SELECTOR)) {
    if (
      !(element instanceof HTMLElement) ||
      element.closest(".editor-floating-menu")
    ) {
      continue;
    }

    if (isNestedBlockNoteFloatingMenu(element)) {
      keepNestedElementInsideViewport(element);
      continue;
    }

    keepElementInsideViewport(element);
  }

  for (const subpanel of document.querySelectorAll(BLOCK_MENU_SUBPANEL_SELECTOR)) {
    keepSubpanelInsideViewport(subpanel);
  }
}

// The subpanel moves up on its own until it fits the window, so its menu, and the item under the
// pointer, stay where they are.
export function keepSubpanelInsideViewport(element) {
  element.style.removeProperty("top");
  const rect = element.getBoundingClientRect();
  const margin = FLOATING_EDITOR_MENU_MARGIN;
  const overflow = rect.bottom - (window.innerHeight - margin);
  if (overflow > 0) {
    element.style.top = `${-Math.max(0, Math.min(overflow, rect.top - margin))}px`;
  }
}

// A menu fading in (src/styles/motion.css) starts transparent; it is already shown and placed.
const MENU_ENTRANCE_ANIMATION = "notepaneMenuFadeIn";

function isEnteringMenu(element) {
  return element.getAnimations().some(
    (animation) => animation.animationName === MENU_ENTRANCE_ANIMATION,
  );
}

function isHiddenFloatingMenu(element, computedStyle) {
  return (
    computedStyle.display === "none" ||
    computedStyle.visibility === "hidden" ||
    (Number(computedStyle.opacity) <= 0.01 && !isEnteringMenu(element)) ||
    element.getAttribute("aria-hidden") === "true"
  );
}

export function isNestedBlockNoteFloatingMenu(element) {
  return Boolean(element.parentElement?.closest(BLOCKNOTE_FLOATING_MENU_SELECTOR));
}

export function keepElementInsideViewport(element) {
  const computedStyle = window.getComputedStyle(element);
  if (isHiddenFloatingMenu(element, computedStyle)) {
    return;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || element.scrollHeight <= 0) {
    return;
  }

  const margin = FLOATING_EDITOR_MENU_MARGIN;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxWidth = Math.max(1, viewportWidth - margin * 2);
  const maxHeight = Math.max(80, viewportHeight - margin * 2);
  // A nested menu or subpanel overflows its menu on purpose and keeps itself inside the window,
  // so it does not count toward the menu's own size.
  const hasNestedFloatingMenu = Boolean(
    element.querySelector(
      `.bn-menu-dropdown, .mantine-Menu-dropdown, .mantine-Popover-dropdown, ${BLOCK_MENU_SUBPANEL_SELECTOR}`,
    ),
  );
  const measuredWidth = hasNestedFloatingMenu
    ? rect.width
    : Math.max(rect.width, element.scrollWidth || rect.width);
  const measuredHeight = hasNestedFloatingMenu
    ? rect.height
    : Math.max(rect.height, element.scrollHeight || rect.height);
  const desiredWidth = Math.min(
    measuredWidth,
    maxWidth,
  );
  const desiredHeight = Math.min(
    measuredHeight,
    maxHeight,
  );
  let left = clamp(
    rect.left,
    margin,
    Math.max(margin, viewportWidth - desiredWidth - margin),
  );
  if (element.matches(BLOCK_MENU_SELECTOR)) {
    left = keepBlockMenuInsideEditorSurface(element, left, desiredWidth);
  }
  const top = clamp(
    rect.top,
    margin,
    Math.max(margin, viewportHeight - desiredHeight - margin),
  );
  const containingRect = getFixedPositionContainingRect(element);
  const allowsVisibleOverflow =
    hasNestedFloatingMenu || element.matches(BLOCKNOTE_VISIBLE_OVERFLOW_MENU_SELECTOR);

  setImportantStyle(element, "position", "fixed");
  setImportantStyle(element, "transform", "none");
  setImportantStyle(element, "left", `${left - containingRect.left}px`);
  setImportantStyle(element, "top", `${top - containingRect.top}px`);
  setImportantStyle(element, "max-width", `${maxWidth}px`);
  setImportantStyle(element, "max-height", `${maxHeight}px`);
  setImportantStyle(element, "overflow", allowsVisibleOverflow ? "visible" : "auto");
}

const BLOCK_MENU_SELECTOR = ".bn-drag-handle-menu";

// The six-dot block menu opens on the left of its handle. Beside the sidebar there is no room
// for it there inside the editor surface, so it opens on the right of the handle instead.
function keepBlockMenuInsideEditorSurface(element, left, width) {
  const surface = document.querySelector(".sticky-editor-surface");
  const sideMenu = element.closest(".bn-side-menu");
  if (!surface || !sideMenu) {
    return left;
  }

  const margin = FLOATING_EDITOR_MENU_MARGIN;
  const surfaceRect = surface.getBoundingClientRect();
  const minLeft = surfaceRect.left + margin;
  if (left >= minLeft) {
    return left;
  }

  const maxLeft = Math.max(
    minLeft,
    Math.min(surfaceRect.right, window.innerWidth) - width - margin,
  );
  return clamp(
    sideMenu.getBoundingClientRect().right + FLOATING_EDITOR_MENU_GAP,
    minLeft,
    maxLeft,
  );
}

export function keepNestedElementInsideViewport(element) {
  const computedStyle = window.getComputedStyle(element);
  if (isHiddenFloatingMenu(element, computedStyle)) {
    return;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || element.scrollHeight <= 0) {
    return;
  }

  const margin = FLOATING_EDITOR_MENU_MARGIN;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxWidth = Math.max(1, viewportWidth - margin * 2);
  const maxHeight = Math.max(80, viewportHeight - margin * 2);
  const currentLeft = Number.parseFloat(computedStyle.left);
  const currentTop = Number.parseFloat(computedStyle.top);
  const baseLeft = Number.isFinite(currentLeft) ? currentLeft : 0;
  const baseTop = Number.isFinite(currentTop) ? currentTop : 0;
  let nextLeft = baseLeft;
  let nextTop = baseTop;

  if (rect.right > viewportWidth - margin) {
    nextLeft -= rect.right - (viewportWidth - margin);
  }
  if (rect.left + (nextLeft - baseLeft) < margin) {
    nextLeft += margin - (rect.left + (nextLeft - baseLeft));
  }
  if (rect.bottom > viewportHeight - margin) {
    nextTop -= rect.bottom - (viewportHeight - margin);
  }
  if (rect.top + (nextTop - baseTop) < margin) {
    nextTop += margin - (rect.top + (nextTop - baseTop));
  }

  setImportantStyle(element, "transform", "none");
  setImportantStyle(element, "left", `${nextLeft}px`);
  setImportantStyle(element, "top", `${nextTop}px`);
  setImportantStyle(element, "max-width", `${maxWidth}px`);
  setImportantStyle(element, "max-height", `${maxHeight}px`);
  setImportantStyle(element, "overflow", "auto");
}

export function setImportantStyle(element, property, value) {
  if (
    element.style.getPropertyValue(property) === value &&
    element.style.getPropertyPriority(property) === "important"
  ) {
    return;
  }

  element.style.setProperty(property, value, "important");
}

export function getFixedPositionContainingRect(element) {
  let parent = element.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    if (
      style.transform !== "none" ||
      style.perspective !== "none" ||
      style.filter !== "none" ||
      style.backdropFilter !== "none" ||
      style.willChange.includes("transform")
    ) {
      const rect = parent.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
      };
    }
    parent = parent.parentElement;
  }

  return {
    left: 0,
    top: 0,
  };
}
