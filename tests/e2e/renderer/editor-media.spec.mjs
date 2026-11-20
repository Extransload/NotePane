import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  createBlankSession,
  expectEditorFocused,
  loadTemplatePreview,
  modifierShortcut,
  pasteClipboardText,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

const MEDIA_MENU = { name: /^Options for / };

// The ⋯ button of a media block: one at most, outside the block's own DOM, naming its block.
async function moreActionsButton(media) {
  const blockId = await media.evaluate((element) => (
    element.closest(".bn-block-outer[data-id]").dataset.id
  ));
  return media.page()
    .locator(`.media-block-tools[data-block-id="${blockId}"]`)
    .getByRole("button", { name: "More actions" });
}

// Clicks the image, opens its menu from the ⋯ button and picks one of its items.
async function chooseMediaAction(image, name) {
  await image.click();
  await (await moreActionsButton(image)).click();
  await image.page().getByRole("menu", MEDIA_MENU)
    .getByRole("menuitem", { name, exact: true })
    .click();
}

test("clicking an image shows its ⋯ button, which opens the same menu as a right click", async ({ page }) => {
  await loadTemplatePreview(page);
  const image = page.locator("img.bn-visual-media").first();
  const block = page.locator(".bn-editor [data-content-type='image']").first();
  const menu = page.getByRole("menu", MEDIA_MENU);
  const expectAllActions = async () => {
    for (const name of ["Open", "Preview", "Caption", "Rename...", "Replace...", "Crop...", "Save As...", "Delete"]) {
      await expect(menu.getByRole("menuitem", { name, exact: true })).toBeVisible();
    }
    await expect(menu.getByRole("group", { name: "Alignment" })).toBeVisible();
  };

  await image.click();
  const more = await moreActionsButton(image);
  await expect(more).toBeVisible();
  // The file actions live in the menu, so the formatting toolbar stays away from media.
  await expect(page.locator(".notepane-formatting-toolbar:visible")).toHaveCount(0);
  await more.click();
  await expect(menu).toBeVisible();
  await expectAllActions();
  // The menu hangs from the button: right edges lined up, above or below it without covering it.
  const moreBox = await more.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(Math.abs((menuBox.x + menuBox.width) - (moreBox.x + moreBox.width))).toBeLessThan(8);
  expect(
    menuBox.y >= moreBox.y + moreBox.height || menuBox.y + menuBox.height <= moreBox.y,
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // From the keyboard: Enter opens the menu with its first item focused, arrows move, Escape
  // closes it and hands focus back to the button.
  await more.focus();
  await page.keyboard.press("Enter");
  await expect(menu.getByRole("menuitem", { name: "Open" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Preview", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(more).toBeFocused();

  await image.click({ button: "right" });
  await expect(menu).toBeVisible();
  await expectAllActions();
  await menu.getByRole("button", { name: "Align center" }).click();
  await expect(block).toHaveAttribute("data-text-alignment", "center");
});

test("replaces and crops an image from its menu", async ({ page }) => {
  await loadTemplatePreview(page);
  const image = page.locator("img.bn-visual-media").first();
  await chooseMediaAction(image, "Replace...");
  const replacePanel = page.locator(".bn-panel:visible");
  await expect(replacePanel).toBeVisible();
  await expect(replacePanel.locator("[data-test='upload-input']")).toBeVisible();
  await expect.poll(async () => (
    await replacePanel.boundingBox()
  )?.width).toBeGreaterThanOrEqual(480);
  await page.keyboard.press("Escape");
  await expect(replacePanel).toHaveCount(0);
  await chooseMediaAction(image, "Crop...");
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

  await chooseMediaAction(image, "Crop...");
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
  await chooseMediaAction(image, "Crop...");
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

  await chooseMediaAction(imageInBlock(blockIds[1]), "Crop...");
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
  const cropDialog = page.getByRole("dialog", { name: "Crop image" });
  const cropOnce = async () => {
    await chooseMediaAction(image, "Crop...");
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

  await chooseMediaAction(image, "Replace...");
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
  await chooseMediaAction(page.locator("img.bn-visual-media").first(), "Copy Image");

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

  await chooseMediaAction(image, "Caption");
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
  await chooseMediaAction(page.locator("img.bn-visual-media").first(), "Caption");
  await page.locator("input[name='file-caption']").fill("New caption");
  await page.keyboard.press("Enter");
  await expect(caption).toHaveText("New caption");

  await expectEditorFocused(page);
  await page.keyboard.press(modifierShortcut("Z"));
  await expect(caption).toHaveText(originalCaption);
});

test("leaves the view where an image file was dropped, far from the caret", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  // One input per line: typing each key of 50 lines spent most of the test's time budget.
  for (let index = 0; index < 50; index += 1) {
    await page.keyboard.insertText(`Line ${index}`);
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

test("right-clicking an image opens its menu: preview, alignment and delete", async ({ page }) => {
  await loadTemplatePreview(page);
  const images = page.locator(".bn-editor [data-content-type='image']");
  const imageCount = await images.count();
  const image = images.first();
  const source = await image.locator("img.bn-visual-media").getAttribute("src");
  const menu = page.getByRole("menu", { name: /^Options for / });

  await image.locator("img.bn-visual-media").click({ button: "right" });
  await expect(menu).toBeVisible();
  // A web image can be opened, previewed and its address copied; it has no file to show in Finder.
  for (const name of ["Open", "Preview", "Save As...", "Copy Link", "Crop...", "Delete"]) {
    await expect(menu.getByRole("menuitem", { name, exact: true })).toBeVisible();
  }
  await expect(menu.getByRole("menuitem", { name: "Show in Finder" })).toHaveCount(0);
  // The menu holds the block's actions, so the formatting toolbar steps aside.
  await expect(page.locator(".notepane-formatting-toolbar:visible")).toHaveCount(0);

  await menu.getByRole("button", { name: "Align center" }).click();
  await expect(menu).toHaveCount(0);
  await expect(image).toHaveAttribute("data-text-alignment", "center");

  await image.locator("img.bn-visual-media").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Preview", exact: true }).click();
  const preview = page.getByRole("dialog", { name: /^Preview of / });
  await expect(preview).toBeVisible();
  await expect(preview.locator("img")).toHaveAttribute("src", source);
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);

  // Hide preview shows the image as a file line, as BlockNote's preview toggle did.
  await image.locator("img.bn-visual-media").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Hide preview" }).click();
  await expect(image.locator("img.bn-visual-media")).toHaveCount(0);
  await image.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Show preview" }).click();
  await expect(image.locator("img.bn-visual-media")).toHaveAttribute("src", source);

  await image.locator("img.bn-visual-media").click({ button: "right" });
  await menu.getByRole("menuitem", { name: "Delete" }).click();
  await expect(images).toHaveCount(imageCount - 1);
});

// Opens a note of `blocks` through a desktop bridge stub that serves it.
async function openNoteWithBlocks(page, blocks) {
  await page.addInitScript((blocksJSON) => {
    const note = {
      id: "media-drag-note",
      title: "Media drag note",
      titleManuallyEdited: false,
      blocksJSON,
      markdown: "",
      theme: {},
      seedDemoContent: false,
      editorFontFamily: "Inter",
      trashedAt: null,
      createdAt: 1,
      updatedAt: 1,
    };
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
    };
  }, JSON.stringify(blocks));
  await page.goto("/");
  await expect(page.locator(".bn-editor [data-content-type='paragraph']").first()).toBeVisible();
}

// Small enough that the whole note fits the window, so every drag ends on screen.
const MEDIA_DRAG_BLOCKS = [
  { type: "paragraph", content: "Before" },
  { type: "image", props: { url: `data:image/png;base64,${PNG_FILE_BASE64}`, previewWidth: 160, caption: "Picture" } },
  { type: "paragraph", content: "After" },
  { type: "video", props: { url: "/docs/media/tour.mp4", previewWidth: 320 } },
  { type: "paragraph", content: "End" },
];

// Each top-level block as its type, then its text when it has any.
const blockOrder = (page) => page.locator(".bn-editor [data-content-type]").evaluateAll((blocks) => (
  blocks.map((block) => (block.textContent ? `${block.dataset.contentType}:${block.textContent}` : block.dataset.contentType))
));

// Presses at `from`, drags to `to` in small steps and releases there.
async function dragWithMouse(page, from, to, beforeRelease) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await beforeRelease?.();
  await page.mouse.up();
}

const center = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

test("dragging an image by its picture moves the block, with one Cmd+Z to put it back", async ({ page }) => {
  await openNoteWithBlocks(page, MEDIA_DRAG_BLOCKS);
  const original = ["paragraph:Before", "image:Picture", "paragraph:After", "video", "paragraph:End"];
  await expect.poll(() => blockOrder(page)).toEqual(original);
  const image = await page.locator(".bn-editor img.bn-visual-media").boundingBox();
  const after = await page.locator(".bn-editor [data-content-type='paragraph']").filter({ hasText: "After" }).boundingBox();

  await dragWithMouse(page, center(image), { x: image.x + image.width / 2, y: after.y + after.height * 0.8 }, async () => {
    // The six-dot handle's drop line shows where the block goes.
    await expect(page.locator(".prosemirror-dropcursor-block")).toBeVisible();
  });

  // The block moved: no copy of the picture was dropped as a file.
  await expect.poll(() => blockOrder(page))
    .toEqual(["paragraph:Before", "paragraph:After", "image:Picture", "video", "paragraph:End"]);
  await expectEditorFocused(page);
  await page.keyboard.press(modifierShortcut("Z"));
  await expect.poll(() => blockOrder(page)).toEqual(original);
});

test("a press on an image that barely moves is a click: it selects the image and shows its ⋯ button", async ({ page }) => {
  await openNoteWithBlocks(page, MEDIA_DRAG_BLOCKS);
  const image = page.locator(".bn-editor img.bn-visual-media");
  const start = center(await image.boundingBox());

  await dragWithMouse(page, start, { x: start.x + 2, y: start.y + 1 });

  await expect(await moreActionsButton(image)).toBeVisible();
  await page.mouse.move(start.x + 400, start.y);
  await expect(await moreActionsButton(image)).toBeVisible();
  expect(await blockOrder(page))
    .toEqual(["paragraph:Before", "image:Picture", "paragraph:After", "video", "paragraph:End"]);
  // The press made the picture draggable only while it lasted.
  await expect(page.locator(".bn-editor .bn-file-block-content-wrapper[draggable]")).toHaveCount(0);
});

test("dragging a video by its controls bar does not move it; by its picture does", async ({ page }) => {
  await openNoteWithBlocks(page, MEDIA_DRAG_BLOCKS);
  const video = await page.locator(".bn-editor video.bn-visual-media").boundingBox();
  const end = await page.locator(".bn-editor [data-content-type='paragraph']").filter({ hasText: "End" }).boundingBox();
  const belowEnd = { x: video.x + video.width / 2, y: end.y + end.height * 0.8 };

  // On the timeline, just above the video's bottom edge.
  await dragWithMouse(page, { x: video.x + video.width / 2, y: video.y + video.height - 20 }, belowEnd);
  expect(await blockOrder(page))
    .toEqual(["paragraph:Before", "image:Picture", "paragraph:After", "video", "paragraph:End"]);

  await dragWithMouse(page, { x: video.x + video.width / 2, y: video.y + 40 }, belowEnd);
  await expect.poll(() => blockOrder(page))
    .toEqual(["paragraph:Before", "image:Picture", "paragraph:After", "paragraph:End", "video"]);
});

// A picture of the given size and colour, as a data URL.
const svgPicture = (width, height, color) => `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><rect width='${width}' height='${height}' fill='${color}'/></svg>`,
)}`;

// The one ⋯ drawn, inside the picture's top-right corner, 8px in from both edges, as in Notion.
async function expectMoreAtCorner(page, picture) {
  await expect.poll(() => page.evaluate(() => (
    [...document.querySelectorAll(".media-block-tools")]
      .filter((tools) => getComputedStyle(tools).opacity !== "0").length
  ))).toBe(1);
  const shown = page.locator(".media-block-tools");
  await expect.poll(async () => {
    const pictureBox = await picture.boundingBox();
    const moreBox = await shown.boundingBox();
    return [
      Math.round(pictureBox.x + pictureBox.width - (moreBox.x + moreBox.width)),
      Math.round(moreBox.y - pictureBox.y),
    ];
  }).toEqual([8, 8]);
}

test("keeps the ⋯ on its picture's corner when a picture above it loads and grows", async ({ page }) => {
  // A short note: its editor is as tall as the window before and after, so only the pictures move.
  await createBlankSession(page);
  // The picture above arrives only when the test lets it, as a slow download would.
  let releaseLatePicture;
  const latePictureArrives = new Promise((resolve) => {
    releaseLatePicture = resolve;
  });
  await page.route("**/late-picture.svg", async (route) => {
    await latePictureArrives;
    await route.fulfill({
      contentType: "image/svg+xml",
      body: "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'><rect width='400' height='200' fill='teal'/></svg>",
    });
  });
  await clickLastEmptyParagraph(page);
  const lateSource = new URL("/late-picture.svg", page.url()).href;
  await pasteClipboardText(page, {
    plainText: "",
    html: `<img src="${lateSource}" alt="late"><p>between</p><img src="${svgPicture(300, 120, "orange")}" alt="below">`,
  });
  const pictures = page.locator(".bn-editor img.bn-visual-media");
  await expect(pictures).toHaveCount(2);
  const below = pictures.nth(1);

  await below.click();
  await expectMoreAtCorner(page, below);
  const belowTop = (await below.boundingBox()).y;
  releaseLatePicture();
  await expect.poll(async () => (await below.boundingBox()).y).toBeGreaterThan(belowTop + 100);
  await expectMoreAtCorner(page, below);
});

test("puts the ⋯ of a picture made narrower on that picture's own corner", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await pasteClipboardText(page, {
    plainText: "",
    html: `<img src="${svgPicture(600, 200, "orange")}" alt="wide">`,
  });
  const picture = page.locator(".bn-editor img.bn-visual-media");
  await picture.hover();
  await expectMoreAtCorner(page, picture);

  const handle = page.locator(".bn-editor .bn-resize-handle").last();
  const handleBox = await handle.boundingBox();
  const widthBefore = (await picture.boundingBox()).width;
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 250, handleBox.y + handleBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await picture.boundingBox()).width).toBeLessThan(widthBefore - 150);
  await picture.hover();
  await expectMoreAtCorner(page, picture);
});

test("shows one ⋯, on the picture a scroll brings under a still pointer, not also on the selected one", async ({ page }) => {
  const filler = Array.from({ length: 40 }, (_, index) => `<p>Line ${index}</p>`).join("");
  await clickLastEmptyParagraph(page);
  await pasteClipboardText(page, {
    plainText: "",
    // Lines below the second picture too, so the note can scroll it up to the pointer.
    html: `<img src="${svgPicture(500, 200, "orange")}" alt="first">${filler}<img src="${svgPicture(500, 200, "teal")}" alt="second">${filler}`,
  });
  const pictures = page.locator(".bn-editor img.bn-visual-media");
  await expect(pictures).toHaveCount(2);
  const [first, second] = [pictures.nth(0), pictures.nth(1)];

  await first.scrollIntoViewIfNeeded();
  await first.click();
  await expectMoreAtCorner(page, first);
  // The note scrolls (as a wheel or a jump would) so the second picture comes under the pointer,
  // which has not moved and so sends no pointer event.
  const firstBox = await first.boundingBox();
  await page.getByTestId("sticky-editor-surface").evaluate((surface, top) => {
    const picture = surface.querySelectorAll(".bn-editor img.bn-visual-media")[1];
    surface.scrollTop += picture.getBoundingClientRect().top - top;
  }, firstBox.y);
  await expectMoreAtCorner(page, second);

  await page.mouse.move(firstBox.x + firstBox.width / 2 + 3, firstBox.y + firstBox.height / 2 + 3);
  await expectMoreAtCorner(page, second);
});
