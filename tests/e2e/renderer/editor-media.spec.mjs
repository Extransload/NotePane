import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  loadTemplatePreview,
  pasteClipboardText,
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

test("crops the clicked image when two image blocks share one source", async ({ page }) => {
  const imageSource = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 80;
    const context = canvas.getContext("2d");
    context.fillStyle = "#d33";
    context.fillRect(0, 0, 60, 80);
    context.fillStyle = "#33d";
    context.fillRect(60, 0, 60, 80);
    return canvas.toDataURL("image/png");
  });
  await clickLastEmptyParagraph(page);
  await pasteClipboardText(page, {
    plainText: "",
    html: `<img src="${imageSource}" alt="first"><p>between</p><img src="${imageSource}" alt="second">`,
  });

  const images = page.locator(".bn-editor img.bn-visual-media");
  await expect(images).toHaveCount(2);
  const blockIds = await images.evaluateAll((elements) => (
    elements.map((element) => element.closest(".bn-block-outer[data-id]")?.dataset.id)
  ));
  expect(new Set(blockIds).size).toBe(2);
  const imageInBlock = (blockId) => page.locator(
    `.bn-editor .bn-block-outer[data-id="${blockId}"] img.bn-visual-media`,
  );
  await expect(imageInBlock(blockIds[0])).toHaveAttribute("src", imageSource);
  await expect(imageInBlock(blockIds[1])).toHaveAttribute("src", imageSource);

  await imageInBlock(blockIds[1]).click();
  const imageTools = page.locator(".notepane-formatting-toolbar:visible");
  await imageTools.getByRole("button", { name: "Crop image" }).click();
  const cropDialog = page.getByRole("dialog", { name: "Crop image" });
  await expect(cropDialog).toBeVisible();
  const cropImageBox = await cropDialog.locator(".crop-image-canvas img").boundingBox();
  const handleBox = await cropDialog
    .getByRole("button", { name: "Resize crop from right", exact: true })
    .boundingBox();
  await page.mouse.move(handleBox.x + (handleBox.width / 2), handleBox.y + (handleBox.height / 2));
  await page.mouse.down();
  await page.mouse.move(
    cropImageBox.x + (cropImageBox.width * 0.5),
    cropImageBox.y + (cropImageBox.height * 0.5),
  );
  await page.mouse.up();
  await cropDialog.getByRole("button", { name: "Apply crop" }).click();
  await expect(cropDialog).toHaveCount(0);

  await expect(imageInBlock(blockIds[1])).not.toHaveAttribute("src", imageSource);
  await expect(imageInBlock(blockIds[0])).toHaveAttribute("src", imageSource);
});
