const test = require("node:test");
const assert = require("node:assert/strict");
const { fitBoundsToWorkAreas } = require("../../electron/windowBounds.cjs");

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
