import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  modifierShortcut,
  pastePlainText,
} from "../support/renderer-helpers.mjs";

const PAGE_URL = "https://example.com/article";
const THUMBNAIL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// Runs in the page before the app loads: a desktop bridge whose metadata fetch the test settles
// (`window.__settleBookmark`), keeping the last saved Markdown and every page opened.
function stubBookmarkBridge() {
  const note = {
    id: "bookmark-note",
    title: "Bookmark note",
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
  window.__bookmarkRequests = [];
  window.__opened = [];
  window.open = (...args) => {
    window.__opened.push(args);
    return null;
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
    saveContent: async (payload) => {
      window.__savedMarkdown = payload.markdown;
      return note;
    },
    updateAppearance: async () => undefined,
    listNoteVersions: async () => [],
    fetchBookmarkMetadata: (url) => new Promise((resolve, reject) => {
      window.__bookmarkRequests.push(url);
      window.__settleBookmark = (metadata) => (metadata instanceof Error ? reject(metadata) : resolve(metadata));
    }),
  };
}

async function openWithBridge(page) {
  await page.addInitScript(stubBookmarkBridge);
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
}

const card = (page) => page.locator(".bn-editor").getByTestId("bookmark-card");
const urlField = (page) => page.locator(".bn-editor").getByTestId("bookmark-url-input");

async function insertBookmark(page) {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type("/bookmark");
  const item = page.locator(".bn-suggestion-menu").getByText("Bookmark", { exact: true });
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.locator(".bn-suggestion-menu")).toHaveCount(0);
  await expect(urlField(page)).toBeFocused();
}

async function settleBookmark(page, metadata) {
  await expect.poll(() => page.evaluate(() => typeof window.__settleBookmark)).toBe("function");
  await page.evaluate((value) => {
    window.__settleBookmark(value === "error" ? new Error("offline") : value);
  }, metadata);
}

const ARTICLE = {
  title: "Example article",
  description: "What the article is about",
  siteName: "Example News",
  imageUrl: THUMBNAIL,
};

test("inserts a bookmark from the slash menu and fills its card from the desktop bridge", async ({ page }) => {
  await openWithBridge(page);
  await insertBookmark(page);
  await page.keyboard.type("example.com/article");
  await page.keyboard.press("Enter");

  await expect(card(page)).toHaveAttribute("data-status", "loading");
  await expect(card(page)).toContainText("Loading preview");
  expect(await page.evaluate(() => window.__bookmarkRequests)).toEqual([PAGE_URL]);

  await settleBookmark(page, ARTICLE);
  await expect(card(page)).toHaveAttribute("data-status", "ready");
  await expect(card(page).locator(".notepane-bookmark-title")).toHaveText("Example article");
  await expect(card(page).locator(".notepane-bookmark-description")).toHaveText("What the article is about");
  await expect(card(page).locator(".notepane-bookmark-site-name")).toHaveText("Example News");
  await expect(card(page).locator("img.notepane-bookmark-thumbnail")).toHaveAttribute("src", THUMBNAIL);
  const text = await card(page).locator(".notepane-bookmark-text").boundingBox();
  const thumbnail = await card(page).locator("img.notepane-bookmark-thumbnail").boundingBox();
  expect(thumbnail.x).toBeGreaterThanOrEqual(text.x + text.width - 1);

  // The card filled in without an undo step of its own: one undo takes back the address.
  await page.keyboard.press(modifierShortcut("z"));
  await expect(urlField(page)).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("keeps the address on the card when its preview cannot be read", async ({ page }) => {
  await openWithBridge(page);
  await insertBookmark(page);
  await page.keyboard.type(PAGE_URL);
  await page.keyboard.press("Enter");
  await settleBookmark(page, "error");

  await expect(card(page)).toHaveAttribute("data-status", "error");
  await expect(card(page)).toContainText("Preview unavailable");
  await expect(card(page).locator(".notepane-bookmark-title")).toHaveText(PAGE_URL);
  await expect(card(page).locator(".notepane-bookmark-site-name")).toHaveText("example.com");
});

test("refuses an address that is not a web address", async ({ page }) => {
  await openWithBridge(page);
  await insertBookmark(page);
  await page.keyboard.type("ftp://example.com/file");
  await page.keyboard.press("Enter");

  await expect(urlField(page)).toHaveAttribute("aria-invalid", "true");
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__bookmarkRequests)).toEqual([]);
});

test("opens the page outside the app when the card is clicked", async ({ page }) => {
  await openWithBridge(page);
  await insertBookmark(page);
  await page.keyboard.type(PAGE_URL);
  await page.keyboard.press("Enter");
  await settleBookmark(page, ARTICLE);

  await card(page).click();
  expect(await page.evaluate(() => window.__opened)).toEqual([[PAGE_URL, "_blank", "noopener,noreferrer"]]);
});

test("exports a bookmark to Markdown as a link under its title", async ({ page }) => {
  await openWithBridge(page);
  await insertBookmark(page);
  await page.keyboard.type(PAGE_URL);
  await page.keyboard.press("Enter");
  await settleBookmark(page, ARTICLE);

  await expect.poll(() => page.evaluate(() => window.__savedMarkdown))
    .toContain(`[Example article](${PAGE_URL})`);
});

test("keeps a pasted address a link and turns it into a bookmark from the block menu", async ({ page }) => {
  await openWithBridge(page);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, PAGE_URL);
  const link = page.locator(".bn-editor a").filter({ hasText: PAGE_URL });
  await expect(link).toBeVisible();
  await expect(card(page)).toHaveCount(0);

  const box = await link.boundingBox();
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.move(box.x - 24, box.y + box.height / 2);
  await page.locator(".bn-side-menu").getByRole("button", { name: "Open block menu" }).click();
  const menu = page.locator(".bn-drag-handle-menu:visible");
  await menu.getByRole("menuitem", { name: "Turn into bookmark" }).click();

  await expect(card(page)).toHaveAttribute("data-status", "loading");
  expect(await page.evaluate(() => window.__bookmarkRequests)).toEqual([PAGE_URL]);
  await expect(page.locator(".bn-editor a").filter({ hasText: PAGE_URL })).toHaveCount(0);
});

test("offers no Turn into bookmark for a paragraph with more than a link", async ({ page }) => {
  await openWithBridge(page);
  await clickLastEmptyParagraph(page);
  await pastePlainText(page, PAGE_URL);
  await page.keyboard.type(" and more");
  const paragraph = page.locator(".bn-editor .bn-block-content").filter({ hasText: "and more" });

  const box = await paragraph.boundingBox();
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.move(box.x - 24, box.y + box.height / 2);
  await page.locator(".bn-side-menu").getByRole("button", { name: "Open block menu" }).click();
  const menu = page.locator(".bn-drag-handle-menu:visible");
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Turn into bookmark" })).toHaveCount(0);
});

test("shows the address alone in the browser preview", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
  await insertBookmark(page);
  await page.keyboard.type(PAGE_URL);
  await page.keyboard.press("Enter");

  await expect(card(page)).toHaveAttribute("data-status", "idle");
  await expect(card(page).locator(".notepane-bookmark-title")).toHaveText(PAGE_URL);
  await expect(card(page).locator(".notepane-bookmark-site-name")).toHaveText("example.com");
  await expect(card(page)).not.toContainText("Loading preview");
  await expect(card(page).locator("img")).toHaveCount(0);
});
