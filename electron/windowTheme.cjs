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

module.exports = {
  resolveWindowBackgroundColor,
};
