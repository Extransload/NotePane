import {
  AUTO_TITLE_MAX_LENGTH,
  DEFAULT_EDITOR_FONT_FAMILY,
  DEFAULT_EDITOR_FONT_SCALE,
  DEFAULT_THEME,
  DEFAULT_TITLE,
} from "../constants.js";
import {
  collectBlocks,
  extractBlockPlainText,
} from "../editor/blocks.js";
import {
  clamp,
} from "../utils/values.js";

export function parseBlocksJSON(blocksJSON) {
  if (typeof blocksJSON !== "string" || blocksJSON.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(blocksJSON);
    return Array.isArray(parsed) && parsed.length > 0
      ? normalizeSupportedHeadingLevels(parsed)
      : null;
  } catch {
    return null;
  }
}

export function normalizeSupportedHeadingLevels(blocks) {
  return blocks.map((block) => {
    const children = Array.isArray(block?.children)
      ? normalizeSupportedHeadingLevels(block.children)
      : block?.children;

    if (block?.type !== "heading") {
      return children === block?.children ? block : { ...block, children };
    }

    const level = clamp(
      Math.round(Number(block.props?.level ?? block.props?.headingLevel ?? 1)),
      1,
      4,
      1,
    );
    return {
      ...block,
      props: { ...block.props, level },
      children,
    };
  });
}

export function createTemplateSessionNote(sourceNote = {}, timestamp = Date.now()) {
  return {
    id: crypto.randomUUID(),
    title: "NotePane",
    titleManuallyEdited: false,
    blocksJSON: null,
    markdown: "",
    bounds: sourceNote.bounds,
    theme: DEFAULT_THEME,
    alwaysOnTop: false,
    detached: false,
    seedDemoContent: true,
    editorFontScale: sourceNote.editorFontScale ?? DEFAULT_EDITOR_FONT_SCALE,
    editorFontFamily: sourceNote.editorFontFamily ?? DEFAULT_EDITOR_FONT_FAMILY,
    trashedAt: null,
    sortOrder: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function mergeNotes(notes, updatedNote) {
  const noteMap = new Map();
  for (const note of Array.isArray(notes) ? notes : []) {
    if (note?.id) {
      noteMap.set(note.id, note);
    }
  }

  if (updatedNote?.id) {
    noteMap.set(updatedNote.id, {
      ...noteMap.get(updatedNote.id),
      ...updatedNote,
    });
  }

  return [...noteMap.values()].sort(sortNotesByOrder);
}

export function reorderNotesByIds(notes, orderedNoteIds) {
  const currentNotes = Array.isArray(notes) ? notes : [];
  const noteMap = new Map(currentNotes.map((note) => [note.id, note]));
  const orderedIds = normalizeOrderedNoteIds(orderedNoteIds);
  const nextNotes = [];
  const seenIds = new Set();

  for (const noteId of orderedIds) {
    const note = noteMap.get(noteId);
    if (!note || seenIds.has(note.id)) {
      continue;
    }
    nextNotes.push(note);
    seenIds.add(note.id);
  }

  for (const note of currentNotes) {
    if (!seenIds.has(note.id)) {
      nextNotes.push(note);
    }
  }

  return nextNotes.map((note, index) => ({
    ...note,
    sortOrder: index + 1,
  }));
}

export function sortNotesByOrder(a, b) {
  return (
    (normalizeSortOrder(a?.sortOrder) ?? Number.POSITIVE_INFINITY) -
      (normalizeSortOrder(b?.sortOrder) ?? Number.POSITIVE_INFINITY) ||
    (a?.createdAt ?? 0) - (b?.createdAt ?? 0)
  );
}

export function normalizeOrderedNoteIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((noteId) => typeof noteId === "string" && noteId);
}

export function normalizeSortOrder(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : null;
}

export function mergeTrashedNotes(notes, updatedNote) {
  const noteMap = new Map();
  for (const note of Array.isArray(notes) ? notes : []) {
    if (note?.id) {
      noteMap.set(note.id, note);
    }
  }

  if (updatedNote?.id) {
    noteMap.set(updatedNote.id, {
      ...noteMap.get(updatedNote.id),
      ...updatedNote,
    });
  }

  return [...noteMap.values()].sort(
    (a, b) =>
      (b.trashedAt ?? 0) - (a.trashedAt ?? 0) ||
      (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  );
}

export function normalizeTitle(value, fallback = DEFAULT_TITLE) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 80)
    : fallback;
}

export function isTitleManuallyEdited(note) {
  return note?.titleManuallyEdited === true;
}

export function getNoteDisplayTitle(note, blocks = null) {
  if (isTitleManuallyEdited(note)) {
    return normalizeTitle(note?.title);
  }

  const titleFromBlocks = deriveAutomaticTitleFromBlocks(
    blocks ?? parseBlocksJSON(note?.blocksJSON),
  );
  if (titleFromBlocks !== DEFAULT_TITLE) {
    return titleFromBlocks;
  }

  return deriveAutomaticTitleFromMarkdown(note?.markdown);
}

export function deriveAutomaticTitleFromBlocks(blocks) {
  const titleText = extractFirstBlockTitleText(blocks);
  return normalizeAutomaticTitleText(titleText);
}

export function deriveAutomaticTitleFromMarkdown(markdown) {
  if (typeof markdown !== "string") {
    return DEFAULT_TITLE;
  }

  const line = markdown
    .split(/\r?\n/)
    .find((candidate) => stripMarkdownTitleSyntax(candidate).trim());

  return normalizeAutomaticTitleText(line ? stripMarkdownTitleSyntax(line) : "");
}

export function normalizeAutomaticTitleText(value) {
  if (typeof value !== "string") {
    return DEFAULT_TITLE;
  }

  const normalizedText = value.replace(/\s+/g, " ").trim();
  return normalizedText
    ? normalizedText.slice(0, AUTO_TITLE_MAX_LENGTH)
    : DEFAULT_TITLE;
}

export function extractFirstBlockTitleText(blocks) {
  if (!Array.isArray(blocks)) {
    return "";
  }

  for (const block of blocks) {
    const contentText = extractBlockPlainText(block?.content);
    if (contentText.trim()) {
      return contentText;
    }

    const childText = extractFirstBlockTitleText(block?.children);
    if (childText.trim()) {
      return childText;
    }
  }

  return "";
}

export function stripMarkdownTitleSyntax(value) {
  return String(value)
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "");
}

export function formatTrashTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "Deleted recently";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Deleted recently";
  }

  return `Deleted ${date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function getTrashPreviewLines(note) {
  const blocks = parseBlocksJSON(note?.blocksJSON);
  if (Array.isArray(blocks)) {
    const blockLines = [];
    collectBlocks(blocks, (block) => {
      const line = getBlockPreviewLine(block);
      if (line) {
        blockLines.push(line);
      }
    });
    const normalizedBlockLines = normalizeTrashPreviewLines(blockLines);
    if (normalizedBlockLines.length > 0) {
      return normalizedBlockLines;
    }
  }

  if (typeof note?.markdown === "string" && note.markdown.trim()) {
    return normalizeTrashPreviewLines(note.markdown.split(/\r?\n/));
  }

  return [];
}

export function getBlockPreviewLine(block) {
  const plainText = normalizePreviewText(extractBlockPlainText(block?.content));
  if (plainText) {
    return plainText;
  }

  if (block?.type === "image") {
    return "Image";
  }

  if (block?.type === "file") {
    return "Attachment";
  }

  return "";
}

export function normalizeTrashPreviewLines(lines) {
  const normalizedLines = [];
  for (const line of lines) {
    const normalizedLine = normalizePreviewText(line);
    if (!normalizedLine) {
      continue;
    }

    normalizedLines.push(
      normalizedLine.length > 260
        ? `${normalizedLine.slice(0, 257)}...`
        : normalizedLine,
    );
    if (normalizedLines.length >= 36) {
      break;
    }
  }

  return normalizedLines;
}

export function normalizePreviewText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
