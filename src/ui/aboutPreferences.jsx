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
  NotePaneWordmark,
} from "./icons.jsx";
import {
  PreferencesCard,
} from "./PreferencesCard.jsx";

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
          : "It downloads in the background, then Restart to update installs it.",
      };
    case "off":
      return { text: "Update checks run in the installed app" };
    case "error":
      return { text: "Could not check for updates", detail: update.message, tone: "error" };
    default:
      return { text: "Look for a newer NotePane on GitHub Releases." };
  }
}

// What the Mac self-updater (useAppUpdate) has to say, when it is past a plain check: a download
// on its way, a release ready to install, or one this copy cannot install itself.
function describeSelfUpdate(selfUpdate) {
  switch (selfUpdate.status) {
    case "downloading":
      return { text: `Downloading NotePane ${selfUpdate.version}…` };
    case "ready":
      return {
        text: `NotePane ${selfUpdate.version} is ready`,
        detail: "Restart to start using it. Your notes are saved first.",
      };
    case "installing":
      return { text: "Restarting to update…" };
    case "manual":
      return {
        text: `NotePane ${selfUpdate.version} is available`,
        detail: "This copy cannot replace itself: it runs from the disk image or from a folder you cannot write to. Download it from its release page.",
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
 * Preferences > About: the wordmark, the running version, what NotePane is, and a manual update
 * check. The browser preview has no bridge, so it shows the package version and no update check.
 */
export function AboutPreferencesSection() {
  const [appInfo, setAppInfo] = useState(null);
  const [update, setUpdate] = useState({ status: "idle" });
  const { update: selfUpdate, installUpdate, openRelease } = useAppUpdate();

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
        description="The installed app also checks at startup and every six hours."
      >
        <div className="preference-setting-row about-update-row">
          <div className="about-update-text">
            <div className="preference-setting-title">NotePane {version}</div>
            <div
              className={`preferences-section-description about-update-status${
                tone === "error" ? " is-error" : ""
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
          </div>
          <div className="preference-backup-actions">
            {selfUpdate.status === "ready" && (
              <button
                type="button"
                className="preference-data-button"
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
        <div className="preference-setting-row">
          <div>
            <div className="preference-setting-title">What's new</div>
            <div className="preferences-section-description">
              Every version and what changed in it, on GitHub.
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
