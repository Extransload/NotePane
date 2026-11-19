import { expect, test } from "@playwright/test";
import { modifierShortcut } from "../support/renderer-helpers.mjs";

// A desktop bridge whose main process grants the launch intro to the first window that asks,
// as electron/main.cjs does once per launch, and keeps preferences across a reload.
function stubLaunchBridge() {
  const now = Date.now();
  const note = {
    id: "intro-note",
    title: "Intro note",
    titleManuallyEdited: true,
    blocksJSON: null,
    markdown: "",
    theme: {},
    seedDemoContent: false,
    editorFontFamily: "Inter",
    trashedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const readPreferences = () => JSON.parse(window.sessionStorage.getItem("intro-preferences") ?? "{}");
  window.launchIntroAsks = 0;
  window.blocknoteSticky = {
    getCurrentNoteId: async () => note.id,
    getNote: async () => note,
    listNotes: async () => [note],
    listTrash: async () => [],
    getAppTheme: async () => ({ themeId: "notepane-light", mode: "light" }),
    getLayoutMode: async () => "tabs",
    getEditorPreferences: async () => readPreferences(),
    updateEditorPreferences: async (preferences) => {
      window.sessionStorage.setItem("intro-preferences", JSON.stringify(preferences));
      return preferences;
    },
    // Synchronous, as preload's sendSync is.
    takeLaunchIntro: () => {
      window.launchIntroAsks += 1;
      return window.launchIntroAsks === 1;
    },
    listFonts: async () => [],
    saveContent: async () => note,
    updateAppearance: async () => undefined,
  };
}

const intro = (page) => page.getByTestId("launch-intro");

test.beforeEach(async ({ page }) => {
  await page.addInitScript(stubLaunchBridge);
});

test("plays the launch intro once and clears it on its own", async ({ page }) => {
  await page.goto("/");
  await expect(intro(page)).toBeVisible();
  await expect(intro(page)).toContainText("NotePane");
  await expect(intro(page)).toHaveCount(0, { timeout: 6000 });
  expect(await page.evaluate(() => window.launchIntroAsks)).toBe(1);
});

// The app never shows before the intro: it is in the DOM when the shell first is, opaque, and
// with nothing of the app showing through.
test("covers the app from its first frame", async ({ page }) => {
  await page.addInitScript(() => {
    new MutationObserver((_records, observer) => {
      if (!document.querySelector("[data-testid='sticky-shell']")) {
        return;
      }
      observer.disconnect();
      const cover = document.querySelector("[data-testid='launch-intro']");
      const style = cover ? getComputedStyle(cover) : null;
      window.introAtFirstShell = cover
        ? { opacity: style.opacity, background: style.backgroundColor, backdrop: style.backdropFilter }
        : null;
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await expect(intro(page)).toBeVisible();
  const atFirstShell = await page.evaluate(() => window.introAtFirstShell);
  expect(atFirstShell).not.toBeNull();
  expect(atFirstShell.opacity).toBe("1");
  expect(atFirstShell.background).toMatch(/^rgb\(/);
  expect(atFirstShell.backdrop).toBe("none");
});

// The intro takes no clicks and keeps no keys: the click that skips it lands in the note.
test("a click skips the launch intro and still reaches the note", async ({ page }) => {
  await page.goto("/");
  await expect(intro(page)).toBeVisible();
  await page.locator(".bn-editor").click();
  await expect(intro(page)).toHaveCount(0, { timeout: 1500 });
  await page.keyboard.type("Typed past the intro");
  await expect(page.locator(".bn-editor")).toContainText("Typed past the intro");
});

test("a key skips the launch intro", async ({ page }) => {
  await page.goto("/");
  await expect(intro(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(intro(page)).toHaveCount(0, { timeout: 1500 });
});

// Reduced motion never plays it, and doesn't ask for it either, so the next launch with motion
// still has it.
test("reduced motion skips the launch intro without asking for it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  await expect(intro(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.launchIntroAsks)).toBe(0);
});

test("Settings > General turns the launch intro off", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  await page.keyboard.press(modifierShortcut(","));
  const settings = page.getByRole("dialog", { name: "Preferences window" });
  await settings.getByRole("tab", { name: "General" }).click();
  const introSwitch = settings.getByRole("switch", { name: "Show intro on launch" });
  await expect(introSwitch).toHaveAttribute("aria-checked", "true");
  await introSwitch.click();
  await expect(introSwitch).toHaveAttribute("aria-checked", "false");
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(window.sessionStorage.getItem("intro-preferences") ?? "{}").launchIntro)).toBe(false);
});
