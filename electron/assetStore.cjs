const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { writeFileAtomic } = require("./atomicWrite.cjs");

// Uploaded media lives in content-addressed files instead of base64 data URLs
// inside note JSON. Notes reference a file as
// notepane-asset://local/<sha256-hex>.<ext>. The fixed host keeps the hash in
// the path, which standard-scheme URL parsing never rewrites.

const ASSET_URL_PREFIX = "notepane-asset://local/";
const ASSET_URL_PATTERN = /^notepane-asset:\/\/local\/([0-9a-f]{64})\.([a-z0-9]{1,5})$/;
const ASSET_URL_IN_TEXT_PATTERN = /notepane-asset:\/\/local\/[0-9a-f]{64}\.[a-z0-9]{1,5}/g;
// Only base64 data URLs are externalized. Text data URLs are rare and small.
const BASE64_DATA_URL_PATTERN =
  /data:([\w.+-]+\/[\w.+-]+)(?:;[\w-]+=[^;,"'\s]*)*;base64,([A-Za-z0-9+/=]+)/g;

const EXTENSION_BY_MIME = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
});
const MIME_BY_EXTENSION = Object.freeze(
  Object.fromEntries(
    Object.entries(EXTENSION_BY_MIME).map(([mimeType, extension]) => [extension, mimeType]),
  ),
);

function parseAssetUrl(url) {
  const match = typeof url === "string" ? ASSET_URL_PATTERN.exec(url) : null;
  return match ? { hash: match[1], extension: match[2] } : null;
}

class AssetStore {
  constructor(directory) {
    this.directory = directory;
  }

  static referencedUrls(text) {
    return new Set(String(text ?? "").match(ASSET_URL_IN_TEXT_PATTERN) ?? []);
  }

  put(buffer, mimeType) {
    const hash = createHash("sha256").update(buffer).digest("hex");
    const extension = EXTENSION_BY_MIME[String(mimeType).toLowerCase()] ?? "bin";
    const filePath = path.join(this.directory, `${hash}.${extension}`);
    if (!fs.existsSync(filePath)) {
      writeFileAtomic(filePath, buffer);
    }
    return `${ASSET_URL_PREFIX}${hash}.${extension}`;
  }

  filePathFor(url) {
    const parsed = parseAssetUrl(url);
    return parsed ? path.join(this.directory, `${parsed.hash}.${parsed.extension}`) : null;
  }

  read(url) {
    const parsed = parseAssetUrl(url);
    const filePath = this.filePathFor(url);
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }
    return {
      buffer: fs.readFileSync(filePath),
      mimeType: MIME_BY_EXTENSION[parsed.extension] ?? "application/octet-stream",
    };
  }

  externalizeDataUrls(text) {
    if (typeof text !== "string" || !text.includes(";base64,")) {
      return text;
    }
    return text.replace(BASE64_DATA_URL_PATTERN, (_match, mimeType, payload) =>
      this.put(Buffer.from(payload, "base64"), mimeType),
    );
  }

  inlineAssetUrls(text) {
    if (typeof text !== "string" || !text.includes(ASSET_URL_PREFIX)) {
      return text;
    }
    return text.replace(ASSET_URL_IN_TEXT_PATTERN, (url) => {
      const asset = this.read(url);
      return asset ? `data:${asset.mimeType};base64,${asset.buffer.toString("base64")}` : url;
    });
  }

  collectGarbage(referencedUrls) {
    if (!fs.existsSync(this.directory)) {
      return;
    }
    for (const fileName of fs.readdirSync(this.directory)) {
      const url = `${ASSET_URL_PREFIX}${fileName}`;
      if (parseAssetUrl(url) && !referencedUrls.has(url)) {
        fs.unlinkSync(path.join(this.directory, fileName));
      }
    }
  }
}

function hasBase64DataUrl(text) {
  return typeof text === "string" && /data:[\w.+-]+\/[\w.+-]+(?:;[\w-]+=[^;,"'\s]*)*;base64,/.test(text);
}

module.exports = {
  AssetStore,
  MIME_BY_EXTENSION,
  hasBase64DataUrl,
  parseAssetUrl,
};
