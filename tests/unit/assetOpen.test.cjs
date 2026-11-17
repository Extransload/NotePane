const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const test = require("node:test");
const assert = require("node:assert/strict");
const { AssetStore } = require("../../electron/assetStore.cjs");
const { isWebUrl, writeOpenableCopy } = require("../../electron/assetOpen.cjs");

const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "notepane-open-"));
}

test("opens an asset as a copy named after its block, with the extension of its type", async () => {
  const assets = new AssetStore(temporaryDirectory());
  const url = assets.put(PNG_BYTES, "image/png");
  const directory = temporaryDirectory();

  const filePath = await writeOpenableCopy(url, "Launch screen", { assets, directory });

  assert.equal(path.basename(filePath), "Launch screen.png");
  assert.ok(filePath.startsWith(directory));
  assert.deepEqual(fs.readFileSync(filePath), PNG_BYTES);
  // Opening the same content again reuses the copy instead of writing another.
  assert.equal(await writeOpenableCopy(url, "Launch screen", { assets, directory }), filePath);
});

test("keeps a name that already has an extension, and copies a data URL", async () => {
  const directory = temporaryDirectory();
  const dataUrl = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;

  const filePath = await writeOpenableCopy(dataUrl, "photo.jpeg", { directory });

  assert.equal(path.basename(filePath), "photo.jpeg");
  assert.deepEqual(fs.readFileSync(filePath), PNG_BYTES);
});

test("refuses to open a linked file that is not media, so a note cannot launch a program", async () => {
  const source = path.join(temporaryDirectory(), "run.command");
  fs.writeFileSync(source, "#!/bin/sh\n");

  await assert.rejects(
    writeOpenableCopy(pathToFileURL(source).href, "run.command", { directory: temporaryDirectory() }),
    /not an image or media file/,
  );
});

test("sends only http and https addresses to the browser", () => {
  assert.equal(isWebUrl("https://example.com/a.png"), true);
  assert.equal(isWebUrl("HTTP://example.com"), true);
  assert.equal(isWebUrl("file:///Applications/Calculator.app"), false);
  assert.equal(isWebUrl("javascript:alert(1)"), false);
  assert.equal(isWebUrl(undefined), false);
});
