import {
  size,
} from "@floating-ui/react";
import {
  Check,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  formatTrashTimestamp,
  getNoteDisplayTitle,
  getTrashPreviewLines,
} from "../model/notes.js";
import {
  PermanentDeleteIcon,
  PreviewNoteIcon,
  RestoreNoteIcon,
} from "./icons.jsx";

export function TrashPreferencesSection({
  trashedNotes = [],
  onRestoreNote,
  onPurgeNote,
}) {
  const [selectedTrashNoteIds, setSelectedTrashNoteIds] = useState(() => new Set());
  const [pendingPurgeNoteIds, setPendingPurgeNoteIds] = useState([]);
  const [previewTrashNoteId, setPreviewTrashNoteId] = useState(null);
  const visibleTrashedNotes = Array.isArray(trashedNotes) ? trashedNotes : [];
  const visibleTrashNoteIds = useMemo(
    () => visibleTrashedNotes.map((trashNote) => trashNote.id).filter(Boolean),
    [visibleTrashedNotes],
  );
  const selectedTrashNotes = useMemo(
    () => visibleTrashedNotes.filter((trashNote) => selectedTrashNoteIds.has(trashNote.id)),
    [selectedTrashNoteIds, visibleTrashedNotes],
  );
  const pendingPurgeNotes = useMemo(() => {
    const pendingIds = new Set(pendingPurgeNoteIds);
    return visibleTrashedNotes.filter((trashNote) => pendingIds.has(trashNote.id));
  }, [pendingPurgeNoteIds, visibleTrashedNotes]);
  const selectedCount = selectedTrashNotes.length;
  const selectedTrashNoteLabel = `${selectedCount} selected ${
    selectedCount === 1 ? "note" : "notes"
  }`;
  const allTrashNotesSelected =
    visibleTrashNoteIds.length > 0 && selectedCount === visibleTrashNoteIds.length;
  const someTrashNotesSelected = selectedCount > 0 && !allTrashNotesSelected;

  useEffect(() => {
    const visibleIds = new Set(visibleTrashNoteIds);
    if (previewTrashNoteId && !visibleIds.has(previewTrashNoteId)) {
      setPreviewTrashNoteId(null);
    }
    setSelectedTrashNoteIds((currentIds) => {
      const nextIds = new Set(
        [...currentIds].filter((noteId) => visibleIds.has(noteId)),
      );
      return nextIds.size === currentIds.size ? currentIds : nextIds;
    });
    setPendingPurgeNoteIds((currentIds) => {
      const nextIds = currentIds.filter((noteId) => visibleIds.has(noteId));
      return nextIds.length === currentIds.length ? currentIds : nextIds;
    });
  }, [previewTrashNoteId, visibleTrashNoteIds]);

  const toggleTrashNoteSelection = useCallback((noteId) => {
    setSelectedTrashNoteIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(noteId)) {
        nextIds.delete(noteId);
      } else {
        nextIds.add(noteId);
      }
      return nextIds;
    });
  }, []);

  const handleTrashRowKeyDown = useCallback(
    (event, noteId) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      toggleTrashNoteSelection(noteId);
    },
    [toggleTrashNoteSelection],
  );

  const setAllTrashNotesSelected = useCallback(
    (checked) => {
      setSelectedTrashNoteIds(checked ? new Set(visibleTrashNoteIds) : new Set());
    },
    [visibleTrashNoteIds],
  );

  const restoreSelectedTrashNotes = useCallback(async () => {
    const noteIds = selectedTrashNotes.map((trashNote) => trashNote.id);
    if (noteIds.length === 0) {
      return;
    }

    setSelectedTrashNoteIds((currentIds) => {
      const nextIds = new Set(currentIds);
      for (const noteId of noteIds) {
        nextIds.delete(noteId);
      }
      return nextIds;
    });
    for (const noteId of noteIds) {
      await onRestoreNote?.(noteId);
    }
  }, [onRestoreNote, selectedTrashNotes]);

  const confirmSelectedTrashPurge = useCallback(() => {
    if (selectedTrashNotes.length === 0) {
      return;
    }

    setPendingPurgeNoteIds(selectedTrashNotes.map((trashNote) => trashNote.id));
  }, [selectedTrashNotes]);

  const purgePendingTrashNotes = useCallback(async () => {
    const noteIds = pendingPurgeNotes.map((trashNote) => trashNote.id);
    if (noteIds.length === 0) {
      setPendingPurgeNoteIds([]);
      return;
    }

    setPendingPurgeNoteIds([]);
    setSelectedTrashNoteIds((currentIds) => {
      const nextIds = new Set(currentIds);
      for (const noteId of noteIds) {
        nextIds.delete(noteId);
      }
      return nextIds;
    });
    for (const noteId of noteIds) {
      await onPurgeNote?.(noteId);
    }
  }, [onPurgeNote, pendingPurgeNotes]);

  const confirmPurgeNote = pendingPurgeNotes.length === 1
    ? {
        ...pendingPurgeNotes[0],
        title: getNoteDisplayTitle(pendingPurgeNotes[0]),
      }
    : null;
  const confirmPurgeCount = pendingPurgeNotes.length;
  const confirmPurgeSummary = confirmPurgeNote
    ? confirmPurgeNote.title
    : `${confirmPurgeCount} selected notes`;
  const previewTrashNote = previewTrashNoteId
    ? visibleTrashedNotes.find((trashNote) => trashNote.id === previewTrashNoteId) ?? null
    : null;

  return (
    <section className="preferences-section preferences-trash-section">
      <div className="preferences-section-title">Trash</div>
      <div className="preferences-section-description">
        Deleted sessions are hidden from tabs and sticky windows until restored.
      </div>
      {visibleTrashedNotes.length === 0 ? (
        <div className="trash-empty-state" role="status">
          Trash is empty.
        </div>
      ) : (
        <>
          <div className="trash-selection-toolbar" aria-label="Trash selection actions">
            <TrashSelectionCheckbox
              ariaLabel="Select all trash notes"
              checked={allTrashNotesSelected}
              className="trash-select-all-control"
              indeterminate={someTrashNotesSelected}
              onChange={(event) => setAllTrashNotesSelected(event.target.checked)}
            >
              Select all
            </TrashSelectionCheckbox>
            <div className="trash-selection-status" aria-live="polite">
              {selectedCount} selected
            </div>
            <div className="trash-bulk-actions">
              <button
                type="button"
                className="trash-action-button"
                aria-label={
                  selectedCount > 0
                    ? `Restore ${selectedTrashNoteLabel}`
                    : "Restore selected notes"
                }
                disabled={selectedCount === 0}
                onMouseDown={preventFocusLoss}
                onClick={() => void restoreSelectedTrashNotes()}
              >
                <RestoreNoteIcon />
                <span>Restore selected</span>
              </button>
              <button
                type="button"
                className="trash-action-button trash-action-danger"
                aria-label={
                  selectedCount > 0
                    ? `Delete permanently ${selectedTrashNoteLabel}`
                    : "Delete selected notes permanently"
                }
                disabled={selectedCount === 0}
                onMouseDown={preventFocusLoss}
                onClick={confirmSelectedTrashPurge}
              >
                <PermanentDeleteIcon />
                <span>Delete selected</span>
              </button>
            </div>
          </div>
          <div className="trash-note-list" role="list" aria-label="Trash notes">
            {visibleTrashedNotes.map((trashNote) => {
              const title = getNoteDisplayTitle(trashNote);
              const selected = selectedTrashNoteIds.has(trashNote.id);
              return (
                <div
                  className={`trash-note-row${selected ? " is-selected" : ""}`}
                  role="listitem"
                  key={trashNote.id}
                  aria-selected={selected}
                  tabIndex={0}
                  onClick={() => toggleTrashNoteSelection(trashNote.id)}
                  onKeyDown={(event) => handleTrashRowKeyDown(event, trashNote.id)}
                >
                  <div className="trash-note-main">
                    <TrashSelectionCheckbox
                      ariaLabel={`Select ${title}`}
                      checked={selected}
                      onChange={() => toggleTrashNoteSelection(trashNote.id)}
                    />
                    <div className="trash-note-meta">
                      <div className="trash-note-title">{title}</div>
                      <div className="trash-note-date">
                        {formatTrashTimestamp(trashNote.trashedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="trash-note-row-actions">
                    <button
                      type="button"
                      className="trash-preview-button has-tooltip"
                      aria-label={`Preview ${title}`}
                      data-tooltip="Preview"
                      onMouseDown={(event) => {
                        preventFocusLoss(event);
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewTrashNoteId(trashNote.id);
                      }}
                    >
                      <PreviewNoteIcon />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {confirmPurgeCount > 0 && (
        <div
          className="trash-confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingPurgeNoteIds([]);
            }
          }}
        >
          <div
            className="trash-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Delete permanently confirmation"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div>
              <div className="trash-confirm-title">
                {confirmPurgeNote ? "Delete permanently?" : "Delete selected permanently?"}
              </div>
              <div className="trash-confirm-message">
                {confirmPurgeNote
                  ? "This note cannot be recovered after deletion."
                  : "These notes cannot be recovered after deletion."}
              </div>
              <div className="trash-confirm-note">{confirmPurgeSummary}</div>
            </div>
            <div className="trash-confirm-actions">
              <button
                type="button"
                className="trash-confirm-button"
                onMouseDown={preventFocusLoss}
                onClick={() => setPendingPurgeNoteIds([])}
              >
                Cancel
              </button>
              <button
                type="button"
                className="trash-confirm-button trash-confirm-danger"
                aria-label={
                  confirmPurgeNote
                    ? `Yes, permanently delete ${confirmPurgeNote.title}`
                    : `Yes, permanently delete ${confirmPurgeCount} selected notes`
                }
                onMouseDown={preventFocusLoss}
                onClick={() => void purgePendingTrashNotes()}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
      {previewTrashNote && (
        <TrashPreviewDialog
          note={previewTrashNote}
          onClose={() => setPreviewTrashNoteId(null)}
        />
      )}
    </section>
  );
}

export function TrashSelectionCheckbox({
  ariaLabel,
  checked,
  children = null,
  className = "",
  indeterminate = false,
  onChange,
}) {
  const inputRef = useRef(null);

  useLayoutEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <label
      className={`trash-selection-control ${className}`.trim()}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="checkbox"
        className="trash-selection-checkbox"
        aria-label={ariaLabel}
        checked={checked}
        onChange={onChange}
      />
      <span className="trash-selection-check" aria-hidden="true">
        {checked && <Check className="trash-selection-check-icon" size={13} strokeWidth={2.6} />}
      </span>
      {children && <span className="trash-selection-label">{children}</span>}
    </label>
  );
}

export function TrashPreviewDialog({ note, onClose }) {
  const noteTitle = getNoteDisplayTitle(note);
  const previewLines = useMemo(() => getTrashPreviewLines(note), [note]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  return (
    <div
      className="trash-confirm-backdrop trash-preview-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="trash-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Trash note preview"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="trash-preview-header">
          <div>
            <div className="trash-preview-kicker">Preview</div>
            <div className="trash-preview-title">{noteTitle}</div>
          </div>
          <button
            type="button"
            className="trash-preview-close-button"
            aria-label="Close preview"
            onMouseDown={preventFocusLoss}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="trash-preview-date">
          {formatTrashTimestamp(note.trashedAt)}
        </div>
        <div className="trash-preview-content" role="document" tabIndex={0}>
          {previewLines.length > 0 ? (
            previewLines.map((line, index) => (
              <p className="trash-preview-line" key={`${line}-${index}`}>
                {line}
              </p>
            ))
          ) : (
            <div className="trash-preview-empty">No text content in this note.</div>
          )}
        </div>
      </div>
    </div>
  );
}
