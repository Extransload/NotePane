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
  // Menus and popups keep their own blur: still 24px over a clear window, until set.
  expect(await rootVariable(page, "--look-menus-filter")).toBe("blur(24px) saturate(150%)");
  const menuBlur = settings(page).getByRole("slider", { name: "Menu blur" });
  // More blur blurs the panel's backdrop more.
  await settings(page).getByRole("button", { name: "Increase Menu blur" }).click();
  await expect.poll(() => settings(page).evaluate((element) => getComputedStyle(element).backdropFilter))
    .toBe("blur(26px) saturate(1.5)");
  expect(await rootVariable(page, "--look-menus-filter")).toBe("blur(26px) saturate(150%)");
  // At 0 the panels are clear.
  await menuBlur.focus();
  await page.keyboard.press("Home");
  await expect(menuBlur).toHaveAttribute("aria-valuetext", "None");
  await expect.poll(() => rootVariable(page, "--look-settings-filter")).toBe("none");
  await expect.poll(() => settings(page).evaluate((element) => getComputedStyle(element).backdropFilter))
    .toBe("none");
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
  await openLookPage(page, "Editor");
  await settings(page).getByRole("radiogroup", { name: "Font" }).first().waitFor();
  await settings(page).locator("[data-setting-id='headingFont']").getByRole("radio", { name: "Serif" }).click();
  await expect.poll(() =>
    page.locator(".bn-editor h1").first().evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain("Georgia");

  await openLookPage(page, "Tabs");
  await settings(page).locator("[data-setting-id='tabStyle']").getByRole("radio", { name: "Filled" }).click();
  await expect.poll(() => rootAttribute(page, "data-tab-style")).toBe("filled");

  await openLookPage(page, "Appearance");
  await settings(page).locator("[data-setting-id='accentColor']").getByRole("button", { name: /green/i }).click();
  await expect.poll(() => rootVariable(page, "--notepane-control-accent")).toBe("#2f9e44");
});

// Over a background the window is its own stacking context; the block handles BlockNote portals to
// the body must still stay under Settings, not show through it.
test("a block's handles stay under Settings over a background picture", async ({ page }) => {
  await openLookPage(page, "Background");
  await settings(page).getByRole("radio", { name: "Picture" }).click();
  await expect.poll(() => rootAttribute(page, "data-backdrop")).toBe("picture");
  await settings(page).getByRole("button", { name: "Close preferences" }).click();
  await expect(settings(page)).toHaveCount(0);

  // Hover a block until its handles show, then open Settings over them.
  const heading = page.getByRole("heading", { name: "NotePane", exact: true });
  const box = await heading.boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  const handles = page.locator(".bn-side-menu");
  await expect(handles).toBeVisible();
  const handlesBox = await handles.boundingBox();
  await page.keyboard.press(modifierShortcut(","));
  await expect(settings(page)).toBeVisible();

  const topmost = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest(".bn-side-menu") ? "handles" : element?.closest(".preferences-backdrop") ? "settings" : "other";
  }, { x: handlesBox.x + handlesBox.width / 2, y: handlesBox.y + handlesBox.height / 2 });
  expect(topmost).toBe("settings");
});
