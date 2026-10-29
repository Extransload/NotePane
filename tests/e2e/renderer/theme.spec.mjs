import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  modifierShortcut,
} from "../support/renderer-helpers.mjs";

// The theme picker in Preferences > General, and the light/dark switch and shortcut it replaces.
const THEMES = JSON.parse(fs.readFileSync(path.resolve("electron/themes.json"), "utf8"));
const themeById = (themeId) => THEMES.find((theme) => theme.id === themeId);
const PICKER_LABELS = THEMES.map((theme) => theme.label);

function hexToRgb(hex) {
  const [red, green, blue] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${red}, ${green}, ${blue})`;
}

async function openPreferences(page) {
  await page.getByTestId("session-sidebar-footer").getByRole("button", { name: "Preferences" }).click();
  const preferences = page.getByRole("dialog", { name: "Preferences window" });
  await expect(preferences).toBeVisible();
  return preferences;
}

const expectAppliedTheme = (page, themeId) =>
  expect(page.locator("html")).toHaveAttribute("data-theme-id", themeId);
const rootToken = (page, name) =>
  page.evaluate((token) => getComputedStyle(document.documentElement).getPropertyValue(token).trim(), name);

// A checked card's border and ring colours, and the accent token they read, resolved as a
// colour where the card sits.
const readCheckedMarks = (card) => card.evaluate((element) => {
  const probe = document.createElement("span");
  probe.style.color = "var(--notepane-control-accent)";
  element.parentElement.append(probe);
  const accent = getComputedStyle(probe).color;
  probe.remove();
  const style = getComputedStyle(element);
  return {
    accent,
    border: style.borderTopColor,
    ring: style.boxShadow.match(/rgba?\([^)]*\)/)?.[0] ?? null,
  };
});

// Waits until the card's border and ring both show the accent (they ease over a theme change)
// and returns that accent.
async function expectMarkedInAccent(card) {
  await expect.poll(async () => {
    const { accent, border, ring } = await readCheckedMarks(card);
    return { border: border === accent, ring: ring === accent };
  }).toEqual({ border: true, ring: true });
  return (await readCheckedMarks(card)).accent;
}

// Runs in the page before the app loads: a preload bridge for one blank note that records each
// theme the page asks the main process to store.
function stubThemeRecordingBridge() {
  const note = {
    id: "theme-note",
    title: "Theme note",
    titleManuallyEdited: false,
    blocksJSON: null,
    markdown: "",
    theme: {},
    seedDemoContent: false,
    editorFontFamily: "Inter",
    trashedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };
  window.__storedThemeIds = [];
  window.blocknoteSticky = {
    getCurrentNoteId: async () => note.id,
    getNote: async () => note,
    listNotes: async () => [note],
    listTrash: async () => [],
    getAppTheme: async () => ({ themeId: "notepane-light", mode: "light" }),
    getLayoutMode: async () => "tabs",
    getEditorPreferences: async () => ({}),
    listFonts: async () => [],
    saveContent: async () => note,
    updateAppearance: async () => undefined,
    listNoteVersions: async () => [],
    updateAppTheme: async (appTheme) => {
      window.__storedThemeIds.push(appTheme.themeId);
      return appTheme;
    },
  };
}

test("picker lists all themes and marks the active one", async ({ page }) => {
  // With the leak detector's sentinel themes registered, which the picker must never offer.
  await page.goto("/?sentinelThemes=1");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  const preferences = await openPreferences(page);

  await expect(preferences.getByText("App theme", { exact: true })).toBeVisible();
  await expect(preferences.getByText("The theme applies to every window.")).toBeVisible();
  const picker = preferences.getByRole("radiogroup", { name: "App theme" });
  const cards = picker.getByRole("radio");
  await expect(cards).toHaveCount(PICKER_LABELS.length);
  for (const [index, label] of PICKER_LABELS.entries()) {
    await expect(cards.nth(index)).toHaveAccessibleName(label);
  }
  await expect(picker.getByTestId("theme-card-notepane-light")).toHaveAttribute("aria-checked", "true");
  await expect(picker.locator("[role='radio'][aria-checked='true']")).toHaveCount(1);
  // Roving tab stop: only the checked card is in the tab order.
  await expect(picker.locator("[role='radio'][tabindex='0']")).toHaveCount(1);
  await expect(picker.getByTestId("theme-card-notepane-light")).toHaveAttribute("tabindex", "0");
});

test("choosing a card applies the theme immediately", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  const preferences = await openPreferences(page);
  const picker = preferences.getByRole("radiogroup", { name: "App theme" });
  const mocha = themeById("catppuccin-mocha");
  // The checked card's border and ring read the active theme's control accent.
  const lightAccent = await expectMarkedInAccent(picker.getByTestId("theme-card-notepane-light"));

  await picker.getByTestId("theme-card-catppuccin-mocha").click();

  await expectAppliedTheme(page, "catppuccin-mocha");
  expect(await rootToken(page, "--sticky-shell-bg")).toBe(mocha.palette.window);
  await expect(preferences, "Preferences stays open").toBeVisible();
  await expect(picker.getByTestId("theme-card-catppuccin-mocha")).toHaveAttribute("aria-checked", "true");
  await expect(picker.getByTestId("theme-card-notepane-light")).toHaveAttribute("aria-checked", "false");
  const mochaAccent = await expectMarkedInAccent(picker.getByTestId("theme-card-catppuccin-mocha"));
  expect(mochaAccent, "the two themes' accents differ, so the marks followed the theme").not.toBe(lightAccent);
});

test("TablePeek Dark paints the app with its palette", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  const preferences = await openPreferences(page);
  await preferences.getByTestId("theme-card-tablepeek-dark").click();

  await expectAppliedTheme(page, "tablepeek-dark");
  expect(await rootToken(page, "--sticky-shell-bg")).toBe("#1c1c1f");
  await expect(preferences.getByTestId("theme-card-tablepeek-dark"))
    .toHaveAttribute("aria-checked", "true");
});

test("each card previews its own theme", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  const preferences = await openPreferences(page);

  // NotePane Light is active; every preview still paints its own theme's palette.
  for (const theme of THEMES) {
    const preview = preferences.getByTestId(`theme-card-${theme.id}`).locator(".theme-card-preview");
    await expect(preview, theme.id).toHaveCSS("background-color", hexToRgb(theme.palette.window));
    await expect(preview.locator(".theme-card-preview-sidebar"), theme.id)
      .toHaveCSS("background-color", hexToRgb(theme.palette.sidebar));
    await expect(preview.locator(".theme-card-preview-header"), theme.id)
      .toHaveCSS("background-color", hexToRgb(theme.palette.header));
  }
});

test("choosing the checked card again changes nothing", async ({ page }) => {
  await page.addInitScript(stubThemeRecordingBridge);
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  const preferences = await openPreferences(page);
  const checkedCard = preferences.getByTestId("theme-card-notepane-light");
  await expect(checkedCard).toHaveAttribute("aria-checked", "true");

  await checkedCard.click();
  await checkedCard.focus();
  await page.keyboard.press("Space");
  // A real choice afterwards: it shows the recorder works and comes after the two above.
  await preferences.getByTestId("theme-card-nord").click();

  await expectAppliedTheme(page, "nord");
  await expect.poll(() => page.evaluate(() => window.__storedThemeIds)).toEqual(["nord"]);
});

test("arrow keys move the selection", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  const preferences = await openPreferences(page);
  const card = (themeId) => preferences.getByTestId(`theme-card-${themeId}`);

  await card("notepane-light").focus();
  const expectSelected = async (themeId) => {
    await expect(card(themeId)).toBeFocused();
    await expect(card(themeId)).toHaveAttribute("aria-checked", "true");
    await expect(card(themeId)).toHaveAttribute("tabindex", "0");
    await expectAppliedTheme(page, themeId);
  };

  await page.keyboard.press("ArrowRight");
  await expectSelected("notepane-dark");
  await expect(card("notepane-light")).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("ArrowDown");
  await expectSelected("catppuccin-latte");
  await page.keyboard.press("ArrowUp");
  await expectSelected("notepane-dark");
  await page.keyboard.press("ArrowLeft");
  await expectSelected("notepane-light");
  // Both ends wrap.
  await page.keyboard.press("ArrowLeft");
  await expectSelected("xcode-light");
  await page.keyboard.press("ArrowRight");
  await expectSelected("notepane-light");
});

test("Mod+Shift+L no longer changes the theme", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  await clickLastEmptyParagraph(page);

  await page.keyboard.press(modifierShortcut("Shift+L"));
  // The removed handler switched the theme while handling the keydown; two frames let any such
  // change commit and apply before the check.
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));

  await expectAppliedTheme(page, "notepane-light");
});

test("the shortcut list no longer offers Toggle light / dark", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  const preferences = await openPreferences(page);
  await preferences.getByRole("tab", { name: "Shortcuts" }).click();

  await expect(preferences.getByText("Toggle tabs / sticky", { exact: true })).toBeVisible();
  await expect(preferences.getByText("Toggle light / dark")).toHaveCount(0);
});

test("Preferences no longer shows the Theme mode switch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  const preferences = await openPreferences(page);

  await expect(preferences.getByRole("radiogroup", { name: "App theme" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Theme mode" })).toHaveCount(0);
});

test("filters the cards by scheme and name, with arrow keys inside the visible cards", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  const preferences = await openPreferences(page);
  const picker = preferences.getByRole("radiogroup", { name: "App theme" });
  const cards = picker.getByRole("radio");
  const chips = preferences.getByRole("group", { name: "Theme scheme" });
  const search = preferences.getByRole("searchbox", { name: "Filter themes" });
  const darkThemes = THEMES.filter((theme) => theme.scheme === "dark");
  await expect(chips.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");

  await chips.getByRole("button", { name: "Dark" }).click();
  await expect(cards).toHaveCount(darkThemes.length);
  for (const [index, theme] of darkThemes.entries()) {
    await expect(cards.nth(index)).toHaveAccessibleName(theme.label);
  }
  // NotePane Light is checked but filtered out, so the first visible card is the tab stop.
  await expect(picker.locator("[role='radio'][tabindex='0']")).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("tabindex", "0");

  await cards.first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(cards.nth(1)).toBeFocused();
  await expectAppliedTheme(page, darkThemes[1].id);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(cards.last()).toBeFocused();
  await expectAppliedTheme(page, darkThemes.at(-1).id);

  await search.fill("catppuccin");
  await expect(cards).toHaveText(["Catppuccin Frappé", "Catppuccin Macchiato", "Catppuccin Mocha"]);
  await search.fill("no such theme");
  await expect(cards).toHaveCount(0);
  await expect(preferences.getByRole("status").filter({ hasText: "No themes match." })).toBeVisible();

  await search.fill("");
  await chips.getByRole("button", { name: "All" }).click();
  await expect(cards).toHaveCount(PICKER_LABELS.length);
});
