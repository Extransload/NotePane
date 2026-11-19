import {
  Download,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import {
  version as PACKAGE_VERSION,
} from "../../package.json";
import {
  electronApi,
} from "../constants.js";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  useAppUpdate,
} from "../hooks/useAppUpdate.js";
import {
  formatDownloadSize,
  getUpdateProgress,
  isUpdateBusy,
} from "../model/appUpdate.js";
import {
  Gauge,
} from "./Gauge.jsx";
import {
  NotePaneWordmark,
} from "./icons.jsx";
import {
  PreferencesCard,
} from "./PreferencesCard.jsx";
import {
  Switch,
} from "./settingsControls.jsx";

// The page electron/appUpdates.cjs checks for releases (its RELEASES_URL).
export const RELEASES_URL = "https://github.com/Extransload/NotePane/releases";

// What the status line says for each result of `app:check-for-updates` (electron/main.cjs).
function describeUpdateCheck(update) {
  switch (update.status) {
    case "checking":
      return { text: "Checking for updates…" };
    case "up-to-date":
      return { text: `NotePane ${update.version} is up to date` };
    case "available":
      return {
        text: `NotePane ${update.version} is available`,
        detail: update.mode === "auto"
          ? "It downloads in the background and installs when NotePane quits."
          : "Download it, then restart to update.",
      };
    case "off":
      return { text: "Update checks run in the installed app" };
    case "error":
      return { text: "Could not check for updates", detail: update.message, tone: "error" };
    default:
      return { text: "Check now to see if a newer NotePane is out." };
  }
}

// What the Mac self-updater (useAppUpdate) has to say, when it is past a plain check: a download
// on offer, on its way, ready to install, or one this copy cannot install itself.
function describeSelfUpdate(selfUpdate) {
  const progress = getUpdateProgress(selfUpdate);
  switch (selfUpdate.status) {
    case "available":
      return {
        text: `NotePane ${selfUpdate.version} is available`,
        detail: "Download it now; NotePane asks to restart once it is ready.",
        tone: "active",
      };
    case "downloading":
      return {
        text: progress === null
          ? `Downloading NotePane ${selfUpdate.version}…`
          : `Downloading NotePane ${selfUpdate.version}… ${Math.floor(progress * 100)}%`,
        detail: selfUpdate.total > 0
          ? `${formatDownloadSize(selfUpdate.downloaded)} of ${formatDownloadSize(selfUpdate.total)}`
          : null,
        tone: "active",
      };
    case "verifying":
      return {
        text: `Checking NotePane ${selfUpdate.version}…`,
        detail: "Verifying the download, then unpacking it.",
        tone: "active",
      };
    case "ready":
      return {
        text: `NotePane ${selfUpdate.version} is ready`,
        detail: "Restart to use it; your notes are saved first.",
        tone: "active",
      };
    case "installing":
      return {
        text: "Restarting to update…",
        detail: "NotePane saves your notes, swaps in the new version and opens again.",
        tone: "active",
      };
    case "manual":
      return {
        text: `NotePane ${selfUpdate.version} is available`,
        detail: "NotePane can't update itself from the disk image or a read-only folder; download the new version instead.",
      };
    case "error":
      return {
        text: `Could not download NotePane ${selfUpdate.version}`,
        detail: selfUpdate.message,
        tone: "error",
      };
    default:
      return null;
  }
}

/**
 * Preferences > About: the wordmark, the running version, what NotePane is, a manual update
 * check, the download of a release on offer, and whether releases download without asking. The
 * browser preview has no bridge, so it shows the package version and no update check.
 */
export function AboutPreferencesSection({ autoDownloadUpdates = false, onAutoDownloadUpdatesChange }) {
  const [appInfo, setAppInfo] = useState(null);
  const [update, setUpdate] = useState({ status: "idle" });
  const { update: selfUpdate, downloadUpdate, installUpdate, openRelease } = useAppUpdate();

  useEffect(() => {
    if (!electronApi?.getAppInfo) {
      return undefined;
    }
    let cancelled = false;
    electronApi.getAppInfo().then(
      (info) => {
        if (!cancelled) {
          setAppInfo(info);
        }
      },
      (error) => console.warn(`Could not read the app version: ${error?.message ?? error}`),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const checkForUpdates = async () => {
    if (!electronApi?.checkForUpdates) {
      setUpdate({ status: "off" });
      return;
    }
    setUpdate({ status: "checking" });
    try {
      setUpdate(await electronApi.checkForUpdates());
    } catch (error) {
      setUpdate({ status: "error", message: String(error?.message ?? error) });
    }
  };

  const version = appInfo?.version ?? PACKAGE_VERSION;
  const checking = update.status === "checking";
  const selfDescription = checking ? null : describeSelfUpdate(selfUpdate);
  const shownStatus = selfDescription ? selfUpdate.status : update.status;
  const { text, detail, tone } = selfDescription ?? describeUpdateCheck(update);

  return (
    <>
      <section className="preferences-card about-card" aria-labelledby="about-app-name">
        <div className="about-identity">
          <h3 id="about-app-name" className="sr-only">NotePane</h3>
          <NotePaneWordmark />
          <div className="about-version" data-testid="about-version">Version {version}</div>
        </div>
        <p className="about-description" data-testid="about-description">
          NotePane is a block-based note app built on BlockNote. Keep your notes as tabs in one
          window, or spread them across the desktop as sticky notes. Every note stays on this
          computer, and NotePane works offline.
        </p>
        {appInfo?.electronVersion && (
          <div className="about-runtime" data-testid="about-runtime">
            Electron {appInfo.electronVersion} · Chromium {appInfo.chromiumVersion}
          </div>
        )}
      </section>
      <PreferencesCard
        title="Updates"
        description="The installed app also checks at launch and every six hours."
      >
        <div className="preference-setting-row about-update-row">
          <div className="about-update-text">
            <div className="preference-setting-title">Latest version</div>
            <div
              className={`preferences-section-description about-update-status${
                tone === "error" ? " is-error" : tone === "active" ? " is-active" : ""
              }`}
              role="status"
              data-testid="update-status"
              data-update-status={shownStatus}
              title={tone === "error" ? detail : undefined}
            >
              <span key={shownStatus} className="about-update-status-text">{text}</span>
            </div>
            {detail && (
              <div className="preferences-section-description about-update-detail">{detail}</div>
            )}
            {!checking && isUpdateBusy(selfUpdate) && (
              <div
                className="about-update-progress gauge-host"
                role="progressbar"
                aria-label="Update progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={getUpdateProgress(selfUpdate) === null
                  ? undefined
                  : Math.floor(getUpdateProgress(selfUpdate) * 100)}
              >
                <Gauge progress={getUpdateProgress(selfUpdate)} />
              </div>
            )}
          </div>
          <div className="preference-backup-actions">
            {selfUpdate.status === "available" && (
              <button
                type="button"
                className="preference-data-button is-primary"
                onMouseDown={preventFocusLoss}
                onClick={downloadUpdate}
              >
                <Download size={13} aria-hidden="true" />
                Download
              </button>
            )}
            {selfUpdate.status === "ready" && (
              <button
                type="button"
                className="preference-data-button is-primary"
                onMouseDown={preventFocusLoss}
                onClick={installUpdate}
              >
                <RefreshCw size={13} aria-hidden="true" />
                Restart to update
              </button>
            )}
            {selfUpdate.status === "manual" && (
              <button
                type="button"
                className="preference-data-button"
                onMouseDown={preventFocusLoss}
                onClick={openRelease}
              >
                <Download size={13} aria-hidden="true" />
                Download
              </button>
            )}
            <button
              type="button"
              className="preference-data-button"
              disabled={checking}
              onMouseDown={preventFocusLoss}
              onClick={() => void checkForUpdates()}
            >
              <RefreshCw
                className={`about-update-icon${checking ? " is-spinning" : ""}`}
                size={13}
                aria-hidden="true"
              />
              Check for updates
            </button>
          </div>
        </div>
        <div className="preference-setting-row" data-setting-id="autoDownloadUpdates">
          <div>
            <div className="preference-setting-title">Download updates automatically</div>
            <div className="preferences-section-description">
              Off asks first: a new version shows as Update to x.y.z beside the title.
            </div>
          </div>
          <Switch
            label="Download updates automatically"
            checked={autoDownloadUpdates}
            onChange={(checked) => onAutoDownloadUpdatesChange?.(checked)}
          />
        </div>
        <div className="preference-setting-row">
          <div>
            <div className="preference-setting-title">What's new</div>
            <div className="preferences-section-description">
              What changed in each version, on GitHub.
            </div>
          </div>
          <a
            className="preference-data-button"
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            onMouseDown={preventFocusLoss}
          >
            <ExternalLink size={13} aria-hidden="true" />
            Release notes
          </a>
        </div>
      </PreferencesCard>
    </>
  );
}
