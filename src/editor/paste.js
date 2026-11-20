import { isBlockSetSelection, replaceBlockSelectionWithParagraph } from "./blockSelection.js";
import { parseMarkdownWithCallouts } from "./callout.jsx";
import {
  isStandaloneWebUrl,
  normalizePastedMarkdownForBlockNote,
  withSelfRemovingChangeSubscriptions,
} from "./clipboard.js";
import { pasteFiles } from "./fileInsertion.js";
import { isFileTransfer } from "./images.js";
import { hasEditorRangeSelection, isSelectionInsideCodeBlock } from "./targets.js";

/**
 * The editor's `pasteHandler`: files, a URL over a selection, NotePane and VS Code copies, and
 * Markdown that BlockNote would otherwise paste as plain text.
 */
export function handleNotePanePaste({ event, editor, defaultPasteHandler }) {
  // BlockNote's own file paste cannot be undone in one step (see src/editor/fileInsertion.js).
  if (isFileTransfer(event.clipboardData)) {
    pasteFiles(editor, [...event.clipboardData.files]);
    return true;
  }
  const plainText = event.clipboardData?.getData("text/plain") ?? "";
  if (plainText && !isSelectionInsideCodeBlock(editor)) {
    const pasteView = editor.prosemirrorView;
    const isBlockSet = isBlockSetSelection(pasteView?.state.selection);
    if (
      isStandaloneWebUrl(plainText) &&
      (isBlockSet || hasEditorRangeSelection(editor))
    ) {
      // The default paste would link the selected blocks' text instead of replacing it,
      // and insertInlineContent sees only the first run.
      if (isBlockSet) {
        replaceBlockSelectionWithParagraph(pasteView);
      }
      editor.insertInlineContent(plainText.trim(), { updateSelection: true });
      return true;
    }

    // NotePane's own copies carry lossless blocknote/html, and VS Code
    // copies carry their language. BlockNote handles both, so their
    // Markdown-looking plain text must not be re-parsed here.
    const clipboardTypes = event.clipboardData?.types ?? [];
    if (
      clipboardTypes.includes("blocknote/html") ||
      clipboardTypes.includes("vscode-editor-data")
    ) {
      return defaultPasteHandler({
        prioritizeMarkdownOverHTML: true,
        plainTextAsMarkdown: true,
      });
    }

    const normalizedPaste = normalizePastedMarkdownForBlockNote(
      plainText,
      event.clipboardData?.getData("text/html") ?? "",
    );
    if (normalizedPaste.shouldPasteHTML) {
      return defaultPasteHandler({
        prioritizeMarkdownOverHTML: false,
        plainTextAsMarkdown: true,
      });
    }
    if (normalizedPaste.shouldPasteAsMarkdown) {
      pasteMarkdownWithCallouts(editor, normalizedPaste.markdown);
      return true;
    }
    // Plain text of several lines, as Notion pastes it: a block a line, blank lines dropped. The
    // first line joins the text before the caret and the last the text after it. Only text that
    // Markdown reads as nothing but paragraphs counts: a table, a list or a heading keeps
    // BlockNote's Markdown paste. Each line is still read as Markdown, as BlockNote reads plain
    // text, so `**bold**` in a line stays bold.
    if (
      !event.clipboardData?.types.includes("text/html") &&
      /[\r\n]/.test(plainText) &&
      isCaretInBlockText(editor) &&
      editor.tryParseMarkdownToBlocks(plainText).every((block) => block.type === "paragraph")
    ) {
      const lines = plainText.split(/\r\n?|\n/).map((line) => line.trim()).filter(Boolean);
      editor.pasteMarkdown(lines.join("\n\n"));
      return true;
    }
  }

  return defaultPasteHandler({
    prioritizeMarkdownOverHTML: true,
    plainTextAsMarkdown: true,
  });
}

// A caret or text selection in one block's own text: not in a table cell, a block set or a node.
function isCaretInBlockText(editor) {
  const { $from, $to } = editor.prosemirrorView?.state.selection ?? {};
  return Boolean($from?.parent.isTextblock) &&
    $from.sameParent($to) &&
    $from.node($from.depth - 1)?.type.name === "blockContainer";
}

// A callout copied as Markdown, a quote that opens with its icon, is pasted back as a callout.
function pasteMarkdownWithCallouts(editor, markdown) {
  const blocks = parseMarkdownWithCallouts(editor, markdown);
  if (!blocks) {
    editor.pasteMarkdown(markdown);
    return;
  }
  const html = withSelfRemovingChangeSubscriptions(editor, () => editor.blocksToFullHTML(blocks));
  editor.pasteHTML(html, true);
}
