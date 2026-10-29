import {
  createElement,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import { LinkToolbarController } from "@blocknote/react";
import { MantineProvider } from "@mantine/core";
import {
  clamp,
} from "../utils/values.js";
import { isEditorMotionAllowed, readMotionDuration } from "./editorMotion.js";

// How BlockNote's floating UI closes: a short fade (--notepane-motion-floating-close-duration in
// src/styles/editor-motion.css) that takes no pointer, so a click during it reaches the editor.
//
// BlockNote's popovers (slash menu, formatting toolbar, link toolbar) fade through floating-ui's
// useTransitionStyles and show a copy of their last content while they close; the options below are
// the controllers' supported way to set that close. The side menu's handles keep BlockNote's own
// close: it hides them whenever the editor scrolls, and the next pointer move over a block brings
// them back. The Mantine menus inside
// them (the six-dot menu, the table handle menus, the toolbar's dropdowns) close through Mantine's
// Transition, set by the theme of NotePaneMantineProvider.

// floating-ui's own default, which BlockNote keeps for opening.
const BLOCKNOTE_POPOVER_OPEN_DURATION = 250;

function readFloatingCloseDuration() {
  const root = document.documentElement;
  return isEditorMotionAllowed(root)
    ? readMotionDuration(root, "--notepane-motion-floating-close-duration")
    : 0;
}

export function createFloatingCloseOptions() {
  return {
    useTransitionStylesProps: {
      duration: { open: BLOCKNOTE_POPOVER_OPEN_DURATION, close: readFloatingCloseDuration() },
      close: { opacity: 0, pointerEvents: "none" },
    },
  };
}

// Menus open at once (src/styles/motion.css fades them in) and fade out without the pointer.
function createMantineTheme() {
  return {
    respectReducedMotion: true,
    components: {
      Popover: {
        defaultProps: {
          transitionProps: {
            transition: {
              in: { opacity: 1 },
              out: { opacity: 0, pointerEvents: "none" },
              transitionProperty: "opacity",
            },
            // Not 0: Mantine's Transition renders a zero-duration open through another branch, so
            // the close would remount the dropdown, and an autofocused field in it (the file
            // caption form) would take focus back from the editor while it fades.
            duration: 1,
            exitDuration: readFloatingCloseDuration(),
          },
        },
      },
    },
  };
}

// BlockNoteView uses a Mantine provider of its own only when there is none above it. This one has
// the same settings (no CSS variables on the document root, no root colour scheme attribute) plus
// the menu transition.
export function NotePaneMantineProvider({ children }) {
  const theme = useMemo(createMantineTheme, []);
  useEffect(() => observeClosingFloatingUI(document.body), []);
  return createElement(MantineProvider, {
    theme,
    withCssVariables: false,
    getRootElement: () => undefined,
  }, children);
}

export function NotePaneLinkToolbarController() {
  const floatingUIOptions = useMemo(createFloatingCloseOptions, []);
  return createElement(LinkToolbarController, { floatingUIOptions });
}

// BlockNote's floating UI: its floating-ui popovers (the slash menu, the toolbars), known by the
// z-index BlockNote gives them, whichever portal they render into, and the Mantine dropdowns inside
// them or the editor (the six-dot and table handle menus, the toolbar's dropdowns).
const BLOCKNOTE_POPOVER_SELECTOR = "[data-floating-ui-portal] > div[style*='--bn-ui-base-z-index']";
const BLOCKNOTE_FLOATING_UI_SELECTOR = [
  BLOCKNOTE_POPOVER_SELECTOR,
  `:is(${BLOCKNOTE_POPOVER_SELECTOR}, .bn-root) :is(.mantine-Popover-dropdown, .mantine-Menu-dropdown)`,
].join(", ");
const CLOSING_INERT_ATTRIBUTE = "data-notepane-closing-inert";

function takesNoPointer(element) {
  return element.style.pointerEvents === "none";
}

// While BlockNote's floating UI fades out (the close styles above take its pointer), it is inert and
// hidden from assistive tech too, so neither the keyboard nor a role lookup reaches what is
// leaving. BlockNote reuses a popover's element when it reopens during the fade, and Mantine its
// dropdown, so the marks come off as soon as the element takes the pointer again; only marks this
// set are removed. An element that never took the pointer (BlockNote's attribution tooltip, a
// dropdown in its first frame) is never marked.
export function observeClosingFloatingUI(root) {
  const seenOpen = new WeakSet();
  const update = (element) => {
    if (!takesNoPointer(element)) {
      seenOpen.add(element);
      if (element.hasAttribute(CLOSING_INERT_ATTRIBUTE)) {
        element.removeAttribute(CLOSING_INERT_ATTRIBUTE);
        element.inert = false;
        element.removeAttribute("aria-hidden");
      }
    } else if (seenOpen.has(element) && !element.inert) {
      element.setAttribute(CLOSING_INERT_ATTRIBUTE, "");
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }
  };
  const observer = new MutationObserver((records) => {
    for (const { type, target, addedNodes } of records) {
      const candidates = type === "attributes" ? [target] : addedNodes;
      for (const node of candidates) {
        if (!(node instanceof HTMLElement)) {
          continue;
        }
        // A portal mounts with its popover inside it, so an added node is searched too.
        if (node.matches(BLOCKNOTE_FLOATING_UI_SELECTOR)) {
          update(node);
        }
        if (type === "childList") {
          node.querySelectorAll(BLOCKNOTE_FLOATING_UI_SELECTOR).forEach(update);
        }
      }
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["style"],
  });
  return () => observer.disconnect();
}

const CLOSING_MENU_CLASS = "notepane-floating-menu-closing";

// When BlockNote hides the side menu or the table handles while their Mantine menu is open, the
// popover swaps in the copy of its content it took before the menu opened, so the menu would
// vanish at once instead of fading. A copy of the menu as it last looked fades out in its place.
// The copy takes no pointer, keyboard or accessibility focus. The copy is taken while the menu is
// still in the document, from the opacity it has reached, and shown only if React then removed the
// menu: a menu Mantine keeps to fade out itself, or one it already faded out, gets none.
export function fadeOutDetachedMenu(menu) {
  if (!menu?.isConnected || !isEditorMotionAllowed(menu)) {
    return;
  }
  const style = getComputedStyle(menu);
  const duration = readMotionDuration(menu, "--notepane-motion-floating-close-duration");
  if (Number(style.opacity) < 0.5 || !(duration > 0)) {
    return;
  }
  const rect = menu.getBoundingClientRect();
  const copy = menu.cloneNode(true);
  copy.inert = true;
  copy.setAttribute("aria-hidden", "true");
  copy.classList.add(CLOSING_MENU_CLASS);
  for (const element of [copy, ...copy.querySelectorAll("[id]")]) {
    element.removeAttribute("id");
  }
  const host = menu.closest(".bn-root") ?? menu.ownerDocument.body;
  queueMicrotask(() => {
    if (!menu.isConnected && host.isConnected) {
      showClosingCopy(menu, copy, host, rect, style.opacity, duration);
    }
  });
}

function showClosingCopy(menu, copy, host, rect, opacity, duration) {
  host.append(copy);
  const containingRect = getFixedPositionContainingRect(copy);
  for (const [property, value] of Object.entries({
    position: "fixed",
    left: `${rect.left - containingRect.left}px`,
    top: `${rect.top - containingRect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    "box-sizing": "border-box",
    margin: "0",
    transform: "none",
    animation: "none",
    "pointer-events": "none",
  })) {
    copy.style.setProperty(property, value, "important");
  }
  const fade = copy.animate([{ opacity }, { opacity: 0 }], {
    duration,
    easing: getComputedStyle(host).getPropertyValue("--notepane-motion-ease-out").trim() || "ease-out",
    fill: "forwards",
  });
  fade.onfinish = () => copy.remove();
  fade.oncancel = () => copy.remove();
}

// Rendered inside a menu's dropdown: it mounts when the menu opens and its cleanup runs before
// React takes the dropdown out of the document.
export function useFadeOutWhenDetached(menuSelector) {
  useLayoutEffect(() => {
    const menu = document.querySelector(`${menuSelector}:not(.${CLOSING_MENU_CLASS})`);
    return () => fadeOutDetachedMenu(menu);
  }, [menuSelector]);
}

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
      element.closest(`.editor-floating-menu, .${CLOSING_MENU_CLASS}`)
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
