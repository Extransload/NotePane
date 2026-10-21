import {
  urlsMatch,
} from "./images.js";
import { getSelectedBlocks, isBlockSetSelection } from "./blockSelection.js";
import {
  clamp,
} from "../utils/values.js";

export function getNodeSelectedBlocks(editor) {
  const view = editor.prosemirrorView;
  const selection = view?.state.selection;
  if (!view || !selection) {
    return [];
  }

  let blockId = null;
  if ("node" in selection) {
    const selectedElement = view.nodeDOM(selection.from);
    const blockElement = (
      selectedElement instanceof Element
        ? selectedElement
        : selectedElement?.parentElement
    )?.closest?.(".bn-block-outer[data-id]");
    blockId = blockElement?.getAttribute("data-id");
  }
  if (!blockId && selection.empty) {
    blockId = view.dom.getAttribute("data-notepane-handle-block-id");
  }
  const block = blockId ? findBlockById(editor.document, blockId) : null;
  return block ? [block] : [];
}

export function getBlocksForClipboard(editor) {
  const nodeSelectedBlocks = getNodeSelectedBlocks(editor);
  if (nodeSelectedBlocks.length) {
    return nodeSelectedBlocks;
  }

  if (isBlockSetSelection(editor.prosemirrorView?.state.selection)) {
    return getSelectedBlocks(editor);
  }
  // Cell selections and plain text selections, even across blocks, are
  // serialised by the editor itself, so the clipboard holds exactly what is
  // highlighted. Whole-block copies come from the node and block-set
  // selections above; a cross-block text drag is never promoted to one, and
  // block sets come from the marquee.
  return [];
}

export function isEmptyEditorSurfacePointer(event) {
  if (event.button !== 0) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }

  if (
    target.closest(
      [
        ".bn-block-outer",
        ".bn-side-menu",
        ".bn-table-handle",
        ".bn-table-cell-handle",
        ".bn-formatting-toolbar",
        "[role='toolbar']",
        "[role='listbox']",
        "[role='search']",
        "button",
        "input",
        "textarea",
        "select",
        "a",
      ].join(", "),
    )
  ) {
    return false;
  }

  return Boolean(target.closest("[data-testid='sticky-editor-surface']"));
}

export function isBlankTableSurfacePointer(event) {
  if (event.button !== 0 || !(event.target instanceof Element)) {
    return false;
  }

  return Boolean(
    event.target.closest("table") && !event.target.closest("td, th"),
  );
}

export function isEmptySessionDocument(blocks) {
  return Array.isArray(blocks) && blocks.length === 1 && isEmptyParagraphBlock(blocks[0]);
}

export function isEmptyParagraphBlock(block) {
  if (block?.type !== "paragraph" || block.children?.length > 0) {
    return false;
  }

  if (block.content == null) {
    return true;
  }

  if (typeof block.content === "string") {
    return block.content.trim().length === 0;
  }

  return Array.isArray(block.content) && block.content.every(
    (item) => item?.type === "text" && !item.text?.trim(),
  );
}

export function focusLastEditorBlock(editor) {
  const lastBlock = editor.document.at(-1);
  if (lastBlock && isEmptyParagraphBlock(lastBlock)) {
    editor.focus();
    editor.setTextCursorPosition(lastBlock, "start");
    return;
  }

  editor.focus();
  const insertedBlocks = lastBlock
    ? editor.insertBlocks([{ type: "paragraph" }], lastBlock.id, "after")
    : editor.replaceBlocks([], [{ type: "paragraph" }]).insertedBlocks;
  const insertedBlock = insertedBlocks?.[0];
  if (insertedBlock) {
    editor.setTextCursorPosition(insertedBlock, "start");
    return;
  }

  if (!lastBlock) {
    editor.focus();
    return;
  }

  try {
    editor.setTextCursorPosition(lastBlock, "end");
    return;
  } catch {
    // Non-text blocks can reject text cursor placement.
  }

  try {
    editor.setTextCursorPosition(lastBlock, "start");
    return;
  } catch {
    // Some media/table blocks cannot receive a text cursor.
  }

  try {
    editor.setSelection(lastBlock, lastBlock);
  } catch {
    // Final fallback: keep editor focused even if block selection is unavailable.
  }
}

export async function cutCurrentBlocks(editor, activeImageBlockId, scheduleSave) {
  await cutBlocks(editor, resolveBlocksForCut(editor, activeImageBlockId), scheduleSave);
}

export async function cutBlocks(editor, blocks, scheduleSave) {
  if (blocks.length === 0) {
    return;
  }

  try {
    const markdown = await editor.blocksToMarkdownLossy(blocks);
    await navigator.clipboard?.writeText(markdown);
  } catch {
    // Clipboard write is best-effort; the block removal should still happen.
  }

  const topLevelIds = new Set(editor.document.map((block) => block.id));
  const topLevelBlocks = blocks.filter((block) => topLevelIds.has(block.id));
  const removesEveryTopLevelBlock = topLevelBlocks.length === editor.document.length;

  if (removesEveryTopLevelBlock) {
    const { insertedBlocks } = editor.replaceBlocks(editor.document, [
      { type: "paragraph" },
    ]);
    editor.setTextCursorPosition(insertedBlocks[0], "start");
    scheduleSave();
    return;
  }

  const firstTopLevelIndex = editor.document.findIndex(
    (block) => block.id === topLevelBlocks[0]?.id,
  );
  const nextCursorBlock =
    firstTopLevelIndex >= 0
      ? editor.document[firstTopLevelIndex + topLevelBlocks.length] ||
        editor.document[firstTopLevelIndex - 1]
      : null;

  editor.removeBlocks(blocks);
  if (nextCursorBlock) {
    editor.setTextCursorPosition(nextCursorBlock, "start");
  } else if (editor.document[0]) {
    editor.setTextCursorPosition(editor.document[0], "start");
  }
  scheduleSave();
}

export function resolveBlocksForCut(editor, activeImageBlockId) {
  const selectedBlocks = getSelectedBlocks(editor);
  if (selectedBlocks.length) {
    return selectedBlocks;
  }

  const nodeSelectedBlocks = getNodeSelectedBlocks(editor);
  if (nodeSelectedBlocks.length) {
    return nodeSelectedBlocks;
  }

  const activeImageBlock = findBlockById(editor.document, activeImageBlockId);
  if (activeImageBlock) {
    return [activeImageBlock];
  }

  try {
    return [editor.getTextCursorPosition().block];
  } catch {
    return [];
  }
}

// A six-dot menu action takes the selection only when it includes the menu's
// block, as BlockNote's Delete item does; otherwise just the menu's block. A
// block that is no longer in this editor gives nothing to act on.
export function resolveBlocksForMenuBlock(editor, menuBlockId) {
  const menuBlock = menuBlockId ? editor.getBlock(menuBlockId) : undefined;
  if (!menuBlock) {
    return [];
  }

  const selectedBlocks = editor.getSelection()?.blocks;
  return selectedBlocks?.some((block) => block.id === menuBlock.id)
    ? selectedBlocks
    : [menuBlock];
}

export function extractTableOfContentsEntries(blocks) {
  const entries = [];

  collectBlocks(blocks, (block) => {
    if (block?.type !== "heading" || !block.id) {
      return;
    }

    const title = extractBlockPlainText(block.content).trim();
    if (!title) {
      return;
    }

    entries.push({
      id: block.id,
      title,
      level: getHeadingLevel(block),
    });
  });

  return entries;
}

export function extractBlockPlainText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(extractBlockPlainText).join("");
  }

  if (content && typeof content === "object") {
    if (typeof content.text === "string") {
      return content.text;
    }

    if (Array.isArray(content.rows)) {
      return content.rows
        .flatMap((row) => Array.isArray(row?.cells) ? row.cells : [])
        .map(extractBlockPlainText)
        .find((text) => text.trim()) ?? "";
    }

    return extractBlockPlainText(content.content);
  }

  return "";
}

export function getHeadingLevel(block) {
  const level = Number(
    block?.props?.level ??
      block?.props?.headingLevel ??
      block?.props?.depth ??
      1,
  );

  return clamp(Math.round(level), 1, 4, 1);
}

export function scrollEditorBlockIntoView(blockId) {
  const blockElement = getEditorBlockElement(blockId);
  blockElement?.scrollIntoView({
    block: "start",
    inline: "nearest",
    behavior: "smooth",
  });
}

export function getEditorBlockElement(blockId) {
  if (!blockId) {
    return null;
  }

  const escapedBlockId =
    window.CSS?.escape?.(blockId) ?? String(blockId).replace(/["'\\]/g, "\\$&");
  const selectors = [
    `[data-id="${escapedBlockId}"]`,
    `[data-block-id="${escapedBlockId}"]`,
    `#${escapedBlockId}`,
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const blockElement = element?.closest?.(".bn-block-outer") ?? element;
    if (blockElement) {
      return blockElement;
    }
  }

  return null;
}

export function findBlockById(blocks, blockId) {
  if (!blockId) {
    return null;
  }

  for (const block of blocks) {
    if (block.id === blockId) {
      return block;
    }

    const childBlock = findBlockById(block.children || [], blockId);
    if (childBlock) {
      return childBlock;
    }
  }

  return null;
}

// Identical images share one asset URL, so the rendered block id is the only
// reliable way to tell which of several matching image blocks was clicked.
export function findImageBlockForElement(blocks, imageElement) {
  const blockId = imageElement
    ?.closest?.(".bn-block-outer[data-id]")
    ?.getAttribute("data-id");
  const block = findBlockById(blocks, blockId);
  if (block?.type === "image") {
    return block;
  }

  return findImageBlockBySource(
    blocks,
    imageElement?.currentSrc || imageElement?.src,
  );
}

export function findImageBlockBySource(blocks, sourceUrl) {
  const imageBlocks = [];
  collectBlocks(blocks, (block) => {
    if (block.type === "image" && block.props?.url) {
      imageBlocks.push(block);
    }
  });

  return (
    imageBlocks.find((block) => urlsMatch(block.props.url, sourceUrl)) ||
    (imageBlocks.length === 1 ? imageBlocks[0] : null)
  );
}

export function collectBlocks(blocks, callback) {
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block) {
      continue;
    }

    callback(block);
    collectBlocks(block.children || [], callback);
  }
}
