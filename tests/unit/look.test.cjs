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
      headingFont: "comic",
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
];

test("the store's normalizeLook agrees with the renderer's on edge inputs", async () => {
  const { normalizeLook } = await loadLook();
  for (const input of EDGE_INPUTS) {
    assert.deepEqual(normalizeStoredLook(input), normalizeLook(input), JSON.stringify(input));
  }
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

test("applySurfacePreset sets opacity and blur and keeps fill and border", async () => {
  const { SURFACE_PRESETS, applySurfacePreset, normalizeLook } = await loadLook();
  const look = normalizeLook({ surfaces: { sidebar: { fill: "#aabbcc", border: "strong" } } });
  const frosted = applySurfacePreset(look, "frosted");
  assert.deepEqual(frosted.surfaces.sidebar, { fill: "#aabbcc", opacity: 55, blur: 24, border: "strong" });
  assert.deepEqual(frosted.surfaces.settings, { fill: null, opacity: 78, blur: 30, border: "hairline" });
  for (const area of Object.keys(SURFACE_PRESETS.solid)) {
    assert.deepEqual(
      { opacity: applySurfacePreset(look, "solid").surfaces[area].opacity, blur: applySurfacePreset(look, "solid").surfaces[area].blur },
      { opacity: 100, blur: 0 },
    );
  }
  assert.deepEqual(applySurfacePreset(look, "unknown"), look);
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
