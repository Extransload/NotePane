const test = require("node:test");
const assert = require("node:assert/strict");

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
    pickColourTokens(buildThemeTokens(getTheme("notepane-light"))),
    pickColourTokens(baseline.tokens.light),
  );
});

test("NotePane Dark tokens equal the captured tokens.css values", async () => {
  const baseline = require("./fixtures/theme-baseline.json");
  const { buildThemeTokens } = await loadTokens();
  const { getTheme } = await loadThemes();
  assert.deepEqual(
    pickColourTokens(buildThemeTokens(getTheme("notepane-dark"))),
    pickColourTokens(baseline.tokens.dark),
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
  registerTestThemes([{ ...base, id: "test-extra", label: "Test Extra" }]);
  const ids = listThemes().map((theme) => theme.id);
  assert.deepEqual(ids.slice(0, 2), ["notepane-light", "notepane-dark"]);
  assert.equal(ids.at(-1), "test-extra");
  assert.ok(isKnownThemeId("test-extra"));
  registerTestThemes([]);
  assert.ok(!isKnownThemeId("test-extra"));
});
