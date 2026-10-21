// Renders the macOS installer window background into build/background.tiff
// (1x and 2x in one file, so the window stays sharp on Retina screens). The
// window size and the icon positions come from electron-builder.config.cjs
// `dmg`, so the cards, label pills and arrow always line up with the icons.
//
// Finder draws the icon labels itself, black in Light Mode and white in Dark
// Mode, and the image cannot change with the appearance. Each label therefore
// sits on a small mid-tone pill that both colours read on (about 4.5:1 each);
// everything else is a light design with dark text.
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
// card as plain lines. A label is the longest text Finder may show for that
// icon (with the extension, for people who show all extensions).
const rows = [
  {
    caption: "Drag NotePane to Applications",
    icons: [
      { entry: app, label: "NotePane.app" },
      { entry: applications, label: "Applications" },
    ],
    after: ["Open NotePane. The first time, macOS stops it: click <strong>Done</strong>."],
  },
  {
    caption: "Open System Settings",
    icons: [{ entry: settings, label: "System Settings.app" }],
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
const PILL_HEIGHT = 22;
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
  const rowY = row.icons[0].entry.y;
  const captionTop = rowY - ICON_HALF - CAPTION_SPACE;
  const cardTop = captionTop - CARD_PADDING;
  const pillTop = rowY + LABEL_CENTRE - PILL_HEIGHT / 2;
  const cardBottom = pillTop + PILL_HEIGHT + CARD_PADDING;
  if (cardTop < contentBottom + STEP_GAP) {
    throw new Error(`The card for "${row.caption}" overlaps the step above it; move its icons down`);
  }
  step += 1;
  parts.push(`<div class="card" style="top: ${cardTop}px; height: ${cardBottom - cardTop}px"></div>`);
  parts.push(`<div class="step" style="top: ${captionTop}px"><span class="number">${step}</span><strong>${row.caption}</strong></div>`);
  for (const { entry, label } of row.icons) {
    parts.push(`<div class="pill" style="left: ${entry.x}px; top: ${pillTop}px">${label}</div>`);
  }
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
  /* Sized by the label text, which stays invisible: Finder draws the real one. */
  .pill {
    position: absolute; transform: translateX(-50%);
    height: ${PILL_HEIGHT}px; padding: 0 11px; border-radius: ${PILL_HEIGHT / 2}px;
    background: #78766f; color: transparent;
    font-size: 12px; line-height: ${PILL_HEIGHT}px; white-space: nowrap;
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
