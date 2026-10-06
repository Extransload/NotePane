const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { AssetStore, parseAssetUrl } = require("../../electron/assetStore.cjs");

const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const PNG_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;

test("stores identical bytes once under a content address", () => {
  const store = new AssetStore(createTemporaryDirectory());

  const first = store.put(PNG_BYTES, "image/png");
  const second = store.put(Buffer.from(PNG_BYTES), "image/png");

  assert.equal(first, second);
  assert.match(first, /^notepane-asset:\/\/local\/[0-9a-f]{64}\.png$/);
  assert.deepEqual(fs.readdirSync(store.directory), [path.basename(new URL(first).pathname)]);
});

test("maps MIME types to file extensions", () => {
  const store = new AssetStore(createTemporaryDirectory());

  assert.match(store.put(Buffer.from("a"), "image/jpeg"), /\.jpg$/);
  assert.match(store.put(Buffer.from("b"), "image/svg+xml"), /\.svg$/);
  assert.match(store.put(Buffer.from("c"), "video/quicktime"), /\.mov$/);
  assert.match(store.put(Buffer.from("d"), "application/x-unknown"), /\.bin$/);
});

test("reads an asset back with its MIME type", () => {
  const store = new AssetStore(createTemporaryDirectory());
  const url = store.put(PNG_BYTES, "image/png");

  const asset = store.read(url);

  assert.equal(asset.mimeType, "image/png");
  assert.deepEqual(asset.buffer, PNG_BYTES);
  assert.equal(store.read("notepane-asset://local/" + "0".repeat(64) + ".png"), null);
});

test("rejects names that are not a content address", () => {
  assert.equal(parseAssetUrl("notepane-asset://local/../notes.json"), null);
  assert.equal(parseAssetUrl("notepane-asset://local/%2e%2e%2fnotes.json"), null);
  assert.equal(parseAssetUrl(`notepane-asset://local/${"A".repeat(64)}.png`), null);
  assert.equal(parseAssetUrl(`notepane-asset://other/${"a".repeat(64)}.png`), null);
  assert.equal(parseAssetUrl(`https://example.test/${"a".repeat(64)}.png`), null);
  assert.deepEqual(parseAssetUrl(`notepane-asset://local/${"a".repeat(64)}.png`), {
    hash: "a".repeat(64),
    extension: "png",
  });
});

test("turns base64 data URLs into asset URLs and back without loss", () => {
  const store = new AssetStore(createTemporaryDirectory());
  const text = JSON.stringify([
    { type: "image", props: { url: PNG_DATA_URL, originalUrl: PNG_DATA_URL } },
    { type: "paragraph", content: "data:text/plain,not-base64 stays" },
  ]);

  const externalized = store.externalizeDataUrls(text);

  assert.doesNotMatch(externalized, /data:image\/png;base64/);
  assert.match(externalized, /data:text\/plain,not-base64 stays/);
  assert.equal(store.inlineAssetUrls(externalized), text);
});

test("leaves unknown asset URLs in place when inlining", () => {
  const store = new AssetStore(createTemporaryDirectory());
  const missing = `notepane-asset://local/${"b".repeat(64)}.png`;

  assert.equal(store.inlineAssetUrls(`x ${missing} y`), `x ${missing} y`);
});

test("lists the asset URLs a text references", () => {
  const store = new AssetStore(createTemporaryDirectory());
  const url = store.put(PNG_BYTES, "image/png");

  assert.deepEqual([...AssetStore.referencedUrls(`a ${url} b ${url}`)], [url]);
});

test("collects garbage but keeps referenced assets", () => {
  const store = new AssetStore(createTemporaryDirectory());
  const kept = store.put(PNG_BYTES, "image/png");
  const dropped = store.put(Buffer.from("unused"), "image/png");

  store.collectGarbage(new Set([kept]));

  assert.ok(store.read(kept));
  assert.equal(store.read(dropped), null);
});

const temporaryDirectories = [];

function createTemporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "notepane-assets-"));
  temporaryDirectories.push(directory);
  return directory;
}

test.after(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});
