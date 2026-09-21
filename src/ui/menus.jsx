import {
  Download,
  FileDown,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  getNoteDisplayTitle,
} from "../model/notes.js";
import {
  resolveSessionTabAccentColor,
} from "../style/themeStyles.js";

export function SessionTabContextMenu({
  x,
  y,
  sessionNote,
  onOpenColor,
}) {
  const colorPreview = resolveSessionTabAccentColor(sessionNote.theme);

  return (
    <div
      className="session-tab-context-menu editor-floating-menu"
      role="menu"
      aria-label={`Session options for ${getNoteDisplayTitle(sessionNote)}`}
      style={{
        "--session-tab-menu-x": `${x}px`,
        "--session-tab-menu-y": `${y}px`,
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        onMouseDown={preventFocusLoss}
        onClick={onOpenColor}
      >
        <span
          className="session-tab-menu-color-swatch"
          style={{ "--session-tab-menu-color": colorPreview }}
          aria-hidden="true"
        />
        <span>Color...</span>
      </button>
    </div>
  );
}

export function ExportFormatMenu({ x, y, onExport }) {
  return (
    <div
      className="export-format-menu editor-floating-menu"
      role="menu"
      aria-label="Export format"
      style={{
        "--export-format-menu-x": `${x}px`,
        "--export-format-menu-y": `${y}px`,
      }}
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

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isImporting) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isImporting, onClose]);

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
