const fs = require("fs");
const path = require("path");
const { fileURLToPath } = require("url");

// Reads the bytes behind a note media URL so the user can save them. The URL
// comes from note content, which can be pasted or imported, so a file: URL is
// limited to media files and every source is capped in size.

const MAX_ASSET_SOURCE_BYTES = 200 * 1024 * 1024;

const MIME_BY_FILE_EXTENSION = Object.freeze({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
});

async function readAssetFromUrl(
  url,
  { assets, fetch = globalThis.fetch, maxBytes = MAX_ASSET_SOURCE_BYTES } = {},
) {
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("Missing image URL.");
  }
  if (url.startsWith("data:")) {
    return readDataUrl(url);
  }
  if (url.startsWith("notepane-asset:")) {
    const asset = assets?.read(url);
    if (!asset) {
      throw new Error("Image file is missing.");
    }
    return asset;
  }
  if (url.startsWith("file:")) {
    return await readMediaFile(fileURLToPath(url), maxBytes);
  }
  if (/^https?:\/\//i.test(url)) {
    return await downloadMedia(url, fetch, maxBytes);
  }
  throw new Error("Unsupported image URL.");
}

async function readMediaFile(filePath, maxBytes) {
  // The real path is checked too, so a media-named link cannot expose another file.
  const realPath = await fs.promises.realpath(filePath);
  const mimeType = mimeForFile(filePath);
  if (!mimeType || mimeForFile(realPath) !== mimeType) {
    throw new Error("This file is not an image or media file.");
  }
  const stats = await fs.promises.stat(realPath);
  if (!stats.isFile()) {
    throw new Error("This path is not a regular file.");
  }
  if (stats.size > maxBytes) {
    throw tooLargeError(maxBytes);
  }
  const buffer = await fs.promises.readFile(realPath);
  // The file can grow between stat and read.
  if (buffer.length > maxBytes) {
    throw tooLargeError(maxBytes);
  }
  return { buffer, mimeType };
}

async function downloadMedia(url, fetch, maxBytes) {
  const response = await fetch(url);
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(`Image download failed with HTTP ${response.status}.`);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw tooLargeError(maxBytes);
  }

  // The declared length can be missing or wrong, so the stream is counted too.
  const chunks = [];
  let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw tooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  }

  return {
    buffer: Buffer.concat(chunks, total),
    mimeType: response.headers.get("content-type")?.split(";")[0].trim() || "image/png",
  };
}

function readDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL.");
  }
  const mimeType = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const data = match[3] || "";
  return {
    buffer: isBase64
      ? Buffer.from(data, "base64")
      : Buffer.from(decodeURIComponent(data), "utf8"),
    mimeType,
  };
}

function mimeForFile(filePath) {
  return MIME_BY_FILE_EXTENSION[path.extname(filePath).toLowerCase()] ?? null;
}

function tooLargeError(maxBytes) {
  return new Error(`This file is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`);
}

module.exports = { MAX_ASSET_SOURCE_BYTES, readAssetFromUrl };
