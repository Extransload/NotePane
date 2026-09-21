export function isStandaloneWebUrl(text) {
  return /^https?:\/\/\S+$/i.test(String(text).trim());
}

export function normalizeCopiedEditorPlainText(editor, clipboardText, selectedText = "") {
  let normalizedPlainText = String(clipboardText).replace(/\\\n/g, "\n");

  try {
    normalizedPlainText = editor.transact((transaction) => {
      let containsHardBreak = false;
      transaction.doc.nodesBetween(
        transaction.selection.from,
        transaction.selection.to,
        (node) => {
          if (node.type.name === "hardBreak") {
            containsHardBreak = true;
          }
        },
      );

      if (!containsHardBreak) {
        return normalizedPlainText;
      }

      return transaction.doc.textBetween(
        transaction.selection.from,
        transaction.selection.to,
        "\n",
        "\n",
      );
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

export function normalizePastedMarkdownForBlockNote(markdown) {
  const normalizedLineEndings = String(markdown).replace(/\r\n?/g, "\n");
  const normalizedTables = normalizeWrappedMarkdownTables(normalizedLineEndings);

  return {
    markdown: normalizedTables,
    shouldPasteAsMarkdown:
      normalizedTables !== normalizedLineEndings ||
      containsCommonMarkdownBlockSyntax(normalizedTables),
  };
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

  return false;
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
