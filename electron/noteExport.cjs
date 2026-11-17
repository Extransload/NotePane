const fs = require("fs");
const path = require("path");
const { MIME_BY_EXTENSION, parseAssetUrl } = require("./assetStore.cjs");

// The files behind Export beyond the single-note PDF and Markdown: an HTML page, a PNG of the
// whole note, Markdown with its images in a folder beside it, and several notes written into a
// folder at once. Exported files leave the app, so they carry no theme tokens: the HTML page
// draws with the system's default colours unless the caller passes the theme's own colours.

const ASSET_URL_IN_TEXT_PATTERN = /notepane-asset:\/\/local\/[0-9a-f]{64}\.[a-z0-9]{1,5}/g;
// Chromium cannot draw a texture taller than this, so a longer note is cut at this height.
const MAX_PNG_HEIGHT = 16000;

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A complete HTML page around BlockNote's HTML for a note. `colors` ({ background, text }), when
 * given, are the theme's own values; otherwise the browser's defaults apply.
 */
function buildHtmlDocument({ title, bodyHtml, colors = null }) {
  const colorRules = colors
    ? `html { background: ${colors.background}; color: ${colors.text}; }`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${colorRules}
body { max-width: 760px; margin: 48px auto; padding: 0 24px; font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
h1, h2, h3 { line-height: 1.25; }
img, video { max-width: 100%; height: auto; border-radius: 6px; }
pre { overflow: auto; padding: 12px 14px; border-radius: 8px; background: color-mix(in srgb, currentColor 6%, transparent); }
code { font-family: ui-monospace, Menlo, monospace; font-size: 0.9em; }
table { border-collapse: collapse; }
th, td { padding: 6px 10px; border: 1px solid color-mix(in srgb, currentColor 25%, transparent); }
blockquote { margin: 0; padding-left: 14px; border-left: 3px solid color-mix(in srgb, currentColor 25%, transparent); }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

// YAML front matter for a Markdown file: title, tags and dates, so notes apps that read it keep
// them.
function buildFrontMatter({ title, tags = [], createdAt, updatedAt }) {
  const lines = ["---", `title: ${JSON.stringify(String(title ?? ""))}`];
  if (tags.length > 0) {
    lines.push(`tags: [${tags.map((tag) => JSON.stringify(tag)).join(", ")}]`);
  }
  for (const [key, value] of [["created", createdAt], ["updated", updatedAt]]) {
    if (Number.isFinite(value)) {
      lines.push(`${key}: ${new Date(value).toISOString()}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

/**
 * Markdown whose asset links point at copies in `folderName` beside the file instead of being
 * written into it. Returns the rewritten text and the files to write into that folder.
 */
function externalizeMarkdownAssets(markdown, { assets, folderName }) {
  const files = [];
  const names = new Map();
  const text = String(markdown ?? "").replace(ASSET_URL_IN_TEXT_PATTERN, (url) => {
    if (!names.has(url)) {
      const asset = assets.read(url);
      if (!asset) {
        return url;
      }
      const { extension } = parseAssetUrl(url);
      const name = `${files.length + 1}.${MIME_BY_EXTENSION[extension] ? extension : "bin"}`;
      names.set(url, name);
      files.push({ name, buffer: asset.buffer });
    }
    return `${encodeURI(folderName)}/${names.get(url)}`;
  });
  return { markdown: text, files };
}

// "Note", "Note (2)", "Note (3)": two notes with one title must not overwrite each other.
function uniqueFileName(taken, fileName) {
  const extension = path.extname(fileName);
  const base = fileName.slice(0, fileName.length - extension.length);
  let candidate = fileName;
  for (let index = 2; taken.has(candidate.toLowerCase()); index += 1) {
    candidate = `${base} (${index})${extension}`;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Writes `entries` ({ folder: string | null, fileName, content: string | Buffer,
 * extraFiles?: [{ folder, name, buffer }] }) under `directory`, one sub-folder per folder name.
 * Names must already be safe as file names. Returns the paths written.
 */
function writeExportEntries(directory, entries) {
  const takenByFolder = new Map();
  const written = [];
  for (const entry of entries) {
    const folderPath = entry.folder ? path.join(directory, entry.folder) : directory;
    fs.mkdirSync(folderPath, { recursive: true });
    if (!takenByFolder.has(folderPath)) {
      takenByFolder.set(folderPath, new Set());
    }
    const fileName = uniqueFileName(takenByFolder.get(folderPath), entry.fileName);
    const filePath = path.join(folderPath, fileName);
    fs.writeFileSync(filePath, entry.content);
    written.push(filePath);
    for (const extra of entry.extraFiles ?? []) {
      const extraFolder = path.join(folderPath, extra.folder);
      fs.mkdirSync(extraFolder, { recursive: true });
      fs.writeFileSync(path.join(extraFolder, extra.name), extra.buffer);
    }
  }
  return written;
}

/**
 * Renders an HTML page in a hidden window and captures it whole as a PNG buffer. `scale` 1
 * shrinks a Retina capture to the page's CSS width; 2 keeps the sharper pixels.
 */
async function renderHtmlToPng(BrowserWindow, html, { width = 900, scale = 2, tempDirectory }) {
  fs.mkdirSync(tempDirectory, { recursive: true });
  const pagePath = path.join(tempDirectory, `export-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(pagePath, html);
  const window = new BrowserWindow({
    show: false,
    width,
    height: 800,
    useContentSize: true,
    webPreferences: { javascript: true, sandbox: true },
  });
  try {
    await window.loadFile(pagePath);
    const height = Math.min(
      MAX_PNG_HEIGHT,
      await window.webContents.executeJavaScript("Math.ceil(document.documentElement.scrollHeight)"),
    );
    window.setContentSize(width, height);
    // One frame for the resized page to paint before it is captured.
    await window.webContents.executeJavaScript("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    const image = await window.webContents.capturePage({ x: 0, y: 0, width, height });
    const output = scale === 1 && image.getSize().width > width ? image.resize({ width }) : image;
    return output.toPNG();
  } finally {
    window.destroy();
    fs.rmSync(pagePath, { force: true });
  }
}

module.exports = {
  buildFrontMatter,
  buildHtmlDocument,
  externalizeMarkdownAssets,
  renderHtmlToPng,
  uniqueFileName,
  writeExportEntries,
};
