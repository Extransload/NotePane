// A window counts as reachable when this much of its top edge, where the drag
// header lives, lies inside a display's work area.
const MIN_VISIBLE_HEADER_WIDTH = 80;
const HEADER_HEIGHT = 40;

/**
 * Returns `bounds` unchanged when the window's header is on a connected
 * display, and otherwise moves (and if needed shrinks) it into the display it
 * overlaps most, falling back to the first work area, which callers pass as
 * the primary display. Saved positions can point at a monitor that has since
 * been unplugged, which would otherwise reopen the window off-screen.
 */
function fitBoundsToWorkAreas(bounds, workAreas) {
  if (
    !Number.isFinite(bounds?.x) ||
    !Number.isFinite(bounds?.y) ||
    !Array.isArray(workAreas) ||
    workAreas.length === 0
  ) {
    return bounds;
  }

  const header = { x: bounds.x, y: bounds.y, width: bounds.width, height: HEADER_HEIGHT };
  const isHeaderVisible = workAreas.some((area) => {
    const overlap = intersect(header, area);
    return overlap.width >= MIN_VISIBLE_HEADER_WIDTH && overlap.height >= HEADER_HEIGHT;
  });
  if (isHeaderVisible) {
    return bounds;
  }

  const target = workAreas.reduce((best, area) =>
    area === best || overlapArea(bounds, area) <= overlapArea(bounds, best) ? best : area,
  workAreas[0]);
  const width = Math.min(bounds.width, target.width);
  const height = Math.min(bounds.height, target.height);
  return {
    ...bounds,
    x: clamp(bounds.x, target.x, target.x + target.width - width),
    y: clamp(bounds.y, target.y, target.y + target.height - height),
    width,
    height,
  };
}

/**
 * Bounds for a note being detached out of the tabs window. The tabs window
 * saves its own bounds into the note it shows, and notes created in tabs mode
 * start with those bounds, so a detached note would otherwise open exactly on
 * top of the tabs window and look as if nothing happened. When the note has no
 * position, or its position is within `offset` of the tabs window origin, it
 * opens at sticky size, `offset` pixels down and right of the tabs window, kept
 * inside the work area of the display showing the tabs window. A note that
 * already has its own distinct position keeps it.
 */
function getDetachedWindowBounds(noteBounds, tabsBounds, workAreas, options) {
  const { offset, width, height } = options;
  if (
    !Number.isFinite(tabsBounds?.x) ||
    !Number.isFinite(tabsBounds?.y) ||
    !Array.isArray(workAreas) ||
    workAreas.length === 0
  ) {
    return noteBounds;
  }

  const hasPosition = Number.isFinite(noteBounds?.x) && Number.isFinite(noteBounds?.y);
  if (
    hasPosition &&
    (Math.abs(noteBounds.x - tabsBounds.x) >= offset ||
      Math.abs(noteBounds.y - tabsBounds.y) >= offset)
  ) {
    return noteBounds;
  }

  const area = workAreas.reduce((best, candidate) =>
    overlapArea(tabsBounds, candidate) > overlapArea(tabsBounds, best) ? candidate : best,
  workAreas[0]);
  const fittedWidth = Math.min(width, area.width);
  const fittedHeight = Math.min(height, area.height);
  return {
    x: clamp(tabsBounds.x + offset, area.x, area.x + area.width - fittedWidth),
    y: clamp(tabsBounds.y + offset, area.y, area.y + area.height - fittedHeight),
    width: fittedWidth,
    height: fittedHeight,
  };
}

function intersect(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  return {
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - left),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - top),
  };
}

function overlapArea(a, b) {
  const { width, height } = intersect(a, b);
  return width * height;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

module.exports = { fitBoundsToWorkAreas, getDetachedWindowBounds };
