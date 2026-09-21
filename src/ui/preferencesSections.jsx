import {
  size,
} from "@floating-ui/react";
import {
  Copy,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_STICKY_ACCENT_COLOR,
  STICKY_PASTEL_PALETTE,
} from "../constants.js";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  getSessionShortcutRangeLabel,
  getShortcutLabel,
  isReservedKeyboardShortcut,
  keyboardShortcutFromEvent,
  normalizeKeyboardShortcutEnabled,
  normalizeKeyboardShortcuts,
} from "../model/keyboardShortcuts.js";
import {
  editorFontScaleToSize,
  editorFontSizeToScale,
  normalizeEditorFontFamily,
  normalizeEditorFontScale,
  normalizeEditorFontSize,
  normalizeEditorPreferences,
} from "../model/preferences.js";
import {
  formatColorValues,
  hexToHsv,
  hsvToHex,
  isHexColor,
  normalizeOpacity,
  parseColorValue,
  writeClipboardText,
} from "../style/colorMath.js";
import {
  resolveSessionTabAccentColor,
  resolveTabTextOpacity,
  resolveThemeAccentColor,
} from "../style/themeStyles.js";
import {
  ColorWheel,
} from "./ColorWheel.jsx";
import {
  PreferenceToggleSwitch,
} from "./controls.jsx";
import {
  EditorFontFamilyControl,
  EditorFontSizeControl,
} from "./EditorFontControls.jsx";
import {
  CopyValueIcon,
} from "./icons.jsx";

export function ColorSettingsSection({
  theme,
  variant = "tabs",
  defaultColor,
  onChange,
}) {
  const isStickyVariant = variant === "sticky";
  const activeColor = isStickyVariant
    ? resolveThemeAccentColor(theme, defaultColor ?? DEFAULT_STICKY_ACCENT_COLOR)
    : resolveSessionTabAccentColor(
        theme,
        defaultColor ?? DEFAULT_STICKY_ACCENT_COLOR,
      );
  const activeOpacity = resolveTabTextOpacity(theme);
  const valueAriaTarget = isStickyVariant ? "sticky color" : "session tab color";
  const hsv = useMemo(() => hexToHsv(activeColor), [activeColor]);
  const formattedValues = useMemo(
    () => formatColorValues(activeColor, activeOpacity),
    [activeColor, activeOpacity],
  );
  const [draftValues, setDraftValues] = useState(() =>
    Object.fromEntries(formattedValues.map((entry) => [entry.label, entry.value])),
  );

  useEffect(() => {
    setDraftValues(
      Object.fromEntries(formattedValues.map((entry) => [entry.label, entry.value])),
    );
  }, [formattedValues]);

  const updateTabTextColor = useCallback(
    (color) => {
      onChange({
        ...theme,
        tabTextColor: color,
      });
    },
    [onChange, theme],
  );

  const updateTabTextOpacity = useCallback(
    (opacity) => {
      onChange({
        ...theme,
        tabTextOpacity: normalizeOpacity(opacity),
      });
    },
    [onChange, theme],
  );

  const updateFromHsv = useCallback(
    (nextHsv) => {
      updateTabTextColor(hsvToHex(nextHsv.h, nextHsv.s, nextHsv.v));
    },
    [updateTabTextColor],
  );

  const copyValue = useCallback(async (value) => {
    await writeClipboardText(value);
  }, []);

  const applyColorValue = useCallback(
    (label, value) => {
      setDraftValues((currentValues) => ({
        ...currentValues,
        [label]: value,
      }));

      const parsedColor = parseColorValue(label, value);
      if (!parsedColor) {
        return;
      }

      updateTabTextColor(parsedColor);
    },
    [updateTabTextColor],
  );

  const pickScreenColor = useCallback(async () => {
    if (typeof window.EyeDropper !== "function") {
      return;
    }

    try {
      const result = await new window.EyeDropper().open();
      if (isHexColor(result?.sRGBHex)) {
        updateTabTextColor(result.sRGBHex.toLowerCase());
      }
    } catch {
      // User cancelled or the runtime rejected screen color picking.
    }
  }, [updateTabTextColor]);

  return (
    <section className="preferences-section color-settings-section">
      <div className="preferences-section-title">
        {isStickyVariant ? "Pastel sticky color" : "Sidebar tab background color"}
      </div>

      {isStickyVariant && (
        <div
          className="pastel-preset-row"
          role="group"
          aria-label="Pastel colors"
        >
          {STICKY_PASTEL_PALETTE.map((color, index) => (
            <button
              key={color}
              type="button"
              aria-label={`Pastel color ${index + 1}`}
              aria-pressed={activeColor === color}
              style={{ "--pastel-color": color }}
              onMouseDown={preventFocusLoss}
              onClick={() => updateTabTextColor(color)}
            />
          ))}
        </div>
      )}

      <ColorWheel
        hsv={hsv}
        ariaLabel={isStickyVariant ? "Sticky color" : "Session tab color"}
        onChange={(nextHsv) => updateFromHsv({ ...hsv, ...nextHsv })}
      />

      <label className="color-brightness-row">
        <span className="sr-only">Color brightness</span>
        <input
          aria-label="Color brightness"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={hsv.v}
          style={{
            "--brightness-color": hsvToHex(hsv.h, hsv.s, 1),
          }}
          onInput={(event) =>
            updateFromHsv({
              ...hsv,
              v: Number(event.currentTarget.value),
            })
          }
          onChange={(event) =>
            updateFromHsv({
              ...hsv,
              v: Number(event.target.value),
            })
          }
        />
      </label>

      <label className="color-opacity-row">
        <span>Opacity</span>
        <span>{Math.round(activeOpacity * 100)}%</span>
        <input
          aria-label="Color opacity"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={activeOpacity}
          style={{
            "--opacity-color": activeColor,
          }}
          onInput={(event) => updateTabTextOpacity(event.currentTarget.value)}
          onChange={(event) => updateTabTextOpacity(event.target.value)}
        />
      </label>

      <div className="color-action-row">
        <button
          type="button"
          aria-label="Eyedropper"
          disabled={typeof window.EyeDropper !== "function"}
          onMouseDown={preventFocusLoss}
          onClick={() => void pickScreenColor()}
        >
          Eyedropper
        </button>
      </div>

      <div className="color-value-list">
        {formattedValues.map((entry) => (
          <div className="color-value-row" key={entry.label}>
            <input
              aria-label={`${entry.label} ${valueAriaTarget} value`}
              value={draftValues[entry.label] ?? entry.value}
              spellCheck={false}
              onChange={(event) =>
                applyColorValue(entry.label, event.target.value)
              }
              onFocus={(event) => event.target.select()}
            />
            <button
              type="button"
              aria-label={`Copy ${entry.label}`}
              onMouseDown={preventFocusLoss}
              onClick={() => void copyValue(entry.value)}
            >
              <CopyValueIcon />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EditorPreferencesSection({
  editorPreferences,
  fontOptions,
  onEditorPreferencesChange,
}) {
  const normalizedEditorPreferences = normalizeEditorPreferences(editorPreferences);
  const [defaultFontSizeDraft, setDefaultFontSizeDraft] = useState(() =>
    String(editorFontScaleToSize(normalizedEditorPreferences.editorFontScale)),
  );

  useEffect(() => {
    setDefaultFontSizeDraft(
      String(editorFontScaleToSize(normalizedEditorPreferences.editorFontScale)),
    );
  }, [normalizedEditorPreferences.editorFontScale]);

  const updateEditorPreferenceFontScale = useCallback(
    (nextEditorFontScale) => {
      onEditorPreferencesChange?.({
        ...normalizedEditorPreferences,
        editorFontScale: normalizeEditorFontScale(nextEditorFontScale),
      });
    },
    [normalizedEditorPreferences, onEditorPreferencesChange],
  );

  const updateEditorPreferenceFontFamily = useCallback(
    (nextEditorFontFamily) => {
      onEditorPreferencesChange?.({
        ...normalizedEditorPreferences,
        editorFontFamily: normalizeEditorFontFamily(nextEditorFontFamily),
      });
    },
    [normalizedEditorPreferences, onEditorPreferencesChange],
  );

  const updateTableOfContentsVisibility = useCallback(
    (showTableOfContents) => {
      onEditorPreferencesChange?.({
        ...normalizedEditorPreferences,
        showTableOfContents: Boolean(showTableOfContents),
      });
    },
    [normalizedEditorPreferences, onEditorPreferencesChange],
  );

  const updateEditorPreferenceFontSize = useCallback(
    (nextEditorFontSize) => {
      const normalizedEditorFontSize = normalizeEditorFontSize(nextEditorFontSize);
      setDefaultFontSizeDraft(String(normalizedEditorFontSize));
      updateEditorPreferenceFontScale(
        editorFontSizeToScale(normalizedEditorFontSize),
      );
    },
    [updateEditorPreferenceFontScale],
  );

  const commitDefaultFontSizeDraft = useCallback(() => {
    updateEditorPreferenceFontSize(defaultFontSizeDraft);
  }, [defaultFontSizeDraft, updateEditorPreferenceFontSize]);

  return (
    <section className="preferences-section preferences-default-editor-section">
      <div className="preferences-section-title">Editor</div>
      <div className="preferences-section-description">
        Font family and size apply to every session tab.
      </div>
      <div className="preference-setting-row editor-font-family-setting">
        <div>
          <div className="preference-setting-title">Font family</div>
          <div className="preferences-section-description">
            Default editor typeface.
          </div>
        </div>
        <EditorFontFamilyControl
          className="preferences-font-family-control"
          fontFamily={normalizedEditorPreferences.editorFontFamily}
          fontOptions={fontOptions}
          onFontFamilyChange={updateEditorPreferenceFontFamily}
        />
      </div>
      <div className="preference-setting-row editor-font-size-setting">
        <div>
          <div className="preference-setting-title">Font size</div>
          <div className="preferences-section-description">
            Default editor text size.
          </div>
        </div>
        <EditorFontSizeControl
          className="preferences-font-size-control"
          draftValue={defaultFontSizeDraft}
          scale={normalizedEditorPreferences.editorFontScale}
          onDraftChange={setDefaultFontSizeDraft}
          onCommit={commitDefaultFontSizeDraft}
          onFontSizeChange={updateEditorPreferenceFontSize}
        />
      </div>
      <div className="preference-setting-row">
        <div>
          <div className="preference-setting-title">Table of contents</div>
          <div className="preferences-section-description">
            Show the right rail from heading levels in tab mode.
            Toggle it from View or {getShortcutLabel(
              normalizedEditorPreferences.keyboardShortcuts.toggleTableOfContents,
            )}.
          </div>
        </div>
        <PreferenceToggleSwitch
          checked={normalizedEditorPreferences.showTableOfContents}
          ariaLabel="Show table of contents"
          onChange={updateTableOfContentsVisibility}
        />
      </div>
    </section>
  );
}

export const PREFERENCE_SHORTCUT_COMMANDS = [
  { id: "newSession", label: "New session" },
  { id: "newNote", label: "New note" },
  { id: "selectTabByNumber", label: "Open tab by number", fixedShortcut: true },
  { id: "closeWindow", label: "Close window" },
  { id: "focusEditor", label: "Focus editor" },
  { id: "previousTab", label: "Previous tab" },
  { id: "nextTab", label: "Next tab" },
  { id: "moveTabLeft", label: "Move tab left" },
  { id: "moveTabRight", label: "Move tab right" },
  { id: "toggleSidebar", label: "Toggle sidebar" },
  { id: "toggleLayoutMode", label: "Toggle tabs / sticky" },
  { id: "toggleEditorWidth", label: "Toggle editor width" },
  { id: "toggleTableOfContents", label: "Toggle table of contents" },
  { id: "toggleThemeMode", label: "Toggle light / dark" },
  { id: "exportPdf", label: "Export PDF" },
  { id: "preferences", label: "Preferences" },
  { id: "increaseEditorFontSize", label: "Editor font up" },
  { id: "decreaseEditorFontSize", label: "Editor font down" },
  { id: "attachDetachedNote", label: "Dock detached note" },
  { id: "toggleAlwaysOnTop", label: "Toggle always on top" },
];

export function KeyboardShortcutsSection({
  keyboardShortcuts,
  keyboardShortcutEnabled,
  onKeyboardShortcutsChange,
  onKeyboardShortcutEnabledChange,
}) {
  const normalizedShortcuts = normalizeKeyboardShortcuts(keyboardShortcuts);
  const normalizedEnabled = normalizeKeyboardShortcutEnabled(
    keyboardShortcutEnabled,
  );
  const [recordingCommandId, setRecordingCommandId] = useState(null);
  const [shortcutError, setShortcutError] = useState("");

  const updateShortcut = useCallback(
    (commandId, nextShortcut) => {
      onKeyboardShortcutsChange?.({
        ...normalizedShortcuts,
        [commandId]: nextShortcut,
      });
    },
    [normalizedShortcuts, onKeyboardShortcutsChange],
  );

  const updateShortcutEnabled = useCallback(
    (command, nextEnabled) => {
      if (nextEnabled && !command.fixedShortcut) {
        const conflictCommand = PREFERENCE_SHORTCUT_COMMANDS.find(
          (candidate) =>
            candidate.id !== command.id &&
            !candidate.fixedShortcut &&
            normalizedEnabled[candidate.id] !== false &&
            normalizedShortcuts[candidate.id] === normalizedShortcuts[command.id],
        );
        if (conflictCommand) {
          setShortcutError(`Already used by ${conflictCommand.label}.`);
          return;
        }
      }

      onKeyboardShortcutEnabledChange?.({
        ...normalizedEnabled,
        [command.id]: nextEnabled,
      });
      setRecordingCommandId(null);
      setShortcutError("");
    },
    [
      normalizedEnabled,
      normalizedShortcuts,
      onKeyboardShortcutEnabledChange,
    ],
  );

  const resetShortcut = useCallback(
    (commandId) => {
      setShortcutError("");
      setRecordingCommandId(null);
      updateShortcut(commandId, DEFAULT_KEYBOARD_SHORTCUTS[commandId]);
    },
    [updateShortcut],
  );

  const recordShortcut = useCallback(
    (command, event) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecordingCommandId(null);
        setShortcutError("");
        return;
      }

      const capturedShortcut = keyboardShortcutFromEvent(event);
      if (!capturedShortcut) {
        setShortcutError("Use Command/Ctrl with a key.");
        return;
      }

      if (isReservedKeyboardShortcut(capturedShortcut)) {
        setShortcutError("Reserved for tab selection.");
        return;
      }

      const conflictCommand = PREFERENCE_SHORTCUT_COMMANDS.find(
        (candidate) =>
          candidate.id !== command.id &&
          !candidate.fixedShortcut &&
          normalizedEnabled[candidate.id] !== false &&
          normalizedShortcuts[candidate.id] === capturedShortcut,
      );
      if (conflictCommand) {
        setShortcutError(`Already used by ${conflictCommand.label}.`);
        return;
      }

      updateShortcut(command.id, capturedShortcut);
      setRecordingCommandId(null);
      setShortcutError("");
    },
    [normalizedEnabled, normalizedShortcuts, updateShortcut],
  );

  return (
    <section className="preferences-section preferences-shortcuts-section">
      <div className="preferences-section-title">Keyboard shortcuts</div>
      <div className="shortcut-list" role="list" aria-label="Keyboard shortcuts">
        {PREFERENCE_SHORTCUT_COMMANDS.map((command) => {
          const shortcut = normalizedShortcuts[command.id] ?? "";
          const isEnabled = normalizedEnabled[command.id] !== false;
          const isRecording = recordingCommandId === command.id;
          const isDefaultShortcut =
            shortcut === DEFAULT_KEYBOARD_SHORTCUTS[command.id];
          const shortcutLabel = command.fixedShortcut
            ? getSessionShortcutRangeLabel()
            : getShortcutLabel(shortcut);

          return (
            <div
              className="shortcut-row"
              role="listitem"
              key={command.id}
              data-recording={isRecording ? "true" : "false"}
              data-shortcut-enabled={isEnabled ? "true" : "false"}
            >
              <span className="shortcut-command-label">{command.label}</span>
              <PreferenceToggleSwitch
                checked={isEnabled}
                ariaLabel={`Enable ${command.label} shortcut`}
                onChange={(nextEnabled) =>
                  updateShortcutEnabled(command, nextEnabled)
                }
              />
              {command.fixedShortcut ? (
                <span className="shortcut-fixed-label">{shortcutLabel}</span>
              ) : (
                <button
                  type="button"
                  className="shortcut-recorder-button"
                  aria-label={`Shortcut for ${command.label}`}
                  aria-pressed={isRecording ? "true" : "false"}
                  onClick={() => {
                    setRecordingCommandId(command.id);
                    setShortcutError("");
                  }}
                  onKeyDown={(event) => {
                    if (isRecording) {
                      recordShortcut(command, event);
                    }
                  }}
                >
                  {isRecording ? "Recording" : shortcutLabel}
                </button>
              )}
              {command.fixedShortcut ? (
                <span className="shortcut-reset-spacer" aria-hidden="true" />
              ) : (
                <button
                  type="button"
                  className="shortcut-reset-button"
                  aria-label={`Reset ${command.label} shortcut`}
                  disabled={isDefaultShortcut}
                  onClick={() => resetShortcut(command.id)}
                >
                  Reset
                </button>
              )}
            </div>
          );
        })}
      </div>
      {shortcutError && (
        <div className="shortcut-error" role="status">
          {shortcutError}
        </div>
      )}
    </section>
  );
}
