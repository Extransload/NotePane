// Theme colours the main process needs. They come from themes.json, the file the renderer
// reads too, so the main process keeps no second copy of any theme colour.
const THEMES = require("./themes.json");
const { normalizeAppTheme } = require("./store.cjs");

// The BrowserWindow background on Windows, where windows are opaque: the theme's window
// colour, so a window opened under a dark theme never flashes light.
function resolveWindowBackgroundColor(appTheme) {
  const { themeId } = normalizeAppTheme(appTheme);
  return THEMES.find((theme) => theme.id === themeId).palette.window;
}

// Windows are opaque only on Windows (getWindowChromeOptions in main.cjs); on macOS and Linux
// they are transparent and have no background colour of their own.
const OPAQUE_WINDOW_PLATFORMS = new Set(["win32"]);

// The background to give every open window when the theme changes, or null on a platform whose
// windows are transparent.
function resolveOpaqueWindowBackgroundColor(appTheme, platform) {
  return OPAQUE_WINDOW_PLATFORMS.has(platform) ? resolveWindowBackgroundColor(appTheme) : null;
}

module.exports = {
  resolveOpaqueWindowBackgroundColor,
  resolveWindowBackgroundColor,
};
