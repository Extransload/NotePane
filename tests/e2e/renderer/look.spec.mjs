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

test("a background picture shows through frosted areas", async ({ page }) => {
  await openLookPage(page, "Background");
  await settings(page).getByRole("radio", { name: "Picture" }).click();
  await expect.poll(() => rootAttribute(page, "data-backdrop")).toBe("picture");
  expect(await rootVariable(page, "--look-backdrop-image")).toContain("dawn");

  await openLookPage(page, "Surfaces");
  await settings(page).getByRole("button", { name: /^Frosted/ }).click();
  await expect.poll(() => rootVariable(page, "--look-sidebar-opacity")).toBe("55%");
  // The sidebar's own fill gives way to the layer drawn from these variables.
  await expect.poll(() => page.getByTestId("session-sidebar")
    .evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");

  // Going back to no background draws every area solid again.
  await openLookPage(page, "Background");
  await settings(page).getByRole("radio", { name: "None" }).click();
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
