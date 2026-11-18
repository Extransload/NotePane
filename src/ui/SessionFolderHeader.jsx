import {
  ChevronDown,
  Folder,
} from "lucide-react";
import {
  preventFocusLoss,
} from "../editor/images.js";

const FOLDER_ICON_PROPS = {
  size: 14,
  strokeWidth: 2,
  "aria-hidden": "true",
};

/**
 * A folder's header in the tabs sidebar: chevron, folder icon, name and the
 * number of sessions in it. A click collapses or expands the folder; while it is
 * renamed the header holds the name field instead, where Enter and leaving the
 * field keep the name and Escape keeps the old one.
 */
export function SessionFolderHeader({
  folder,
  count,
  isCompact = false,
  isDropTarget = false,
  isRenaming = false,
  draftName = "",
  onDraftNameChange,
  onCommitRename,
  onCancelRename,
  onToggle,
  onContextMenu,
}) {
  const className = [
    "session-folder-header",
    folder.collapsed ? "is-collapsed" : "",
    isDropTarget ? "is-drop-target" : "",
    isRenaming ? "is-renaming" : "",
    "has-tooltip",
  ]
    .filter(Boolean)
    .join(" ");
  const icons = (
    <>
      <ChevronDown className="session-folder-chevron" {...FOLDER_ICON_PROPS} />
      <Folder className="session-folder-icon" {...FOLDER_ICON_PROPS} />
    </>
  );

  if (isRenaming) {
    return (
      <div className={className} data-folder-id={folder.id}>
        {icons}
        <input
          aria-label="Folder name"
          value={draftName}
          autoFocus
          spellCheck={false}
          maxLength={60}
          onFocus={(event) => event.target.select()}
          onChange={(event) => onDraftNameChange(event.target.value)}
          onBlur={(event) => onCommitRename(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              onCommitRename(event.currentTarget.value);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancelRename();
            }
          }}
        />
      </div>
    );
  }

  // The compact rail shows only the icon, so its tooltip always names the folder; the full
  // sidebar shows the name, and the tooltip only while the name is cut short.
  return (
    <button
      type="button"
      className={className}
      data-folder-id={folder.id}
      aria-expanded={!folder.collapsed}
      aria-label={`Folder ${folder.name}`}
      data-tooltip={folder.name}
      data-tooltip-overflow={isCompact ? undefined : ".session-folder-name"}
      onMouseDown={preventFocusLoss}
      onClick={onToggle}
      onContextMenu={onContextMenu}
    >
      {icons}
      <span className="session-folder-name">{folder.name}</span>
      <span className="session-folder-count" aria-hidden="true">{count}</span>
    </button>
  );
}
