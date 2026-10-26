import { SuggestionMenu } from "@blocknote/core/extensions";
import { closeHistory } from "@tiptap/pm/history";

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
    return false;
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
