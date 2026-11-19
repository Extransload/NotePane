// Updates for the ad-hoc signed Mac build, which Squirrel.Mac refuses to update: like TablePeek,
// the app downloads the new release by itself, and "Restart to update" swaps it in and opens it.
//
// The release's `-<arch>-mac.zip` (named in latest-mac.yml, which electron-updater reads) is
// downloaded from GitHub Releases, checked against the SHA-512 the release lists, unpacked with
// ditto and checked to carry the expected version. When the app quits for the update, a detached
// shell script waits for this process to end, copies the new bundle beside the old one, swaps
// them (putting the old one back if the swap fails) and opens the app. An app that cannot be
// replaced (run from the disk image, translocated, or in a folder the user cannot write) gets
// "manual": the release page, as before.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable, Transform } = require("node:stream");

// How often the download reports its progress: often enough for a smooth gauge, rarely enough
// not to flood the windows with messages.
const PROGRESS_INTERVAL_MS = 120;

// Positional arguments: the process to wait for, the installed bundle, the new bundle, and the
// command that opens the result.
const INSTALL_SCRIPT = `#!/bin/sh
pid="$1"; old="$2"; new="$3"; opener="$4"
while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
stage="$old.updating"; previous="$old.previous"
rm -rf "$stage" "$previous"
if /usr/bin/ditto "$new" "$stage" && mv "$old" "$previous"; then
  if mv "$stage" "$old"; then
    rm -rf "$previous"
  else
    mv "$previous" "$old"
  fi
fi
rm -rf "$stage"
/usr/bin/xattr -dr com.apple.quarantine "$old" 2>/dev/null
"$opener" "$old"
`;

// The release's Mac zip for this architecture, from latest-mac.yml's file list.
function findMacZip(files, arch) {
  return Array.isArray(files)
    ? files.find((file) => typeof file?.url === "string" && file.url.endsWith(`-${arch}-mac.zip`)) ?? null
    : null;
}

// The .app bundle an executable runs from: <bundle>/Contents/MacOS/<name>.
function bundlePathFor(execPath) {
  const bundle = path.resolve(execPath, "..", "..", "..");
  return bundle.endsWith(".app") ? bundle : null;
}

// Whether the bundle can be swapped in place: not on a mounted disk image, not translocated by
// Gatekeeper (a read-only copy), and writable along with its folder.
function canReplaceBundle(bundle, access = fs.accessSync) {
  if (!bundle || bundle.startsWith("/Volumes/") || bundle.includes("/AppTranslocation/")) {
    return false;
  }
  try {
    access(path.dirname(bundle), fs.constants.W_OK);
    access(bundle, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function sha512Base64(filePath) {
  const hash = crypto.createHash("sha512");
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest("base64");
}

function createMacSelfUpdater({
  releasesUrl,
  execPath,
  arch,
  pid,
  tempDir,
  fetch,
  run,
  spawnDetached,
  onState = () => {},
  access = fs.accessSync,
  opener = "/usr/bin/open",
}) {
  const bundle = bundlePathFor(execPath);
  let state = { status: "idle" };
  let staged = null;
  let preparing = null;
  // The release a check found while downloads wait for the user's yes.
  let offered = null;

  const setState = (next) => {
    state = next;
    onState(state);
  };

  // Reports `downloading` with the bytes so far and the size the server gave (null when it gave
  // none), then `verifying` while the zip is checked and unpacked.
  const download = async (version, file) => {
    const directory = path.join(tempDir, `NotePane-update-${version}`);
    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });
    const zipPath = path.join(directory, path.basename(file.url));
    const response = await fetch(`${releasesUrl}/download/v${version}/${encodeURIComponent(file.url)}`);
    if (!response.ok || !response.body) {
      throw new Error(`The download failed (${response.status}).`);
    }
    const total = Number(response.headers?.get?.("content-length")) || null;
    let downloaded = 0;
    let reportedAt = 0;
    const report = () => setState({ status: "downloading", version, downloaded, total });
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        downloaded += chunk.length;
        const now = Date.now();
        if (now - reportedAt >= PROGRESS_INTERVAL_MS) {
          reportedAt = now;
          report();
        }
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), counter, fs.createWriteStream(zipPath));
    report();
    setState({ status: "verifying", version });
    if ((await sha512Base64(zipPath)) !== file.sha512) {
      throw new Error("The download does not match the release.");
    }
    const unpacked = path.join(directory, "app");
    await run("/usr/bin/ditto", ["-x", "-k", zipPath, unpacked]);
    const app = path.join(unpacked, path.basename(bundle));
    const { stdout } = await run("/usr/bin/plutil", [
      "-extract", "CFBundleShortVersionString", "raw", "-o", "-", path.join(app, "Contents", "Info.plist"),
    ]);
    if (String(stdout).trim() !== version) {
      throw new Error("The downloaded app is not the release it should be.");
    }
    await run("/usr/bin/xattr", ["-dr", "com.apple.quarantine", app]).catch(() => {});
    fs.rmSync(zipPath, { force: true });
    return app;
  };

  const startDownload = (version, file) => {
    offered = null;
    setState({ status: "downloading", version, downloaded: 0, total: null });
    preparing = download(version, file)
      .then((app) => {
        staged = { version, app };
        setState({ status: "ready", version });
        return state;
      })
      .catch((error) => {
        setState({ status: "error", version, message: String(error?.message ?? error) });
        return state;
      })
      .finally(() => {
        preparing = null;
      });
    return preparing;
  };

  // Called for each check that finds a newer release; a release already downloaded or on its way
  // is not fetched again, and one that failed is tried again by the next check. Unless
  // `download` is set (Settings > General > Download updates automatically), a release is only
  // offered: `available`, until downloadOffered() is asked for.
  const prepare = (updateInfo, { download: downloadNow = false } = {}) => {
    const version = updateInfo?.version;
    if (!version || (staged?.version === version) || (preparing && state.version === version)) {
      return preparing ?? Promise.resolve(state);
    }
    const file = findMacZip(updateInfo.files, arch);
    if (!file || !canReplaceBundle(bundle, access)) {
      setState({ status: "manual", version });
      return Promise.resolve(state);
    }
    if (!downloadNow) {
      offered = { version, file };
      if (state.status !== "available" || state.version !== version) {
        setState({ status: "available", version });
      }
      return Promise.resolve(state);
    }
    return startDownload(version, file);
  };

  // The user's yes to the release on offer.
  const downloadOffered = () =>
    offered && !preparing ? startDownload(offered.version, offered.file) : Promise.resolve(state);

  // Starts the script that swaps the new bundle in once this process has ended. Call it as the
  // app quits.
  const launchInstaller = () => {
    if (!staged) {
      return false;
    }
    const scriptPath = path.join(path.dirname(path.dirname(staged.app)), "install.sh");
    fs.writeFileSync(scriptPath, INSTALL_SCRIPT, { mode: 0o755 });
    spawnDetached("/bin/sh", [scriptPath, String(pid), bundle, staged.app, opener]);
    return true;
  };

  return {
    getState: () => state,
    isReady: () => staged !== null,
    launchInstaller,
    markInstalling: () => {
      if (staged) {
        setState({ status: "installing", version: staged.version });
      }
    },
    markReady: () => {
      if (staged) {
        setState({ status: "ready", version: staged.version });
      }
    },
    prepare,
    downloadOffered,
  };
}

module.exports = {
  INSTALL_SCRIPT,
  bundlePathFor,
  canReplaceBundle,
  createMacSelfUpdater,
  findMacZip,
};
