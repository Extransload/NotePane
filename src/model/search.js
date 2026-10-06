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
  // Fast path for the common case. Lowercasing only ever lengthens a string,
  // so when the text is already NFC and keeps its length, every index maps to
  // itself and per-grapheme work is unnecessary.
  const wholeNormalized = normalizeSearchText(text);
  if (wholeNormalized.length === text.length && text === text.normalize("NFC")) {
    return { normalized: wholeNormalized, starts: null, ends: null };
  }

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
    ranges.push(starts
      ? { start: starts[at], end: ends[at + needle.length - 1] }
      : { start: at, end: at + needle.length });
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
  // Every table cell is its own text block in the editor, so each one gets
  // its own line, the unit that note search matches within.
  if (content.type === "tableContent") {
    return (content.rows ?? [])
      .flatMap((row) => (row.cells ?? []).map(inlineToPlainText))
      .join("\n");
  }
  if (typeof content.text === "string") {
    return content.text;
  }
  return inlineToPlainText(content.content);
}

// Reads only `content` and `children`, never `props`, so image and file URLs
// (often multi-megabyte data URLs) are never searched. Blocks are separated by
// newlines. A query never holds a newline, so a match stays inside one block,
// as it does in find in note.
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
    .replace(/\|/g, "\n")
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

// Replaces each whitespace character with one space, so a snippet shows on one
// line while its match ranges keep their offsets.
function flattenWhitespace(text) {
  return text.replace(/\s/g, " ");
}

export function makeSnippet(text, ranges) {
  const first = ranges[0];
  const start = first ? Math.max(0, first.start - SNIPPET_BEFORE) : 0;
  const end = Math.min(text.length, start + SNIPPET_LENGTH);
  return {
    text: flattenWhitespace(text.slice(start, end)),
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
    // Matched as stored, without collapsing whitespace across blocks.
    const body = String(entry.body ?? "");
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
