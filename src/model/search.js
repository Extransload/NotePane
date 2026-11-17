// Pure helpers for note search and find in note. Matching is case-insensitive
// substring matching after NFC normalization, so decomposed Hangul (common in
// text pasted from macOS file names) matches composed input.

import {
  normalizeTag,
  normalizeTags,
} from "./tags.js";

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

// A token is a quoted folder filter, which may hold spaces, or any run of
// non-space characters. The quoted form is tried first at each token start.
const QUERY_TOKEN = /folder:"[^"]*"?|\S+/gi;
const FOLDER_PREFIX = /^folder:/i;

// Splits a palette query into its free text and its filters: each `#tag` token
// is a tag the note must carry, and `folder:Name` or `folder:"Two words"` names
// the folder it must be in (the last one wins). A filter token still being
// typed, such as a lone "#" or "folder:", filters nothing and is not searched
// as text either.
export function parseSearchQuery(query) {
  const source = String(query ?? "");
  const words = [];
  const tags = [];
  let folder = null;
  let hasFilterToken = false;
  for (const [token] of source.matchAll(QUERY_TOKEN)) {
    if (FOLDER_PREFIX.test(token)) {
      hasFilterToken = true;
      const value = token.slice("folder:".length).replace(/^"|"$/g, "").trim();
      if (value) {
        folder = value;
      }
      continue;
    }
    if (token.startsWith("#")) {
      hasFilterToken = true;
      const tag = normalizeTag(token);
      if (tag && !tags.includes(tag)) {
        tags.push(tag);
      }
      continue;
    }
    words.push(token);
  }
  // Without filter tokens the text is kept as typed, inner spacing included,
  // because that is what find in note receives.
  return {
    text: hasFilterToken ? words.join(" ") : source.trim(),
    tags,
    folder,
  };
}

function formatFolderToken(name) {
  return /[\s"]/.test(name) ? `folder:"${name.replace(/"/g, "")}"` : `folder:${name}`;
}

// The inverse of parseSearchQuery, used when a filter chip changes the query:
// filters first, then the text. A query of filters only ends with a space so
// typing continues as new text.
export function formatSearchQuery({ text = "", tags = [], folder = null } = {}) {
  const filters = [
    ...(folder ? [formatFolderToken(folder)] : []),
    ...normalizeTags(tags).map((tag) => `#${tag}`),
  ].join(" ");
  const trimmedText = String(text ?? "").trim();
  if (!filters) {
    return trimmedText;
  }
  return trimmedText ? `${filters} ${trimmedText}` : `${filters} `;
}

function sameFolderName(left, right) {
  return normalizeSearchText(String(left ?? "").trim()) === normalizeSearchText(String(right ?? "").trim());
}

// The folderId filter for a typed folder name. Names may repeat, so a name
// stands for every folder carrying it. "none" means notes outside any folder,
// unless a folder is really called that. A name that matches no folder gives
// an empty list, which no note is in.
export function resolveFolderFilter(folderName, folders) {
  if (!folderName) {
    return null;
  }
  const ids = (Array.isArray(folders) ? folders : [])
    .filter((folder) => sameFolderName(folder.name, folderName))
    .map((folder) => folder.id);
  if (ids.length === 0 && sameFolderName(folderName, "none")) {
    return "none";
  }
  return ids;
}

// Keeps the entries whose note carries every tag and sits in the folder.
// `folderId` is null for any folder, "none" for no folder, or one folder id or
// a list of them. With `folders` given, a note whose folder no longer exists
// counts as having none, as it does in the sidebar.
export function filterSearchEntries(entries, { tags = [], folderId = null, folders = null } = {}) {
  const wantedTags = normalizeTags(tags);
  const knownFolderIds = Array.isArray(folders) ? new Set(folders.map((folder) => folder.id)) : null;
  const wantedFolderIds = folderId === null || folderId === undefined || folderId === "none"
    ? null
    : new Set(Array.isArray(folderId) ? folderId : [folderId]);
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const noteFolderId = entry.note?.folderId;
    const effectiveFolderId = noteFolderId && (!knownFolderIds || knownFolderIds.has(noteFolderId))
      ? noteFolderId
      : null;
    if (folderId === "none" && effectiveFolderId !== null) {
      return false;
    }
    if (wantedFolderIds && !wantedFolderIds.has(effectiveFolderId)) {
      return false;
    }
    if (wantedTags.length === 0) {
      return true;
    }
    const noteTags = normalizeTags(entry.note?.tags);
    return wantedTags.every((tag) => noteTags.includes(tag));
  });
}

// Every tag on the given notes, alphabetically, for the palette's chips.
export function collectNoteTags(notes) {
  const tags = new Set();
  for (const note of Array.isArray(notes) ? notes : []) {
    for (const tag of normalizeTags(note?.tags)) {
      tags.add(tag);
    }
  }
  return [...tags].sort((left, right) => left.localeCompare(right));
}
