const { EventEmitter } = require("events");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  UPDATE_CHECK_INTERVAL_MS,
  compareVersions,
  resolveUpdateMode,
  startAppUpdates,
} = require("../../electron/appUpdates.cjs");

test("orders release versions by their numbers, not as text", () => {
  assert.equal(compareVersions("0.10.0", "0.9.2"), 1);
  assert.equal(compareVersions("0.9.2", "0.10.0"), -1);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("v1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("1.2", "1.2.0"), 0);
  assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
  assert.equal(compareVersions("1.0.0-beta.1", "1.0.0"), -1);
  assert.equal(compareVersions("1.0.0", "1.0.0-beta.1"), 1);
});

test("checks for updates only in an enabled packaged app on a platform that ships one", () => {
  const packaged = { isPackaged: true, enabled: true };
  assert.equal(resolveUpdateMode({ ...packaged, isPackaged: false, platform: "win32" }), "off");
  assert.equal(resolveUpdateMode({ ...packaged, enabled: false, platform: "win32" }), "off");
  assert.equal(resolveUpdateMode({ ...packaged, platform: "linux", macAutoUpdate: true }), "off");
  assert.equal(resolveUpdateMode({ ...packaged, platform: "win32", macAutoUpdate: false }), "auto");
  assert.equal(resolveUpdateMode({ ...packaged, platform: "darwin", macAutoUpdate: true }), "auto");
  assert.equal(resolveUpdateMode({ ...packaged, platform: "darwin", macAutoUpdate: false }), "self");
});

test("never loads the updater when updates are off", () => {
  let loaded = false;
  const result = startAppUpdates({
    mode: "off",
    loadUpdater: () => {
      loaded = true;
    },
  });
  assert.equal(result, null);
  assert.equal(loaded, false);
});

test("downloads and installs automatically, and checks again on an interval", async () => {
  const harness = createHarness({ mode: "auto" });
  await harness.started.check();
  assert.equal(harness.updater.autoDownload, true);
  // Once when started, once from the explicit check above.
  assert.equal(harness.updater.calls.checkForUpdatesAndNotify, 2);
  assert.equal(harness.updater.calls.checkForUpdates, 0);
  assert.deepEqual(harness.scheduled.map(({ delay }) => delay), [UPDATE_CHECK_INTERVAL_MS]);
  assert.equal(harness.scheduled[0].unrefCalled, true);
});

test("hands each release a check finds to the Mac self-updater, which downloads it", async () => {
  const harness = createHarness({ mode: "self" });
  assert.equal(harness.updater.autoDownload, false);
  assert.equal(harness.updater.calls.checkForUpdates, 1);
  assert.equal(harness.updater.calls.checkForUpdatesAndNotify, 0);

  const updateInfo = { version: "0.2.0", files: [] };
  harness.updater.emit("update-available", updateInfo);
  harness.updater.emit("update-available", updateInfo);
  assert.deepEqual(harness.available, [updateInfo, updateInfo]);
});

test("Windows hands nothing to the Mac self-updater", () => {
  const harness = createHarness({ mode: "auto" });
  harness.updater.emit("update-available", { version: "0.2.0" });
  assert.deepEqual(harness.available, []);
});

test("logs each failed check once instead of throwing", async () => {
  const harness = createHarness({ mode: "auto", failChecks: true });
  await harness.started.check();
  await harness.settle();
  // One startup check and one explicit check, each reported once.
  assert.deepEqual(harness.warnings, [
    "Update check failed: offline",
    "Update check failed: offline",
  ]);
});

test("a check from the About page resolves with the newest published version", async () => {
  for (const mode of ["auto", "self"]) {
    const harness = createHarness({ mode, latestVersion: "0.4.0" });
    const startupCalls = { ...harness.updater.calls };
    assert.equal(await harness.started.checkNow(), "0.4.0");
    assert.equal(harness.updater.calls.checkForUpdates, startupCalls.checkForUpdates + 1, mode);
  }
  const noRelease = createHarness({ mode: "auto" });
  assert.equal(await noRelease.started.checkNow(), null);
});

test("a check from the About page rejects when the check fails", async () => {
  const harness = createHarness({ mode: "self", failChecks: true });
  await assert.rejects(harness.started.checkNow(), /offline/);
});

test("replaces the updater's own console logging", () => {
  const harness = createHarness({ mode: "self" });
  assert.equal(harness.updater.logger, null);
});

function createHarness({ mode, failChecks = false, latestVersion = null }) {
  const updater = new EventEmitter();
  updater.autoDownload = true;
  updater.logger = console;
  updater.calls = { checkForUpdates: 0, checkForUpdatesAndNotify: 0 };
  // Like electron-updater, a failed check emits "error" and also rejects.
  const respond = (name) => {
    updater.calls[name] += 1;
    if (!failChecks) {
      return Promise.resolve(latestVersion ? { updateInfo: { version: latestVersion } } : null);
    }
    const error = new Error("offline");
    updater.emit("error", error);
    return Promise.reject(error);
  };
  updater.checkForUpdates = () => respond("checkForUpdates");
  updater.checkForUpdatesAndNotify = () => respond("checkForUpdatesAndNotify");

  const available = [];
  const warnings = [];
  const scheduled = [];
  const started = startAppUpdates({
    mode,
    loadUpdater: () => updater,
    onUpdateAvailable: (updateInfo) => available.push(updateInfo),
    log: { warn: (message) => warnings.push(message) },
    schedule: (callback, delay) => {
      const timer = {
        callback,
        delay,
        unrefCalled: false,
        unref() {
          this.unrefCalled = true;
        },
      };
      scheduled.push(timer);
      return timer;
    },
  });

  return {
    updater,
    started,
    available,
    warnings,
    scheduled,
    settle: () => new Promise((resolve) => setImmediate(resolve)),
  };
}
