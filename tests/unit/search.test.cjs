const test = require("node:test");
const assert = require("node:assert/strict");

const loadSearch = () => import("../../src/model/search.js");
const NFD_HAN = "한"; // 한, decomposed into jamo

test("normalizes case and composes decomposed Hangul", async () => {
  const { normalizeSearchText } = await loadSearch();
  assert.equal(normalizeSearchText("NotePane"), "notepane");
  assert.equal(normalizeSearchText(NFD_HAN), "한");
});

test("finds non-overlapping case-insensitive ranges in the original text", async () => {
  const { findMatchRanges } = await loadSearch();
  assert.deepEqual(findMatchRanges("Needle and needle", "needle"), [
    { start: 0, end: 6 },
    { start: 11, end: 17 },
  ]);
  assert.deepEqual(findMatchRanges("aaaa", "aa"), [
    { start: 0, end: 2 },
    { start: 2, end: 4 },
  ]);
  assert.deepEqual(findMatchRanges("anything", ""), []);
});

test("maps a composed query onto decomposed Hangul text", async () => {
  const { findMatchRanges } = await loadSearch();
  const text = `가 ${NFD_HAN}글`;
  assert.deepEqual(findMatchRanges(text, "한글"), [{ start: 2, end: 6 }]);
});

test("treats regex metacharacters literally", async () => {
  const { findMatchRanges } = await loadSearch();
  assert.deepEqual(findMatchRanges("a.b axb (x)", "a.b"), [{ start: 0, end: 3 }]);
  assert.deepEqual(findMatchRanges("call (x) now", "(x"), [{ start: 5, end: 7 }]);
});

test("extracts text from nested, linked and table blocks but not image data", async () => {
  const { blocksToPlainText } = await loadSearch();
  const blocks = [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Read " },
        { type: "link", href: "https://example.test", content: [{ type: "text", text: "the docs" }] },
      ],
      children: [{ type: "paragraph", content: [{ type: "text", text: "nested child" }], children: [] }],
    },
    {
      type: "table",
      content: {
        type: "tableContent",
        rows: [{ cells: [[{ type: "text", text: "cell one" }], { type: "tableCell", content: [{ type: "text", text: "cell two" }] }] }],
      },
      children: [],
    },
    { type: "image", props: { url: "data:image/png;base64,AAAAbase64png" }, content: undefined, children: [] },
  ];
  const text = blocksToPlainText(blocks);
  assert.match(text, /Read the docs/);
  assert.match(text, /nested child/);
  assert.match(text, /cell one\ncell two/);
  assert.doesNotMatch(text, /base64|png/);
});

test("strips markdown syntax and image data from the markdown fallback", async () => {
  const { markdownToPlainText } = await loadSearch();
  const text = markdownToPlainText(
    "# Title\n- [ ] task **bold** [link](https://x.test)\n![](data:image/png;base64,AAAA)\n| a | b |\n| --- | --- |",
  );
  assert.match(text, /Title/);
  assert.match(text, /task bold link/);
  assert.doesNotMatch(text, /data:|base64|---|https/);
});

test("prefers blocksJSON and falls back to markdown", async () => {
  const { noteToPlainText } = await loadSearch();
  const blocksJSON = JSON.stringify([{ type: "paragraph", content: [{ type: "text", text: "from blocks" }], children: [] }]);
  assert.equal(noteToPlainText({ blocksJSON, markdown: "from markdown" }), "from blocks");
  assert.equal(noteToPlainText({ blocksJSON: null, markdown: "from markdown" }), "from markdown");
});

test("ranks title matches before body matches and keeps input order for ties", async () => {
  const { searchNotes } = await loadSearch();
  const entries = [
    { note: { id: "a" }, title: "Alpha", body: "has needle inside" },
    { note: { id: "b" }, title: "Needle notes", body: "nothing" },
    { note: { id: "c" }, title: "Gamma", body: "needle needle" },
    { note: { id: "d" }, title: "Delta", body: "no match" },
  ];
  const results = searchNotes(entries, "needle");
  assert.deepEqual(results.map((result) => result.note.id), ["b", "a", "c"]);
  assert.equal(results[2].matchCount, 2);
  assert.deepEqual(results[0].titleRanges, [{ start: 0, end: 6 }]);
});

test("lists every note for a blank query", async () => {
  const { searchNotes } = await loadSearch();
  const entries = [
    { note: { id: "a" }, title: "Alpha", body: "first" },
    { note: { id: "b" }, title: "Beta", body: "second" },
  ];
  assert.deepEqual(searchNotes(entries, "   ").map((result) => result.note.id), ["a", "b"]);
});

test("builds a snippet around the first body match", async () => {
  const { searchNotes } = await loadSearch();
  const body = `${"x".repeat(60)} needle ${"y".repeat(200)}`;
  const [result] = searchNotes([{ note: { id: "a" }, title: "A", body }], "needle");
  const { text, ranges, clippedStart, clippedEnd } = result.snippet;
  assert.equal(clippedStart, true);
  assert.equal(clippedEnd, true);
  assert.equal(text.slice(ranges[0].start, ranges[0].end), "needle");
});

test("reuses cached note text until the note content changes", async () => {
  const { createNoteTextReader } = await loadSearch();
  const readNoteText = createNoteTextReader();
  const note = { id: "a", blocksJSON: null, markdown: "first" };
  assert.equal(readNoteText(note), "first");
  assert.equal(readNoteText({ ...note, markdown: "second" }), "second");
});

// A generous budget: 2 MB is roughly 100 notes of 20 KB. Grapheme
// segmentation of every character took about 750 ms here; the fast path takes
// about 10 ms. The fastest of three runs is compared, so a garbage collection
// pause or a busy test runner cannot fail the test on its own.
test("searches about 2 MB of plain text within an interactive budget", async () => {
  const { findMatchRanges } = await loadSearch();
  const text = "Lorem ipsum dolor sit amet, 한글 문장도 섞어 둔다. ".repeat(48_000);
  let fastest = Infinity;
  for (let run = 0; run < 3; run += 1) {
    const started = performance.now();
    const ranges = findMatchRanges(text, "AMET");
    fastest = Math.min(fastest, performance.now() - started);
    assert.equal(ranges.length, 48_000);
  }
  assert.ok(fastest < 400, `fastest run took ${Math.round(fastest)} ms`);
});

// Find in note never matches across blocks, so the palette must not either:
// otherwise it lists a note whose find bar then shows 0 / 0.
test("matches the note body one block at a time, like find in note", async () => {
  const { blocksToPlainText, searchNotes } = await loadSearch();
  const paragraphs = "first line ends\nstarts the second";
  assert.deepEqual(searchNotes([{ note: { id: "a" }, title: "A", body: paragraphs }], "ends starts"), []);

  const table = blocksToPlainText([{
    type: "table",
    content: {
      type: "tableContent",
      rows: [{ cells: [[{ type: "text", text: "cell one" }], [{ type: "text", text: "cell two" }]] }],
    },
    children: [],
  }]);
  assert.deepEqual(searchNotes([{ note: { id: "a" }, title: "A", body: table }], "one cell"), []);
  assert.equal(searchNotes([{ note: { id: "a" }, title: "A", body: table }], "cell").length, 1);
});

test("shows a snippet that spans blocks on one line", async () => {
  const { searchNotes } = await loadSearch();
  const [result] = searchNotes([{ note: { id: "a" }, title: "A", body: "alpha\nneedle\tbeta" }], "needle");
  assert.equal(result.snippet.text, "alpha needle beta");
  assert.deepEqual(result.snippet.ranges, [{ start: 6, end: 12 }]);
});

const loadTags = () => import("../../src/model/tags.js");

test("normalizes tags: trimmed, no leading #, lower-cased, spaces as dashes, 1 to 32 characters", async () => {
  const { normalizeTag } = await loadTags();
  assert.equal(normalizeTag("  #Launch "), "launch");
  assert.equal(normalizeTag("Q4  Launch\tPlan"), "q4-launch-plan");
  assert.equal(normalizeTag("한글"), "한글");
  assert.equal(normalizeTag("#"), "");
  assert.equal(normalizeTag("   "), "");
  assert.equal(normalizeTag("a".repeat(32)), "a".repeat(32));
  assert.equal(normalizeTag("a".repeat(33)), "");
});

test("keeps tags unique, in the order added, and at most 20", async () => {
  const { normalizeTags } = await loadTags();
  assert.deepEqual(normalizeTags(["Guide", "#launch", "guide", "", "LAUNCH"]), ["guide", "launch"]);
  const many = Array.from({ length: 25 }, (_, index) => `tag${index}`);
  assert.equal(normalizeTags(many).length, 20);
  assert.equal(normalizeTags(many)[19], "tag19");
  assert.deepEqual(normalizeTags(null), []);
});

test("parses #tag and folder: tokens out of a palette query", async () => {
  const { parseSearchQuery } = await loadSearch();
  assert.deepEqual(parseSearchQuery("#Launch notes #guide"), { text: "notes", tags: ["launch", "guide"], folder: null });
  assert.deepEqual(parseSearchQuery("folder:Work plan"), { text: "plan", tags: [], folder: "Work" });
  assert.deepEqual(parseSearchQuery('folder:"Two words" #a #a'), { text: "", tags: ["a"], folder: "Two words" });
  assert.deepEqual(parseSearchQuery("FOLDER:work folder:Personal"), { text: "", tags: [], folder: "Personal" });
  // A filter token still being typed filters nothing and is not searched as text.
  assert.deepEqual(parseSearchQuery("needle # folder:"), { text: "needle", tags: [], folder: null });
  // Without filter tokens the text is kept as typed, so find in note receives it whole.
  assert.deepEqual(parseSearchQuery("  two  spaces "), { text: "two  spaces", tags: [], folder: null });
  assert.deepEqual(parseSearchQuery("C# notes"), { text: "C# notes", tags: [], folder: null });
});

test("formats filters back into a query that parses to the same filters", async () => {
  const { formatSearchQuery, parseSearchQuery } = await loadSearch();
  assert.equal(formatSearchQuery({ text: "plan", tags: ["launch"], folder: "Work" }), "folder:Work #launch plan");
  assert.equal(formatSearchQuery({ text: "", tags: ["launch"], folder: null }), "#launch ");
  assert.equal(formatSearchQuery({ text: " plan ", tags: [], folder: null }), "plan");
  const query = formatSearchQuery({ text: "plan", tags: ["a", "b"], folder: "Two words" });
  assert.equal(query, 'folder:"Two words" #a #b plan');
  assert.deepEqual(parseSearchQuery(query), { text: "plan", tags: ["a", "b"], folder: "Two words" });
});

test("resolves a folder name to every folder carrying it, or to no folder", async () => {
  const { resolveFolderFilter } = await loadSearch();
  const folders = [
    { id: "f1", name: "Work", collapsed: false },
    { id: "f2", name: "work", collapsed: false },
    { id: "f3", name: "Personal", collapsed: false },
  ];
  assert.equal(resolveFolderFilter(null, folders), null);
  assert.deepEqual(resolveFolderFilter("WORK", folders), ["f1", "f2"]);
  assert.equal(resolveFolderFilter("none", folders), "none");
  assert.deepEqual(resolveFolderFilter("Missing", folders), []);
});

test("filters search entries by every tag and by folder", async () => {
  const { filterSearchEntries } = await loadSearch();
  const folders = [{ id: "work", name: "Work", collapsed: false }];
  const entry = (id, tags, folderId) => ({ note: { id, tags, folderId }, title: id, body: "" });
  const entries = [
    entry("a", ["launch", "guide"], null),
    entry("b", ["launch"], "work"),
    entry("c", [], "work"),
    // Its folder was deleted, so it counts as having none.
    entry("d", ["launch"], "gone"),
    // Notes stored before tags and folders existed.
    { note: { id: "e" }, title: "e", body: "" },
  ];
  const ids = (options) => filterSearchEntries(entries, { folders, ...options }).map((item) => item.note.id);

  assert.deepEqual(ids({}), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(ids({ tags: ["launch"] }), ["a", "b", "d"]);
  assert.deepEqual(ids({ tags: ["#Launch", "guide"] }), ["a"]);
  assert.deepEqual(ids({ folderId: "work" }), ["b", "c"]);
  assert.deepEqual(ids({ folderId: ["work"], tags: ["launch"] }), ["b"]);
  assert.deepEqual(ids({ folderId: "none" }), ["a", "d", "e"]);
  assert.deepEqual(ids({ folderId: [] }), []);
});

test("lists every note a filter keeps when the query has no text", async () => {
  const { filterSearchEntries, parseSearchQuery, searchNotes } = await loadSearch();
  const entries = [
    { note: { id: "a", tags: ["launch"] }, title: "Alpha", body: "one" },
    { note: { id: "b", tags: [] }, title: "Beta", body: "two" },
    { note: { id: "c", tags: ["launch"] }, title: "Gamma", body: "three" },
  ];
  const parsed = parseSearchQuery("#launch ");
  const results = searchNotes(filterSearchEntries(entries, { tags: parsed.tags }), parsed.text);
  assert.deepEqual(results.map((result) => result.note.id), ["a", "c"]);
});

test("collects the tags in use, alphabetically", async () => {
  const { collectNoteTags } = await loadSearch();
  assert.deepEqual(
    collectNoteTags([{ tags: ["launch", "guide"] }, { tags: ["design", "launch"] }, {}]),
    ["design", "guide", "launch"],
  );
});
