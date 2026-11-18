const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { StickyStore, normalizeLook: normalizeStoredLook } = require("../../electron/store.cjs");

const loadLook = () => import("../../src/model/look.js");

const assetUrl = (character, extension = "png") =>
  `notepane-asset://local/${character.repeat(64)}.${extension}`;

const EDGE_INPUTS = [
  undefined,
  null,
  "look",
  42,
  [],
  {},
  { accentColor: "#ABCDEF", corners: "round" },
  { accentColor: "blue", corners: "pointy" },
  { accentColor: "#abc" },
  {
    fonts: {
      editorSize: 99,
      lineHeight: 1.234,
      letterSpacing: -1,
      blockSpacing: "7",
      textWidth: 731,
      headingFont: 'Comic"; } body {',
      headingWeight: "800",
      codeFont: "jetbrains",
      codeSize: Number.NaN,
      codeLigatures: "no",
    },
  },
  { fonts: { editorSize: 11.6, lineHeight: 2.5, letterSpacing: 0.046, textWidth: 2000, headingWeight: 650 } },
  { fonts: { editorSize: "", lineHeight: null, letterSpacing: Infinity, codeSize: 13.5 } },
  {
    background: {
      type: "picture",
      color: "#FFFFFF",
      from: "red",
      to: "#12345g",
      angle: 400,
      picture: "https://example.com/a.png",
      pictures: [
        ...Array.from("0123456789abcdef", (character) => assetUrl(character)),
        "notepane-asset://local/not-a-hash.png",
        42,
      ],
      fit: "stretch",
      position: "middle",
      blur: -3,
      brightness: 500,
      saturation: 12.4,
      tint: "#000000",
      tintAmount: 81,
      behindStickies: "yes",
      dimInDark: false,
    },
  },
  {
    background: {
      type: "gradient",
      picture: assetUrl("a", "webp"),
      pictures: [assetUrl("a", "webp"), assetUrl("a", "webp"), assetUrl("b", "jpg")],
      position: "right bottom",
      fit: "tile",
    },
  },
  { background: { picture: "builtin:dawn", pictures: "nope" } },
  {
    surfaces: {
      sidebar: { fill: "#AABBCC", opacity: 140, blur: 41, border: "strong" },
      header: { fill: "transparent", opacity: -5, blur: "9", border: "dotted" },
      editor: null,
      menus: "frosted",
      settings: { opacity: 33.4, blur: 2.6, border: "none" },
      unknownArea: { opacity: 1 },
    },
  },
  {
    tabs: {
      style: "filled",
      height: "huge",
      radius: 20,
      showNumbers: false,
      showShortcuts: 0,
      colorStrength: 5,
      newTabColor: "cycle",
    },
  },
  { unknownKey: true, fonts: { unknownFont: 1 }, tabs: { radius: "3.4" } },
  { palette: { width: 1100, maxHeight: 31, textSize: "15.4", position: "bottom" } },
  { palette: { width: 731, maxHeight: 77, textSize: 11, position: "center" } },
  { palette: "large" },
  { fonts: { headingFont: "  Avenir Next  ", codeFont: "Andale Mono" } },
  { fonts: { headingFont: "serif", codeFont: "courier" } },
  { fonts: { headingFont: "Evil'; color: red", codeFont: "Mono}" } },
  { fonts: { headingFont: "a\\b", codeFont: "Line\nbreak" } },
  { fonts: { headingFont: "x".repeat(121), codeFont: "   " } },
  { fonts: { headingFont: "x".repeat(120), codeFont: 42 } },
];

test("the store's normalizeLook agrees with the renderer's on edge inputs", async () => {
  const { normalizeLook } = await loadLook();
  for (const input of EDGE_INPUTS) {
    assert.deepEqual(normalizeStoredLook(input), normalizeLook(input), JSON.stringify(input));
  }
});

test("heading and code fonts take a preset id or a safe family name", async () => {
  const { normalizeLook } = await loadLook();
  const fontsOf = (fonts) => normalizeLook({ fonts }).fonts;
  assert.deepEqual(
    fontsOf({ headingFont: "rounded", codeFont: "jetbrains" }),
    { ...fontsOf({}), headingFont: "rounded", codeFont: "jetbrains" },
  );
  const named = fontsOf({ headingFont: "  Avenir Next ", codeFont: "Andale Mono" });
  assert.equal(named.headingFont, "Avenir Next");
  assert.equal(named.codeFont, "Andale Mono");
  for (const unsafe of ['A"B', "A'B", "A;B", "A{B", "A}B", "A\\B", "A\nB", "", "x".repeat(121), 7, null]) {
    const fonts = fontsOf({ headingFont: unsafe, codeFont: unsafe });
    assert.equal(fonts.headingFont, "same", JSON.stringify(unsafe));
    assert.equal(fonts.codeFont, "system", JSON.stringify(unsafe));
  }
  assert.equal(fontsOf({ headingFont: "x".repeat(120) }).headingFont, "x".repeat(120));
});

test("a named heading or code font draws first, with the role's fallback after it", async () => {
  // src/constants.js reads window.blocknoteSticky at import time.
  globalThis.window ??= {};
  const { getLookStyles } = await import("../../src/hooks/useLookStyles.js");
  const named = getLookStyles({ fonts: { headingFont: "Avenir Next", codeFont: "Andale Mono" } });
  assert.equal(named.properties["--look-heading-font"], '"Avenir Next"');
  assert.equal(named.properties["--look-code-font"], '"Andale Mono", ui-monospace, monospace');
  assert.equal(named.attributes["data-look-code-size"], "");
  const presets = getLookStyles({ fonts: { headingFont: "serif", codeFont: "menlo" } });
  assert.equal(presets.properties["--look-heading-font"], '"New York", ui-serif, Georgia, serif');
  assert.equal(presets.properties["--look-code-font"], "Menlo, monospace");
  const defaults = getLookStyles({});
  assert.equal(defaults.properties["--look-heading-font"], undefined);
  assert.equal(defaults.attributes["data-look-code-size"], undefined);
});

test("normalizeLook keeps the search palette's size inside its ranges", async () => {
  const { DEFAULT_LOOK, normalizeLook } = await loadLook();
  assert.deepEqual(DEFAULT_LOOK.palette, { width: 720, maxHeight: 72, textSize: 14, position: "top" });
  assert.deepEqual(
    normalizeLook({ palette: { width: 1100, maxHeight: 31, textSize: 15.4, position: "bottom" } }).palette,
    { width: 1040, maxHeight: 40, textSize: 15, position: "top" },
  );
  assert.deepEqual(
    normalizeLook({ palette: { width: 731, maxHeight: 77, textSize: 19, position: "center" } }).palette,
    { width: 740, maxHeight: 78, textSize: 18, position: "center" },
  );
});

test("normalizeLook fills every field from an empty object", async () => {
  const { DEFAULT_LOOK, normalizeLook } = await loadLook();
  const look = normalizeLook({});
  assert.deepEqual(look, DEFAULT_LOOK);
  assert.deepEqual(Object.keys(look.surfaces), ["sidebar", "header", "editor", "menus", "settings"]);
});

test("normalizeLook clamps, snaps and validates", async () => {
  const { normalizeLook } = await loadLook();
  const look = normalizeLook(EDGE_INPUTS[9]);
  assert.equal(look.fonts.editorSize, 24);
  assert.equal(look.fonts.lineHeight, 1.25);
  assert.equal(look.fonts.letterSpacing, -0.03);
  assert.equal(look.fonts.blockSpacing, 7);
  assert.equal(look.fonts.textWidth, 740);
  assert.equal(look.fonts.headingFont, "same");
  assert.equal(look.fonts.headingWeight, 800);
  assert.equal(look.fonts.codeFont, "jetbrains");
  assert.equal(look.fonts.codeSize, 14);
  assert.equal(look.fonts.codeLigatures, true);

  const background = normalizeLook(EDGE_INPUTS[12]).background;
  assert.equal(background.color, "#ffffff");
  assert.equal(background.from, "#f7d9cf");
  assert.equal(background.angle, 360);
  assert.equal(background.picture, "builtin:dawn");
  assert.equal(background.pictures.length, 12);
  assert.ok(background.pictures.every((url) => url.startsWith("notepane-asset://local/")));
  assert.equal(background.blur, 0);
  assert.equal(background.brightness, 160);
  assert.equal(background.tintAmount, 80);

  assert.deepEqual(normalizeLook(EDGE_INPUTS[13]).background.pictures, [
    assetUrl("a", "webp"),
    assetUrl("b", "jpg"),
  ]);
  assert.equal(normalizeLook({ accentColor: "#ABCDEF" }).accentColor, "#abcdef");
});

test("applySurfaceStyle sets the window from one material and menus from their own blur", async () => {
  const { applySurfaceStyle, getSurfaceStyle, normalizeLook, DEFAULT_LOOK } = await loadLook();
  // The default look reads as frosted at the sidebar's opacity, with menus blurring 24px.
  assert.deepEqual(getSurfaceStyle(DEFAULT_LOOK), {
    material: "frosted", opacity: 72, border: "hairline", floatingBlur: 24,
  });

  const look = normalizeLook({ surfaces: { sidebar: { fill: "#aabbcc", border: "strong" } } });
  const clear = applySurfaceStyle(look, { material: "clear", opacity: 30, border: "none" });
  assert.deepEqual(clear.surfaces.sidebar, { fill: null, opacity: 30, blur: 0, border: "none" });
  // A clear window keeps its menus' blur, at least 80% opaque, and the editor draws no border.
  assert.deepEqual(clear.surfaces.menus, { fill: null, opacity: 80, blur: 24, border: "none" });
  assert.equal(clear.surfaces.editor.border, "none");
  assert.deepEqual(getSurfaceStyle(clear), { material: "clear", opacity: 30, border: "none", floatingBlur: 24 });

  // The blur sets menus and Settings alike, snapped to its 2px step and kept in 0..40; 0 leaves
  // them clear.
  const softMenus = applySurfaceStyle(clear, { floatingBlur: 9 });
  assert.deepEqual([softMenus.surfaces.menus.blur, softMenus.surfaces.settings.blur], [10, 10]);
  assert.equal(softMenus.surfaces.sidebar.blur, 0);
  assert.equal(getSurfaceStyle(applySurfaceStyle(clear, { floatingBlur: 99 })).floatingBlur, 40);
  const clearMenus = applySurfaceStyle(softMenus, { floatingBlur: 0 });
  assert.deepEqual(clearMenus.surfaces.settings, { fill: null, opacity: 80, blur: 0, border: "none" });
  assert.equal(getSurfaceStyle(clearMenus).floatingBlur, 0);

  // The window's material leaves the menus' blur alone.
  const frosted = applySurfaceStyle(clearMenus, { material: "frosted" });
  assert.equal(getSurfaceStyle(frosted).material, "frosted");
  assert.equal(frosted.surfaces.editor.blur, 12);
  assert.equal(frosted.surfaces.menus.blur, 0);

  // Solid hides the background behind the window; going back to glass starts from the default
  // opacity. Menus over a solid window still blur the note under them.
  const solid = applySurfaceStyle(frosted, { material: "solid", floatingBlur: 24 });
  assert.ok(["sidebar", "header", "editor"].every((area) => solid.surfaces[area].opacity === 100));
  assert.deepEqual(getSurfaceStyle(solid), { material: "solid", opacity: 72, border: "none", floatingBlur: 24 });
  assert.deepEqual(solid.surfaces.menus, { fill: null, opacity: 80, blur: 24, border: "none" });
});

test("getNextCycledTabColor takes the pastel after the newest coloured session", async () => {
  const { getNextCycledTabColor } = await loadLook();
  const palette = ["#aaaaaa", "#bbbbbb", "#cccccc"];
  assert.equal(getNextCycledTabColor([], palette), "#aaaaaa");
  assert.equal(
    getNextCycledTabColor([
      { createdAt: 1, theme: { tabTextColor: "#cccccc" } },
      { createdAt: 3, theme: { tabTextColor: "#bbbbbb" } },
      { createdAt: 4, theme: { tabTextColor: null } },
    ], palette),
    "#cccccc",
  );
  assert.equal(getNextCycledTabColor([{ createdAt: 1, theme: { tabTextColor: "#cccccc" } }], palette), "#aaaaaa");
});

test("the store keeps background pictures referenced from preferences through garbage collection", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "notepane-look-"));
  const store = new StickyStore(directory);
  const current = store.assets.put(Buffer.from("current picture"), "image/png");
  const listed = store.assets.put(Buffer.from("listed picture"), "image/jpeg");
  const orphan = store.assets.put(Buffer.from("orphan picture"), "image/webp");
  store.updateEditorPreferences({
    ...store.getEditorPreferences(),
    look: { background: { type: "picture", picture: current, pictures: [current, listed] } },
  });

  const reloaded = new StickyStore(directory);

  assert.ok(fs.existsSync(reloaded.assets.filePathFor(current)));
  assert.ok(fs.existsSync(reloaded.assets.filePathFor(listed)));
  assert.equal(fs.existsSync(reloaded.assets.filePathFor(orphan)), false);
  assert.deepEqual(reloaded.getEditorPreferences().look.background.pictures, [current, listed]);
});

test("a partial preference update keeps the stored look", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "notepane-look-"));
  const store = new StickyStore(directory);
  store.updateEditorPreferences({ ...store.getEditorPreferences(), look: { corners: "round" } });
  store.updateEditorPreferences({ appZoom: 1.1 });
  assert.equal(new StickyStore(directory).getEditorPreferences().look.corners, "round");
});
