// What the Mac self-updater's state (electron/macSelfUpdate.cjs, through useAppUpdate) means on
// screen: shared by the update pill in the tabs header and Settings > About, so both say the same.

// How far the update has got, 0 to 1, or null while the length is unknown (a download whose size
// the server did not give, a restart). Checking the download counts as done downloading.
export function getUpdateProgress(state) {
  if (state?.status === "downloading") {
    return state.total > 0 ? Math.min(state.downloaded / state.total, 1) : null;
  }
  if (state?.status === "verifying" || state?.status === "ready") {
    return 1;
  }
  return null;
}

export function isUpdateBusy(state) {
  return ["downloading", "verifying", "installing"].includes(state?.status);
}

// "12.4 MB", for the download's size.
export function formatDownloadSize(bytes) {
  return `${(bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1)} MB`;
}

// The pill's short words for each state, or null when the pill does not show.
export function getUpdatePillLabel(state) {
  const progress = getUpdateProgress(state);
  switch (state?.status) {
    case "available":
      return `Update to ${state.version}`;
    case "downloading":
      return progress === null ? "Downloading update…" : `Downloading ${Math.floor(progress * 100)}%`;
    case "verifying":
      return "Checking update…";
    case "ready":
      return "Restart to update";
    case "installing":
      return "Restarting…";
    case "error":
      return "Update failed";
    case "manual":
      return `NotePane ${state.version}`;
    default:
      return null;
  }
}
