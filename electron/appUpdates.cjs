// Update checks for a packaged app. Builds are published to GitHub Releases
// (electron-builder.config.cjs `publish`), and the check reads the newest
// published release, so a draft upload reaches no one until it is published.
const RELEASES_URL = "https://github.com/Extransload/NotePane/releases";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// "auto" downloads in the background and installs on quit (Windows, and a Mac build signed with
// a Developer ID). "self" is the ad-hoc signed Mac build, which Squirrel.Mac will not update:
// electron/macSelfUpdate.cjs downloads the release and swaps it in on "Restart to update". The
// build records which kind it is in package.json `notepane`.
function resolveUpdateMode({ isPackaged, enabled, platform, macAutoUpdate }) {
  if (!isPackaged || !enabled) {
    return "off";
  }
  if (platform === "win32") {
    return "auto";
  }
  if (platform === "darwin") {
    return macAutoUpdate ? "auto" : "self";
  }
  return "off";
}

// Orders two release versions ("0.10.0" after "0.9.2", a leading "v" ignored) by their
// numbers, so a string comparison never calls an older release newer. A pre-release such as
// "1.0.0-beta.1" comes before its release.
function compareVersions(left, right) {
  const parse = (version) => {
    const [core, preRelease] = String(version).trim().replace(/^v/i, "").split("-", 2);
    return { parts: core.split(".").map((part) => Number.parseInt(part, 10) || 0), preRelease };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.parts.length, b.parts.length); index += 1) {
    const difference = (a.parts[index] ?? 0) - (b.parts[index] ?? 0);
    if (difference !== 0) {
      return Math.sign(difference);
    }
  }
  if (Boolean(a.preRelease) !== Boolean(b.preRelease)) {
    return a.preRelease ? -1 : 1;
  }
  return 0;
}

function startAppUpdates({
  mode,
  loadUpdater,
  onUpdateAvailable = () => {},
  log = console,
  schedule = setInterval,
}) {
  if (mode === "off") {
    return null;
  }

  const updater = loadUpdater();
  const warn = (error) => log.warn(`Update check failed: ${error?.message ?? error}`);
  // Its default logger prints every check and a stack trace for each failure;
  // the "error" listener below reports a failure in one line instead.
  updater.logger = null;
  updater.autoDownload = mode === "auto";
  updater.on("error", warn);
  if (mode === "self") {
    // Every check that finds a newer release, the About page's included, hands it on; the
    // self-updater fetches each release once.
    updater.on("update-available", (updateInfo) => onUpdateAvailable(updateInfo));
  }

  // A failed check also emits "error", which already logged it.
  const check = () => {
    const pending =
      mode === "auto" ? updater.checkForUpdatesAndNotify() : updater.checkForUpdates();
    return Promise.resolve(pending).catch(() => {});
  };
  // Resolves with the newest published version (which can be the running one), or null when
  // the updater returns no release; a failed check rejects. A newer release downloads as it does
  // after the startup check.
  const checkNow = async () => {
    const result = await updater.checkForUpdates();
    return result?.updateInfo?.version ?? null;
  };
  void check();
  const timer = schedule(check, UPDATE_CHECK_INTERVAL_MS);
  timer?.unref?.();
  return { check, checkNow, timer };
}

module.exports = {
  RELEASES_URL,
  UPDATE_CHECK_INTERVAL_MS,
  compareVersions,
  resolveUpdateMode,
  startAppUpdates,
};
