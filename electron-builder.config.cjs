// electron-builder configuration. `npm run app` builds for the current OS;
// .github/workflows/release.yml builds both platforms on a version tag and
// uploads them to a draft GitHub release (see docs/release.md).
//
// macOS signing turns on when a Developer ID certificate is provided through
// CSC_LINK or CSC_NAME, and electron-builder then also notarizes when APPLE_ID,
// APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID are set. Without a certificate
// the app is ad-hoc signed: an unsigned bundle downloaded on Apple Silicon is
// reported as damaged with no way to open it, while an ad-hoc signed one opens
// from System Settings → Privacy & Security. Hardened runtime stays off for
// ad-hoc builds, because library validation would reject Electron's frameworks.
const hasMacCertificate = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
// scripts/run-app.mjs packages a Windows build to run it from WSL during
// development; that copy must never replace itself with a published release.
const updatesEnabled = process.env.NOTEPANE_DISABLE_UPDATES !== "1";

module.exports = {
  appId: "com.gyu.notepane",
  productName: "NotePane",
  directories: {
    output: "release",
  },
  files: ["dist/**/*", "electron/**/*", "build/**/*", "!build/background.tiff", "package.json"],
  // Read by electron/appUpdates.cjs to choose between installing an update and
  // pointing to the release page.
  extraMetadata: {
    notepane: {
      updates: updatesEnabled,
      macAutoUpdate: hasMacCertificate,
    },
  },
  mac: {
    icon: "build/icon.icns",
    category: "public.app-category.productivity",
    // The dmg is what people download; the zip is what the updater fetches.
    target: [
      { target: "dmg", arch: ["arm64", "x64"] },
      { target: "zip", arch: ["arm64", "x64"] },
    ],
    ...(hasMacCertificate ? {} : { identity: "-", hardenedRuntime: false }),
  },
  // The installer window walks through the steps an unsigned build needs: drag
  // to Applications, open once and be blocked, then Open Anyway in Privacy &
  // Security, reached from the System Settings shortcut. `npm run dmg-background`
  // redraws the background from this window size and these icon positions.
  //
  // electron-builder sizes the window from the background image, and Finder
  // counts the title bar in that height and may add a path bar and status bar,
  // which together hide about the bottom 85px. The steps therefore end well above
  // that, and the rest of the image is blank margin.
  dmg: {
    background: "build/background.tiff",
    window: { width: 600, height: 600 },
    contents: [
      { x: 190, y: 150 },
      { x: 410, y: 150, type: "link", path: "/Applications" },
      { x: 300, y: 356, type: "link", path: "/System/Applications/System Settings.app" },
    ],
  },
  win: {
    icon: "build/icon.png",
    target: [{ target: "nsis", arch: ["x64"] }],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
  },
  asar: true,
  publish: {
    provider: "github",
    owner: "Extransload",
    repo: "NotePane",
    releaseType: "draft",
  },
};
