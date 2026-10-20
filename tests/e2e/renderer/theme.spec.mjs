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
const PICKER_LABELS = [
  "NotePane Light",
  "NotePane Dark",
  "Catppuccin Latte",
  "Catppuccin Frappé",
  "Catppuccin Macchiato",
  "Catppuccin Mocha",
  "Nord",
  "Dracula",
  "Tokyo Night",
];

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

test("picker lists the nine themes and marks the active one", async ({ page }) => {
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

  await picker.getByTestId("theme-card-catppuccin-mocha").click();

  await expectAppliedTheme(page, "catppuccin-mocha");
  expect(await rootToken(page, "--sticky-shell-bg")).toBe(mocha.palette.window);
  await expect(preferences, "Preferences stays open").toBeVisible();
  await expect(picker.getByTestId("theme-card-catppuccin-mocha")).toHaveAttribute("aria-checked", "true");
  await expect(picker.getByTestId("theme-card-notepane-light")).toHaveAttribute("aria-checked", "false");
  // The checked card is marked in the theme's accent: now Mocha's.
  await expect(picker.getByTestId("theme-card-catppuccin-mocha"))
    .toHaveCSS("border-top-color", hexToRgb(mocha.palette.accent));
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
  await expectSelected("tokyo-night");
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
