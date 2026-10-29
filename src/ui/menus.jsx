import {
  CopyPlus,
  Download,
  FileDown,
  PanelTopOpen,
  PencilLine,
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
 * works with its real size.
 */
function useAnchoredMenuStyle(menuRef, { left, top, width = 0, height = 0 }, align = "start") {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) {
      return;
    }
    const size = menu.getBoundingClientRect();
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
      <span>{children}</span>
    </button>
  );
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

export function SessionTabContextMenu({
  x,
  y,
  sessionNote,
  activeTheme,
  canOpenAsSticky = false,
  onRename,
  onDuplicate,
  onOpenAsSticky,
  onOpenColor,
  onMoveToTrash,
}) {
  const menuRef = useRef(null);
  const { rootProps } = usePresenceContext();
  const rootRef = useMergedRefs(menuRef, rootProps.ref);
  const position = useAnchoredMenuStyle(menuRef, { left: x, top: y });
  const storedColor = resolveSessionTabAccentColor(sessionNote.theme);
  const colorPreview = storedColor ? toneMatch(storedColor, activeTheme, "mark") : undefined;

  return (
    <div
      {...rootProps}
      ref={rootRef}
      className="session-tab-context-menu editor-floating-menu"
      role="menu"
      aria-label={`Session options for ${getNoteDisplayTitle(sessionNote)}`}
      style={position}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={moveMenuFocus}
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
      <MenuItem
        icon={
          <span
            className="session-tab-menu-color-swatch"
            style={{ "--session-tab-menu-color": colorPreview }}
            aria-hidden="true"
          />
        }
        onSelect={onOpenColor}
      >
        Color...
      </MenuItem>
      <div className="session-tab-menu-separator" role="separator" />
      <MenuItem
        icon={<Trash2 {...MENU_ICON_PROPS} />}
        tone="danger"
        onSelect={onMoveToTrash}
      >
        Move to Trash
      </MenuItem>
    </div>
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

export function ExportFormatMenu({ anchor, onExport }) {
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
