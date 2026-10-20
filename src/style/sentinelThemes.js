import { registerTestThemes } from "./themes.js";

// Test-only themes for the leak detector (tests/e2e/renderer/theme-leaks.spec.mjs). The two
// themes of a pair share a scheme but no palette value, and each value differs from its
// counterpart by at least 40 in some RGB channel, so a colour that renders identically under
// both did not come from the theme. They are garish on purpose, with text kept readable on
// the window colour. The entry loads this module only in a dev build whose URL has
// `sentinelThemes`; production builds contain neither the themes nor the test hook.
const SENTINEL_PALETTES = {
  "sentinel-light-a": {
    window: "#ffe6c7",
    sidebar: "#fcd9b0",
    header: "#f7cc9c",
    panel: "#fff0d0",
    hover: "#f3c08a",
    line: "#d9a066",
    lineStrong: "#9c5a1c",
    text: "#3a1a00",
    muted: "#7a4a20",
    faint: "#c09060",
    accent: "#d6336c",
    danger: "#c92a2a",
    success: "#2f9e44",
    warning: "#f59f00",
    shadow: "#4a2600",
    codeBg: "#fff4cc",
    codeText: "#4a2a00",
    codeMuted: "#9a7a50",
    gray: "#8c8070",
    brown: "#8b4513",
    red: "#e03131",
    orange: "#f76707",
    yellow: "#c99a00",
    green: "#2b8a3e",
    blue: "#1c7ed6",
    purple: "#7048e8",
    pink: "#e64980",
  },
  "sentinel-light-b": {
    window: "#d7ecff",
    sidebar: "#c4e0ff",
    header: "#b3d6fb",
    panel: "#ecf6ff",
    hover: "#a6cdf5",
    line: "#7fb0e0",
    lineStrong: "#2f6aa8",
    text: "#001f4d",
    muted: "#3a5a8a",
    faint: "#8aa8cc",
    accent: "#0ca678",
    danger: "#862e9c",
    success: "#0b7285",
    warning: "#e8590c",
    shadow: "#00264a",
    codeBg: "#e0ecff",
    codeText: "#1a2a6c",
    codeMuted: "#5a6a9a",
    gray: "#607080",
    brown: "#c47a3a",
    red: "#a61e4d",
    orange: "#ffa94d",
    yellow: "#8a7a00",
    green: "#66a80f",
    blue: "#1864ab",
    purple: "#ae3ec9",
    pink: "#f783ac",
  },
  "sentinel-dark-a": {
    window: "#3a0f2a",
    sidebar: "#300a22",
    header: "#44143a",
    panel: "#4c1a40",
    hover: "#5c2450",
    line: "#7a3a6a",
    lineStrong: "#a05a90",
    text: "#ffd6f0",
    muted: "#d49ac0",
    faint: "#8a5a7c",
    accent: "#ffb000",
    danger: "#ff6b6b",
    success: "#69db7c",
    warning: "#ffd43b",
    shadow: "#2c0018",
    codeBg: "#34102c",
    codeText: "#ffe8a8",
    codeMuted: "#b08a9a",
    gray: "#b0a0aa",
    brown: "#b87850",
    red: "#ff5c7a",
    orange: "#ff9a40",
    yellow: "#ffe066",
    green: "#8ce99a",
    blue: "#74c0fc",
    purple: "#d0a0ff",
    pink: "#ff8ed4",
  },
  "sentinel-dark-b": {
    window: "#0a2e1e",
    sidebar: "#062818",
    header: "#0e3a26",
    panel: "#12402c",
    hover: "#1a5038",
    line: "#2c6e50",
    lineStrong: "#4a9a74",
    text: "#ccffe4",
    muted: "#8ccca8",
    faint: "#4a7a62",
    accent: "#4dabf7",
    danger: "#ff922b",
    success: "#3bc9db",
    warning: "#a9e34b",
    shadow: "#002c14",
    codeBg: "#0a3420",
    codeText: "#b8e8ff",
    codeMuted: "#7aa0a0",
    gray: "#80a090",
    brown: "#e0b080",
    red: "#ff4040",
    orange: "#ffb870",
    yellow: "#e0c020",
    green: "#51cf66",
    blue: "#5c7cfa",
    purple: "#9775fa",
    pink: "#f06595",
  },
};

// The code theme differs within each pair too, so code token colours that do not follow the
// theme show up as leaks.
const SENTINEL_DETAILS = {
  "sentinel-light-a": { label: "Sentinel Light A", scheme: "light", codeTheme: "github-light" },
  "sentinel-light-b": { label: "Sentinel Light B", scheme: "light", codeTheme: "catppuccin-latte" },
  "sentinel-dark-a": { label: "Sentinel Dark A", scheme: "dark", codeTheme: "github-dark" },
  "sentinel-dark-b": { label: "Sentinel Dark B", scheme: "dark", codeTheme: "catppuccin-mocha" },
};

export const SENTINEL_THEMES = Object.entries(SENTINEL_DETAILS).map(([id, details]) => ({
  id,
  ...details,
  toneMatching: true,
  palette: SENTINEL_PALETTES[id],
  overrides: {},
  overrideReasons: [],
}));

/**
 * Registers the sentinel themes and exposes `window.__notepaneTest.setThemeId(id)` for the
 * leak detector. Returns `bindThemeSetter(updateAppTheme)`, which `App` calls with the same
 * theme setter the Preferences picker uses, so a test switches themes through that path. It
 * returns the unbinding cleanup.
 */
export function installSentinelThemes(target = window) {
  registerTestThemes(SENTINEL_THEMES);
  let themeSetter = null;
  target.__notepaneTest = {
    setThemeId(themeId) {
      if (!themeSetter) {
        throw new Error("The app has not mounted yet");
      }
      return themeSetter(themeId);
    },
  };
  return function bindThemeSetter(updateAppTheme) {
    themeSetter = updateAppTheme;
    return () => {
      if (themeSetter === updateAppTheme) {
        themeSetter = null;
      }
    };
  };
}
