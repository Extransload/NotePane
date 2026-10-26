import {
  BlockNoteView,
} from "@blocknote/mantine";
import {
  useCreateBlockNote,
} from "@blocknote/react";
import {
  TableOfContents as TableOfContentsIcon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createPortal,
} from "react-dom";
import {
  APP_ZOOM_LEVELS,
  DEFAULT_APP_ZOOM,
} from "../constants.js";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  EMPTY_BLOCKS,
  schema,
} from "../editor/schema.jsx";
import {
  parseBlocksJSON,
} from "../model/notes.js";
import {
  normalizeLayoutMode,
} from "../model/preferences.js";

export function StickyToast({ toast }) {
  return (
    <div
      className={`sticky-toast sticky-toast-${toast.tone}`}
      role="status"
      aria-live="polite"
    >
      <span className="sticky-toast-message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="sticky-toast-action"
          onMouseDown={preventFocusLoss}
          onClick={toast.action.onClick}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

// Shown while Cmd/Ctrl+=, - or 0 zooms the app: where the zoom sits between the smallest and the
// largest step. Each step is the same distance along the track, so 100% is marked in the middle.
export function AppZoomGauge({ zoom }) {
  const lastStep = APP_ZOOM_LEVELS.length - 1;
  const percent = Math.round(zoom * 100);

  return (
    <div className="app-zoom-gauge" role="status" aria-live="polite">
      <ZoomOut className="app-zoom-gauge-icon" aria-hidden="true" />
      <div
        className="app-zoom-gauge-track"
        role="meter"
        aria-label="Zoom"
        aria-valuemin={Math.round(APP_ZOOM_LEVELS[0] * 100)}
        aria-valuemax={Math.round(APP_ZOOM_LEVELS[lastStep] * 100)}
        aria-valuenow={percent}
        aria-valuetext={`${percent}%`}
        style={{
          "--app-zoom-position": APP_ZOOM_LEVELS.indexOf(zoom) / lastStep,
          "--app-zoom-default-position": APP_ZOOM_LEVELS.indexOf(DEFAULT_APP_ZOOM) / lastStep,
        }}
      >
        <span className="app-zoom-gauge-fill" />
        <span className="app-zoom-gauge-default" />
        <span className="app-zoom-gauge-thumb" />
      </div>
      <ZoomIn className="app-zoom-gauge-icon" aria-hidden="true" />
      <span className="app-zoom-gauge-value">{percent}%</span>
    </div>
  );
}

export function VersionHistoryPanel({ versions, isBusy, scheme, onClose, onRestore }) {
  const [selectedVersionId, setSelectedVersionId] = useState(versions[0]?.id ?? null);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0];
  const previewContent = useMemo(
    () => parseBlocksJSON(selectedVersion?.blocksJSON) ?? EMPTY_BLOCKS,
    [selectedVersion],
  );
  const previewEditor = useCreateBlockNote({
    schema,
    initialContent: previewContent,
  });

  useEffect(() => {
    if (!selectedVersion) return;
    previewEditor.replaceBlocks(previewEditor.document, previewContent);
  }, [previewContent, previewEditor, selectedVersion]);

  return createPortal(
    <div className="version-history-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="version-history-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-history-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="version-history-header">
          <h2 id="version-history-title">Version history</h2>
          <button
            type="button"
            aria-label="Close version history"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >×</button>
        </div>
        <div className="version-history-body">
          <div className="version-history-preview" aria-label="Version preview">
            {selectedVersion ? (
              <BlockNoteView
                editor={previewEditor}
                editable={false}
                theme={scheme}
                formattingToolbar={false}
                sideMenu={false}
                slashMenu={false}
              />
            ) : (
              <p className="version-history-empty">No saved versions yet.</p>
            )}
          </div>
          <div className="version-history-list">
            {versions.length === 0 && <p className="version-history-empty">No saved versions yet.</p>}
            {versions.map((version) => (
              <button
                type="button"
                className={`version-history-item${version.id === selectedVersion?.id ? " is-selected" : ""}`}
                key={version.id}
                onClick={() => setSelectedVersionId(version.id)}
              >
                <time dateTime={new Date(version.createdAt).toISOString()}>
                  {new Date(version.createdAt).toLocaleString()}
                </time>
                <span className={`version-history-source version-history-source-${version.source ?? "auto"}`}>
                  {version.source === "manual"
                    ? "Saved manually"
                    : version.source === "restore"
                      ? "Before restore"
                      : "Auto-saved"}
                </span>
              </button>
            ))}
          </div>
        </div>
        {selectedVersion && (
          <div className="version-history-footer">
            <button type="button" disabled={isBusy} onClick={() => onRestore(selectedVersion)}>
              {isBusy ? "Restoring..." : "Restore this version"}
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

export function LayoutTransitionOverlay({ transition }) {
  const targetMode = normalizeLayoutMode(transition?.targetMode);
  const noteCount = Number.isFinite(transition?.noteCount)
    ? Math.max(0, transition.noteCount)
    : 0;
  const isStickyTarget = targetMode === "sticky";
  const title = isStickyTarget ? "Opening sticky windows" : "Switching to tabs";
  const detail = isStickyTarget
    ? `Preparing ${noteCount || "your"} sticky ${noteCount === 1 ? "window" : "windows"}...`
    : "Collecting notes into tabs...";

  return (
    <div
      className="layout-transition-overlay"
      data-testid="layout-transition-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="layout-transition-panel">
        <span className="layout-transition-spinner" aria-hidden="true" />
        <span className="layout-transition-copy">
          <strong>{title}</strong>
          <span>{detail}</span>
        </span>
      </div>
    </div>
  );
}

export function TableOfContentsRail({ entries, activeEntryIds, onSelectEntry }) {
  return (
    <nav
      className="editor-table-of-contents"
      data-testid="editor-toc"
      aria-label="Table of contents"
    >
      <div className="editor-toc-header">
        <TableOfContentsIcon
          className="notepane-action-icon notepane-icon-toc"
          data-icon-tone="sidebar"
        />
        <span>Contents</span>
      </div>
      <div className="editor-toc-list" role="list">
        {entries.map((entry) => (
          <div className="editor-toc-item" role="listitem" key={entry.id}>
            <button
              type="button"
              className="editor-toc-entry"
              data-heading-level={entry.level}
              data-active={activeEntryIds.includes(entry.id) ? "true" : undefined}
              aria-current={activeEntryIds.includes(entry.id) ? "location" : undefined}
              style={{ "--toc-indent": `${(entry.level - 1) * 10}px` }}
              aria-label={`Jump to ${entry.title}, heading level ${entry.level}`}
              onMouseDown={preventFocusLoss}
              onClick={() => onSelectEntry(entry)}
            >
              {entry.title}
            </button>
          </div>
        ))}
      </div>
    </nav>
  );
}
