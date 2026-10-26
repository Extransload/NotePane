import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  expectEditorFocused,
  modifierShortcut,
  waitForEditorSelection,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

const editor = (page) => page.locator(".bn-editor");
// The block around the callout's content holds its nested blocks too, and paints the box.
const calloutBox = (callout) =>
  callout.locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' bn-block ')][1]");

async function insertCallout(page) {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/callout");
  await expect(page.getByText("Callout", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  const callout = editor(page).locator("[data-content-type='callout']").last();
  await expect(callout).toBeVisible();
  // The menu fades out over the editor, and takes the pointer until it is gone.
  await expect(page.locator(".bn-suggestion-menu")).toHaveCount(0);
  return callout;
}

async function openBlockMenuFor(page, callout) {
  const rect = await callout.boundingBox();
  await page.mouse.move(rect.x + 40, rect.y + rect.height / 2);
  await page.mouse.move(rect.x - 24, rect.y + rect.height / 2);
  await page.locator(".bn-side-menu").getByRole("button", { name: "Open block menu" }).click();
  const blockMenu = page.locator(".bn-drag-handle-menu:visible");
  await expect(blockMenu).toBeVisible();
  return blockMenu;
}

// Puts the caret in `text` at `offset` characters from its start, through the DOM selection.
async function placeCaret(page, text, offset) {
  await editor(page).getByText(text, { exact: true }).evaluate((element, at) => {
    element.closest("[contenteditable]")?.focus();
    const textNode = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE)
      ?? element.firstChild;
    const range = document.createRange();
    range.setStart(textNode, at);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }, offset);
  await waitForEditorSelection(page);
}

async function typeCalloutBody(page, title, lines) {
  const callout = await insertCallout(page);
  await page.keyboard.type(title);
  for (const line of lines) {
    await page.keyboard.press("Enter");
    await page.keyboard.type(line);
  }
  return callout;
}

const bodyTexts = (callout) => calloutBox(callout).locator(".bn-block-group .bn-block-content")
  .evaluateAll((elements) => elements.map((element) => element.textContent));

// Runs in the page before the app loads: a desktop bridge that keeps the last saved Markdown.
function stubSavingBridge() {
  const note = {
    id: "callout-note",
    title: "Callout note",
    titleManuallyEdited: false,
    blocksJSON: null,
    markdown: "",
    theme: {},
    seedDemoContent: false,
    editorFontFamily: "Inter",
    trashedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };
  window.__savedMarkdown = "";
  window.blocknoteSticky = {
    getCurrentNoteId: async () => note.id,
    getNote: async () => note,
    listNotes: async () => [note],
    listTrash: async () => [],
    getAppTheme: async () => ({ themeId: "notepane-light", mode: "light" }),
    getLayoutMode: async () => "tabs",
    getEditorPreferences: async () => ({}),
    listFonts: async () => [],
    saveContent: async (payload) => {
      window.__savedMarkdown = payload.markdown;
      return note;
    },
    updateAppearance: async () => undefined,
    listNoteVersions: async () => [],
  };
}

test("inserts a callout from the slash menu and writes inside its box", async ({ page }) => {
  const callout = await insertCallout(page);
  await page.keyboard.type("Remember this");

  await expect(callout).toContainText("Remember this");
  await expect(callout.getByRole("button", { name: "Change callout icon" })).toHaveText("💡");
  expect(await calloutBox(callout).evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe("rgba(0, 0, 0, 0)");
});

test("composes Korean as the first text of a new callout without a stray jamo", async ({ page }) => {
  const callout = await insertCallout(page);
  // The compositions Chrome reports while a Korean IME types 한 and then 글.
  const cdp = await page.context().newCDPSession(page);
  for (const steps of [["ㅎ", "하", "한"], ["ㄱ", "그", "글"]]) {
    for (const text of steps) {
      await cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
    }
    await cdp.send("Input.insertText", { text: steps.at(-1) });
  }

  await expect(callout.locator(".bn-inline-content")).toHaveText("한글");
});

test("changes the callout icon from its picker", async ({ page }) => {
  const callout = await insertCallout(page);
  await page.keyboard.type("Careful");
  const iconButton = callout.getByRole("button", { name: "Change callout icon" });

  await iconButton.click();
  const picker = page.getByRole("dialog", { name: "Callout icon" });
  await expect(picker).toBeVisible();
  await picker.getByRole("group", { name: "Suggested" }).getByRole("button", { name: "Warning" }).click();

  await expect(iconButton).toHaveText("⚠️");
  await expect(picker).toHaveCount(0);
  await expect(callout).toContainText("Careful");
});

test("Enter moves the text after the caret into a block inside the callout", async ({ page }) => {
  const callout = await insertCallout(page);
  await page.keyboard.type("TitleTail");
  for (let index = 0; index < "Tail".length; index += 1) {
    await page.keyboard.press("ArrowLeft");
  }
  await waitForEditorSelection(page);

  await page.keyboard.press("Enter");
  await page.keyboard.type("Body ");

  await expect(callout).toHaveText(/^💡\s*Title$/);
  await expect(calloutBox(callout).locator(".bn-block-group [data-content-type='paragraph']").first())
    .toHaveText("Body Tail");
});

test("Enter on an empty line inside the callout leaves the box", async ({ page }) => {
  const callout = await insertCallout(page);
  const box = calloutBox(callout);
  await page.keyboard.type("Title line");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Inside line");
  await expect(box.locator(".bn-block-group").getByText("Inside line", { exact: true })).toBeVisible();

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Outside line");

  await expect(editor(page).getByText("Outside line", { exact: true })).toBeVisible();
  await expect(box.getByText("Outside line", { exact: true })).toHaveCount(0);
  await expect(callout).toHaveText(/^💡\s*Title line$/);
});

test("Shift+Enter breaks the line inside the callout text", async ({ page }) => {
  const callout = await insertCallout(page);
  await page.keyboard.type("First line");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Second line");

  await expect(callout.locator("br:not(.ProseMirror-trailingBreak)")).toHaveCount(1);
  await expect(callout).toContainText("Second line");
  await expect(calloutBox(callout).locator(".bn-block-group")).toHaveCount(0);
});

test("keeps a list typed inside the callout within its box", async ({ page }) => {
  const callout = await insertCallout(page);
  const box = calloutBox(callout);
  await page.keyboard.type("Checklist");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- first item");

  const item = box.locator("[data-content-type='bulletListItem']");
  await expect(item).toContainText("first item");
  const [boxRect, itemRect] = await Promise.all([box.boundingBox(), item.boundingBox()]);
  expect(itemRect.x).toBeGreaterThanOrEqual(boxRect.x);
  expect(itemRect.y + itemRect.height).toBeLessThanOrEqual(boxRect.y + boxRect.height);
});

test("saves a callout, nested blocks included, as a Markdown quote that starts with its icon", async ({ page }) => {
  await page.addInitScript(stubSavingBridge);
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  await insertCallout(page);
  await page.keyboard.type("Remember this");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Body line");

  await expect.poll(() => page.evaluate(() => window.__savedMarkdown)).toContain("> Body line");
  expect(await page.evaluate(() => window.__savedMarkdown)).toContain("> 💡 Remember this");
});

test("fills the whole callout box, nested blocks included, with a colour from the block menu", async ({ page }) => {
  const callout = await insertCallout(page);
  const box = calloutBox(callout);
  await page.keyboard.type("Coloured callout");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Nested line");

  const blockMenu = await openBlockMenuFor(page, callout);
  await blockMenu.getByRole("menuitem", { name: "Colors" }).click();
  await page.locator(".notepane-block-menu-subpanel[data-panel='colors']:visible")
    .locator("[data-color-kind='background'][data-color-value='blue']")
    .click();

  await expect(callout).toHaveAttribute("data-background-color", "blue");
  // Polled, because the fill eases from the default colour to the picked one.
  await expect.poll(() => box.evaluate((element) => {
    const probe = document.createElement("div");
    probe.style.background = "var(--notepane-editor-blue-bg)";
    element.append(probe);
    const blue = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      box: getComputedStyle(element).backgroundColor === blue,
      content: getComputedStyle(element.querySelector("[data-content-type='callout']")).backgroundColor,
    };
  })).toEqual({ box: true, content: "rgba(0, 0, 0, 0)" });
  await expect(box.getByText("Nested line", { exact: true })).toBeVisible();
});

test("copies a callout block with its icon", async ({ page }) => {
  const callout = await insertCallout(page);
  await page.keyboard.type("Copied callout");
  await callout.getByRole("button", { name: "Change callout icon" }).click();
  await page.getByRole("dialog", { name: "Callout icon" })
    .getByRole("group", { name: "Suggested" })
    .getByRole("button", { name: "Warning" })
    .click();

  await openBlockMenuFor(page, callout);
  await page.evaluate(() => {
    window.__copiedCallout = new DataTransfer();
    document.querySelector(".bn-editor").dispatchEvent(
      new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: window.__copiedCallout }),
    );
  });
  await page.keyboard.press("Escape");
  // Into the box on a new line, then out of it below the callout.
  await callout.getByText("Copied callout", { exact: true }).click();
  await page.keyboard.press("End");
  await waitForEditorSelection(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    document.querySelector(".bn-editor").dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: window.__copiedCallout }),
    );
  });

  const callouts = editor(page).locator("[data-content-type='callout']");
  await expect(callouts).toHaveCount(2);
  await expect(callouts.last()).toContainText("Copied callout");
  await expect(callouts.last().getByRole("button", { name: "Change callout icon" })).toHaveText("⚠️");
});

test("Enter on an empty line between nested blocks adds a line and keeps the rest in the box", async ({ page }) => {
  const callout = await typeCalloutBody(page, "Title", ["First", "Second"]);
  await placeCaret(page, "First", "First".length);

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Middle");

  await expect.poll(() => bodyTexts(callout)).toEqual(["First", "", "Middle", "Second"]);
});

test("Backspace at the start of the first nested line joins it to the callout text", async ({ page }) => {
  const callout = await typeCalloutBody(page, "Title", ["Body", "Second"]);
  await placeCaret(page, "Body", 0);

  await page.keyboard.press("Backspace");
  await page.keyboard.type("+");

  await expect(callout).toHaveText(/^💡\s*Title\+Body$/);
  await expect.poll(() => bodyTexts(callout)).toEqual(["Second"]);
});

test("Backspace at the start of a later nested line joins it to the line above inside the box", async ({ page }) => {
  const callout = await typeCalloutBody(page, "Title", ["First", "Second", "Third"]);
  await placeCaret(page, "Second", 0);

  await page.keyboard.press("Backspace");
  await page.keyboard.type("+");

  await expect.poll(() => bodyTexts(callout)).toEqual(["First+Second", "Third"]);
  await expect(callout).toHaveText(/^💡\s*Title$/);
});

test("Backspace at the start of a nested line joins it to the end of the nested block above", async ({ page }) => {
  const callout = await typeCalloutBody(page, "Title", ["First"]);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Child");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.type("Second");
  await expect.poll(() => bodyTexts(callout)).toEqual(["First", "Child", "Second"]);
  await placeCaret(page, "Second", 0);

  await page.keyboard.press("Backspace");
  await page.keyboard.type("+");

  await expect.poll(() => bodyTexts(callout)).toEqual(["First", "Child+Second"]);
});

test("keeps the handle of a line inside the callout on that line", async ({ page }) => {
  const callout = await typeCalloutBody(page, "Title", ["One", "Two"]);
  const two = editor(page).locator(".bn-block-content").filter({ hasText: /^Two$/ });

  const blockMenu = await openBlockMenuFor(page, two);
  await blockMenu.getByRole("menuitem", { name: "Delete" }).click();

  await expect.poll(() => bodyTexts(callout)).toEqual(["One"]);
  await expect(callout).toHaveText(/^💡\s*Title$/);
});

test("Enter at the start of the callout text opens a line above the callout", async ({ page }) => {
  const callout = await insertCallout(page);
  await page.keyboard.type("Title");
  await placeCaret(page, "Title", 0);

  await page.keyboard.press("Enter");

  await expect(callout).toHaveText(/^💡\s*Title$/);
  await expect(calloutBox(callout).locator(".bn-block-group")).toHaveCount(0);
  const previous = await callout.evaluate((element) => {
    const block = element.closest(".bn-block-outer").previousElementSibling;
    const content = block?.querySelector(".bn-block-content");
    return { type: content?.dataset.contentType, text: content?.textContent };
  });
  expect(previous).toEqual({ type: "paragraph", text: "" });
});

test("Enter with a selection that runs past the callout keeps the outside text outside", async ({ page }) => {
  const callout = await insertCallout(page);
  await page.keyboard.type("Tip");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Outside");
  await editor(page).evaluate((root) => {
    const textOf = (text) => [...root.querySelectorAll("[data-content-type] *")]
      .find((element) => element.textContent === text && element.firstChild?.nodeType === Node.TEXT_NODE)
      .firstChild;
    const range = document.createRange();
    range.setStart(textOf("Tip"), 2);
    range.setEnd(textOf("Outside"), 2);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await waitForEditorSelection(page);

  await page.keyboard.press("Enter");

  await expect(callout).toHaveText(/^💡\s*Ti$/);
  await expect(calloutBox(callout).locator(".bn-block-group")).toHaveCount(0);
  await expect(editor(page).getByText("tside", { exact: true })).toBeVisible();
});

test("Escape closes the icon picker and leaves the caret in the callout", async ({ page }) => {
  const callout = await insertCallout(page);
  await page.keyboard.type("Typing");
  await callout.getByRole("button", { name: "Change callout icon" }).click();
  const picker = page.getByRole("dialog", { name: "Callout icon" });
  await expect(picker).toBeVisible();
  await expect(picker.getByLabel("Filter emoji")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await page.keyboard.type(" on");

  await expect(callout).toContainText("Typing on");
});

test("tints a callout that is part of a block selection", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Before the callout");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/callout");
  await expect(page.getByText("Callout", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Selected callout");
  const callout = editor(page).locator("[data-content-type='callout']").last();
  const box = calloutBox(callout);
  const unselected = await box.evaluate((element) => getComputedStyle(element).backgroundImage);

  const editorRect = await editor(page).boundingBox();
  const beforeRect = await editor(page).getByText("Before the callout", { exact: true }).boundingBox();
  const calloutRect = await callout.boundingBox();
  await page.mouse.move(editorRect.x + editorRect.width - 20, beforeRect.y + 2);
  await page.mouse.down();
  await page.mouse.move(editorRect.x + editorRect.width / 2, calloutRect.y + calloutRect.height - 2, { steps: 10 });
  await page.mouse.up();

  await expect(callout.locator("xpath=ancestor::*[@data-block-selected='true'][1]")).toHaveCount(1);
  await expect.poll(() => box.evaluate((element) => getComputedStyle(element).backgroundImage))
    .not.toBe(unselected);
});

test("lines the callout box up with the text of the blocks around it", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("Paragraph above");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/callout");
  await expect(page.getByText("Callout", { exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("Aligned callout");
  const callout = editor(page).locator("[data-content-type='callout']").last();

  const geometry = await callout.evaluate((element) => {
    const paragraph = [...document.querySelectorAll(".bn-editor [data-content-type='paragraph']")]
      .find((candidate) => candidate.textContent === "Paragraph above");
    const box = element.closest(".bn-block").getBoundingClientRect();
    const text = paragraph.getBoundingClientRect();
    const icon = element.querySelector(".notepane-callout-icon").getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element.querySelector(".notepane-callout-content"));
    const line = range.getClientRects()[0];
    return {
      left: Math.round(box.left - text.left),
      right: Math.round(box.right - text.right),
      iconOffset: Math.round((icon.top + icon.height / 2) - (line.top + line.height / 2)),
    };
  });
  expect(geometry).toEqual({ left: 0, right: 0, iconOffset: 0 });
});

const openIconPicker = async (page, callout) => {
  await callout.getByRole("button", { name: "Change callout icon" }).click();
  const picker = page.getByRole("dialog", { name: "Callout icon" });
  await expect(picker).toBeVisible();
  return picker;
};

test("finds an emoji by name in the icon picker", async ({ page }) => {
  const callout = await insertCallout(page);
  await page.keyboard.type("Ship it");
  const picker = await openIconPicker(page, callout);

  await picker.getByLabel("Filter emoji").fill("rocket");
  await picker.getByRole("group", { name: "Results" }).getByRole("button", { name: "Rocket" }).click();

  await expect(picker).toHaveCount(0);
  await expect(callout.getByRole("button", { name: "Change callout icon" })).toHaveText("🚀");
  await expect(callout).toContainText("Ship it");
});

test("picks a random emoji and lists it under recent icons", async ({ page }) => {
  const callout = await insertCallout(page);
  let picker = await openIconPicker(page, callout);
  await expect(picker.getByRole("group", { name: "Smileys & People" })).toBeVisible();
  // The first emoji of the first category.
  await page.evaluate(() => {
    Math.random = () => 0;
  });

  await picker.getByRole("button", { name: "Random emoji" }).click();
  await expect(callout.getByRole("button", { name: "Change callout icon" })).toHaveText("😀");

  picker = await openIconPicker(page, callout);
  await expect(picker.getByRole("group", { name: "Recent" }).getByRole("button", { name: "Grinning Face" }))
    .toBeVisible();
});

test("removes the icon and adds one back from the block menu", async ({ page }) => {
  const callout = await insertCallout(page);
  await page.keyboard.type("No icon yet");
  const picker = await openIconPicker(page, callout);

  await picker.getByRole("button", { name: "Remove" }).click();
  await expect(callout.getByRole("button", { name: "Change callout icon" })).toHaveCount(0);
  await expect(callout).toHaveText("No icon yet");

  const blockMenu = await openBlockMenuFor(page, callout);
  await blockMenu.getByRole("menuitem", { name: "Edit icon" }).click();
  const reopened = page.getByRole("dialog", { name: "Callout icon" });
  await expect(reopened).toBeVisible();
  await reopened.getByRole("group", { name: "Suggested" }).getByRole("button", { name: "Pin" }).click();

  await expect(callout.getByRole("button", { name: "Change callout icon" })).toHaveText("📌");
});

test("uses an uploaded image as the icon", async ({ page }) => {
  const callout = await insertCallout(page);
  const picker = await openIconPicker(page, callout);
  await picker.getByRole("tab", { name: "Upload" }).click();

  // A 1x1 transparent PNG.
  await picker.getByLabel("Icon image file").setInputFiles({
    name: "icon.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    ),
  });

  await expect(picker).toHaveCount(0);
  await expect(callout.getByRole("button", { name: "Change callout icon" }).locator("img"))
    .toHaveAttribute("src", /^data:image\/png/);
});

// Drags `text`'s block by its side-menu handle and releases it at `target`'s point.
async function dragBlockTo(page, text, targetPoint) {
  const source = editor(page).getByText(text, { exact: true });
  const sourceBox = await source.boundingBox();
  await page.mouse.move(sourceBox.x + 10, sourceBox.y + sourceBox.height / 2);
  const handle = page.locator(".bn-side-menu [data-test='dragHandle']");
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetPoint.x, targetPoint.y, { steps: 12 });
  await page.mouse.up();
}

async function calloutWithOutsideParagraph(page, title, nested, outside) {
  const callout = await typeCalloutBody(page, title, nested);
  // A new line in the box, then Enter on it leaves the box.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type(outside);
  await expect(calloutBox(callout).getByText(outside, { exact: true })).toHaveCount(0);
  return callout;
}

test("drops a dragged block into an empty callout from its own line", async ({ page }) => {
  const callout = await calloutWithOutsideParagraph(page, "Box", [], "Dragged");
  const line = await callout.boundingBox();

  await dragBlockTo(page, "Dragged", { x: line.x + line.width / 2, y: line.y + line.height / 2 });

  await expect.poll(() => bodyTexts(callout)).toEqual(["Dragged"]);
  await expect(editor(page).getByText("Dragged", { exact: true })).toHaveCount(1);
});

test("drops a dragged block into a callout from the padding below its line", async ({ page }) => {
  // ProseMirror's own drop would put the block after the callout, outside the box.
  const callout = await calloutWithOutsideParagraph(page, "Box", [], "Dragged");
  const box = await calloutBox(callout).boundingBox();

  await dragBlockTo(page, "Dragged", { x: box.x + box.width / 2, y: box.y + box.height - 3 });

  await expect.poll(() => bodyTexts(callout)).toEqual(["Dragged"]);
});

test("drops a dragged block first in a callout's body from its own line", async ({ page }) => {
  const callout = await calloutWithOutsideParagraph(page, "Box", ["Inside"], "Dragged");
  const line = await callout.boundingBox();

  await dragBlockTo(page, "Dragged", { x: line.x + line.width / 2, y: line.y + line.height / 2 });

  await expect.poll(() => bodyTexts(callout)).toEqual(["Dragged", "Inside"]);
});

test("drops a dragged block beside the nested block it is level with in the box's padding", async ({ page }) => {
  const callout = await calloutWithOutsideParagraph(page, "Box", ["One", "Two"], "Dragged");
  const box = await calloutBox(callout).boundingBox();
  const one = await editor(page).getByText("One", { exact: true }).boundingBox();

  // The upper half of One's row, in the box's right padding, clear of the side menu on the left.
  await dragBlockTo(page, "Dragged", { x: box.x + box.width - 6, y: one.y + 2 });

  await expect.poll(() => bodyTexts(callout)).toEqual(["Dragged", "One", "Two"]);
});

// Opens a note that holds `blocks` through a desktop bridge stub, so the undo history starts empty.
async function openNoteWith(page, blocks) {
  await page.addInitScript((blocksJSON) => {
    const note = {
      id: "seeded-note",
      title: "Seeded note",
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
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
}

const boxWithLines = (lines) => ({
  type: "callout",
  props: { icon: "💡" },
  content: "Box",
  children: lines.map((line) => ({ type: "paragraph", content: line })),
});

test("keeps the editor focused after a block drag, so Cmd+Z undoes the move", async ({ page }) => {
  const callout = await calloutWithOutsideParagraph(page, "Box", ["Inside"], "Dragged");
  // The last typing is not next to the dragged line, so the move is an undo step of its own.
  await page.keyboard.press("Enter");
  await page.keyboard.type("Last");
  const line = await callout.boundingBox();

  await dragBlockTo(page, "Dragged", { x: line.x + line.width / 2, y: line.y + line.height / 2 });
  await expect.poll(() => bodyTexts(callout)).toEqual(["Dragged", "Inside"]);

  // BlockNote blurs the editor when the drag ends.
  await expectEditorFocused(page);
  await page.keyboard.press(modifierShortcut("Z"));
  await expect.poll(() => bodyTexts(callout)).toEqual(["Inside"]);
  await expect(editor(page).getByText("Dragged", { exact: true })).toHaveCount(1);
  await expect(editor(page).getByText("Last", { exact: true })).toHaveCount(1);
});

// Drops a PNG file at `point`, as the operating system does.
async function dropImageFile(page, point) {
  await page.evaluate((at) => {
    const bytes = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQoAKg4DAZbI8WEAAAAASUVORK5CYII="),
      (character) => character.charCodeAt(0),
    );
    const data = new DataTransfer();
    data.items.add(new File([bytes], "photo.png", { type: "image/png" }));
    const target = document.elementFromPoint(at.x, at.y);
    for (const type of ["dragenter", "dragover", "drop"]) {
      target.dispatchEvent(new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: at.x,
        clientY: at.y,
        dataTransfer: data,
      }));
    }
  }, point);
}

const bodyTypes = (callout) => calloutBox(callout).locator(".bn-block-group .bn-block-content")
  .evaluateAll((elements) => elements.map((element) => element.dataset.contentType));

test("drops an image file first in a callout's body from its own line", async ({ page }) => {
  // BlockNote's own file drop would put it above the callout.
  await openNoteWith(page, [boxWithLines(["One"]), { type: "paragraph", content: "After" }]);
  const callout = editor(page).locator("[data-content-type='callout']");
  const line = await callout.boundingBox();

  await dropImageFile(page, { x: line.x + line.width / 2, y: line.y + line.height / 2 });

  await expect.poll(() => bodyTypes(callout)).toEqual(["image", "paragraph"]);
  await expect(calloutBox(callout).locator("img.bn-visual-media"))
    .toHaveAttribute("src", /^data:image\/png/);
});

test("drops an image file beside a nested line or last in the body from the callout's padding", async ({ page }) => {
  await openNoteWith(page, [boxWithLines(["One", "Two"]), { type: "paragraph", content: "After" }]);
  const callout = editor(page).locator("[data-content-type='callout']");
  const box = await calloutBox(callout).boundingBox();
  const two = await editor(page).getByText("Two", { exact: true }).boundingBox();

  // The upper half of Two's row, in the box's right padding.
  await dropImageFile(page, { x: box.x + box.width - 6, y: two.y + 2 });
  await expect.poll(() => bodyTypes(callout)).toEqual(["paragraph", "image", "paragraph"]);

  const grownBox = await calloutBox(callout).boundingBox();
  await dropImageFile(page, { x: grownBox.x + grownBox.width / 2, y: grownBox.y + grownBox.height - 3 });
  await expect.poll(() => bodyTypes(callout)).toEqual(["paragraph", "image", "paragraph", "image"]);
});
