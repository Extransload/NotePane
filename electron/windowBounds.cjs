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

module.exports = { fitBoundsToWorkAreas };
