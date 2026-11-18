export function isPointInsideElement(event, element) {
  if (!(element instanceof Element)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

export function isVisibleElement(element) {
  if (!(element instanceof Element)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) > 0.01 &&
    rect.width > 0 &&
    rect.height > 0
  );
}

export function isEditableFormTarget(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select"));
}

export function isInsideDialog(target) {
  return target instanceof Element && Boolean(target.closest("[role='dialog']"));
}

/**
 * Arrow keys moving focus through `items` (focusable elements, in order), as in a menu or a
 * vertical tab list: Down and Up go to the next and previous item, wrapping at both ends, Home
 * and End to the first and last. A key with a modifier is left alone. Returns whether the key
 * moved focus.
 */
export function moveFocusAmongItems(event, items) {
  if (
    !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) ||
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
    items.length === 0
  ) {
    return false;
  }
  const index = items.indexOf(document.activeElement);
  let nextIndex = event.key === "Home" ? 0 : items.length - 1;
  if (event.key === "ArrowDown") {
    nextIndex = index < 0 ? 0 : (index + 1) % items.length;
  } else if (event.key === "ArrowUp") {
    nextIndex = index < 0 ? items.length - 1 : (index - 1 + items.length) % items.length;
  }
  event.preventDefault();
  items[nextIndex].focus();
  return true;
}

/**
 * moveFocusAmongItems over the elements matching `selector` inside the element that hears the
 * key, for a key pressed on one of them.
 */
export function moveFocusWithin(event, selector) {
  if (!(event.target instanceof Element) || !event.target.matches(selector)) {
    return false;
  }
  return moveFocusAmongItems(event, [...event.currentTarget.querySelectorAll(selector)]);
}
