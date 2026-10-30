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
          : null,
      };
    case "off":
      return { text: "Update checks run in the installed app" };
    case "error":
      return { text: "Could not check for updates", detail: update.message, tone: "error" };
    default:
      return { text: "Look for a newer NotePane on GitHub Releases." };
  }
}

/**
 * Preferences > About: the wordmark, the running version, what NotePane is, and a manual update
 * check. The browser preview has no bridge, so it shows the package version and no update check.
 */
export function AboutPreferencesSection() {
  const [appInfo, setAppInfo] = useState(null);
  const [update, setUpdate] = useState({ status: "idle" });

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
  const { text, detail, tone } = describeUpdateCheck(update);
  const offersDownload = update.status === "available" && update.mode === "notify";

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
              data-update-status={update.status}
              title={tone === "error" ? detail : undefined}
            >
              <span key={update.status} className="about-update-status-text">{text}</span>
            </div>
            {detail && (
              <div className="preferences-section-description about-update-detail">{detail}</div>
            )}
          </div>
          <div className="preference-backup-actions">
            {offersDownload && (
              <a
                className="preference-data-button"
                href={`${RELEASES_URL}/tag/v${update.version}`}
                target="_blank"
                rel="noreferrer"
                onMouseDown={preventFocusLoss}
              >
                <Download size={13} aria-hidden="true" />
                Download
              </a>
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
