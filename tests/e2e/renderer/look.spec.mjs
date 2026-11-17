import { expect, test } from "@playwright/test";
import {
  loadTemplatePreview,
  modifierShortcut,
} from "../support/renderer-helpers.mjs";

const settings = (page) => page.getByRole("dialog", { name: "Preferences window" });
const openLookPage = async (page, name) => {
  await settings(page).getByRole("tab", { name }).click();
  await expect(settings(page).getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
};
const rootAttribute = (page, name) => page.evaluate((attribute) => document.documentElement.getAttribute(attribute), name);
const rootVariable = (page, name) =>
  page.evaluate((variable) => getComputedStyle(document.documentElement).getPropertyValue(variable).trim(), name);

test.beforeEach(async ({ page }) => {
  await loadTemplatePreview(page);
  await page.keyboard.press(modifierShortcut(","));
  await expect(settings(page)).toBeVisible();
});

test("the default look leaves the app as it was", async ({ page }) => {
  expect(await rootAttribute(page, "data-backdrop")).toBeNull();
  expect(await rootAttribute(page, "data-look-accent")).toBeNull();
  expect(await rootAttribute(page, "data-tab-style")).toBe("outline");
  // No typography variable is set until a value leaves its default.
  expect(await rootVariable(page, "--look-editor-size")).toBe("");
});

test("a background picture shows through frosted glass, and text stays readable", async ({ page }) => {
  await openLookPage(page, "Background");
  await settings(page).getByRole("radio", { name: "Picture" }).click();
  await expect.poll(() => rootAttribute(page, "data-backdrop")).toBe("picture");
  expect(await rootVariable(page, "--look-backdrop-image")).toContain("dawn");

  // The same page sets the window over it: one material and one opacity for every area.
  const window = settings(page).locator("[data-setting-id='surfaceMaterial']");
  await window.getByRole("radio", { name: "Clear" }).click();
  await settings(page).getByRole("button", { name: "Decrease Window opacity" }).click();
  // One step down from the default 72%.
  await expect.poll(() => rootVariable(page, "--look-sidebar-opacity")).toBe("67%");
  expect(await rootVariable(page, "--look-sidebar-filter")).toBe("none");
  expect(await rootVariable(page, "--look-menus-opacity")).toBe("80%");
  // The sidebar's own fill gives way to the layer drawn from these variables.
  await expect.poll(() => page.getByTestId("session-sidebar")
    .evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  // Text over it gets a halo, until Keep text readable is turned off.
  expect(await rootAttribute(page, "data-look-readable")).toBe("");
  await expect.poll(() => page.getByTestId("session-sidebar")
    .evaluate((element) => getComputedStyle(element).textShadow)).not.toBe("none");
  await settings(page).getByRole("switch", { name: "Keep text readable" }).click();
  await expect.poll(() => rootAttribute(page, "data-look-readable")).toBeNull();

  // Solid hides the background and the opacity with it.
  await window.getByRole("radio", { name: "Solid" }).click();
  await expect.poll(() => rootVariable(page, "--look-sidebar-opacity")).toBe("100%");
  await expect(settings(page).locator("[data-setting-id='surfaceOpacity']")).toHaveCount(0);

  // Going back to no background draws every area solid again.
  await settings(page).locator("[data-setting-id='backgroundType']").getByRole("radio", { name: "None" }).click();
  await expect.poll(() => rootAttribute(page, "data-backdrop")).toBeNull();
});

test("heading font, tab style and accent apply to the app at once", async ({ page }) => {
  await openLookPage(page, "Fonts");
  await settings(page).getByRole("radiogroup", { name: "Font" }).first().waitFor();
  await settings(page).locator("[data-setting-id='headingFont']").getByRole("radio", { name: "Serif" }).click();
  await expect.poll(() =>
    page.locator(".bn-editor h1").first().evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain("Georgia");

  await openLookPage(page, "Tabs");
  await settings(page).locator("[data-setting-id='tabStyle']").getByRole("radio", { name: "Filled" }).click();
  await expect.poll(() => rootAttribute(page, "data-tab-style")).toBe("filled");

  await openLookPage(page, "Theme");
  await settings(page).locator("[data-setting-id='accentColor']").getByRole("button", { name: /green/i }).click();
  await expect.poll(() => rootVariable(page, "--notepane-control-accent")).toBe("#2f9e44");
});
