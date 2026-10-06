const test = require("node:test");
const assert = require("node:assert/strict");
const { fitBoundsToWorkAreas, getDetachedWindowBounds } = require("../../electron/windowBounds.cjs");

const primary = { x: 0, y: 25, width: 1440, height: 875 };
const rightMonitor = { x: 1440, y: 0, width: 1920, height: 1080 };

test("keeps a window that is already on a display", () => {
  const bounds = { x: 100, y: 120, width: 960, height: 720 };

  assert.deepEqual(fitBoundsToWorkAreas(bounds, [primary, rightMonitor]), bounds);
});

test("keeps a window on a secondary display that is still connected", () => {
  const bounds = { x: 2000, y: 200, width: 960, height: 720 };

  assert.deepEqual(fitBoundsToWorkAreas(bounds, [primary, rightMonitor]), bounds);
});

test("moves a window from a disconnected display onto the primary display", () => {
  const fitted = fitBoundsToWorkAreas(
    { x: 2000, y: 200, width: 960, height: 720 },
    [primary],
  );

  assert.deepEqual(fitted, { x: 480, y: 180, width: 960, height: 720 });
});

test("pulls a window whose title area is above the display back down", () => {
  const fitted = fitBoundsToWorkAreas(
    { x: 100, y: -600, width: 960, height: 720 },
    [primary],
  );

  assert.deepEqual(fitted, { x: 100, y: 25, width: 960, height: 720 });
});

test("shrinks a window that is larger than the display it is moved to", () => {
  const fitted = fitBoundsToWorkAreas(
    { x: 5000, y: 5000, width: 2400, height: 1800 },
    [primary],
  );

  assert.deepEqual(fitted, { x: 0, y: 25, width: 1440, height: 875 });
});

test("leaves bounds without a position for the platform to place", () => {
  const bounds = { width: 960, height: 720 };

  assert.deepEqual(fitBoundsToWorkAreas(bounds, [primary]), bounds);
});

const detachedOptions = { offset: 40, width: 420, height: 340 };

test("opens a detached note stored at the tabs window position beside it at sticky size", () => {
  const tabsBounds = { x: 160, y: 120, width: 960, height: 720 };

  assert.deepEqual(
    getDetachedWindowBounds({ ...tabsBounds }, tabsBounds, [primary], detachedOptions),
    { x: 200, y: 160, width: 420, height: 340 },
  );
});

test("opens a detached note without a stored position beside the tabs window", () => {
  const tabsBounds = { x: 160, y: 120, width: 960, height: 720 };

  assert.deepEqual(
    getDetachedWindowBounds({ width: 960, height: 720 }, tabsBounds, [primary], detachedOptions),
    { x: 200, y: 160, width: 420, height: 340 },
  );
});

test("keeps a detached note's own position when it does not overlap the tabs window origin", () => {
  const noteBounds = { x: 900, y: 400, width: 420, height: 340 };

  assert.deepEqual(
    getDetachedWindowBounds(noteBounds, { x: 160, y: 120, width: 960, height: 720 }, [primary], detachedOptions),
    noteBounds,
  );
});

test("keeps the offset detached window inside the tabs window's display", () => {
  const tabsBounds = { x: 1000, y: 520, width: 440, height: 380 };

  assert.deepEqual(
    getDetachedWindowBounds({ ...tabsBounds }, tabsBounds, [primary, rightMonitor], detachedOptions),
    { x: 1020, y: 560, width: 420, height: 340 },
  );
});
