const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const CONFIG_PATH = path.join(__dirname, "../../electron-builder.config.cjs");
const SIGNING_VARIABLES = ["CSC_LINK", "CSC_NAME", "NOTEPANE_DISABLE_UPDATES"];

function loadConfig(environment) {
  const saved = Object.fromEntries(SIGNING_VARIABLES.map((name) => [name, process.env[name]]));
  for (const name of SIGNING_VARIABLES) {
    delete process.env[name];
  }
  Object.assign(process.env, environment);
  try {
    delete require.cache[require.resolve(CONFIG_PATH)];
    return require(CONFIG_PATH);
  } finally {
    for (const name of SIGNING_VARIABLES) {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    }
  }
}

test("builds a drag-to-install dmg and an updater zip for both Mac architectures", () => {
  const config = loadConfig({});
  assert.deepEqual(config.mac.target, [
    { target: "dmg", arch: ["arm64", "x64"] },
    { target: "zip", arch: ["arm64", "x64"] },
  ]);
  assert.deepEqual(config.win.target, [{ target: "nsis", arch: ["x64"] }]);
});

test("lays out the installer window with the app, Applications and System Settings", () => {
  const config = loadConfig({});
  const fs = require("fs");
  const projectRoot = path.join(__dirname, "../..");
  assert.equal(config.dmg.background, "build/background.tiff");
  assert.ok(fs.existsSync(path.join(projectRoot, config.dmg.background)));
  assert.deepEqual(config.dmg.window, { width: 600, height: 600 });
  assert.deepEqual(config.dmg.contents, [
    { x: 190, y: 150 },
    { x: 410, y: 150, type: "link", path: "/Applications" },
    { x: 300, y: 356, type: "link", path: "/System/Applications/System Settings.app" },
  ]);
  // The background is for the installer window only, not for the app itself.
  assert.ok(config.files.includes("!build/background.tiff"));
});

test("ad-hoc signs a Mac build without a certificate and leaves auto-install off", () => {
  const config = loadConfig({});
  assert.equal(config.mac.identity, "-");
  assert.equal(config.mac.hardenedRuntime, false);
  assert.deepEqual(config.extraMetadata, { notepane: { updates: true, macAutoUpdate: false } });
});

test("signs with the provided certificate and turns Mac auto-install on", () => {
  for (const environment of [{ CSC_LINK: "certificate.p12" }, { CSC_NAME: "Developer ID Application: Example" }]) {
    const config = loadConfig(environment);
    assert.equal("identity" in config.mac, false);
    assert.equal("hardenedRuntime" in config.mac, false);
    assert.deepEqual(config.extraMetadata, { notepane: { updates: true, macAutoUpdate: true } });
  }
});

test("treats an empty certificate variable as no certificate", () => {
  const config = loadConfig({ CSC_LINK: "" });
  assert.equal(config.mac.identity, "-");
  assert.deepEqual(config.extraMetadata, { notepane: { updates: true, macAutoUpdate: false } });
});

test("turns update checks off for a development build", () => {
  const config = loadConfig({ NOTEPANE_DISABLE_UPDATES: "1" });
  assert.equal(config.extraMetadata.notepane.updates, false);
});

test("publishes to a draft GitHub release that the update check reads", () => {
  const config = loadConfig({});
  assert.deepEqual(config.publish, {
    provider: "github",
    owner: "Extransload",
    repo: "NotePane",
    releaseType: "draft",
  });
  const { RELEASES_URL } = require("../../electron/appUpdates.cjs");
  assert.equal(RELEASES_URL, `https://github.com/${config.publish.owner}/${config.publish.repo}/releases`);
});
