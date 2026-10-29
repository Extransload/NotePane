import { createExtension } from "@blocknote/core";
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { Minus } from "lucide-react";
import { collectMarkdownFence, isMarkdownFenceStart } from "./clipboard.js";

// BlockNote writes a divider to Markdown as `***`; NotePane writes `---`, as Notion and GitHub do.
// Only a rule after a blank line is rewritten: `---` right under a line of text would make that
// line a heading. Fenced code is copied as it is.
export function writeDividersAsDashes(markdown) {
  const lines = markdown.split("\n");
  const written = [];
  let index = 0;
  while (index < lines.length) {
    if (isMarkdownFenceStart(lines[index])) {
      const fence = collectMarkdownFence(lines, index);
      written.push(...fence.lines);
      index = fence.nextIndex;
      continue;
    }
    const line = lines[index];
    const isAfterBlankLine = written.length === 0 || written[written.length - 1].trim() === "";
    written.push(isAfterBlankLine && /^\s*\*\*\*$/.test(line) ? line.replace("***", "---") : line);
    index += 1;
  }
  return written.join("\n");
}

// Every Markdown the editor writes (export, the saved fallback, copies) goes through
// blocksToMarkdownLossy, so the rewrite wraps it once per editor.
export const DividerMarkdownExport = createExtension(({ editor }) => {
  const blocksToMarkdownLossy = editor.blocksToMarkdownLossy.bind(editor);
  editor.blocksToMarkdownLossy = (...args) => writeDividersAsDashes(blocksToMarkdownLossy(...args));
  return { key: "notepane-divider-markdown" };
})();

// BlockNote's own Divider slash menu item, with lucide's rule icon like NotePane's other items.
// BlockNote leaves a divider inserted as the last block node-selected, so the next key typed went
// nowhere; as with the `---` shortcut, the caret moves on to an empty paragraph below it.
export function setDividerSlashMenuItem(items, editor) {
  const divider = items.find((item) => item.key === "divider");
  if (!divider) {
    return;
  }
  divider.icon = <Minus size={18} />;
  divider.onItemClick = () => editor.transact(() => {
    const inserted = insertOrUpdateBlockForSlashMenu(editor, { type: "divider" });
    if (editor.getTextCursorPosition().block.id === inserted.id) {
      const [paragraph] = editor.insertBlocks([{ type: "paragraph" }], inserted, "after");
      editor.setTextCursorPosition(paragraph, "start");
    }
  });
}
