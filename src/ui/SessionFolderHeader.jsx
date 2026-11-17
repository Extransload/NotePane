import {
  ChevronDown,
  Folder,
  FolderPlus,
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
    isCompact ? "has-tooltip" : "",
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

  return (
    <button
      type="button"
      className={className}
      data-folder-id={folder.id}
      aria-expanded={!folder.collapsed}
      aria-label={`Folder ${folder.name}`}
      data-tooltip={isCompact ? folder.name : undefined}
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

// The row under New session that creates a folder and opens its name for typing.
export function NewFolderButton({ onCreate }) {
  return (
    <button
      type="button"
      className="session-add-folder-button"
      aria-label="New folder"
      onMouseDown={preventFocusLoss}
      onClick={onCreate}
    >
      <FolderPlus className="session-add-folder-icon" {...FOLDER_ICON_PROPS} />
      <span>New folder</span>
    </button>
  );
}
