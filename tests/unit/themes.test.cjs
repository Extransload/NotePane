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

test("NotePane Light tokens equal the captured tokens.css values", async () => {
  const baseline = require("./fixtures/theme-baseline.json");
  const { buildThemeTokens } = await loadTokens();
  const { getTheme } = await loadThemes();
  assert.deepEqual(
    normaliseTokens(buildThemeTokens(getTheme("notepane-light"))),
    normaliseTokens(baseline.tokens.light),
  );
});

test("NotePane Dark tokens equal the captured tokens.css values", async () => {
  const baseline = require("./fixtures/theme-baseline.json");
  const { buildThemeTokens } = await loadTokens();
  const { getTheme } = await loadThemes();
  assert.deepEqual(
    normaliseTokens(buildThemeTokens(getTheme("notepane-dark"))),
    normaliseTokens(baseline.tokens.dark),
  );
});

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

test("every token a stylesheet reads is defined", async () => {
  globalThis.window ??= {};
  const { THEME_TOKEN_NAMES } = await loadTokens();
  const { getStickyShellStyle, getSessionTabStyle } = await import("../../src/style/themeStyles.js");
  const stylesheets = listSources("src/styles", [".css"]).map(readSource).join("\n");
  const sideMenuStyle = [...readSource("src/editor/sideMenu.jsx").matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match) => match[1])
    .join("\n");
  const readNames = new Set(
    [...`${stylesheets}\n${sideMenuStyle}`.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]),
  );
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
  // Layout and picker variables that components set as inline styles (style={{ "--x": … }} or
  // style.setProperty("--x", …)). The two theme style modules are covered through their APIs above.
  const themeModules = new Set(["src/style/themeTokens.js", "src/style/themeStyles.js"]);
  const setByComponents = new Set(
    listSources("src", [".js", ".jsx"])
      .filter((file) => !themeModules.has(file))
      .flatMap((file) => [...readSource(file).matchAll(/["'`](--[\w-]+)["'`]/g)].map((match) => match[1])),
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

