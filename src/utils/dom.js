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
