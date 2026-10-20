import { getContrastingTextColor, hexToCssRgb, hexToRgb, mixHexColors } from "./colorMath.js";
import { DEFAULT_THEME_ID, getTheme } from "./themes.js";

const NAMED_COLOURS = ["gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"];

// Strength of derived values per scheme: [light, dark].
const STRENGTH = {
  border: [0.12, 0.12],
  tableActive: [0.12, 0.14],
  tableFocused: [0.58, 0.62],
  controlBg: [0.76, 0.06],
  controlHover: [0.95, 0.1],
  iconSurface: [0.78, 0.08],
  iconMuted: [0.08, 0.12],
  buttonBg: [0.74, 0.07],
  buttonHover: [0.92, 0.11],
  buttonActive: [0.08, 0.12],
  buttonActiveHover: [0.11, 0.15],
  buttonBorder: [0.14, 0.14],
  buttonHoverBorder: [0.22, 0.24],
  buttonActiveBorder: [0.26, 0.3],
  codeBorder: [0.34, 0.34],
  inlineCode: [0.16, 0.1],
  glass: [0.38, 0.08],
  glassSoft: [0.28, 0.08],
  glassButton: [0.42, 0.08],
  menuShadow: [0.14, 0.4],
  panelShadow: [0.18, 0.42],
  portalShadow: [0.16, 0.46],
  controlShadow: [0.12, 0.34],
  buttonShadow: [0.06, 0.18],
  bnShadow: [0.16, 0.48],
  editorBgMix: [0.15, 0.35],
  findMatch: [0.32, 0.22],
  findCurrent: [0.55, 0.5],
  scrollbarTrack: [90, 84],
  scrollbarThumb: [22, 28],
  scrollbarThumbHover: [34, 42],
};
// Shadow geometry per scheme: [light, dark].
const GEOMETRY = {
  menu: ["0 10px 24px", "0 12px 34px"],
  panel: ["0 22px 54px", "0 22px 54px"],
  portal: ["0 12px 26px", "0 14px 34px"],
  control: ["0 5px 12px", "0 7px 16px"],
  button: ["0 4px 10px", "0 4px 12px"],
};

function pick(pair, scheme) {
  return scheme === "dark" ? pair[1] : pair[0];
}

function commaRgba(hex, alpha) {
  const [red, green, blue] = hexToRgb(hex);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/**
 * Derives every colour custom property from a theme's palette. Hover, border, shadow, menu,
 * table control, scrollbar and find-highlight values are computed; `theme.overrides` replaces
 * individual tokens and is applied last.
 */
export function buildThemeTokens(theme) {
  const { palette, scheme } = theme;
  const s = (name) => pick(STRENGTH[name], scheme);
  const g = (name) => pick(GEOMETRY[name], scheme);
  // Low-alpha borders and pressed fills are drawn with palette.text in both schemes.
  // Hover fills sit on the surface: the hover colour on light, a veil of the text colour on dark.
  const hoverBase = scheme === "dark" ? palette.text : palette.hover;
  // Glass highlights and the translucent chrome fills: the panel colour on light themes, where
  // they brighten a surface, and the text colour on dark themes, where they lift it.
  const glass = scheme === "dark" ? palette.text : palette.panel;
  // Drop shadows under controls and menus are tinted with the text colour on light themes.
  const tint = scheme === "dark" ? palette.shadow : palette.text;
  const shadow = (name, strength, base = palette.shadow) =>
    `${g(name)} ${hexToCssRgb(base, s(strength))}`;
  const highlight = (strength) => `inset 0 1px 0 ${hexToCssRgb(glass, s(strength))}`;

  const tokens = {
    "--sticky-effective-bg": palette.window,
    "--sticky-shell-bg": palette.window,
    "--sticky-header-bg": palette.header,
    "--sticky-sidebar-bg": palette.sidebar,
    "--sticky-editor-bg": palette.window,
    "--sticky-panel-bg": palette.panel,
    "--sticky-panel-text": palette.text,
    "--sticky-panel-muted": palette.muted,
    "--sticky-text-color": palette.text,
    "--sticky-muted-color": palette.muted,
    "--sticky-border-color": hexToCssRgb(palette.text, s("border")),
    "--sticky-table-border-color": palette.lineStrong,
    "--sticky-table-active-bg": hexToCssRgb(palette.accent, s("tableActive")),
    "--sticky-table-focused-border-color": hexToCssRgb(palette.accent, s("tableFocused")),
    "--sticky-table-control-border-color": palette.line,
    "--sticky-table-control-bg": mixHexColors(palette.window, palette.text, 0.03),
    "--sticky-table-control-hover-bg": palette.hover,
    "--sticky-table-control-text": palette.text,
    "--sticky-table-control-shadow": `${shadow("control", "controlShadow", tint)}, ${highlight("glassSoft")}`,
    "--sticky-portal-menu-bg": palette.panel,
    "--sticky-portal-menu-hover-bg": palette.hover,
    "--sticky-portal-menu-border-color": palette.line,
    "--sticky-portal-menu-shadow": `${shadow("portal", "portalShadow", tint)}, ${highlight("glass")}`,
    "--sticky-control-bg": hexToCssRgb(glass, s("controlBg")),
    "--sticky-control-hover-bg": hexToCssRgb(hoverBase, s("controlHover")),
    "--sticky-danger-color": palette.danger,
    "--sticky-code-bg": palette.codeBg,
    "--sticky-code-text": palette.codeText,
    "--sticky-code-border": hexToCssRgb(palette.codeMuted, s("codeBorder")),
    "--sticky-code-muted": palette.codeMuted,
    "--sticky-inline-code-bg": hexToCssRgb(palette.text, s("inlineCode")),
    "--sticky-inline-code-text": palette.danger,
    "--sticky-menu-shadow": shadow("menu", "menuShadow"),
    "--sticky-panel-shadow": shadow("panel", "panelShadow"),
    "--sticky-scrollbar-track": `color-mix(in srgb, var(--sticky-editor-bg) ${s("scrollbarTrack")}%, transparent)`,
    "--sticky-scrollbar-thumb": `color-mix(in srgb, var(--sticky-text-color) ${s("scrollbarThumb")}%, transparent)`,
    "--sticky-scrollbar-thumb-hover": `color-mix(in srgb, var(--sticky-text-color) ${s("scrollbarThumbHover")}%, transparent)`,
    "--brand-pane-cream": palette.window,
    "--brand-pastel-sage": mixHexColors(palette.window, palette.green, 0.2),
    "--brand-pastel-sky": mixHexColors(palette.window, palette.blue, 0.2),
    "--brand-graphite-ink": palette.text,
    "--icon-tone-copy": palette.blue,
    "--icon-tone-delete": palette.red,
    "--icon-tone-dock": palette.blue,
    "--icon-tone-export": palette.success,
    "--icon-tone-palette": palette.purple,
    "--icon-tone-pin": palette.orange,
    "--icon-tone-pin-active": palette.red,
    "--icon-tone-restore": palette.green,
    "--icon-tone-settings": palette.purple,
    "--icon-tone-sidebar": palette.blue,
    "--icon-tone-sticky": palette.yellow,
    "--icon-tone-tabs": palette.blue,
    "--icon-tone-trash": palette.red,
    "--default-tab-text-color": palette.text,
    "--icon-surface-fill": hexToCssRgb(glass, s("iconSurface")),
    "--icon-muted-fill": hexToCssRgb(palette.text, s("iconMuted")),
    "--icon-chrome-color": palette.muted,
    "--icon-chrome-active-color": palette.text,
    "--chrome-icon-button-bg": hexToCssRgb(glass, s("buttonBg")),
    "--chrome-icon-button-hover-bg": hexToCssRgb(hoverBase, s("buttonHover")),
    "--chrome-icon-button-active-bg": hexToCssRgb(palette.text, s("buttonActive")),
    "--chrome-icon-button-active-hover-bg": hexToCssRgb(palette.text, s("buttonActiveHover")),
    "--chrome-icon-button-border": hexToCssRgb(palette.text, s("buttonBorder")),
    "--chrome-icon-button-hover-border": hexToCssRgb(palette.text, s("buttonHoverBorder")),
    "--chrome-icon-button-active-border": hexToCssRgb(palette.text, s("buttonActiveBorder")),
    "--chrome-icon-button-shadow": `${shadow("button", "buttonShadow")}, ${highlight("glassButton")}`,
    "--session-tab-active-bg": palette.header,
    "--session-tab-inactive-bg": palette.header,
    "--session-tab-hover-bg": palette.header,
    "--bn-colors-editor-text": "var(--sticky-text-color)",
    "--bn-colors-editor-background": "transparent",
    "--bn-colors-menu-text": "var(--sticky-panel-text)",
    "--bn-colors-menu-background": "var(--sticky-portal-menu-bg)",
    "--bn-colors-tooltip-text": "var(--sticky-panel-text)",
    "--bn-colors-tooltip-background": "var(--sticky-portal-menu-hover-bg)",
    "--bn-colors-hovered-text": "var(--sticky-text-color)",
    "--bn-colors-hovered-background": "var(--sticky-portal-menu-hover-bg)",
    "--bn-colors-selected-text": getContrastingTextColor(palette.accent, palette.text, palette.window),
    "--bn-colors-selected-background": palette.accent,
    "--bn-colors-disabled-text": palette.faint,
    "--bn-colors-disabled-background": palette.header,
    "--bn-colors-border": hexToCssRgb(palette.text, s("border")),
    "--bn-colors-shadow": hexToCssRgb(palette.shadow, s("bnShadow")),
    "--bn-colors-side-menu": palette.faint,
    "--notepane-find-match-bg": commaRgba(palette.warning, s("findMatch")),
    "--notepane-find-current-bg": commaRgba(palette.orange, s("findCurrent")),
  };

  for (const name of NAMED_COLOURS) {
    tokens[`--notepane-editor-${name}-text`] = palette[name];
    tokens[`--notepane-editor-${name}-bg`] = mixHexColors(palette.window, palette[name], s("editorBgMix"));
  }

  return { ...tokens, ...theme.overrides };
}

export const THEME_TOKEN_NAMES = Object.keys(buildThemeTokens(getTheme(DEFAULT_THEME_ID))).sort();
