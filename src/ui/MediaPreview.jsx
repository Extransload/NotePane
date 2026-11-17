import {
  Download,
  ExternalLink,
  X,
} from "lucide-react";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  usePresenceContext,
} from "../hooks/usePresence.js";

const ICON_PROPS = { size: 15, strokeWidth: 2, "aria-hidden": "true" };

/**
 * An image or video block shown large over the window, opened from its right-click menu. A click
 * on the dimmed area around it, the close button or Escape closes it.
 */
export function MediaPreview({ block, name, onOpen, onSave, onClose }) {
  const { rootProps } = usePresenceContext();
  const closeOnBackdrop = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      {...rootProps}
      className="media-preview"
      role="dialog"
      aria-label={`Preview of ${name}`}
      onMouseDown={closeOnBackdrop}
    >
      <div className="media-preview-bar">
        <span className="media-preview-name" title={name}>{name}</span>
        <button type="button" onMouseDown={preventFocusLoss} onClick={onOpen}>
          <ExternalLink {...ICON_PROPS} />
          Open
        </button>
        <button type="button" onMouseDown={preventFocusLoss} onClick={onSave}>
          <Download {...ICON_PROPS} />
          Save
        </button>
        <button
          type="button"
          className="media-preview-close"
          aria-label="Close preview"
          onMouseDown={preventFocusLoss}
          onClick={onClose}
        >
          <X {...ICON_PROPS} />
        </button>
      </div>
      <div className="media-preview-stage" onMouseDown={closeOnBackdrop}>
        {block.type === "video" ? (
          <video src={block.props.url} controls />
        ) : (
          <img src={block.props.url} alt={block.props.caption || name} />
        )}
      </div>
    </div>
  );
}
