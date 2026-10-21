// Update checks for a packaged app. Builds are published to GitHub Releases
// (electron-builder.config.cjs `publish`), and the check reads the newest
// published release, so a draft upload reaches no one until it is published.
const RELEASES_URL = "https://github.com/Extransload/NotePane/releases";
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// "auto" downloads in the background and installs on quit. "notify" only
// offers the release page: Squirrel.Mac installs an update only into an app
// signed with a Developer ID, so an ad-hoc signed Mac build cannot update
// itself. The build records which kind it is in package.json `notepane`.
function resolveUpdateMode({ isPackaged, enabled, platform, macAutoUpdate }) {
  if (!isPackaged || !enabled) {
    return "off";
  }
  if (platform === "win32") {
    return "auto";
  }
  if (platform === "darwin") {
    return macAutoUpdate ? "auto" : "notify";
  }
  return "off";
}

function startAppUpdates({
  mode,
  loadUpdater,
  dialog,
  shell,
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

  if (mode === "notify") {
    const offeredVersions = new Set();
    updater.on("update-available", ({ version }) => {
      if (offeredVersions.has(version)) {
        return;
      }
      offeredVersions.add(version);
      void dialog
        .showMessageBox({
          type: "info",
          message: `NotePane ${version} is available`,
          detail: "Download it from the release page and replace the copy in Applications.",
          buttons: ["Download", "Later"],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0) {
            return shell.openExternal(`${RELEASES_URL}/tag/v${version}`);
          }
          return undefined;
        })
        .catch(warn);
    });
  }

  // A failed check also emits "error", which already logged it.
  const check = () => {
    const pending =
      mode === "auto" ? updater.checkForUpdatesAndNotify() : updater.checkForUpdates();
    return Promise.resolve(pending).catch(() => {});
  };
  void check();
  const timer = schedule(check, UPDATE_CHECK_INTERVAL_MS);
  timer?.unref?.();
  return { check, timer };
}

module.exports = {
  RELEASES_URL,
  UPDATE_CHECK_INTERVAL_MS,
  resolveUpdateMode,
  startAppUpdates,
};
