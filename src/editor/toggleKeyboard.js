import { SuggestionMenu } from "@blocknote/core/extensions";
import { closeHistory } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";

export function handleToggleSpace(editor, event) {
  const selection = editor?.prosemirrorView?.state.selection;
  if (
    event.key !== " " ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    !selection?.empty ||
    selection.$from.parent !== selection.$to.parent
  ) {
    return false;
  }

  const { block } = editor.getTextCursorPosition();
  if (editor.schema.blockSchema[block.type]?.content !== "inline") {
    return false;
  }

  const marker = selection.$from.parent.textContent.slice(
    0,
    selection.$from.parentOffset,
  );
  const target = getSpaceShortcutTarget(block, marker);
  if (!target) {
    return false;
  }

  const view = editor.prosemirrorView;
  view.dispatch(view.state.tr.insertText(" "));

  return editor.transact((transaction) => {
    closeHistory(transaction);
    const shortcutEnd = transaction.selection.from;
    transaction.delete(shortcutEnd - marker.length - 1, shortcutEnd);
    editor.updateBlock(block, target);
    return true;
  });
}

export function handleToggleEnter(editor, event) {
  const selection = editor?.prosemirrorView?.state.selection;
  // Enter that commits an IME composition (Korean, Japanese, ...) belongs to
  // the IME; acting on it would add a child before the syllable is committed.
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    event.key !== "Enter" ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    !selection?.empty ||
    // Enter picks the highlighted item of an open `/` or `:` menu instead.
    editor.getExtension(SuggestionMenu)?.shown()
  ) {
    return false;
  }

  const { block } = editor.getTextCursorPosition();
  if (!isToggleBlock(block)) {
    return false;
  }

  const currentBlock = editor.getBlock(block.id) ?? block;
  if (!hasInlineContent(currentBlock)) {
    clearStoredToggleState(currentBlock.id);
    const titleBlock = currentBlock.type === "heading"
      ? editor.updateBlock(currentBlock, {
        type: "heading",
        props: {
          level: Number(currentBlock.props?.level ?? 1),
          isToggleable: false,
        },
        content: "",
      })
      : editor.updateBlock(currentBlock, {
        type: "paragraph",
        props: {},
        content: "",
      });
    editor.setTextCursorPosition(titleBlock, "start");
    return true;
  }

  const caretOffset = selection.$from.parentOffset;
  if (caretOffset !== selection.$from.parent.content.size) {
    // BlockNote splits the title at the caret and moves the toggle's lines to the second half, a new
    // block whose toggle starts closed, so the lines of an open toggle would drop out of sight. The
    // second half stays open instead, once the editor has handled this Enter.
    if (caretOffset > 0 && currentBlock.children?.length && isToggleShown(editor, currentBlock.id)) {
      window.setTimeout(() => showSecondHalfOfSplitToggle(editor, currentBlock.id));
    }
    return false;
  }

  const firstChild = currentBlock.children?.length
    ? editor.insertBlocks(
      [{ type: "paragraph", content: "" }],
      currentBlock.children[0],
      "before",
    )[0]
    : editor.updateBlock(currentBlock, {
      children: [{ type: "paragraph", content: "" }],
    }).children[0];
  if (!firstChild) {
    return false;
  }
  editor.setTextCursorPosition(firstChild, "start");
  return true;
}

export function handleToggleBackspace(editor, event) {
  const selection = editor?.prosemirrorView?.state.selection;
  // Backspace during an IME composition edits the uncommitted syllable; the
  // editor state can still look empty then, so it must not strip the toggle.
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    event.key !== "Backspace" ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    !selection?.empty ||
    selection.$from.parentOffset !== 0
  ) {
    return false;
  }

  const { block } = editor.getTextCursorPosition();
  const currentBlock = editor.getBlock(block.id) ?? block;
  if (
    currentBlock.type !== "heading" ||
    currentBlock.props?.isToggleable !== true ||
    hasInlineContent(currentBlock)
  ) {
    return currentBlock.type === "paragraph" && joinToClosedToggleAbove(editor, currentBlock);
  }

  clearStoredToggleState(currentBlock.id);
  const heading = editor.updateBlock(currentBlock, {
    type: "heading",
    props: {
      level: Number(currentBlock.props?.level ?? 1),
      isToggleable: false,
    },
    content: "",
  });
  editor.setTextCursorPosition(heading, "start");
  return true;
}

// The toggle whose title is the line on screen right above `blockId`, when that toggle is closed:
// ProseMirror's Backspace would join the block to the toggle's last line, which is hidden.
function closedToggleAbove(editor, blockId) {
  let above = editor.getPrevBlock(blockId);
  while (above?.children?.length) {
    if (isToggleBlock(above) && !isToggleShown(editor, above.id)) {
      return above;
    }
    above = above.children.at(-1);
  }
  return null;
}

// Backspace at the start of the line below a closed toggle joins that line to the toggle's title, the
// line above it on screen, as in Notion; the hidden lines stay. List items and headings first turn
// into a paragraph, as BlockNote's Backspace does.
function joinToClosedToggleAbove(editor, block) {
  const toggle = closedToggleAbove(editor, block.id);
  return Boolean(toggle) && joinBlockIntoTitle(editor, toggle.id, block.id);
}

/**
 * Delete at the end of a closed toggle's title. ProseMirror would join the toggle's first hidden
 * line to the title. As in Notion, the hidden lines stay where they are: the block after the toggle
 * at its own level, the next line on screen, joins the title when it holds text, and with no such
 * block (the toggle ends its list, or a table, an image or a divider comes next) Delete does
 * nothing. A closed toggle without lines, and an open one, are left to BlockNote.
 */
export function handleToggleDelete(editor, event) {
  const selection = editor?.prosemirrorView?.state.selection;
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    event.key !== "Delete" ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    !selection?.empty ||
    selection.$from.parentOffset !== selection.$from.parent.content.size
  ) {
    return false;
  }
  const { block } = editor.getTextCursorPosition();
  const toggle = editor.getBlock(block.id) ?? block;
  if (!isToggleBlock(toggle) || !toggle.children?.length || isToggleShown(editor, toggle.id)) {
    return false;
  }
  const next = editor.getNextBlock(toggle.id);
  if (next && editor.schema.blockSchema[next.type]?.content === "inline") {
    joinBlockIntoTitle(editor, toggle.id, next.id);
  }
  return true;
}

// Moves the text of `blockId` to the end of the title of `toggleId` and the caret to where they
// meet. Lines nested in the block take its place.
function joinBlockIntoTitle(editor, toggleId, blockId) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  const target = state && findBlockContainer(state.doc, toggleId);
  const joined = state && findBlockContainer(state.doc, blockId);
  if (!target || !joined) {
    return false;
  }
  const { node: container, pos: containerStart } = joined;
  const containerEnd = containerStart + container.nodeSize;
  const nested = container.lastChild.type.name === "blockGroup" ? container.lastChild : null;
  const titleEnd = target.pos + target.node.firstChild.nodeSize;
  // The joined block comes after the title, so removing it first leaves titleEnd where it is.
  const tr = nested
    ? state.tr.replaceWith(containerStart, containerEnd, nested.content)
    : state.tr.delete(containerStart, containerEnd);
  tr.insert(titleEnd, container.firstChild.content);
  tr.setSelection(TextSelection.create(tr.doc, titleEnd));
  view.dispatch(tr.scrollIntoView());
  return true;
}

/**
 * Closing a toggle hides its lines. A caret left in one would sit in hidden text, drawn nowhere,
 * where Enter splits the line out of sight, so it moves to the end of the toggle's title first, as
 * in Notion. Runs in the capture phase of the chevron's click, before BlockNote closes the toggle.
 */
export function moveSelectionOutOfClosingToggle(editor, event) {
  const view = editor?.prosemirrorView;
  const wrapper = event.target instanceof Element
    ? event.target.closest(".bn-toggle-button")?.parentElement
    : null;
  if (
    event.button !== 0 ||
    !view ||
    !wrapper?.matches(".bn-toggle-wrapper") ||
    !view.dom.contains(wrapper) ||
    wrapper.getAttribute("data-show-children") !== "true"
  ) {
    return false;
  }
  const blockId = wrapper.closest(".bn-block-outer")?.getAttribute("data-id");
  const toggle = blockId ? findBlockContainer(view.state.doc, blockId) : null;
  const title = toggle?.node.firstChild;
  const children = toggle?.node.lastChild;
  if (!title || children?.type.name !== "blockGroup") {
    return false;
  }
  const childrenStart = toggle.pos + 1 + title.nodeSize;
  const { head } = view.state.selection;
  if (head <= childrenStart || head >= childrenStart + children.nodeSize) {
    return false;
  }
  const titleEnd = toggle.pos + title.nodeSize;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, titleEnd)));
  return true;
}

function findBlockContainer(doc, blockId) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found) {
      return false;
    }
    if (node.type.name === "blockContainer" && node.attrs.id === blockId) {
      found = { node, pos };
      return false;
    }
    return node.type.spec.group !== "blockContent";
  });
  return found;
}

function toggleWrapperOf(editor, blockId) {
  return editor.domElement?.querySelector(
    `.bn-block-outer[data-id="${CSS.escape(blockId)}"] .bn-toggle-wrapper`,
  );
}

function isToggleShown(editor, blockId) {
  return toggleWrapperOf(editor, blockId)?.getAttribute("data-show-children") === "true";
}

// The open state BlockNote keeps per block, which the new block's toggle reads when it renders again.
function showSecondHalfOfSplitToggle(editor, blockId) {
  const secondHalf = editor.getNextBlock(blockId);
  if (!isToggleBlock(secondHalf) || !secondHalf.children.length) {
    return;
  }
  window.localStorage.setItem(`toggle-${secondHalf.id}`, "true");
  toggleWrapperOf(editor, secondHalf.id)?.setAttribute("data-show-children", "true");
}

function clearStoredToggleState(blockId) {
  window.localStorage.removeItem(`toggle-${blockId}`);
}

function getSpaceShortcutTarget(block, marker) {
  if (marker === ">" && !isToggleBlock(block)) {
    return block.type === "heading"
      ? {
        type: "heading",
        props: {
          level: Number(block.props?.level ?? 1),
          isToggleable: true,
        },
      }
      : { type: "toggleListItem", props: {} };
  }

  if (/^#{1,4}$/.test(marker) && isToggleBlock(block)) {
    return {
      type: "heading",
      props: {
        level: marker.length,
        isToggleable: true,
      },
    };
  }

  return null;
}

function isToggleBlock(block) {
  return block?.type === "toggleListItem" ||
    (block?.type === "heading" && block.props?.isToggleable === true);
}

function hasInlineContent(block) {
  if (Array.isArray(block?.content)) {
    return block.content.length > 0;
  }
  return String(block?.content ?? "").length > 0;
}
