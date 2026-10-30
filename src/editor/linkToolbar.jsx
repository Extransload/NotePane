import { useEffect, useRef, useState } from "react";
import { LinkToolbarExtension } from "@blocknote/core/extensions";
import {
  EditLinkMenuItems,
  useComponentsContext,
  useExtension,
} from "@blocknote/react";
import { Check, Copy, Globe, Unlink, X } from "lucide-react";
import { writeClipboardText } from "../style/colorMath.js";
import { preventFocusLoss } from "./images.js";

const COPY_CONFIRMATION_DURATION = 1600;

// The address BlockNote's Open button opens: resolved against the page, and "#" for a script URL.
function resolveLinkUrl(url) {
  try {
    const resolved = new URL(url, window.location.href);
    if (resolved.protocol !== "javascript:") {
      return resolved.href;
    }
  } catch {
    // An address the URL parser refuses opens nothing, as in BlockNote.
  }
  return "#";
}

// The link toolbar, as in Notion: the link's address on one line (it opens the link), Copy, and
// Edit, whose form edits the address and the text and removes the link. LinkToolbarController
// shows it under a hovered link and while the caret is inside one.
export function NotePaneLinkToolbar({ url, text, range, setToolbarOpen, setToolbarPositionFrozen }) {
  const Components = useComponentsContext();
  const { deleteLink } = useExtension(LinkToolbarExtension);
  // Kept with the address it is for, so another link's toolbar starts at Copy.
  const [copied, setCopied] = useState(null);
  const resetTimerRef = useRef(0);
  const copyStatus = copied?.url === url ? copied.status : "idle";

  useEffect(() => () => window.clearTimeout(resetTimerRef.current), []);

  const copyLink = async () => {
    const isCopied = await writeClipboardText(url);
    setCopied({ url, status: isCopied ? "success" : "error" });
    window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setCopied(null), COPY_CONFIRMATION_DURATION);
  };

  const removeLink = () => {
    deleteLink(range.from);
    setToolbarOpen?.(false);
    setToolbarPositionFrozen?.(false);
  };

  const copyLabel = copyStatus === "success"
    ? "Link copied"
    : copyStatus === "error"
      ? "Could not copy link"
      : "Copy link";

  return (
    <Components.LinkToolbar.Root className="bn-toolbar bn-link-toolbar notepane-link-preview">
      <button
        type="button"
        className="notepane-link-preview-url"
        aria-label={`Open ${url}`}
        title={url}
        onMouseDown={preventFocusLoss}
        onClick={() => window.open(resolveLinkUrl(url), "_blank")}
      >
        <Globe aria-hidden="true" />
        <span className="notepane-link-preview-address">{url}</span>
      </button>
      <Components.LinkToolbar.Button
        className={`bn-button notepane-link-preview-copy is-${copyStatus}`}
        label={copyLabel}
        mainTooltip={copyLabel}
        isSelected={false}
        onClick={() => void copyLink()}
        icon={copyStatus === "success" ? (
          <Check key="success" aria-hidden="true" />
        ) : copyStatus === "error" ? (
          <X key="error" aria-hidden="true" />
        ) : (
          <Copy key="idle" aria-hidden="true" />
        )}
      />
      <Components.Generic.Popover.Root onOpenChange={setToolbarPositionFrozen}>
        <Components.Generic.Popover.Trigger>
          <Components.LinkToolbar.Button
            className="bn-button notepane-link-preview-edit"
            isSelected={false}
          >
            Edit
          </Components.LinkToolbar.Button>
        </Components.Generic.Popover.Trigger>
        <Components.Generic.Popover.Content
          className="bn-popover-content bn-form-popover notepane-link-edit-form"
          variant="form-popover"
        >
          <EditLinkMenuItems
            url={url}
            text={text}
            range={range}
            setToolbarOpen={setToolbarOpen}
            setToolbarPositionFrozen={setToolbarPositionFrozen}
          />
          <button type="button" className="notepane-link-remove-button" onClick={removeLink}>
            <Unlink aria-hidden="true" />
            Remove link
          </button>
        </Components.Generic.Popover.Content>
      </Components.Generic.Popover.Root>
    </Components.LinkToolbar.Root>
  );
}
