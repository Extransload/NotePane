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
}

export function isNestedBlockNoteFloatingMenu(element) {
  return Boolean(element.parentElement?.closest(BLOCKNOTE_FLOATING_MENU_SELECTOR));
}

export function keepElementInsideViewport(element) {
  const computedStyle = window.getComputedStyle(element);
  if (
    computedStyle.display === "none" ||
    computedStyle.visibility === "hidden" ||
    Number(computedStyle.opacity) <= 0.01 ||
    element.getAttribute("aria-hidden") === "true"
  ) {
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
  const hasNestedFloatingMenu = Boolean(
    element.querySelector(
      ".bn-menu-dropdown, .mantine-Menu-dropdown, .mantine-Popover-dropdown",
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
  const left = clamp(
    rect.left,
    margin,
    Math.max(margin, viewportWidth - desiredWidth - margin),
  );
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

export function keepNestedElementInsideViewport(element) {
  const computedStyle = window.getComputedStyle(element);
  if (
    computedStyle.display === "none" ||
    computedStyle.visibility === "hidden" ||
    Number(computedStyle.opacity) <= 0.01 ||
    element.getAttribute("aria-hidden") === "true"
  ) {
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
