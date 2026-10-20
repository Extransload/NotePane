const test = require("node:test");
const assert = require("node:assert/strict");
const fixture = require("./fixtures/theme-baseline.json");

// The sticky and tab style output captured before the theme system existed (Task 2), for the
// six pastels, pure red and mid grey at three opacities in both modes. NotePane Light and Dark
// must reproduce it, except where the spec's contrast fallback applies: an entry whose text
// colour read below 4.5:1 on its own background (ruling R6).
const READABLE = 4.5;
// Task 8 deleted the glass variables: no stylesheet reads them.
const DELETED_STICKY_KEYS = new Set(["--sticky-glass-highlight", "--sticky-glass-lowlight", "--sticky-glass-stroke"]);

async function load() {
  // src/constants.js reads window.blocknoteSticky at import time.
  globalThis.window ??= {};
  const { getTheme } = await import("../../src/style/themes.js");
  const colorMath = await import("../../src/style/colorMath.js");
  const themeStyles = await import("../../src/style/themeStyles.js");
  const { STICKY_PASTEL_PALETTE } = await import("../../src/constants.js");
  return { getTheme, colorMath, themeStyles, pastels: STICKY_PASTEL_PALETTE };
}

const notePaneTheme = (getTheme, mode) => getTheme(mode === "dark" ? "notepane-dark" : "notepane-light");

// Compares colours, not spellings (ruling R13): #rgb -> #rrggbb, rgb()/rgba() -> "rgb(r g b / a)",
// 0.30 -> 0.3. Everything else is compared exactly.
function normaliseColours(value) {
  return value
    .replace(/#([0-9a-f])([0-9a-f])([0-9a-f])\b/gi, "#$1$1$2$2$3$3")
    .replace(/#[0-9a-f]{6}\b/gi, (hex) => hex.toLowerCase())
    .replace(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)/gi, (_, r, g, b, a) =>
      a === undefined ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${Number(a)})`,
    )
    .replace(/\s+/g, " ")
    .trim();
}
const normalise = (style) =>
  Object.fromEntries(
    Object.entries(style)
      .filter(([name]) => !DELETED_STICKY_KEYS.has(name))
      .map(([name, value]) => [name, normaliseColours(value)]),
  );

// Text rules. Today's sticky rule takes the higher-contrast colour of the pair; today's tab
// rule switches at a luminance of 0.46. The spec's readable rule keeps the higher-contrast
// colour of the pair if it reaches 4.5:1, and otherwise takes black or white, whichever reads
// better.
const higherContrast = (cm, background, [dark, light]) =>
  cm.getContrastRatio(background, dark) >= cm.getContrastRatio(background, light) ? dark : light;
const todaysStickyText = (cm) => (background, pair) => higherContrast(cm, background, pair);
const todaysTabText = (cm) => (background, [dark, light]) =>
  cm.getRelativeLuminance(background) > 0.46 ? dark : light;
const readableText = (cm) => (background, pair) => {
  const candidate = higherContrast(cm, background, pair);
  return cm.getContrastRatio(background, candidate) >= READABLE
    ? candidate
    : higherContrast(cm, background, ["#000000", "#ffffff"]);
};

// Today's sticky derivation (src/style/themeStyles.js before Task 8, glass variables left out)
// with the text rule passed in. With today's rule it reproduces the fixture; with the readable
// rule it gives what an exempt entry must be now: every field derived from the new text colour,
// including the light/dark chrome choice that follows it.
function stickyModel(cm, { accentColor, noteTheme, mode }, pickText) {
  const opacity = noteTheme.tabTextOpacity;
  const base = mode === "dark" ? "#191919" : "#ffffff";
  const inks = ["#37352f", "#f7f7f4"];
  const rgb = cm.hexToCssRgb;
  const background = cm.blendHexOverHex(accentColor, base, opacity);
  const text = pickText(background, inks);
  const isLight = cm.getRelativeLuminance(text) < cm.getRelativeLuminance(background);
  const side = (onLight, onDark) => (isLight ? onLight : onDark);
  const headerColor = isLight
    ? cm.mixHexColors(accentColor, "#ffffff", 0.46)
    : cm.mixHexColors(accentColor, "#000000", 0.08);
  const panelColor = cm.mixHexColors(accentColor, "#ffffff", side(0.34, 0.08));
  const panelOpacity = Math.min(opacity + 0.04, 1);
  const panelBackground = cm.blendHexOverHex(panelColor, base, panelOpacity);
  const panelText = pickText(panelBackground, inks);
  const isLightPanel = cm.getRelativeLuminance(panelText) < cm.getRelativeLuminance(panelBackground);
  const muted = rgb(text, side(0.72, 0.78));
  const border = rgb(text, side(0.14, 0.24));
  const menuBackground = cm.mixHexColors(background, side("#ffffff", "#000000"), side(0.18, 0.1));
  const menuHover = cm.mixHexColors(menuBackground, text, side(0.08, 0.14));
  return {
    "--sticky-note-accent-color": accentColor,
    "--sticky-effective-bg": background,
    "--sticky-note-bg": rgb(accentColor, opacity),
    "--sticky-note-header-bg": cm.blendHexOverHex(headerColor, base, Math.max(opacity, 0.96)),
    "--sticky-note-panel-bg": rgb(panelColor, panelOpacity),
    "--sticky-text-color": text,
    "--sticky-muted-color": muted,
    "--sticky-panel-text": panelText,
    "--sticky-panel-muted": rgb(panelText, isLightPanel ? 0.68 : 0.76),
    "--sticky-border-color": border,
    "--sticky-table-border-color": cm.getReadableBoundaryColor(background, text),
    "--sticky-table-control-border-color": cm.mixHexColors(background, text, side(0.18, 0.22)),
    "--sticky-table-control-bg": cm.mixHexColors(background, "#000000", side(0.055, 0.11)),
    "--sticky-table-control-hover-bg": cm.mixHexColors(background, "#000000", side(0.09, 0.16)),
    "--sticky-table-control-text": text,
    "--sticky-table-control-shadow": side(
      "0 5px 12px rgb(55 53 47 / 0.12), inset 0 1px 0 rgb(255 255 255 / 0.28)",
      "0 7px 16px rgb(0 0 0 / 0.34), inset 0 1px 0 rgb(255 255 255 / 0.08)",
    ),
    "--sticky-portal-menu-bg": menuBackground,
    "--sticky-portal-menu-hover-bg": menuHover,
    "--sticky-portal-menu-border-color": cm.mixHexColors(menuBackground, text, side(0.16, 0.22)),
    "--sticky-portal-menu-shadow": side(
      "0 12px 26px rgb(55 53 47 / 0.16), inset 0 1px 0 rgb(255 255 255 / 0.38)",
      "0 14px 34px rgb(0 0 0 / 0.46), inset 0 1px 0 rgb(255 255 255 / 0.08)",
    ),
    "--sticky-control-bg": side("rgb(255 255 255 / 0.46)", "rgb(0 0 0 / 0.20)"),
    "--sticky-control-hover-bg": side("rgb(255 255 255 / 0.68)", "rgb(255 255 255 / 0.16)"),
    "--sticky-code-bg": "#0d1117",
    "--sticky-code-text": "#f0f6fc",
    "--sticky-code-border": side("rgb(31 35 40 / 0.32)", "rgb(139 148 158 / 0.42)"),
    "--sticky-code-muted": "#8b949e",
    "--bn-colors-editor-text": text,
    "--bn-colors-menu-text": text,
    "--bn-colors-menu-background": menuBackground,
    "--bn-colors-tooltip-text": text,
    "--bn-colors-tooltip-background": menuHover,
    "--bn-colors-hovered-text": text,
    "--bn-colors-hovered-background": menuHover,
    "--bn-colors-selected-text": side("#ffffff", "#191919"),
    "--bn-colors-selected-background": side("#37352f", "#f7f7f4"),
    "--bn-colors-disabled-text": rgb(text, side(0.42, 0.48)),
    "--bn-colors-disabled-background": rgb(text, side(0.08, 0.12)),
    "--bn-colors-border": border,
    "--bn-colors-shadow": side("rgb(55 53 47 / 0.18)", "rgb(0 0 0 / 0.48)"),
    "--bn-colors-side-menu": muted,
    "--icon-chrome-color": side("#4f534f", "#f1f1ef"),
    "--icon-chrome-active-color": side("#2f3437", "#ffffff"),
    "--icon-surface-fill": side("rgb(255 255 255 / 0.40)", "rgb(255 255 255 / 0.10)"),
    "--icon-muted-fill": rgb(text, side(0.1, 0.14)),
  };
}

// Today's tab derivation, likewise. `background` is the colour the tab paints over the tab base.
function tabModel(cm, pastels, { noteTheme, mode, noteIndex }, pickText) {
  const accentColor = noteTheme.tabTextColor ?? pastels[noteIndex % pastels.length];
  const displayColor = mode === "dark" ? cm.mixHexColors(accentColor, "#000000", 0.12) : accentColor;
  const background = cm.blendHexOverHex(displayColor, mode === "dark" ? "#2a2a2a" : "#f1f1ef", noteTheme.tabTextOpacity);
  const text = pickText(background, ["#1f1f1f", "#fbfbfa"]);
  const rgb = cm.hexToCssRgb;
  const border = rgb(text, 0.34);
  const fill = rgb(displayColor, noteTheme.tabTextOpacity);
  return {
    background,
    style: {
      "--session-tab-active-bg": fill,
      "--session-tab-hover-bg": fill,
      "--session-tab-inactive-bg": fill,
      "--session-tab-text-color": text,
      "--session-tab-inactive-text-color": rgb(text, 0.72),
      "--session-tab-border-color": border,
      "--session-tab-active-shadow": `inset 0 0 0 1px ${border}, 0 7px 16px ${rgb(text, 0.12)}`,
      "--session-tab-inactive-shadow": `inset 0 0 0 1px ${rgb(text, 0.04)}`,
      "--session-tab-dot-bg": rgb(displayColor, 0.24),
      "--session-tab-dot-text-color": text,
    },
  };
}

const describeSticky = (entry) => `sticky ${entry.accentColor} @${entry.noteTheme.tabTextOpacity} ${entry.mode}`;
const describeTab = (entry) =>
  `tab ${entry.noteTheme.tabTextColor} #${entry.noteIndex} @${entry.noteTheme.tabTextOpacity} ${entry.mode}`;

test("the baseline model reproduces the fixture with today's text rules", async () => {
  const { colorMath: cm, pastels } = await load();
  for (const entry of fixture.sticky) {
    assert.deepEqual(normalise(stickyModel(cm, entry, todaysStickyText(cm))), normalise(entry.style), describeSticky(entry));
  }
  for (const entry of fixture.tabs) {
    assert.deepEqual(normalise(tabModel(cm, pastels, entry, todaysTabText(cm)).style), normalise(entry.style), describeTab(entry));
  }
});

test("NotePane sticky and tab output equals the baseline", async () => {
  const { getTheme, colorMath: cm, themeStyles, pastels } = await load();
  const exempt = { sticky: [], tabs: [] };

  for (const entry of fixture.sticky) {
    const label = describeSticky(entry);
    const actual = normalise(
      themeStyles.getStickyShellStyle(entry.noteTheme, entry.accentColor, notePaneTheme(getTheme, entry.mode)),
    );
    const background = entry.style["--sticky-effective-bg"];
    if (cm.getContrastRatio(entry.style["--sticky-text-color"], background) >= READABLE) {
      assert.deepEqual(actual, normalise(entry.style), label);
      continue;
    }
    exempt.sticky.push(label);
    // Neither colour of the pair reaches 4.5:1, so black or white, whichever reads better.
    const text = actual["--sticky-text-color"];
    assert.equal(text, higherContrast(cm, background, ["#000000", "#ffffff"]), label);
    assert.ok(cm.getContrastRatio(text, background) >= READABLE, label);
    assert.deepEqual(actual, normalise(stickyModel(cm, entry, readableText(cm))), label);
  }

  for (const entry of fixture.tabs) {
    const label = describeTab(entry);
    const actual = normalise(
      themeStyles.getSessionTabStyle(entry.noteTheme, notePaneTheme(getTheme, entry.mode), entry.noteIndex),
    );
    const { background } = tabModel(cm, pastels, entry, todaysTabText(cm));
    if (cm.getContrastRatio(entry.style["--session-tab-text-color"], background) >= READABLE) {
      assert.deepEqual(actual, normalise(entry.style), label);
      continue;
    }
    exempt.tabs.push(label);
    // Today's luminance switch picked the weaker colour of the pair; the readable rule keeps the
    // other one when it reaches 4.5:1.
    const text = actual["--session-tab-text-color"];
    assert.equal(text, readableText(cm)(background, ["#1f1f1f", "#fbfbfa"]), label);
    assert.ok(cm.getContrastRatio(text, background) >= READABLE, label);
    assert.deepEqual(actual, normalise(tabModel(cm, pastels, entry, readableText(cm)).style), label);
  }

  // The spec's own example of an unreadable colour is among the exemptions.
  for (const mode of ["light", "dark"]) assert.ok(exempt.sticky.includes(`sticky #ff0000 @1 ${mode}`), mode);
});
