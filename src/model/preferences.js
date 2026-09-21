import {
  BASE_EDITOR_FONT_SIZE_PX,
  DEFAULT_APP_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_SCALE,
  DEFAULT_EDITOR_PREFERENCES,
  DEFAULT_LAYOUT_MODE,
  DEFAULT_THEME,
  EDITOR_BUILTIN_FONT_FAMILY_OPTIONS,
  LOCAL_FONT_VALUE_PREFIX,
  MAX_EDITOR_FONT_SCALE,
  MAX_EDITOR_FONT_SIZE_PX,
  MIN_EDITOR_FONT_SCALE,
  MIN_EDITOR_FONT_SIZE_PX,
} from "../constants.js";
import {
  normalizeKeyboardShortcutEnabled,
  normalizeKeyboardShortcuts,
} from "./keyboardShortcuts.js";
import {
  isHexColor,
  normalizeOpacity,
} from "../style/colorMath.js";
import {
  clamp,
} from "../utils/values.js";

export function normalizeAppTheme(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    mode: source.mode === "dark" ? "dark" : "light",
  };
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
    editorFontScale: normalizeEditorFontScale(
      source.editorFontScale,
      fallbackSource.editorFontScale,
    ),
    editorFontFamily: normalizeEditorFontFamily(
      source.editorFontFamily,
      fallbackSource.editorFontFamily,
    ),
    appFontFamily: normalizeAppFontFamily(
      source.appFontFamily,
      fallbackSource.appFontFamily,
    ),
    showTableOfContents:
      typeof source.showTableOfContents === "boolean"
        ? source.showTableOfContents
        : Boolean(fallbackSource.showTableOfContents),
    keyboardShortcuts: normalizeKeyboardShortcuts(
      source.keyboardShortcuts,
      fallbackSource.keyboardShortcuts,
    ),
    keyboardShortcutEnabled: normalizeKeyboardShortcutEnabled(
      source.keyboardShortcutEnabled,
      fallbackSource.keyboardShortcutEnabled,
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

export function normalizeEditorFontScale(value, fallback = DEFAULT_EDITOR_FONT_SCALE) {
  const numericValue = Number(value);
  const fallbackValue = Number(fallback);
  const resolvedValue = Number.isFinite(numericValue)
    ? numericValue
    : Number.isFinite(fallbackValue)
      ? fallbackValue
      : DEFAULT_EDITOR_FONT_SCALE;

  return Math.round(
    clamp(resolvedValue, MIN_EDITOR_FONT_SCALE, MAX_EDITOR_FONT_SCALE) * 100,
  ) / 100;
}

export function normalizeEditorFontSize(value, fallback = BASE_EDITOR_FONT_SIZE_PX) {
  const numericValue = Number(value);
  const fallbackValue = Number(fallback);
  const resolvedValue = Number.isFinite(numericValue)
    ? numericValue
    : Number.isFinite(fallbackValue)
      ? fallbackValue
      : BASE_EDITOR_FONT_SIZE_PX;

  return Math.round(
    clamp(resolvedValue, MIN_EDITOR_FONT_SIZE_PX, MAX_EDITOR_FONT_SIZE_PX),
  );
}

export function editorFontScaleToSize(scale) {
  return normalizeEditorFontSize(
    normalizeEditorFontScale(scale) * BASE_EDITOR_FONT_SIZE_PX,
  );
}

export function editorFontSizeToScale(fontSize) {
  return normalizeEditorFontScale(
    normalizeEditorFontSize(fontSize) / BASE_EDITOR_FONT_SIZE_PX,
  );
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
