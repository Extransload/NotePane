import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  expectEditorFocused,
  loadTemplatePreview,
  modifierShortcut,
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

test("crops a replaced image from the new picture, and re-crops an untouched one from its original", async ({ page }) => {
  const solid = (color) => `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='100'><rect width='200' height='100' fill='${color}'/></svg>`,
  )}`;
  await clickLastEmptyParagraph(page);
  await pasteClipboardText(page, { plainText: "", html: `<img src="${solid("red")}" alt="photo">` });
  const image = page.locator(".bn-editor img.bn-visual-media");
  const imageTools = page.locator(".notepane-formatting-toolbar:visible");
  const cropDialog = page.getByRole("dialog", { name: "Crop image" });
  const cropOnce = async () => {
    await image.click();
    await imageTools.getByRole("button", { name: "Crop image" }).click();
    await expect(cropDialog).toBeVisible();
    const source = await cropDialog.locator(".crop-image-canvas img").getAttribute("src");
    await cropDialog.getByRole("button", { name: "Apply crop" }).click();
    await expect(cropDialog).toHaveCount(0);
    return source;
  };
  // The colour at the middle of the image the editor shows.
  const shownColor = () => image.evaluate(async (element) => {
    await element.decode();
    const canvas = document.createElement("canvas");
    canvas.width = element.naturalWidth;
    canvas.height = element.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(element, 0, 0);
    return [...context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data].slice(0, 3);
  });

  expect(await cropOnce()).toBe(solid("red"));
  // Cropping again starts from the original, so the crop can be widened.
  expect(await cropOnce()).toBe(solid("red"));

  await image.click();
  await imageTools.getByRole("button", { name: "Replace image" }).click();
  const filePanel = page.locator(".bn-panel:visible");
  await filePanel.getByRole("tab", { name: /Embed/i }).click();
  await filePanel.locator("input").last().fill(solid("blue"));
  await filePanel.getByRole("button", { name: /Embed/i }).last().click();
  await expect(image).toHaveAttribute("src", solid("blue"));

  expect(await cropOnce()).toBe(solid("blue"));
  await expect.poll(shownColor).toEqual([0, 0, 255]);
});

test("copies the selected image to the clipboard as PNG data", async ({ context, page }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await loadTemplatePreview(page);
  await page.locator("img.bn-visual-media").first().click();

  await page.locator(".notepane-formatting-toolbar:visible")
    .getByRole("button", { name: "Copy image", exact: true })
    .click();

  await expect(page.getByRole("status").filter({ hasText: "Image copied" })).toBeVisible();
  const copiedImage = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const blob = await item.getType("image/png");
    const bitmap = await createImageBitmap(blob);
    return { types: item.types, width: bitmap.width, height: bitmap.height };
  });
  expect(copiedImage.types).toContain("image/png");
  expect(copiedImage.width).toBeGreaterThan(0);
  expect(copiedImage.height).toBeGreaterThan(0);
});

// A 2x2 PNG, sent as a file in a paste or a drop, as the operating system sends one.
const PNG_FILE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAKg4DAZbI8WEAAAAASUVORK5CYII=";

async function sendImageFile(page, eventType, point) {
  await page.evaluate(({ base64, eventType, point }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "photo.png", { type: "image/png" }));
    if (eventType === "paste") {
      document.querySelector(".bn-editor").dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }),
      );
      return;
    }
    const target = document.elementFromPoint(point.x, point.y);
    for (const type of ["dragenter", "dragover", "drop"]) {
      target.dispatchEvent(new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        dataTransfer: data,
      }));
    }
  }, { base64: PNG_FILE_BASE64, eventType, point });
}

test("removes a pasted image file with one Cmd+Z and keeps its caption a step of its own", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await sendImageFile(page, "paste");
  const image = page.locator(".bn-editor img.bn-visual-media");
  await expect(image).toHaveAttribute("src", /^data:image\/png/);

  await image.click();
  await page.locator(".notepane-formatting-toolbar:visible")
    .getByRole("button", { name: "Edit caption" })
    .click();
  await page.locator("input[name='file-caption']").fill("Pasted photo");
  await page.keyboard.press("Enter");
  await expect(page.locator(".bn-editor .bn-file-caption")).toHaveText("Pasted photo");

  await page.keyboard.press(modifierShortcut("Z"));
  await expect(page.locator(".bn-editor .bn-file-caption")).toHaveCount(0);
  await expect(image).toHaveAttribute("src", /^data:image\/png/);
  // BlockNote fills the uploaded URL into an empty image block; that fill is no undo step.
  await page.keyboard.press(modifierShortcut("Z"));
  await expect(page.locator(".bn-editor [data-content-type='image']")).toHaveCount(0);

  await page.keyboard.press(modifierShortcut("Shift+Z"));
  await expect(image).toHaveAttribute("src", /^data:image\/png/);
});

test("removes an image file dropped below a line of text with one Cmd+Z", async ({ page }) => {
  await loadTemplatePreview(page);
  const line = page.locator(".bn-editor [data-content-type='paragraph']")
    .filter({ hasText: "Define the outcome" });
  await line.click();
  const imageBlocks = page.locator(".bn-editor [data-content-type='image']");
  const imageCount = await imageBlocks.count();
  const target = await line.boundingBox();
  await sendImageFile(page, "drop", { x: target.x + 20, y: target.y + target.height * 0.8 });
  await expect(page.locator(".bn-editor img.bn-visual-media[src^='data:image/png']")).toHaveCount(1);
  // The pointer was below the middle of the line, so the image is the next block.
  await expect.poll(() => line.locator("xpath=ancestor::*[contains(@class, 'bn-block-outer')][1]")
    .evaluate((block) => block.nextElementSibling?.querySelector("[data-content-type]")?.dataset.contentType))
    .toBe("image");

  await page.keyboard.press(modifierShortcut("Z"));
  await expect(imageBlocks).toHaveCount(imageCount);
  await expect(line).toHaveText("Objective: Define the outcome before adding supporting notes.");
});

test("keeps the editor focused after Enter in the caption field, so Cmd+Z undoes the caption", async ({ page }) => {
  await loadTemplatePreview(page);
  const caption = page.locator(".bn-editor .bn-file-caption").first();
  const originalCaption = await caption.textContent();
  await page.locator("img.bn-visual-media").first().click();
  await page.locator(".notepane-formatting-toolbar:visible")
    .getByRole("button", { name: "Edit caption" })
    .click();
  await page.locator("input[name='file-caption']").fill("New caption");
  await page.keyboard.press("Enter");
  await expect(caption).toHaveText("New caption");

  await expectEditorFocused(page);
  await page.keyboard.press(modifierShortcut("Z"));
  await expect(caption).toHaveText(originalCaption);
});

test("leaves the view where an image file was dropped, far from the caret", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  for (let index = 0; index < 50; index += 1) {
    await page.keyboard.type(`Line ${index}`);
    await page.keyboard.press("Enter");
  }
  await page.locator(".bn-editor").getByText("Line 0", { exact: true }).click();
  const surface = page.getByTestId("sticky-editor-surface");
  await surface.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => surface.evaluate((element) => element.scrollTop)).toBeGreaterThan(400);
  const scrollTop = await surface.evaluate((element) => element.scrollTop);

  const line = await page.locator(".bn-editor").getByText("Line 45", { exact: true }).boundingBox();
  await sendImageFile(page, "drop", { x: line.x + 20, y: line.y + line.height * 0.8 });
  const image = page.locator(".bn-editor img.bn-visual-media[src^='data:image/png']");
  await expect(image).toHaveCount(1);

  // The view stays on the dropped image instead of jumping back to the caret at the top.
  expect(Math.abs(await surface.evaluate((element) => element.scrollTop) - scrollTop)).toBeLessThan(60);
  await expect(image).toBeInViewport();
});

test("reports a pasted file that cannot be read and leaves no placeholder behind", async ({ page }) => {
  await page.evaluate(() => {
    FileReader.prototype.readAsDataURL = function failToRead() {
      window.setTimeout(() => this.dispatchEvent(new ProgressEvent("error")), 0);
    };
  });
  await clickLastEmptyParagraph(page);
  await sendImageFile(page, "paste");

  await expect(page.locator(".sticky-toast-error")).toHaveText("Could not add photo.png.");
  await expect(page.locator(".bn-editor [data-content-type='image']")).toHaveCount(0);
});
