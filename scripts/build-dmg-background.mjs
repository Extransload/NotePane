// Renders the macOS installer window background into build/background.tiff
// (1x and 2x in one file, so the window stays sharp on Retina screens). The
// window size and the icon positions come from electron-builder.config.cjs
// `dmg`, so the trays and the arrow always line up with the icons.
//
// Finder draws the icon labels itself, black in Light Mode and white in Dark
// Mode, and the image cannot change with the appearance. The icons and their
// labels therefore sit on mid-tone trays that both colours read on (about 4.5:1
// each); a step on the light area uses a fixed dark colour, a tray caption white.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const projectRoot = process.cwd();
const { dmg } = createRequire(import.meta.url)("../electron-builder.config.cjs");
const outputPath = path.join(projectRoot, "build", "background.tiff");

if (process.platform !== "darwin") {
  throw new Error("The installer background needs macOS tiffutil.");
}

const { width, height } = dmg.window;
const findIcon = (predicate) => {
  const entry = dmg.contents.find(predicate);
  if (!entry) {
    throw new Error("electron-builder.config.cjs `dmg.contents` is missing an icon this layout draws");
  }
  return entry;
};
const app = findIcon((entry) => entry.type === undefined);
const applications = findIcon((entry) => entry.path === "/Applications");
const settings = findIcon((entry) => entry.path?.endsWith("System Settings.app"));

// Each tray holds a row of icons, its step as a caption above them and Finder's
// labels below; the steps that need no icon follow the tray as plain lines.
const rows = [
  {
    icons: [app, applications],
    caption: "Drag NotePane to Applications",
    after: ["Open NotePane. The first time, macOS stops it: click <strong>Done</strong>."],
  },
  {
    icons: [settings],
    caption: "Open System Settings",
    after: [
      "In <strong>Privacy &amp; Security</strong>, scroll down to Security and click <strong>Open Anyway</strong>.",
      "Click <strong>Open Anyway</strong> again and enter your Mac password.",
    ],
  },
];

// Finder centres an 80px icon on (x, y) and puts its label underneath.
const ICON_HALF = 40;
const LABEL_DEPTH = 64;
const CAPTION_SPACE = 40;
const STEP_GAP = 12;
const STEP_HEIGHT = 26;
// Title, path and status bars that Finder may draw over the bottom of the window.
const FINDER_BARS = 85;

let step = 0;
let contentBottom = 0;
const parts = [];
for (const row of rows) {
  const rowY = row.icons[0].y;
  const top = rowY - ICON_HALF - CAPTION_SPACE;
  const bottom = rowY + LABEL_DEPTH;
  if (top < contentBottom + STEP_GAP) {
    throw new Error(`The tray for "${row.caption}" overlaps the step above it; move its icons down`);
  }
  step += 1;
  parts.push(`<div class="tray" style="top: ${top}px; height: ${bottom - top}px"></div>`);
  parts.push(`<div class="caption" style="top: ${top + 12}px"><span class="number">${step}</span>${row.caption}</div>`);
  contentBottom = bottom;
  for (const line of row.after) {
    step += 1;
    const lineTop = contentBottom + STEP_GAP;
    parts.push(`<div class="step" style="top: ${lineTop}px"><span class="number">${step}</span>${line}</div>`);
    contentBottom = lineTop + STEP_HEIGHT - STEP_GAP;
  }
}
if (contentBottom > height - FINDER_BARS) {
  throw new Error(`The steps end at ${contentBottom}px, inside the bottom ${FINDER_BARS}px that Finder bars can hide`);
}

const arrowStart = app.x + 58;
const arrowEnd = applications.x - 58;
const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; }
  body {
    background: linear-gradient(180deg, #fafaf8, #f1f0ec);
    font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif;
    color: #37352f;
    position: relative;
  }
  .title {
    position: absolute; top: 16px; left: 0; right: 0;
    text-align: center; font-size: 17px; font-weight: 600; letter-spacing: -0.01em;
  }
  .tray {
    position: absolute; left: 28px; right: 28px;
    border-radius: 16px; background: #78766f;
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.18), 0 1px 2px rgb(0 0 0 / 0.12);
  }
  .caption, .step {
    position: absolute; left: 44px; right: 40px;
    font-size: 13px; line-height: 18px;
  }
  .caption { color: #ffffff; font-weight: 600; }
  .step { color: #37352f; }
  .number {
    display: inline-block; width: 20px; height: 20px; margin-right: 8px;
    border-radius: 50%; text-align: center; line-height: 20px;
    font-size: 12px; font-weight: 700;
  }
  .caption .number { background: #ffffff; color: #5d5b55; }
  .step .number { background: #78766f; color: #ffffff; }
  svg { position: absolute; inset: 0; }
</style>
</head>
<body>
  <div class="title">Install NotePane</div>
  ${parts.join("\n  ")}
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <line x1="${arrowStart}" y1="${app.y}" x2="${arrowEnd - 10}" y2="${app.y}"
      stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 9" />
    <path d="M ${arrowEnd - 13} ${app.y - 8} L ${arrowEnd} ${app.y} L ${arrowEnd - 13} ${app.y + 8}"
      fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
</body>
</html>`;

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "notepane-dmg-"));
const browser = await chromium.launch();
try {
  const images = [];
  for (const scale of [1, 2]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    await page.setContent(html);
    const imagePath = path.join(temporaryDirectory, scale === 1 ? "background.png" : "background@2x.png");
    await page.screenshot({ path: imagePath });
    await page.close();
    images.push(imagePath);
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  execFileSync("tiffutil", ["-cathidpicheck", ...images, "-out", outputPath], { stdio: "ignore" });
  console.log("Generated build/background.tiff");
} finally {
  await browser.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
