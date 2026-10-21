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
  files: ["dist/**/*", "electron/**/*", "build/**/*", "package.json"],
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
