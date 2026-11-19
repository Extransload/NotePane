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
  useBlockToolPosition,
  useBlockToolTargets,
  useHovered,
} from "../hooks/useBlockTools.js";
import {
  hasMediaMenu,
  MEDIA_BLOCK_TYPES,
} from "../hooks/useMediaContextMenu.js";

// The ⋯ button sits on the picture or player itself, not on the full-width block row, and at
// least its own width and margin in from the picture's left edge.
const getMediaAnchor = (element) =>
  element.querySelector(".bn-visual-media-wrapper, .bn-file-block-content-wrapper") ?? element;
const MEDIA_TOOL_MIN_WIDTH = 44;

// The one media block a selection holds, if it holds just one.
function getSelectedMediaBlockId(editor) {
  const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
  return blocks.length === 1 && MEDIA_BLOCK_TYPES.includes(blocks[0]?.type) ? blocks[0].id : null;
}

/**
 * The ⋯ button of each image, video, audio or file block with a file, as in Notion: shown on the
 * block's top-right corner while the pointer is on it, while the block is selected (clicked), and
 * while its menu is open. It opens the same media menu as a right click, anchored to the button
 * (`onOpenMenu(blockId, button, fromKeyboard)`); clicked again, it closes it (`onCloseMenu`).
 */
export function MediaBlockTools({ editor, activeImageBlockId, menuBlockId, onOpenMenu, onCloseMenu }) {
  const targets = useBlockToolTargets(MEDIA_BLOCK_TYPES, getMediaAnchor);
  const [selectedBlockId, setSelectedBlockId] = useState(() => getSelectedMediaBlockId(editor));

  useEffect(() => {
    setSelectedBlockId(getSelectedMediaBlockId(editor));
    return editor.onSelectionChange(() => setSelectedBlockId(getSelectedMediaBlockId(editor)));
  }, [editor]);

  return targets.map(({ blockId, element, anchor }) => (
    hasMediaMenu(findBlockById(editor.document, blockId)) ? (
      <MediaMoreButton
        key={`media-block-tools-${blockId}`}
        blockId={blockId}
        element={element}
        anchor={anchor}
        isSelected={blockId === activeImageBlockId || blockId === selectedBlockId}
        isMenuOpen={blockId === menuBlockId}
        onOpenMenu={onOpenMenu}
        onCloseMenu={onCloseMenu}
      />
    ) : null
  ));
}

function MediaMoreButton({
  blockId,
  element,
  anchor,
  isSelected,
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
}) {
  const position = useBlockToolPosition(anchor, MEDIA_TOOL_MIN_WIDTH);
  const isBlockHovered = useHovered(element);
  // The button covers the picture, so the pointer leaves the block as it reaches the button.
  const [isToolHovered, setToolHovered] = useState(false);

  return (
    <div
      className="media-block-tools"
      data-block-id={blockId}
      data-shown={isBlockHovered || isToolHovered || isSelected || isMenuOpen ? "true" : undefined}
      contentEditable={false}
      onPointerEnter={() => setToolHovered(true)}
      onPointerLeave={() => setToolHovered(false)}
      // A right click on the button, part of the block to the eye, opens the block's menu too.
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenMenu(blockId, event.currentTarget, false);
      }}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? "visible" : "hidden",
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
          onOpenMenu(blockId, event.currentTarget, event.detail === 0);
        }}
      >
        <Ellipsis aria-hidden="true" />
      </button>
    </div>
  );
}
