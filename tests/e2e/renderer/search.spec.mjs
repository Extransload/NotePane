import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  expectEditorToBeFocused,
  modifierShortcut,
  waitForEditorSelection,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

async function typeParagraphs(page, paragraphs) {
  await clickLastEmptyParagraph(page);
  for (const [index, paragraph] of paragraphs.entries()) {
    if (index > 0) {
      await page.keyboard.press("Enter");
    }
    await page.keyboard.insertText(paragraph);
  }
}

// Text locators stay inside the editor: the first line also becomes the
// session title in the sidebar.
function editorText(page, text) {
  return page.locator(".bn-editor").getByText(text);
}

function findBar(page) {
  return page.getByRole("search", { name: "Find in note" });
}

test("finds, steps through and clears matches in the current note", async ({ page }) => {
  await typeParagraphs(page, ["needle one needle two", "Needle three"]);

  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await expect(input).toBeFocused();
  await input.fill("needle");

  await expect(page.locator(".bn-editor .notepane-find-match")).toHaveCount(3);
  await expect(findBar(page)).toContainText("1 / 3");
  await input.press("Enter");
  await expect(findBar(page)).toContainText("2 / 3");
  await input.press("Shift+Enter");
  await input.press("Shift+Enter");
  await expect(findBar(page)).toContainText("3 / 3");
  await expect(page.locator(".bn-editor .notepane-find-match.is-current"))
    .toHaveText("Needle");

  await input.press("Escape");
  await expect(findBar(page)).toHaveCount(0);
  await expect(page.locator(".bn-editor .notepane-find-match")).toHaveCount(0);
  await expectEditorToBeFocused(page);
  await expect.poll(() => page.evaluate(() => String(window.getSelection())))
    .toBe("Needle");
});

test("matches Korean text, including decomposed Hangul", async ({ page }) => {
  await typeParagraphs(page, ["한글 검색 테스트", "한글 문서"]);

  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("한글");

  await expect(findBar(page)).toContainText("1 / 2");
});

test("ignores Enter that commits an IME composition in the find input", async ({ page }) => {
  await typeParagraphs(page, ["needle needle needle"]);
  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("needle");
  await expect(findBar(page)).toContainText("1 / 3");

  await input.evaluate((element) => {
    element.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: "Enter",
    }));
  });
  await expect(findBar(page)).toContainText("1 / 3");

  await input.press("Enter");
  await expect(findBar(page)).toContainText("2 / 3");
});

test("expands a collapsed toggle that holds the current match", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.insertText("Parent toggle");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("hidden needle");
  const wrapper = page.locator(".bn-toggle-wrapper").filter({ hasText: "Parent toggle" });
  await wrapper.locator(".bn-toggle-button").first().click();
  await expect(wrapper).toHaveAttribute("data-show-children", "false");

  await editorText(page, "Parent toggle").click();
  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("needle");
  await input.press("Enter");

  await expect(wrapper).toHaveAttribute("data-show-children", "true");
  await expect(editorText(page, "hidden needle")).toBeVisible();
});

test("updates the match count while the note is edited", async ({ page }) => {
  await typeParagraphs(page, ["needle needle"]);
  await page.keyboard.press(modifierShortcut("F"));
  await findBar(page).getByRole("textbox", { name: "Find in note" }).fill("needle");
  await expect(findBar(page)).toContainText("/ 2");

  await editorText(page, "needle needle").click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" needle");

  await expect(findBar(page)).toContainText("/ 3");
});

test("seeds the find input from a single-block text selection", async ({ page }) => {
  await typeParagraphs(page, ["select this word"]);
  await editorText(page, "select this word").dblclick();
  await waitForEditorSelection(page);
  const selected = await page.evaluate(() => String(window.getSelection()).trim());

  await page.keyboard.press(modifierShortcut("F"));

  await expect(findBar(page).getByRole("textbox", { name: "Find in note" }))
    .toHaveValue(selected);
});

test("Enter in the find input never edits a toggle under the caret", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.insertText("toggle needle");
  const blocks = page.locator(".bn-editor .bn-block-outer");
  const blockCount = await blocks.count();

  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("needle");
  await input.press("Enter");
  await input.press("Escape");

  await expect(blocks).toHaveCount(blockCount);
});

// One insertText is one undo step. If find recorded anything in history,
// the single Mod+Z below would undo that instead and the text would remain.
test("leaves undo history to the last real edit", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.insertText("undo me later");
  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("undo");
  await input.press("Enter");
  await input.press("Escape");

  await page.keyboard.press(modifierShortcut("Z"));

  await expect(editorText(page, "undo me later")).toHaveCount(0);
});

function palette(page) {
  return page.getByRole("dialog", { name: "Search notes" });
}

test("opens the note search palette and lands on a match in the current note", async ({ page }) => {
  await typeParagraphs(page, ["palette target text", "second palette line"]);

  await page.keyboard.press(modifierShortcut("P"));
  const input = palette(page).getByRole("textbox", { name: "Search notes" });
  await expect(input).toBeFocused();
  await expect(palette(page).getByRole("option")).toHaveCount(1);

  await input.fill("zzz-not-there");
  await expect(palette(page)).toContainText("No matching notes");

  await input.fill("palette");
  await expect(palette(page).getByRole("option")).toHaveCount(1);
  await input.press("Enter");

  await expect(palette(page)).toHaveCount(0);
  await expect(findBar(page).getByRole("textbox", { name: "Find in note" }))
    .toHaveValue("palette");
  await expect(findBar(page)).toContainText("/ 2");
});

test("closes the note search palette with Escape and returns to the editor", async ({ page }) => {
  await typeParagraphs(page, ["escape check"]);
  await page.keyboard.press(modifierShortcut("P"));
  await palette(page).getByRole("textbox", { name: "Search notes" }).press("Escape");

  await expect(palette(page)).toHaveCount(0);
  await expectEditorToBeFocused(page);
});

test("uses a blank palette query as a plain note switch without opening find", async ({ page }) => {
  await typeParagraphs(page, ["switch only"]);
  await page.keyboard.press(modifierShortcut("P"));
  await palette(page).getByRole("textbox", { name: "Search notes" }).press("Enter");

  await expect(palette(page)).toHaveCount(0);
  await expect(findBar(page)).toHaveCount(0);
  await expectEditorToBeFocused(page);
});

test("hands the trimmed palette query to find", async ({ page }) => {
  await typeParagraphs(page, ["trim target"]);
  await page.keyboard.press(modifierShortcut("P"));
  const input = palette(page).getByRole("textbox", { name: "Search notes" });
  await input.fill("target ");
  await input.press("Enter");

  await expect(findBar(page).getByRole("textbox", { name: "Find in note" })).toHaveValue("target");
  await expect(findBar(page)).toContainText("1 / 1");
});

test("closes find with Escape after clicking the step buttons", async ({ page }) => {
  await typeParagraphs(page, ["needle needle"]);
  await page.keyboard.press(modifierShortcut("F"));
  await findBar(page).getByRole("textbox", { name: "Find in note" }).fill("needle");
  await findBar(page).getByRole("button", { name: "Next match" }).click();
  await expect(findBar(page)).toContainText("2 / 2");

  await page.keyboard.press("Escape");

  await expect(findBar(page)).toHaveCount(0);
});

async function typeCollapsedToggle(page, title, child) {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.insertText(title);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(child);
  const wrapper = page.locator(".bn-toggle-wrapper").filter({ hasText: title });
  await wrapper.locator(".bn-toggle-button").first().click();
  await expect(wrapper).toHaveAttribute("data-show-children", "false");
  return wrapper;
}

test("typing a find query leaves collapsed toggles closed until a step", async ({ page }) => {
  const wrapper = await typeCollapsedToggle(page, "Quiet toggle", "hidden quokka");
  await editorText(page, "Quiet toggle").click();
  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });

  await input.pressSequentially("quokka");
  await expect(findBar(page)).toContainText("1 / 1");
  await expect(wrapper).toHaveAttribute("data-show-children", "false");

  await input.press("Enter");
  await expect(wrapper).toHaveAttribute("data-show-children", "true");
  await expect(editorText(page, "hidden quokka")).toBeVisible();
});

test("find opened from the palette expands the toggle holding the match", async ({ page }) => {
  const wrapper = await typeCollapsedToggle(page, "Palette toggle", "hidden wombat");
  await editorText(page, "Palette toggle").click();
  await page.keyboard.press(modifierShortcut("P"));
  const input = palette(page).getByRole("textbox", { name: "Search notes" });
  await input.fill("wombat");
  await input.press("Enter");

  await expect(findBar(page)).toContainText("1 / 1");
  await expect(wrapper).toHaveAttribute("data-show-children", "true");
});

// A preload bridge with two stored notes and no stored colours, so both tabs are plain. The first
// note is tagged #guide and #launch and sits in no folder; the second is tagged #launch and sits in
// the folder Work.
// `__searchBridge.addNote` stores a note the way another window would, without telling this one;
// `__searchBridge.broadcast` then sends the main process's notes-changed message.
function stubTwoNoteBridge() {
  const now = Date.now();
  const makeNote = (index, title, theme = {}, tags = [], folderId = null) => ({
    id: `search-note-${index + 1}`,
    title,
    titleManuallyEdited: true,
    blocksJSON: null,
    markdown: "",
    theme,
    tags,
    folderId,
    seedDemoContent: false,
    editorFontFamily: "Inter",
    trashedAt: null,
    sortOrder: index + 1,
    createdAt: now + index,
    updatedAt: now + index,
  });
  const folders = [{ id: "search-folder-work", name: "Work", collapsed: false }];
  const notes = [
    makeNote(0, "First stored note", {}, ["guide", "launch"]),
    makeNote(1, "Second stored note", {}, ["launch"], "search-folder-work"),
  ];
  let notesChangedListener = null;
  const broadcast = () => notesChangedListener?.({ notes: [...notes], folders: [...folders] });
  window.__searchBridge = {
    addNote: (title, theme) => notes.push(makeNote(notes.length, title, theme)),
    broadcast,
  };
  window.blocknoteSticky = {
    getCurrentNoteId: async () => notes[0].id,
    getNote: async (noteId) => notes.find((note) => note.id === noteId) ?? notes[0],
    listNotes: async () => [...notes],
    listFolders: async () => [...folders],
    setNoteTags: async ({ noteId, tags }) => {
      const note = notes.find((candidate) => candidate.id === noteId);
      note.tags = [...tags];
      broadcast();
      return note;
    },
    listTrash: async () => [],
    getAppTheme: async () => ({ themeId: "notepane-light", mode: "light" }),
    getLayoutMode: async () => "tabs",
    getEditorPreferences: async () => ({}),
    listFonts: async () => [],
    saveContent: async () => undefined,
    updateAppearance: async () => undefined,
    onNotesChanged: (callback) => {
      notesChangedListener = callback;
      return () => {
        notesChangedListener = null;
      };
    },
  };
}

test("marks a search result like the note's own tab, notes from other windows included", async ({ page }) => {
  await page.addInitScript(stubTwoNoteBridge);
  await page.reload();
  const tabColour = (title) =>
    page.locator(".session-tab-row").filter({ hasText: title }).evaluate((row) => getComputedStyle(row).backgroundColor);
  const dot = (title) =>
    palette(page).getByRole("option", { name: new RegExp(title) }).locator(".search-result-dot");
  const dotColour = (title) => dot(title).evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect(page.locator(".session-tab-row")).toHaveCount(2);

  // Another window stores a third note with a colour of its own; this window has not heard of it
  // yet, but the palette searches the stored notes.
  await page.evaluate(() => window.__searchBridge.addNote("Third stored note", { tabTextColor: "#d9efff" }));
  await page.keyboard.press(modifierShortcut("P"));
  await expect(palette(page).getByRole("option")).toHaveCount(3);
  // A note without a colour gets a plain ring, as its tab gets no fill.
  await expect(dot("Second stored note")).toHaveClass(/\bis-plain\b/);
  await expect(dot("Third stored note")).not.toHaveClass(/\bis-plain\b/);
  const thirdDot = await dotColour("Third stored note");
  await palette(page).getByRole("textbox", { name: "Search notes" }).press("Escape");

  // Once this window hears of the third note, its tab shows the colour its dot showed.
  await page.evaluate(() => window.__searchBridge.broadcast());
  await expect(page.locator(".session-tab-row")).toHaveCount(3);
  expect(thirdDot).toBe(await tabColour("Third stored note"));
  await expect(page.locator(".session-tab-row").filter({ hasText: "Second stored note" })).toHaveClass(/\bis-plain\b/);
  expect(await tabColour("Second stored note")).toBe("rgba(0, 0, 0, 0)");
});

test("refining the find query stays on the current match", async ({ page }) => {
  await typeParagraphs(page, ["needle thin", "needle one", "needle two", "needle three"]);
  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("needle");
  await expect(findBar(page)).toContainText("1 / 4");
  await input.press("Enter");
  await input.press("Enter");
  await expect(page.locator(".bn-editor .notepane-find-match.is-current")).toHaveText("needle");
  await expect(findBar(page)).toContainText("3 / 4");

  // "needle two" still matches, so it stays current.
  await input.pressSequentially(" t");
  await expect(findBar(page)).toContainText("2 / 3");
  await expect(page.locator(".bn-editor .notepane-find-match.is-current")).toHaveText("needle t");
  await expect(page.locator(".bn-editor p").filter({ has: page.locator(".is-current") }))
    .toHaveText("needle two");

  // It no longer matches, so the nearest match after it becomes current.
  await input.pressSequentially("h");
  await expect(findBar(page)).toContainText("2 / 2");
  await expect(page.locator(".bn-editor p").filter({ has: page.locator(".is-current") }))
    .toHaveText("needle three");
});

test("sizes the search palette to its results and labels their matches and edit time", async ({ page }) => {
  await typeParagraphs(page, ["sizing probe once", "sizing probe twice"]);
  await page.keyboard.press(modifierShortcut("P"));
  const input = palette(page).getByRole("textbox", { name: "Search notes" });
  await input.fill("probe");
  const option = palette(page).getByRole("option");
  await expect(option).toHaveCount(1);
  await expect(option.locator(".search-result-count")).toHaveText("2 matches");
  await expect(option.locator("time")).toHaveText("just now");
  await input.fill("probe once");
  await expect(option.locator(".search-result-count")).toHaveText("1 match");

  // As tall as the field and the one result, not the palette's maximum height.
  const heights = await page.evaluate(() => {
    const box = document.querySelector(".search-palette");
    const parts = [...box.children].reduce((sum, child) => sum + child.getBoundingClientRect().height, 0);
    return { box: box.getBoundingClientRect().height, parts };
  });
  expect(Math.abs(heights.box - heights.parts)).toBeLessThanOrEqual(2);
  expect(heights.box).toBeLessThan(160);
});

test("scrolls a long search result list and keeps the keyboard selection in view", async ({ page }) => {
  await page.addInitScript(stubTwoNoteBridge);
  await page.reload();
  await expect(page.locator(".session-tab-row")).toHaveCount(2);
  await page.evaluate(() => {
    for (let index = 3; index <= 24; index += 1) {
      window.__searchBridge.addNote(`Stored note ${index}`);
    }
  });
  await page.keyboard.press(modifierShortcut("P"));
  await expect(palette(page).getByRole("option")).toHaveCount(24);

  // At most the look's default height, 72% of the window (Settings › Appearance › Search palette).
  const maxHeight = await page.evaluate(() => window.innerHeight * 0.72);
  const box = await palette(page).boundingBox();
  expect(box.height).toBeLessThanOrEqual(maxHeight + 1);

  // Up from the first result wraps to the last, which scrolls into view.
  await palette(page).getByRole("textbox", { name: "Search notes" }).press("ArrowUp");
  const last = palette(page).getByRole("option").last();
  await expect(last).toHaveAttribute("aria-selected", "true");
  await expect.poll(async () => {
    const list = await palette(page).getByRole("listbox").boundingBox();
    const item = await last.boundingBox();
    return item.y >= list.y - 1 && item.y + item.height <= list.y + list.height + 1;
  }).toBe(true);
});

function searchFilters(page) {
  return palette(page).getByRole("group", { name: "Search filters" });
}

test("a #tag in the palette query keeps only the notes carrying it", async ({ page }) => {
  await page.addInitScript(stubTwoNoteBridge);
  await page.reload();
  await expect(page.locator(".session-tab-row")).toHaveCount(2);
  await page.keyboard.press(modifierShortcut("P"));
  const input = palette(page).getByRole("textbox", { name: "Search notes" });
  const options = palette(page).getByRole("option");
  await expect(options).toHaveCount(2);

  // A filter with no text lists every note it keeps.
  await input.fill("#launch");
  await expect(options).toHaveCount(2);
  await input.fill("#Guide");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("First stored note");
  await expect(searchFilters(page).getByRole("button", { name: "#guide" })).toHaveAttribute("aria-pressed", "true");
  await expect(searchFilters(page).getByRole("button", { name: "#launch" })).toHaveAttribute("aria-pressed", "false");

  // Tags and text together: the text is matched within the tagged notes only.
  await input.fill("#launch second");
  await expect(options).toHaveCount(1);
  const second = options.first();
  await expect(second).toContainText("Second stored note");
  await expect(second.locator(".search-result-folder")).toHaveText("Work");
  await expect(second.locator(".search-result-tags")).toHaveText("#launch");

  await input.fill("#nosuchtag");
  await expect(options).toHaveCount(0);
  await expect(palette(page)).toContainText("No matching notes");
});

test("folder and tag chips filter the palette and keep the query in step", async ({ page }) => {
  await page.addInitScript(stubTwoNoteBridge);
  await page.reload();
  await expect(page.locator(".session-tab-row")).toHaveCount(2);
  await page.keyboard.press(modifierShortcut("P"));
  const input = palette(page).getByRole("textbox", { name: "Search notes" });
  const options = palette(page).getByRole("option");
  const allFolders = searchFilters(page).getByRole("button", { name: "All folders" });
  const work = searchFilters(page).getByRole("button", { name: "Work" });
  await expect(allFolders).toHaveAttribute("aria-pressed", "true");

  await work.click();
  await expect(input).toHaveValue("folder:Work ");
  await expect(input).toBeFocused();
  await expect(work).toHaveAttribute("aria-pressed", "true");
  await expect(allFolders).toHaveAttribute("aria-pressed", "false");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("Second stored note");

  // A tag chip adds to the folder filter; the second note is not tagged #guide.
  await searchFilters(page).getByRole("button", { name: "#guide" }).click();
  await expect(input).toHaveValue("folder:Work #guide ");
  await expect(options).toHaveCount(0);

  await allFolders.click();
  await expect(input).toHaveValue("#guide ");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("First stored note");

  // A typed folder: token presses its chip, and clicking a pressed chip clears it.
  await input.fill("folder:work");
  await expect(work).toHaveAttribute("aria-pressed", "true");
  await work.click();
  await expect(input).toHaveValue("");
  await expect(options).toHaveCount(2);
});

test("a tag chip on a note opens the palette filtered to its tag", async ({ page }) => {
  await page.addInitScript(stubTwoNoteBridge);
  await page.reload();
  const noteTags = page.getByRole("group", { name: "Note tags" });
  await expect(noteTags.getByRole("button", { name: "#guide" })).toBeVisible();
  await expect(noteTags.getByRole("button", { name: "#launch" })).toBeVisible();

  await noteTags.getByRole("button", { name: "#guide" }).click();
  const input = palette(page).getByRole("textbox", { name: "Search notes" });
  await expect(input).toHaveValue("#guide ");
  await expect(palette(page).getByRole("option")).toHaveCount(1);
  await expect(palette(page).getByRole("option").first()).toContainText("First stored note");
});

// The shortcut that opens a panel closes it again, from the field inside it too.
test("the same shortcut closes the search palette, find bar, Settings and export menu", async ({ page }) => {
  await typeParagraphs(page, ["needle"]);
  const paletteDialog = page.getByRole("dialog", { name: "Search notes" });
  const settingsWindow = page.getByRole("dialog", { name: "Preferences window" });
  const exportMenu = page.getByRole("menu", { name: "Export format" });

  for (const [shortcut, panel] of [
    ["P", paletteDialog],
    ["F", findBar(page)],
    [",", settingsWindow],
    ["Shift+E", exportMenu],
  ]) {
    await page.keyboard.press(modifierShortcut(shortcut));
    await expect(panel).toBeVisible();
    await page.keyboard.press(modifierShortcut(shortcut));
    await expect(panel).toHaveCount(0);
    await page.keyboard.press(modifierShortcut(shortcut));
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  }
});

// Cmd+P runs commands too: typed words list matching commands above the notes, ">" lists only
// commands, and Enter runs the selected one with its shortcut shown beside it.
test("runs commands from the search palette", async ({ page }) => {
  await typeParagraphs(page, ["A note about themes"]);
  const paletteDialog = page.getByRole("dialog", { name: "Search notes" });
  const input = paletteDialog.getByRole("textbox", { name: "Search notes" });

  await page.keyboard.press(modifierShortcut("P"));
  await input.fill(">");
  await expect(paletteDialog.locator(".search-result")).toHaveCount(0);
  await expect(paletteDialog.getByRole("option", { name: /^New note/ })).toBeVisible();
  await expect(paletteDialog.getByRole("option", { name: /^Find in note/ }).locator("kbd")).not.toBeEmpty();

  // Words match commands and notes alike; the commands come first.
  await input.fill("theme nord");
  const options = paletteDialog.getByRole("option");
  await expect(options.first()).toHaveText(/Theme: Nord/);
  await input.press("Enter");
  await expect(paletteDialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.themeId)).toBe("nord");

  await page.keyboard.press(modifierShortcut("P"));
  await input.fill(">no such command");
  await expect(paletteDialog).toContainText("No matching commands");
  await input.fill(">new folder");
  await input.press("Enter");
  await expect(page.getByLabel("Folder name")).toBeFocused();
});

test("Tab stays inside the search palette, and Escape closes it from a filter chip", async ({ page }) => {
  const paletteDialog = page.getByRole("dialog", { name: "Search notes" });
  const input = paletteDialog.getByRole("textbox", { name: "Search notes" });
  await page.keyboard.press(modifierShortcut("P"));
  await input.fill(">new folder");
  await input.press("Enter");
  await page.getByLabel("Folder name").fill("Work");
  await page.getByLabel("Folder name").press("Enter");

  await page.keyboard.press(modifierShortcut("P"));
  await expect(input).toBeFocused();
  const allFolders = paletteDialog.getByRole("button", { name: "All folders" });
  const workChip = paletteDialog.getByRole("button", { name: "Work" });
  await page.keyboard.press("Tab");
  await expect(allFolders).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(workChip).toBeFocused();
  // Past the last chip, Tab comes back to the query field, and Shift+Tab goes round the other way.
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(workChip).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(paletteDialog).toHaveCount(0);
});

test("Settings sizes the search palette: its width and the size of its titles", async ({ page }) => {
  const paletteDialog = page.getByRole("dialog", { name: "Search notes" });
  const readPalette = async () => {
    await page.keyboard.press(modifierShortcut("P"));
    await expect(paletteDialog.getByRole("option").first()).toBeVisible();
    const look = {
      // Its layout width: the palette scales in as it opens.
      width: await paletteDialog.evaluate((element) => element.offsetWidth),
      titleSize: await paletteDialog.locator(".search-result-title").first()
        .evaluate((element) => getComputedStyle(element).fontSize),
    };
    await page.keyboard.press("Escape");
    await expect(paletteDialog).toHaveCount(0);
    return look;
  };
  expect(await readPalette()).toEqual({ width: 720, titleSize: "14px" });

  await page.keyboard.press(modifierShortcut(","));
  const settings = page.getByRole("dialog", { name: "Preferences window" });
  await settings.getByRole("tab", { name: "Appearance" }).click();
  await settings.getByRole("slider", { name: "Search palette width" }).focus();
  await page.keyboard.press("End");
  await settings.getByRole("slider", { name: "Search palette text size" }).focus();
  await page.keyboard.press("End");
  await settings.getByRole("button", { name: "Close preferences" }).click();
  await expect(settings).toHaveCount(0);

  expect(await readPalette()).toEqual({ width: 1040, titleSize: "18px" });
});
