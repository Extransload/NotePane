import {
  addDefaultPropsExternalHTML,
  createExtension,
  defaultProps,
  getBlockInfoFromSelection,
  getNodeById,
} from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { Plugin, Selection, TextSelection } from "@tiptap/pm/state";
import { Fragment } from "@tiptap/pm/model";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalloutIconGlyph, CalloutIconPicker, isImageIcon } from "./calloutIconPicker.jsx";
import { isFileTransfer } from "./images.js";
import { DEFAULT_CALLOUT_DEFAULTS } from "../constants.js";

const DEFAULT_CALLOUT_ICON = DEFAULT_CALLOUT_DEFAULTS.icon;

// The remembered callout style of each editor (see connectCalloutDefaults).
const calloutDefaultsByEditor = new WeakMap();

/**
 * Gives `editor` the style its new callouts start with, `defaults` ({ icon, backgroundColor } from
 * the editor preferences, icon null for none), and `onChange`, called with the next defaults when
 * a callout's icon or background colour is changed. Returns the function that disconnects them.
 */
export function connectCalloutDefaults(editor, defaults, onChange) {
  const connection = { defaults, onChange };
  calloutDefaultsByEditor.set(editor, connection);
  return () => {
    if (calloutDefaultsByEditor.get(editor) === connection) {
      calloutDefaultsByEditor.delete(editor);
    }
  };
}

// The props a new callout starts with, as in Notion: the icon and background colour last given to
// a callout. A pasted or moved callout keeps its own.
export function getNewCalloutProps(editor) {
  const { icon, backgroundColor } = calloutDefaultsByEditor.get(editor)?.defaults ?? DEFAULT_CALLOUT_DEFAULTS;
  return { icon: icon ?? "", backgroundColor };
}

// Remembers `change` ({ icon } with "" for none, or { backgroundColor }) for the next new callout.
export function rememberCalloutStyle(editor, change) {
  const connection = calloutDefaultsByEditor.get(editor);
  if (!connection) {
    return;
  }
  const next = { ...connection.defaults, ...change };
  if ("icon" in change) {
    next.icon = change.icon || null;
  }
  // Kept here too, so a second change before the preferences come back builds on this one.
  connection.defaults = next;
  connection.onChange(next);
}

const EDIT_CALLOUT_ICON_EVENT = "notepane:edit-callout-icon";

// Opens the icon picker of the callout with `blockId`, as the block menu's Edit icon does.
export function editCalloutIcon(blockId) {
  window.dispatchEvent(new CustomEvent(EDIT_CALLOUT_ICON_EVENT, { detail: { blockId } }));
}

const keepEditorFocus = (event) => event.preventDefault();

function Callout({ block, editor, contentRef }) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const slotRef = useRef(null);
  const contentElementRef = useRef(null);
  const closePicker = useCallback(() => setIsPickerOpen(false), []);
  const { icon } = block.props;

  // ProseMirror places the caret of a new callout before React has mounted its content, so the
  // browser's caret is left outside the box. The first keystroke then makes ProseMirror move it, which
  // ends an IME composition (Korean ㅎ then 하 gives "ㅎ하"). Once the content is in, the caret is put
  // back where ProseMirror has it.
  useEffect(() => {
    const view = editor.prosemirrorView;
    if (view?.hasFocus() && editor.getTextCursorPosition().block.id === block.id) {
      view.focus();
    }
    // Only on mount: later renders keep the caret where the browser put it.
  }, []);

  useEffect(() => {
    const openForThisBlock = (event) => {
      if (event.detail?.blockId === block.id && editor.isEditable) {
        setIsPickerOpen(true);
      }
    };
    window.addEventListener(EDIT_CALLOUT_ICON_EVENT, openForThisBlock);
    return () => window.removeEventListener(EDIT_CALLOUT_ICON_EVENT, openForThisBlock);
  }, [block.id, editor]);

  const setIcon = (nextIcon) => {
    editor.updateBlock(block.id, { props: { icon: nextIcon } });
    rememberCalloutStyle(editor, { icon: nextIcon });
    closePicker();
    editor.focus();
  };

  return (
    <div className="notepane-callout">
      {icon && (
        <span ref={slotRef} className="notepane-callout-icon-slot" contentEditable={false}>
          <button
            type="button"
            className="notepane-callout-icon"
            aria-label="Change callout icon"
            aria-expanded={isPickerOpen}
            disabled={!editor.isEditable}
            onMouseDown={keepEditorFocus}
            onClick={() => setIsPickerOpen((isOpen) => !isOpen)}
          >
            <CalloutIconGlyph icon={icon} />
          </button>
        </span>
      )}
      <div
        className="notepane-callout-content"
        ref={(node) => {
          contentRef(node);
          contentElementRef.current = node;
        }}
      />
      {isPickerOpen && (
        <CalloutIconPicker
          anchor={slotRef.current ?? contentElementRef.current}
          hasIcon={Boolean(icon)}
          onClose={({ returnFocus } = {}) => {
            closePicker();
            if (returnFocus) editor.focus();
          }}
          onPick={setIcon}
          onRemove={() => setIcon("")}
          onUpload={async (file) => {
            try {
              const url = await editor.uploadFile?.(file, block.id);
              // The callout may have been deleted while the image uploaded.
              if (typeof url === "string" && editor.getBlock(block.id)) setIcon(url);
            } catch {
              // The picker stays open, so the image can be chosen again.
            }
          }}
        />
      )}
    </div>
  );
}

// Enter keeps the writing inside the box, as in Notion: the text after the caret moves into a new
// paragraph that becomes the callout's first nested block. Enter on an empty last line of the body
// then leaves the box through BlockNote's own unnest.
function enterInsideCallout(editor) {
  return editor.transact((tr) => {
    const { $from, $to } = tr.selection;
    if (
      !(tr.selection instanceof TextSelection) ||
      $from.parent.type.name !== "callout" ||
      !$from.sameParent($to)
    ) {
      return false;
    }

    tr.deleteSelection();
    const { bnBlock, blockContent, childContainer } = getBlockInfoFromSelection(tr);
    const caret = tr.selection.from;
    const contentEnd = blockContent.afterPos - 1;
    const { blockContainer, blockGroup, paragraph } = tr.doc.type.schema.nodes;
    // At the start of written text, Enter opens a line above the callout, as above a paragraph.
    if (tr.selection.$from.parentOffset === 0 && blockContent.node.content.size > 0) {
      tr.insert(bnBlock.beforePos, blockContainer.create(null, paragraph.create()));
      tr.scrollIntoView();
      return true;
    }
    const nestedParagraph = blockContainer.create(
      null,
      paragraph.create(null, tr.doc.slice(caret, contentEnd).content),
    );

    tr.delete(caret, contentEnd);
    const removed = contentEnd - caret;
    if (childContainer) {
      // Inside the existing group, then inside the new blockContainer and its paragraph.
      const insertAt = childContainer.beforePos - removed + 1;
      tr.insert(insertAt, nestedParagraph);
      tr.setSelection(TextSelection.create(tr.doc, insertAt + 2));
    } else {
      // Inside the new group, then inside its blockContainer and paragraph.
      const insertAt = blockContent.afterPos - removed;
      tr.insert(insertAt, blockGroup.create(null, nestedParagraph));
      tr.setSelection(TextSelection.create(tr.doc, insertAt + 3));
    }
    tr.scrollIntoView();
    return true;
  });
}

// The block holding the selection when it sits directly in a callout's body, with its place there.
// BlockNote lifts an emptied or Backspaced nested block as a list item, taking the blocks after it
// along as its children; a callout's body is not a list, so these keys are handled here instead.
function findCalloutBodyBlock(tr) {
  const blockInfo = getBlockInfoFromSelection(tr);
  if (!blockInfo.isBlockContainer) {
    return null;
  }
  const $block = tr.doc.resolve(blockInfo.bnBlock.beforePos);
  const callout = $block.depth >= 2 ? $block.node($block.depth - 1) : null;
  if (callout?.firstChild?.type.name !== "callout") {
    return null;
  }
  return { blockInfo, $block, callout };
}

// Enter on an empty line with more of the body after it adds a line rather than leaving the box.
function addLineInsideCalloutBody(editor) {
  return editor.transact((tr) => {
    if (!tr.selection.empty) {
      return false;
    }
    const body = findCalloutBodyBlock(tr);
    if (!body) {
      return false;
    }
    const { blockInfo, $block } = body;
    const isLastLine = $block.index() === $block.parent.childCount - 1;
    const { node } = blockInfo.blockContent;
    if (isLastLine || node.type.name !== "paragraph" || node.content.size > 0 || blockInfo.childContainer) {
      return false;
    }

    const { blockContainer, paragraph } = tr.doc.type.schema.nodes;
    const insertAt = blockInfo.bnBlock.afterPos;
    tr.insert(insertAt, blockContainer.create(null, paragraph.create()));
    // Inside the new blockContainer, then inside its paragraph.
    tr.setSelection(TextSelection.create(tr.doc, insertAt + 2));
    tr.scrollIntoView();
    return true;
  });
}

// Backspace at the start of a body line joins it to the text before it, as in Notion: the callout's
// own text for the first line, otherwise the end of the line above or of that line's last nested
// block. The joined line's nested blocks stay in the body where it was.
function joinBodyLineBackward(editor) {
  return editor.transact((tr) => {
    if (!tr.selection.empty || tr.selection.$from.parentOffset !== 0) {
      return false;
    }
    const body = findCalloutBodyBlock(tr);
    if (!body) {
      return false;
    }
    const { blockInfo, $block, callout } = body;
    if (blockInfo.blockContent.node.type.name !== "paragraph") {
      return false;
    }

    let joinAt;
    if ($block.index() === 0) {
      // Inside the callout's blockContainer, then past its content node's opening and text.
      joinAt = $block.start($block.depth - 1) + 1 + callout.firstChild.content.size;
    } else {
      let container = $block.parent.child($block.index() - 1);
      let containerPos = blockInfo.bnBlock.beforePos - container.nodeSize;
      while (container.childCount > 1) {
        const group = container.lastChild;
        containerPos += container.nodeSize - 1 - group.lastChild.nodeSize - 1;
        container = group.lastChild;
      }
      // An image, table or other block without text has nothing to join to.
      if (container.firstChild.type.spec.content !== "inline*") {
        return false;
      }
      // Inside that blockContainer and its content node, then past its text.
      joinAt = containerPos + 2 + container.firstChild.content.size;
    }

    const nestedBlocks = blockInfo.childContainer?.node.content;
    if (nestedBlocks) {
      tr.replaceWith(blockInfo.bnBlock.beforePos, blockInfo.bnBlock.afterPos, nestedBlocks);
    } else if ($block.parent.childCount === 1) {
      tr.delete($block.before($block.depth), $block.after($block.depth));
    } else {
      tr.delete(blockInfo.bnBlock.beforePos, blockInfo.bnBlock.afterPos);
    }
    tr.insert(joinAt, blockInfo.blockContent.node.content);
    tr.setSelection(TextSelection.create(tr.doc, joinAt));
    tr.scrollIntoView();
    return true;
  });
}

// A side-menu drag carries whole blocks; a text drag carries inline content and keeps its default.
function isBlockDrag(view) {
  const slice = view.dragging?.slice;
  return slice?.openStart === 0 && slice.content.firstChild?.type.name === "blockContainer";
}

const CALLOUT_LINE = ':scope > .react-renderer > [data-content-type="callout"]';

// The block under the pointer. Blocks inside a callout reach across the box's right padding (see
// src/styles/blocknote.css), so a point in that padding belongs to the box, not the line it crosses.
function calloutBoxAt(hit, clientX) {
  const box = hit.closest(".bn-block");
  let outer = box?.parentElement?.closest(".bn-block");
  while (outer && !outer.querySelector(CALLOUT_LINE)) {
    outer = outer.parentElement?.closest(".bn-block");
  }
  if (!outer) {
    return box;
  }
  const paddingStart = outer.getBoundingClientRect().right - Number.parseFloat(getComputedStyle(outer).paddingRight);
  return clientX > paddingStart ? outer : box;
}

// Where a block or a file dragged over a callout lands inside it: first in its body when the pointer
// is on the callout's own line, beside a nested block when the pointer is in the box's padding level
// with that block, and last when it is on the padding below the body. Over a nested block itself,
// ProseMirror's own drop, and BlockNote's for a file, already land inside the box. ProseMirror clears
// `view.dragging` only after `handleDrop`, so the cursor and the drop read the same drag.
export function findCalloutDropTarget(view, event) {
  const isMove = isBlockDrag(view);
  if (!isMove && !isFileTransfer(event.dataTransfer)) {
    return null;
  }
  const hit = view.root.elementFromPoint?.(event.clientX, event.clientY);
  if (!(hit instanceof Element) || !view.dom.contains(hit)) {
    return null;
  }
  const box = calloutBoxAt(hit, event.clientX);
  const line = box?.querySelector(CALLOUT_LINE);
  const found = line ? getNodeById(box.dataset.id, view.state.doc) : null;
  const { from, to } = view.state.selection;
  // Never into or beside a block that is itself being dragged. A file moves no block.
  const isDragged = (pos) => isMove && pos >= from && pos < to;
  if (!found || isDragged(found.posBeforeNode)) {
    return null;
  }

  const row = [...box.querySelectorAll(":scope > .bn-block-group > .bn-block-outer")].find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return event.clientY >= rect.top && event.clientY <= rect.bottom;
  });
  if (row) {
    const nested = getNodeById(row.dataset.id, view.state.doc);
    if (!nested || isDragged(nested.posBeforeNode)) {
      return null;
    }
    const rect = row.getBoundingClientRect();
    const isAbove = event.clientY < rect.top + rect.height / 2;
    return {
      calloutPos: found.posBeforeNode,
      place: "beside",
      pos: isAbove ? nested.posBeforeNode : nested.posBeforeNode + nested.node.nodeSize,
    };
  }

  const { node, posBeforeNode } = found;
  const place = event.clientY <= line.getBoundingClientRect().bottom ? "first" : "last";
  const afterLine = posBeforeNode + 1 + node.firstChild.nodeSize;
  const body = node.childCount > 1 ? node.child(1) : null;
  const pos = !body ? afterLine : place === "first" ? afterLine + 1 : afterLine + body.nodeSize - 1;
  return { calloutPos: posBeforeNode, place, pos };
}

// The drop cursor hook: shows where the block lands inside a callout.
export function computeCalloutDropPosition({ view, event, defaultPosition }) {
  const target = findCalloutDropTarget(view, event);
  return target ? { pos: target.pos, orientation: "block-horizontal" } : defaultPosition;
}

// Puts dropped blocks at a callout drop target and gives the position they start at. A dropped file
// lands there too (see src/editor/fileInsertion.js).
export function insertAtCalloutDropTarget(tr, target, blocks) {
  const calloutPos = tr.mapping.map(target.calloutPos);
  const callout = tr.doc.nodeAt(calloutPos);
  const afterLine = calloutPos + 1 + callout.firstChild.nodeSize;
  const body = callout.childCount > 1 ? callout.child(1) : null;
  let insertAt = afterLine;
  if (target.place === "beside") {
    // The nested block it lands beside is not being dragged, so the body is still there.
    insertAt = tr.mapping.map(target.pos);
    tr.insert(insertAt, blocks);
  } else if (body) {
    insertAt = target.place === "first" ? afterLine + 1 : afterLine + body.nodeSize - 1;
    tr.insert(insertAt, blocks);
  } else {
    tr.insert(insertAt, tr.doc.type.schema.nodes.blockGroup.create(null, blocks));
  }
  return insertAt;
}

const calloutDropPlugin = new Plugin({
  props: {
    handleDrop(view, event, slice, moved) {
      const target = findCalloutDropTarget(view, event);
      if (!target) {
        return false;
      }

      const { tr } = view.state;
      if (moved) {
        tr.deleteSelection();
      }
      const insertAt = insertAtCalloutDropTarget(tr, target, slice.content);
      // As ProseMirror's own drop does: the dropped block holds the selection and the view follows.
      tr.setSelection(Selection.near(tr.doc.resolve(insertAt), 1));
      tr.setMeta("uiEvent", "drop");
      view.focus();
      view.dispatch(tr.scrollIntoView());
      return true;
    },
  },
});

const isCalloutBlock = (block) =>
  block?.type.name === "blockContainer" && block.firstChild?.type.name === "callout";

// The blocks of a pasted slice that starts or ends with a callout, or null.
function getPastedBlocksAroundCallout(slice) {
  const blocks = [];
  slice.content.forEach((node) => {
    if (node.type.name === "blockGroup") {
      node.forEach((child) => blocks.push(child));
    } else {
      blocks.push(node);
    }
  });
  if (!blocks.every((block) => block.type.name === "blockContainer")) {
    return null;
  }
  return isCalloutBlock(blocks[0]) || isCalloutBlock(blocks.at(-1)) ? blocks : null;
}

// A pasted callout keeps its own title and body, as in Notion. ProseMirror opens a pasted slice as
// far as it can, so the text after the caret would join the callout's last line or its title, or
// the callout's title would join the text before the caret and lose its icon; a slice it cannot
// open it nests in the block at the caret. The blocks go beside that block instead: in its place
// when it is an empty line, above it from the start of its text, below it from the end, and between
// its two halves from the middle. In a callout's own text they go first in its body, followed by
// the text after the caret, as Enter there moves it.
function pasteBlocksAroundCallout(view, slice) {
  const blocks = getPastedBlocksAroundCallout(slice);
  if (!blocks || !(view.state.selection instanceof TextSelection)) {
    return false;
  }
  const tr = view.state.tr.deleteSelection();
  const { $from } = tr.selection;
  const container = $from.node($from.depth - 1);
  if (!$from.parent.isTextblock || container?.type.name !== "blockContainer") {
    return false;
  }
  const containerPos = $from.before($from.depth - 1);
  const { parent, parentOffset } = $from;
  const { blockContainer, blockGroup, paragraph } = tr.doc.type.schema.nodes;
  const pasted = Fragment.from(blocks);
  let insertAt;
  if (parent.content.size === 0 && container.childCount === 1) {
    insertAt = containerPos;
    tr.replaceWith(containerPos, containerPos + container.nodeSize, pasted);
  } else if (parentOffset === 0) {
    insertAt = containerPos;
    tr.insert(insertAt, pasted);
  } else if (parent.type.name === "callout") {
    let body = pasted;
    if (parentOffset < parent.content.size) {
      const textAfter = tr.doc.slice($from.pos, $from.end()).content;
      tr.delete($from.pos, $from.end());
      body = pasted.addToEnd(blockContainer.create(null, paragraph.create(null, textAfter)));
    }
    const callout = tr.doc.nodeAt(containerPos);
    const afterLine = containerPos + 1 + callout.firstChild.nodeSize;
    insertAt = afterLine + 1;
    if (callout.childCount > 1) {
      tr.insert(insertAt, body);
    } else {
      tr.insert(afterLine, blockGroup.create(null, body));
    }
  } else if (parentOffset === parent.content.size) {
    insertAt = containerPos + container.nodeSize;
    tr.insert(insertAt, pasted);
  } else {
    tr.split($from.pos, 2);
    insertAt = $from.pos + 2;
    tr.insert(insertAt, pasted);
  }
  // As ProseMirror's own paste does: the caret ends at the end of what was pasted.
  tr.setSelection(Selection.near(tr.doc.resolve(insertAt + pasted.size), -1));
  view.dispatch(tr.scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste"));
  return true;
}

const calloutPastePlugin = new Plugin({
  props: { handlePaste: (view, _event, slice) => pasteBlocksAroundCallout(view, slice) },
});

// Markdown has no callout, so the export is a quote that opens with the icon. The nested blocks go
// inside the quote too; BlockNote would otherwise place them after it.
function calloutToExternalHTML(block) {
  const quote = document.createElement("blockquote");
  const title = document.createElement("p");
  const content = document.createElement("span");
  addDefaultPropsExternalHTML(block.props, quote);
  // An uploaded image has no text form, so only an emoji icon opens the quote.
  const { icon } = block.props;
  title.append(icon && !isImageIcon(icon) ? `${icon} ` : "", content);
  quote.append(title);
  return { dom: quote, contentDOM: content, childrenDOM: quote };
}

const MARKDOWN_QUOTE_LINE = /^ {0,3}>/;
const MARKDOWN_FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Reads Markdown with callouts written by its export back into blocks: a quote whose first line
 * opens with an emoji and a space becomes a callout with that icon, the rest of its first
 * paragraph its text and the paragraphs after it its body. Returns null when the Markdown has no
 * such quote, so that it is pasted as Markdown is.
 */
export function parseMarkdownWithCallouts(editor, markdown) {
  const lines = String(markdown).split("\n");
  const blocks = [];
  let pending = [];
  let fence = null;
  let hasCallout = false;
  const flushPending = () => {
    if (pending.some((line) => line.trim())) {
      blocks.push(...editor.tryParseMarkdownToBlocks(pending.join("\n")));
    }
    pending = [];
  };
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    const fenceMatch = MARKDOWN_FENCE.exec(line);
    if (fence || fenceMatch) {
      // Inside a code block nothing is a quote.
      if (!fence) {
        fence = fenceMatch[1];
      } else if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      pending.push(line);
      index += 1;
      continue;
    }
    if (!MARKDOWN_QUOTE_LINE.test(line)) {
      pending.push(line);
      index += 1;
      continue;
    }
    let end = index;
    while (end < lines.length && MARKDOWN_QUOTE_LINE.test(lines[end])) {
      end += 1;
    }
    const callout = readMarkdownCallout(
      editor,
      lines.slice(index, end).map((quoteLine) => quoteLine.replace(/^ {0,3}> ?/, "")),
    );
    if (callout) {
      flushPending();
      blocks.push(callout);
      hasCallout = true;
    } else {
      pending.push(...lines.slice(index, end));
    }
    index = end;
  }
  flushPending();
  return hasCallout ? blocks : null;
}

function readMarkdownCallout(editor, lines) {
  const icon = readLeadingEmoji(lines[0]);
  if (!icon) {
    return null;
  }
  const titleEnd = lines.findIndex((line) => !line.trim());
  const titleLines = lines.slice(0, titleEnd === -1 ? lines.length : titleEnd);
  titleLines[0] = titleLines[0].slice(icon.length).trimStart();
  const bodyMarkdown = titleEnd === -1 ? "" : lines.slice(titleEnd + 1).join("\n");
  const title = titleLines.join("\n").trim()
    ? editor.tryParseMarkdownToBlocks(titleLines.join("\n"))[0]
    : null;
  const children = bodyMarkdown.trim()
    ? parseMarkdownWithCallouts(editor, bodyMarkdown) ?? editor.tryParseMarkdownToBlocks(bodyMarkdown)
    : [];
  return { type: "callout", props: { icon }, content: title?.content ?? [], children };
}

// The emoji `text` opens with when a space or nothing follows it. Only characters shown as emoji
// count, so "© 2024" stays text.
function readLeadingEmoji(text) {
  const first = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    .segment(text)[Symbol.iterator]().next().value?.segment;
  if (!first || !/\p{Emoji_Presentation}|\uFE0F|\p{Regional_Indicator}|\u20E3/u.test(first)) {
    return null;
  }
  return /^(\s|$)/.test(text.slice(first.length)) ? first : null;
}

const createReactCalloutBlockSpec = createReactBlockSpec(
  {
    type: "callout",
    propSchema: {
      backgroundColor: defaultProps.backgroundColor,
      textColor: defaultProps.textColor,
      icon: { default: DEFAULT_CALLOUT_ICON },
    },
    content: "inline",
  },
  { render: Callout },
  [
    createExtension({
      key: "notepane-callout-keys",
      prosemirrorPlugins: [calloutDropPlugin, calloutPastePlugin],
      keyboardShortcuts: {
        Enter: ({ editor }) => enterInsideCallout(editor) || addLineInsideCalloutBody(editor),
        Backspace: ({ editor }) => joinBodyLineBackward(editor),
      },
    }),
  ],
);

// The React spec cannot place nested blocks in its export, so the export is a DOM implementation.
export function createCalloutBlockSpec() {
  const spec = createReactCalloutBlockSpec();
  return {
    ...spec,
    implementation: { ...spec.implementation, toExternalHTML: calloutToExternalHTML },
  };
}
