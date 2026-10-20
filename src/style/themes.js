import themeData from "../../electron/themes.json" with { type: "json" };

export const PALETTE_KEYS = [
  "window",
  "sidebar",
  "header",
  "panel",
  "hover",
  "line",
  "lineStrong",
  "text",
  "muted",
  "faint",
  "accent",
  "danger",
  "success",
  "warning",
  "shadow",
  "codeBg",
  "codeText",
  "codeMuted",
  "gray",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
];

export const DEFAULT_THEME_ID = "notepane-light";
const DARK_THEME_ID = "notepane-dark";

let testThemes = [];

export function listThemes() {
  return [...themeData, ...testThemes];
}

export function isKnownThemeId(themeId) {
  return listThemes().some((theme) => theme.id === themeId);
}

export function getTheme(themeId) {
  const themes = listThemes();
  return (
    themes.find((theme) => theme.id === themeId) ??
    themes.find((theme) => theme.id === DEFAULT_THEME_ID)
  );
}

export function themeIdForMode(mode) {
  return mode === "dark" ? DARK_THEME_ID : DEFAULT_THEME_ID;
}

// Test-only: lets unit tests add themes (for example sentinel themes) after the JSON ones.
export function registerTestThemes(themes) {
  testThemes = [...themes];
}
