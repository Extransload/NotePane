const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const test = require("node:test");
const assert = require("node:assert/strict");
const { AssetStore } = require("../../electron/assetStore.cjs");
const {
  MAX_ASSET_SOURCE_BYTES,
  readAssetFromUrl,
} = require("../../electron/assetSources.cjs");

const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

test("caps file and download reads at 200 MB", () => {
  assert.equal(MAX_ASSET_SOURCE_BYTES, 200 * 1024 * 1024);
});

test("reads a local image file with the MIME type of its extension", async () => {
  const filePath = writeTemporaryFile("photo.PNG", PNG_BYTES);

  const asset = await readAssetFromUrl(pathToFileURL(filePath).href);

  assert.deepEqual(asset, { buffer: PNG_BYTES, mimeType: "image/png" });
});

test("reads local media and PDF files", async () => {
  const video = writeTemporaryFile("clip.mov", Buffer.from("video"));
  const pdf = writeTemporaryFile("paper.pdf", Buffer.from("%PDF-1.4"));

  assert.equal((await readAssetFromUrl(pathToFileURL(video).href)).mimeType, "video/quicktime");
  assert.equal((await readAssetFromUrl(pathToFileURL(pdf).href)).mimeType, "application/pdf");
});

test("refuses local files that are not images or media", async () => {
  const json = writeTemporaryFile("notes.json", Buffer.from("{}"));
  const noExtension = writeTemporaryFile("id_rsa", Buffer.from("secret"));

  await assert.rejects(readAssetFromUrl(pathToFileURL(json).href), /not an image or media file/);
  await assert.rejects(readAssetFromUrl(pathToFileURL(noExtension).href), /not an image or media file/);
});

test("refuses a media-named link to a file that is not media", async (t) => {
  const secret = writeTemporaryFile("notes.json", Buffer.from("{}"));
  const link = path.join(path.dirname(secret), "innocent.png");
  try {
    fs.symlinkSync(secret, link);
  } catch {
    t.skip("symlinks are unavailable");
    return;
  }

  await assert.rejects(readAssetFromUrl(pathToFileURL(link).href), /not an image or media file/);
});

test("refuses a directory with a media extension", async () => {
  const directory = path.join(createTemporaryDirectory(), "folder.png");
  fs.mkdirSync(directory);

  await assert.rejects(readAssetFromUrl(pathToFileURL(directory).href), /not a regular file/);
});

test("refuses a local file over the size limit", async () => {
  const filePath = writeTemporaryFile("large.png", Buffer.alloc(11));

  await assert.rejects(
    readAssetFromUrl(pathToFileURL(filePath).href, { maxBytes: 10 }),
    /larger than/,
  );
  assert.equal(
    (await readAssetFromUrl(pathToFileURL(filePath).href, { maxBytes: 11 })).buffer.length,
    11,
  );
});

test("downloads http(s) media with the response MIME type", async () => {
  const fetch = async () => new Response(PNG_BYTES, {
    headers: { "content-type": "image/webp; charset=binary" },
  });

  const asset = await readAssetFromUrl("https://example.test/a.webp", { fetch });

  assert.deepEqual(asset, { buffer: PNG_BYTES, mimeType: "image/webp" });
});

test("refuses a download whose declared length is over the limit", async () => {
  let cancelled = false;
  const fetch = async () => new Response(
    new ReadableStream({
      pull() {},
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { "content-length": "11" } },
  );

  await assert.rejects(
    readAssetFromUrl("https://example.test/a.png", { fetch, maxBytes: 10 }),
    /larger than/,
  );
  assert.equal(cancelled, true);
});

test("stops a download that streams past the limit without a declared length", async () => {
  let chunksSent = 0;
  const fetch = async () => new Response(new ReadableStream({
    pull(controller) {
      chunksSent += 1;
      controller.enqueue(new Uint8Array(4));
    },
  }));

  await assert.rejects(
    readAssetFromUrl("http://example.test/endless.png", { fetch, maxBytes: 10 }),
    /larger than/,
  );
  assert.ok(chunksSent <= 4, `read ${chunksSent} chunks`);
});

test("reports a failed download", async () => {
  const fetch = async () => new Response("missing", { status: 404 });

  await assert.rejects(
    readAssetFromUrl("https://example.test/a.png", { fetch }),
    /HTTP 404/,
  );
});

test("decodes data URLs", async () => {
  const base64 = await readAssetFromUrl(`data:image/png;base64,${PNG_BYTES.toString("base64")}`);
  const text = await readAssetFromUrl("data:image/svg+xml,%3Csvg%2F%3E");

  assert.deepEqual(base64, { buffer: PNG_BYTES, mimeType: "image/png" });
  assert.deepEqual(text, { buffer: Buffer.from("<svg/>"), mimeType: "image/svg+xml" });
});

test("reads asset URLs from the asset store", async () => {
  const assets = new AssetStore(createTemporaryDirectory());
  const url = assets.put(PNG_BYTES, "image/png");

  assert.deepEqual(await readAssetFromUrl(url, { assets }), {
    buffer: PNG_BYTES,
    mimeType: "image/png",
  });
  await assert.rejects(
    readAssetFromUrl(`notepane-asset://local/${"0".repeat(64)}.png`, { assets }),
    /missing/,
  );
});

test("refuses empty and unsupported URLs", async () => {
  await assert.rejects(readAssetFromUrl(""), /Missing/);
  await assert.rejects(readAssetFromUrl(undefined), /Missing/);
  await assert.rejects(readAssetFromUrl("ftp://example.test/a.png"), /Unsupported/);
});

const temporaryDirectories = [];

function createTemporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "notepane-asset-sources-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writeTemporaryFile(name, bytes) {
  const filePath = path.join(createTemporaryDirectory(), name);
  fs.writeFileSync(filePath, bytes);
  return filePath;
}

test.after(() => {
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});
