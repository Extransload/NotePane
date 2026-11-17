import { Download, RefreshCw } from "lucide-react";
import { preventFocusLoss } from "../editor/images.js";

/**
 * "Restart to update" in the tabs window's header, as TablePeek has it: shown once a newer
 * release has downloaded on its own. A click saves the notes, quits, swaps the new app in and
 * opens it. A copy that cannot replace itself offers the release page instead. Nothing shows
 * while nothing is waiting.
 */
export function UpdatePill({ update, onInstall, onOpenRelease }) {
  if (update.status === "ready" || update.status === "installing") {
    const installing = update.status === "installing";
    return (
      <button
        type="button"
        className="update-pill has-tooltip"
        data-tooltip={`NotePane ${update.version}`}
        aria-label={installing ? "Restarting to update" : `Restart to update to NotePane ${update.version}`}
        disabled={installing}
        onMouseDown={preventFocusLoss}
        onClick={onInstall}
      >
        <RefreshCw size={13} aria-hidden="true" className={installing ? "is-spinning" : undefined} />
        {installing ? "Restarting…" : "Restart to update"}
      </button>
    );
  }
  if (update.status === "manual") {
    return (
      <button
        type="button"
        className="update-pill has-tooltip"
        data-tooltip="Opens the release page"
        aria-label={`Download NotePane ${update.version}`}
        onMouseDown={preventFocusLoss}
        onClick={onOpenRelease}
      >
        <Download size={13} aria-hidden="true" />
        {`NotePane ${update.version}`}
      </button>
    );
  }
  return null;
}
