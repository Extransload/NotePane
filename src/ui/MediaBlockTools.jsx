import { Ellipsis } from "lucide-react";
import {
  useEffect,
  useState,
} from "react";
import {
  findBlockById,
} from "../editor/blocks.js";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  hasMediaMenu,
  MEDIA_BLOCK_TYPES,
} from "../hooks/useMediaContextMenu.js";

const EDITOR_SURFACE_SELECTOR = "[data-testid='sticky-editor-surface']";
const MEDIA_CONTENT_SELECTOR = MEDIA_BLOCK_TYPES
  .map((type) => `.bn-block-content[data-content-type='${type}']`)
  .join(", ");
// The CSS anchor the ⋯ button is placed against (src/styles/blocknote.css).
const ANCHOR_NAME = "--notepane-media-tool";

// The one media block a selection holds, if it holds just one.
function getSelectedMediaBlockId(editor) {
  const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
  return blocks.length === 1 && MEDIA_BLOCK_TYPES.includes(blocks[0]?.type) ? blocks[0].id : null;
}

// The media block whose content holds `target`; null for anything else.
function getMediaBlockIdAt(target) {
  return target?.closest?.(MEDIA_CONTENT_SELECTOR)
    ?.closest(".bn-block-outer[data-id]")?.dataset.id ?? null;
}

/**
 * The media block under the pointer. Followed from pointer moves over the editor surface, and,
 * because a note scrolling under a still pointer sends no pointer event, read again at the last
 * pointer position whenever the surface scrolls. The ⋯ button itself counts as its block.
 */
function useHoveredMediaBlockId() {
  const [blockId, setBlockId] = useState(null);

  useEffect(() => {
    const surface = document.querySelector(EDITOR_SURFACE_SELECTOR);
    if (!surface) {
      return undefined;
    }
    let pointer = null;
    const follow = (target) => {
      if (!target?.closest?.(".media-block-tools")) {
        setBlockId(getMediaBlockIdAt(target));
      }
    };
    const handlePointerMove = (event) => {
      pointer = { x: event.clientX, y: event.clientY };
      follow(event.target);
    };
    const handlePointerLeave = () => {
      pointer = null;
      setBlockId(null);
    };
    const handleScroll = () => {
      if (pointer) {
        follow(document.elementFromPoint(pointer.x, pointer.y));
      }
    };
    surface.addEventListener("pointermove", handlePointerMove);
    surface.addEventListener("pointerleave", handlePointerLeave);
    surface.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      surface.removeEventListener("pointermove", handlePointerMove);
      surface.removeEventListener("pointerleave", handlePointerLeave);
      surface.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return blockId;
}

/**
 * The ⋯ button of an image, video, audio or file block with a file, as in Notion. There is at
 * most one: on the block whose menu it opened while that menu is open, else on the block under
 * the pointer, else on the block it holds keyboard focus for, else on the selected (clicked)
 * block. It sits inside the visible picture's top-right corner, 8px in (for a file or audio
 * block, or a picture shown as a file line, at the right end of the block row), placed by CSS
 * anchor positioning against that element, so the browser keeps it there through any layout
 * change. It opens the same media menu as a right click, anchored to the button
 * (`onOpenMenu(blockId, button, fromKeyboard)`); clicked again, it closes it (`onCloseMenu`).
 */
export function MediaBlockTools({ editor, activeImageBlockId, menuBlockId, onOpenMenu, onCloseMenu }) {
  const hoveredBlockId = useHoveredMediaBlockId();
  const [focusedBlockId, setFocusedBlockId] = useState(null);
  const [selectedBlockId, setSelectedBlockId] = useState(() => getSelectedMediaBlockId(editor));

  useEffect(() => {
    setSelectedBlockId(getSelectedMediaBlockId(editor));
    return editor.onSelectionChange(() => setSelectedBlockId(getSelectedMediaBlockId(editor)));
  }, [editor]);

  const block = [menuBlockId, hoveredBlockId, focusedBlockId, activeImageBlockId, selectedBlockId]
    .map((blockId) => (blockId ? findBlockById(editor.document, blockId) : null))
    .find(hasMediaMenu);
  if (!block) {
    return null;
  }

  const isPictureShown = (block.type === "image" || block.type === "video") &&
    block.props.showPreview !== false;
  const blockContent = `.bn-block-outer[data-id="${CSS.escape(block.id)}"] > .bn-block > .bn-block-content`;
  const isMenuOpen = block.id === menuBlockId;

  return (
    <>
      <style>
        {`${isPictureShown ? `${blockContent} .bn-visual-media` : blockContent} { anchor-name: ${ANCHOR_NAME}; }`}
      </style>
      <div
        className={`media-block-tools${isPictureShown ? "" : " is-row"}`}
        data-block-id={block.id}
        contentEditable={false}
        onFocus={() => setFocusedBlockId(block.id)}
        onBlur={(event) => {
          // Focus going into the button's menu, and coming back, keeps the button on its block.
          if (!event.relatedTarget?.closest?.(".media-block-tools, .media-context-menu")) {
            setFocusedBlockId(null);
          }
        }}
        // A right click on the button, part of the block to the eye, opens the block's menu too.
        onContextMenu={(event) => {
          event.preventDefault();
          onOpenMenu(block.id, event.currentTarget, false);
        }}
      >
        <button
          type="button"
          className="media-block-more-button"
          aria-label="More actions"
          data-tooltip="More actions"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onMouseDown={preventFocusLoss}
          onClick={(event) => {
            if (isMenuOpen) {
              onCloseMenu();
              return;
            }
            // A click from Enter or Space has no pointer position, so the menu takes focus.
            onOpenMenu(block.id, event.currentTarget, event.detail === 0);
          }}
        >
          <Ellipsis aria-hidden="true" />
        </button>
      </div>
    </>
  );
}
