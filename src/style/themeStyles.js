import {
  DEFAULT_STICKY_ACCENT_COLOR,
  DEFAULT_THEME,
  STICKY_PASTEL_PALETTE,
} from "../constants.js";
import {
  normalizeOptionalHexColor,
  normalizeTheme,
} from "../model/preferences.js";
import {
  BLACK,
  READABLE_CONTRAST,
  WHITE,
  blendHexOverHex,
  getContrastRatio,
  getReadableBoundaryColor,
  getRelativeLuminance,
  hexToCssRgb,
  isHexColor,
  mixHexColors,
  pickReadableText,
  readableOn,
  readableOpacity,
} from "./colorMath.js";
import {
  resolveLinkColor,
} from "./themeTokens.js";
import {
  toneMatch,
} from "./toneMatch.js";

// Inactive session tabs show the tab text at this opacity, or more where it would not read.
const INACTIVE_TAB_TEXT_OPACITY = 0.72;

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

// The colour that marks a note in small places, such as the search result dot: the colour its
// session tab resolves (its own colour, or the default pastel of `noteIndex`, its place in the
// stored notes; see getNoteIndexById), in the active theme's tone.
export function resolveNoteMarkColor(noteTheme, theme, noteIndex) {
  const accentColor = resolveSessionTabAccentColor(
    noteTheme,
    resolveDefaultStickyAccentColor(noteIndex),
  );
  return toneMatch(accentColor, theme, "mark");
}

/**
 * The colours a sticky window and a session tab draw around a note's own colour, derived from
 * the palette. NotePane Light and Dark carry today's hand-tuned values as `theme.noteChrome`
 * instead, in the same shape:
 * - `base`, `tabBase`: what a sticky window's and a session tab's colour is blended over;
 * - `inkDark`/`inkLight`, `tabInkDark`/`tabInkLight`: the two text candidates, darker first;
 * - `tabToneMix`: how far a tab's colour is darkened toward `palette.shadow`;
 * - every other field is an `{ onLight, onDark }` pair, taken by whether the note's text is
 *   darker than its background. `headerColor`, `panelColor`, `portalMenuBackground`,
 *   `tableControlBackground` and `tableControlHoverBackground` are the colours mixed into the
 *   note colour for that part; the rest are CSS values used as they are.
 * The light ink lifts and the shadow colour deepens, as white and black do in NotePane.
 */
export function deriveNoteChrome(theme) {
  const { palette } = theme;
  const [inkDark, inkLight] =
    getRelativeLuminance(palette.text) < getRelativeLuminance(palette.window)
      ? [palette.text, palette.window]
      : [palette.window, palette.text];
  const shade = palette.shadow;
  const withAlpha = hexToCssRgb;
  const pair = (onLight, onDark) => ({ onLight, onDark });
  return {
    base: palette.window,
    inkDark,
    inkLight,
    tabBase: palette.sidebar,
    tabInkDark: inkDark,
    tabInkLight: inkLight,
    tabToneMix: 0,
    headerColor: pair(inkLight, shade),
    panelColor: pair(inkLight, inkLight),
    tableControlBackground: pair(shade, shade),
    tableControlHoverBackground: pair(shade, shade),
    portalMenuBackground: pair(inkLight, shade),
    tableControlShadow: pair(
      `0 5px 12px ${withAlpha(inkDark, 0.12)}, inset 0 1px 0 ${withAlpha(inkLight, 0.28)}`,
      `0 7px 16px ${withAlpha(shade, 0.34)}, inset 0 1px 0 ${withAlpha(inkLight, 0.08)}`,
    ),
    portalMenuShadow: pair(
      `0 12px 26px ${withAlpha(inkDark, 0.16)}, inset 0 1px 0 ${withAlpha(inkLight, 0.38)}`,
      `0 14px 34px ${withAlpha(shade, 0.46)}, inset 0 1px 0 ${withAlpha(inkLight, 0.08)}`,
    ),
    blockNoteShadowColor: pair(withAlpha(inkDark, 0.18), withAlpha(shade, 0.48)),
    controlBackground: pair(withAlpha(inkLight, 0.46), withAlpha(shade, 0.2)),
    controlHoverBackground: pair(withAlpha(inkLight, 0.68), withAlpha(inkLight, 0.16)),
    codeBorderColor: pair(withAlpha(inkDark, 0.32), withAlpha(palette.codeMuted, 0.42)),
    selectedBackground: pair(inkDark, inkLight),
    selectedText: pair(inkLight, inkDark),
    iconColor: pair(mixHexColors(inkDark, inkLight, 0.2), mixHexColors(inkLight, inkDark, 0.04)),
    iconActiveColor: pair(inkDark, inkLight),
  };
}

export function getNoteChrome(theme) {
  return theme.noteChrome ?? deriveNoteChrome(theme);
}

export function getSessionTabStyle(noteTheme, theme, noteIndex = 0) {
  const accentColor = resolveSessionTabAccentColor(
    noteTheme,
    resolveDefaultStickyAccentColor(noteIndex),
  );
  const tabTextOpacity = resolveTabTextOpacity(noteTheme);

  if (!accentColor && tabTextOpacity === DEFAULT_THEME.tabTextOpacity) {
    return {};
  }

  const chrome = getNoteChrome(theme);
  const fillColor = mixHexColors(
    toneMatch(accentColor ?? DEFAULT_STICKY_ACCENT_COLOR, theme, "fill"),
    theme.palette.shadow,
    chrome.tabToneMix,
  );
  const activeEffectiveBackground = blendHexOverHex(fillColor, chrome.tabBase, tabTextOpacity);
  const activeTextColor = pickReadableText(activeEffectiveBackground, [
    chrome.tabInkDark,
    chrome.tabInkLight,
  ]);
  const inactiveTextColor = hexToCssRgb(
    activeTextColor,
    readableOpacity(activeTextColor, activeEffectiveBackground, INACTIVE_TAB_TEXT_OPACITY),
  );
  const activeBorderColor = hexToCssRgb(activeTextColor, 0.34);
  const activeShadowColor = hexToCssRgb(activeTextColor, 0.12);
  const inactiveShadowColor = hexToCssRgb(activeTextColor, 0.04);
  const tabBackground = hexToCssRgb(fillColor, tabTextOpacity);

  return {
    "--session-tab-active-bg": tabBackground,
    "--session-tab-hover-bg": tabBackground,
    "--session-tab-inactive-bg": tabBackground,
    "--session-tab-text-color": activeTextColor,
    "--session-tab-inactive-text-color": inactiveTextColor,
    "--session-tab-border-color": activeBorderColor,
    "--session-tab-active-shadow": `inset 0 0 0 1px ${activeBorderColor}, 0 7px 16px ${activeShadowColor}`,
    "--session-tab-inactive-shadow": `inset 0 0 0 1px ${inactiveShadowColor}`,
    "--session-tab-dot-bg": hexToCssRgb(fillColor, 0.24),
    "--session-tab-dot-text-color": activeTextColor,
  };
}

export function getStickyShellStyle(noteTheme, accentColor, theme) {
  const chrome = getNoteChrome(theme);
  const { palette } = theme;
  const noteColor = toneMatch(accentColor, theme, "surface");
  const opacity = resolveTabTextOpacity(noteTheme);
  const baseBackground = chrome.base;
  const inks = [chrome.inkDark, chrome.inkLight];
  const effectiveBackground = blendHexOverHex(noteColor, baseBackground, opacity);
  const textColor = pickReadableText(effectiveBackground, inks);
  const isLightBackground =
    getRelativeLuminance(textColor) < getRelativeLuminance(effectiveBackground);
  // The value of a note chrome pair for this note's background.
  const forBackground = (name) => chrome[name][isLightBackground ? "onLight" : "onDark"];
  const headerColor = mixHexColors(
    noteColor,
    forBackground("headerColor"),
    isLightBackground ? 0.46 : 0.08,
  );
  const headerEffectiveBackground = blendHexOverHex(
    headerColor,
    baseBackground,
    Math.max(opacity, 0.96),
  );
  const panelColor = mixHexColors(
    noteColor,
    forBackground("panelColor"),
    isLightBackground ? 0.34 : 0.08,
  );
  const panelOpacity = Math.min(opacity + 0.04, 1);
  const panelEffectiveBackground = blendHexOverHex(
    panelColor,
    baseBackground,
    panelOpacity,
  );
  const panelTextColor = pickReadableText(panelEffectiveBackground, inks);
  const isLightPanelBackground =
    getRelativeLuminance(panelTextColor) < getRelativeLuminance(panelEffectiveBackground);
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
    forBackground("tableControlBackground"),
    isLightBackground ? 0.055 : 0.11,
  );
  const tableControlHoverBackground = mixHexColors(
    effectiveBackground,
    forBackground("tableControlHoverBackground"),
    isLightBackground ? 0.09 : 0.16,
  );
  const tableControlBorderColor = mixHexColors(
    effectiveBackground,
    textColor,
    isLightBackground ? 0.18 : 0.22,
  );
  const portalMenuBackground = mixHexColors(
    effectiveBackground,
    forBackground("portalMenuBackground"),
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
  // Links: the theme's link where it reads on the note at 4.5:1. Elsewhere the theme's blue,
  // mixed toward the note's text colour until it does, as --notepane-link is fitted to the window.
  const linkStyle =
    getContrastRatio(resolveLinkColor(theme), effectiveBackground) >= READABLE_CONTRAST
      ? {}
      : { "--notepane-link": readableOn(palette.blue, [effectiveBackground], textColor) };
  // The accent marks the note; the table of contents also writes its current entry in it, on its
  // panel over the note. As text it is fitted like the link, on both the note and the panel:
  // mixed toward the first ink that reads on both until it does.
  const accentMarkColor = toneMatch(accentColor, theme, "mark");
  const accentBackgrounds = [effectiveBackground, panelEffectiveBackground];
  const accentInk =
    [textColor, panelTextColor, BLACK, WHITE].find((ink) =>
      accentBackgrounds.every((background) => getContrastRatio(ink, background) >= READABLE_CONTRAST),
    ) ?? textColor;
  const accentTextColor = readableOn(accentMarkColor, accentBackgrounds, accentInk);

  return {
    ...linkStyle,
    "--sticky-note-accent-color": accentMarkColor,
    "--sticky-note-accent-text": accentTextColor,
    "--sticky-effective-bg": effectiveBackground,
    "--sticky-note-bg": hexToCssRgb(noteColor, opacity),
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
    "--sticky-table-control-shadow": forBackground("tableControlShadow"),
    "--sticky-portal-menu-bg": portalMenuBackground,
    "--sticky-portal-menu-hover-bg": portalMenuHoverBackground,
    "--sticky-portal-menu-border-color": portalMenuBorderColor,
    "--sticky-portal-menu-shadow": forBackground("portalMenuShadow"),
    "--sticky-control-bg": forBackground("controlBackground"),
    "--sticky-control-hover-bg": forBackground("controlHoverBackground"),
    "--sticky-code-bg": palette.codeBg,
    "--sticky-code-text": palette.codeText,
    "--sticky-code-border": forBackground("codeBorderColor"),
    "--sticky-code-muted": palette.codeMuted,
    "--bn-colors-editor-text": textColor,
    "--bn-colors-menu-text": textColor,
    "--bn-colors-menu-background": portalMenuBackground,
    "--bn-colors-tooltip-text": textColor,
    "--bn-colors-tooltip-background": portalMenuHoverBackground,
    "--bn-colors-hovered-text": textColor,
    "--bn-colors-hovered-background": portalMenuHoverBackground,
    "--bn-colors-selected-text": forBackground("selectedText"),
    "--bn-colors-selected-background": forBackground("selectedBackground"),
    "--bn-colors-disabled-text": hexToCssRgb(textColor, isLightBackground ? 0.42 : 0.48),
    "--bn-colors-disabled-background": hexToCssRgb(textColor, isLightBackground ? 0.08 : 0.12),
    "--bn-colors-border": borderColor,
    "--bn-colors-shadow": forBackground("blockNoteShadowColor"),
    "--bn-colors-side-menu": mutedColor,
    "--icon-chrome-color": forBackground("iconColor"),
    "--icon-chrome-active-color": forBackground("iconActiveColor"),
  };
}
