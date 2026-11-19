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
  SettingRow,
  SettingsGroup,
  Switch,
} from "./settingsControls.jsx";

// The page electron/appUpdates.cjs checks for releases (its RELEASES_URL).
const RELEASES_URL = "https://github.com/Extransload/NotePane/releases";

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
 * Settings > General: the running version and its update (a manual check, the download of a
 * release on offer, whether releases download without asking, what changed), then what happens
 * at startup. The browser preview has no bridge, so it shows the package version and no update
 * check.
 */
export function GeneralPreferencesPage({
  autoDownloadUpdates = false,
  onAutoDownloadUpdatesChange,
  launchIntro,
  onLaunchIntroChange,
}) {
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
    <div className="look-page">
      <SettingsGroup
        label="Updates"
        description="The installed app also checks at launch and every six hours."
      >
        <SettingRow
          id="appVersion"
          title={<span data-testid="app-version">NotePane {version}</span>}
          description={appInfo?.electronVersion && (
            <span className="general-runtime" data-testid="app-runtime">
              Electron {appInfo.electronVersion} · Chromium {appInfo.chromiumVersion}
            </span>
          )}
        />
        <SettingRow
          id="checkForUpdates"
          title="Latest version"
          className="general-update-row"
          description={
            <>
              <span
                className={`general-update-status${
                  tone === "error" ? " is-error" : tone === "active" ? " is-active" : ""
                }`}
                role="status"
                data-testid="update-status"
                data-update-status={shownStatus}
                title={tone === "error" ? detail : undefined}
              >
                <span key={shownStatus} className="general-update-status-text">{text}</span>
              </span>
              {detail && <span className="general-update-detail">{detail}</span>}
              {!checking && isUpdateBusy(selfUpdate) && (
                <span
                  className="general-update-progress gauge-host"
                  role="progressbar"
                  aria-label="Update progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={getUpdateProgress(selfUpdate) === null
                    ? undefined
                    : Math.floor(getUpdateProgress(selfUpdate) * 100)}
                >
                  <Gauge progress={getUpdateProgress(selfUpdate)} />
                </span>
              )}
            </>
          }
        >
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
                className={`general-update-icon${checking ? " is-spinning" : ""}`}
                size={13}
                aria-hidden="true"
              />
              Check for updates
            </button>
          </div>
        </SettingRow>
        <SettingRow
          id="autoDownloadUpdates"
          title="Download updates automatically"
          description="Off asks before downloading a new version."
        >
          <Switch
            label="Download updates automatically"
            checked={autoDownloadUpdates}
            onChange={(checked) => onAutoDownloadUpdatesChange?.(checked)}
          />
        </SettingRow>
        <SettingRow
          id="releaseNotes"
          title="What's new"
          description="What changed in each version, on GitHub."
        >
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
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup label="Startup">
        <SettingRow
          id="launchIntro"
          title="Show intro on launch"
          description="The NotePane logo plays as the app opens; a key or click skips it."
          changed={launchIntro !== true}
          onReset={() => onLaunchIntroChange(true)}
        >
          <Switch label="Show intro on launch" checked={launchIntro} onChange={onLaunchIntroChange} />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
