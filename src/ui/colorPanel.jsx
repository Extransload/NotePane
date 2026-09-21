import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  ColorSettingsSection,
} from "./preferencesSections.jsx";

export function ColorPanel({
  theme,
  variant = "sticky",
  defaultColor,
  onChange,
  onClose,
}) {
  const isStickyVariant = variant === "sticky";

  return (
    <div
      className="preferences-panel color-panel editor-floating-menu"
      role="dialog"
      aria-label={isStickyVariant ? "Sticky color panel" : "Session color panel"}
    >
      <div className="preferences-panel-header">
        <div>
          <div className="preferences-title">
            {isStickyVariant ? "Sticky color" : "Session color"}
          </div>
          <div className="preferences-subtitle">
            {isStickyVariant
              ? "Sticky background and tab color"
              : "Session tab background with automatic text contrast"}
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
      </div>
      <div className="preferences-panel-body">
        <ColorSettingsSection
          theme={theme}
          variant={variant}
          defaultColor={defaultColor}
          onChange={onChange}
        />
      </div>
    </div>
  );
}
