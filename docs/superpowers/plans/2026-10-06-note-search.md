# Note Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `Mod+P` note search palette across all notes and a `Mod+F` find bar inside the current note. Choosing a
palette result lands on the first match.

**Architecture:** Pure search helpers live in `src/model/search.js`. In-note matches are ProseMirror decorations from a
BlockNote extension, following the existing `BlockDragSelection` pattern. Thin React state in a hook drives two
presentational components. Cross-window jumps use one new main-process IPC, `notes:reveal`, and a pull-based handoff,
`find:take-pending`, so a newly created window cannot miss its query.

**Tech Stack:** React 19, BlockNote 0.52 (`createExtension`), ProseMirror (`@tiptap/pm`), Electron 43 IPC, Playwright,
`node --test`.

**Spec:** `docs/superpowers/specs/2026-10-06-note-search-design.md`

## Global Constraints

- Default shortcuts are `searchNotes: "Mod+P"` and `findInNote: "Mod+F"`. Do not use `Mod+K`, which BlockNote binds to links.
- Matching is case-insensitive substring matching after NFC normalization, with no regex, whole-word or chosung modes.
- Search excludes Trash.
- Find must never change the document, the undo history or the save state.
- `src/main.jsx` gets composition code only. Logic goes in `src/model`, `src/editor`, `src/hooks` and `src/ui`.
- New styles go in `src/styles/search.css`, imported as the last line of `src/styles.css`. Do not reorder existing imports.
- UI copy is English, matching the app: "Search notes", "No matching notes", "Find in note", "Previous match",
  "Next match", "Close find".
- Validation follows `AGENTS.md`: focused tests while iterating, then `npm run verify` once at the end. Known baseline
  failures: "Electron exposes installed font families to the renderer" (fails on clean HEAD), and "Electron creates
  sticky-mode tabs with a persisted default accent" (flaky about 20%, also on clean HEAD).

## Review Focus

1. Pressing `Enter` in the find input while the editor caret sits at the end of a toggle title must not insert a child
   block. The editor capture handlers treat anything inside the surface as an editor target. Test in Task 3.
2. A query with regex metacharacters such as `a.b` or `(x` matches literally and never throws. Test in Task 1.
3. Image data URLs inside notes are never searched, so typing `base64` or `png` does not match every image note. Test in
   Task 1.
4. Opening find, stepping through matches and closing it leaves undo history intact: `Mod+Z` afterwards still undoes the
   last real edit. Test in Task 3.
5. Revealing a note that was deleted meanwhile returns `null` and opens nothing. Test in Task 5.

## Spec adjustment

The spec says other notes are searched by their stored markdown. This plan reads `note.blocksJSON` first and falls
back to markdown only when `blocksJSON` is missing. `blocksJSON` is exact, carries no image data URLs, and is already
stored for every note saved by the current app. The spec's "Data flow" step 2 is updated in the same commit as this
plan.

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `src/model/search.js` | create | normalization, plain-text extraction, match ranges, ranked note search, snippets |
| `tests/unit/search.test.cjs` | create | unit tests for `search.js` |
| `electron/store.cjs` | modify | add the two shortcut defaults |
| `src/constants.js` | modify | add the two shortcut defaults |
| `src/ui/preferencesSections.jsx` | modify | labels for the two shortcuts |
| `tests/unit/store.test.cjs` | modify | shortcut default backfill test |
| `src/editor/findInNote.js` | create | BlockNote extension and find commands |
| `src/hooks/useFindInNote.js` | create | find bar state |
| `src/ui/FindBar.jsx` | create | find bar component |
| `src/ui/SearchPalette.jsx` | create | palette component |
| `src/editor/targets.js` | modify | exclude find bar and palette from editor shortcut targets |
| `src/hooks/useKeyboardCommands.js` | modify | `Mod+F` and `Mod+P` handling |
| `src/main.jsx` | modify | composition only |
| `src/styles/search.css` | create | palette and find bar styles |
| `src/styles/tokens.css` | modify | highlight colour tokens |
| `src/styles.css` | modify | append `@import "./styles/search.css";` |
| `electron/main.cjs` | modify | `notes:reveal`, `find:take-pending` |
| `electron/preload.cjs` | modify | `revealNote`, `takePendingFind`, `onFindOpenRequested` |
| `tests/e2e/renderer/search.spec.mjs` | create | renderer contracts |
| `tests/e2e/electron.spec.mjs` | modify | cross-window contracts |
| `docs/usage.md`, `docs/features.md`, `docs/architecture.md` | modify | document shortcuts and code map |

---

### Task 1: Search model

**Files:**
- Create: `src/model/search.js`
- Test: `tests/unit/search.test.cjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normalizeSearchText(text: string): string`
  - `findMatchRanges(text: string, query: string): Array<{start: number, end: number}>`. Indexes are into the original
    `text`, end-exclusive and non-overlapping.
  - `blocksToPlainText(blocks: Block[]): string`
  - `markdownToPlainText(markdown: string): string`
  - `noteToPlainText(note): string`
  - `createNoteTextReader(): (note) => string`. Caches per note id and recomputes only when `blocksJSON` or `markdown`
    changes.
  - `makeSnippet(text: string, ranges): {text: string, ranges, clippedStart: boolean, clippedEnd: boolean}`
  - `searchNotes(entries: Array<{note, title: string, body: string}>, query: string)` returns
    `Array<{note, title, titleRanges, matchCount, snippet}>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/search.test.cjs`:

```js
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
  assert.match(text, /cell one cell two/);
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/search.test.cjs`
Expected: every test fails with `Cannot find module` for `src/model/search.js`.

- [ ] **Step 3: Implement `src/model/search.js`**

```js
// Pure helpers for note search and find in note. Matching is case-insensitive
// substring matching after NFC normalization, so decomposed Hangul (common in
// text pasted from macOS file names) matches composed input.

const SNIPPET_BEFORE = 24;
const SNIPPET_LENGTH = 96;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function normalizeSearchText(text) {
  return String(text ?? "").normalize("NFC").toLowerCase();
}

// Normalizes one grapheme at a time and remembers where each normalized
// character came from, so matches map back onto the original string even when
// normalization changes its length.
function buildSearchIndex(text) {
  let normalized = "";
  const starts = [];
  const ends = [];
  for (const { segment, index } of graphemeSegmenter.segment(text)) {
    const normalizedSegment = normalizeSearchText(segment);
    for (let offset = 0; offset < normalizedSegment.length; offset += 1) {
      starts.push(index);
      ends.push(index + segment.length);
    }
    normalized += normalizedSegment;
  }
  return { normalized, starts, ends };
}

export function findMatchRanges(text, query) {
  const needle = normalizeSearchText(query);
  if (!needle) {
    return [];
  }

  const { normalized, starts, ends } = buildSearchIndex(String(text ?? ""));
  const ranges = [];
  let from = 0;
  while (from <= normalized.length - needle.length) {
    const at = normalized.indexOf(needle, from);
    if (at < 0) {
      break;
    }
    ranges.push({ start: starts[at], end: ends[at + needle.length - 1] });
    from = at + needle.length;
  }
  return ranges;
}

function inlineToPlainText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(inlineToPlainText).join("");
  }
  if (!content || typeof content !== "object") {
    return "";
  }
  if (content.type === "tableContent") {
    return (content.rows ?? [])
      .map((row) => (row.cells ?? []).map(inlineToPlainText).join(" "))
      .join("\n");
  }
  if (typeof content.text === "string") {
    return content.text;
  }
  return inlineToPlainText(content.content);
}

// Reads only `content` and `children`, never `props`, so image and file URLs
// (often multi-megabyte data URLs) are never searched.
export function blocksToPlainText(blocks) {
  const lines = [];
  const visit = (block) => {
    const text = inlineToPlainText(block?.content);
    if (text) {
      lines.push(text);
    }
    for (const child of block?.children ?? []) {
      visit(child);
    }
  };
  for (const block of Array.isArray(blocks) ? blocks : []) {
    visit(block);
  }
  return lines.join("\n");
}

export function markdownToPlainText(markdown) {
  return String(markdown ?? "")
    .replace(/```[^\n]*\n?/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/gm, "")
    .replace(/(\*\*|__|~~|`|\*)/g, "")
    .replace(/\|/g, " ")
    .replace(/^\s*:?-{3,}:?(?:\s+:?-{3,}:?)*\s*$/gm, "");
}

export function noteToPlainText(note) {
  if (typeof note?.blocksJSON === "string" && note.blocksJSON) {
    try {
      return blocksToPlainText(JSON.parse(note.blocksJSON));
    } catch {
      // Fall back to the markdown copy below.
    }
  }
  return markdownToPlainText(note?.markdown);
}

export function createNoteTextReader() {
  const cache = new Map();
  return (note) => {
    const cached = cache.get(note.id);
    if (cached && cached.blocksJSON === note.blocksJSON && cached.markdown === note.markdown) {
      return cached.text;
    }
    const text = noteToPlainText(note);
    cache.set(note.id, { blocksJSON: note.blocksJSON, markdown: note.markdown, text });
    return text;
  };
}

function collapseWhitespace(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

export function makeSnippet(text, ranges) {
  const first = ranges[0];
  const start = first ? Math.max(0, first.start - SNIPPET_BEFORE) : 0;
  const end = Math.min(text.length, start + SNIPPET_LENGTH);
  return {
    text: text.slice(start, end),
    clippedStart: start > 0,
    clippedEnd: end < text.length,
    ranges: ranges
      .filter((range) => range.start >= start && range.end <= end)
      .map((range) => ({ start: range.start - start, end: range.end - start })),
  };
}

export function searchNotes(entries, query) {
  const trimmedQuery = String(query ?? "").trim();
  if (!trimmedQuery) {
    return entries.map((entry) => ({
      note: entry.note,
      title: entry.title,
      titleRanges: [],
      matchCount: 0,
      snippet: makeSnippet(collapseWhitespace(entry.body), []),
    }));
  }

  const titleHits = [];
  const bodyHits = [];
  for (const entry of entries) {
    const titleRanges = findMatchRanges(entry.title, trimmedQuery);
    const body = collapseWhitespace(entry.body);
    const bodyRanges = findMatchRanges(body, trimmedQuery);
    if (titleRanges.length === 0 && bodyRanges.length === 0) {
      continue;
    }
    const result = {
      note: entry.note,
      title: entry.title,
      titleRanges,
      matchCount: titleRanges.length + bodyRanges.length,
      snippet: makeSnippet(body, bodyRanges),
    };
    (titleRanges.length > 0 ? titleHits : bodyHits).push(result);
  }
  return [...titleHits, ...bodyHits];
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/unit/search.test.cjs`
Expected: all 11 tests pass.

Run: `npm run check:refs`
Expected: `no undefined references`.

- [ ] **Step 5: Commit**

```bash
git add src/model/search.js tests/unit/search.test.cjs
git commit -m "feat: add note search helpers"
```

---

### Task 2: Shortcut defaults

**Files:**
- Modify: `electron/store.cjs` (`DEFAULT_KEYBOARD_SHORTCUTS`, around line 156)
- Modify: `src/constants.js` (`DEFAULT_KEYBOARD_SHORTCUTS`, around line 67)
- Modify: `src/ui/preferencesSections.jsx` (shortcut label list, around line 393)
- Test: `tests/unit/store.test.cjs`

**Interfaces:**
- Produces: command ids `searchNotes` and `findInNote`. They are usable with
  `matchesEnabledKeyboardShortcut(event, id)` and `getEnabledShortcut(id)` in `StickyEditor`.

- [ ] **Step 1: Write the failing store test**

Add before `test("exports and restores a versioned portable workspace backup"` in `tests/unit/store.test.cjs`:

```js
test("fills new search shortcuts into stored keyboard shortcuts", () => {
  const directory = createTemporaryDirectory();
  fs.writeFileSync(
    path.join(directory, "notes.json"),
    JSON.stringify({
      version: 11,
      notes: [],
      editorPreferences: { keyboardShortcuts: { newSession: "Mod+T" } },
    }),
    "utf8",
  );

  const shortcuts = new StickyStore(directory).getEditorPreferences().keyboardShortcuts;

  assert.equal(shortcuts.searchNotes, "Mod+P");
  assert.equal(shortcuts.findInNote, "Mod+F");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test:unit`
Expected: the new test fails with `undefined !== 'Mod+P'`.

- [ ] **Step 3: Add the defaults and labels**

In `electron/store.cjs`, add after `focusEditor: "Mod+Enter",` in `DEFAULT_KEYBOARD_SHORTCUTS`:

```js
  searchNotes: "Mod+P",
  findInNote: "Mod+F",
```

In `src/constants.js`, add the same two lines after `focusEditor: "Mod+Enter",` in `DEFAULT_KEYBOARD_SHORTCUTS`.

In `src/ui/preferencesSections.jsx`, add after `{ id: "focusEditor", label: "Focus editor" },`:

```js
  { id: "searchNotes", label: "Search notes" },
  { id: "findInNote", label: "Find in note" },
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test:unit`
Expected: all unit tests pass.

Run: `npx playwright test tests/e2e/renderer --grep "customizes keyboard shortcuts from preferences"`
Expected: 1 passed. The preference list now shows two more rows.

- [ ] **Step 5: Commit**

```bash
git add electron/store.cjs src/constants.js src/ui/preferencesSections.jsx tests/unit/store.test.cjs
git commit -m "feat: register search and find shortcuts"
```

---

### Task 3: Find in note

**Files:**
- Create: `src/editor/findInNote.js`, `src/hooks/useFindInNote.js`, `src/ui/FindBar.jsx`, `src/styles/search.css`
- Create: `tests/e2e/renderer/search.spec.mjs`
- Modify: `src/editor/targets.js`, `src/hooks/useKeyboardCommands.js`, `src/main.jsx`, `src/styles/tokens.css`,
  `src/styles.css`

**Interfaces:**
- Consumes: `findMatchRanges` (Task 1), command id `findInNote` (Task 2).
- Produces:
  - `FindInNote`, a BlockNote extension
  - `setFindQuery(editor, query)`, `stepFind(editor, delta)`, `clearFind(editor)`
  - `getFindState(editor) -> {query, matches: Array<{from, to}>, index}`
  - `revealCurrentFindMatch(editor)`, `selectCurrentFindMatch(editor)`
  - `getFindSeedText(editor) -> string | undefined`
  - `useFindInNote(editor)` returns `{ isOpen, query, current, total, focusRequest, openFind(query?), updateQuery(query), step(delta), closeFind() }`.
    Task 4 calls `openFind(query)`.

- [ ] **Step 1: Write the failing renderer tests**

Create `tests/e2e/renderer/search.spec.mjs`:

```js
import { expect, test } from "@playwright/test";
import {
  clickLastEmptyParagraph,
  expectEditorToBeFocused,
  modifierShortcut,
} from "../support/renderer-helpers.mjs";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("sticky-editor-surface")).toBeVisible();
});

async function typeParagraphs(page, paragraphs) {
  await clickLastEmptyParagraph(page);
  for (const [index, paragraph] of paragraphs.entries()) {
    if (index > 0) {
      await page.keyboard.press("Enter");
    }
    await page.keyboard.insertText(paragraph);
  }
}

function findBar(page) {
  return page.getByRole("search", { name: "Find in note" });
}

test("finds, steps through and clears matches in the current note", async ({ page }) => {
  await typeParagraphs(page, ["needle one needle two", "Needle three"]);

  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await expect(input).toBeFocused();
  await input.fill("needle");

  await expect(page.locator(".bn-editor .notepane-find-match")).toHaveCount(3);
  await expect(findBar(page)).toContainText("1 / 3");
  await input.press("Enter");
  await expect(findBar(page)).toContainText("2 / 3");
  await input.press("Shift+Enter");
  await input.press("Shift+Enter");
  await expect(findBar(page)).toContainText("3 / 3");
  await expect(page.locator(".bn-editor .notepane-find-match.is-current"))
    .toHaveText("Needle");

  await input.press("Escape");
  await expect(findBar(page)).toHaveCount(0);
  await expect(page.locator(".bn-editor .notepane-find-match")).toHaveCount(0);
  await expectEditorToBeFocused(page);
  await expect.poll(() => page.evaluate(() => String(window.getSelection())))
    .toBe("Needle");
});

test("matches Korean text, including decomposed Hangul", async ({ page }) => {
  await typeParagraphs(page, ["한글 검색 테스트", "한글 문서"]);

  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("한글");

  await expect(findBar(page)).toContainText("1 / 2");
});

test("ignores Enter that commits an IME composition in the find input", async ({ page }) => {
  await typeParagraphs(page, ["needle needle needle"]);
  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("needle");
  await expect(findBar(page)).toContainText("1 / 3");

  await input.evaluate((element) => {
    element.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      isComposing: true,
      key: "Enter",
    }));
  });
  await expect(findBar(page)).toContainText("1 / 3");

  await input.press("Enter");
  await expect(findBar(page)).toContainText("2 / 3");
});

test("expands a collapsed toggle that holds the current match", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.insertText("Parent toggle");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("hidden needle");
  const wrapper = page.locator(".bn-toggle-wrapper").filter({ hasText: "Parent toggle" });
  await wrapper.locator(".bn-toggle-button").first().click();
  await expect(wrapper).toHaveAttribute("data-show-children", "false");

  await page.getByText("Parent toggle").click();
  await page.keyboard.press(modifierShortcut("F"));
  await findBar(page).getByRole("textbox", { name: "Find in note" }).fill("needle");

  await expect(wrapper).toHaveAttribute("data-show-children", "true");
  await expect(page.getByText("hidden needle")).toBeVisible();
});

test("updates the match count while the note is edited", async ({ page }) => {
  await typeParagraphs(page, ["needle needle"]);
  await page.keyboard.press(modifierShortcut("F"));
  await findBar(page).getByRole("textbox", { name: "Find in note" }).fill("needle");
  await expect(findBar(page)).toContainText("/ 2");

  await page.getByText("needle needle").click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" needle");

  await expect(findBar(page)).toContainText("/ 3");
});

test("seeds the find input from a single-block text selection", async ({ page }) => {
  await typeParagraphs(page, ["select this word"]);
  await page.getByText("select this word").dblclick();
  const selected = await page.evaluate(() => String(window.getSelection()).trim());

  await page.keyboard.press(modifierShortcut("F"));

  await expect(findBar(page).getByRole("textbox", { name: "Find in note" }))
    .toHaveValue(selected);
});

test("Enter in the find input never edits a toggle under the caret", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.type(">");
  await page.keyboard.press("Space");
  await page.keyboard.insertText("toggle needle");
  const blocks = page.locator(".bn-editor .bn-block-outer");
  const blockCount = await blocks.count();

  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("needle");
  await input.press("Enter");
  await input.press("Escape");

  await expect(blocks).toHaveCount(blockCount);
});

// One insertText is one undo step. If find recorded anything in history,
// the single Mod+Z below would undo that instead and the text would remain.
test("leaves undo history to the last real edit", async ({ page }) => {
  await clickLastEmptyParagraph(page);
  await page.keyboard.insertText("undo me later");
  await page.keyboard.press(modifierShortcut("F"));
  const input = findBar(page).getByRole("textbox", { name: "Find in note" });
  await input.fill("undo");
  await input.press("Enter");
  await input.press("Escape");

  await page.keyboard.press(modifierShortcut("Z"));

  await expect(page.getByText("undo me later")).toHaveCount(0);
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/e2e/renderer/search.spec.mjs`
Expected: every test fails waiting for the role `search` named "Find in note". The undo test may pass, since no find
code exists yet. It must still pass after Step 7.

- [ ] **Step 3: Implement the extension `src/editor/findInNote.js`**

```js
import { createExtension } from "@blocknote/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findMatchRanges } from "../model/search.js";

// Find in note. Matches live in plugin state and render as decorations, so
// searching never changes the document, the undo history or the save state.

export const findInNotePluginKey = new PluginKey("notepaneFindInNote");
const EMPTY_FIND_STATE = Object.freeze({ query: "", matches: [], index: -1 });

// The text of each textblock with the document position of every character,
// so a match found in the string maps back to positions. Leaf inline nodes
// such as hard breaks become a newline so a match cannot span them.
function collectTextblocks(doc) {
  const textblocks = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true;
    }
    let text = "";
    const positions = [];
    node.forEach((child, offset) => {
      const childPos = pos + 1 + offset;
      if (child.isText) {
        for (let index = 0; index < child.text.length; index += 1) {
          text += child.text[index];
          positions.push(childPos + index);
        }
      } else {
        text += "\n";
        positions.push(childPos);
      }
    });
    textblocks.push({ text, positions });
    return false;
  });
  return textblocks;
}

export function findMatchesInDoc(doc, query) {
  if (!query) {
    return [];
  }
  const matches = [];
  for (const { text, positions } of collectTextblocks(doc)) {
    for (const { start, end } of findMatchRanges(text, query)) {
      matches.push({ from: positions[start], to: positions[end - 1] + 1 });
    }
  }
  return matches;
}

function indexNearest(matches, pos) {
  if (matches.length === 0) {
    return -1;
  }
  const index = matches.findIndex((match) => match.from >= pos);
  return index < 0 ? 0 : index;
}

const findInNotePlugin = new Plugin({
  key: findInNotePluginKey,
  state: {
    init: () => EMPTY_FIND_STATE,
    apply(tr, value, _oldState, newState) {
      const meta = tr.getMeta(findInNotePluginKey);
      if (meta?.type === "setQuery") {
        const matches = findMatchesInDoc(newState.doc, meta.query);
        return { query: meta.query, matches, index: indexNearest(matches, meta.from) };
      }
      if (meta?.type === "step") {
        const count = value.matches.length;
        return count === 0
          ? value
          : { ...value, index: (value.index + meta.delta + count) % count };
      }
      if (meta?.type === "clear") {
        return EMPTY_FIND_STATE;
      }
      if (tr.docChanged && value.query) {
        const current = value.matches[value.index];
        const matches = findMatchesInDoc(newState.doc, value.query);
        const anchor = current ? tr.mapping.map(current.from) : 0;
        return { query: value.query, matches, index: indexNearest(matches, anchor) };
      }
      return value;
    },
  },
  props: {
    decorations(state) {
      const { matches, index } = findInNotePluginKey.getState(state);
      if (matches.length === 0) {
        return DecorationSet.empty;
      }
      return DecorationSet.create(
        state.doc,
        matches.map((match, matchIndex) =>
          Decoration.inline(match.from, match.to, {
            class: matchIndex === index
              ? "notepane-find-match is-current"
              : "notepane-find-match",
          }),
        ),
      );
    },
  },
});

export const FindInNote = createExtension({
  key: "notepaneFindInNote",
  prosemirrorPlugins: [findInNotePlugin],
});

function getView(editor) {
  const view = editor?.prosemirrorView;
  return view && !view.isDestroyed ? view : null;
}

function dispatchFindMeta(editor, meta) {
  const view = getView(editor);
  if (!view) {
    return;
  }
  view.dispatch(
    view.state.tr
      .setMeta(findInNotePluginKey, meta)
      .setMeta("addToHistory", false),
  );
}

export function setFindQuery(editor, query) {
  const from = getView(editor)?.state.selection.from ?? 0;
  dispatchFindMeta(editor, { type: "setQuery", query, from });
}

export function stepFind(editor, delta) {
  dispatchFindMeta(editor, { type: "step", delta });
}

export function clearFind(editor) {
  dispatchFindMeta(editor, { type: "clear" });
}

export function getFindState(editor) {
  const state = getView(editor)?.state;
  return (state && findInNotePluginKey.getState(state)) ?? EMPTY_FIND_STATE;
}

function getCurrentFindMatch(editor) {
  const { matches, index } = getFindState(editor);
  return matches[index] ?? null;
}

export function selectCurrentFindMatch(editor) {
  const view = getView(editor);
  const match = getCurrentFindMatch(editor);
  if (!view || !match) {
    return;
  }
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)),
  );
}

// Opens every collapsed toggle that contains the position, skipping the block
// that holds the position itself: a match in a toggle title is already visible.
function expandTogglesAround(view, pos) {
  const $pos = view.state.doc.resolve(pos);
  let isOwnBlock = true;
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== "blockContainer") {
      continue;
    }
    if (isOwnBlock) {
      isOwnBlock = false;
      continue;
    }
    const outer = view.dom.querySelector(`.bn-block-outer[data-id="${CSS.escape(node.attrs.id)}"]`);
    const wrapper = outer
      ? [...outer.querySelectorAll(".bn-toggle-wrapper")]
        .find((element) => element.closest(".bn-block-outer") === outer)
      : null;
    if (wrapper?.getAttribute("data-show-children") === "false") {
      wrapper.querySelector(".bn-toggle-button")?.click();
    }
  }
}

export function revealCurrentFindMatch(editor) {
  const view = getView(editor);
  const match = getCurrentFindMatch(editor);
  if (!view || !match) {
    return;
  }
  expandTogglesAround(view, match.from);
  const { node } = view.domAtPos(match.from);
  const element = node instanceof Element ? node : node?.parentElement;
  element?.scrollIntoView({ block: "center" });
}

export function getFindSeedText(editor) {
  const view = getView(editor);
  const selection = view?.state.selection;
  if (!selection || selection.empty || selection.$from.parent !== selection.$to.parent) {
    return undefined;
  }
  const text = view.state.doc.textBetween(selection.from, selection.to).trim();
  return text || undefined;
}
```

- [ ] **Step 4: Implement `src/hooks/useFindInNote.js`**

```js
import {
  clearFind,
  getFindState,
  revealCurrentFindMatch,
  selectCurrentFindMatch,
  setFindQuery,
  stepFind,
} from "../editor/findInNote.js";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

/**
 * Find bar state. The query is applied from an effect, after the editor view
 * exists, so a find opened right after a note switch still finds its matches.
 */
export function useFindInNote(editor) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState({ current: 0, total: 0 });
  const [focusRequest, setFocusRequest] = useState(0);
  const [applyRequest, setApplyRequest] = useState(0);

  const refreshStatus = useCallback(() => {
    const { matches, index } = getFindState(editor);
    setStatus({ current: matches.length > 0 ? index + 1 : 0, total: matches.length });
  }, [editor]);

  useEffect(() => editor.onChange(refreshStatus), [editor, refreshStatus]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setFindQuery(editor, query);
    refreshStatus();
    revealCurrentFindMatch(editor);
  }, [applyRequest, editor, isOpen, query, refreshStatus]);

  const openFind = useCallback((initialQuery) => {
    if (typeof initialQuery === "string") {
      setQuery(initialQuery);
    }
    setIsOpen(true);
    setFocusRequest((value) => value + 1);
    setApplyRequest((value) => value + 1);
  }, []);

  const step = useCallback((delta) => {
    stepFind(editor, delta);
    refreshStatus();
    revealCurrentFindMatch(editor);
  }, [editor, refreshStatus]);

  const closeFind = useCallback(() => {
    selectCurrentFindMatch(editor);
    clearFind(editor);
    setIsOpen(false);
    setQuery("");
    refreshStatus();
    editor.focus();
  }, [editor, refreshStatus]);

  return {
    isOpen,
    query,
    current: status.current,
    total: status.total,
    focusRequest,
    openFind,
    updateQuery: setQuery,
    step,
    closeFind,
  };
}
```

- [ ] **Step 5: Implement `src/ui/FindBar.jsx`**

```jsx
import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  useEffect,
  useRef,
} from "react";

export function FindBar({
  query,
  current,
  total,
  focusRequest,
  isFindShortcut,
  onQueryChange,
  onStep,
  onClose,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  const handleKeyDown = (event) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onStep(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (isFindShortcut(event.nativeEvent)) {
      event.preventDefault();
      event.currentTarget.select();
    }
  };

  const hasNoMatch = query !== "" && total === 0;

  return (
    <div
      className="find-bar"
      role="search"
      aria-label="Find in note"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        className={hasNoMatch ? "find-bar-input has-no-match" : "find-bar-input"}
        aria-label="Find in note"
        placeholder="Find"
        spellCheck={false}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <span className="find-bar-count" aria-live="polite">{`${current} / ${total}`}</span>
      <button
        type="button"
        className="find-bar-button"
        aria-label="Previous match"
        disabled={total === 0}
        onClick={() => onStep(-1)}
      >
        <ChevronUp aria-hidden="true" size={15} />
      </button>
      <button
        type="button"
        className="find-bar-button"
        aria-label="Next match"
        disabled={total === 0}
        onClick={() => onStep(1)}
      >
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      <button
        type="button"
        className="find-bar-button"
        aria-label="Close find"
        onClick={onClose}
      >
        <X aria-hidden="true" size={15} />
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Add styles and tokens**

Create `src/styles/search.css`:

```css
/* Note search palette and find in note. */

.find-bar-dock {
  position: sticky;
  z-index: 27;
  top: 0;
  display: flex;
  justify-content: flex-end;
  height: 0;
  padding-right: 14px;
}

.find-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  margin-top: 10px;
  padding: 0 6px 0 4px;
  border: 1px solid color-mix(in srgb, var(--sticky-border-color) 48%, transparent);
  border-radius: 9px;
  background: var(--sticky-panel-bg);
  box-shadow: 0 8px 22px color-mix(in srgb, var(--sticky-text-color) 10%, transparent);
  color: var(--sticky-panel-text);
  font: 500 12px/1 var(--notepane-ui-font);
}

.find-bar-input {
  width: min(220px, 38vw);
  height: 26px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  outline: none;
}

.find-bar-input:focus {
  border-color: color-mix(in srgb, var(--sticky-border-color) 70%, transparent);
}

.find-bar-input.has-no-match {
  border-color: #e5484d;
}

.find-bar-count {
  min-width: 42px;
  text-align: center;
  opacity: 0.72;
  font-variant-numeric: tabular-nums;
}

.find-bar-button {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.find-bar-button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--sticky-text-color) 9%, transparent);
}

.find-bar-button:disabled {
  cursor: default;
  opacity: 0.35;
}

.bn-editor .notepane-find-match {
  border-radius: 2px;
  background: var(--notepane-find-match-bg);
}

.bn-editor .notepane-find-match.is-current {
  background: var(--notepane-find-current-bg);
}
```

Append to the end of `src/styles/tokens.css`:

```css
.sticky-shell {
  --notepane-find-match-bg: rgba(250, 204, 21, 0.32);
  --notepane-find-current-bg: rgba(249, 115, 22, 0.55);
}

.sticky-shell.theme-dark {
  --notepane-find-match-bg: rgba(250, 204, 21, 0.22);
  --notepane-find-current-bg: rgba(251, 146, 60, 0.5);
}
```

Append as the last line of `src/styles.css`:

```css
@import "./styles/search.css";
```

- [ ] **Step 7: Wire it in**

In `src/editor/targets.js`, add `.find-bar, .search-palette` to the excluded selector list in `isEditorShortcutTarget`:

```js
      ".sticky-header, .session-sidebar, .image-tools, .crop-dialog, .preferences-panel, .preferences-window, .find-bar, .search-palette",
```

In `src/hooks/useKeyboardCommands.js`, add an `openFindInNote` parameter to `useChromeShortcuts` and handle it
directly after the `input, textarea, select, .preferences-window` guard:

```js
      if (matchesEnabledKeyboardShortcut(event, "findInNote")) {
        event.preventDefault();
        openFindInNote();
        return;
      }
```

In `src/main.jsx`:

- Add imports next to the other editor, hook and ui imports:

```js
import { FindInNote, getFindSeedText } from "./editor/findInNote.js";
import { useFindInNote } from "./hooks/useFindInNote.js";
import { FindBar } from "./ui/FindBar.jsx";
```

- Change `extensions: [BlockDragSelection],` in `useCreateBlockNote` to:

```js
    extensions: [BlockDragSelection, FindInNote],
```

- Directly after the `useCreateBlockNote({ ... })` call, add:

```js
  const findInNote = useFindInNote(editor);
  const { openFind } = findInNote;
  const openFindInNote = useCallback(
    () => openFind(getFindSeedText(editor)),
    [editor, openFind],
  );
```

- Pass `openFindInNote,` in the `useChromeShortcuts({ ... })` call.

- Inside the `sticky-editor-surface` section, insert immediately before `{editorFontSizeToast && (`:

```jsx
          {findInNote.isOpen && (
            <div className="find-bar-dock">
              <FindBar
                query={findInNote.query}
                current={findInNote.current}
                total={findInNote.total}
                focusRequest={findInNote.focusRequest}
                isFindShortcut={(event) => matchesEnabledKeyboardShortcut(event, "findInNote")}
                onQueryChange={findInNote.updateQuery}
                onStep={findInNote.step}
                onClose={findInNote.closeFind}
              />
            </div>
          )}
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npm run check:refs && npm run build`
Expected: no undefined references, and the build succeeds.

Run: `npx playwright test tests/e2e/renderer/search.spec.mjs`
Expected: 8 passed.

Run: `npx playwright test tests/e2e/renderer/editor-toggles.spec.mjs tests/e2e/renderer/editor-tables.spec.mjs`
Expected: all pass. These share the editor capture handlers that `targets.js` feeds.

- [ ] **Step 9: Commit**

```bash
git add src/editor/findInNote.js src/hooks/useFindInNote.js src/ui/FindBar.jsx src/styles/search.css \
  src/styles/tokens.css src/styles.css src/editor/targets.js src/hooks/useKeyboardCommands.js src/main.jsx \
  tests/e2e/renderer/search.spec.mjs
git commit -m "feat: find in note with Mod+F"
```

---

### Task 4: Note search palette

**Files:**
- Create: `src/ui/SearchPalette.jsx`
- Modify: `src/hooks/useKeyboardCommands.js`, `src/main.jsx`, `src/styles/search.css`
- Test: `tests/e2e/renderer/search.spec.mjs`, `tests/e2e/electron.spec.mjs`

**Interfaces:**
- Consumes: `searchNotes`, `createNoteTextReader`, `blocksToPlainText` (Task 1); `useFindInNote().openFind`
  (Task 3); command id `searchNotes` (Task 2).
- Produces:
  - App state `pendingFind: {noteId: string, query: string} | null`
  - `StickyEditor` props `pendingFind`, `onFindRequested(request)` and `onPendingFindHandled()`. Task 5 feeds
    `pendingFind` from IPC.
  - It calls `electronApi?.revealNote?.({ noteId, query })` for detached notes and for Sticky mode. Task 5 implements it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/renderer/search.spec.mjs`:

```js
function palette(page) {
  return page.getByRole("dialog", { name: "Search notes" });
}

test("opens the note search palette and lands on a match in the current note", async ({ page }) => {
  await typeParagraphs(page, ["palette target text", "second palette line"]);

  await page.keyboard.press(modifierShortcut("P"));
  const input = palette(page).getByRole("textbox", { name: "Search notes" });
  await expect(input).toBeFocused();
  await expect(palette(page).getByRole("option")).toHaveCount(1);

  await input.fill("zzz-not-there");
  await expect(palette(page)).toContainText("No matching notes");

  await input.fill("palette");
  await expect(palette(page).getByRole("option")).toHaveCount(1);
  await input.press("Enter");

  await expect(palette(page)).toHaveCount(0);
  await expect(findBar(page).getByRole("textbox", { name: "Find in note" }))
    .toHaveValue("palette");
  await expect(findBar(page)).toContainText("/ 2");
});

test("closes the note search palette with Escape and returns to the editor", async ({ page }) => {
  await typeParagraphs(page, ["escape check"]);
  await page.keyboard.press(modifierShortcut("P"));
  await palette(page).getByRole("textbox", { name: "Search notes" }).press("Escape");

  await expect(palette(page)).toHaveCount(0);
  await expectEditorToBeFocused(page);
});
```

Add to `tests/e2e/electron.spec.mjs`, before `test("Electron menu actions respect tabs/sticky modes and toggle always-on-top"`:

```js
test("Electron note search switches tabs and opens find on the match", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", markdown: "second has the needle", createdAt: 2, updatedAt: 2 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    const editor = page.getByTestId("sticky-editor-surface");
    await expect(editor).toContainText("first body");

    await editor.getByText("first body").click();
    await page.keyboard.press(modifierShortcut("P"));
    const palette = page.getByRole("dialog", { name: "Search notes" });
    await palette.getByRole("textbox", { name: "Search notes" }).fill("needle");
    await expect(palette.getByRole("option")).toHaveCount(1);
    await palette.getByRole("textbox", { name: "Search notes" }).press("Enter");

    await expect(editor).toContainText("second has the needle");
    await expect.poll(() => getCurrentPageNoteId(page)).toBe("second-note");
    const findBar = page.getByRole("search", { name: "Find in note" });
    await expect(findBar.getByRole("textbox", { name: "Find in note" })).toHaveValue("needle");
    await expect(findBar).toContainText("1 / 1");
  } finally {
    await electronApp.close();
  }
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/e2e/renderer/search.spec.mjs --grep "palette"`
Expected: both fail waiting for the dialog "Search notes".

Run: `npm run build && npx playwright test tests/e2e/electron.spec.mjs --grep "note search switches tabs"`
Expected: fails waiting for the dialog "Search notes".

- [ ] **Step 3: Implement `src/ui/SearchPalette.jsx`**

```jsx
import {
  useEffect,
  useRef,
  useState,
} from "react";

function HighlightedText({ text, ranges }) {
  const parts = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      parts.push(<span key={`text-${index}`}>{text.slice(cursor, range.start)}</span>);
    }
    parts.push(<mark key={`match-${index}`}>{text.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  });
  if (cursor < text.length) {
    parts.push(<span key="text-end">{text.slice(cursor)}</span>);
  }
  return parts;
}

export function SearchPalette({ query, results, onQueryChange, onChoose, onClose }) {
  const inputRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const moveSelection = (delta) => {
    if (results.length === 0) {
      return;
    }
    setSelectedIndex((index) => (index + delta + results.length) % results.length);
  };

  const handleKeyDown = (event) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = results[selectedIndex];
      if (result) {
        onChoose(result);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const activeResult = results[selectedIndex];

  return (
    <div
      className="search-palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="search-palette" role="dialog" aria-modal="true" aria-label="Search notes">
        <input
          ref={inputRef}
          className="search-palette-input"
          aria-label="Search notes"
          placeholder="Search notes"
          spellCheck={false}
          value={query}
          aria-controls="search-palette-results"
          aria-activedescendant={activeResult ? `search-result-${activeResult.note.id}` : undefined}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {results.length === 0 ? (
          <div className="search-palette-empty">No matching notes</div>
        ) : (
          <ul
            id="search-palette-results"
            className="search-palette-results"
            role="listbox"
            aria-label="Matching notes"
          >
            {results.map((result, index) => (
              <li
                key={result.note.id}
                id={`search-result-${result.note.id}`}
                role="option"
                aria-selected={index === selectedIndex}
                className={index === selectedIndex ? "search-result is-selected" : "search-result"}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChoose(result);
                }}
              >
                <span
                  className="search-result-dot"
                  aria-hidden="true"
                  style={{ background: result.note.theme?.tabTextColor ?? "var(--sticky-border-color)" }}
                />
                <span className="search-result-title">
                  <HighlightedText text={result.title} ranges={result.titleRanges} />
                </span>
                {result.matchCount > 0 && (
                  <span className="search-result-count">{result.matchCount}</span>
                )}
                {result.snippet.text && (
                  <span className="search-result-snippet">
                    {result.snippet.clippedStart ? "…" : ""}
                    <HighlightedText text={result.snippet.text} ranges={result.snippet.ranges} />
                    {result.snippet.clippedEnd ? "…" : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add palette styles**

Append to `src/styles/search.css`:

```css
.search-palette-backdrop {
  position: fixed;
  z-index: 60;
  inset: 0;
  display: flex;
  justify-content: center;
  padding-top: min(14vh, 120px);
  background: color-mix(in srgb, var(--sticky-text-color) 8%, transparent);
}

.search-palette {
  display: flex;
  flex-direction: column;
  width: min(560px, calc(100vw - 32px));
  max-height: min(70vh, 520px);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--sticky-border-color) 48%, transparent);
  border-radius: 12px;
  background: var(--sticky-panel-bg);
  box-shadow: 0 18px 48px color-mix(in srgb, var(--sticky-text-color) 18%, transparent);
  color: var(--sticky-panel-text);
  font: 500 13px/1.35 var(--notepane-ui-font);
}

.search-palette-input {
  height: 44px;
  padding: 0 16px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--sticky-border-color) 36%, transparent);
  background: transparent;
  color: inherit;
  font: 500 15px/1 var(--notepane-ui-font);
  outline: none;
}

.search-palette-results {
  margin: 0;
  padding: 6px;
  overflow-y: auto;
  list-style: none;
}

.search-result {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 10px;
  row-gap: 3px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.search-result.is-selected {
  background: color-mix(in srgb, var(--sticky-text-color) 8%, transparent);
}

.search-result-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.search-result-title {
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-result-count {
  opacity: 0.6;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.search-result-snippet {
  grid-column: 2 / 4;
  overflow: hidden;
  opacity: 0.72;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-result mark {
  border-radius: 2px;
  background: var(--notepane-find-match-bg);
  color: inherit;
}

.search-palette-empty {
  padding: 18px 16px;
  opacity: 0.65;
}
```

- [ ] **Step 5: Wire it in**

In `src/hooks/useKeyboardCommands.js`, add an `openSearchPalette` parameter to `useChromeShortcuts` and handle it right
after the `findInNote` check from Task 3:

```js
      if (matchesEnabledKeyboardShortcut(event, "searchNotes")) {
        event.preventDefault();
        openSearchPalette();
        return;
      }
```

In `src/main.jsx`:

- Add imports:

```js
import { blocksToPlainText, createNoteTextReader, searchNotes } from "./model/search.js";
import { SearchPalette } from "./ui/SearchPalette.jsx";
```

  If `getNoteDisplayTitle` is not already imported from `./model/notes.js`, add it to that import.

- In `App`, add state next to the other `useState` calls:

```js
  const [pendingFind, setPendingFind] = useState(null);
```

  and pass these props to `<StickyEditor`:

```jsx
        pendingFind={pendingFind}
        onFindRequested={setPendingFind}
        onPendingFindHandled={() => setPendingFind(null)}
```

- Add `pendingFind`, `onFindRequested` and `onPendingFindHandled` to the `StickyEditor({ ... })` parameter list.

- In `StickyEditor`, after the `openFindInNote` callback from Task 3, add:

```js
  const [searchPaletteQuery, setSearchPaletteQuery] = useState(null);
  const readNoteText = useMemo(() => createNoteTextReader(), []);
  const searchResults = useMemo(() => {
    if (searchPaletteQuery === null) {
      return [];
    }
    // The current note may have edits still waiting on the save debounce, so
    // it is read from the live editor instead of the stored copy.
    const entries = notes.map((candidate) => ({
      note: candidate,
      title: getNoteDisplayTitle(candidate),
      body: candidate.id === note.id
        ? blocksToPlainText(editor.document)
        : readNoteText(candidate),
    }));
    return searchNotes(entries, searchPaletteQuery);
  }, [editor, note.id, notes, readNoteText, searchPaletteQuery]);

  const openSearchPalette = useCallback(() => setSearchPaletteQuery(""), []);
  const closeSearchPalette = useCallback(() => {
    setSearchPaletteQuery(null);
    editor.focus();
  }, [editor]);
```

- Add `chooseSearchResult` after the `selectSidebarNote` callback, because it uses it:

```js
  const chooseSearchResult = useCallback(async (result) => {
    const query = searchPaletteQuery ?? "";
    setSearchPaletteQuery(null);
    const targetId = result.note.id;
    if (targetId === note.id) {
      openFind(query);
      return;
    }
    const isTabsWindow = effectiveLayoutMode === "tabs" && !note.detached;
    if (isTabsWindow && !result.note.detached) {
      onFindRequested({ noteId: targetId, query });
      await selectSidebarNote(targetId);
      return;
    }
    await electronApi?.revealNote?.({ noteId: targetId, query });
  }, [
    effectiveLayoutMode,
    note.detached,
    note.id,
    onFindRequested,
    openFind,
    searchPaletteQuery,
    selectSidebarNote,
  ]);

  useEffect(() => {
    if (pendingFind?.noteId !== note.id) {
      return;
    }
    onPendingFindHandled();
    openFind(pendingFind.query);
  }, [note.id, onPendingFindHandled, openFind, pendingFind]);
```

- Pass `openSearchPalette,` in the `useChromeShortcuts({ ... })` call.

- Render the palette immediately before `<AdaptiveTooltipPortal />` inside `<main className="sticky-shell ...">`:

```jsx
      {searchPaletteQuery !== null && (
        <SearchPalette
          query={searchPaletteQuery}
          results={searchResults}
          onQueryChange={setSearchPaletteQuery}
          onChoose={(result) => void chooseSearchResult(result)}
          onClose={closeSearchPalette}
        />
      )}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm run check:refs && npm run build`
Expected: no undefined references, and the build succeeds.

Run: `npx playwright test tests/e2e/renderer/search.spec.mjs`
Expected: 10 passed.

Run: `npx playwright test tests/e2e/electron.spec.mjs --grep "note search switches tabs"`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add src/ui/SearchPalette.jsx src/hooks/useKeyboardCommands.js src/main.jsx src/styles/search.css \
  tests/e2e/renderer/search.spec.mjs tests/e2e/electron.spec.mjs
git commit -m "feat: search notes with Mod+P"
```

---

### Task 5: Reveal notes in other windows

**Files:**
- Modify: `electron/main.cjs`, `electron/preload.cjs`, `src/main.jsx`
- Test: `tests/e2e/electron.spec.mjs`

**Interfaces:**
- Consumes: App `setPendingFind` (Task 4); `ensureWindowForNote`, `ensureTabsWindow`, `presentWindow`,
  `manuallyClosedStickyNoteIds` and `getNoteIdForWebContents`, which already exist in `electron/main.cjs`.
- Produces:
  - IPC `notes:reveal ({noteId, query}) -> note | null`
  - IPC `find:take-pending () -> {noteId, query} | null`
  - event `find:open`
  - preload `revealNote(payload)`, `takePendingFind()` and `onFindOpenRequested(callback) -> unsubscribe`

- [ ] **Step 1: Write the failing tests**

Add to `tests/e2e/electron.spec.mjs`, before `test("Electron menu actions respect tabs/sticky modes and toggle always-on-top"`:

```js
test("Electron note search reveals a sticky window, even one closed by hand", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
    { id: "second-note", title: "Second note", markdown: "second has the needle", createdAt: 2, updatedAt: 2 },
  ]);
  const electronApp = await launchApp(userDataDirectory);
  const countWindows = () => electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().length);
  const searchFrom = async (page, query) => {
    await page.bringToFront();
    await page.getByTestId("sticky-editor-surface").getByText("first body").click();
    await page.keyboard.press(modifierShortcut("P"));
    const input = page.getByRole("dialog", { name: "Search notes" })
      .getByRole("textbox", { name: "Search notes" });
    await input.fill(query);
    await input.press("Enter");
  };

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("first body");
    await clickMenuItem(electronApp, "Toggle Tabs / Sticky Mode");
    await expect.poll(countWindows).toBe(2);
    const firstStickyPage = await getStickyPageByNoteId(electronApp, "first-note");

    await searchFrom(firstStickyPage, "needle");
    let secondStickyPage = await getStickyPageByNoteId(electronApp, "second-note");
    let findBar = secondStickyPage.getByRole("search", { name: "Find in note" });
    await expect(findBar.getByRole("textbox", { name: "Find in note" })).toHaveValue("needle");
    await expect(findBar).toContainText("1 / 1");

    await secondStickyPage.evaluate(() => window.blocknoteSticky.closeCurrentWindow());
    await expect.poll(countWindows).toBe(1);

    await searchFrom(firstStickyPage, "needle");
    await expect.poll(countWindows).toBe(2);
    secondStickyPage = await getStickyPageByNoteId(electronApp, "second-note");
    findBar = secondStickyPage.getByRole("search", { name: "Find in note" });
    await expect(findBar.getByRole("textbox", { name: "Find in note" })).toHaveValue("needle");
  } finally {
    await electronApp.close();
  }
});

test("Electron reveal ignores a note that no longer exists", async () => {
  const userDataDirectory = createTemporaryDirectory("notepane-electron-");
  writeInitialNotes(userDataDirectory, [
    { id: "first-note", title: "First note", markdown: "first body", createdAt: 1, updatedAt: 1 },
  ]);
  const electronApp = await launchApp(userDataDirectory);

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByTestId("sticky-editor-surface")).toContainText("first body");

    const revealed = await page.evaluate(() =>
      window.blocknoteSticky.revealNote({ noteId: "missing-note", query: "x" }));

    expect(revealed).toBeNull();
    expect(await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    await electronApp.close();
  }
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx playwright test tests/e2e/electron.spec.mjs --grep "reveals a sticky window|reveal ignores"`
Expected: the sticky test fails waiting for the find bar in the second window. The missing-note test fails with
`window.blocknoteSticky.revealNote is not a function`.

- [ ] **Step 3: Implement the main-process IPC**

In `electron/main.cjs`, next to `const manuallyClosedStickyNoteIds = new Set();`, add:

```js
// Find queries waiting for a window to pick them up. A window that is still
// loading cannot receive `find:open` yet, so it pulls its query on startup.
const pendingFindQueries = new Map();
```

Inside `installIpcHandlers()`, after the `notes:attach` handler, add:

```js
  ipcMain.handle("notes:reveal", (_event, payload) => {
    const note = typeof payload?.noteId === "string" ? store.getNote(payload.noteId) : null;
    if (!note) {
      return null;
    }

    let window;
    if (store.getLayoutMode() === "sticky" || note.detached) {
      manuallyClosedStickyNoteIds.delete(note.id);
      window = ensureWindowForNote(note);
    } else {
      window = ensureTabsWindow(note.id);
    }
    if (!window || window.isDestroyed()) {
      return null;
    }

    pendingFindQueries.set(note.id, typeof payload?.query === "string" ? payload.query : "");
    if (!window.webContents.isLoading()) {
      window.webContents.send("find:open");
    }
    presentWindow(window);
    return note;
  });

  ipcMain.handle("find:take-pending", (event) => {
    const noteId = getNoteIdForWebContents(event.sender);
    if (!noteId || !pendingFindQueries.has(noteId)) {
      return null;
    }
    const query = pendingFindQueries.get(noteId);
    pendingFindQueries.delete(noteId);
    return { noteId, query };
  });
```

In `electron/preload.cjs`, add after `attachNote`:

```js
  revealNote: (payload) => ipcRenderer.invoke("notes:reveal", payload),
  takePendingFind: () => ipcRenderer.invoke("find:take-pending"),
  onFindOpenRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("find:open", listener);
    return () => ipcRenderer.removeListener("find:open", listener);
  },
```

- [ ] **Step 4: Consume the handoff in `App`**

In `src/main.jsx`, in `App`, add next to the other `electronApi?.on...` subscription effects:

```js
  useEffect(() => {
    if (!electronApi?.takePendingFind) {
      return undefined;
    }
    // Pull on startup for a window created by a reveal, and on `find:open` for a
    // window that was already loaded. Whichever comes first takes the query.
    const takePendingFind = async () => {
      const request = await electronApi.takePendingFind();
      if (request) {
        setPendingFind(request);
      }
    };
    void takePendingFind();
    return electronApi.onFindOpenRequested?.(() => void takePendingFind());
  }, []);
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npm run check:refs && npm run build`
Expected: no undefined references, and the build succeeds.

Run: `npx playwright test tests/e2e/electron.spec.mjs --grep "reveals a sticky window|reveal ignores|note search switches tabs"`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add electron/main.cjs electron/preload.cjs src/main.jsx tests/e2e/electron.spec.mjs
git commit -m "feat: reveal search results in their own windows"
```

---

### Task 6: Documentation and full verification

**Files:**
- Modify: `docs/usage.md`, `docs/features.md`, `docs/architecture.md`

- [ ] **Step 1: Document the shortcuts and code map**

In `docs/usage.md`, add to the "Writing" table after the `⌘A` row:

```markdown
| `⌘P` | Search every note and jump to a match |
| `⌘F` | Find in the current note (`Enter` / `⇧Enter` to step, `Esc` to close) |
```

In `docs/features.md`, add under "## Editor" after the `Command/Ctrl + X` line:

```markdown
- Search notes: `Command/Ctrl + P` searches titles and bodies of every note outside Trash and opens the chosen note at its first match
- Find in note: `Command/Ctrl + F` highlights matches, steps with `Enter` / `Shift + Enter`, and expands collapsed toggles that hold the current match
```

In `docs/architecture.md`, add to the "Where behaviour lives" table after the "Code block language detection" row:

```markdown
| Note search matching, snippets and plain-text extraction | `src/model/search.js` |
| Find in note decorations and navigation | `src/editor/findInNote.js`, `src/hooks/useFindInNote.js` |
```

- [ ] **Step 2: Run full verification**

Run: `git diff --check`
Expected: no output.

Run: `npm run verify > verify.log 2>&1; echo "exit=$?"`, then read `verify.log`. Do not pipe into `tail`, which hides
the exit code.
Expected: unit, renderer and build all pass. In the Electron suite, only the two baseline tests from Global
Constraints may fail. Rerun any other failure on its own once before treating it as a regression.

- [ ] **Step 3: Commit**

```bash
git add docs/usage.md docs/features.md docs/architecture.md
git commit -m "docs: document note search and find in note"
```
