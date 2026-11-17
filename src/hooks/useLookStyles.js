import {
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  DEFAULT_LOOK,
  LOOK_AREAS,
  normalizeLook,
  resolveBackgroundPictureUrl,
} from "../model/look.js";

const CORNER_SCALES = { sharp: 0.4, default: 1, round: 1.6 };

const HEADING_FONTS = {
  serif: '"New York", ui-serif, Georgia, serif',
  display: '"SF Pro Display", Inter, sans-serif',
  rounded: 'ui-rounded, "SF Pro Rounded", sans-serif',
};

const CODE_FONTS = {
  menlo: "Menlo, monospace",
  jetbrains: '"JetBrains Mono", ui-monospace, monospace',
  courier: '"Courier New", monospace',
};

const BACKGROUND_SIZES = { cover: "cover", contain: "contain", tile: "auto" };

// Dark themes keep a bright picture from glaring: a third darker.
const DARK_SCHEME_DIMMING = 2 / 3;

const STRONG_BORDER = "color-mix(in srgb, var(--sticky-text-color) 32%, transparent)";

// The window's own areas, whose text "Keep text readable" looks after once one of them lets this
// much of the background through.
const READABLE_AREAS = ["sidebar", "header", "editor"];
const READABLE_BELOW_OPACITY = 90;

/**
 * The attributes and custom properties that src/styles/look.css reads for `look`. A typography
 * variable is only set when its value differs from DEFAULT_LOOK: the stylesheet falls back to
 * today's value when it is missing, so the default look changes nothing on screen. `layoutMode`
 * decides whether a sticky window shows the backdrop (background.behindStickies).
 */
export function getLookStyles(look, { scheme = "light", layoutMode = "tabs" } = {}) {
  const { accentColor, corners, fonts, background, surfaces, readableText, tabs } = normalizeLook(look);
  const defaults = DEFAULT_LOOK;
  const attributes = {
    "data-look-corners": corners,
    "data-tab-style": tabs.style,
    "data-tab-height": tabs.height,
  };
  const properties = {
    "--look-radius-scale": String(CORNER_SCALES[corners]),
  };

  if (accentColor) {
    attributes["data-look-accent"] = "";
    properties["--look-accent"] = accentColor;
  }

  const setFont = (key, property, value) => {
    if (fonts[key] !== defaults.fonts[key]) {
      properties[property] = value;
    }
  };
  setFont("editorSize", "--look-editor-size", `${fonts.editorSize}px`);
  setFont("lineHeight", "--look-line-height", String(fonts.lineHeight));
  setFont("letterSpacing", "--look-letter-spacing", `${fonts.letterSpacing}em`);
  setFont("blockSpacing", "--look-block-spacing", `${fonts.blockSpacing}px`);
  setFont("textWidth", "--look-text-width", `${fonts.textWidth}px`);
  setFont("headingFont", "--look-heading-font", HEADING_FONTS[fonts.headingFont]);
  setFont("headingWeight", "--look-heading-weight", String(fonts.headingWeight));
  setFont("codeFont", "--look-code-font", CODE_FONTS[fonts.codeFont]);
  setFont("codeLigatures", "--look-code-ligatures", "none");
  // A code block's size today comes from the browser's monospace default, which no fallback
  // value can name, so the size rule only exists while this attribute is set. A named code font
  // also drops that default (it only applies to the bare monospace family), so it brings the
  // chosen size with it.
  if (fonts.codeSize !== defaults.fonts.codeSize || fonts.codeFont !== defaults.fonts.codeFont) {
    attributes["data-look-code-size"] = "";
    properties["--look-code-size"] = `${fonts.codeSize}px`;
  }

  const showsBackdrop =
    background.type !== "none" && (layoutMode !== "sticky" || background.behindStickies);
  if (showsBackdrop) {
    attributes["data-backdrop"] = background.type;
    properties["--look-backdrop-image"] = getBackdropImage(background);
    properties["--look-backdrop-size"] =
      background.type === "picture" ? BACKGROUND_SIZES[background.fit] : "cover";
    properties["--look-backdrop-repeat"] =
      background.type === "picture" && background.fit === "tile" ? "repeat" : "no-repeat";
    properties["--look-backdrop-position"] = background.position;
    const brightness =
      background.brightness * (background.dimInDark && scheme === "dark" ? DARK_SCHEME_DIMMING : 1);
    properties["--look-backdrop-filter"] =
      `blur(${background.blur}px) brightness(${Math.round(brightness)}%) saturate(${background.saturation}%)`;
    // The blurred layer reaches past the window by twice its blur, so its soft edge stays out
    // of view.
    properties["--look-backdrop-bleed"] = `${background.blur * 2}px`;
    properties["--look-tint-color"] = background.tint;
    properties["--look-tint-amount"] = `${background.tintAmount}%`;

    for (const area of LOOK_AREAS) {
      const surface = surfaces[area];
      if (surface.fill) {
        properties[`--look-${area}-fill`] = surface.fill;
      }
      properties[`--look-${area}-opacity`] = `${surface.opacity}%`;
      properties[`--look-${area}-filter`] =
        surface.blur > 0 ? `blur(${surface.blur}px) saturate(150%)` : "none";
      // Hairline keeps each area's own border; the other two replace its colour.
      if (surface.border !== "hairline") {
        attributes[`data-look-${area}-border`] = surface.border;
        properties[`--look-${area}-border`] = surface.border === "none" ? "transparent" : STRONG_BORDER;
      }
    }
    // Text over a background that shows through gets a soft halo (look.css).
    if (readableText && READABLE_AREAS.some((area) => surfaces[area].opacity < READABLE_BELOW_OPACITY)) {
      attributes["data-look-readable"] = "";
    }
  }

  if (tabs.radius !== defaults.tabs.radius) {
    properties["--look-tab-radius"] = `${tabs.radius}px`;
  }
  if (!tabs.showNumbers) {
    attributes["data-tab-numbers"] = "hidden";
  }
  if (!tabs.showShortcuts) {
    attributes["data-tab-shortcuts"] = "hidden";
  }
  if (tabs.colorStrength !== defaults.tabs.colorStrength) {
    attributes["data-tab-strength"] = "";
    properties["--look-tab-strength"] = `${tabs.colorStrength}%`;
  }

  return { attributes, properties };
}

function getBackdropImage(background) {
  if (background.type === "color") {
    return `linear-gradient(${background.color}, ${background.color})`;
  }
  if (background.type === "gradient") {
    return `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`;
  }
  return `url(${JSON.stringify(resolveBackgroundPictureUrl(background.picture))})`;
}

/**
 * Applies `look` (editorPreferences.look) to the document root before the browser paints, and
 * removes whatever the previous look set that this one does not.
 */
export function useLookStyles(look, { scheme, layoutMode } = {}) {
  const styles = useMemo(
    () => getLookStyles(look, { scheme, layoutMode }),
    [layoutMode, look, scheme],
  );
  const appliedRef = useRef({ attributes: [], properties: [] });

  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = appliedRef.current;
    for (const name of previous.attributes) {
      if (!Object.hasOwn(styles.attributes, name)) {
        root.removeAttribute(name);
      }
    }
    for (const name of previous.properties) {
      if (!Object.hasOwn(styles.properties, name)) {
        root.style.removeProperty(name);
      }
    }
    for (const [name, value] of Object.entries(styles.attributes)) {
      root.setAttribute(name, value);
    }
    for (const [name, value] of Object.entries(styles.properties)) {
      root.style.setProperty(name, value);
    }
    appliedRef.current = {
      attributes: Object.keys(styles.attributes),
      properties: Object.keys(styles.properties),
    };
  }, [styles]);
}
