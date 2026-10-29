import { isBlockSetSelection, replaceBlockSelectionWithParagraph } from "./blockSelection.js";
import { isStandaloneWebUrl, normalizePastedMarkdownForBlockNote } from "./clipboard.js";
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
      editor.pasteMarkdown(normalizedPaste.markdown);
      return true;
    }
  }

  return defaultPasteHandler({
    prioritizeMarkdownOverHTML: true,
    plainTextAsMarkdown: true,
  });
}
