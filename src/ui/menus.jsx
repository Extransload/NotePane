import {
  Copy,
  CopyPlus,
  Crop,
  Download,
  ExternalLink,
  FileDown,
  FilePlus,
  Folder,
  FolderInput,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  FolderX,
  Link,
  PanelTopOpen,
  PencilLine,
  ScanEye,
  SlidersHorizontal,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  useMergedRefs,
  usePresenceContext,
} from "../hooks/usePresence.js";
import {
  STICKY_PASTEL_PALETTE,
} from "../constants.js";
import {
  getNoteDisplayTitle,
} from "../model/notes.js";
import {
  resolveSessionTabAccentColor,
} from "../style/themeStyles.js";
import {
  toneMatch,
} from "../style/toneMatch.js";
import {
  getFloatingDropdownMenuStyle,
} from "./FloatingDropdownMenu.jsx";

/**
 * The fixed position of a menu opened at `anchor` ({ left, top, width, height }, a pointer being
 * a rectangle of no size): below it, or above it when there is no room below, and clamped to the
 * viewport by the dropdown placement helper. The menu is laid out hidden first, so the helper
 * works with its real size: its layout size, as its pop-in starts scaled down and a menu placed
 * above its anchor by that smaller height would cover the anchor once it has grown.
 */
function useAnchoredMenuStyle(menuRef, { left, top, width = 0, height = 0 }, align = "start") {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const size = { width: menu.offsetWidth, height: menu.offsetHeight };
    const { placement, ...position } = getFloatingDropdownMenuStyle(
      {
        getBoundingClientRect: () => ({
          left,
          top,
          width,
          height,
          right: left + width,
          bottom: top + height,
        }),
      },
      {
        align,
        maxHeight: size.height,
        maxWidth: size.width,
        minWidth: size.width,
        preferredWidth: size.width,
      },
    );
    setStyle({ ...position, maxHeight: undefined, width: undefined });
  }, [align, height, left, menuRef, top, width]);

  return style ?? { left: 0, top: 0, visibility: "hidden" };
}

function MenuItem({ icon, children, tone, disabled = false, onSelect }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={tone ? `is-${tone}` : undefined}
      disabled={disabled}
      onMouseDown={preventFocusLoss}
      onClick={onSelect}
    >
      {icon}
      <span className="context-menu-label">{children}</span>
    </button>
  );
}

function MenuSeparator() {
  return <div className="session-tab-menu-separator" role="separator" />;
}

const MENU_ICON_PROPS = {
  className: "session-tab-menu-icon",
  size: 14,
  strokeWidth: 2,
  "aria-hidden": "true",
};

// Arrow keys move between the items of an open menu, wrapping at both ends.
function moveMenuFocus(event) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  const items = [...event.currentTarget.querySelectorAll("[role='menuitem']:not(:disabled)")];
  if (items.length === 0) {
    return;
  }
  event.preventDefault();
  const offset = event.key === "ArrowDown" ? 1 : -1;
  const index = items.indexOf(document.activeElement);
  const nextIndex = index < 0
    ? (offset > 0 ? 0 : items.length - 1)
    : (index + offset + items.length) % items.length;
  items[nextIndex].focus();
}

/**
 * A menu opened at the pointer: placed below and right of it, flipped and clamped inside the
 * window (useAnchoredMenuStyle), with arrow keys moving between its items. `className` names the
 * menu for the stylesheet and for the window's outside-click handling.
 */
function ContextMenu({ x, y, label, className, children }) {
  const menuRef = useRef(null);
  const { rootProps } = usePresenceContext();
  const rootRef = useMergedRefs(menuRef, rootProps.ref);
  const position = useAnchoredMenuStyle(menuRef, { left: x, top: y });

  return (
    <div
      {...rootProps}
      ref={rootRef}
      className={`${className} notepane-context-menu editor-floating-menu`}
      role="menu"
      aria-label={label}
      style={position}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={moveMenuFocus}
    >
      {children}
    </div>
  );
}

export function SessionTabContextMenu({
  x,
  y,
  sessionNote,
  activeTheme,
  canOpenAsSticky = false,
  folders = [],
  onRename,
  onDuplicate,
  onOpenAsSticky,
  onPickColor,
  onOpenColor,
  onMoveToFolder,
  onNewFolder,
  onMoveToTrash,
}) {
  const storedColor = resolveSessionTabAccentColor(sessionNote.theme);
  // A folder id that names no folder counts as none, as in the sidebar.
  const currentFolderId = folders.some((folder) => folder.id === sessionNote.folderId)
    ? sessionNote.folderId
    : null;

  return (
    <ContextMenu
      x={x}
      y={y}
      label={`Session options for ${getNoteDisplayTitle(sessionNote)}`}
      className="session-tab-context-menu"
    >
      <MenuItem icon={<PencilLine {...MENU_ICON_PROPS} />} onSelect={onRename}>
        Rename
      </MenuItem>
      <MenuItem icon={<CopyPlus {...MENU_ICON_PROPS} />} onSelect={onDuplicate}>
        Duplicate
      </MenuItem>
      {canOpenAsSticky && (
        <MenuItem icon={<PanelTopOpen {...MENU_ICON_PROPS} />} onSelect={onOpenAsSticky}>
          Open as sticky
        </MenuItem>
      )}
      <MenuSeparator />
      <div className="context-menu-swatches" role="group" aria-label="Tab color">
        <button
          type="button"
          className="context-menu-swatch is-none"
          aria-label="No color"
          aria-pressed={!storedColor}
          onMouseDown={preventFocusLoss}
          onClick={() => onPickColor(null)}
        />
        {STICKY_PASTEL_PALETTE.map((color, index) => (
          <button
            key={color}
            type="button"
            className="context-menu-swatch"
            aria-label={`Pastel color ${index + 1}`}
            aria-pressed={storedColor === color}
            style={{ "--context-menu-swatch-color": toneMatch(color, activeTheme, "fill") }}
            onMouseDown={preventFocusLoss}
            onClick={() => onPickColor(color)}
          />
        ))}
      </div>
      <MenuItem
        icon={
          <span
            className="session-tab-menu-color-swatch"
            style={{
              "--session-tab-menu-color": storedColor
                ? toneMatch(storedColor, activeTheme, "mark")
                : undefined,
            }}
            aria-hidden="true"
          />
        }
        onSelect={onOpenColor}
      >
        Color...
      </MenuItem>
      <MenuSeparator />
      <div className="context-menu-heading" role="presentation">Folder</div>
      {folders
        .filter((folder) => folder.id !== currentFolderId)
        .map((folder) => (
          <MenuItem
            key={folder.id}
            icon={<FolderInput {...MENU_ICON_PROPS} />}
            onSelect={() => onMoveToFolder(folder.id)}
          >
            {`Move to ${folder.name}`}
          </MenuItem>
        ))}
      {currentFolderId && (
        <MenuItem
          icon={<FolderMinus {...MENU_ICON_PROPS} />}
          onSelect={() => onMoveToFolder(null)}
        >
          Remove from folder
        </MenuItem>
      )}
      <MenuItem icon={<FolderPlus {...MENU_ICON_PROPS} />} onSelect={onNewFolder}>
        New folder…
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<Trash2 {...MENU_ICON_PROPS} />}
        tone="danger"
        onSelect={onMoveToTrash}
      >
        Move to Trash
      </MenuItem>
    </ContextMenu>
  );
}

/**
 * The right-click menu of a folder header in the tabs sidebar. Deleting a folder
 * moves its notes out to the ungrouped tabs, so it needs no confirmation.
 */
export function FolderContextMenu({
  x,
  y,
  folder,
  onNewNote,
  onRename,
  onToggleCollapsed,
  onDelete,
}) {
  return (
    <ContextMenu
      x={x}
      y={y}
      label={`Folder options for ${folder.name}`}
      className="folder-context-menu"
    >
      <MenuItem icon={<FilePlus {...MENU_ICON_PROPS} />} onSelect={onNewNote}>
        New note in folder
      </MenuItem>
      <MenuItem icon={<PencilLine {...MENU_ICON_PROPS} />} onSelect={onRename}>
        Rename
      </MenuItem>
      <MenuItem
        icon={folder.collapsed
          ? <FolderOpen {...MENU_ICON_PROPS} />
          : <Folder {...MENU_ICON_PROPS} />}
        onSelect={onToggleCollapsed}
      >
        {folder.collapsed ? "Expand" : "Collapse"}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<FolderX {...MENU_ICON_PROPS} />}
        tone="danger"
        onSelect={onDelete}
      >
        Delete folder
      </MenuItem>
    </ContextMenu>
  );
}

const ALIGNMENTS = [
  ["left", "Align left", TextAlignStart],
  ["center", "Align center", TextAlignCenter],
  ["right", "Align right", TextAlignEnd],
];

/**
 * The right-click menu of an image, video, audio or file block. An action left undefined is not
 * offered: `onPreview` for media the app cannot show, `onReveal` for a file that is not linked
 * from disk, `onCopyLink` for a file kept with the note, `onCopyImage` and `onCrop` for anything
 * but an image, `onAlign` for blocks without an alignment.
 */
export function MediaContextMenu({
  x,
  y,
  name,
  copyLinkLabel,
  alignment,
  onOpen,
  onPreview,
  onReveal,
  onSave,
  onCopyImage,
  onCopyLink,
  onCrop,
  onAlign,
  onDelete,
}) {
  return (
    <ContextMenu x={x} y={y} label={`Options for ${name}`} className="media-context-menu">
      <div className="context-menu-heading" title={name}>{name}</div>
      <MenuItem icon={<ExternalLink {...MENU_ICON_PROPS} />} onSelect={onOpen}>
        Open
      </MenuItem>
      {onPreview && (
        <MenuItem icon={<ScanEye {...MENU_ICON_PROPS} />} onSelect={onPreview}>
          Preview
        </MenuItem>
      )}
      {onReveal && (
        <MenuItem icon={<FolderOpen {...MENU_ICON_PROPS} />} onSelect={onReveal}>
          Show in Finder
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem icon={<Download {...MENU_ICON_PROPS} />} onSelect={onSave}>
        Save As...
      </MenuItem>
      {onCopyImage && (
        <MenuItem icon={<Copy {...MENU_ICON_PROPS} />} onSelect={onCopyImage}>
          Copy Image
        </MenuItem>
      )}
      {onCopyLink && (
        <MenuItem icon={<Link {...MENU_ICON_PROPS} />} onSelect={onCopyLink}>
          {copyLinkLabel}
        </MenuItem>
      )}
      {(onCrop || onAlign) && <MenuSeparator />}
      {onCrop && (
        <MenuItem icon={<Crop {...MENU_ICON_PROPS} />} onSelect={onCrop}>
          Crop...
        </MenuItem>
      )}
      {onAlign && (
        <div className="context-menu-segments" role="group" aria-label="Alignment">
          {ALIGNMENTS.map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-label={label}
              aria-pressed={alignment === value}
              onMouseDown={preventFocusLoss}
              onClick={() => onAlign(value)}
            >
              <Icon {...MENU_ICON_PROPS} />
            </button>
          ))}
        </div>
      )}
      <MenuSeparator />
      <MenuItem icon={<Trash2 {...MENU_ICON_PROPS} />} tone="danger" onSelect={onDelete}>
        Delete
      </MenuItem>
    </ContextMenu>
  );
}

function toAnchor(element, align) {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height, align };
}

function isShown(element) {
  const rect = element?.getBoundingClientRect();
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

/**
 * Where the export format menu opens: under (or over) the export button that was clicked;
 * for the shortcut, the sidebar's export button when the sidebar shows, else the right end of
 * the header, else the top centre of the window.
 */
export function getExportMenuAnchor(trigger = null) {
  if (isShown(trigger)) {
    return toAnchor(trigger, "start");
  }
  const sidebarButton = document.querySelector(
    "[data-testid='session-sidebar-footer'] .export-icon-button",
  );
  if (isShown(sidebarButton)) {
    return toAnchor(sidebarButton, "start");
  }
  const header = document.querySelector("[data-testid='sticky-header']");
  if (isShown(header)) {
    const rect = header.getBoundingClientRect();
    return { left: rect.right - 12, top: rect.top, width: 0, height: rect.height, align: "end" };
  }
  return { left: window.innerWidth / 2, top: 0, width: 0, height: 0, align: "center" };
}

// One click exports the open note as PDF or Markdown with the usual settings; Options... opens
// the Export window for HTML, an image, a folder or every note, and per-format settings.
export function ExportFormatMenu({ anchor, onExport, onOpenOptions }) {
  const menuRef = useRef(null);
  const { rootProps } = usePresenceContext();
  const rootRef = useMergedRefs(menuRef, rootProps.ref);
  const position = useAnchoredMenuStyle(menuRef, anchor, anchor.align);
  return (
    <div
      {...rootProps}
      ref={rootRef}
      className="export-format-menu editor-floating-menu"
      role="menu"
      aria-label="Export format"
      style={position}
      onKeyDown={moveMenuFocus}
    >
      <button
        type="button"
        role="menuitem"
        onMouseDown={preventFocusLoss}
        onClick={() => onExport("pdf")}
      >
        <FileDown aria-hidden="true" size={16} strokeWidth={2} />
        <span className="export-format-menu-copy">
          <strong>PDF</strong>
          <small>Print-ready document</small>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onMouseDown={preventFocusLoss}
        onClick={() => onExport("md")}
      >
        <Download aria-hidden="true" size={16} strokeWidth={2} />
        <span className="export-format-menu-copy">
          <strong>Markdown</strong>
          <small>Editable .md file</small>
        </span>
      </button>
      <div className="session-tab-menu-separator" role="separator" />
      <button
        type="button"
        role="menuitem"
        onMouseDown={preventFocusLoss}
        onClick={onOpenOptions}
      >
        <SlidersHorizontal aria-hidden="true" size={16} strokeWidth={2} />
        <span className="export-format-menu-copy">
          <strong>Options...</strong>
          <small>HTML, image, folders, settings</small>
        </span>
      </button>
    </div>
  );
}

export function MarkdownImportDialog({ onClose, onImport }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const { isClosing, rootProps } = usePresenceContext();

  useEffect(() => {
    if (isClosing) {
      return undefined;
    }
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isImporting) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isClosing, isImporting, onClose]);

  const importFiles = useCallback(async (files) => {
    const file = Array.from(files || []).find((candidate) => candidate instanceof File);
    if (!file) {
      setError("Drop or choose a Markdown file.");
      return;
    }

    setError("");
    setIsImporting(true);
    try {
      await onImport(file);
    } catch (error) {
      setError(error.message || "Markdown import failed.");
    } finally {
      setIsImporting(false);
    }
  }, [onImport]);

  return (
    <div
      {...rootProps}
      className="preferences-backdrop markdown-import-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isImporting) {
          onClose();
        }
      }}
    >
      <section
        className="markdown-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Import Markdown"
      >
        <header className="markdown-import-header">
          <div>
            <div className="markdown-import-title">Import Markdown</div>
            <p>Insert a Markdown file at the current block.</p>
          </div>
          <button
            type="button"
            className="preferences-close-button"
            aria-label="Close Markdown import"
            disabled={isImporting}
            onMouseDown={preventFocusLoss}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <input
          ref={inputRef}
          className="markdown-import-input"
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          aria-label="Choose Markdown file"
          onChange={(event) => void importFiles(event.target.files)}
        />
        <button
          type="button"
          className={`markdown-import-dropzone${isDragging ? " is-dragging" : ""}`}
          disabled={isImporting}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) {
              setIsDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            void importFiles(event.dataTransfer.files);
          }}
        >
          <Upload aria-hidden="true" size={22} strokeWidth={1.8} />
          <strong>{isImporting ? "Importing…" : "Drop a .md file here"}</strong>
          <span>or click to choose a file</span>
        </button>
        {error && <p className="markdown-import-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
