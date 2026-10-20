import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  modifierShortcut,
  selectAppTheme,
} from "../support/renderer-helpers.mjs";

// Computed colours of elements whose colour already comes from NotePane tokens, in
// NotePane Light and Dark. Elements the spec lists under "Allowed visible changes in
// NotePane Light and Dark" (slash menu, link toolbar, side menu icons, emoji grid, toggle
// controls, placeholders, blockquote and divider, selection, caret, focus rings,
// checkbox accent, drop cursor) are deliberately not targets.
//
// Capture:  NOTEPANE_CAPTURE_BASELINE=1 npx playwright test tests/e2e/renderer/theme-baseline.spec.mjs
// Compare:  npx playwright test tests/e2e/renderer/theme-baseline.spec.mjs
const BASELINE_FILE = path.resolve("tests/e2e/fixtures/notepane-computed-baseline.json");
const CAPTURE = process.env.NOTEPANE_CAPTURE_BASELINE === "1";
const THEMES = ["notepane-light", "notepane-dark"];
const PROPERTIES = ["color", "backgroundColor", "borderTopColor", "boxShadow"];
const NAMED_COLORS = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];

const editorSurface =(page) => page.getByTestId("sticky-editor-surface");
const formattingToolbar = (page) => page.locator(".bn-formatting-toolbar");
const preferencesDialog = (page) => page.getByRole("dialog", { name: "Preferences window" });
const styledWord = (page, styleType, color, word) =>
  page
    .locator(`.bn-editor [data-style-type='${styleType}'][data-value='${color}']`)
    .filter({ hasText: new RegExp(`^${word}$`) });

const editorWord = (page, word) => page.locator(".bn-editor").getByText(word, { exact: true });

// Selects exactly one word through the DOM selection, which ProseMirror adopts. A
// double click can spill into the neighbouring paragraph while a menu is animating.
async function selectWord(page, word) {
  await editorWord(page, word).evaluate((element) => {
    element.closest("[contenteditable]")?.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await expect(formattingToolbar(page)).toBeVisible();
}

async function applyColor(page, word, kind, color) {
  const styleType = kind === "text" ? "textColor" : "backgroundColor";
  await selectWord(page, word);
  await formattingToolbar(page).getByRole("button", { name: "Colors" }).click();
  await page.locator(`.bn-color-picker-dropdown:visible [data-test='${kind}-color-${color}']`)
    .click();
  await expect(styledWord(page, styleType, color, word)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(formattingToolbar(page)).toBeHidden();
}

// Builds the document once, in NotePane Light; the same content is read back in Dark.
async function buildBaselineDocument(page) {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("# Baseline heading");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Baseline paragraph");
  await page.keyboard.press("Enter");
  await page.keyboard.type("BaselineCode");
  await page.keyboard.press("Enter");
  for (const color of NAMED_COLORS) {
    await page.keyboard.type(`text${color}`);
    await page.keyboard.press("Enter");
    await page.keyboard.type(`bg${color}`);
    await page.keyboard.press("Enter");
  }
  await page.keyboard.type("/table");
  // Enter only once the filtered menu shows the single matching item.
  await expect(page.getByText("Table with editable cells")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("table").first()).toBeVisible();
  await page.keyboard.press("Escape");

  await selectWord(page, "BaselineCode");
  await page.keyboard.press(modifierShortcut("E"));
  await page.keyboard.press("Escape");
  for (const color of NAMED_COLORS) {
    await applyColor(page, `text${color}`, "text", color);
    await applyColor(page, `bg${color}`, "background", color);
  }
}

const BASELINE_TARGETS = [
  { name: "session sidebar", locator: (page) => page.getByTestId("session-sidebar") },
  {
    name: "active session tab",
    locator: (page) => page.locator(".session-tab-row.active"),
  },
  { name: "sticky header", locator: (page) => page.getByTestId("sticky-header") },
  { name: "editor surface text", locator: editorSurface },
  {
    name: "heading",
    locator: (page) => page.locator(".bn-editor [data-content-type='heading']").first(),
  },
  { name: "inline code", locator: (page) => page.locator(".bn-editor code").first() },
  ...NAMED_COLORS.flatMap((color) => [
    {
      name: `text colour ${color}`,
      locator: (page) => styledWord(page, "textColor", color, `text${color}`),
    },
    {
      name: `background colour ${color}`,
      locator: (page) => styledWord(page, "backgroundColor", color, `bg${color}`),
    },
  ]),
  { name: "table border", locator: (page) => page.locator(".bn-editor table td, .bn-editor table th").first() },
  {
    name: "find bar",
    locator: (page) => page.getByRole("search", { name: "Find in note" }),
    setup: async (page) => {
      await page.keyboard.press(modifierShortcut("F"));
      await expect(page.getByRole("search", { name: "Find in note" })).toBeVisible();
    },
    teardown: async (page) => {
      await page.keyboard.press("Escape");
      await expect(page.getByRole("search", { name: "Find in note" })).toHaveCount(0);
    },
  },
  {
    name: "toast",
    locator: (page) => page.locator(".sticky-toast"),
    setup: async (page) => {
      await page.keyboard.press(modifierShortcut("S"));
      await expect(page.locator(".sticky-toast")).toBeVisible();
    },
    teardown: async (page) => {
      await expect(page.locator(".sticky-toast")).toHaveCount(0, { timeout: 15_000 });
    },
  },
  {
    name: "formatting toolbar",
    locator: formattingToolbar,
    setup: async (page) => {
      await page.getByText("Baseline paragraph", { exact: true }).dblclick();
      await expect(formattingToolbar(page)).toBeVisible();
    },
    teardown: async (page) => {
      await page.keyboard.press("Escape");
      await clickLastEmptyParagraph(page);
    },
  },
  {
    name: "preferences dialog surface",
    locator: preferencesDialog,
    setup: async (page) => {
      await page.keyboard.press(modifierShortcut(","));
      await expect(preferencesDialog(page)).toBeVisible();
    },
    teardown: async (page) => {
      await page.getByRole("button", { name: "Close preferences" }).click();
      await expect(preferencesDialog(page)).toHaveCount(0);
      await clickLastEmptyParagraph(page);
    },
  },
  {
    name: "preferences section title",
    locator: (page) => preferencesDialog(page).locator(".preferences-section-title").first(),
    setup: async (page) => {
      await page.keyboard.press(modifierShortcut(","));
      await expect(preferencesDialog(page)).toBeVisible();
    },
    teardown: async (page) => {
      await page.getByRole("button", { name: "Close preferences" }).click();
      await expect(preferencesDialog(page)).toHaveCount(0);
      await clickLastEmptyParagraph(page);
    },
  },
];

// Entrance animations and the theme transition must have finished before a value is read.
async function settleAnimations(page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
}

async function readColors(locator) {
  await settleAnimations(locator.page());
  return await locator.first().evaluate((element, properties) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(properties.map((property) => [property, style[property]]));
  }, PROPERTIES);
}

// One test per theme, so a failure names the theme. Capture mode merges the theme's entries
// into the fixture and keeps the THEMES order.
for (const themeId of THEMES) {
  test(`keeps ${themeId} computed colours unchanged`, async ({ page }) => {
    await page.goto("/");
    await expect(editorSurface(page)).toBeVisible();
    await selectAppTheme(page, "notepane-light");
    await buildBaselineDocument(page);
    await clickLastEmptyParagraph(page);
    await selectAppTheme(page, themeId);

    const captured = {};
    for (const target of BASELINE_TARGETS) {
      await target.setup?.(page);
      await expect(target.locator(page).first(), `${themeId} / ${target.name} is visible`)
        .toBeVisible();
      captured[target.name] = await readColors(target.locator(page));
      await target.teardown?.(page);
    }

    const existing = fs.existsSync(BASELINE_FILE)
      ? JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"))
      : {};

    if (CAPTURE) {
      const merged = {};
      for (const id of THEMES) {
        const entries = id === themeId ? captured : existing[id];
        if (entries) merged[id] = entries;
      }
      fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
      fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(merged, null, 2)}\n`);
      return;
    }

    for (const target of BASELINE_TARGETS) {
      const expected = existing[themeId]?.[target.name];
      expect(expected, `${themeId} / ${target.name} is missing from the baseline`).toBeDefined();
      for (const property of PROPERTIES) {
        expect(captured[target.name][property], `${themeId} / ${target.name} / ${property}`)
          .toBe(expected[property]);
      }
    }
  });
}
