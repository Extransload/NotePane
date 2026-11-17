import {
  useCallback,
  useEffect,
} from "react";
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

const MEDIA_BLOCK_TYPES = new Set(["image", "video", "audio", "file"]);
// What the in-app preview can show.
const PREVIEWABLE_BLOCK_TYPES = new Set(["image", "video"]);

export function getMediaDisplayName(block) {
  return block.props.name?.trim() || imageFileName("", block.props.url);
}

/**
 * Right-clicking an image, video, audio or file block that has a file opens the media menu
 * (overlay "mediaMenu", { blockId, x, y }) instead of the browser's own. Caption and name fields
 * keep the text menu.
 *
 * `getMediaActions(block)` returns the menu's and the preview's actions for a block; an action
 * is undefined where it does not apply (see MediaContextMenu). Save, copy image and crop reuse
 * the formatting toolbar's handlers.
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
      if (!content || !MEDIA_BLOCK_TYPES.has(content.getAttribute("data-content-type"))) {
        return;
      }
      const blockId = content.closest("[data-node-type='blockContainer']")?.getAttribute("data-id");
      const block = blockId ? findBlockById(editor.document, blockId) : null;
      if (!mediaUrlKind(block?.props?.url)) {
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
      alignment: block.props.textAlignment,
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

  return getMediaActions;
}
