import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  loadTemplatePreview,
  modifierShortcut,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

test("opens an export format menu from the button and keyboard shortcut", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  const exportButton = page.getByRole("button", { name: "Export" });
  await expect(exportButton).toBeVisible();

  await exportButton.click();
  const exportMenu = page.getByRole("menu", { name: "Export format" });
  await expect(exportMenu).toBeVisible();
  await expect(exportMenu.getByRole("menuitem", { name: /PDF/ })).toBeVisible();
  await expect(exportMenu.getByRole("menuitem", { name: /Markdown/ })).toBeVisible();
  await exportMenu.getByRole("menuitem", { name: /Markdown/ }).click();
  await expect(page.locator(".sticky-toast-error"))
    .toHaveText("Note export is available in the desktop app.");
  await expect(page.locator(".sticky-toast-error"))
    .toHaveCount(0, { timeout: 4000 });

  await page.keyboard.press(modifierShortcut("Shift+E"));
  await expect(page.getByRole("menu", { name: "Export format" })).toBeVisible();
});

test("uses transparent chrome-free styles while exporting", async ({ page }) => {
  await loadTemplatePreview(page);
  const exportStyles = await page.evaluate(() => {
    const surfaceElement = document.querySelector("[data-testid='sticky-editor-surface']");
    surfaceElement.querySelector(".bn-editor").style.paddingBottom = "780px";
    const originalSurfaceRectHeight = surfaceElement.getBoundingClientRect().height;
    document.body.classList.add("is-exporting");
    const shell = getComputedStyle(document.querySelector("[data-testid='sticky-shell']"));
    const header = getComputedStyle(document.querySelector("[data-testid='sticky-header']"));
    const sidebar = getComputedStyle(document.querySelector("[data-testid='session-sidebar']"));
    const surface = getComputedStyle(
      document.querySelector("[data-testid='sticky-editor-surface']"),
    );
    const editor = getComputedStyle(document.querySelector(".bn-editor"));
    const surfaceRect = surfaceElement.getBoundingClientRect();
    const values = {
      headerDisplay: header.display,
      sidebarDisplay: sidebar.display,
      shellBackgroundImage: shell.backgroundImage,
      shellTextColor: shell.color,
      surfaceBackgroundImage: surface.backgroundImage,
      surfaceBackgroundColor: surface.backgroundColor,
      surfaceRectHeight: surfaceRect.height,
      surfaceScrollHeight: surfaceElement.scrollHeight,
      originalSurfaceRectHeight,
      editorTextColor: editor.color,
      codeBackground: getComputedStyle(document.querySelector("[data-content-type='codeBlock']")).backgroundColor,
    };
    document.body.classList.remove("is-exporting");
    surfaceElement.querySelector(".bn-editor").style.paddingBottom = "";
    return values;
  });

  expect(exportStyles.headerDisplay).toBe("none");
  expect(exportStyles.sidebarDisplay).toBe("none");
  expect(exportStyles.shellBackgroundImage).toBe("none");
  expect(exportStyles.shellTextColor).toBe("rgb(55, 53, 47)");
  expect(exportStyles.surfaceBackgroundImage).toBe("none");
  expect(exportStyles.surfaceBackgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(exportStyles.editorTextColor).toBe("rgb(55, 53, 47)");
  expect(exportStyles.codeBackground).toBe("rgb(13, 17, 23)");
  expect(exportStyles.surfaceRectHeight).toBeGreaterThan(
    exportStyles.originalSurfaceRectHeight,
  );
  expect(exportStyles.surfaceRectHeight).toBeGreaterThanOrEqual(
    exportStyles.surfaceScrollHeight - 1,
  );
});

test("opens BlockNote slash menu with core demo commands", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/");

  const slashMenu = page.getByRole("listbox");
  await expect(slashMenu).toBeVisible();
  const upperPlacement = await page.evaluate(() => {
    const menu = document.querySelector(".bn-suggestion-menu[role='listbox']");
    const activeBlock = document.querySelector(
      ".bn-editor > .bn-block-group > .bn-block-outer",
    );
    return {
      menuTop: Math.round(menu.getBoundingClientRect().top),
      blockBottom: Math.round(activeBlock.getBoundingClientRect().bottom),
    };
  });
  expect(upperPlacement.menuTop).toBeGreaterThanOrEqual(upperPlacement.blockBottom);

  for (const label of [
    "Heading 1",
    "Toggle List",
    "Check List",
    "Code Block",
    "Table",
    "Image",
    "Video",
    "Audio",
    "File",
    "Import Markdown",
    "Toggle Heading 1",
    "Toggle Heading 4",
  ]) {
    await expect(slashMenu.getByText(label, { exact: true })).toBeVisible();
  }
  for (const label of ["Heading 5", "Heading 6", "Toggle Heading 5", "Toggle Heading 6"]) {
    await expect(slashMenu.getByText(label, { exact: true })).toHaveCount(0);
  }

  await slashMenu.getByText("Toggle Heading 4", { exact: true }).click();
  const toggleHeading = page.locator(
    "[data-content-type='heading'][data-is-toggleable='true']:has(h4)",
  ).last();
  await expect(toggleHeading.locator(".bn-toggle-wrapper"))
    .toHaveAttribute("data-show-children", "false");
  await expect(toggleHeading.locator(
    "xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]",
  ).getByRole("button", {
    name: "Empty toggle. Click to add a block.",
  })).toHaveCount(0);
});

test("imports Markdown through the slash-command upload modal, including drag and drop", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/import");
  await page.getByText("Import Markdown", { exact: true }).click();

  const importDialog = page.getByRole("dialog", { name: "Import Markdown" });
  await expect(importDialog).toBeVisible();
  await expect(importDialog.getByText("Drop a .md file here")).toBeVisible();
  await expect(importDialog.getByText("or click to choose a file")).toBeVisible();

  await importDialog.locator(".markdown-import-dropzone").evaluate((dropzone) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([
      "# Dropped Markdown\n\n- Imported with drag and drop",
    ], "dropped.md", { type: "text/markdown" }));
    dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer }));
  });

  await expect(page.getByRole("heading", { name: "Dropped Markdown" })).toBeVisible();
  await expect(page.getByText("Imported with drag and drop", { exact: true })).toBeVisible();
  await expect(importDialog).toHaveCount(0);
});

test("opens the slash menu upward from the lower half", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.type(`Block ${index}`);
    await page.keyboard.press("Enter");
  }

  const blocks = page.locator(".bn-editor > .bn-block-group > .bn-block-outer");
  const targetBlock = blocks.nth(20);
  await targetBlock.evaluate((block) => {
    block.scrollIntoView({ block: "end" });
  });
  await targetBlock.locator(".bn-inline-content").click();
  await page.keyboard.press("End");
  await expect.poll(() => page.evaluate(() => {
    const editorSurface = document.querySelector(
      "[data-testid='sticky-editor-surface']",
    );
    const target = [...document.querySelectorAll(
      ".bn-editor > .bn-block-group > .bn-block-outer",
    )][20];
    const surfaceRect = editorSurface.getBoundingClientRect();
    return target.getBoundingClientRect().top >=
      surfaceRect.top + surfaceRect.height / 2;
  })).toBe(true);
  await page.keyboard.type("/");

  const slashMenu = page.getByRole("listbox");
  await expect(slashMenu).toBeVisible();
  const slashMenuStyle = await slashMenu.evaluate((menu) => {
    const style = getComputedStyle(menu);
    return {
      backgroundColor: style.backgroundColor,
      paddingTop: Number.parseFloat(style.paddingTop),
    };
  });
  expect(slashMenuStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(slashMenuStyle.paddingTop).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => {
    const menu = document.querySelector(".bn-suggestion-menu[role='listbox']");
    const target = [...document.querySelectorAll(
      ".bn-editor > .bn-block-group > .bn-block-outer",
    )][20];
    const menuRect = menu.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return menuRect.top + menuRect.height / 2 <
      targetRect.top + targetRect.height / 2;
  })).toBe(true);
  await expect.poll(() => slashMenu.evaluate((menu) =>
    menu.getBoundingClientRect().height
  )).toBeLessThanOrEqual(400);
  await slashMenu.hover();
  await page.mouse.wheel(0, 10_000);
  await expect.poll(() => slashMenu.evaluate((menu) =>
    Math.round(menu.scrollTop + menu.clientHeight) >=
      Math.round(menu.scrollHeight) - 1
  )).toBe(true);
  await expect(slashMenu.getByRole("option").last()).toBeInViewport();
});
