const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  INSTALL_SCRIPT,
  bundlePathFor,
  canReplaceBundle,
  createMacSelfUpdater,
  findMacZip,
} = require("../../electron/macSelfUpdate.cjs");

const RELEASES = "https://github.com/Extransload/NotePane/releases";

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "notepane-self-update-"));
}

function writeBundle(bundle, marker) {
  fs.mkdirSync(path.join(bundle, "Contents", "MacOS"), { recursive: true });
  fs.writeFileSync(path.join(bundle, "Contents", "marker.txt"), marker);
}

test("picks the release's Mac zip for this architecture", () => {
  const files = [
    { url: "NotePane-0.5.1-arm64-mac.zip", sha512: "a" },
    { url: "NotePane-0.5.1-arm64.dmg", sha512: "b" },
  ];
  assert.equal(findMacZip(files, "arm64")?.sha512, "a");
  assert.equal(findMacZip(files, "x64"), null);
  assert.equal(findMacZip(undefined, "arm64"), null);
});

// The updater only runs in the Mac app, where bundle paths are POSIX paths.
const MAC_ONLY = { skip: process.platform === "win32" && "macOS bundle paths" };

test("finds the bundle an executable runs from", MAC_ONLY, () => {
  assert.equal(
    bundlePathFor("/Applications/NotePane.app/Contents/MacOS/NotePane"),
    "/Applications/NotePane.app",
  );
  assert.equal(bundlePathFor("/usr/local/bin/electron"), null);
});

test("replaces only a bundle it can write, outside a disk image or translocation", () => {
  const allowed = () => {};
  const denied = () => {
    throw new Error("EACCES");
  };
  assert.equal(canReplaceBundle("/Applications/NotePane.app", allowed), true);
  assert.equal(canReplaceBundle("/Applications/NotePane.app", denied), false);
  assert.equal(canReplaceBundle("/Volumes/NotePane 0.5.0/NotePane.app", allowed), false);
  assert.equal(
    canReplaceBundle("/private/var/folders/x/AppTranslocation/ABC/d/NotePane.app", allowed),
    false,
  );
  assert.equal(canReplaceBundle(null, allowed), false);
});

function createHarness({ zipBytes = Buffer.from("zip bytes"), listedSha512, unpackedVersion = "0.5.1", access }) {
  const tempDir = temporaryDirectory();
  const states = [];
  const runs = [];
  const spawned = [];
  const updater = createMacSelfUpdater({
    releasesUrl: RELEASES,
    execPath: "/Applications/NotePane.app/Contents/MacOS/NotePane",
    arch: "arm64",
    pid: 4242,
    tempDir,
    access: access ?? (() => {}),
    fetch: async (url) => {
      runs.push(["fetch", url]);
      return new Response(zipBytes);
    },
    run: async (command, args) => {
      runs.push([command, ...args]);
      if (command === "/usr/bin/ditto") {
        writeBundle(path.join(args[3], "NotePane.app"), "new");
      }
      return { stdout: command === "/usr/bin/plutil" ? `${unpackedVersion}\n` : "" };
    },
    spawnDetached: (command, args) => spawned.push([command, ...args]),
    onState: (state) => states.push(state),
  });
  const sha512 = listedSha512 ?? crypto.createHash("sha512").update(zipBytes).digest("base64");
  const updateInfo = {
    version: "0.5.1",
    files: [{ url: "NotePane-0.5.1-arm64-mac.zip", sha512 }],
  };
  return { updater, updateInfo, states, runs, spawned, tempDir };
}

test("downloads, checks and unpacks a release, then installs it as the app quits", MAC_ONLY, async () => {
  const harness = createHarness({});
  await harness.updater.prepare(harness.updateInfo);
  // Downloading (with its progress), then checking the download, then ready.
  const statuses = harness.states.map(({ status }) => status)
    .filter((status, index, all) => status !== all[index - 1]);
  assert.deepEqual(statuses, ["downloading", "verifying", "ready"]);
  const progress = harness.states.filter(({ status }) => status === "downloading");
  assert.equal(progress[0].downloaded, 0);
  assert.equal(progress.at(-1).downloaded, Buffer.from("zip bytes").length);
  assert.equal(harness.updater.isReady(), true);
  assert.deepEqual(harness.runs[0], [
    "fetch",
    `${RELEASES}/download/v0.5.1/NotePane-0.5.1-arm64-mac.zip`,
  ]);

  // A later check that finds the same release fetches nothing.
  await harness.updater.prepare(harness.updateInfo);
  assert.equal(harness.runs.filter(([name]) => name === "fetch").length, 1);

  assert.equal(harness.updater.launchInstaller(), true);
  const [[shell, script, pid, oldBundle, newBundle, opener]] = harness.spawned;
  assert.equal(shell, "/bin/sh");
  assert.equal(fs.readFileSync(script, "utf8"), INSTALL_SCRIPT);
  assert.equal(pid, "4242");
  assert.equal(oldBundle, "/Applications/NotePane.app");
  assert.equal(fs.readFileSync(path.join(newBundle, "Contents", "marker.txt"), "utf8"), "new");
  assert.equal(opener, "/usr/bin/open");
});

test("refuses a download that does not match the release's checksum", async () => {
  const harness = createHarness({ listedSha512: "not-the-hash" });
  await harness.updater.prepare(harness.updateInfo);
  assert.equal(harness.updater.getState().status, "error");
  assert.match(harness.updater.getState().message, /does not match/);
  assert.equal(harness.updater.isReady(), false);
  assert.equal(harness.updater.launchInstaller(), false);
  assert.equal(harness.runs.some(([command]) => command === "/usr/bin/ditto"), false);
});

test("refuses an unpacked app of another version", async () => {
  const harness = createHarness({ unpackedVersion: "0.5.0" });
  await harness.updater.prepare(harness.updateInfo);
  assert.equal(harness.updater.getState().status, "error");
  assert.equal(harness.updater.isReady(), false);
});

test("leaves a copy it cannot replace to the release page", async () => {
  const harness = createHarness({
    access: () => {
      throw new Error("EACCES");
    },
  });
  await harness.updater.prepare(harness.updateInfo);
  assert.deepEqual(harness.updater.getState(), { status: "manual", version: "0.5.1" });
  assert.equal(harness.runs.length, 0);
});

// The script that swaps the bundles, run for real on folders standing in for the apps.
function runInstallScript({ oldBundle, newBundle }) {
  // Beside the stand-in Applications folder, which must hold only the app afterwards.
  const directory = path.dirname(path.dirname(oldBundle));
  const script = path.join(directory, "install.sh");
  fs.writeFileSync(script, INSTALL_SCRIPT, { mode: 0o755 });
  const opened = path.join(directory, "opened.txt");
  const opener = path.join(directory, "open.sh");
  fs.writeFileSync(opener, `#!/bin/sh\necho "$1" > "${opened}"\n`, { mode: 0o755 });
  // A process id that is not running, so the script does not wait.
  execFileSync("/bin/sh", [script, "999999", oldBundle, newBundle, opener]);
  return fs.readFileSync(opened, "utf8").trim();
}

test("the install script swaps the new app in and opens it", { skip: process.platform !== "darwin" }, () => {
  const directory = temporaryDirectory();
  const oldBundle = path.join(directory, "Applications", "NotePane.app");
  const newBundle = path.join(directory, "update", "NotePane.app");
  writeBundle(oldBundle, "old");
  writeBundle(newBundle, "new");

  assert.equal(runInstallScript({ oldBundle, newBundle }), oldBundle);
  assert.equal(fs.readFileSync(path.join(oldBundle, "Contents", "marker.txt"), "utf8"), "new");
  assert.deepEqual(fs.readdirSync(path.dirname(oldBundle)), ["NotePane.app"]);
});

test("the install script keeps the old app when the new one is missing", { skip: process.platform !== "darwin" }, () => {
  const directory = temporaryDirectory();
  const oldBundle = path.join(directory, "Applications", "NotePane.app");
  writeBundle(oldBundle, "old");

  assert.equal(runInstallScript({ oldBundle, newBundle: path.join(directory, "missing.app") }), oldBundle);
  assert.equal(fs.readFileSync(path.join(oldBundle, "Contents", "marker.txt"), "utf8"), "old");
  assert.deepEqual(fs.readdirSync(path.dirname(oldBundle)), ["NotePane.app"]);
});
