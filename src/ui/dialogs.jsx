import {
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  normalizeTitle,
} from "../model/notes.js";
import {
  ColorSettingsSection,
} from "./preferencesSections.jsx";

export function StickySettingsWindow({
  noteTitle,
  theme,
  defaultColor,
  onThemeChange,
  onClose,
}) {
  return (
    <div
      className="preferences-backdrop sticky-settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="preferences-window sticky-settings-window"
        role="dialog"
        aria-modal="true"
        aria-label="Sticky settings window"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="preferences-window-header">
          <div>
            <div className="preferences-window-title">Sticky settings</div>
            <div className="preferences-window-subtitle">
              {normalizeTitle(noteTitle)}
            </div>
          </div>
          <button
            type="button"
            className="preferences-close-button"
            aria-label="Close preferences"
            onMouseDown={preventFocusLoss}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="sticky-settings-content">
          <section className="preferences-section preferences-window-section">
            <div className="preferences-section-title">Appearance</div>
            <ColorSettingsSection
              theme={theme}
              variant="sticky"
              defaultColor={defaultColor}
              onChange={onThemeChange}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

export function StickyTrashConfirmDialog({
  noteTitle,
  onCancel,
  onConfirm,
}) {
  return (
    <MoveToTrashConfirmDialog
      noteTitle={noteTitle}
      ariaLabel="Move note to trash confirmation"
      title="Move note to trash?"
      message="This is different from closing a sticky window. The note will be hidden from tabs and sticky windows until restored from Trash."
      yesAriaLabelPrefix="Yes, move"
      backdropClassName="sticky-trash-confirm-backdrop"
      dialogClassName="sticky-trash-confirm-dialog"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function SessionTrashConfirmDialog({
  noteTitle,
  onCancel,
  onConfirm,
}) {
  return (
    <MoveToTrashConfirmDialog
      noteTitle={noteTitle}
      ariaLabel="Move session to trash confirmation"
      title="Move session to Trash?"
      message="This session will move to Trash. You can restore it from Trash or undo immediately."
      yesAriaLabelPrefix="Yes, move"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function SessionCloseConfirmDialog({
  noteTitle,
  onCancel,
  onConfirm,
}) {
  return (
    <MoveToTrashConfirmDialog
      noteTitle={noteTitle}
      ariaLabel="Close tab confirmation"
      title="Close this tab?"
      message="This tab contains content. Close it?"
      yesAriaLabelPrefix="Yes, close"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

export function MoveToTrashConfirmDialog({
  noteTitle,
  ariaLabel,
  title,
  message,
  yesAriaLabelPrefix,
  backdropClassName = "",
  dialogClassName = "",
  onCancel,
  onConfirm,
}) {
  const normalizedNoteTitle = normalizeTitle(noteTitle);
  const confirmButtonRef = useRef(null);
  const hasConfirmedRef = useRef(false);

  const confirmOnce = useCallback(() => {
    if (hasConfirmedRef.current) {
      return;
    }
    hasConfirmedRef.current = true;
    onConfirm();
  }, [onConfirm]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      confirmButtonRef.current?.focus();
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape" && event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        onCancel();
        return;
      }

      confirmOnce();
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [confirmOnce, onCancel]);

  return (
    <div
      className={`trash-confirm-backdrop ${backdropClassName}`.trim()}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className={`trash-confirm-dialog ${dialogClassName}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          <div className="trash-confirm-title">{title}</div>
          <div className="trash-confirm-message">
            {message}
          </div>
          <div className="trash-confirm-note">{normalizedNoteTitle}</div>
        </div>
        <div className="trash-confirm-actions">
          <button
            type="button"
            className="trash-confirm-button"
            onMouseDown={preventFocusLoss}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="trash-confirm-button trash-confirm-danger"
            aria-label={`${yesAriaLabelPrefix} ${normalizedNoteTitle} to trash`}
            ref={confirmButtonRef}
            onMouseDown={preventFocusLoss}
            onClick={confirmOnce}
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
