import {
  DEFAULT_APP_THEME,
  DEFAULT_STICKY_ACCENT_COLOR,
  DEFAULT_THEME,
  MODE_TAB_TEXT_DEFAULTS,
  SESSION_TAB_DARK_MODE_TONE_MIX,
  SESSION_TAB_MODE_BASE_COLORS,
  STICKY_PASTEL_PALETTE,
} from "../constants.js";
import {
  normalizeOptionalHexColor,
  normalizeTheme,
} from "../model/preferences.js";
import {
  blendHexOverHex,
  getContrastingTextColor,
  getReadableBoundaryColor,
  getSessionTabContrastingTextColor,
  hexToCssRgb,
  isHexColor,
  mixHexColors,
} from "./colorMath.js";

export function resolveTabTextColor(theme, appThemeMode = DEFAULT_APP_THEME.mode) {
  const normalizedTheme = normalizeTheme(theme);
  const modeDefaults =
    MODE_TAB_TEXT_DEFAULTS[appThemeMode] ?? MODE_TAB_TEXT_DEFAULTS.light;
  return isHexColor(normalizedTheme.tabTextColor)
    ? normalizedTheme.tabTextColor
    : modeDefaults.tabTextColor;
}

export function resolveThemeAccentColor(theme, fallbackColor) {
  const normalizedTheme = normalizeTheme(theme);
  return isHexColor(normalizedTheme.tabTextColor)
    ? normalizedTheme.tabTextColor
    : normalizeOptionalHexColor(fallbackColor, DEFAULT_STICKY_ACCENT_COLOR);
}

export function resolveSessionTabAccentColor(theme, fallbackColor = null) {
  const normalizedTheme = normalizeTheme(theme);
  return isHexColor(normalizedTheme.tabTextColor)
    ? normalizedTheme.tabTextColor
    : normalizeOptionalHexColor(fallbackColor);
}

export function resolveStickyAccentColor(theme, noteIndex = 0) {
  return resolveThemeAccentColor(theme, resolveDefaultStickyAccentColor(noteIndex));
}

export function resolveTabTextOpacity(theme) {
  return normalizeTheme(theme).tabTextOpacity;
}

export function resolveDefaultStickyAccentColor(noteIndex = 0) {
  return STICKY_PASTEL_PALETTE[
    Math.abs(Number.isFinite(noteIndex) ? noteIndex : 0) %
      STICKY_PASTEL_PALETTE.length
  ];
}

export function getSessionTabStyle(
  theme,
  appThemeMode = DEFAULT_APP_THEME.mode,
  noteIndex = 0,
) {
  const accentColor = resolveSessionTabAccentColor(
    theme,
    resolveDefaultStickyAccentColor(noteIndex),
  );
  const tabTextOpacity = resolveTabTextOpacity(theme);

  if (!accentColor && tabTextOpacity === DEFAULT_THEME.tabTextOpacity) {
    return {};
  }

  const resolvedAccentColor = accentColor ?? DEFAULT_STICKY_ACCENT_COLOR;
  const displayAccentColor =
    appThemeMode === "dark"
      ? mixHexColors(resolvedAccentColor, "#000000", SESSION_TAB_DARK_MODE_TONE_MIX)
      : resolvedAccentColor;
  const modeBase =
    SESSION_TAB_MODE_BASE_COLORS[appThemeMode] ?? SESSION_TAB_MODE_BASE_COLORS.light;
  const activeEffectiveBackground = blendHexOverHex(
    displayAccentColor,
    modeBase.active,
    tabTextOpacity,
  );
  const activeTextColor = getSessionTabContrastingTextColor(activeEffectiveBackground);
  const inactiveTextColor = hexToCssRgb(activeTextColor, 0.72);
  const activeBorderColor = hexToCssRgb(activeTextColor, 0.34);
  const activeShadowColor = hexToCssRgb(activeTextColor, 0.12);
  const inactiveShadowColor = hexToCssRgb(activeTextColor, 0.04);
  const tabBackground = hexToCssRgb(displayAccentColor, tabTextOpacity);

  return {
    "--session-tab-active-bg": tabBackground,
    "--session-tab-hover-bg": tabBackground,
    "--session-tab-inactive-bg": tabBackground,
    "--session-tab-text-color": activeTextColor,
    "--session-tab-inactive-text-color": inactiveTextColor,
    "--session-tab-border-color": activeBorderColor,
    "--session-tab-active-shadow": `inset 0 0 0 1px ${activeBorderColor}, 0 7px 16px ${activeShadowColor}`,
    "--session-tab-inactive-shadow": `inset 0 0 0 1px ${inactiveShadowColor}`,
    "--session-tab-dot-bg": hexToCssRgb(displayAccentColor, 0.24),
    "--session-tab-dot-text-color": activeTextColor,
  };
}

export function getStickyShellStyle(
  theme,
  accentColor,
  appThemeMode = DEFAULT_APP_THEME.mode,
) {
  const opacity = resolveTabTextOpacity(theme);
  const baseBackground = appThemeMode === "dark" ? "#191919" : "#ffffff";
  const effectiveBackground = blendHexOverHex(accentColor, baseBackground, opacity);
  const textColor = getContrastingTextColor(
    effectiveBackground,
    "#37352f",
    "#f7f7f4",
  );
  const isLightBackground = textColor === "#37352f";
  const headerColor = isLightBackground
    ? mixHexColors(accentColor, "#ffffff", 0.46)
    : mixHexColors(accentColor, "#000000", 0.08);
  const headerEffectiveBackground = blendHexOverHex(
    headerColor,
    baseBackground,
    Math.max(opacity, 0.96),
  );
  const panelColor = isLightBackground
    ? mixHexColors(accentColor, "#ffffff", 0.34)
    : mixHexColors(accentColor, "#ffffff", 0.08);
  const panelOpacity = Math.min(opacity + 0.04, 1);
  const panelEffectiveBackground = blendHexOverHex(
    panelColor,
    baseBackground,
    panelOpacity,
  );
  const panelTextColor = getContrastingTextColor(
    panelEffectiveBackground,
    "#37352f",
    "#f7f7f4",
  );
  const isLightPanelBackground = panelTextColor === "#37352f";
  const mutedColor = hexToCssRgb(textColor, isLightBackground ? 0.72 : 0.78);
  const panelMutedColor = hexToCssRgb(
    panelTextColor,
    isLightPanelBackground ? 0.68 : 0.76,
  );
  const borderColor = hexToCssRgb(textColor, isLightBackground ? 0.14 : 0.24);
  const tableBorderColor = getReadableBoundaryColor(
    effectiveBackground,
    textColor,
  );
  const tableControlBackground = mixHexColors(
    effectiveBackground,
    "#000000",
    isLightBackground ? 0.055 : 0.11,
  );
  const tableControlHoverBackground = mixHexColors(
    effectiveBackground,
    "#000000",
    isLightBackground ? 0.09 : 0.16,
  );
  const tableControlBorderColor = mixHexColors(
    effectiveBackground,
    textColor,
    isLightBackground ? 0.18 : 0.22,
  );
  const portalMenuBackground = mixHexColors(
    effectiveBackground,
    isLightBackground ? "#ffffff" : "#000000",
    isLightBackground ? 0.18 : 0.1,
  );
  const portalMenuHoverBackground = mixHexColors(
    portalMenuBackground,
    textColor,
    isLightBackground ? 0.08 : 0.14,
  );
  const portalMenuBorderColor = mixHexColors(
    portalMenuBackground,
    textColor,
    isLightBackground ? 0.16 : 0.22,
  );
  const tableControlShadow = isLightBackground
    ? "0 5px 12px rgb(55 53 47 / 0.12), inset 0 1px 0 rgb(255 255 255 / 0.28)"
    : "0 7px 16px rgb(0 0 0 / 0.34), inset 0 1px 0 rgb(255 255 255 / 0.08)";
  const portalMenuShadow = isLightBackground
    ? "0 12px 26px rgb(55 53 47 / 0.16), inset 0 1px 0 rgb(255 255 255 / 0.38)"
    : "0 14px 34px rgb(0 0 0 / 0.46), inset 0 1px 0 rgb(255 255 255 / 0.08)";
  const blockNoteShadowColor = isLightBackground
    ? "rgb(55 53 47 / 0.18)"
    : "rgb(0 0 0 / 0.48)";
  const controlBackground = isLightBackground
    ? "rgb(255 255 255 / 0.46)"
    : "rgb(0 0 0 / 0.20)";
  const controlHoverBackground = isLightBackground
    ? "rgb(255 255 255 / 0.68)"
    : "rgb(255 255 255 / 0.16)";
  const codeBorderColor = isLightBackground
    ? "rgb(31 35 40 / 0.32)"
    : "rgb(139 148 158 / 0.42)";
  const glassHighlight = isLightBackground
    ? "rgb(255 255 255 / 0.52)"
    : "rgb(255 255 255 / 0.14)";
  const glassLowlight = isLightBackground
    ? "rgb(55 53 47 / 0.10)"
    : "rgb(0 0 0 / 0.34)";
  const glassStroke = isLightBackground
    ? "rgb(255 255 255 / 0.46)"
    : "rgb(255 255 255 / 0.12)";
  const selectedBackground = isLightBackground ? "#37352f" : "#f7f7f4";
  const selectedText = isLightBackground ? "#ffffff" : "#191919";
  const iconColor = isLightBackground ? "#4f534f" : "#f1f1ef";
  const iconActiveColor = isLightBackground ? "#2f3437" : "#ffffff";
  const iconSurfaceFill = isLightBackground
    ? "rgb(255 255 255 / 0.40)"
    : "rgb(255 255 255 / 0.10)";
  const iconMutedFill = hexToCssRgb(textColor, isLightBackground ? 0.10 : 0.14);

  return {
    "--sticky-note-accent-color": accentColor,
    "--sticky-effective-bg": effectiveBackground,
    "--sticky-note-bg": hexToCssRgb(accentColor, opacity),
    "--sticky-note-header-bg": headerEffectiveBackground,
    "--sticky-note-panel-bg": hexToCssRgb(panelColor, panelOpacity),
    "--sticky-text-color": textColor,
    "--sticky-muted-color": mutedColor,
    "--sticky-panel-text": panelTextColor,
    "--sticky-panel-muted": panelMutedColor,
    "--sticky-border-color": borderColor,
    "--sticky-table-border-color": tableBorderColor,
    "--sticky-table-control-border-color": tableControlBorderColor,
    "--sticky-table-control-bg": tableControlBackground,
    "--sticky-table-control-hover-bg": tableControlHoverBackground,
    "--sticky-table-control-text": textColor,
    "--sticky-table-control-shadow": tableControlShadow,
    "--sticky-portal-menu-bg": portalMenuBackground,
    "--sticky-portal-menu-hover-bg": portalMenuHoverBackground,
    "--sticky-portal-menu-border-color": portalMenuBorderColor,
    "--sticky-portal-menu-shadow": portalMenuShadow,
    "--sticky-control-bg": controlBackground,
    "--sticky-control-hover-bg": controlHoverBackground,
    "--sticky-code-bg": "#0d1117",
    "--sticky-code-text": "#f0f6fc",
    "--sticky-code-border": codeBorderColor,
    "--sticky-code-muted": "#8b949e",
    "--sticky-glass-highlight": glassHighlight,
    "--sticky-glass-lowlight": glassLowlight,
    "--sticky-glass-stroke": glassStroke,
    "--bn-colors-editor-text": textColor,
    "--bn-colors-menu-text": textColor,
    "--bn-colors-menu-background": portalMenuBackground,
    "--bn-colors-tooltip-text": textColor,
    "--bn-colors-tooltip-background": portalMenuHoverBackground,
    "--bn-colors-hovered-text": textColor,
    "--bn-colors-hovered-background": portalMenuHoverBackground,
    "--bn-colors-selected-text": selectedText,
    "--bn-colors-selected-background": selectedBackground,
    "--bn-colors-disabled-text": hexToCssRgb(textColor, isLightBackground ? 0.42 : 0.48),
    "--bn-colors-disabled-background": hexToCssRgb(textColor, isLightBackground ? 0.08 : 0.12),
    "--bn-colors-border": borderColor,
    "--bn-colors-shadow": blockNoteShadowColor,
    "--bn-colors-side-menu": mutedColor,
    "--icon-chrome-color": iconColor,
    "--icon-chrome-active-color": iconActiveColor,
    "--icon-surface-fill": iconSurfaceFill,
    "--icon-muted-fill": iconMutedFill,
  };
}
