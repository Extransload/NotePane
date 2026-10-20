import {
  hexToOklab,
  hexToOklch,
  oklchToHex,
} from "./colorMath.js";

// Tone matching: a colour the user painted (a sticky window, a session tab, an accent mark) is
// shown in the active theme's tone. Its hue is kept; its lightness, and at most its chroma, come
// from targets measured on the theme's palette, so a new theme needs no tuning. The stored
// colour is never rewritten. See "Tone matching" in the theme system spec.

const NAMED_COLOUR_KEYS = ["gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"];

// Below this OKLCH chroma a colour counts as neutral: a white, a grey or a black.
const NEUTRAL_CHROMA = 0.02;
// A neutral result keeps the theme's own tint, but never more chroma than this, so it stays
// neutral after rounding to hex.
const NEUTRAL_TINT_CHROMA = 0.015;
// Tints (fills and surfaces on light themes, surfaces on dark ones) carry this share of the
// named colours' chroma: a pastel on light themes, a muted tint on dark ones. At 60% the six
// default pastels stay apart (OKLab ΔE ≥ 0.02) even on Nord's muted palette.
const TINT_CHROMA_SHARE = 0.6;
// The smallest lightness step between the window and a tinted note, for a theme whose header
// sits at the window's lightness.
const MIN_TINT_STEP = 0.02;

function median(values) {
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * The lightness and chroma each role aims for in `theme`, measured on its palette:
 * - the named colours' median lightness and chroma: what a mark is drawn in, and on dark themes
 *   what a tab is filled with, a bright pastel like NotePane Dark's tabs;
 * - a tint one header step off the window, toward the text: the pastel a tab or sticky window
 *   is filled with on light themes, and the dark tint a sticky window is on dark ones. The
 *   header is the theme's first surface off the window, so a note reads as one of its surfaces.
 * Chroma is a ceiling: a softer input keeps its own chroma, so pastels stay pastel and a near
 * grey just above the neutral threshold does not turn vivid.
 */
function toneTargets(theme) {
  const { palette, scheme } = theme;
  const named = NAMED_COLOUR_KEYS.map((key) => hexToOklch(palette[key]));
  const accentTone = { l: median(named.map(({ l }) => l)), c: median(named.map(({ c }) => c)) };
  const windowLightness = hexToOklch(palette.window).l;
  const step = Math.max(Math.abs(hexToOklch(palette.header).l - windowLightness), MIN_TINT_STEP);
  const tint = {
    l: scheme === "dark" ? windowLightness + step : windowLightness - step,
    c: accentTone.c * TINT_CHROMA_SHARE,
  };
  return scheme === "dark"
    ? { fill: accentTone, surface: tint, mark: accentTone }
    : { fill: tint, surface: tint, mark: accentTone };
}

// A neutral input on the theme's own neutral axis, from the window to the text colour. It keeps
// its relative lightness: white lands on the role's target lightness, black on the theme's
// darkest neutral (its text on light themes, its window on dark ones), greys in between. The
// result takes the axis's tint at that lightness, kept below the neutral threshold.
function matchNeutral(input, theme, target) {
  const window = hexToOklab(theme.palette.window);
  const text = hexToOklab(theme.palette.text);
  const darkest = Math.min(window.l, text.l);
  const lightness = darkest + input.l * (target.l - darkest);
  const span = text.l - window.l;
  const along = span === 0 ? 0 : Math.min(Math.max((lightness - window.l) / span, 0), 1);
  const a = window.a + (text.a - window.a) * along;
  const b = window.b + (text.b - window.b) * along;
  return oklchToHex({
    l: lightness,
    c: Math.min(Math.hypot(a, b), NEUTRAL_TINT_CHROMA),
    h: (Math.atan2(b, a) * 180) / Math.PI,
  });
}

/**
 * `hex` in `theme`'s tone for `role`:
 * - "fill": a session tab's background;
 * - "surface": a sticky window's background;
 * - "mark": a small mark, such as the search result dot or the tab menu swatch.
 * Themes with `toneMatching: false` (NotePane Light and Dark) get `hex` back unchanged.
 */
export function toneMatch(hex, theme, role) {
  if (theme.toneMatching === false) {
    return hex;
  }
  const target = toneTargets(theme)[role];
  const input = hexToOklch(hex);
  if (input.c < NEUTRAL_CHROMA) {
    return matchNeutral(input, theme, target);
  }
  return oklchToHex({ l: target.l, c: Math.min(input.c, target.c), h: input.h });
}
