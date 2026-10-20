import { buildThemeTokens } from "./themeTokens.js";

// The token names each root received last, so a theme that lacks one clears the old value
// instead of leaving the previous theme's colour behind.
const appliedTokenNames = new WeakMap();

/**
 * Applies a theme to the document: every derived token becomes a custom property on `root`,
 * tokens a previous call set that this theme lacks are removed, and the theme's id and scheme
 * are recorded as `data-theme-id`, `data-theme-scheme` and `color-scheme`. BlockNote's menus
 * are portalled into `document.body`, so they inherit the tokens from the root.
 */
export function applyThemeToDocument(theme, root = document.documentElement) {
  const tokens = buildThemeTokens(theme);
  for (const name of appliedTokenNames.get(root) ?? []) {
    if (!Object.hasOwn(tokens, name)) {
      root.style.removeProperty(name);
    }
  }
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
  appliedTokenNames.set(root, new Set(Object.keys(tokens)));
  root.dataset.themeId = theme.id;
  root.dataset.themeScheme = theme.scheme;
  root.style.colorScheme = theme.scheme;
}

// The main process puts the current theme id in each window's URL, so the entry script can
// apply it before React mounts and the first frame already has the theme's colours.
export function readInitialThemeId(search = window.location.search) {
  return new URLSearchParams(search).get("themeId");
}
