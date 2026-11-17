const fs = require("fs");
const path = require("path");
const { createHash } = require("crypto");
const { readAssetFromUrl } = require("./assetSources.cjs");
const { MIME_BY_EXTENSION } = require("./assetStore.cjs");

// A media block opens in the default app of its file type. Its bytes may be an asset named by
// its hash, a data URL, or a linked local file, so NotePane opens a copy named after the block
// instead. readAssetFromUrl limits a linked file to media files, so a note cannot make Open
// launch a program.

const EXTENSION_BY_MIME = Object.freeze(
  Object.fromEntries(Object.entries(MIME_BY_EXTENSION).map(([extension, mime]) => [mime, extension])),
);

function isWebUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

/**
 * Writes the bytes behind `url` to `directory/<content hash>/<fileName>` and returns that path.
 * `fileName` must already be safe as a file name; a name without an extension gets the one of
 * the file's type. The same content opened again reuses its copy.
 */
async function writeOpenableCopy(url, fileName, { assets, directory }) {
  const asset = await readAssetFromUrl(url, { assets });
  const extension = EXTENSION_BY_MIME[asset.mimeType];
  const name = extension && !path.extname(fileName) ? `${fileName}.${extension}` : fileName;
  const folder = path.join(directory, createHash("sha256").update(asset.buffer).digest("hex").slice(0, 16));
  const filePath = path.join(folder, name);
  if (!fs.existsSync(filePath)) {
    await fs.promises.mkdir(folder, { recursive: true });
    await fs.promises.writeFile(filePath, asset.buffer);
  }
  return filePath;
}

module.exports = { isWebUrl, writeOpenableCopy };
