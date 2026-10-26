import {
  blockToNode,
  createExtension,
  getBlockInfo,
  getBlockInfoFromSelection,
  getNearestBlockPos,
} from "@blocknote/core";
import { closeHistory } from "@tiptap/pm/history";
import { Fragment } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { findCalloutDropTarget, insertAtCalloutDropTarget } from "./callout.jsx";
import { isFileTransfer } from "./images.js";

// NotePane inserts pasted and dropped files itself rather than through BlockNote's
// `handleFileInsertion`, which has two undo faults: it turns an empty line into the file block with a
// step that cannot be undone, and it fills in the uploaded URL as an undo step of its own, so the first
// Cmd+Z leaves an empty placeholder. Placement and upload are otherwise BlockNote's.

// The block a file becomes, as BlockNote picks it: a block type that accepts the file's MIME type or
// extension, else a plain file block.
function fileBlockTypeFor(editor, file) {
  const [kind, subtype] = file.type.split("/");
  const extension = `.${file.name.split(".").pop()}`.toLowerCase();
  const spec = Object.values(editor.schema.blockSpecs).find((candidate) =>
    candidate.implementation.meta?.fileBlockAccept?.some((accept) =>
      accept.startsWith(".")
        ? accept.toLowerCase() === extension
        : accept === `${kind}/*` || accept === `${kind}/${subtype}`,
    ),
  );
  return spec?.config.type ?? "file";
}

// In place of an empty line, else before or after the block.
function insertBesideBlock(tr, blockInfo, blocks, before) {
  const { bnBlock, blockContent, childContainer } = blockInfo;
  const isEmptyLine = blockContent?.node.type.spec.content === "inline*" &&
    blockContent.node.childCount === 0 &&
    !childContainer;
  if (isEmptyLine) {
    tr.replaceWith(bnBlock.beforePos, bnBlock.afterPos, blocks);
  } else {
    tr.insert(before ? bnBlock.beforePos : bnBlock.afterPos, blocks);
  }
}

// Sent on the window with `{ name }` when a pasted or dropped file could not be stored.
export const FILE_INSERTION_FAILED_EVENT = "notepane:file-insertion-failed";

// Each file goes in as an empty block named after it and is filled in once uploaded. The fill completes
// the insertion rather than being an edit of its own, so it stays out of the undo history: one Cmd+Z
// removes the files, as in Notion, and an edit after it, such as a caption, is an undo step of its own.
// `place` puts the new blocks into the transaction. A paste follows the caret, which sits beside the
// new blocks; a drop leaves the view where the pointer put the file.
async function insertFiles(editor, files, place, { scroll }) {
  if (files.length === 0) {
    return;
  }
  const view = editor.prosemirrorView;
  const { tr } = view.state;
  const fileBlocks = files.map((file) => blockToNode(
    { type: fileBlockTypeFor(editor, file), props: { name: file.name } },
    tr.doc.type.schema,
  ));
  place(tr, Fragment.from(fileBlocks));
  view.dispatch(scroll ? tr.scrollIntoView() : tr);

  for (const [index, file] of files.entries()) {
    const blockId = fileBlocks[index].attrs.id;
    try {
      const update = await editor.uploadFile(file, blockId);
      // The block may have been deleted, or its insertion undone, while the file uploaded.
      if (editor.getBlock(blockId)) {
        editor.transact((fillTr) => {
          closeHistory(fillTr.setMeta("addToHistory", false));
          editor.updateBlock(blockId, typeof update === "string" ? { props: { url: update } } : update);
        });
      }
    } catch {
      // BlockNote's file block keeps showing "Loading..." once its upload has started, so the
      // placeholder goes, as part of the insertion it belongs to, and the failure is reported.
      if (editor.getBlock(blockId)) {
        editor.transact((removeTr) => {
          closeHistory(removeTr.setMeta("addToHistory", false));
          editor.removeBlocks([blockId]);
        });
      }
      window.dispatchEvent(new CustomEvent(FILE_INSERTION_FAILED_EVENT, { detail: { name: file.name } }));
    }
  }
}

// As BlockNote's paste: in place of the caret's block when that is an empty line, else after it.
export function pasteFiles(editor, files) {
  void insertFiles(editor, files, (tr, blocks) => {
    insertBesideBlock(tr, getBlockInfoFromSelection(tr), blocks, false);
  }, { scroll: true });
}

// As BlockNote's drop: beside the block nearest the pointer, before it when the pointer is above its
// middle, or in its place when it is an empty line. Over a callout the files land where a dragged
// block would.
function dropFiles(editor, view, event) {
  const files = [...event.dataTransfer.files];
  const calloutTarget = findCalloutDropTarget(view, event);
  if (calloutTarget) {
    void insertFiles(editor, files, (tr, blocks) => {
      insertAtCalloutDropTarget(tr, calloutTarget, blocks);
    }, { scroll: false });
    return;
  }

  const pointer = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!pointer) {
    return;
  }
  void insertFiles(editor, files, (tr, blocks) => {
    const blockInfo = getBlockInfo(getNearestBlockPos(tr.doc, pointer.pos));
    const rect = view.dom
      .querySelector(`[data-id="${CSS.escape(blockInfo.bnBlock.node.attrs.id)}"]`)
      ?.getBoundingClientRect();
    insertBesideBlock(tr, blockInfo, blocks, Boolean(rect) && (rect.top + rect.bottom) / 2 > event.clientY);
  }, { scroll: false });
}

// Runs before BlockNote's own file drop, which then never sees a file.
export const FileDrop = createExtension(({ editor }) => ({
  key: "notepaneFileDrop",
  prosemirrorPlugins: [new Plugin({
    props: {
      handleDOMEvents: {
        drop(view, event) {
          if (!editor.isEditable || !isFileTransfer(event.dataTransfer)) {
            return false;
          }
          event.preventDefault();
          dropFiles(editor, view, event);
          return true;
        },
      },
    },
  })],
}))();
