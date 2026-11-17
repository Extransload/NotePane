import { BlockNoteEditor } from "@blocknote/core";
import { parseBlocksJSON } from "../model/notes.js";
import { schema } from "./schema.jsx";

// Export of a folder or of every note converts notes that are not open. One detached editor with
// the app's schema does it: it is never mounted, so it costs no layout and owns no DOM.
let converter = null;

function getConverter() {
  converter ??= BlockNoteEditor.create({ schema });
  return converter;
}

function blocksOf(note) {
  return parseBlocksJSON(note.blocksJSON) ?? [];
}

export async function noteToMarkdown(note) {
  const blocks = blocksOf(note);
  return blocks.length > 0 ? await getConverter().blocksToMarkdownLossy(blocks) : note.markdown ?? "";
}

export async function noteToHtml(note) {
  return await getConverter().blocksToHTMLLossy(blocksOf(note));
}
