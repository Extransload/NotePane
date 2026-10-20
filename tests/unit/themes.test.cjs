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

test("theme ids are unique", async () => {
  const { listThemes } = await loadThemes();
  const ids = listThemes().map((theme) => theme.id);
  assert.equal(new Set(ids).size, ids.length);
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
    ["light", "dark"].flatMap((mode) => [
      ...Object.keys(getStickyShellStyle(pastel, "#fff2b8", mode)),
      ...Object.keys(getSessionTabStyle(pastel, mode, 0)),
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

