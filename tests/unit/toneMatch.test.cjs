const test = require("node:test");
const assert = require("node:assert/strict");

// Catppuccin Mocha, the official v1 colours, on NotePane's 27 palette keys. Task 9 moves this
// exact palette into electron/themes.json and replaces this constant with
// getTheme("catppuccin-mocha").
//   Surfaces follow tablepeek (web/src/palette.ts): window = base (its bg), panel = mantle,
//   header = surface0 (its head), line = surface1, hover = surface1 (its btnHover), text = text
//   (its ink), muted = subtext0, faint = overlay1, accent = mauve, danger = red (its error),
//   success = green (its ok), warning = yellow (its warn).
//   Keys tablepeek has no slot for: sidebar = mantle, lineStrong = overlay0, shadow = crust,
//   codeBg = base (the catppuccin-mocha Shiki background), codeText = text, codeMuted = overlay2.
//   Named colours are Mocha's accents: gray = overlay2, brown = flamingo, red = red,
//   orange = peach, yellow = yellow, green = green, blue = blue, purple = mauve, pink = pink.
const CATPPUCCIN_MOCHA = {
  id: "catppuccin-mocha",
  label: "Catppuccin Mocha",
  scheme: "dark",
  codeTheme: "catppuccin-mocha",
  toneMatching: true,
  palette: {
    window: "#1e1e2e",
    sidebar: "#181825",
    header: "#313244",
    panel: "#181825",
    hover: "#45475a",
    line: "#45475a",
    lineStrong: "#6c7086",
    text: "#cdd6f4",
    muted: "#a6adc8",
    faint: "#7f849c",
    accent: "#cba6f7",
    danger: "#f38ba8",
    success: "#a6e3a1",
    warning: "#f9e2af",
    shadow: "#11111b",
    codeBg: "#1e1e2e",
    codeText: "#cdd6f4",
    codeMuted: "#9399b2",
    gray: "#9399b2",
    brown: "#f2cdcd",
    red: "#f38ba8",
    orange: "#fab387",
    yellow: "#f9e2af",
    green: "#a6e3a1",
    blue: "#89b4fa",
    purple: "#cba6f7",
    pink: "#f5c2e7",
  },
  overrides: {},
  overrideReasons: [],
};

const EXTREMES = ["#ff0000", "#00ff00", "#0000ff", "#ffffff", "#000000", "#808080"];
const ROLES = ["fill", "surface", "mark"];
const OPACITIES = [1, 0.6, 0.35];
const NEUTRAL_CHROMA = 0.02;

async function load() {
  // src/constants.js reads window.blocknoteSticky at import time.
  globalThis.window ??= {};
  const themes = await import("../../src/style/themes.js");
  const { SENTINEL_THEMES } = await import("../../src/style/sentinelThemes.js");
  const colorMath = await import("../../src/style/colorMath.js");
  const { toneMatch } = await import("../../src/style/toneMatch.js");
  const themeStyles = await import("../../src/style/themeStyles.js");
  const { STICKY_PASTEL_PALETTE } = await import("../../src/constants.js");
  themes.registerTestThemes([...SENTINEL_THEMES, CATPPUCCIN_MOCHA]);
  const toneMatchedThemes = themes.listThemes().filter((theme) => theme.toneMatching);
  // The four sentinels and Mocha, so no test below passes over an empty list.
  assert.ok(toneMatchedThemes.length >= 5, toneMatchedThemes.map((theme) => theme.id).join());
  return {
    ...themes,
    ...colorMath,
    ...themeStyles,
    toneMatch,
    toneMatchedThemes,
    pastels: STICKY_PASTEL_PALETTE,
    inputs: [...STICKY_PASTEL_PALETTE, ...EXTREMES],
  };
}

test.after(async () => {
  const { registerTestThemes } = await import("../../src/style/themes.js");
  registerTestThemes([]);
});

// OKLab from the OKLCH helper, and the Euclidean distance between two colours in it.
function toOklab(hexToOklch, hex) {
  const { l, c, h } = hexToOklch(hex);
  const radians = (h * Math.PI) / 180;
  return [l, c * Math.cos(radians), c * Math.sin(radians)];
}
function deltaE(hexToOklch, first, second) {
  const [l1, a1, b1] = toOklab(hexToOklch, first);
  const [l2, a2, b2] = toOklab(hexToOklch, second);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
const hueDistance = (first, second) => {
  const difference = Math.abs(first - second) % 360;
  return Math.min(difference, 360 - difference);
};

// "rgb(r g b / a)" composited over an opaque hex colour, as the browser paints a tab fill.
function compositeOver(colorMath, cssRgb, backgroundHex) {
  const [red, green, blue, alpha] = cssRgb.match(/[\d.]+/g).map(Number);
  const [backgroundRed, backgroundGreen, backgroundBlue] = colorMath.hexToRgb(backgroundHex);
  return colorMath.rgbToHex(
    red * alpha + backgroundRed * (1 - alpha),
    green * alpha + backgroundGreen * (1 - alpha),
    blue * alpha + backgroundBlue * (1 - alpha),
  );
}

test("hexToOklch and oklchToHex round-trip sRGB colours", async () => {
  const { hexToOklch, oklchToHex, inputs } = await load();
  for (const hex of [...inputs, "#1e1e2e", "#cba6f7", "#3a1a00"]) {
    assert.equal(oklchToHex(hexToOklch(hex)), hex, hex);
  }
  const white = hexToOklch("#ffffff");
  assert.ok(Math.abs(white.l - 1) < 1e-3 && white.c < 1e-3, JSON.stringify(white));
});

test("oklchToHex reduces chroma until the colour fits in sRGB", async () => {
  const { hexToOklch, oklchToHex } = await load();
  // Far outside sRGB at this lightness: the result keeps lightness and hue.
  const result = oklchToHex({ l: 0.9, c: 0.4, h: 264 });
  const reduced = hexToOklch(result);
  assert.match(result, /^#[0-9a-f]{6}$/);
  assert.ok(Math.abs(reduced.l - 0.9) < 0.01, `${result} l=${reduced.l}`);
  assert.ok(hueDistance(reduced.h, 264) <= 3, `${result} h=${reduced.h}`);
  assert.ok(reduced.c < 0.4, `${result} c=${reduced.c}`);
});

test("pickReadableText keeps a readable candidate and falls back to black or white", async () => {
  const { pickReadableText, getContrastRatio, BLACK, WHITE } = await load();
  assert.equal(BLACK, "#000000");
  assert.equal(WHITE, "#ffffff");
  assert.equal(pickReadableText("#fff2b8", ["#37352f", "#f7f7f4"]), "#37352f");
  assert.equal(pickReadableText("#202020", ["#37352f", "#f7f7f4"]), "#f7f7f4");
  // Pure red: #37352f reads at 3.1:1 and #f7f7f4 at 3.7:1, so neither candidate is kept.
  assert.equal(pickReadableText("#ff0000", ["#37352f", "#f7f7f4"]), BLACK);
  assert.equal(pickReadableText("#0000ff", ["#808080", "#7f7f7f"]), WHITE);
  for (const background of ["#ff0000", "#808080", "#00ff00", "#0000ff", "#777777"]) {
    const text = pickReadableText(background, ["#7a7a7a", "#858585"]);
    assert.ok(getContrastRatio(text, background) >= 4.5, `${text} on ${background}`);
  }
});

test("hue is kept for chromatic inputs", async () => {
  const { toneMatch, toneMatchedThemes, inputs, hexToOklch } = await load();
  for (const theme of toneMatchedThemes) {
    for (const role of ROLES) {
      for (const hex of inputs) {
        const input = hexToOklch(hex);
        if (input.c < NEUTRAL_CHROMA) continue;
        const result = toneMatch(hex, theme, role);
        const distance = hueDistance(hexToOklch(result).h, input.h);
        assert.ok(distance <= 3, `${theme.id} ${role} ${hex} -> ${result}: hue moved ${distance.toFixed(2)}°`);
      }
    }
  }
});

test("neutral inputs stay neutral", async () => {
  const { toneMatch, toneMatchedThemes, inputs, hexToOklch } = await load();
  for (const theme of toneMatchedThemes) {
    for (const role of ROLES) {
      for (const hex of inputs) {
        if (hexToOklch(hex).c >= NEUTRAL_CHROMA) continue;
        const result = toneMatch(hex, theme, role);
        const chroma = hexToOklch(result).c;
        assert.ok(chroma < NEUTRAL_CHROMA, `${theme.id} ${role} ${hex} -> ${result}: chroma ${chroma.toFixed(4)}`);
      }
    }
  }
});

test("neutral inputs keep their relative lightness", async () => {
  const { toneMatch, toneMatchedThemes, hexToOklch } = await load();
  for (const theme of toneMatchedThemes) {
    for (const role of ROLES) {
      const [black, gray, white] = ["#000000", "#808080", "#ffffff"].map(
        (hex) => hexToOklch(toneMatch(hex, theme, role)).l,
      );
      assert.ok(black < gray && gray < white, `${theme.id} ${role}: ${black} ${gray} ${white}`);
    }
  }
});

// The text colour getStickyShellStyle and getSessionTabStyle choose, read on the colour they
// paint (the result blended over the theme's note base at the note's opacity), for every
// theme, NotePane Light and Dark included.
test("text on fill and surface results is readable", async () => {
  const { listThemes, inputs, getStickyShellStyle, getSessionTabStyle, getContrastRatio, getNoteChrome, ...colorMath } =
    await load();
  for (const theme of listThemes()) {
    const chrome = getNoteChrome(theme);
    for (const hex of inputs) {
      for (const tabTextOpacity of OPACITIES) {
        const noteTheme = { tabTextColor: hex, tabTextOpacity };
        const sticky = getStickyShellStyle(noteTheme, hex, theme);
        const surfaceRatio = getContrastRatio(sticky["--sticky-text-color"], sticky["--sticky-effective-bg"]);
        assert.ok(
          surfaceRatio >= 4.5,
          `${theme.id} surface ${hex} @${tabTextOpacity}: ${sticky["--sticky-text-color"]} on ${sticky["--sticky-effective-bg"]} is ${surfaceRatio.toFixed(2)}`,
        );
        const tab = getSessionTabStyle(noteTheme, theme, 0);
        const fill = compositeOver(colorMath, tab["--session-tab-active-bg"], chrome.tabBase);
        const fillRatio = getContrastRatio(tab["--session-tab-text-color"], fill);
        assert.ok(
          fillRatio >= 4.5,
          `${theme.id} fill ${hex} @${tabTextOpacity}: ${tab["--session-tab-text-color"]} on ${fill} is ${fillRatio.toFixed(2)}`,
        );
      }
    }
  }
});

// --notepane-link is fitted to the window colour; a tone-matched sticky window is painted with
// the note's colour instead, so it fits the link to that surface. NotePane Light and Dark keep
// the link colours their theme pins.
test("links read at 4.5:1 on tone-matched sticky surfaces", async () => {
  const { listThemes, toneMatchedThemes, pastels, getStickyShellStyle, getContrastRatio } = await load();
  for (const theme of toneMatchedThemes) {
    for (const hex of pastels) {
      for (const tabTextOpacity of OPACITIES) {
        const style = getStickyShellStyle({ tabTextColor: hex, tabTextOpacity }, hex, theme);
        const ratio = getContrastRatio(style["--notepane-link"], style["--sticky-effective-bg"]);
        assert.ok(ratio >= 4.5, `${theme.id} ${hex} @${tabTextOpacity}: ${style["--notepane-link"]} reads ${ratio.toFixed(2)}`);
      }
    }
  }
  for (const theme of listThemes().filter((candidate) => !candidate.toneMatching)) {
    assert.ok(!("--notepane-link" in getStickyShellStyle({ tabTextColor: "#fff2b8" }, "#fff2b8", theme)), theme.id);
  }
});

test("distinct pastels stay distinct", async () => {
  const { toneMatch, toneMatchedThemes, pastels, hexToOklch } = await load();
  for (const theme of toneMatchedThemes) {
    for (const role of ROLES) {
      const results = pastels.map((hex) => toneMatch(hex, theme, role));
      for (let first = 0; first < results.length; first += 1) {
        for (let second = first + 1; second < results.length; second += 1) {
          const distance = deltaE(hexToOklch, results[first], results[second]);
          assert.ok(
            distance >= 0.02,
            `${theme.id} ${role} ${pastels[first]} -> ${results[first]} and ${pastels[second]} -> ${results[second]}: ΔE ${distance.toFixed(4)}`,
          );
        }
      }
    }
  }
});

test("Mocha matches the spec's worked values", async () => {
  const { toneMatch, getTheme, hexToOklch } = await load();
  const mocha = getTheme("catppuccin-mocha");
  assert.equal(mocha, CATPPUCCIN_MOCHA);
  assert.ok(deltaE(hexToOklch, toneMatch("#fff2b8", mocha, "fill"), "#dacd95") < 0.03);
  assert.ok(deltaE(hexToOklch, toneMatch("#fff2b8", mocha, "surface"), "#3a3417") < 0.03);
});

test("NotePane themes are never tone matched", async () => {
  const { toneMatch, getTheme, inputs } = await load();
  assert.equal(toneMatch("#fff2b8", getTheme("notepane-dark"), "surface"), "#fff2b8");
  for (const themeId of ["notepane-light", "notepane-dark"]) {
    for (const role of ROLES) {
      for (const hex of inputs) assert.equal(toneMatch(hex, getTheme(themeId), role), hex, `${themeId} ${role}`);
    }
  }
});

test("a theme without noteChrome derives it from its palette", async () => {
  const { deriveNoteChrome, getNoteChrome, getTheme, getRelativeLuminance } = await load();
  for (const themeId of ["sentinel-light-a", "sentinel-dark-a", "catppuccin-mocha"]) {
    const theme = getTheme(themeId);
    const chrome = getNoteChrome(theme);
    assert.deepEqual(chrome, deriveNoteChrome(theme), themeId);
    assert.equal(chrome.base, theme.palette.window, themeId);
    assert.equal(chrome.tabBase, theme.palette.sidebar, themeId);
    assert.equal(chrome.tabToneMix, 0, themeId);
    assert.deepEqual(new Set([chrome.inkDark, chrome.inkLight]), new Set([theme.palette.text, theme.palette.window]));
    assert.ok(getRelativeLuminance(chrome.inkDark) < getRelativeLuminance(chrome.inkLight), themeId);
  }
  assert.equal(getNoteChrome(getTheme("notepane-dark")), getTheme("notepane-dark").noteChrome);
});

// The leak detector's premise at the unit level: within a sentinel pair, whose palettes share
// no value, no derived note chrome value is the same either.
test("derived note chrome shares no value within a sentinel pair", async () => {
  const { deriveNoteChrome, getTheme } = await load();
  const values = (chrome) =>
    Object.entries(chrome)
      .filter(([name]) => name !== "tabToneMix")
      .flatMap(([name, value]) =>
        typeof value === "string" ? [[name, value]] : Object.entries(value).map(([side, entry]) => [`${name}.${side}`, entry]),
      );
  for (const scheme of ["light", "dark"]) {
    const first = values(deriveNoteChrome(getTheme(`sentinel-${scheme}-a`)));
    const second = new Map(values(deriveNoteChrome(getTheme(`sentinel-${scheme}-b`))));
    for (const [name, value] of first) assert.notEqual(second.get(name), value, `${scheme} ${name}`);
  }
});
