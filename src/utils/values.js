export function clamp(value, minimum, maximum, fallback = minimum) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, minimum), maximum);
}

export function moveArrayItem(items, fromIndex, toIndex) {
  if (
    !Array.isArray(items) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return Array.isArray(items) ? [...items] : [];
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

export function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function nextAnimationFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

export function delay(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}
