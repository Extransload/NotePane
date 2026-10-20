const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "../..");

const loadThemes = () => {
  // src/constants.js reads window.blocknoteSticky at import time.
  globalThis.window ??= {};
  return import("../../src/style/themes.js");
};
const loadTokens = () => {
  globalThis.window ??= {};
  return import("../../src/style/themeTokens.js");
};

const NON_COLOUR_TOKENS = new Set([
  "--notepane-ui-font",
  "--notepane-display-font",
  "--icon-chrome-size",
  "--chrome-icon-button-width",
  "--chrome-icon-button-height",
  "--chrome-icon-button-radius",
]);
const pickColourTokens = (tokens) =>
  Object.fromEntries(Object.entries(tokens).filter(([name]) => !NON_COLOUR_TOKENS.has(name)));

// Compares colours, not spellings: #rgb -> #rrggbb, rgb()/rgba() -> "rgb(r g b / a)", 0.30 -> 0.3.
// Everything that is not a colour (geometry, var(), color-mix()) is compared exactly.
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
const normaliseTokens = (tokens) =>
  Object.fromEntries(
    Object.entries(pickColourTokens(tokens)).map(([name, value]) => [name, normaliseColours(value)]),
  );

test("every theme defines every palette key as six-digit hex", async () => {
  const { listThemes, PALETTE_KEYS } = await loadThemes();
  assert.equal(PALETTE_KEYS.length, 27);
  for (const theme of listThemes()) {
    for (const key of PALETTE_KEYS) {
      assert.match(theme.palette[key], /^#[0-9a-f]{6}$/, `${theme.id}.${key}`);
    }
    assert.deepEqual(Object.keys(theme.palette).sort(), [...PALETTE_KEYS].sort(), theme.id);
    assert.ok(["light", "dark"].includes(theme.scheme), theme.id);
    assert.equal(typeof theme.codeTheme, "string", theme.id);
    assert.equal(typeof theme.toneMatching, "boolean", theme.id);
  }
});

// noteChrome is optional. A theme that sets it gives every field deriveNoteChrome derives, in
// the same shape: a colour, an { onLight, onDark } pair of CSS colour values, or the tab tone mix.
test("a theme's noteChrome has the derived fields and types", async () => {
  const { listThemes } = await loadThemes();
  const { deriveNoteChrome } = await import("../../src/style/themeStyles.js");
  const shape = (chrome) =>
    Object.fromEntries(
      Object.entries(chrome).map(([name, value]) => [
        name,
        typeof value === "object" ? Object.keys(value).sort().join() : typeof value,
      ]),
    );
  const isColour = (value) => /^(?:#[0-9a-f]{6}\b|rgb\(|\d)/.test(value) && !/undefined|NaN/.test(value);
  const themesWithChrome = listThemes().filter((theme) => theme.noteChrome !== undefined);
  assert.deepEqual(themesWithChrome.map((theme) => theme.id), ["notepane-light", "notepane-dark"]);
  for (const theme of themesWithChrome) {
    const { noteChrome } = theme;
    assert.deepEqual(shape(noteChrome), shape(deriveNoteChrome(theme)), theme.id);
    for (const [name, value] of Object.entries(noteChrome)) {
      if (name === "tabToneMix") {
        assert.ok(value >= 0 && value <= 1, `${theme.id}.${name}`);
      } else if (typeof value === "string") {
        assert.match(value, /^#[0-9a-f]{6}$/, `${theme.id}.${name}`);
      } else {
        for (const side of ["onLight", "onDark"]) assert.ok(isColour(value[side]), `${theme.id}.${name}.${side}`);
      }
    }
  }
});

test("theme ids are unique", async () => {
  const { listThemes } = await loadThemes();
  const ids = listThemes().map((theme) => theme.id);
  assert.equal(new Set(ids).size, ids.length);
});

// The picker lists the themes in the order electron/themes.json gives them.
const SHIPPED_THEMES = [
  ["notepane-light", "NotePane Light"],
  ["notepane-dark", "NotePane Dark"],
  ["catppuccin-latte", "Catppuccin Latte"],
  ["catppuccin-frappe", "Catppuccin Frappé"],
  ["catppuccin-macchiato", "Catppuccin Macchiato"],
  ["catppuccin-mocha", "Catppuccin Mocha"],
  ["nord", "Nord"],
  ["dracula", "Dracula"],
  ["tokyo-night", "Tokyo Night"],
];
const NOTEPANE_THEME_IDS = new Set(["notepane-light", "notepane-dark"]);
const OFFICIAL_PALETTES = require("./fixtures/official-palettes.json");
const loadColorMath = () => import("../../src/style/colorMath.js");

// The OKLab ΔE between two hex colours: the distance every "apart" and "distinct" rule here uses.
function oklabDistance({ hexToOklab }, first, second) {
  const [a, b] = [hexToOklab(first), hexToOklab(second)];
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

test("ships the nine themes in picker order", async () => {
  const { listThemes } = await loadThemes();
  assert.deepEqual(
    listThemes().map((theme) => [theme.id, theme.label]),
    SHIPPED_THEMES,
  );
});

test("the picker offers the nine shipped themes, never registered test themes", async () => {
  const { listBuiltInThemes, listThemes, registerTestThemes } = await loadThemes();
  const { SENTINEL_THEMES } = await import("../../src/style/sentinelThemes.js");
  registerTestThemes(SENTINEL_THEMES);
  try {
    assert.ok(listThemes().some((theme) => theme.id === "sentinel-light-a"), "the sentinels are registered");
    assert.deepEqual(
      listBuiltInThemes().map((theme) => [theme.id, theme.label]),
      SHIPPED_THEMES,
    );
  } finally {
    registerTestThemes([]);
  }
});

// The spec's bar: text on the window, sidebar and panel at 4.5:1, muted text on the window at
// 3:1, in every shipped theme and every sentinel.
test("text contrast meets the spec bar in every theme", async () => {
  const { listThemes } = await loadThemes();
  const { SENTINEL_THEMES } = await import("../../src/style/sentinelThemes.js");
  const { getContrastRatio } = await import("../../src/style/colorMath.js");
  for (const theme of [...listThemes(), ...SENTINEL_THEMES]) {
    const { palette } = theme;
    for (const surface of ["window", "sidebar", "panel"]) {
      const ratio = getContrastRatio(palette.text, palette[surface]);
      assert.ok(ratio >= 4.5, `${theme.id} text ${palette.text} on ${surface} ${palette[surface]}: ${ratio.toFixed(2)}`);
    }
    const muted = getContrastRatio(palette.muted, palette.window);
    assert.ok(muted >= 3, `${theme.id} muted ${palette.muted} on window ${palette.window}: ${muted.toFixed(2)}`);
  }
});

// Every new theme takes each palette value from its official palette
// (tests/unit/fixtures/official-palettes.json names the source of each), except the named
// colours the fixture marks as derived, which must hold exactly the recorded value. The fixture's
// `named` map says where each of the nine named colours comes from: the palette's own colour of
// that name ("own", with the palette's documented `name` where its colour names differ), another
// official colour standing in for a name the palette lacks ("stand-in"), or a derived value. Its
// `derivedKeys` map marks the other palette keys that hold a derived value, each with its reason.
test("the new themes use only their official palette colours, apart from the marked derived ones", async () => {
  const { listThemes, PALETTE_KEYS } = await loadThemes();
  const { NAMED_COLOURS } = await loadTokens();
  const newThemes = listThemes().filter((theme) => !NOTEPANE_THEME_IDS.has(theme.id));
  assert.deepEqual(newThemes.map((theme) => theme.id).sort(), Object.keys(OFFICIAL_PALETTES).sort());
  for (const theme of newThemes) {
    const { colours, named, derivedKeys = {} } = OFFICIAL_PALETTES[theme.id];
    assert.deepEqual(Object.keys(named).sort(), [...NAMED_COLOURS].sort(), theme.id);
    for (const key of Object.keys(derivedKeys)) {
      assert.ok(PALETTE_KEYS.includes(key) && !NAMED_COLOURS.includes(key), `${theme.id} derivedKeys.${key}`);
    }
    const official = new Set(Object.values(colours));
    for (const key of PALETTE_KEYS) {
      const value = theme.palette[key];
      const source = named[key] ?? (derivedKeys[key] && { ...derivedKeys[key], kind: "derived" });
      if (source?.kind === "derived") {
        assert.match(source.reason, /\S/, `${theme.id}.${key} derived without a reason`);
        assert.equal(value, source.value, `${theme.id}.${key} is not its recorded derived value`);
        assert.ok(!official.has(value), `${theme.id}.${key} is marked derived but is official`);
        continue;
      }
      assert.ok(official.has(value), `${theme.id}.${key} ${value} is not in its official palette`);
      if (source) {
        assert.ok(["own", "stand-in"].includes(source.kind), `${theme.id}.${key} kind ${source.kind}`);
        assert.equal(value, colours[source.colour], `${theme.id}.${key} is not ${source.colour}`);
        if (source.kind === "own") {
          assert.equal((source.name ?? source.colour).toLowerCase(), key, `${theme.id}.${key} is not the palette's own ${key}`);
        }
      }
    }
    assert.equal(theme.toneMatching, true, theme.id);
  }
});

const hueDistance = (first, second) => {
  const difference = Math.abs(first - second) % 360;
  return Math.min(difference, 360 - difference);
};

// R33: a colour that stands in for a name the palette lacks keeps that name's hue family: within
// 30° of NotePane's colour of that name in the same scheme. It also reads as text on the window
// at 3:1, or as well as the palette's own named colours do where one of them reads less (Latte's
// yellow reads 2.31). Gray is exempt from the hue rule: NotePane's grays are neutral (OKLCH chroma
// below 0.02, tone matching's neutral threshold), so they have no hue to keep.
test("stand-in named colours keep their hue family", async () => {
  const { listThemes, getTheme } = await loadThemes();
  const { hexToOklch, getContrastRatio } = await import("../../src/style/colorMath.js");
  for (const theme of listThemes().filter((candidate) => !NOTEPANE_THEME_IDS.has(candidate.id))) {
    const reference = getTheme(theme.scheme === "dark" ? "notepane-dark" : "notepane-light");
    const { named } = OFFICIAL_PALETTES[theme.id];
    const ownContrasts = Object.entries(named)
      .filter(([, source]) => source.kind === "own")
      .map(([key]) => getContrastRatio(theme.palette[key], theme.palette.window));
    const readableFloor = Math.min(3, ...ownContrasts);
    for (const [key, source] of Object.entries(named)) {
      if (source.kind === "own") continue;
      const own = hexToOklch(theme.palette[key]);
      const target = hexToOklch(reference.palette[key]);
      const label = `${theme.id}.${key} ${theme.palette[key]} (${source.kind})`;
      if (target.c >= 0.02) {
        const distance = hueDistance(own.h, target.h);
        assert.ok(distance <= 30, `${label} is ${distance.toFixed(1)}° from ${reference.id}'s ${reference.palette[key]}`);
      }
      if (source.kind === "stand-in") {
        const ratio = getContrastRatio(theme.palette[key], theme.palette.window);
        assert.ok(ratio >= readableFloor, `${label} reads ${ratio.toFixed(2)} on the window, below ${readableFloor.toFixed(2)}`);
      }
    }
  }
});

// R33: where no official colour qualifies, the name is derived as tone matching shows NotePane's
// colour of that name as a mark, toneMatch(colour, theme, "mark"), with the median taken from the
// theme's official named colours: its hue, chroma capped at the median chroma, lightness at the
// median lightness. R35: where that mark tone sits within 0.05 ΔE of another named colour (Nord's
// brown and pink), only its lightness moves, toward NotePane's own lightness for that colour, in
// 0.005 steps until it is 0.05 ΔE from all eight; hue and chroma stay. The fixture records each
// move in the entry's reason. This test derives each value that way, the median taken from the
// named colours the fixture does not mark derived, and expects exactly the recorded value.
test("derived named colours are NotePane's colour in the theme's mark tone", async () => {
  const { listThemes, getTheme } = await loadThemes();
  const { NAMED_COLOURS } = await loadTokens();
  const colorMath = await loadColorMath();
  const { hexToOklch, oklchToHex } = colorMath;
  const { toneMatchToTarget } = await import("../../src/style/toneMatch.js");
  const median = (values) => {
    const sorted = [...values].sort((first, second) => first - second);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  let derivedCount = 0;
  for (const theme of listThemes().filter((candidate) => !NOTEPANE_THEME_IDS.has(candidate.id))) {
    const reference = getTheme(theme.scheme === "dark" ? "notepane-dark" : "notepane-light");
    const { named } = OFFICIAL_PALETTES[theme.id];
    const official = NAMED_COLOURS.filter((key) => named[key].kind !== "derived").map((key) => hexToOklch(theme.palette[key]));
    const officialMedian = { l: median(official.map(({ l }) => l)), c: median(official.map(({ c }) => c)) };
    for (const key of NAMED_COLOURS.filter((candidate) => named[candidate].kind === "derived")) {
      derivedCount += 1;
      const others = NAMED_COLOURS.filter((other) => other !== key).map((other) => theme.palette[other]);
      const apart = (hex) => others.every((other) => oklabDistance(colorMath, hex, other) >= 0.05);
      let expected = toneMatchToTarget(reference.palette[key], theme, officialMedian);
      if (!apart(expected)) {
        const start = hexToOklch(expected);
        const direction = Math.sign(hexToOklch(reference.palette[key]).l - start.l);
        expected = null;
        for (let step = 1; step <= 100 && !expected; step += 1) {
          const candidate = oklchToHex({ l: start.l + direction * step * 0.005, c: start.c, h: start.h });
          if (apart(candidate)) expected = candidate;
        }
      }
      assert.equal(named[key].value, expected, `${theme.id}.${key}: the fixture records ${named[key].value}`);
      assert.equal(theme.palette[key], expected, `${theme.id}.${key}: the theme holds ${theme.palette[key]}`);
    }
  }
  assert.ok(derivedCount > 0);
});

// R34 and R36: readability floors, in every shipped theme.
// Hover fills sit on the window, the header, the sidebar and the panel, so the hover colour stays
// visible on each (0.02 ΔE), stays well apart from the window (the 0.05 ΔE the named colours
// keep), and carries text at 4.5:1; text on the header reads at 4.5:1 too. NotePane Light's
// pinned hover is a subtler step and is exempt from the distances: 0.0238 from its window, 0.0089
// from its header and 0.0148 from its sidebar. NotePane Dark meets them.
const HOVER_EXEMPT = new Set(["notepane-light"]);
test("hover stays visible on every surface and carries readable text", async () => {
  const { listThemes } = await loadThemes();
  const colorMath = await loadColorMath();
  const { getContrastRatio } = colorMath;
  const distance = (first, second) => oklabDistance(colorMath, first, second);
  for (const theme of listThemes()) {
    const { palette } = theme;
    const ratio = getContrastRatio(palette.text, palette.hover);
    assert.ok(ratio >= 4.5, `${theme.id} text ${palette.text} on hover ${palette.hover}: ${ratio.toFixed(2)}`);
    const onHeader = getContrastRatio(palette.text, palette.header);
    assert.ok(onHeader >= 4.5, `${theme.id} text ${palette.text} on header ${palette.header}: ${onHeader.toFixed(2)}`);
    if (HOVER_EXEMPT.has(theme.id)) continue;
    for (const surface of ["window", "header", "sidebar", "panel"]) {
      const apart = distance(palette.hover, palette[surface]);
      assert.ok(apart >= 0.02, `${theme.id} hover ${palette.hover} is ${apart.toFixed(4)} from ${surface} ${palette[surface]}`);
    }
    if (NOTEPANE_THEME_IDS.has(theme.id)) continue;
    const apart = distance(palette.hover, palette.window);
    assert.ok(apart >= 0.05, `${theme.id} hover is ${apart.toFixed(4)} from the window`);
  }
});

// The inline code chip: its text on its background composited over the window. NotePane Light and
// Dark keep today's hand-tuned pair (pinned above); every tone-matched theme fits its danger
// colour to 4.5:1 there, derived and as applied.
test("inline code text reads at 4.5:1 on the inline code background", async () => {
  const { buildThemeTokens } = await loadTokens();
  const { listThemes } = await loadThemes();
  const { SENTINEL_THEMES } = await import("../../src/style/sentinelThemes.js");
  const { getContrastRatio, hexToRgb, rgbToHex } = await import("../../src/style/colorMath.js");
  const compositeOver = (cssRgb, backgroundHex) => {
    const [red, green, blue, alpha] = cssRgb.match(/[\d.]+/g).map(Number);
    const background = hexToRgb(backgroundHex);
    return rgbToHex(...[red, green, blue].map((channel, index) => channel * alpha + background[index] * (1 - alpha)));
  };
  for (const theme of [...listThemes(), ...SENTINEL_THEMES].filter((candidate) => candidate.toneMatching)) {
    for (const [label, tokens] of [
      ["derived", buildThemeTokens({ ...theme, overrides: {} })],
      ["applied", buildThemeTokens(theme)],
    ]) {
      const background = compositeOver(tokens["--sticky-inline-code-bg"], theme.palette.window);
      const ratio = getContrastRatio(tokens["--sticky-inline-code-text"], background);
      assert.ok(ratio >= 4.5, `${theme.id} ${label} ${tokens["--sticky-inline-code-text"]} on ${background}: ${ratio.toFixed(2)}`);
    }
  }
});

// Faint text (disabled items, the block side menu) reads on the window at least as NotePane's
// faint does in the same scheme, capped at 3:1, and never above muted text.
test("faint text reads on the window and stays at or below muted", async () => {
  const { listThemes, getTheme } = await loadThemes();
  const { getContrastRatio } = await import("../../src/style/colorMath.js");
  for (const theme of listThemes()) {
    const { palette } = theme;
    const reference = getTheme(theme.scheme === "dark" ? "notepane-dark" : "notepane-light").palette;
    const floor = Math.min(3, getContrastRatio(reference.faint, reference.window));
    const faint = getContrastRatio(palette.faint, palette.window);
    assert.ok(faint >= floor, `${theme.id} faint ${palette.faint} reads ${faint.toFixed(2)}, below ${floor.toFixed(2)}`);
    const muted = getContrastRatio(palette.muted, palette.window);
    assert.ok(faint <= muted, `${theme.id} faint ${faint.toFixed(2)} reads above muted ${muted.toFixed(2)}`);
  }
});

// The nine named colours (the editor's text and background colours) must stay apart.
test("named colours are pairwise distinct in every theme", async () => {
  const { listThemes } = await loadThemes();
  const { NAMED_COLOURS } = await loadTokens();
  const colorMath = await loadColorMath();
  for (const theme of listThemes()) {
    for (let first = 0; first < NAMED_COLOURS.length; first += 1) {
      for (let second = first + 1; second < NAMED_COLOURS.length; second += 1) {
        const [firstKey, secondKey] = [NAMED_COLOURS[first], NAMED_COLOURS[second]];
        const delta = oklabDistance(colorMath, theme.palette[firstKey], theme.palette[secondKey]);
        assert.ok(delta >= 0.05, `${theme.id} ${firstKey} and ${secondKey}: OKLab ΔE ${delta.toFixed(4)}`);
      }
    }
  }
});

// R38: the palette keeps its hierarchy, in every shipped theme (NotePane Light and Dark meet these
// too). On a dark theme, shadows are darker than the window, or they vanish (0.02 ΔE). Muted code
// (the language menu, the code border) stays apart from code text (0.05 ΔE), and gray text from
// body text (0.1 ΔE), or the two read as one.
test("shadows sit below the window in every dark theme", async () => {
  const { listThemes } = await loadThemes();
  const colorMath = await loadColorMath();
  for (const theme of listThemes().filter((candidate) => candidate.scheme === "dark")) {
    const { shadow, window } = theme.palette;
    assert.ok(
      colorMath.getRelativeLuminance(shadow) < colorMath.getRelativeLuminance(window),
      `${theme.id} shadow ${shadow} is not darker than the window ${window}`,
    );
    const apart = oklabDistance(colorMath, shadow, window);
    assert.ok(apart >= 0.02, `${theme.id} shadow ${shadow} is ${apart.toFixed(4)} from the window ${window}`);
  }
});

test("muted code and gray text stay apart from their text colours", async () => {
  const { listThemes } = await loadThemes();
  const colorMath = await loadColorMath();
  for (const theme of listThemes()) {
    const { codeMuted, codeText, gray, text } = theme.palette;
    const code = oklabDistance(colorMath, codeMuted, codeText);
    assert.ok(code >= 0.05, `${theme.id} codeMuted ${codeMuted} is ${code.toFixed(4)} from codeText ${codeText}`);
    const grayText = oklabDistance(colorMath, gray, text);
    assert.ok(grayText >= 0.1, `${theme.id} gray ${gray} is ${grayText.toFixed(4)} from text ${text}`);
  }
});

// The spec's code themes. Outside NotePane, the code background and text are the Shiki theme's
// own, so plain text blocks match highlighted ones; NotePane keeps today's #0d1117 plain block
// beside github-dark's #24292e highlighted one.
const CODE_THEMES = {
  "notepane-light": "github-dark",
  "notepane-dark": "github-dark",
  "catppuccin-latte": "catppuccin-latte",
  "catppuccin-frappe": "catppuccin-frappe",
  "catppuccin-macchiato": "catppuccin-macchiato",
  "catppuccin-mocha": "catppuccin-mocha",
  nord: "nord",
  dracula: "dracula",
  "tokyo-night": "tokyo-night",
};

test("each theme names its spec code theme, and new themes paint code in its colours", async () => {
  const { listThemes } = await loadThemes();
  for (const theme of listThemes()) {
    assert.equal(theme.codeTheme, CODE_THEMES[theme.id], theme.id);
    if (NOTEPANE_THEME_IDS.has(theme.id)) {
      assert.equal(theme.palette.codeBg, "#0d1117", theme.id);
      continue;
    }
    const { default: shikiTheme } = await import(`@shikijs/themes/${theme.codeTheme}`);
    assert.equal(theme.palette.codeBg, shikiTheme.colors["editor.background"].toLowerCase(), `${theme.id} codeBg`);
    assert.equal(theme.palette.codeText, shikiTheme.colors["editor.foreground"].toLowerCase(), `${theme.id} codeText`);
  }
});

// A code block's colour scheme (its scrollbars and language menu) follows its own background:
// dark for NotePane's GitHub dark blocks in both NotePane themes, the theme's scheme elsewhere.
test("the code block colour scheme follows the code background", async () => {
  const { buildThemeTokens } = await loadTokens();
  const { listThemes } = await loadThemes();
  const { SENTINEL_THEMES } = await import("../../src/style/sentinelThemes.js");
  for (const theme of [...listThemes(), ...SENTINEL_THEMES]) {
    const expected = NOTEPANE_THEME_IDS.has(theme.id) ? "dark" : theme.scheme;
    assert.equal(buildThemeTokens(theme)["--sticky-code-color-scheme"], expected, theme.id);
  }
});

// Tokens that replaced colours the stylesheets wrote as literals, which the tokens.css capture
// predates. Each pins today's value in [NotePane Light, NotePane Dark]: the literal, or the
// token the rule read. The dark tooltip frame was #2b2b2b, the dark chip colour.
const STYLESHEET_LITERAL_TOKENS = {
  "--notepane-glass": ["#ffffff", "#ffffff"],
  "--notepane-shadow-color": ["#000000", "#000000"],
  "--notepane-shadow-header-glass": ["inset 0 1px 0 rgb(255 255 255 / 0.08)", "inset 0 1px 0 rgb(255 255 255 / 0.08)"],
  "--notepane-shadow-sidebar-edge": ["inset -1px 0 0 rgb(255 255 255 / 0.04)", "inset -1px 0 0 rgb(255 255 255 / 0.04)"],
  "--notepane-shadow-swatch": ["inset 0 1px 0 rgb(255 255 255 / 0.35)", "inset 0 1px 0 rgb(255 255 255 / 0.35)"],
  "--notepane-shadow-color-wheel": [
    "inset 0 0 0 1px rgb(255 255 255 / 0.18), 0 6px 14px rgb(0 0 0 / 0.2)",
    "inset 0 0 0 1px rgb(255 255 255 / 0.18), 0 6px 14px rgb(0 0 0 / 0.2)",
  ],
  "--notepane-shadow-history-panel": ["0 18px 45px rgb(0 0 0 / 0.2)", "0 18px 45px rgb(0 0 0 / 0.2)"],
  "--notepane-backdrop-preferences": ["rgb(0 0 0 / 0.18)", "rgb(0 0 0 / 0.18)"],
  "--notepane-backdrop-history": ["rgb(0 0 0 / 0.28)", "rgb(0 0 0 / 0.28)"],
  "--notepane-backdrop-crop": ["rgb(0 0 0 / 0.34)", "rgb(0 0 0 / 0.34)"],
  "--notepane-success": ["#2f9e44", "#2f9e44"],
  "--notepane-progress": ["#3478f6", "#3478f6"],
  "--notepane-focus-ring": ["rgb(90 150 255 / 0.66)", "rgb(90 150 255 / 0.66)"],
  "--notepane-input-focus-border": ["#2383e2", "#2383e2"],
  "--notepane-input-focus-ring": ["rgb(35 131 226 / 0.18)", "rgb(35 131 226 / 0.18)"],
  "--notepane-input-error": ["#e5484d", "#e5484d"],
  "--notepane-error-text": ["#d95c5c", "#d95c5c"],
  "--notepane-import-tint": ["#b45309", "#b45309"],
  "--notepane-loading-text": ["#9ca3af", "#9ca3af"],
  "--notepane-slider-thumb": ["#a3a8a0", "#a3a8a0"],
  "--notepane-brand-accent": ["#d9ecf8", "#d9ecf8"],
  "--notepane-pastel-swatch-ink": ["#37352f", "#37352f"],
  "--notepane-icon-turn-into": ["#4d79b8", "#4d79b8"],
  "--notepane-icon-colors": ["#a45bb9", "#a45bb9"],
  "--notepane-tooltip-bg": ["#2f3437", "#2b2b2b"],
  "--notepane-tooltip-text": ["#ffffff", "#ffffff"],
  "--notepane-tooltip-border": ["rgb(255 255 255 / 0.12)", "rgb(255 255 255 / 0.12)"],
  "--notepane-tooltip-muted": ["rgb(255 255 255 / 0.68)", "rgb(255 255 255 / 0.68)"],
  "--notepane-tooltip-frame-bg": ["transparent", "var(--notepane-tooltip-bg)"],
  "--notepane-shadow-tooltip": ["0 5px 14px rgb(0 0 0 / 0.2)", "0 5px 14px rgb(0 0 0 / 0.2)"],
  "--notepane-adaptive-tooltip-bg": ["var(--sticky-panel-bg)", "#2b2b2b"],
  "--notepane-adaptive-tooltip-text": ["var(--sticky-panel-text)", "#ffffff"],
  "--notepane-adaptive-tooltip-border": ["var(--sticky-border-color)", "rgb(255 255 255 / 0.22)"],
  "--notepane-shadow-adaptive-tooltip": ["var(--sticky-menu-shadow)", "0 12px 28px rgb(0 0 0 / 0.52)"],
  "--notepane-code-tool-bg": ["rgb(15 15 15 / 0.76)", "rgb(15 15 15 / 0.76)"],
  "--notepane-code-tool-border": ["rgb(255 255 255 / 0.1)", "rgb(255 255 255 / 0.1)"],
  "--notepane-code-tool-hover-border": ["rgb(255 255 255 / 0.18)", "rgb(255 255 255 / 0.18)"],
  "--notepane-code-tool-text": ["rgb(255 255 255 / 0.72)", "rgb(255 255 255 / 0.72)"],
  "--notepane-code-tool-hover-bg": ["rgb(255 255 255 / 0.1)", "rgb(255 255 255 / 0.1)"],
  "--notepane-code-tool-hover-text": ["#fff", "#fff"],
  "--notepane-code-tool-disabled": ["rgb(255 255 255 / 0.3)", "rgb(255 255 255 / 0.3)"],
  "--notepane-code-tool-focus-ring": ["rgb(149 179 255 / 0.7)", "rgb(149 179 255 / 0.7)"],
  "--notepane-code-tool-success": ["#9ee6ad", "#9ee6ad"],
  "--notepane-code-tool-error": ["#ffaaa3", "#ffaaa3"],
  "--notepane-shadow-code-tool": ["0 5px 14px rgb(0 0 0 / 0.22)", "0 5px 14px rgb(0 0 0 / 0.22)"],
  // blocknote.css gave every code block `color-scheme: dark`.
  "--sticky-code-color-scheme": ["dark", "dark"],
};

// Tokens for colours that BlockNote, Mantine and the browser painted before themes existed.
// The spec's "Allowed visible changes" lets NotePane Light and Dark change these, to the
// nearest existing NotePane colour, which each entry names: [NotePane Light, NotePane Dark].
const LIBRARY_COLOUR_TOKENS = {
  // The colour wheel focus ring, the NotePane colour nearest the system selection blue.
  "--notepane-selection-bg": ["var(--notepane-focus-ring)", "var(--notepane-focus-ring)"],
  // The input focus blue #2383e2, the nearest NotePane colour that reaches 3:1 as a focus ring.
  "--notepane-focus-outline": ["var(--notepane-input-focus-border)", "var(--notepane-input-focus-border)"],
  // #2383e2 mixed 15% toward each theme's text colour.
  "--notepane-control-accent-hover": ["#2677c7", "#4294e4"],
  // The text colour wherever the caret is, as the browser's `auto` drew it.
  "--notepane-caret": ["currentcolor", "currentcolor"],
  "--notepane-control-accent": ["var(--notepane-input-focus-border)", "var(--notepane-input-focus-border)"],
  "--notepane-placeholder": ["var(--sticky-panel-muted)", "var(--sticky-panel-muted)"],
  // --sticky-table-border-color.
  "--notepane-quote": ["#8f8e89", "#747471"],
  "--notepane-node-outline": ["var(--notepane-focus-ring)", "var(--notepane-focus-ring)"],
  "--notepane-drop-cursor": ["var(--notepane-brand-accent)", "var(--notepane-brand-accent)"],
  "--notepane-resize-handle": ["var(--notepane-shadow-color)", "var(--notepane-shadow-color)"],
  "--notepane-add-file-bg": ["var(--sticky-portal-menu-hover-bg)", "var(--sticky-portal-menu-hover-bg)"],
  "--notepane-add-file-hover-bg": [
    "var(--sticky-portal-menu-border-color)",
    "var(--sticky-portal-menu-border-color)",
  ],
  // The browser's own link colours in the light and dark schemes, kept: links are not among the
  // allowed visible changes.
  "--notepane-link": ["#0000ee", "#9e9eff"],
};

async function assertNotePaneTokens(themeId, scheme) {
  const baseline = require("./fixtures/theme-baseline.json");
  const { buildThemeTokens } = await loadTokens();
  const { getTheme } = await loadThemes();
  const literalIndex = scheme === "dark" ? 1 : 0;
  const expected = {
    ...baseline.tokens[scheme],
    ...Object.fromEntries(
      Object.entries({ ...STYLESHEET_LITERAL_TOKENS, ...LIBRARY_COLOUR_TOKENS }).map(([name, values]) => [
        name,
        values[literalIndex],
      ]),
    ),
  };
  assert.deepEqual(normaliseTokens(buildThemeTokens(getTheme(themeId))), normaliseTokens(expected));
}

test("NotePane Light tokens equal the captured tokens.css values and today's stylesheet literals", () =>
  assertNotePaneTokens("notepane-light", "light"));

test("NotePane Dark tokens equal the captured tokens.css values and today's stylesheet literals", () =>
  assertNotePaneTokens("notepane-dark", "dark"));

test("buildThemeTokens never emits the non-colour tokens", async () => {
  const { THEME_TOKEN_NAMES } = await loadTokens();
  for (const name of NON_COLOUR_TOKENS) assert.ok(!THEME_TOKEN_NAMES.includes(name), name);
});

test("every theme produces the same token names", async () => {
  const { buildThemeTokens, THEME_TOKEN_NAMES } = await loadTokens();
  const { listThemes } = await loadThemes();
  for (const theme of listThemes()) {
    assert.deepEqual(Object.keys(buildThemeTokens(theme)).sort(), THEME_TOKEN_NAMES, theme.id);
  }
});

test("overrides are applied last", async () => {
  const { buildThemeTokens } = await loadTokens();
  const { getTheme } = await loadThemes();
  const theme = { ...getTheme("notepane-light"), overrides: { "--sticky-text-color": "#123456" } };
  assert.equal(buildThemeTokens(theme)["--sticky-text-color"], "#123456");
});

test("an unknown theme id resolves to NotePane Light", async () => {
  const { getTheme, isKnownThemeId, DEFAULT_THEME_ID } = await loadThemes();
  assert.equal(DEFAULT_THEME_ID, "notepane-light");
  assert.equal(getTheme("solarized").id, "notepane-light");
  assert.equal(isKnownThemeId("solarized"), false);
  assert.equal(isKnownThemeId("notepane-dark"), true);
});

test("themeIdForMode maps dark to NotePane Dark and everything else to Light", async () => {
  const { themeIdForMode } = await loadThemes();
  assert.equal(themeIdForMode("dark"), "notepane-dark");
  assert.equal(themeIdForMode("light"), "notepane-light");
  assert.equal(themeIdForMode("sepia"), "notepane-light");
  assert.equal(themeIdForMode(undefined), "notepane-light");
});

test("registered test themes follow the JSON themes", async () => {
  const { registerTestThemes, listThemes, getTheme, isKnownThemeId } = await loadThemes();
  const base = getTheme("notepane-dark");
  try {
    registerTestThemes([{ ...base, id: "test-extra", label: "Test Extra" }]);
    const ids = listThemes().map((theme) => theme.id);
    assert.deepEqual(ids.slice(0, 2), ["notepane-light", "notepane-dark"]);
    assert.equal(ids.at(-1), "test-extra");
    assert.ok(isKnownThemeId("test-extra"));
  } finally {
    registerTestThemes([]);
  }
  assert.ok(!isKnownThemeId("test-extra"));
});

test("each sentinel pair shares a scheme and no palette value", async () => {
  const { PALETTE_KEYS } = await loadThemes();
  const { SENTINEL_THEMES } = await import("../../src/style/sentinelThemes.js");
  const byId = Object.fromEntries(SENTINEL_THEMES.map((theme) => [theme.id, theme]));
  const channels = (hex) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  for (const scheme of ["light", "dark"]) {
    const first = byId[`sentinel-${scheme}-a`];
    const second = byId[`sentinel-${scheme}-b`];
    for (const theme of [first, second]) {
      assert.equal(theme.scheme, scheme, theme.id);
      assert.equal(theme.toneMatching, true, theme.id);
      assert.deepEqual(theme.overrides, {}, theme.id);
      assert.deepEqual(Object.keys(theme.palette).sort(), [...PALETTE_KEYS].sort(), theme.id);
      for (const key of PALETTE_KEYS) assert.match(theme.palette[key], /^#[0-9a-f]{6}$/, `${theme.id}.${key}`);
    }
    assert.notEqual(first.codeTheme, second.codeTheme, scheme);
    const secondValues = new Set(Object.values(second.palette));
    for (const key of PALETTE_KEYS) {
      assert.ok(!secondValues.has(first.palette[key]), `${first.id}.${key} also appears in ${second.id}`);
      const difference = Math.max(
        ...channels(first.palette[key]).map((value, index) => Math.abs(value - channels(second.palette[key])[index])),
      );
      assert.ok(difference >= 40, `${scheme} ${key} differs by only ${difference} in every channel`);
    }
  }
});

test("installSentinelThemes registers the sentinels and forwards setThemeId to the bound setter", async () => {
  const { isKnownThemeId, registerTestThemes } = await loadThemes();
  const { installSentinelThemes } = await import("../../src/style/sentinelThemes.js");
  const target = {};
  try {
    const bindThemeSetter = installSentinelThemes(target);
    assert.ok(isKnownThemeId("sentinel-dark-b"));
    assert.throws(() => target.__notepaneTest.setThemeId("sentinel-dark-b"), /not mounted/);
    const calls = [];
    const unbind = bindThemeSetter((themeId) => calls.push(themeId));
    target.__notepaneTest.setThemeId("sentinel-dark-b");
    assert.deepEqual(calls, ["sentinel-dark-b"]);
    unbind();
    assert.throws(() => target.__notepaneTest.setThemeId("sentinel-dark-a"), /not mounted/);
  } finally {
    registerTestThemes([]);
  }
});

test("derivation is total for a theme without overrides", async () => {
  const { buildThemeTokens, THEME_TOKEN_NAMES } = await loadTokens();
  const { listThemes } = await loadThemes();
  for (const theme of listThemes()) {
    const tokens = buildThemeTokens({ ...theme, overrides: {} });
    for (const name of THEME_TOKEN_NAMES) {
      const value = tokens[name];
      assert.equal(typeof value, "string", `${theme.id} ${name}`);
      assert.notEqual(value.trim(), "", `${theme.id} ${name}`);
      assert.doesNotMatch(value, /undefined|NaN|null/, `${theme.id} ${name}`);
    }
  }
});

// Asserts that `token` reads at `minimum` contrast on each palette surface in `surfaces`, for
// every JSON theme and sentinel, both as derived (no overrides) and as applied. A token that
// reads another one through var() is followed to its value.
async function assertTokenReadable(token, surfaces, minimum) {
  const { buildThemeTokens } = await loadTokens();
  const { listThemes } = await loadThemes();
  const { SENTINEL_THEMES } = await import("../../src/style/sentinelThemes.js");
  const { getContrastRatio } = await import("../../src/style/colorMath.js");
  const resolve = (tokens, value) => {
    for (let reference = /^var\((--[\w-]+)\)$/.exec(value); reference; reference = /^var\((--[\w-]+)\)$/.exec(value)) {
      value = tokens[reference[1]];
    }
    return value;
  };
  for (const theme of [...listThemes(), ...SENTINEL_THEMES]) {
    for (const [label, tokens] of [
      ["derived", buildThemeTokens({ ...theme, overrides: {} })],
      ["applied", buildThemeTokens(theme)],
    ]) {
      const colour = resolve(tokens, tokens[token]);
      assert.match(colour, /^#[0-9a-f]{6}$/, `${theme.id} ${label} ${token}`);
      for (const surface of surfaces) {
        const ratio = getContrastRatio(colour, theme.palette[surface]);
        assert.ok(
          ratio >= minimum,
          `${theme.id} ${label} ${token} ${colour} on ${surface} ${theme.palette[surface]}: ${ratio.toFixed(2)}`,
        );
      }
    }
  }
}

test("link text reads at 4.5:1 on the window colour, derived and as applied", () =>
  assertTokenReadable("--notepane-link", ["window"], 4.5));

test("the browser focus ring reaches 3:1 on the window and panel, derived and as applied", () =>
  assertTokenReadable("--notepane-focus-outline", ["window", "panel"], 3));

test("every override has a recorded reason", async () => {
  const { listThemes } = await loadThemes();
  for (const theme of listThemes()) {
    const overrideKeys = Object.keys(theme.overrides).sort();
    const grouped = (theme.overrideReasons ?? []).flatMap((group) => {
      assert.ok(group.reason && group.reason.trim(), `${theme.id} reason text`);
      return group.tokens;
    });
    assert.deepEqual([...grouped].sort(), overrideKeys, theme.id);
    assert.equal(new Set(grouped).size, grouped.length, `${theme.id} token listed twice`);
  }
});

test("renderer and store normalizeAppTheme agree", async () => {
  globalThis.window ??= {};
  const { normalizeAppTheme: normalizeRendererAppTheme } = await import("../../src/model/preferences.js");
  const { normalizeAppTheme: normalizeStoreAppTheme } = require("../../electron/store.cjs");
  const inputs = [
    { themeId: "notepane-dark" },
    { themeId: "notepane-light", mode: "dark" },
    { themeId: "solarized", mode: "dark" },
    { themeId: "solarized" },
    { mode: "dark" },
    { mode: "light" },
    { mode: "sepia" },
    { themeId: 3, mode: "dark" },
    "notepane-dark",
    null,
    undefined,
    [],
  ];
  const fallbacks = [undefined, { themeId: "notepane-dark", mode: "dark" }, { mode: "dark" }, "garbage"];
  for (const fallback of fallbacks) {
    for (const input of inputs) {
      const label = JSON.stringify({ input, fallback });
      const fromStore = normalizeStoreAppTheme(input, fallback);
      assert.deepEqual(normalizeRendererAppTheme(input, fallback), fromStore, label);
      assert.deepEqual(Object.keys(fromStore), ["themeId", "mode"], label);
    }
  }
  assert.deepEqual(normalizeStoreAppTheme({ themeId: "solarized", mode: "dark" }), {
    themeId: "notepane-dark",
    mode: "dark",
  });
  assert.deepEqual(normalizeStoreAppTheme("notepane-dark"), {
    themeId: "notepane-light",
    mode: "light",
  });
});

// Read with a fallback and never set anywhere; layout, not colour.
const UNSET_WITH_FALLBACK = new Set(["--sticky-window-radius"]);
const LIBRARY_PREFIX = /^--(?:bn|mantine|shiki|prosemirror)-/;

function readSource(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function listSources(directory, extensions) {
  return fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return listSources(relativePath, extensions);
    return extensions.includes(path.extname(entry.name)) ? [relativePath] : [];
  });
}

test("every token a stylesheet or script reads is defined", async () => {
  globalThis.window ??= {};
  const { THEME_TOKEN_NAMES } = await loadTokens();
  const { getTheme } = await loadThemes();
  const { getStickyShellStyle, getSessionTabStyle } = await import("../../src/style/themeStyles.js");
  const stylesheets = listSources("src/styles", [".css"]).map(readSource).join("\n");
  const scriptFiles = listSources("src", [".js", ".jsx"]);
  const sideMenuStyle = [...readSource("src/editor/sideMenu.jsx").matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1])
    .join("\n");
  // Scripts read a token through a var() they hand to the page, or through getPropertyValue.
  const scriptReads = scriptFiles.flatMap((file) => {
    const source = readSource(file);
    return [
      ...[...source.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]),
      ...[...source.matchAll(/getPropertyValue\(\s*["'`](--[\w-]+)["'`]/g)].map((match) => match[1]),
    ];
  });
  const readNames = new Set([
    ...[...`${stylesheets}\n${sideMenuStyle}`.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]),
    ...scriptReads,
  ]);
  const declaredByRule = new Set(
    [...stylesheets.matchAll(/(?:^|[{;\s])(--[\w-]+)\s*:/g)].map((match) => match[1]),
  );
  const pastel = { tabTextColor: "#fff2b8", tabTextOpacity: 1 };
  const setByStyleFunctions = new Set(
    ["notepane-light", "notepane-dark"].map(getTheme).flatMap((theme) => [
      ...Object.keys(getStickyShellStyle(pastel, "#fff2b8", theme)),
      ...Object.keys(getSessionTabStyle(pastel, theme, 0)),
    ]),
  );
  // Layout and picker variables that components define as inline styles: the quoted keys of a
  // style object ({ "--x": … }) and the first argument of style.setProperty("--x", …). Only a
  // definition counts; a name that is merely quoted, such as getPropertyValue("--x"), defines
  // nothing. The two theme style modules are covered through their APIs above.
  const themeModules = new Set(["src/style/themeTokens.js", "src/style/themeStyles.js"]);
  const setByComponents = new Set(
    scriptFiles
      .filter((file) => !themeModules.has(file))
      .flatMap((file) => {
        const source = readSource(file);
        return [
          ...[...source.matchAll(/["'`](--[\w-]+)["'`]\s*:/g)].map((match) => match[1]),
          ...[...source.matchAll(/\.setProperty\(\s*["'`](--[\w-]+)["'`]/g)].map((match) => match[1]),
        ];
      }),
  );
  const undefinedNames = [...readNames]
    .filter(
      (name) =>
        !THEME_TOKEN_NAMES.includes(name) &&
        !declaredByRule.has(name) &&
        !setByStyleFunctions.has(name) &&
        !setByComponents.has(name) &&
        !LIBRARY_PREFIX.test(name) &&
        !UNSET_WITH_FALLBACK.has(name),
    )
    .sort();
  assert.deepEqual(undefinedNames, []);
});

