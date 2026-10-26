import {
  APP_ZOOM_LEVELS,
  DEFAULT_APP_FONT_FAMILY,
  DEFAULT_APP_ZOOM,
  DEFAULT_APP_THEME,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_EDITOR_PREFERENCES,
  DEFAULT_LAYOUT_MODE,
  DEFAULT_THEME,
  EDITOR_BUILTIN_FONT_FAMILY_OPTIONS,
  LOCAL_FONT_VALUE_PREFIX,
} from "../constants.js";
import {
  disableShadowingDefaultShortcuts,
  normalizeKeyboardShortcutEnabled,
  normalizeKeyboardShortcuts,
} from "./keyboardShortcuts.js";
import {
  isHexColor,
  normalizeOpacity,
} from "../style/colorMath.js";
import {
  getTheme,
  isKnownThemeId,
  themeIdForMode,
} from "../style/themes.js";
import {
  clamp,
} from "../utils/values.js";

// Same rules as normalizeAppTheme in electron/store.cjs (tests/unit/themes.test.cjs checks that
// they agree). `mode` is always the theme's scheme.
export function normalizeAppTheme(value, fallback = DEFAULT_APP_THEME) {
  const themeId =
    resolveAppThemeId(value) ??
    resolveAppThemeId(fallback) ??
    DEFAULT_APP_THEME.themeId;
  return {
    themeId,
    mode: getTheme(themeId).scheme,
  };
}

// A known theme id wins. Otherwise a legacy mode, or the mode stored beside an unknown id,
// picks the matching NotePane theme.
function resolveAppThemeId(value) {
  const source = value && typeof value === "object" ? value : {};
  if (isKnownThemeId(source.themeId)) {
    return source.themeId;
  }
  if (source.mode === "dark" || source.mode === "light") {
    return themeIdForMode(source.mode);
  }
  return null;
}

export function normalizeLayoutMode(value) {
  return value === "sticky" ? "sticky" : DEFAULT_LAYOUT_MODE;
}

export function normalizeEditorPreferences(
  value,
  fallback = DEFAULT_EDITOR_PREFERENCES,
) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackSource = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_EDITOR_PREFERENCES;

  return {
    editorFontFamily: normalizeEditorFontFamily(
      source.editorFontFamily,
      fallbackSource.editorFontFamily,
    ),
    appFontFamily: normalizeAppFontFamily(
      source.appFontFamily,
      fallbackSource.appFontFamily,
    ),
    appZoom: normalizeAppZoom(source.appZoom, fallbackSource.appZoom),
    showTableOfContents:
      typeof source.showTableOfContents === "boolean"
        ? source.showTableOfContents
        : Boolean(fallbackSource.showTableOfContents),
    ...normalizeKeyboardShortcutPreferences(source, fallbackSource),
  };
}

function normalizeKeyboardShortcutPreferences(source, fallbackSource) {
  const keyboardShortcuts = normalizeKeyboardShortcuts(
    source.keyboardShortcuts,
    fallbackSource.keyboardShortcuts,
  );
  const keyboardShortcutEnabled = normalizeKeyboardShortcutEnabled(
    source.keyboardShortcutEnabled,
    fallbackSource.keyboardShortcutEnabled,
  );
  return {
    keyboardShortcuts,
    keyboardShortcutEnabled: disableShadowingDefaultShortcuts(
      source.keyboardShortcuts,
      source.keyboardShortcutEnabled,
      keyboardShortcuts,
      keyboardShortcutEnabled,
    ),
  };
}

export function normalizeTheme(value) {
  const source = value && typeof value === "object" ? value : {};
  const migratedTabTextColor =
    isHexColor(source.textColor) &&
    source.textColor.toLowerCase() !== "#211b0c"
      ? source.textColor.toLowerCase()
      : DEFAULT_THEME.tabTextColor;

  return {
    tabTextColor: normalizeOptionalHexColor(
      source.tabTextColor,
      migratedTabTextColor,
    ),
    tabTextOpacity: normalizeOpacity(
      source.tabTextOpacity,
      DEFAULT_THEME.tabTextOpacity,
    ),
  };
}

export function normalizeOptionalHexColor(value, fallback = null) {
  return isHexColor(value)
    ? value.toLowerCase()
    : isHexColor(fallback)
      ? fallback.toLowerCase()
      : null;
}

// Snaps to the nearest zoom step, so a stored value always sits on the gauge. Mirrors
// `normalizeAppZoom` in electron/store.cjs.
export function normalizeAppZoom(value, fallback = DEFAULT_APP_ZOOM) {
  const numericValue = Number(value);
  const fallbackValue = Number(fallback);
  const resolvedValue = Number.isFinite(numericValue)
    ? numericValue
    : Number.isFinite(fallbackValue)
      ? fallbackValue
      : DEFAULT_APP_ZOOM;

  return APP_ZOOM_LEVELS.reduce((nearest, level) =>
    Math.abs(level - resolvedValue) < Math.abs(nearest - resolvedValue) ? level : nearest);
}

// The zoom one step in `direction` (1 or -1), held at the smallest and largest steps.
export function stepAppZoom(zoom, direction) {
  const index = APP_ZOOM_LEVELS.indexOf(normalizeAppZoom(zoom));
  return APP_ZOOM_LEVELS[clamp(index + direction, 0, APP_ZOOM_LEVELS.length - 1)];
}

export function normalizeEditorFontFamily(value, fallback = DEFAULT_EDITOR_FONT_FAMILY) {
  const normalizedValue = normalizeEditorFontFamilyValue(value);
  if (isAllowedEditorFontFamily(normalizedValue)) {
    return normalizedValue;
  }

  const normalizedFallback = normalizeEditorFontFamilyValue(fallback);
  return isAllowedEditorFontFamily(normalizedFallback)
    ? normalizedFallback
    : DEFAULT_EDITOR_FONT_FAMILY;
}

export function normalizeAppFontFamily(value, fallback = DEFAULT_APP_FONT_FAMILY) {
  const normalizedValue = normalizeEditorFontFamilyValue(value);
  if (isAllowedEditorFontFamily(normalizedValue)) {
    return normalizedValue;
  }

  const normalizedFallback = normalizeEditorFontFamilyValue(fallback);
  return isAllowedEditorFontFamily(normalizedFallback)
    ? normalizedFallback
    : DEFAULT_APP_FONT_FAMILY;
}

export function normalizeEditorFontFamilyValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.replace(/\s+/g, " ").trim();
  if (trimmedValue.toLowerCase().startsWith(LOCAL_FONT_VALUE_PREFIX)) {
    const family = normalizeInstalledFontFamily(
      trimmedValue.slice(LOCAL_FONT_VALUE_PREFIX.length),
    );
    return family ? `${LOCAL_FONT_VALUE_PREFIX}${family}` : "";
  }

  return trimmedValue.toLowerCase();
}

export function isAllowedEditorFontFamily(value) {
  return (
    EDITOR_BUILTIN_FONT_FAMILY_OPTIONS.some((option) => option.value === value) ||
    Boolean(parseLocalFontFamilyValue(value))
  );
}

export function getEditorFontFamilyOptions(installedFontFamilies = [], selectedValue = "") {
  const options = [...EDITOR_BUILTIN_FONT_FAMILY_OPTIONS];
  const seenValues = new Set(options.map((option) => option.value));

  for (const family of installedFontFamilies) {
    const normalizedFamily = normalizeInstalledFontFamily(family);
    if (!normalizedFamily) {
      continue;
    }

    const value = `${LOCAL_FONT_VALUE_PREFIX}${normalizedFamily}`;
    if (seenValues.has(value)) {
      continue;
    }

    seenValues.add(value);
    options.push({
      value,
      label: normalizedFamily,
      css: `${quoteFontFamily(normalizedFamily)}, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`,
      source: "installed",
    });
  }

  const selectedFamily = parseLocalFontFamilyValue(selectedValue);
  if (selectedFamily) {
    const selectedValueKey = `${LOCAL_FONT_VALUE_PREFIX}${selectedFamily}`;
    if (!seenValues.has(selectedValueKey)) {
      options.push({
        value: selectedValueKey,
        label: selectedFamily,
        css: `${quoteFontFamily(selectedFamily)}, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`,
        source: "installed",
      });
    }
  }

  return options;
}

export function filterEditorFontOptions(fontOptions = [], query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return fontOptions.slice(0, 96);
  }

  return fontOptions
    .filter((option) =>
      `${option.label} ${option.value}`.toLowerCase().includes(normalizedQuery),
    )
    .slice(0, 96);
}

export function getEditorFontFamilyOption(value, fontOptions = []) {
  const normalizedValue = normalizeEditorFontFamily(value);
  return (
    fontOptions.find((option) => option.value === normalizedValue) ??
    getEditorFontFamilyOptions([], normalizedValue).find(
      (option) => option.value === normalizedValue,
    ) ??
    EDITOR_BUILTIN_FONT_FAMILY_OPTIONS[0]
  );
}

export function getEditorFontFamilyCss(value, fontOptions = []) {
  return (
    fontOptions.find(
      (option) => option.value === normalizeEditorFontFamily(value),
    )?.css ??
    getEditorFontFamilyOption(value, fontOptions).css ??
    EDITOR_BUILTIN_FONT_FAMILY_OPTIONS[0].css
  );
}

export function parseLocalFontFamilyValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.replace(/\s+/g, " ").trim();
  if (!trimmedValue.toLowerCase().startsWith(LOCAL_FONT_VALUE_PREFIX)) {
    return "";
  }

  return normalizeInstalledFontFamily(
    trimmedValue.slice(LOCAL_FONT_VALUE_PREFIX.length),
  );
}

export function normalizeInstalledFontFamily(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function quoteFontFamily(value) {
  return `"${normalizeInstalledFontFamily(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
