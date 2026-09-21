import { expect, test } from "@playwright/test";
import {
  loadTemplatePreview,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

test("shows image download and crop actions in one toolbar", async ({ page }) => {
  await loadTemplatePreview(page);
  const image = page.locator("img.bn-visual-media").first();
  await image.click();

  const imageTools = page.locator(".notepane-formatting-toolbar:visible");
  await expect(imageTools).toBeVisible();
  await expect(imageTools.locator(".notepane-file-download-button")).toBeVisible();
  await expect(imageTools.getByRole("button", { name: "Crop image" })).toBeVisible();
  await imageTools.getByRole("button", { name: "Replace image" }).click();
  const replacePanel = page.locator(".bn-panel:visible");
  await expect(replacePanel).toBeVisible();
  await expect(replacePanel.locator("[data-test='upload-input']")).toBeVisible();
  await expect.poll(async () => (
    await replacePanel.boundingBox()
  )?.width).toBeGreaterThanOrEqual(480);
  await page.keyboard.press("Escape");
  await expect(replacePanel).toHaveCount(0);
  await image.click();
  await expect(imageTools).toBeVisible();
  await imageTools.getByRole("button", { name: "Crop image" }).click();
  const cropDialog = page.getByRole("dialog", { name: "Crop image" });
  await expect(cropDialog).toBeVisible();
  const cropVisuals = await cropDialog.evaluate((dialog) => {
    const frame = dialog.querySelector(".crop-image-frame");
    const image = dialog.querySelector(".crop-image-canvas img");
    const selection = dialog.querySelector(".crop-selection");
    const frameRect = frame?.getBoundingClientRect();
    const imageRect = image?.getBoundingClientRect();
    const selectionStyle = selection && getComputedStyle(selection);
    return {
      imageFitsFrame: Boolean(
        frameRect && imageRect &&
          imageRect.left >= frameRect.left &&
          imageRect.right <= frameRect.right &&
          imageRect.top >= frameRect.top &&
          imageRect.bottom <= frameRect.bottom,
      ),
      grid: selectionStyle?.backgroundImage ?? "",
      mask: selectionStyle?.boxShadow ?? "",
    };
  });
  expect(cropVisuals.imageFitsFrame).toBe(true);
  expect(cropVisuals.grid).toContain("linear-gradient");
  expect(cropVisuals.mask).not.toContain("9999");
  await expect(cropDialog.locator(".crop-resize-handle")).toHaveCount(8);

  const originalSource = await cropDialog
    .locator(".crop-image-canvas img")
    .getAttribute("src");
  const cropImage = cropDialog.locator(".crop-image-canvas img");
  const cropImageBox = await cropImage.boundingBox();
  expect(cropImageBox).not.toBeNull();
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.width).toBeCloseTo(cropImageBox.width, 0);
  const resizeFromHandle = async (handle, x, y) => {
    const handleBox = await cropDialog
      .getByRole("button", { name: `Resize crop from ${handle}`, exact: true })
      .boundingBox();
    expect(handleBox).not.toBeNull();
    await page.mouse.move(handleBox.x + (handleBox.width / 2), handleBox.y + (handleBox.height / 2));
    await page.mouse.down();
    await page.mouse.move(cropImageBox.x + (cropImageBox.width * x), cropImageBox.y + (cropImageBox.height * y));
    await page.mouse.up();
  };
  await resizeFromHandle("right", 0.8, 0.5);
  await resizeFromHandle("bottom", 0.5, 0.8);
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.width).toBeCloseTo(cropImageBox.width * 0.8, 0);
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.height).toBeCloseTo(cropImageBox.height * 0.8, 0);
  const selectionBox = await cropDialog.locator(".crop-selection").boundingBox();
  expect(selectionBox).not.toBeNull();
  await page.mouse.move(
    selectionBox.x + (selectionBox.width / 2),
    selectionBox.y + (selectionBox.height / 2),
  );
  await page.mouse.down();
  await page.mouse.move(
    selectionBox.x + (selectionBox.width / 2) + (cropImageBox.width * 0.1),
    selectionBox.y + (selectionBox.height / 2) + (cropImageBox.height * 0.1),
  );
  await page.mouse.up();
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.x).toBeCloseTo(cropImageBox.x + (cropImageBox.width * 0.1), 0);
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.y).toBeCloseTo(cropImageBox.y + (cropImageBox.height * 0.1), 0);
  await cropDialog.getByRole("button", { name: "Apply crop" }).click();
  await expect(cropDialog).toHaveCount(0);

  await image.click();
  await imageTools.getByRole("button", { name: "Crop image" }).click();
  await expect(cropDialog).toBeVisible();
  await expect(cropDialog.locator(".crop-image-canvas img")).toHaveAttribute(
    "src",
    originalSource,
  );
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.width).toBeCloseTo(cropImageBox.width * 0.8, 0);
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.height).toBeCloseTo(cropImageBox.height * 0.8, 0);
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.x).toBeCloseTo(cropImageBox.x + (cropImageBox.width * 0.1), 0);
  await expect.poll(async () => (
    await cropDialog.locator(".crop-selection").boundingBox()
  )?.y).toBeCloseTo(cropImageBox.y + (cropImageBox.height * 0.1), 0);

  await cropDialog.getByRole("button", { name: "Apply crop" }).click();
  await expect(cropDialog).toHaveCount(0);
  await image.click();
  await imageTools.getByRole("button", { name: "Crop image" }).click();
  await expect(cropDialog.locator(".crop-image-canvas img")).toHaveAttribute(
    "src",
    originalSource,
  );
});
