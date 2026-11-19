import {
  useCallback,
  useEffect,
} from "react";
import {
  FilePanelExtension,
} from "@blocknote/core/extensions";
import {
  electronApi,
} from "../constants.js";
import {
  findBlockById,
} from "../editor/blocks.js";
import {
  imageFileName,
  mediaFilePath,
  mediaUrlKind,
} from "../editor/images.js";
import {
  writeClipboardText,
} from "../style/colorMath.js";

export const MEDIA_BLOCK_TYPES = ["image", "video", "audio", "file"];
const MEDIA_BLOCK_TYPE_SET = new Set(MEDIA_BLOCK_TYPES);
// What the in-app preview can show, and what BlockNote can show as a file chip instead of the
// picture or the player (its `showPreview`).
const PREVIEWABLE_BLOCK_TYPES = new Set(["image", "video"]);

export function getMediaDisplayName(block) {
  return block.props.name?.trim() || imageFileName("", block.props.url);
}

/** Whether a block is an image, video, audio or file block with a file: the blocks with a menu. */
export function hasMediaMenu(block) {
  return Boolean(block && MEDIA_BLOCK_TYPE_SET.has(block.type) && mediaUrlKind(block.props?.url));
}

/**
 * The media menu (overlay "mediaMenu") of an image, video, audio or file block that has a file:
 * a right click opens it at the pointer ({ blockId, x, y }) instead of the browser's own;
 * `openMediaMenuAtButton(blockId, button, fromKeyboard)` opens it at the block's ⋯ button
 * ({ blockId, anchor, focusOnOpen }, see src/ui/MediaBlockTools.jsx). Caption and name fields
 * keep the text menu.
 *
 * `getMediaActions(block)` returns the menu's and the preview's actions for a block; an action
 * is undefined where it does not apply (see MediaContextMenu). Caption, rename, replace and the
 * preview toggle do what BlockNote's file toolbar buttons did; save, copy image and crop are
 * main.jsx's handlers.
 */
export function useMediaContextMenu({
  editor,
  openOverlay,
  closeOverlay,
  showToast,
  onSave,
  onCopyImage,
  onCrop,
}) {
  useEffect(() => {
    const openMediaMenu = (event) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(".bn-editor") || target.closest("input, textarea")) {
        return;
      }
      const content = target.closest(".bn-block-content[data-content-type]");
      if (!content || !MEDIA_BLOCK_TYPE_SET.has(content.getAttribute("data-content-type"))) {
        return;
      }
      const blockId = content.closest("[data-node-type='blockContainer']")?.getAttribute("data-id");
      if (!hasMediaMenu(blockId ? findBlockById(editor.document, blockId) : null)) {
        return;
      }
      event.preventDefault();
      openOverlay("mediaMenu", { blockId, x: event.clientX, y: event.clientY });
    };

    document.addEventListener("contextmenu", openMediaMenu);
    return () => document.removeEventListener("contextmenu", openMediaMenu);
  }, [editor, openOverlay]);

  const runAndReport = useCallback(async (action, failure) => {
    try {
      await action();
    } catch (error) {
      showToast(error?.message || failure, "error");
    }
  }, [showToast]);

  const getMediaActions = useCallback((block) => {
    const { url } = block.props;
    const kind = mediaUrlKind(url);
    const name = getMediaDisplayName(block);
    const close = () => closeOverlay("mediaMenu");
    // A field edit lands as one undo step with the editor focused, so Cmd+Z takes it back.
    const updateProps = (props) => {
      close();
      editor.updateBlock(block.id, { props });
      editor.focus();
    };

    const open = () => {
      close();
      void runAndReport(async () => {
        if (electronApi?.openAsset) {
          await electronApi.openAsset({ url, name });
        } else {
          window.open(url, "_blank", "noopener");
        }
      }, `Could not open ${name}.`);
    };
    const save = () => {
      close();
      void runAndReport(() => onSave(block), `Could not save ${name}.`);
    };

    return {
      name,
      caption: block.props.caption ?? "",
      alignment: block.props.textAlignment,
      isPreviewShown: block.props.showPreview,
      copyLinkLabel: kind === "file" ? "Copy File Path" : "Copy Link",
      onOpen: open,
      onSave: save,
      onPreview: PREVIEWABLE_BLOCK_TYPES.has(block.type)
        ? () => openOverlay("mediaPreview", block.id)
        : undefined,
      onReveal: kind === "file" && electronApi?.revealAsset
        ? () => {
          close();
          void runAndReport(() => electronApi.revealAsset({ url }), `Could not show ${name}.`);
        }
        : undefined,
      onSetCaption: "caption" in block.props
        ? (caption) => updateProps({ caption })
        : undefined,
      onRename: "name" in block.props
        ? (nextName) => updateProps({ name: nextName.trim() })
        : undefined,
      // BlockNote's upload and embed panel, placed at the block.
      onReplace: () => {
        close();
        editor.getExtension(FilePanelExtension)?.showMenu(block.id);
      },
      onTogglePreview: PREVIEWABLE_BLOCK_TYPES.has(block.type) && "showPreview" in block.props
        ? () => updateProps({ showPreview: !block.props.showPreview })
        : undefined,
      onCopyLink: kind === "web" || kind === "file"
        ? () => {
          close();
          void runAndReport(async () => {
            await writeClipboardText(kind === "file" ? mediaFilePath(url) : url);
            showToast(kind === "file" ? "File path copied" : "Link copied", "success");
          }, "Could not copy.");
        }
        : undefined,
      onCopyImage: block.type === "image" && onCopyImage
        ? () => {
          close();
          void onCopyImage(block);
        }
        : undefined,
      onCrop: block.type === "image"
        ? () => {
          close();
          onCrop(block);
        }
        : undefined,
      onAlign: "textAlignment" in block.props
        ? (textAlignment) => {
          close();
          editor.updateBlock(block.id, { props: { textAlignment } });
        }
        : undefined,
      onDelete: () => {
        close();
        editor.removeBlocks([block.id]);
      },
    };
  }, [closeOverlay, editor, onCopyImage, onCrop, onSave, openOverlay, runAndReport, showToast]);

  const openMediaMenuAtButton = useCallback((blockId, button, fromKeyboard) => {
    const { left, top, width, height } = button.getBoundingClientRect();
    openOverlay("mediaMenu", {
      blockId,
      anchor: { left, top, width, height, align: "end" },
      focusOnOpen: fromKeyboard,
    });
  }, [openOverlay]);

  return { getMediaActions, openMediaMenuAtButton };
}
