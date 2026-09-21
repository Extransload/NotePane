import {
  ArrowLeftRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  formatShortcutTooltip,
} from "../model/keyboardShortcuts.js";
import {
  ExportPdfIcon,
  PaletteIcon,
  PinIcon,
  SettingsIcon,
  TrashSidebarIcon,
} from "./icons.jsx";

export function HeaderModeSwitch({ mode, shortcut, onChange }) {
  const isDark = mode === "dark";
  return (
    <button
      type="button"
      className="header-mode-switch has-tooltip"
      role="switch"
      aria-label="Theme mode"
      aria-checked={isDark}
      data-tooltip={formatShortcutTooltip(
        isDark ? "Light mode" : "Dark mode",
        shortcut,
      )}
      onMouseDown={preventFocusLoss}
      onClick={() => onChange(isDark ? "light" : "dark")}
    >
      <span className="theme-mode-switch-track" aria-hidden="true">
        <span className="theme-mode-switch-icon sun">☀</span>
        <span className="theme-mode-switch-icon moon">☾</span>
        <span className="theme-mode-switch-thumb" />
      </span>
    </button>
  );
}

export function PreferenceToggleSwitch({ checked, ariaLabel, onChange }) {
  return (
    <button
      type="button"
      className="preference-toggle-switch"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked ? "true" : "false"}
      onMouseDown={preventFocusLoss}
      onClick={() => onChange?.(!checked)}
    >
      <span aria-hidden="true">{checked ? "On" : "Off"}</span>
    </button>
  );
}

export function PreferencesButton({ shortcut, onClick }) {
  return (
    <button
      type="button"
      className="preferences-icon-button settings-icon-button has-tooltip"
      aria-label="Preferences"
      data-tooltip={formatShortcutTooltip("Preferences", shortcut)}
      onMouseDown={preventFocusLoss}
      onClick={onClick}
    >
      <SettingsIcon />
    </button>
  );
}

export function TrashButton({ onClick }) {
  return (
    <button
      type="button"
      className="trash-icon-button preferences-icon-button has-tooltip"
      aria-label="Trash"
      data-tooltip="Trash"
      onMouseDown={preventFocusLoss}
      onClick={onClick}
    >
      <TrashSidebarIcon />
    </button>
  );
}

export function ExportPdfButton({ shortcut, onClick }) {
  return (
    <button
      type="button"
      className="export-icon-button preferences-icon-button has-tooltip"
      aria-label="Export"
      data-tooltip={formatShortcutTooltip("Export", shortcut)}
      onMouseDown={preventFocusLoss}
      onClick={onClick}
    >
      <ExportPdfIcon />
    </button>
  );
}

export function StickyPinButton({ isPinned = false, shortcut, onClick }) {
  return (
    <button
      type="button"
      className="sticky-pin-button has-tooltip"
      aria-label={isPinned ? "Unpin window" : "Pin window"}
      aria-pressed={isPinned}
      data-tooltip={formatShortcutTooltip(
        isPinned ? "Unpin window" : "Pin window",
        shortcut,
      )}
      onMouseDown={preventFocusLoss}
      onClick={onClick}
    >
      <PinIcon pinned={isPinned} />
    </button>
  );
}

export function StickySettingsButton({ active = false, onClick }) {
  return (
    <button
      type="button"
      className="preferences-icon-button sticky-settings-button has-tooltip"
      aria-label="Sticky settings"
      aria-pressed={active}
      data-tooltip="Sticky settings"
      onMouseDown={preventFocusLoss}
      onClick={onClick}
    >
      <PaletteIcon />
    </button>
  );
}

export function StickyTrashButton({ onClick }) {
  return (
    <button
      type="button"
      className="sticky-trash-button has-tooltip"
      aria-label="Move note to trash"
      data-tooltip="Move note to trash"
      onMouseDown={preventFocusLoss}
      onClick={onClick}
    >
      <TrashSidebarIcon />
    </button>
  );
}

export function LayoutModeSwitch({ mode, compact = false, shortcut, onChange }) {
  const isSticky = mode === "sticky";
  const targetMode = isSticky ? "tabs" : "sticky";
  const targetModeLabel =
    targetMode === "tabs" ? "Tab sessions mode" : "Sticky windows mode";
  const actionLabel = `Switch to ${targetModeLabel}`;
  return (
    <button
      type="button"
      className={`layout-mode-button layout-mode-button-transition${compact ? " is-compact-mode-button" : ""} has-tooltip`}
      aria-label={actionLabel}
      aria-pressed={isSticky}
      data-layout-mode-target={targetMode}
      data-tooltip={formatShortcutTooltip(actionLabel, shortcut)}
      onMouseDown={preventFocusLoss}
      onClick={onChange}
    >
      <ArrowLeftRight
        className="notepane-action-icon notepane-mode-switch-icon"
        data-icon-family="system-symbol"
        data-icon-pack="lucide"
        data-icon-tone={targetMode}
        data-icon-layout={compact ? "compact" : "expanded"}
        aria-hidden="true"
      />
    </button>
  );
}

export function EditorWidthSwitch({ wide = false, shortcut, onChange }) {
  const actionLabel = wide ? "Use reading width" : "Use wide editor";
  const Icon = wide ? Minimize2 : Maximize2;

  return (
    <button
      type="button"
      className="editor-width-button has-tooltip"
      aria-label={actionLabel}
      aria-pressed={wide}
      data-tooltip={formatShortcutTooltip(actionLabel, shortcut)}
      onMouseDown={preventFocusLoss}
      onClick={onChange}
    >
      <Icon
        className="notepane-action-icon notepane-editor-width-icon"
        data-icon-family="system-symbol"
        data-icon-pack="lucide"
        data-icon-tone="editor-width"
        aria-hidden="true"
      />
    </button>
  );
}
