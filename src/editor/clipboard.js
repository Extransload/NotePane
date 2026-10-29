import { isBlockSetSelection } from "./blockSelection.js";

// A cell selection's `from`/`to` cover only its head cell; its ranges cover every cell.
function isCellSelection(selection) {
  return Boolean(selection?.$anchorCell && selection?.$headCell);
}

export function isStandaloneWebUrl(text) {
  return /^https?:\/\/\S+$/i.test(String(text).trim());
}

export function normalizeCopiedEditorPlainText(editor, clipboardText, selectedText = "") {
  let normalizedPlainText = String(clipboardText).replace(/\\\n/g, "\n");

  try {
    normalizedPlainText = editor.transact((transaction) => {
      // A block set has one range per run of blocks. Every other selection,
      // a table cell selection included, is read from `from` to `to`.
      const { selection } = transaction;
      const spans = isBlockSetSelection(selection) || isCellSelection(selection)
        ? selection.ranges.map(({ $from, $to }) => [$from.pos, $to.pos])
        : [[selection.from, selection.to]];
      let containsHardBreak = false;
      for (const [from, to] of spans) {
        transaction.doc.nodesBetween(from, to, (node) => {
          if (node.type.name === "hardBreak") {
            containsHardBreak = true;
          }
        });
      }

      if (!containsHardBreak) {
        return normalizedPlainText;
      }

      return spans
        .map(([from, to]) => transaction.doc.textBetween(from, to, "\n", "\n"))
        .join("\n");
    });
  } catch {
    // Keep the clipboard serializer output when the editor selection is unavailable.
  }

  if (
    normalizedPlainText.endsWith("\n") &&
    !String(selectedText).endsWith("\n")
  ) {
    return normalizedPlainText.slice(0, -1);
  }

  return normalizedPlainText;
}

// BlockNote renders blocks to serialise them and never destroys the result. A rendered toggle keeps
// an editor change subscription that throws once its block is gone: after a cut, and after every
// HTML or Markdown paste, since BlockNote serialises the blocks it parsed before pasting them.
// Subscriptions made while `run` runs still work, and drop themselves the first time they throw.
export function withSelfRemovingChangeSubscriptions(editor, run) {
  const { onChange } = editor;
  editor.onChange = (callback, ...rest) => {
    let unsubscribe = () => {};
    unsubscribe = onChange.call(editor, (...args) => {
      try {
        return callback(...args);
      } catch {
        unsubscribe();
        return undefined;
      }
    }, ...rest);
    return unsubscribe;
  };
  try {
    return run();
  } finally {
    editor.onChange = onChange;
  }
}

// Runs the editor's HTML and Markdown pastes, BlockNote's default paste handler included, through
// withSelfRemovingChangeSubscriptions.
export function guardPasteSerialisation(editor) {
  if (editor.pasteHTML.isGuarded) {
    return;
  }
  for (const method of ["pasteHTML", "pasteMarkdown"]) {
    const paste = editor[method].bind(editor);
    editor[method] = (...args) => withSelfRemovingChangeSubscriptions(editor, () => paste(...args));
  }
  editor.pasteHTML.isGuarded = true;
}

// The formats the editor's own block copy writes: lossless blocknote/html for a paste back
// into NotePane, HTML for other apps, and Markdown as plain text. `selectedText` is the text of
// the selection the blocks came from, which keeps line breaks the Markdown would lose.
export function setBlocksClipboardData(
  editor,
  blocks,
  clipboardData,
  selectedText = window.getSelection()?.toString() ?? "",
) {
  withSelfRemovingChangeSubscriptions(editor, () => {
    clipboardData.clearData();
    clipboardData.setData("blocknote/html", editor.blocksToFullHTML(blocks));
    clipboardData.setData("text/html", editor.blocksToHTMLLossy(blocks));
    clipboardData.setData(
      "text/plain",
      normalizeCopiedEditorPlainText(editor, editor.blocksToMarkdownLossy(blocks), selectedText),
    );
  });
}

/**
 * Puts `blocks` on the clipboard in the formats of the editor's own copy. The async clipboard
 * API only takes plain text and HTML, so this runs a copy command whose event carries the
 * formats, which works the same in the browser and in Electron. It has to run inside the key
 * press that asked for it. Returns whether the clipboard was written.
 */
export function writeBlocksToClipboard(editor, blocks) {
  const ownerDocument = editor.domElement?.ownerDocument ?? document;
  const ownerWindow = ownerDocument.defaultView ?? window;
  let isWritten = false;
  // Ahead of every other copy handler, which would read the editor's selection instead.
  const writeBlocks = (event) => {
    if (!event.clipboardData) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    // The blocks come from the caret or a block menu, not from whatever text is selected.
    setBlocksClipboardData(editor, blocks, event.clipboardData, "");
    isWritten = true;
  };
  ownerWindow.addEventListener("copy", writeBlocks, true);
  try {
    ownerDocument.execCommand("copy");
  } finally {
    ownerWindow.removeEventListener("copy", writeBlocks, true);
  }
  return isWritten;
}

// How a paste is read. Plain text that looks like Markdown is pasted as Markdown, because many
// sources put the same text in their HTML only wrapped in styled elements, and Notion or GitHub
// write Markdown that keeps more than their HTML, such as a checked to-do. HTML is pasted instead
// when its structure is missing from the plain text, such as a heading "1. Overview" whose plain
// text reads as a numbered list.
export function normalizePastedMarkdownForBlockNote(markdown, html = "") {
  const normalizedLineEndings = String(markdown).replace(/\r\n?/g, "\n");
  const normalizedTables = normalizeWrappedMarkdownTables(normalizedLineEndings);
  const shouldPasteHTML = hasStructureMissingFromText(html, normalizedTables);

  return {
    markdown: normalizedTables,
    shouldPasteHTML,
    shouldPasteAsMarkdown:
      !shouldPasteHTML &&
      (normalizedTables !== normalizedLineEndings ||
        containsCommonMarkdownBlockSyntax(normalizedTables)),
  };
}

// Block structure in HTML, with the Markdown that writes the same structure in plain text. Inline
// tags do not count: a chat app links a URL in HTML whose lines are otherwise the Markdown text.
const HTML_STRUCTURE_AS_MARKDOWN = [
  ["h1, h2, h3, h4, h5, h6", /^ {0,3}#{1,6}[ \t]/m],
  ["table", /^ {0,3}\|.*\|[ \t]*$/m],
  ["ul, ol", /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]/m],
  ["blockquote", /^ {0,3}>/m],
];

// Whether the HTML has a heading, table, list or quote that the plain text does not write as
// Markdown, so that reading the plain text as Markdown would lose or change it.
export function hasStructureMissingFromText(html, text) {
  if (!html) {
    return false;
  }
  const body = new DOMParser().parseFromString(html, "text/html").body;
  return HTML_STRUCTURE_AS_MARKDOWN.some(
    ([selector, markdown]) => body?.querySelector(selector) && !markdown.test(text),
  );
}

export function containsCommonMarkdownBlockSyntax(markdown) {
  return /^(?: {0,3}#{1,6}(?:[ \t]+|$)| {0,3}(?:[-+*][ \t]+(?:\[[ xX]\][ \t]+)?|\d{1,9}[.)][ \t]+|>[ \t]?|`{3,}|~{3,})| {0,3}(?:[-*_][ \t]*){3,})/m.test(
    markdown,
  );
}

export function normalizeWrappedMarkdownTables(markdown) {
  const lines = markdown.split("\n");
  const normalizedLines = [];
  let index = 0;

  while (index < lines.length) {
    if (isMarkdownFenceStart(lines[index])) {
      const fencedBlock = collectMarkdownFence(lines, index);
      normalizedLines.push(...fencedBlock.lines);
      index = fencedBlock.nextIndex;
      continue;
    }

    if (!isMarkdownTableHeaderAt(lines, index)) {
      normalizedLines.push(lines[index]);
      index += 1;
      continue;
    }

    const headerLine = lines[index];
    const separatorLine = lines[index + 1];
    const columnCount = parseMarkdownTableCells(headerLine).length;
    normalizedLines.push(headerLine, separatorLine);
    index += 2;

    while (index < lines.length) {
      const firstRowLine = lines[index];
      if (firstRowLine.trim() === "" || isMarkdownFenceStart(firstRowLine)) {
        break;
      }

      if (!firstRowLine.includes("|")) {
        break;
      }

      let logicalRow = "";
      let physicalLineCount = 0;

      while (index < lines.length) {
        const currentLine = lines[index];
        const nextLine = lines[index + 1] ?? "";
        const hasStartedRow = physicalLineCount > 0;

        if (currentLine.trim() === "") {
          break;
        }

        if (
          hasStartedRow &&
          currentLine.trim().startsWith("|") &&
          isLogicalMarkdownTableRowComplete(
            logicalRow,
            physicalLineCount,
            currentLine,
            columnCount,
          )
        ) {
          break;
        }

        if (!hasStartedRow && !currentLine.includes("|")) {
          break;
        }

        logicalRow = appendWrappedMarkdownTableLine(logicalRow, currentLine);
        physicalLineCount += 1;
        index += 1;

        if (
          isLogicalMarkdownTableRowComplete(
            logicalRow,
            physicalLineCount,
            nextLine,
            columnCount,
          )
        ) {
          break;
        }
      }

      if (!logicalRow) {
        break;
      }

      normalizedLines.push(logicalRow);
    }
  }

  return normalizedLines.join("\n");
}

export function isMarkdownTableHeaderAt(lines, index) {
  return (
    index + 1 < lines.length &&
    lines[index].includes("|") &&
    isMarkdownTableSeparatorLine(lines[index + 1])
  );
}

export function isMarkdownTableSeparatorLine(line) {
  return (
    line.includes("|") &&
    /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line)
  );
}

export function appendWrappedMarkdownTableLine(logicalRow, line) {
  const normalizedLine = line.trim();
  return logicalRow ? `${logicalRow}<br>${normalizedLine}` : normalizedLine;
}

export function isLogicalMarkdownTableRowComplete(
  logicalRow,
  physicalLineCount,
  nextLine,
  columnCount,
) {
  const cells = parseMarkdownTableCells(logicalRow);
  if (cells.length < columnCount) {
    return false;
  }

  if (logicalRow.trim().endsWith("|")) {
    return true;
  }

  const trimmedNextLine = nextLine.trim();
  if (trimmedNextLine === "" || isMarkdownFenceStart(trimmedNextLine)) {
    return true;
  }

  if (physicalLineCount === 1 && trimmedNextLine.startsWith("|")) {
    return true;
  }

  // A table written without edge pipes: the next line is a whole row of its own.
  return parseMarkdownTableCells(trimmedNextLine).length >= columnCount;
}

export function parseMarkdownTableCells(line) {
  const trimmed = String(line).trim();
  const withoutLeadingPipe = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const content = withoutLeadingPipe.endsWith("|")
    ? withoutLeadingPipe.slice(0, -1)
    : withoutLeadingPipe;
  const cells = [];
  let currentCell = "";

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === "\\" && content[index + 1] === "|") {
      currentCell += "|";
      index += 1;
      continue;
    }

    if (character === "|") {
      cells.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  cells.push(currentCell.trim());
  return cells;
}

export function isMarkdownFenceStart(line) {
  return /^ {0,3}(`{3,}|~{3,})/.test(String(line));
}

export function collectMarkdownFence(lines, startIndex) {
  const startLine = lines[startIndex];
  const fenceMatch = startLine.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!fenceMatch) {
    return { lines: [startLine], nextIndex: startIndex + 1 };
  }

  const fence = fenceMatch[1];
  const fenceCharacter = fence[0];
  const fenceLength = fence.length;
  const fencedLines = [startLine];
  let index = startIndex + 1;

  while (index < lines.length) {
    fencedLines.push(lines[index]);
    if (
      new RegExp(`^ {0,3}${escapeRegExp(fenceCharacter)}{${fenceLength},}\\s*$`).test(
        lines[index],
      )
    ) {
      index += 1;
      break;
    }
    index += 1;
  }

  return { lines: fencedLines, nextIndex: index };
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
