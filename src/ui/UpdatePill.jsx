import { AlertCircle, Download, RefreshCw } from "lucide-react";
import { preventFocusLoss } from "../editor/images.js";
import {
  getUpdatePillLabel,
  getUpdateProgress,
  isUpdateBusy,
} from "../model/appUpdate.js";
import { Gauge } from "./Gauge.jsx";

/**
 * The update in the tabs window's header, as TablePeek shows it: a newer release is offered as
 * "Update to x.y.z", and only a click downloads it (unless Settings > About downloads updates
 * automatically); the accent pill fills with the download, then reads "Restart to update"; a
 * click saves the notes, quits, swaps the new app in and opens it, the pill filling again while
 * it restarts. A failed download says so and opens the release page; a copy that cannot replace
 * itself offers that page from the start. Nothing shows while nothing is on its way.
 */
export function UpdatePill({ update, onDownload, onInstall, onOpenRelease }) {
  const label = getUpdatePillLabel(update);
  if (label === null) {
    return null;
  }
  const busy = isUpdateBusy(update);
  const failed = update.status === "error";
  const offered = update.status === "available";
  const opensRelease = failed || update.status === "manual";
  const Icon = failed ? AlertCircle : offered || update.status === "manual" ? Download : RefreshCw;
  const tooltip = failed
    ? `${update.message ?? "The download failed"}. Opens the release page.`
    : update.status === "manual"
      ? "Opens the release page"
      : offered ? `Download NotePane ${update.version}` : `NotePane ${update.version}`;
  const ariaLabel = update.status === "ready"
    ? `Restart to update to NotePane ${update.version}`
    : offered || update.status === "manual" ? `Download NotePane ${update.version}` : label;
  return (
    <button
      type="button"
      className={`update-pill gauge-host has-tooltip${failed ? " is-failed" : ""}`}
      data-tooltip={tooltip}
      data-update-status={update.status}
      aria-label={ariaLabel}
      disabled={busy}
      onMouseDown={preventFocusLoss}
      onClick={opensRelease ? onOpenRelease : offered ? onDownload : onInstall}
    >
      {busy && <Gauge progress={getUpdateProgress(update)} />}
      <Icon size={13} aria-hidden="true" />
      {/* Keyed by the state, not the percentage, so each new step comes into focus once. */}
      <span key={update.status} className="update-pill-label">{label}</span>
    </button>
  );
}
