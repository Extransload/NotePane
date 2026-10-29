import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  modifierShortcut,
  openStickyActionBar,
  pasteClipboardText,
} from "../support/renderer-helpers.mjs";

// Theme leak detector. Every screen is rendered under two sentinel themes of one scheme whose
// palettes share no value (src/style/sentinelThemes.js). A visible colour that is identical
// under both did not come from the theme: it is a leak, reported as { screen, selector,
// property, value }.
//
// The colour migration is finished, so there is no known-leak list: every leak fails the test.
// A committed tests/e2e/fixtures/theme-leaks-known.json fails every test too, rather than being
// honoured: fix the colour at its source, or, where the spec allows it, add the element to
// ALLOWLIST below with its reason.
//
// Check:      npx playwright test tests/e2e/renderer/theme-leaks.spec.mjs
// Diagnose:   NOTEPANE_WRITE_KNOWN_LEAKS=1 npx playwright test tests/e2e/renderer/theme-leaks.spec.mjs
//             prints each group's leaks to stdout, the list such a file would hold, and passes;
//             it writes no file.
const KNOWN_LEAKS_FILE = path.resolve("tests/e2e/fixtures/theme-leaks-known.json");
const WRITE_KNOWN_LEAKS = process.env.NOTEPANE_WRITE_KNOWN_LEAKS === "1";
const FINISHED =
  "The colour migration is finished: fix the colour at its source or allowlist it with a reason";

const PAIRS = [
  { scheme: "light", themeIds: ["sentinel-light-a", "sentinel-light-b"] },
  { scheme: "dark", themeIds: ["sentinel-dark-a", "sentinel-dark-b"] },
];

// Theme-independent by design, so never reported. Each selector skips the matching elements
// and everything inside them, pseudo-elements included. The spec allowlists what draws over
// images; nothing else under `.color-wheel` is skipped, so its rim, drop shadow and focus ring
// are checked.
const ALLOWLIST = [
  { selector: "img, canvas", reason: "Image pixels; this includes the wordmark PNGs (.brand-wordmark-image)." },
  { selector: ".color-wheel > .color-wheel-canvas", reason: "The hue and saturation disc the wheel picks from." },
  {
    selector: ".color-wheel > .color-wheel-crosshair",
    reason: "The crosshair ring and its ::before/::after bars, drawn over the disc to mark the picked point.",
  },
  {
    selector: ".color-wheel > .color-wheel-thumb",
    reason: "The dot over the disc at the picked point, filled with the picked colour.",
  },
  { selector: ".crop-image-frame", reason: "The crop frame, selection and handles draw over the image." },
  {
    selector: ".theme-card-preview",
    reason: "previews other themes: each picker card's small window is painted in that card's theme. The card around it is still scanned.",
  },
];

const NAMED_COLOURS = ["gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"];
const PREFERENCES_SECTIONS = ["General", "Editor", "Trash", "Shortcuts"];

// The template's image is remote; serve a local one so the note never waits on the network.
const TEMPLATE_IMAGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="360"><rect width="960" height="360" fill="#1f2937"/></svg>';

// Content the template lacks: more heading levels, both list kinds, inline code, a link, text
// and background in every named colour, and equations, one that KaTeX cannot parse.
const MATH_NOTE_HTML = [
  '<p>Area <span data-inline-math="\\pi r^2"></span> and <span data-inline-math="\\frac{"></span></p>',
  '<div data-math-block="\\int_0^1 x^2\\,dx = \\frac{1}{3}"></div>',
];
const EXTRA_NOTE_HTML = [
  "<h2>Second level heading</h2>",
  "<h3>Third level heading</h3>",
  "<ul><li>First bullet</li><li>Second bullet</li></ul>",
  "<ol><li>First step</li><li>Second step</li></ol>",
  '<p>Run <code>npm run verify</code> and read <a href="https://example.com/notes">the guide</a>.</p>',
  `<p>${NAMED_COLOURS.map((colour) => `<span data-style-type="textColor" data-value="${colour}">text${colour}</span>`).join(" ")}</p>`,
  `<p>${NAMED_COLOURS.map((colour) => `<span data-style-type="backgroundColor" data-value="${colour}">bg${colour}</span>`).join(" ")}</p>`,
  ...MATH_NOTE_HTML,
].join("");

const EDITOR_SURFACE = "[data-testid='sticky-editor-surface']";

// Runs in the page, so it must be self-contained.
//   collect:   finds the visible targets in `scope`, keeps them on window, and reads them.
//   read:      reads the kept targets again.
//   selectors: names the kept targets at `indices`.
function colourScan({ phase, scope, indices, allowlist }) {
  const STORE = "__themeLeakTargets";
  const SVG_SHAPES = new Set(["path", "circle", "ellipse", "line", "polyline", "polygon", "rect", "text", "tspan", "use"]);
  const NON_PAINTING = new Set(["head", "meta", "title", "link", "script", "style", "template", "noscript", "br", "wbr"]);
  const SIDES = ["top", "right", "bottom", "left"];
  const STABLE_ATTRIBUTES = ["data-testid", "data-test", "data-content-type", "data-style-type", "data-value", "data-handle", "role"];
  // Mantine's hashed classes (m_77c9d27d), classes built from a React id (__m__-_r_5h_), and
  // classes carrying a generated uuid (placeholder-selector-<uuid>).
  const GENERATED_CLASS = /^m_[0-9a-f]+$|^__m__|_r_[0-9a-z]+_|[:«»]|[0-9a-f]{8}-[0-9a-f]{4}/i;
  const COLOUR = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\((?:[^()]|\([^()]*\))*\)|#[0-9a-f]{3,8}\b|\btransparent\b|\bcurrentcolor\b/i;

  function splitTopLevel(value, separator) {
    const parts = [];
    let depth = 0;
    let current = "";
    for (const char of value) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === separator && depth === 0) {
        if (current.trim()) parts.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  const hasOwnText = (element) =>
    [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  const isTextField = (element) =>
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      !["checkbox", "radio", "range", "color", "file", "hidden", "button", "submit", "reset", "image"].includes(element.type));
  const isEditingHost = (element) => element.isContentEditable && !element.parentElement?.isContentEditable;
  const hasBox = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  };
  // floating-ui's portal container, one per BlockNote popover, is an unstyled wrapper mounted and
  // unmounted with its popover, so it can be there for one reading and gone for the next. It
  // paints nothing itself; what it holds is still scanned.
  const isPortalContainer = (element) => element.hasAttribute("data-floating-ui-portal");

  function boxProperties(style) {
    const properties = ["background-color"];
    for (const side of SIDES) {
      const borderStyle = style.getPropertyValue(`border-${side}-style`);
      if (borderStyle !== "none" && borderStyle !== "hidden" &&
        Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0) {
        properties.push(`border-${side}-color`);
      }
    }
    if (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) {
      properties.push("outline-color");
    }
    if (style.boxShadow !== "none") properties.push("box-shadow");
    return properties;
  }

  function isScrollContainer(element, style) {
    if (style.scrollbarWidth === "none") return false;
    const scrollsY = ["auto", "scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight;
    const scrollsX = ["auto", "scroll"].includes(style.overflowX) && element.scrollWidth > element.clientWidth;
    return scrollsY || scrollsX;
  }

  function elementProperties(element, style) {
    const properties = boxProperties(style);
    const ownText = hasOwnText(element);
    if (ownText || (isTextField(element) && element.value) || element instanceof HTMLSelectElement) {
      properties.push("color");
    }
    if (ownText && style.textDecorationLine !== "none") properties.push("text-decoration-color");
    if (isEditingHost(element) || isTextField(element)) properties.push("caret-color");
    if (element instanceof SVGElement && SVG_SHAPES.has(element.tagName.toLowerCase())) {
      if (style.fill !== "none") properties.push("fill");
      if (style.stroke !== "none" && Number.parseFloat(style.strokeWidth) > 0) properties.push("stroke");
    }
    // The accent paints only the native control; `appearance: none` (the colour panel's
    // sliders) replaces it with styled parts.
    if (element instanceof HTMLInputElement && ["checkbox", "radio", "range"].includes(element.type) &&
      style.appearance !== "none") {
      properties.push("accent-color");
    }
    if (isScrollContainer(element, style)) properties.push("scrollbar-color");
    return properties;
  }

  function pseudoProperties(style) {
    if (["none", "normal"].includes(style.content) || style.display === "none" ||
      style.visibility === "hidden" || style.opacity === "0") {
      return [];
    }
    const properties = boxProperties(style);
    if (!['""', "''"].includes(style.content)) properties.push("color");
    if (style.textDecorationLine !== "none") properties.push("text-decoration-color");
    return properties;
  }

  function isAllowlisted(element) {
    return allowlist.some((entry) => element.closest(entry.selector));
  }

  // A theme change re-highlights code blocks with the new code theme, which splits their text into
  // token spans where that theme's tokens split. ProseMirror replaces some spans and reuses others
  // in place, so a span still in the document may now hold other characters. A target inside a
  // code block's text is therefore always read again by its code element and the offset of its
  // first character there: on whichever element holds that character after the change.
  const CODE_TEXT = ".bn-editor [data-content-type='codeBlock'] code";
  function codeTextNodes(code) {
    const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
    return nodes;
  }
  function codeAnchor(element) {
    const code = element.closest(CODE_TEXT);
    if (!code || code === element) return null;
    let offset = 0;
    for (const node of codeTextNodes(code)) {
      if (element.contains(node)) return { code, offset };
      offset += node.textContent.length;
    }
    return null;
  }
  function elementAtCodeOffset({ code, offset }) {
    let start = 0;
    for (const node of codeTextNodes(code)) {
      start += node.textContent.length;
      if (offset < start) return node.parentElement;
    }
    return null;
  }

  function readTarget(target) {
    const style = getComputedStyle(target.element, target.pseudo);
    const values = {};
    for (const property of target.properties) {
      if (property === "box-shadow") {
        splitTopLevel(style.boxShadow, ",").forEach((shadow, index) => {
          values[`box-shadow[${index}]`] = shadow.match(COLOUR)?.[0] ?? shadow;
        });
      } else if (property === "scrollbar-color") {
        const [thumb, track] = splitTopLevel(style.scrollbarColor, " ");
        if (track) {
          values["scrollbar-color[thumb]"] = thumb;
          values["scrollbar-color[track]"] = track;
        } else {
          values["scrollbar-color"] = thumb;
        }
      } else {
        values[property] = style.getPropertyValue(property);
      }
    }
    return values;
  }

  function part(element) {
    let selector = CSS.escape(element.tagName.toLowerCase());
    for (const className of element.classList) {
      if (!GENERATED_CLASS.test(className)) selector += `.${CSS.escape(className)}`;
    }
    for (const attribute of STABLE_ATTRIBUTES) {
      if (element.hasAttribute(attribute)) {
        selector += `[${attribute}=${JSON.stringify(element.getAttribute(attribute))}]`;
      }
    }
    if (element instanceof HTMLInputElement && element.hasAttribute("type")) {
      selector += `[type=${JSON.stringify(element.getAttribute("type"))}]`;
    }
    return selector;
  }

  function isUnique(selector, element) {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  }

  // The shortest unique path: the element alone, then with one ancestor, then with more,
  // and finally a child path with nth-of-type where same-tag siblings make it ambiguous.
  function selectorFor(element) {
    const own = part(element);
    if (isUnique(own, element)) return own;
    const ancestors = [];
    for (let node = element.parentElement; node && node !== document.documentElement; node = node.parentElement) {
      ancestors.push(node);
    }
    const anchored = ancestors.filter((node) => node.classList.length || node.hasAttribute("data-testid") || node.hasAttribute("role"));
    for (const ancestor of anchored) {
      const selector = `${part(ancestor)} ${own}`;
      if (isUnique(selector, element)) return selector;
    }
    let selector = own;
    for (const ancestor of anchored) {
      selector = `${part(ancestor)} ${selector}`;
      if (isUnique(selector, element)) return selector;
    }
    selector = "";
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      const sameTag = [...(node.parentElement?.children ?? [node])].filter((sibling) => sibling.tagName === node.tagName);
      const segment = part(node) + (sameTag.length > 1 ? `:nth-of-type(${sameTag.indexOf(node) + 1})` : "");
      selector = selector ? `${segment} > ${selector}` : segment;
      if (isUnique(selector, element)) return selector;
    }
    return `html > ${selector}`;
  }

  if (phase === "collect") {
    const roots = scope.include.flatMap((selector) => [...document.querySelectorAll(selector)]);
    const elements = new Set();
    for (const root of roots) {
      elements.add(root);
      for (const element of root.querySelectorAll("*")) elements.add(element);
    }
    const excluded = (element) => scope.exclude.some((selector) => element.closest(selector));
    const ordered = [...elements].sort((first, second) =>
      first === second ? 0 : first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const targets = [];
    for (const element of ordered) {
      if (
        NON_PAINTING.has(element.tagName.toLowerCase()) || isAllowlisted(element) || excluded(element) ||
        isPortalContainer(element)
      ) continue;
      if (!element.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || !hasBox(element)) continue;
      targets.push({
        element,
        pseudo: null,
        properties: elementProperties(element, getComputedStyle(element)),
        codeAnchor: codeAnchor(element),
      });
      for (const pseudo of ["::before", "::after"]) {
        const properties = pseudoProperties(getComputedStyle(element, pseudo));
        if (properties.length) targets.push({ element, pseudo, properties });
      }
      if (isTextField(element) && element.placeholder && !element.value) {
        targets.push({ element, pseudo: "::placeholder", properties: ["color"] });
      }
    }
    window[STORE] = targets;
    return {
      roots: roots.length,
      // A short ancestor path, to name a target that disappears before the second reading.
      labels: targets.map((target) => {
        const parts = [];
        for (let node = target.element; node && parts.length < 4; node = node.parentElement) parts.unshift(part(node));
        return parts.join(" > ") + (target.pseudo ?? "");
      }),
      readings: targets.map(readTarget),
    };
  }
  if (phase === "read") {
    return {
      readings: window[STORE].map((target) => {
        if (target.codeAnchor?.code.isConnected) {
          target.element = elementAtCodeOffset(target.codeAnchor) ?? target.element;
        }
        return target.element.isConnected ? readTarget(target) : null;
      }),
    };
  }
  return indices.map((index) => {
    const target = window[STORE][index];
    return selectorFor(target.element) + (target.pseudo ?? "");
  });
}

// The alpha of a computed colour, or null when the value is not a colour.
function colourAlpha(value) {
  const colour = value.trim().toLowerCase();
  if (colour === "transparent") return 0;
  const rgba = colour.match(/^rgba\(([^)]*)\)$/);
  if (rgba) {
    const channels = rgba[1].split(",");
    return channels.length === 4 ? Number(channels[3]) : 1;
  }
  const slashAlpha = colour.match(/\/\s*([\d.]+)(%?)\s*\)$/);
  if (slashAlpha) return Number(slashAlpha[1]) / (slashAlpha[2] ? 100 : 1);
  if (/^(?:rgb|hsla?|hwb|lab|lch|oklab|oklch|color)\(/.test(colour)) return 1;
  return null;
}

// `auto` (a native scrollbar, caret or checkbox colour) is visible and never comes from the theme.
function isVisibleColour(value) {
  const alpha = colourAlpha(value);
  return alpha === null ? ["auto", "currentcolor"].includes(value.trim().toLowerCase()) : alpha > 0;
}

// Finite entrance animations, hover transitions and the theme transition must have finished
// before a value is read. A second pass after two frames catches transitions started by a
// render that the first one triggered.
async function settleAnimations(page) {
  await page.evaluate(async () => {
    const settle = () =>
      Promise.all(
        document
          .getAnimations()
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      );
    await settle();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await settle();
  });
}

// Through `window.__notepaneTest`, which calls the same `updateAppTheme` as the picker.
async function applySentinel(page, themeId) {
  await page.evaluate((id) => window.__notepaneTest.setThemeId(id), themeId);
  await expect(page.locator("html")).toHaveAttribute("data-theme-id", themeId);
  await settleAnimations(page);
}

function compareLeakKeys(first, second) {
  for (const key of ["screen", "selector", "property", "value"]) {
    if (first[key] < second[key]) return -1;
    if (first[key] > second[key]) return 1;
  }
  return 0;
}

// One reading per screen, element and property; a run never reports it twice.
const placeKey = (leak) => `${leak.screen} | ${leak.selector} | ${leak.property}`;
const leakKey = (leak) => `${placeKey(leak)} = ${leak.value}`;

function expectNoKnownLeakList() {
  expect(fs.existsSync(KNOWN_LEAKS_FILE), `${path.relative(process.cwd(), KNOWN_LEAKS_FILE)} exists. ${FINISHED}.`)
    .toBe(false);
}

// A screen run under one pair. It reads every target under the current sentinel, switches to
// the other one and reads again, and records the values that did not change.
function createScanner(page, pair) {
  const state = { themeId: pair.themeIds[0], leaks: [], screens: [] };
  // `scrollbars` asserts that the screen has a visible scrollbar the scan read.
  const scan = async (screen, { include, exclude = [], scrollbars = false }) => {
    const screenName = `${pair.scheme} / ${screen}`;
    // The first reading must be under the sentinel the scanner believes is applied, so the
    // comparison is provably one sentinel against the other.
    await expect(page.locator("html"), `${screenName} starts under ${state.themeId}`)
      .toHaveAttribute("data-theme-id", state.themeId);
    // Playwright counts an element under an opacity: 0 fade wrapper as visible; the scan
    // does not, so wait until a match is visible by both measures.
    for (const selector of include) {
      await expect(page.locator(selector).first(), `${screenName} is visible`).toBeVisible();
      await expect.poll(
        () => page.evaluate((target) => [...document.querySelectorAll(target)].some((element) =>
          element.checkVisibility({ opacityProperty: true, visibilityProperty: true })), selector),
        { message: `${screenName}: ${selector} is not faded out` },
      ).toBe(true);
    }
    await settleAnimations(page);
    const first = await page.evaluate(colourScan, {
      phase: "collect",
      scope: { include, exclude },
      allowlist: ALLOWLIST,
    });
    expect(first.readings.length, `${screenName} has targets in ${first.roots} roots`).toBeGreaterThan(0);
    if (scrollbars) {
      const scrollbarReadings = first.readings.filter((reading) =>
        Object.keys(reading).some((property) => property.startsWith("scrollbar-color")));
      expect(scrollbarReadings.length, `${screenName} shows a scrollbar`).toBeGreaterThan(0);
    }
    const nextThemeId = pair.themeIds.find((themeId) => themeId !== state.themeId);
    await applySentinel(page, nextThemeId);
    state.themeId = nextThemeId;
    const second = await page.evaluate(colourScan, { phase: "read", allowlist: ALLOWLIST });
    const vanished = first.labels.filter((label, index) => second.readings[index] === null);
    expect(vanished, `${screenName}: targets removed while the theme changed`).toEqual([]);

    const found = [];
    first.readings.forEach((reading, index) => {
      for (const [property, value] of Object.entries(reading)) {
        if (value === second.readings[index][property] && isVisibleColour(value)) {
          found.push({ index, property, value });
        }
      }
    });
    const indices = [...new Set(found.map((leak) => leak.index))];
    const selectors = indices.length
      ? await page.evaluate(colourScan, { phase: "selectors", indices, allowlist: ALLOWLIST })
      : [];
    const selectorByIndex = new Map(indices.map((index, position) => [index, selectors[position]]));
    for (const leak of found) {
      state.leaks.push({
        screen: screenName,
        selector: selectorByIndex.get(leak.index),
        property: leak.property,
        value: leak.value,
      });
    }
    state.screens.push(screenName);
  };
  return { scan, state };
}

function settleRatchet(pair, group, state) {
  const screens = group.screens.map((screen) => `${pair.scheme} / ${screen}`);
  expect(state.screens, `${pair.scheme} / ${group.name}: every screen was scanned once`).toEqual(screens);

  const unique = new Map();
  for (const leak of state.leaks) unique.set(placeKey(leak), leak);
  const leaks = [...unique.values()].sort(compareLeakKeys);
  expectNoKnownLeakList();

  if (WRITE_KNOWN_LEAKS) {
    console.log(`theme leaks, ${pair.scheme} / ${group.name}:\n${JSON.stringify(leaks, null, 2)}`);
    return;
  }

  expect(leaks.map(leakKey), `every colour comes from the theme. ${FINISHED}.`).toEqual([]);
}

async function serveTemplateImage(page) {
  await page.route("https://placehold.co/**", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "image/svg+xml", "access-control-allow-origin": "*" },
      body: TEMPLATE_IMAGE_SVG,
    }));
}

// The template note, committed so it is a normal editable session, plus EXTRA_NOTE_HTML, and
// a second, blank session after it. The browser preview keeps no edits across a session
// switch, so the second session is created before the note is extended.
async function openTemplateNote(page, pair) {
  await serveTemplateImage(page);
  await page.goto("/?sentinelThemes=1&template=1");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  await applySentinel(page, pair.themeIds[0]);
  await page.getByRole("button", { name: "Use this template" }).click();
  await expect(page.getByRole("button", { name: "Use this template" })).toHaveCount(0);
  await page.getByRole("button", { name: "New session" }).click();
  await expect(page.locator(".session-tab-row")).toHaveCount(2);
  await page.locator(".session-tab-row").first().click();
  await expect(page.locator(".session-tab-row").first()).toHaveClass(/\bactive\b/);
  await expect(page.locator(".session-tab-row.is-entering")).toHaveCount(0);
  await expect(page.locator(".bn-editor img.bn-visual-media")).toBeVisible();
  await clickLastEmptyParagraph(page);
  await pasteClipboardText(page, { plainText: "", html: EXTRA_NOTE_HTML });
  for (const colour of NAMED_COLOURS) {
    await expect(page.locator(`.bn-editor [data-style-type='textColor'][data-value='${colour}']`)).toHaveText(`text${colour}`);
    await expect(page.locator(`.bn-editor [data-style-type='backgroundColor'][data-value='${colour}']`)).toHaveText(`bg${colour}`);
  }
  await expect(page.locator(".bn-editor a[href='https://example.com/notes']")).toBeVisible();
  await expect(page.locator(".bn-editor [data-testid='math-block'] .katex")).toBeVisible();
  await expect(page.locator(".bn-editor [data-testid='inline-math'] .katex-error")).toBeVisible();
  // The paste replaced the trailing empty paragraph; put one back after it.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("paragraph").filter({ hasText: /^$/ })).toHaveCount(1);
}

// Parks the pointer on the header drag strip, where hovering shows nothing, and waits for the
// block side menu that the last hover opened to close. In the sticky layout the editor scrolls
// under the header, and the side menu follows a block hidden there, so the editor is scrolled
// to the top first.
async function parkPointer(page) {
  await page.getByTestId("sticky-editor-surface").evaluate((surface) => {
    surface.scrollTop = 0;
  });
  const strip = await page.locator(".sticky-drag-strip").boundingBox();
  await page.mouse.move(strip.x + 8, strip.y + strip.height / 2);
  await expect(page.locator(".bn-side-menu")).toHaveCount(0);
}

const editorWord = (page, word) => page.locator(".bn-editor").getByText(word, { exact: true });

// BlockNote hides its table handles on scroll. A hover that has to scroll first can be undone
// by the scroll event that arrives a frame later, so scroll, let two frames pass, then hover.
async function hoverAfterScrolling(locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.page().evaluate(() =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await locator.hover();
}

async function selectWord(page, word) {
  await editorWord(page, word).evaluate((element) => {
    element.closest("[contenteditable]")?.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await expect(page.locator(".bn-formatting-toolbar")).toBeVisible();
}

const SCREEN_GROUPS = [
  {
    name: "tabs window and note",
    screens: ["tabs window", "note", "session tab menu", "session colour panel"],
    async run(page, scan) {
      await parkPointer(page);
      await scan("tabs window", { include: ["html"], exclude: [EDITOR_SURFACE] });

      // A two-cell selection in the table.
      await page.getByRole("cell", { name: "Tabs", exact: true }).click();
      await page.keyboard.press("Escape");
      await page.getByRole("cell", { name: "Drafting, comparing, and organizing sessions" }).click({ modifiers: ["Shift"] });
      await expect(page.locator(".bn-editor .selectedCell")).toHaveCount(2);
      await parkPointer(page);
      await scan("note", { include: [EDITOR_SURFACE] });

      await page.keyboard.press("Escape");
      await page.locator(".session-tab-row").first().click({ button: "right" });
      const tabMenu = page.locator(".session-tab-context-menu");
      await expect(tabMenu).toBeVisible();
      await scan("session tab menu", { include: [".session-tab-context-menu"] });
      await tabMenu.getByRole("menuitem", { name: "Color..." }).click();
      await expect(page.locator(".color-panel")).toBeVisible();
      // Focused, so the wheel's focus ring is part of the scan.
      const wheel = page.locator(".color-panel .color-wheel");
      await wheel.focus();
      await expect(wheel).toBeFocused();
      await expect.poll(() => wheel.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
      await scan("session colour panel", { include: [".color-panel"] });
      await expect(wheel, "the wheel kept focus through both readings").toBeFocused();
    },
  },
  {
    name: "editor menus",
    screens: [
      "empty block placeholder",
      "slash menu",
      "emoji picker",
      "link toolbar",
      "formatting toolbar",
      "colour menu",
      "table handles",
      "table handle menu",
      "side menu",
      "drag handle menu",
    ],
    async run(page, scan) {
      await clickLastEmptyParagraph(page);
      await parkPointer(page);
      await scan("empty block placeholder", { include: [".bn-editor [data-is-empty-and-focused]"] });
      await clickLastEmptyParagraph(page);
      await page.keyboard.type("/");
      await expect(page.locator(".bn-suggestion-menu")).toBeVisible();
      await scan("slash menu", { include: [".bn-suggestion-menu"], scrollbars: true });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Backspace");
      await page.keyboard.type(":smi");
      await expect(page.locator(".bn-grid-suggestion-menu-item").first()).toBeVisible();
      await scan("emoji picker", { include: [".bn-grid-suggestion-menu"] });
      await page.keyboard.press("Escape");
      for (let index = 0; index < 4; index += 1) await page.keyboard.press("Backspace");
      await expect(page.getByRole("paragraph").filter({ hasText: /^$/ })).toHaveCount(1);

      await hoverAfterScrolling(page.locator(".bn-editor a[href='https://example.com/notes']"));
      await expect(page.locator(".bn-link-toolbar")).toBeVisible();
      await scan("link toolbar", { include: [".bn-link-toolbar"] });

      await selectWord(page, "First bullet");
      await scan("formatting toolbar", { include: [".bn-formatting-toolbar"] });
      await page.locator(".bn-formatting-toolbar").getByRole("button", { name: "Colors" }).click();
      await expect(page.locator(".bn-color-picker-dropdown")).toBeVisible();
      await scan("colour menu", { include: [".bn-color-picker-dropdown"] });
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(page.locator(".bn-formatting-toolbar")).toHaveCount(0);

      // The last cell shows the row and column handles and both extend buttons.
      await hoverAfterScrolling(page.getByRole("cell", { name: "Export PDF" }).last());
      await expect(page.locator(".bn-table-handle").first()).toBeVisible();
      await expect(page.locator(".bn-extend-button")).toHaveCount(2);
      await scan("table handles", { include: [".bn-table-handle", ".bn-extend-button"] });
      await page.locator(".bn-table-handle").first().click();
      await expect(page.locator(".bn-table-handle-menu")).toBeVisible();
      await scan("table handle menu", { include: [".bn-table-handle-menu"] });
      await page.keyboard.press("Escape");
      await expect(page.locator(".bn-table-handle-menu")).toHaveCount(0);

      await hoverAfterScrolling(editorWord(page, "Second bullet"));
      await expect(page.locator(".bn-side-menu")).toBeVisible();
      await scan("side menu", { include: [".bn-side-menu"] });
      await page.locator(".bn-side-menu [draggable='true']").click();
      await expect(page.locator(".bn-drag-handle-menu")).toBeVisible();
      await scan("drag handle menu", { include: [".bn-drag-handle-menu"] });
    },
  },
  {
    name: "tooltips and code block tools",
    screens: ["formatting toolbar tooltip", "code block language select", "code block tool bar"],
    async run(page, scan) {
      // BlockNote's toolbar buttons show a Mantine tooltip while hovered.
      await selectWord(page, "First bullet");
      await page.locator(".bn-formatting-toolbar").getByRole("button", { name: "Bold", exact: true }).hover();
      await expect(page.locator(".mantine-Tooltip-tooltip .bn-tooltip")).toBeVisible();
      await scan("formatting toolbar tooltip", { include: [".mantine-Tooltip-tooltip"] });
      await page.keyboard.press("Escape");
      await expect(page.locator(".bn-formatting-toolbar")).toHaveCount(0);

      // BlockNote fades the language select in while the code block is hovered.
      const codeBlock = page.locator(".bn-editor [data-content-type='codeBlock']");
      const languageSelect = ".bn-editor [data-content-type='codeBlock'] > div > select";
      await hoverAfterScrolling(codeBlock);
      await scan("code block language select", { include: [languageSelect] });

      // The tool bar sits outside the code block, so hovering it hides the select again; the
      // note screen reads the tool bar at rest, this one its hover colours.
      const toolBar = page.getByRole("toolbar", { name: /code block actions$/ });
      const copyButton = toolBar.getByRole("button", { name: /^Copy .+ code$/ });
      await copyButton.hover();
      await expect.poll(() => copyButton.evaluate((button) => button.matches(":hover"))).toBe(true);
      await scan("code block tool bar", { include: [".code-block-tools"] });
    },
  },
  {
    name: "find and search",
    screens: ["find bar", "search palette"],
    async run(page, scan) {
      await clickLastEmptyParagraph(page);
      await page.keyboard.press(modifierShortcut("F"));
      const findBar = page.getByRole("search", { name: "Find in note" });
      await findBar.getByRole("textbox", { name: "Find in note" }).fill("session");
      await expect(findBar).toContainText("1 /");
      await expect(page.locator(".bn-editor .notepane-find-match.is-current")).toHaveCount(1);
      await parkPointer(page);
      await scan("find bar", { include: [".find-bar", ".bn-editor .notepane-find-match"] });
      await page.keyboard.press("Escape");
      await expect(findBar).toHaveCount(0);

      await page.keyboard.press(modifierShortcut("P"));
      const palette = page.getByRole("dialog", { name: "Search notes" });
      await palette.getByRole("textbox", { name: "Search notes" }).fill("session");
      await expect(palette.getByRole("option").first()).toBeVisible();
      await scan("search palette", { include: [".search-palette-backdrop"] });
    },
  },
  {
    name: "preferences and trash",
    screens: [
      "session trash confirmation",
      "toast with action",
      ...PREFERENCES_SECTIONS.map((section) => `preferences: ${section}`),
    ],
    async run(page, scan) {
      await page.locator(".session-tab-row").nth(1).hover();
      await page.locator(".session-delete-button").nth(1).click();
      const confirm = page.getByRole("dialog", { name: "Move session to trash confirmation" });
      await expect(confirm).toBeVisible();
      await scan("session trash confirmation", { include: [".trash-confirm-backdrop"] });
      await confirm.getByRole("button", { name: /Yes, move .* to trash/ }).click();
      await expect(confirm).toHaveCount(0);
      const toast = page.locator(".sticky-toast").filter({ hasText: "moved to Trash." });
      await expect(toast).toBeVisible();
      await parkPointer(page);
      await scan("toast with action", { include: [".sticky-toast"] });

      await page.keyboard.press(modifierShortcut(","));
      const preferences = page.getByRole("dialog", { name: "Preferences window" });
      await expect(preferences).toBeVisible();
      await expect(preferences.getByRole("tab")).toHaveText(PREFERENCES_SECTIONS);
      for (const section of PREFERENCES_SECTIONS) {
        await preferences.getByRole("tab", { name: section }).click();
        await expect(preferences.getByRole("tab", { name: section })).toHaveAttribute("aria-selected", "true");
        await parkPointer(page);
        // A sentinel is never a picker card, so no card is checked; one has focus, so the focus
        // ring is part of the scan.
        const themeCard = preferences.getByTestId("theme-card-notepane-light");
        if (section === "General") {
          await themeCard.focus();
          await expect.poll(() => themeCard.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
        }
        await scan(`preferences: ${section}`, {
          include: [".preferences-backdrop"],
          scrollbars: section === "Shortcuts",
        });
        if (section === "General") {
          await expect(themeCard, "the theme card kept focus through both readings").toBeFocused();
        }
      }
    },
  },
  {
    name: "crop dialog, export menu and toasts",
    screens: ["image toolbar", "crop dialog", "export menu", "error toast", "success toast"],
    async run(page, scan) {
      await page.locator(".bn-editor img.bn-visual-media").click();
      const imageTools = page.locator(".notepane-formatting-toolbar:visible");
      await expect(imageTools.getByRole("button", { name: "Crop image" })).toBeVisible();
      await scan("image toolbar", { include: [".notepane-formatting-toolbar"] });
      await imageTools.getByRole("button", { name: "Crop image" }).click();
      const cropDialog = page.getByRole("dialog", { name: "Crop image" });
      await expect(cropDialog).toBeVisible();
      await parkPointer(page);
      await scan("crop dialog", { include: [".crop-dialog"] });
      await cropDialog.getByRole("button", { name: "Cancel" }).click();
      await expect(cropDialog).toHaveCount(0);

      await page.getByTestId("session-sidebar-footer").getByRole("button", { name: "Export" }).click();
      const exportMenu = page.getByRole("menu", { name: "Export format" });
      await expect(exportMenu).toBeVisible();
      await scan("export menu", { include: [".export-format-menu"] });
      await exportMenu.getByRole("menuitem").first().click();
      const errorToast = page.locator(".sticky-toast-error");
      await expect(errorToast).toBeVisible();
      await scan("error toast", { include: [".sticky-toast"] });

      // The save toast replaces the error toast.
      await clickLastEmptyParagraph(page);
      await page.keyboard.press(modifierShortcut("S"));
      await expect(page.locator(".sticky-toast-success")).toBeVisible();
      await expect(errorToast).toHaveCount(0);
      await parkPointer(page);
      await scan("success toast", { include: [".sticky-toast"] });
    },
  },
  {
    name: "markdown import dialog",
    screens: ["markdown import dialog", "markdown import error"],
    async run(page, scan) {
      await clickLastEmptyParagraph(page);
      await page.keyboard.type("/import");
      await page.locator(".bn-suggestion-menu").getByText("Import Markdown", { exact: true }).click();
      const importDialog = page.getByRole("dialog", { name: "Import Markdown" });
      await expect(importDialog).toBeVisible();
      await parkPointer(page);
      await scan("markdown import dialog", { include: [".markdown-import-backdrop"] });

      // A drop without a file shows the error; a drag entering the drop zone highlights it, as
      // a file dragged over it would.
      const dropzone = importDialog.locator(".markdown-import-dropzone");
      await dropzone.evaluate((element) => {
        element.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: new DataTransfer() }));
      });
      await expect(importDialog.getByRole("alert")).toHaveText("Drop or choose a Markdown file.");
      await dropzone.evaluate((element) => {
        element.dispatchEvent(new DragEvent("dragenter", { bubbles: true, dataTransfer: new DataTransfer() }));
      });
      await expect(dropzone).toHaveClass(/\bis-dragging\b/);
      await scan("markdown import error", { include: [".markdown-import-backdrop"] });
    },
  },
  {
    name: "sticky window",
    screens: ["sticky window", "sticky actions", "sticky settings"],
    async run(page, scan) {
      await page.getByTestId("session-sidebar-footer")
        .getByRole("button", { name: "Switch to Sticky windows mode" })
        .click();
      await expect(page.getByTestId("sticky-shell")).toHaveAttribute("data-layout-mode", "sticky");
      await parkPointer(page);
      await scan("sticky window", { include: ["html"] });
      await openStickyActionBar(page);
      await parkPointer(page);
      await scan("sticky actions", { include: ["[data-testid='sticky-header']"] });
      await page.getByRole("button", { name: "Sticky settings" }).click();
      await expect(page.getByRole("dialog", { name: "Sticky settings window" })).toBeVisible();
      await parkPointer(page);
      await scan("sticky settings", { include: [".sticky-settings-backdrop"] });
    },
  },
];

// The version history panel lists versions only when the main process provides them, so this
// screen runs against a stub of the preload bridge with one note and two saved versions.
const HISTORY_GROUP = {
  name: "version history",
  screens: ["version history"],
};

for (const pair of PAIRS) {
  for (const group of SCREEN_GROUPS) {
    test(`${pair.scheme} sentinels: ${group.name} take every colour from the theme`, async ({ page }) => {
      await openTemplateNote(page, pair);
      const { scan, state } = createScanner(page, pair);
      await group.run(page, scan);
      settleRatchet(pair, group, state);
    });
  }

  test(`${pair.scheme} sentinels: ${HISTORY_GROUP.name} takes every colour from the theme`, async ({ page }) => {
    await page.addInitScript(stubPreloadBridge);
    await page.goto("/?sentinelThemes=1");
    await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
    await applySentinel(page, pair.themeIds[0]);
    await expect(editorWord(page, "Current wording")).toBeVisible();
    await page.getByTestId("session-sidebar-footer").getByRole("button", { name: "Version history" }).click();
    const history = page.getByRole("dialog", { name: "Version history" });
    await expect(history).toBeVisible();
    await expect(history.locator(".version-history-item")).toHaveCount(2);
    await expect(history.getByText("Earlier wording", { exact: true })).toBeVisible();
    await parkPointer(page);
    const { scan, state } = createScanner(page, pair);
    await scan("version history", { include: [".version-history-backdrop"] });
    settleRatchet(pair, HISTORY_GROUP, state);
  });
}

test("no known leak list is committed", () => {
  expectNoKnownLeakList();
});

// Runs in the page before the app loads. A minimal preload bridge: one note, no trash, and two
// saved versions of it.
function stubPreloadBridge() {
  const paragraph = (text) => ({ type: "paragraph", content: [{ type: "text", text, styles: {} }] });
  const blocksJSON = (text) => JSON.stringify([{ type: "heading", content: "History note" }, paragraph(text)]);
  const now = Date.UTC(2026, 9, 20, 9, 0, 0);
  const note = {
    id: "history-note",
    title: "History note",
    titleManuallyEdited: false,
    blocksJSON: blocksJSON("Current wording"),
    markdown: "",
    theme: {},
    seedDemoContent: false,
    editorFontFamily: "Inter",
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const versions = [
    { id: "version-2", noteId: note.id, title: note.title, blocksJSON: blocksJSON("Earlier wording"), source: "auto", createdAt: now - 60_000 },
    { id: "version-1", noteId: note.id, title: note.title, blocksJSON: blocksJSON("First wording"), source: "manual", createdAt: now - 120_000 },
  ];
  window.blocknoteSticky = {
    getCurrentNoteId: async () => note.id,
    getNote: async () => note,
    listNotes: async () => [note],
    listTrash: async () => [],
    getAppTheme: async () => ({ mode: "light" }),
    getLayoutMode: async () => "tabs",
    getEditorPreferences: async () => ({}),
    listFonts: async () => [],
    saveContent: async () => note,
    updateAppearance: async () => undefined,
    listNoteVersions: async () => versions,
  };
}
