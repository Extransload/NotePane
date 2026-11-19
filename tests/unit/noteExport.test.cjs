const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { AssetStore } = require("../../electron/assetStore.cjs");
const {
  buildFrontMatter,
  buildHtmlDocument,
  externalizeMarkdownAssets,
  writeExportEntries,
} = require("../../electron/noteExport.cjs");

const PNG_BYTES = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "notepane-export-"));
}

test("copies a Markdown file's images beside it and links them relatively", () => {
  const assets = new AssetStore(temporaryDirectory());
  const url = assets.put(PNG_BYTES, "image/png");

  const result = externalizeMarkdownAssets(`![a](${url})\n\n![again](${url})`, {
    assets,
    folderName: "Launch notes files",
  });

  // One file per distinct image, reused by every link to it.
  assert.equal(result.markdown, "![a](Launch%20notes%20files/1.png)\n\n![again](Launch%20notes%20files/1.png)");
  assert.deepEqual(result.files, [{ name: "1.png", buffer: PNG_BYTES }]);
});

// One-click Markdown keeps pictures inside the file, but an attached file goes beside it under
// the name its link shows, never into the text as base64.
test("keeps pictures inline and puts attached files beside the Markdown", () => {
  const assets = new AssetStore(temporaryDirectory());
  const image = assets.put(PNG_BYTES, "image/png");
  const report = assets.put(Buffer.from("<html>report</html>"), "application/octet-stream");

  const result = externalizeMarkdownAssets(`![chart](${image})\n\n[rpt-1 report.html](${report})`, {
    assets,
    folderName: "Plan files",
    inlineImages: true,
  });

  assert.equal(
    result.markdown,
    `![chart](data:image/png;base64,${PNG_BYTES.toString("base64")})\n\n[rpt-1 report.html](Plan%20files/rpt-1%20report.html)`,
  );
  assert.deepEqual(result.files, [{ name: "rpt-1 report.html", buffer: Buffer.from("<html>report</html>") }]);
});

test("writes notes into folders and never overwrites a note with the same title", () => {
  const directory = temporaryDirectory();

  const written = writeExportEntries(directory, [
    { folder: null, fileName: "Plan.md", content: "one" },
    { folder: null, fileName: "Plan.md", content: "two" },
    { folder: "Work", fileName: "Plan.md", content: "three", extraFiles: [{ folder: "Plan files", name: "1.png", buffer: PNG_BYTES }] },
  ]);

  assert.deepEqual(written.map((filePath) => path.relative(directory, filePath)), [
    "Plan.md",
    "Plan (2).md",
    path.join("Work", "Plan.md"),
  ]);
  assert.equal(fs.readFileSync(path.join(directory, "Plan (2).md"), "utf8"), "two");
  assert.deepEqual(fs.readFileSync(path.join(directory, "Work", "Plan files", "1.png")), PNG_BYTES);
});

test("front matter carries the title, tags and dates", () => {
  assert.equal(
    buildFrontMatter({ title: 'Q4 "launch"', tags: ["work", "launch"], createdAt: 0, updatedAt: Number.NaN }),
    '---\ntitle: "Q4 \\"launch\\""\ntags: ["work", "launch"]\ncreated: 1970-01-01T00:00:00.000Z\n---\n',
  );
});

test("an HTML page escapes its title and only takes colours it is given", () => {
  const page = buildHtmlDocument({ title: "<b>Plan</b>", bodyHtml: "<p>Hi</p>" });
  assert.match(page, /<title>&lt;b&gt;Plan&lt;\/b&gt;<\/title>/);
  assert.doesNotMatch(page, /html \{ background/);
  assert.match(buildHtmlDocument({ title: "t", bodyHtml: "", colors: { background: "x", text: "y" } }), /html \{ background: x; color: y; \}/);
});
