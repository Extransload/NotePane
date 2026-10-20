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

// Windows are opaque only on Windows, where they get a frame and a background colour; on macOS
// and Linux they are transparent and have no background colour of their own.
const OPAQUE_WINDOW_PLATFORMS = new Set(["win32"]);

function hasOpaqueWindows(platform) {
  return OPAQUE_WINDOW_PLATFORMS.has(platform);
}

// The background to give every open window when the theme changes, or null on a platform whose
// windows are transparent.
function resolveOpaqueWindowBackgroundColor(appTheme, platform) {
  return hasOpaqueWindows(platform) ? resolveWindowBackgroundColor(appTheme) : null;
}

// After a theme change: an opaque window keeps the background it was created with unless told
// otherwise, and paints it while it resizes or reloads, so each open one gets the new theme's.
function repaintWindowBackgrounds(windows, appTheme, platform) {
  const backgroundColor = resolveOpaqueWindowBackgroundColor(appTheme, platform);
  if (!backgroundColor) {
    return;
  }
  for (const window of windows) {
    if (!window.isDestroyed()) {
      window.setBackgroundColor(backgroundColor);
    }
  }
}

module.exports = {
  hasOpaqueWindows,
  repaintWindowBackgrounds,
  resolveOpaqueWindowBackgroundColor,
  resolveWindowBackgroundColor,
};
