import {
  DEFAULT_THEME,
  MODE_TAB_TEXT_DEFAULTS,
  SESSION_TAB_CONTRAST_TEXT,
} from "../constants.js";
import {
  clamp,
} from "../utils/values.js";

export function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeOpacity(value, fallback = DEFAULT_THEME.tabTextOpacity) {
  const hasExplicitValue =
    typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "");
  const numericValue = hasExplicitValue ? Number(value) : NaN;
  if (Number.isFinite(numericValue)) {
    return clamp(numericValue, 0, 1);
  }

  const hasFallbackValue =
    typeof fallback === "number" ||
    (typeof fallback === "string" && fallback.trim() !== "");
  const fallbackValue = hasFallbackValue ? Number(fallback) : NaN;
  return Number.isFinite(fallbackValue)
    ? clamp(fallbackValue, 0, 1)
    : DEFAULT_THEME.tabTextOpacity;
}

export function hexToRgb(hexColor) {
  const hex = isHexColor(hexColor)
    ? hexColor.slice(1)
    : MODE_TAB_TEXT_DEFAULTS.light.tabTextColor.slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

export function hexToCssRgb(hexColor, opacity = DEFAULT_THEME.tabTextOpacity) {
  const [red, green, blue] = hexToRgb(hexColor);
  return `rgb(${red} ${green} ${blue} / ${normalizeOpacity(opacity)})`;
}

export function mixHexColors(hexColor, mixColor, mixAmount) {
  const sourceRgb = hexToRgb(hexColor);
  const mixRgb = hexToRgb(mixColor);
  const amount = clamp(mixAmount, 0, 1, 0);
  return rgbToHex(
    sourceRgb[0] * (1 - amount) + mixRgb[0] * amount,
    sourceRgb[1] * (1 - amount) + mixRgb[1] * amount,
    sourceRgb[2] * (1 - amount) + mixRgb[2] * amount,
  );
}

export function blendHexOverHex(foregroundHexColor, backgroundHexColor, foregroundOpacity) {
  const foregroundRgb = hexToRgb(foregroundHexColor);
  const backgroundRgb = hexToRgb(backgroundHexColor);
  const opacity = normalizeOpacity(foregroundOpacity);
  return rgbToHex(
    foregroundRgb[0] * opacity + backgroundRgb[0] * (1 - opacity),
    foregroundRgb[1] * opacity + backgroundRgb[1] * (1 - opacity),
    foregroundRgb[2] * opacity + backgroundRgb[2] * (1 - opacity),
  );
}

export function getContrastingTextColor(
  backgroundHexColor,
  darkTextColor = SESSION_TAB_CONTRAST_TEXT.dark,
  lightTextColor = SESSION_TAB_CONTRAST_TEXT.light,
) {
  const darkContrast = getContrastRatio(backgroundHexColor, darkTextColor);
  const lightContrast = getContrastRatio(backgroundHexColor, lightTextColor);
  return darkContrast >= lightContrast ? darkTextColor : lightTextColor;
}

export function getSessionTabContrastingTextColor(backgroundHexColor) {
  return getRelativeLuminance(backgroundHexColor) > 0.46
    ? SESSION_TAB_CONTRAST_TEXT.dark
    : SESSION_TAB_CONTRAST_TEXT.light;
}

export function getReadableBoundaryColor(
  backgroundHexColor,
  targetHexColor,
  minimumContrast = 3,
) {
  for (let mixAmount = 0.24; mixAmount <= 1; mixAmount += 0.04) {
    const candidateColor = mixHexColors(
      backgroundHexColor,
      targetHexColor,
      mixAmount,
    );

    if (getContrastRatio(candidateColor, backgroundHexColor) >= minimumContrast) {
      return candidateColor;
    }
  }

  return targetHexColor;
}

export function getContrastRatio(firstHexColor, secondHexColor) {
  const firstLuminance = getRelativeLuminance(firstHexColor);
  const secondLuminance = getRelativeLuminance(secondHexColor);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getRelativeLuminance(hexColor) {
  const [red, green, blue] = hexToRgb(hexColor).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function hexToHsv(hexColor) {
  const [red, green, blue] = hexToRgb(hexColor).map((value) => value / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  const saturation = max === 0 ? 0 : delta / max;
  return {
    h: (hue + 360) % 360,
    s: saturation,
    v: max,
  };
}

export function hsvToHex(hue, saturation, value) {
  return `#${hsvToRgb(hue, saturation, value)
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function hsvToRgb(hue, saturation, value) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = value * saturation;
  const huePrime = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = value - chroma;
  return [red, green, blue].map((channel) =>
    Math.round((channel + match) * 255),
  );
}

export function formatColorValues(hexColor, opacity = DEFAULT_THEME.tabTextOpacity) {
  const [red, green, blue] = hexToRgb(hexColor);
  const hsl = rgbToHsl(red, green, blue);
  const lch = rgbToLch(red, green, blue);
  const alphaSuffix = formatColorAlphaSuffix(opacity);

  return [
    {
      label: "HEX",
      value: hexColor.slice(1).toLowerCase(),
    },
    {
      label: "HSL",
      value: `hsl(${Math.round(hsl.h)}deg ${Math.round(hsl.s * 100)}% ${Math.round(hsl.l * 100)}%${alphaSuffix})`,
    },
    {
      label: "RGB",
      value: `rgb(${red} ${green} ${blue}${alphaSuffix})`,
    },
    {
      label: "LCH",
      value: `lch(${Math.round(lch.l)}% ${Math.round(lch.c)} ${Math.round(lch.h)}deg${alphaSuffix})`,
    },
  ];
}

export function formatColorAlphaSuffix(opacity) {
  const normalizedOpacity = normalizeOpacity(opacity);
  if (normalizedOpacity >= 1) {
    return "";
  }

  return ` / ${Math.round(normalizedOpacity * 100)}%`;
}

export async function writeClipboardText(value) {
  const text = String(value ?? "");

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to the legacy copy path below.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export function parseColorValue(label, value) {
  const normalizedLabel = String(label).toUpperCase();
  if (normalizedLabel === "HEX") {
    return parseHexColorValue(value);
  }
  if (normalizedLabel === "HSL") {
    return parseHslColorValue(value);
  }
  if (normalizedLabel === "RGB") {
    return parseRgbColorValue(value);
  }
  if (normalizedLabel === "LCH") {
    return parseLchColorValue(value);
  }

  return null;
}

export function parseHexColorValue(value) {
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) {
    return null;
  }

  return `#${hex.slice(0, 6).toLowerCase()}`;
}

export function parseHslColorValue(value) {
  if (!isCompleteFunctionalColorValue(value, "hsl")) {
    return null;
  }

  const numbers = extractColorNumbers(value);
  if (numbers.length < 3) {
    return null;
  }

  const [hue, saturation, lightness] = numbers;
  const [red, green, blue] = hslToRgb(
    hue,
    clamp(saturation / 100, 0, 1, 0),
    clamp(lightness / 100, 0, 1, 0),
  );

  return rgbToHex(red, green, blue);
}

export function parseRgbColorValue(value) {
  if (!isCompleteFunctionalColorValue(value, "rgb")) {
    return null;
  }

  const numbers = extractColorNumbers(value);
  if (numbers.length < 3) {
    return null;
  }

  const [red, green, blue] = numbers;
  return rgbToHex(
    clamp(Math.round(red), 0, 255, 0),
    clamp(Math.round(green), 0, 255, 0),
    clamp(Math.round(blue), 0, 255, 0),
  );
}

export function parseLchColorValue(value) {
  if (!isCompleteFunctionalColorValue(value, "lch")) {
    return null;
  }

  const numbers = extractColorNumbers(value);
  if (numbers.length < 3) {
    return null;
  }

  const [lightness, chroma, hue] = numbers;
  const [red, green, blue] = lchToRgb(
    clamp(lightness, 0, 100, 0),
    Math.max(0, chroma),
    hue,
  );

  return rgbToHex(red, green, blue);
}

export function isCompleteFunctionalColorValue(value, functionName) {
  const trimmedValue = String(value).trim();
  const lowerValue = trimmedValue.toLowerCase();
  if (!lowerValue.startsWith(`${functionName}(`)) {
    return true;
  }

  return trimmedValue.endsWith(")");
}

export function extractColorNumbers(value) {
  return (String(value).match(/[-+]?\d*\.?\d+/g) || [])
    .map(Number)
    .filter(Number.isFinite);
}

export function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === r) {
    hue = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return { h: hue * 60, s: saturation, l: lightness };
}

export function hslToRgb(hue, saturation, lightness) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = lightness - chroma / 2;
  return [red, green, blue].map((channel) =>
    clamp(Math.round((channel + match) * 255), 0, 255, 0),
  );
}

export function rgbToLch(red, green, blue) {
  const r = srgbToLinear(red / 255);
  const g = srgbToLinear(green / 255);
  const b = srgbToLinear(blue / 255);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const fx = labPivot(x);
  const fy = labPivot(y);
  const fz = labPivot(z);
  const l = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const labB = 200 * (fy - fz);
  const c = Math.sqrt(a * a + labB * labB);
  const h = (Math.atan2(labB, a) * 180) / Math.PI;
  return {
    l: clamp(l, 0, 100, 0),
    c,
    h: (h + 360) % 360,
  };
}

export function lchToRgb(lightness, chroma, hue) {
  const hueRadians = (hue * Math.PI) / 180;
  const a = Math.cos(hueRadians) * chroma;
  const b = Math.sin(hueRadians) * chroma;
  const fy = (lightness + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = inverseLabPivot(fx) * 0.95047;
  const y = inverseLabPivot(fy);
  const z = inverseLabPivot(fz) * 1.08883;

  return [
    linearToSrgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    linearToSrgb(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    linearToSrgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  ];
}

export function srgbToLinear(value) {
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(value) {
  const srgb = value <= 0.0031308
    ? 12.92 * value
    : 1.055 * value ** (1 / 2.4) - 0.055;
  return clamp(Math.round(srgb * 255), 0, 255, 0);
}

export function labPivot(value) {
  return value > 216 / 24389
    ? Math.cbrt(value)
    : (24389 / 27 * value + 16) / 116;
}

export function inverseLabPivot(value) {
  const cubed = value ** 3;
  return cubed > 216 / 24389
    ? cubed
    : (116 * value - 16) / (24389 / 27);
}

export function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((channel) => clamp(Math.round(channel), 0, 255, 0).toString(16).padStart(2, "0"))
    .join("")}`;
}
