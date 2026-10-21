// Renders the macOS installer window background into build/background.tiff
// (1x and 2x in one file, so the window stays sharp on Retina screens). The
// window size and the icon positions come from electron-builder.config.cjs
// `dmg`, so the cards and the arrow always line up with the icons.
//
// A window with a background picture keeps its light appearance in Dark Mode:
// Finder still draws the icon labels in black (checked on macOS 27). One light
// design therefore reads in both modes, and the image cannot vary by mode anyway.
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

// Each card holds a step and its icons; the steps that need no icon follow the
// card as plain lines.
const rows = [
  {
    caption: "Drag NotePane to Applications",
    icons: [app, applications],
    after: ["Open NotePane. The first time, macOS stops it: click <strong>Done</strong>."],
  },
  {
    caption: "Open System Settings",
    icons: [settings],
    after: [
      "In <strong>Privacy &amp; Security</strong>, scroll down to Security and click <strong>Open Anyway</strong>.",
      "Click <strong>Open Anyway</strong> again and enter your Mac password.",
    ],
  },
];

// Finder centres an 80px icon on (x, y) and centres its 12pt label about 58px
// below that point.
const ICON_HALF = 40;
const LABEL_CENTRE = 58;
const LABEL_HALF = 11;
const CAPTION_SPACE = 34;
const CARD_PADDING = 12;
const STEP_GAP = 12;
const STEP_HEIGHT = 26;
// Title, path and status bars that Finder may draw over the bottom of the window
// (about 85px, measured), plus a margin.
const FINDER_BARS = 100;

let step = 0;
let contentBottom = 0;
const parts = [];
for (const row of rows) {
  const rowY = row.icons[0].y;
  const captionTop = rowY - ICON_HALF - CAPTION_SPACE;
  const cardTop = captionTop - CARD_PADDING;
  const cardBottom = rowY + LABEL_CENTRE + LABEL_HALF + CARD_PADDING;
  if (cardTop < contentBottom + STEP_GAP) {
    throw new Error(`The card for "${row.caption}" overlaps the step above it; move its icons down`);
  }
  step += 1;
  parts.push(`<div class="card" style="top: ${cardTop}px; height: ${cardBottom - cardTop}px"></div>`);
  parts.push(`<div class="step" style="top: ${captionTop}px"><span class="number">${step}</span><strong>${row.caption}</strong></div>`);
  contentBottom = cardBottom;
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
  .card {
    position: absolute; left: 28px; right: 28px;
    border-radius: 14px; background: #ffffff;
    border: 1px solid rgb(55 53 47 / 0.10);
    box-shadow: 0 1px 2px rgb(55 53 47 / 0.06);
  }
  .step {
    position: absolute; left: 44px; right: 40px;
    font-size: 13px; line-height: 18px; color: #37352f;
  }
  .number {
    display: inline-block; width: 20px; height: 20px; margin-right: 8px;
    border-radius: 50%; text-align: center; line-height: 20px;
    font-size: 12px; font-weight: 700; background: #78766f; color: #ffffff;
  }
  svg { position: absolute; inset: 0; }
</style>
</head>
<body>
  <div class="title">Install NotePane</div>
  ${parts.join("\n  ")}
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <line x1="${arrowStart}" y1="${app.y}" x2="${arrowEnd - 10}" y2="${app.y}"
      stroke="#9a978f" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 9" />
    <path d="M ${arrowEnd - 13} ${app.y - 8} L ${arrowEnd} ${app.y} L ${arrowEnd - 13} ${app.y + 8}"
      fill="none" stroke="#9a978f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
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
