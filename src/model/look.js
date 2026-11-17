// The "Look" preferences: accent, corners, typography, the window background and how each area
// of the window sits over it, and the tab style. editorPreferences.look holds one complete,
// validated object (normalizeLook); src/hooks/useLookStyles.js turns it into attributes and
// --look-* variables on <html>, and src/styles/look.css holds every rule that reads them.
// electron/store.cjs keeps a twin of normalizeLook (tests/unit/look.test.cjs checks that the two
// agree), so a value the renderer saves is the value the store keeps.

// Accent choices offered next to the theme's own accent. User-chosen colours, not theme tokens.
export const LOOK_ACCENTS = {
  blue: "#2383e2",
  purple: "#8b5cf6",
  green: "#2f9e44",
  orange: "#e8590c",
  pink: "#d6336c",
};

export const BACKGROUND_POSITIONS = [
  "left top",
  "center top",
  "right top",
  "left center",
  "center",
  "right center",
  "left bottom",
  "center bottom",
  "right bottom",
];

export const LOOK_AREAS = ["sidebar", "header", "editor", "menus", "settings"];

// new URL(…, import.meta.url) is how Vite bundles an asset from plain JS; Node reads the same
// line as a file URL, so the unit tests can import this module without a bundler.
export const BUILTIN_BACKGROUNDS = [
  {
    id: "builtin:dawn",
    label: "Dawn",
    url: new URL("../assets/backgrounds/dawn.webp", import.meta.url).href,
    thumb: new URL("../assets/backgrounds/dawn-thumb.webp", import.meta.url).href,
  },
];

const BUILTIN_BACKGROUND_IDS = BUILTIN_BACKGROUNDS.map((background) => background.id);
const ASSET_URL_PATTERN = /^notepane-asset:\/\/local\/[0-9a-f]{64}\.[a-z0-9]{1,5}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const MAX_BACKGROUND_PICTURES = 12;

export const DEFAULT_LOOK = Object.freeze({
  accentColor: null,
  corners: "default",
  fonts: Object.freeze({
    editorSize: 16,
    lineHeight: 1.5,
    letterSpacing: 0,
    blockSpacing: 0,
    textWidth: 820,
    headingFont: "same",
    headingWeight: 700,
    codeFont: "system",
    codeSize: 14,
    codeLigatures: true,
  }),
  // The default colours only show once the user picks a colour or gradient background.
  background: Object.freeze({
    type: "none",
    color: "#dfe7f2",
    from: "#f7d9cf",
    to: "#c9d7f7",
    angle: 135,
    picture: "builtin:dawn",
    pictures: Object.freeze([]),
    fit: "cover",
    position: "center",
    blur: 0,
    brightness: 100,
    saturation: 100,
    tint: "#1b2a4a",
    tintAmount: 0,
    behindStickies: true,
    dimInDark: true,
  }),
  surfaces: Object.freeze({
    sidebar: Object.freeze({ fill: null, opacity: 72, blur: 16, border: "hairline" }),
    header: Object.freeze({ fill: null, opacity: 60, blur: 12, border: "hairline" }),
    editor: Object.freeze({ fill: null, opacity: 82, blur: 0, border: "none" }),
    menus: Object.freeze({ fill: null, opacity: 88, blur: 24, border: "hairline" }),
    settings: Object.freeze({ fill: null, opacity: 92, blur: 24, border: "hairline" }),
  }),
  // Over a background that shows through, text gets a soft halo of the window colour.
  readableText: true,
  tabs: Object.freeze({
    style: "outline",
    height: "regular",
    radius: 7,
    showNumbers: true,
    showShortcuts: true,
    colorStrength: 100,
    newTabColor: "none",
  }),
});

// Settings > Look > Background sets the window's areas at once, as Tern's Material and Opacity
// do: Solid hides the background, Frosted blurs what shows through, Clear leaves it sharp. Menus
// and popups (and the Settings window) float over the note's text, so they take a material of
// their own: Frosted keeps the text under an open menu from showing through sharp.
export const SURFACE_MATERIALS = ["solid", "frosted", "clear"];
// Frosted's blur for each area; the editor, which holds the text, the least.
const FROSTED_BLUR = { sidebar: 24, header: 20, editor: 12, menus: 24, settings: 30 };
const WINDOW_AREAS = ["sidebar", "header", "editor"];
const FLOATING_AREAS = ["menus", "settings"];
// Menus and Settings carry small text over whatever lies under them, so they stay at least this
// opaque.
const FLOATING_MIN_OPACITY = 80;
// The opacity Frosted and Clear start from after Solid, which keeps no opacity of its own.
export const DEFAULT_SURFACE_OPACITY = DEFAULT_LOOK.surfaces.sidebar.opacity;

const asObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

// A number in [min, max], snapped to `step` from `min`; anything that is not a finite number
// (or a numeric string) falls back.
function normalizeNumber(value, fallback, min, max, step) {
  const numeric =
    typeof value === "number" || (typeof value === "string" && value.trim() !== "")
      ? Number(value)
      : NaN;
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const snapped = min + Math.round((Math.min(Math.max(numeric, min), max) - min) / step) * step;
  // Snapping by a fractional step leaves binary noise (1.2000000000000002); two decimals is the
  // finest step any setting uses.
  return Math.min(Number(snapped.toFixed(2)), max);
}

function normalizeChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback;
}

function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeHex(value, fallback) {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value) ? value.toLowerCase() : fallback;
}

function isAssetUrl(value) {
  return typeof value === "string" && ASSET_URL_PATTERN.test(value);
}

function normalizeFonts(value) {
  const source = asObject(value);
  const fallback = DEFAULT_LOOK.fonts;
  return {
    editorSize: normalizeNumber(source.editorSize, fallback.editorSize, 12, 24, 1),
    lineHeight: normalizeNumber(source.lineHeight, fallback.lineHeight, 1.2, 2.2, 0.05),
    letterSpacing: normalizeNumber(source.letterSpacing, fallback.letterSpacing, -0.03, 0.08, 0.01),
    blockSpacing: normalizeNumber(source.blockSpacing, fallback.blockSpacing, 0, 24, 1),
    textWidth: normalizeNumber(source.textWidth, fallback.textWidth, 560, 1100, 20),
    headingFont: normalizeChoice(
      source.headingFont,
      ["same", "serif", "display", "rounded"],
      fallback.headingFont,
    ),
    headingWeight: normalizeChoice(Number(source.headingWeight), [600, 700, 800], fallback.headingWeight),
    codeFont: normalizeChoice(
      source.codeFont,
      ["system", "menlo", "jetbrains", "courier"],
      fallback.codeFont,
    ),
    codeSize: normalizeNumber(source.codeSize, fallback.codeSize, 11, 20, 1),
    codeLigatures: normalizeBoolean(source.codeLigatures, fallback.codeLigatures),
  };
}

function normalizeBackground(value) {
  const source = asObject(value);
  const fallback = DEFAULT_LOOK.background;
  const pictures = [...new Set(Array.isArray(source.pictures) ? source.pictures.filter(isAssetUrl) : [])]
    .slice(0, MAX_BACKGROUND_PICTURES);
  const picture =
    BUILTIN_BACKGROUND_IDS.includes(source.picture) || isAssetUrl(source.picture)
      ? source.picture
      : fallback.picture;
  return {
    type: normalizeChoice(source.type, ["none", "color", "gradient", "picture"], fallback.type),
    color: normalizeHex(source.color, fallback.color),
    from: normalizeHex(source.from, fallback.from),
    to: normalizeHex(source.to, fallback.to),
    angle: normalizeNumber(source.angle, fallback.angle, 0, 360, 1),
    picture,
    pictures,
    fit: normalizeChoice(source.fit, ["cover", "contain", "tile"], fallback.fit),
    position: normalizeChoice(source.position, BACKGROUND_POSITIONS, fallback.position),
    blur: normalizeNumber(source.blur, fallback.blur, 0, 64, 1),
    brightness: normalizeNumber(source.brightness, fallback.brightness, 40, 160, 1),
    saturation: normalizeNumber(source.saturation, fallback.saturation, 0, 200, 1),
    tint: normalizeHex(source.tint, fallback.tint),
    tintAmount: normalizeNumber(source.tintAmount, fallback.tintAmount, 0, 80, 1),
    behindStickies: normalizeBoolean(source.behindStickies, fallback.behindStickies),
    dimInDark: normalizeBoolean(source.dimInDark, fallback.dimInDark),
  };
}

function normalizeSurface(value, fallback) {
  const source = asObject(value);
  return {
    fill: normalizeHex(source.fill, null),
    opacity: normalizeNumber(source.opacity, fallback.opacity, 0, 100, 1),
    blur: normalizeNumber(source.blur, fallback.blur, 0, 40, 1),
    border: normalizeChoice(source.border, ["none", "hairline", "strong"], fallback.border),
  };
}

function normalizeTabs(value) {
  const source = asObject(value);
  const fallback = DEFAULT_LOOK.tabs;
  return {
    style: normalizeChoice(source.style, ["plain", "outline", "filled"], fallback.style),
    height: normalizeChoice(source.height, ["compact", "regular", "tall"], fallback.height),
    radius: normalizeNumber(source.radius, fallback.radius, 0, 14, 1),
    showNumbers: normalizeBoolean(source.showNumbers, fallback.showNumbers),
    showShortcuts: normalizeBoolean(source.showShortcuts, fallback.showShortcuts),
    colorStrength: normalizeNumber(source.colorStrength, fallback.colorStrength, 20, 100, 1),
    newTabColor: normalizeChoice(source.newTabColor, ["none", "cycle"], fallback.newTabColor),
  };
}

// A complete look with every field validated: numbers clamped and snapped to their step, enums
// and colours checked, unknown keys dropped. Anything invalid takes its DEFAULT_LOOK value.
export function normalizeLook(value) {
  const source = asObject(value);
  const surfaces = asObject(source.surfaces);
  return {
    accentColor: normalizeHex(source.accentColor, null),
    corners: normalizeChoice(source.corners, ["sharp", "default", "round"], DEFAULT_LOOK.corners),
    fonts: normalizeFonts(source.fonts),
    background: normalizeBackground(source.background),
    surfaces: Object.fromEntries(
      LOOK_AREAS.map((area) => [area, normalizeSurface(surfaces[area], DEFAULT_LOOK.surfaces[area])]),
    ),
    readableText: normalizeBoolean(source.readableText, DEFAULT_LOOK.readableText),
    tabs: normalizeTabs(source.tabs),
  };
}

function readMaterial(surface) {
  return surface.opacity === 100 ? "solid" : surface.blur > 0 ? "frosted" : "clear";
}

// The surfaces as Settings shows them: the window's material, opacity and border, read from the
// sidebar, and the material of menus and popups, read from the menus.
export function getSurfaceStyle(look) {
  const { surfaces } = normalizeLook(look);
  const { sidebar } = surfaces;
  return {
    material: WINDOW_AREAS.every((area) => surfaces[area].opacity === 100) ? "solid" : readMaterial(sidebar),
    opacity: sidebar.opacity === 100 ? DEFAULT_SURFACE_OPACITY : sidebar.opacity,
    border: sidebar.border,
    floating: readMaterial(surfaces.menus),
  };
}

// The look with the window's areas set from one material, opacity and border, and menus and
// Settings from the floating material, at the window's opacity but at least 80%. An area's own
// fill goes, as Settings no longer sets areas one by one.
export function applySurfaceStyle(look, { material, opacity, border, floating }) {
  const normalized = normalizeLook(look);
  const current = getSurfaceStyle(normalized);
  const chosenMaterial = SURFACE_MATERIALS.includes(material) ? material : current.material;
  const chosenFloating = SURFACE_MATERIALS.includes(floating) ? floating : current.floating;
  const chosenOpacity = normalizeNumber(opacity, current.opacity, 0, 100, 1);
  const chosenBorder = normalizeChoice(border, ["none", "hairline", "strong"], current.border);
  const surfaceFor = (area) => {
    const floats = FLOATING_AREAS.includes(area);
    const areaMaterial = floats ? chosenFloating : chosenMaterial;
    return {
      fill: null,
      opacity: areaMaterial === "solid"
        ? 100
        : floats
          ? Math.max(chosenOpacity, FLOATING_MIN_OPACITY)
          : chosenOpacity,
      blur: areaMaterial === "frosted" ? FROSTED_BLUR[area] : 0,
      // The editor has no edge of its own to draw a border on.
      border: area === "editor" ? "none" : chosenBorder,
    };
  };
  return normalizeLook({
    ...normalized,
    surfaces: Object.fromEntries(LOOK_AREAS.map((area) => [area, surfaceFor(area)])),
  });
}

// The URL a background picture value points at: a built-in picture's bundled file, or the
// notepane-asset URL itself.
export function resolveBackgroundPictureUrl(picture) {
  return BUILTIN_BACKGROUNDS.find((background) => background.id === picture)?.url ?? picture;
}

// tabs.newTabColor "cycle": the colour a new session gets, the palette colour after the one the
// most recently created coloured session uses, or the first when no session has one.
export function getNextCycledTabColor(notes, palette) {
  const latest = (Array.isArray(notes) ? notes : [])
    .filter((note) => palette.includes(note?.theme?.tabTextColor))
    .reduce((found, note) => (!found || (note.createdAt ?? 0) >= (found.createdAt ?? 0) ? note : found), null);
  return latest
    ? palette[(palette.indexOf(latest.theme.tabTextColor) + 1) % palette.length]
    : palette[0];
}
