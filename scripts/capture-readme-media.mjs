#!/usr/bin/env node
// Captures the README's screenshots and its tour video from the built app (run `npm run build`
// first): each scene launches Electron on a fresh data folder seeded with demo notes, so nothing
// on this machine is read or changed. Writes docs/images/*.png, docs/images/tour.gif (inline in
// the README) and docs/media/tour.mp4 (for a GitHub upload). Needs ffmpeg and sips (macOS).
//
//   node scripts/capture-readme-media.mjs [scene...]   scenes: desk dark background settings
//                                                       search commands scatter tour
//                                                       (default: all)
import { _electron as electron, chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IMAGES = path.join(ROOT, "docs/images");
const MEDIA = path.join(ROOT, "docs/media");
const WINDOW = { width: 1280, height: 800 };
const MOD = process.platform === "darwin" ? "Meta" : "Control";

const FOLDERS = [
  { id: "work", name: "Work", collapsed: false },
  { id: "reading", name: "Reading", collapsed: false },
];

const RELEASE_NOTES = `# Release notes 0.5

## Highlights

- Folders and tags for every note
- An export window: PDF, Markdown, HTML or an image
- A smooth caret and a launch intro

## Checklist

- [x] Write the changelog
- [x] Record the tour
- [ ] Publish the release`;

const DESIGN_REVIEW = `# Design review

Thursday, with the whole team.

- [x] Plain tabs until a colour is picked
- [x] Settings as a floating window
- [ ] Glass over a background picture

> Keep every control one click away, and every setting findable.`;

const PAPERS = `# Papers to read

1. Local-first software: you own your data
   1. The seven ideals
   2. CRDTs in practice
2. A fast block editor in the browser
3. Tone-matching colours across themes`;

const IDEAS = `# Ideas

- Sticky windows that remember their place
  - One per project
    - Pinned above the editor
- A tag cloud in the search palette
- Export a whole folder at once`;

function seedNotes(directory, { look = {}, themeId = "notepane-light" } = {}) {
  const scheme = themeId === "notepane-light" ? "light" : "dark";
  const now = Date.now();
  const note = (id, fields, index) => ({
    id,
    blocksJSON: null,
    markdown: "",
    theme: {},
    seedDemoContent: false,
    alwaysOnTop: false,
    tags: [],
    folderId: null,
    sortOrder: index + 1,
    createdAt: now - (10 - index) * 3_600_000,
    updatedAt: now - (10 - index) * 600_000,
    bounds: { x: 80 + index * 30, y: 80 + index * 30, ...WINDOW },
    ...fields,
  });
  const notes = [
    note("launch", { title: "Launch checklist", seedDemoContent: true, folderId: "work", tags: ["launch", "q4"] }, 0),
    note("release", { title: "Release notes 0.5", markdown: RELEASE_NOTES, folderId: "work", tags: ["launch"] }, 1),
    note("review", {
      title: "Design review",
      markdown: DESIGN_REVIEW,
      tags: ["design"],
      theme: { tabTextColor: "#ffd7e8", tabTextOpacity: 1 },
    }, 2),
    note("papers", { title: "Papers to read", markdown: PAPERS, folderId: "reading", tags: ["reading"] }, 3),
    note("ideas", { title: "Ideas", markdown: IDEAS, tags: ["ideas"] }, 4),
  ];
  fs.writeFileSync(path.join(directory, "notes.json"), JSON.stringify({
    version: 12,
    appTheme: { themeId, mode: scheme },
    layoutMode: "tabs",
    tabsWindow: { alwaysOnTop: false, bounds: { x: 60, y: 60, ...WINDOW } },
    editorPreferences: { look, launchIntro: true },
    folders: FOLDERS,
    notes,
  }));
}

const PICTURE_LOOK = { background: { type: "picture", picture: "builtin:dawn" } };

async function launch({ seed, intro = false, video = null }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "notepane-readme-"));
  seedNotes(directory, seed);
  const app = await electron.launch({
    args: ["."],
    cwd: ROOT,
    env: {
      ...process.env,
      BLOCKNOTE_STICKY_USER_DATA_DIR: directory,
      BLOCKNOTE_STICKY_QUIET: "1",
      ...(intro ? { BLOCKNOTE_STICKY_LAUNCH_INTRO: "1" } : {}),
    },
    ...(video ? { recordVideo: { dir: video, size: WINDOW } } : {}),
  });
  const page = await app.firstWindow();
  const window = await app.browserWindow(page);
  await window.evaluate((browserWindow, bounds) => browserWindow.setBounds(bounds), { x: 60, y: 60, ...WINDOW });
  await page.getByTestId("sticky-editor-surface").waitFor();
  return { app, page };
}

async function settle(page, ms = 700) {
  await page.waitForTimeout(ms);
}

async function openSession(page, title) {
  await page.getByRole("tab", { name: title }).click();
  await page.locator(".bn-editor").getByText(title.split(" ")[0]).first().waitFor();
  // The template note asks to be kept; keeping it makes it an ordinary note.
  const keep = page.getByRole("button", { name: "Use this template" });
  if (await keep.isVisible().catch(() => false)) {
    await keep.click();
  }
  // Over the title bar, so no tab shows its close button and no block its handle.
  await page.mouse.move(WINDOW.width / 2, 14);
}

async function shot(page, name) {
  const file = path.join(IMAGES, `${name}.png`);
  await page.mouse.move(WINDOW.width / 2, 14);
  await page.screenshot({ path: file });
  // Retina captures come out at twice the size; the README shows them at most 880 wide.
  execFileSync("sips", ["-Z", "1600", file], { stdio: "ignore" });
  console.log(`wrote ${path.relative(ROOT, file)}`);
}

const SCENES = {
  async desk() {
    const { app, page } = await launch({});
    try {
      await openSession(page, "Launch checklist");
      await settle(page);
      await shot(page, "desk-light");
    } finally {
      await app.close();
    }
  },

  async dark() {
    const { app, page } = await launch({ seed: { themeId: "neon-noir" } });
    try {
      await openSession(page, "Launch checklist");
      await settle(page);
      await shot(page, "desk-dark");
    } finally {
      await app.close();
    }
  },

  async background() {
    const { app, page } = await launch({ seed: { look: PICTURE_LOOK } });
    try {
      await openSession(page, "Launch checklist");
      await settle(page);
      await shot(page, "background");
    } finally {
      await app.close();
    }
  },

  async settings() {
    const { app, page } = await launch({ seed: { look: PICTURE_LOOK } });
    try {
      await page.keyboard.press(`${MOD}+,`);
      const settingsWindow = page.getByRole("dialog", { name: "Preferences window" });
      await settingsWindow.getByRole("tab", { name: "Window" }).click();
      await settingsWindow.locator("[data-setting-id='floatingBlur']").scrollIntoViewIfNeeded();
      await settle(page);
      await shot(page, "settings");
    } finally {
      await app.close();
    }
  },

  async search() {
    const { app, page } = await launch({});
    try {
      await openSession(page, "Launch checklist");
      await page.keyboard.press(`${MOD}+p`);
      await page.keyboard.type("#launch", { delay: 40 });
      await settle(page);
      await shot(page, "search");
    } finally {
      await app.close();
    }
  },

  // The palette's commands: ">" lists them all, with their keys.
  async commands() {
    const { app, page } = await launch({});
    try {
      await openSession(page, "Launch checklist");
      await page.keyboard.press(`${MOD}+p`);
      await page.keyboard.type(">", { delay: 40 });
      await settle(page);
      await shot(page, "commands");
    } finally {
      await app.close();
    }
  },

  // The intro, writing with the smooth caret, a tag, search, a folder, then a theme change.
  async tour() {
    const videoDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "notepane-readme-video-"));
    const { app, page } = await launch({ seed: { look: PICTURE_LOOK }, intro: true, video: videoDirectory });
    try {
      await page.getByTestId("launch-intro").waitFor({ state: "detached", timeout: 10_000 });
      await settle(page, 400);
      await openSession(page, "Release notes 0.5");
      await settle(page, 500);
      await page.locator(".bn-editor").getByText("Publish the release").click();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.type("Announce it with the tour video", { delay: 45 });
      await settle(page, 700);

      await page.getByRole("tab", { name: "Design review" }).click();
      await settle(page, 600);
      await page.getByRole("tab", { name: "Papers to read" }).click();
      await settle(page, 600);

      await page.keyboard.press(`${MOD}+p`);
      await page.keyboard.type("#launch", { delay: 70 });
      await settle(page, 1200);
      await page.keyboard.press("Escape");
      await settle(page, 400);

      await page.getByRole("button", { name: "Folder Reading" }).click();
      await settle(page, 600);
      await page.getByRole("button", { name: "Folder Reading" }).click();
      await settle(page, 600);

      // A theme, from the palette's commands.
      await page.keyboard.press(`${MOD}+p`);
      await page.keyboard.type("theme neon", { delay: 70 });
      await settle(page, 900);
      await page.keyboard.press("Enter");
      await settle(page, 1600);
    } finally {
      await app.close();
    }
    const [webm] = fs.readdirSync(videoDirectory).filter((file) => file.endsWith(".webm"));
    const source = path.join(videoDirectory, webm);
    fs.mkdirSync(MEDIA, { recursive: true });
    const mp4 = path.join(MEDIA, "tour.mp4");
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-c:v", "libx264", "-pix_fmt", "yuv420p",
      "-crf", "23", "-movflags", "+faststart", mp4]);
    const gif = path.join(IMAGES, "tour.gif");
    // 10 fps and 128 colours keep the README's GIF near 5 MB; the MP4 keeps the full frame rate.
    const filters = "fps=10,scale=880:-1:flags=lanczos";
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-vf",
      `${filters},split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      gif]);
    console.log(`wrote ${path.relative(ROOT, mp4)} and ${path.relative(ROOT, gif)}`);
  },

  // Sticky windows mode: three notes as pastel windows. Each window is captured on its own (the
  // windows stay off screen, so nothing of this desktop shows) and laid out on a soft backdrop,
  // a little tilted, as if spread across a desk.
  async scatter() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "notepane-readme-"));
    const now = Date.now();
    const STICKY = { width: 440, height: 330 };
    const sticky = (id, title, markdown, color, index) => ({
      id,
      title,
      blocksJSON: null,
      markdown,
      theme: { tabTextColor: color, tabTextOpacity: 1 },
      seedDemoContent: false,
      alwaysOnTop: false,
      tags: [],
      folderId: null,
      sortOrder: index + 1,
      createdAt: now - index,
      updatedAt: now - index,
      bounds: { x: 80 + index * 40, y: 80 + index * 40, ...STICKY },
    });
    fs.writeFileSync(path.join(directory, "notes.json"), JSON.stringify({
      version: 12,
      appTheme: { themeId: "notepane-light", mode: "light" },
      layoutMode: "sticky",
      tabsWindow: { alwaysOnTop: false, bounds: { x: 60, y: 60, ...WINDOW } },
      editorPreferences: { launchIntro: false },
      folders: [],
      notes: [
        sticky("ideas", "Ideas", "# Ideas\n\n- Per-note accent colours\n  - Pastel tabs\n- Folder export", "#d8f3d0", 0),
        sticky("standup", "Standup", "# Standup\n\na) Ship the palette commands\n\nb) Record the tour\n\nc) Cut 0.5.5", "#ffd7e8", 1),
        sticky("reading", "Reading list", "# Reading list\n\n1. Local-first software\n   1. The seven ideals\n2. Block editors", "#fff1b8", 2),
      ],
    }));
    const app = await electron.launch({
      args: ["."],
      cwd: ROOT,
      env: { ...process.env, BLOCKNOTE_STICKY_USER_DATA_DIR: directory, BLOCKNOTE_STICKY_QUIET: "1" },
    });
    const shots = [];
    try {
      await app.firstWindow();
      await expectWindowCount(app, 3);
      for (const page of app.windows()) {
        await page.getByTestId("sticky-editor-surface").waitFor();
        const window = await app.browserWindow(page);
        await window.evaluate((browserWindow, size) => browserWindow.setSize(size.width, size.height), STICKY);
        await settle(page, 500);
        await page.mouse.move(STICKY.width / 2, STICKY.height - 4);
        // No caret and no "type '/'" hint: a window at rest.
        await page.evaluate(() => document.activeElement?.blur());
        await settle(page, 200);
        const noteId = new URL(page.url()).searchParams.get("noteId");
        shots.push({ noteId, png: (await page.screenshot({ omitBackground: true })).toString("base64") });
      }
    } finally {
      await app.close();
    }

    // Where each window lies on the desk, and how it is tilted.
    const placement = {
      ideas: { left: 70, top: 70, rotate: -3 },
      reading: { left: 900, top: 50, rotate: 2.5 },
      standup: { left: 470, top: 300, rotate: -1.2 },
    };
    const cards = shots
      .sort((left, right) => (left.noteId === "standup") - (right.noteId === "standup"))
      .map(({ noteId, png }) => {
        const { left, top, rotate } = placement[noteId];
        return `<img src="data:image/png;base64,${png}" style="left:${left}px;top:${top}px;transform:rotate(${rotate}deg)">`;
      })
      .join("");
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1360, height: 700 }, deviceScaleFactor: 2 });
      await page.setContent(`<!doctype html><style>
        html, body { margin: 0; height: 100%; }
        body { position: relative; overflow: hidden;
          background: radial-gradient(circle at 20% 15%, #f7f5f0, #ecebe5 55%, #e3e7ea); }
        img { position: absolute; width: ${STICKY.width}px; height: ${STICKY.height}px; border-radius: 12px;
          filter: drop-shadow(0 18px 36px rgba(60, 50, 40, 0.18)) drop-shadow(0 2px 6px rgba(60, 50, 40, 0.12)); }
      </style>${cards}`);
      await page.waitForFunction(() => [...document.images].every((image) => image.complete));
      const file = path.join(IMAGES, "scatter.png");
      await page.screenshot({ path: file });
      console.log(`wrote ${path.relative(ROOT, file)}`);
    } finally {
      await browser.close();
    }
  },
};

async function expectWindowCount(app, count) {
  for (let tries = 0; tries < 100 && app.windows().length < count; tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (app.windows().length < count) {
    throw new Error(`Expected ${count} sticky windows, found ${app.windows().length}`);
  }
}

const requested = process.argv.slice(2);
for (const name of requested.length ? requested : Object.keys(SCENES)) {
  if (!SCENES[name]) {
    throw new Error(`Unknown scene ${name}; choose from ${Object.keys(SCENES).join(", ")}`);
  }
  await SCENES[name]();
}
