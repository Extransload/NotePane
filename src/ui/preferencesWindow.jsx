import {
  Download,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  isKeyboardShortcutEnabled,
  normalizeKeyboardShortcutEnabled,
  normalizeKeyboardShortcuts,
} from "../model/keyboardShortcuts.js";
import {
  normalizeAppFontFamily,
  normalizeEditorPreferences,
} from "../model/preferences.js";
import {
  HeaderModeSwitch,
} from "./controls.jsx";
import {
  EditorFontFamilyControl,
} from "./EditorFontControls.jsx";
import {
  EditorPreferencesSection,
  KeyboardShortcutsSection,
} from "./preferencesSections.jsx";
import {
  TrashPreferencesSection,
} from "./trashPreferences.jsx";

export const PREFERENCE_PAGES = [
  { id: "general", label: "General" },
  { id: "editor", label: "Editor" },
  { id: "trash", label: "Trash" },
  { id: "shortcuts", label: "Shortcuts" },
];

export function normalizePreferencePageId(pageId) {
  return PREFERENCE_PAGES.some((page) => page.id === pageId)
    ? pageId
    : "general";
}

export function PreferencesWindow({
  initialPage = "general",
  appThemeMode,
  editorPreferences,
  keyboardShortcuts,
  appFontOptions,
  fontOptions,
  trashedNotes,
  onAppThemeModeChange,
  onEditorPreferencesChange,
  onExportBackup,
  onImportBackup,
  onRestoreTrashedNote,
  onPurgeTrashedNote,
  onClose,
}) {
  const [activePage, setActivePage] = useState(() =>
    normalizePreferencePageId(initialPage),
  );
  const [backupOperation, setBackupOperation] = useState(null);

  useEffect(() => {
    setActivePage(normalizePreferencePageId(initialPage));
  }, [initialPage]);

  const normalizedEditorPreferences = useMemo(
    () => normalizeEditorPreferences(editorPreferences),
    [editorPreferences],
  );

  const updateAppFontFamily = useCallback(
    (nextAppFontFamily) => {
      onEditorPreferencesChange?.({
        ...normalizedEditorPreferences,
        appFontFamily: normalizeAppFontFamily(nextAppFontFamily),
      });
    },
    [normalizedEditorPreferences, onEditorPreferencesChange],
  );

  const updateKeyboardShortcuts = useCallback(
    (nextKeyboardShortcuts) => {
      onEditorPreferencesChange?.({
        ...normalizedEditorPreferences,
        keyboardShortcuts: normalizeKeyboardShortcuts(nextKeyboardShortcuts),
      });
    },
    [normalizedEditorPreferences, onEditorPreferencesChange],
  );

  const updateKeyboardShortcutEnabled = useCallback(
    (nextKeyboardShortcutEnabled) => {
      onEditorPreferencesChange?.({
        ...normalizedEditorPreferences,
        keyboardShortcutEnabled: normalizeKeyboardShortcutEnabled(
          nextKeyboardShortcutEnabled,
        ),
      });
    },
    [normalizedEditorPreferences, onEditorPreferencesChange],
  );

  const runBackupOperation = useCallback(async (operation, callback) => {
    if (backupOperation) {
      return;
    }
    setBackupOperation(operation);
    try {
      await callback?.();
    } finally {
      setBackupOperation(null);
    }
  }, [backupOperation]);

  const renderActivePreferencePage = () => {
    if (activePage === "editor") {
      return (
        <div
          id="preferences-editor"
          className="preferences-window-section"
          role="tabpanel"
          aria-labelledby="preferences-tab-editor"
        >
          <EditorPreferencesSection
            editorPreferences={editorPreferences}
            fontOptions={fontOptions}
            onEditorPreferencesChange={onEditorPreferencesChange}
          />
        </div>
      );
    }

    if (activePage === "trash") {
      return (
        <div
          id="preferences-trash"
          className="preferences-window-section"
          role="tabpanel"
          aria-labelledby="preferences-tab-trash"
        >
          <TrashPreferencesSection
            trashedNotes={trashedNotes}
            onRestoreNote={onRestoreTrashedNote}
            onPurgeNote={onPurgeTrashedNote}
          />
        </div>
      );
    }

    if (activePage === "shortcuts") {
      return (
        <div
          id="preferences-shortcuts"
          className="preferences-window-section"
          role="tabpanel"
          aria-labelledby="preferences-tab-shortcuts"
        >
          <KeyboardShortcutsSection
            keyboardShortcuts={keyboardShortcuts}
            keyboardShortcutEnabled={
              normalizedEditorPreferences.keyboardShortcutEnabled
            }
            onKeyboardShortcutsChange={updateKeyboardShortcuts}
            onKeyboardShortcutEnabledChange={updateKeyboardShortcutEnabled}
          />
        </div>
      );
    }

    return (
      <section
        id="preferences-general"
        className="preferences-section preferences-window-section"
        role="tabpanel"
        aria-labelledby="preferences-tab-general"
      >
        <div className="preferences-section-title">General</div>
        <div className="preference-setting-row">
          <div>
            <div className="preference-setting-title">App theme</div>
            <div className="preferences-section-description">
              Light and dark mode are global for the whole app.
            </div>
          </div>
          <HeaderModeSwitch
            mode={appThemeMode}
            shortcut={
              isKeyboardShortcutEnabled(
                normalizedEditorPreferences.keyboardShortcutEnabled,
                "toggleThemeMode",
              )
                ? keyboardShortcuts.toggleThemeMode
                : ""
            }
            onChange={onAppThemeModeChange}
          />
        </div>
        <div className="preference-setting-row app-font-family-setting">
          <div>
            <div className="preference-setting-title">App font</div>
            <div className="preferences-section-description">
              Interface typeface for chrome, menus, and preferences.
            </div>
          </div>
          <EditorFontFamilyControl
            className="preferences-font-family-control"
            fontFamily={normalizedEditorPreferences.appFontFamily}
            fontOptions={appFontOptions}
            inputAriaLabel="App font family"
            menuButtonAriaLabel="Open app font menu"
            optionsAriaLabel="App font family options"
            onFontFamilyChange={updateAppFontFamily}
          />
        </div>
        <div className="preferences-data-section">
          <div className="preferences-section-title">Data</div>
          <div className="preferences-section-description">
            Save every active note, Trash item, and app preference in one portable
            .notepane file. Backups work across NotePane for macOS and Windows.
          </div>
          <div className="preference-setting-row preference-backup-row">
            <div>
              <div className="preference-setting-title">Workspace backup</div>
              <div className="preferences-section-description">
                Import replaces the current workspace after making an automatic
                safety backup.
              </div>
            </div>
            <div className="preference-backup-actions">
              <button
                type="button"
                className="preference-data-button"
                disabled={Boolean(backupOperation)}
                onMouseDown={preventFocusLoss}
                onClick={() => void runBackupOperation("export", onExportBackup)}
              >
                <Download size={13} aria-hidden="true" />
                {backupOperation === "export" ? "Exporting..." : "Export backup"}
              </button>
              <button
                type="button"
                className="preference-data-button preference-data-button-import"
                disabled={Boolean(backupOperation)}
                onMouseDown={preventFocusLoss}
                onClick={() => void runBackupOperation("import", onImportBackup)}
              >
                <Upload size={13} aria-hidden="true" />
                {backupOperation === "import" ? "Importing..." : "Import backup"}
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div
      className="preferences-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="preferences-window"
        role="dialog"
        aria-modal="true"
        aria-label="Preferences window"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="preferences-window-header">
          <div>
            <div className="preferences-window-title">Preferences</div>
            <div className="preferences-window-subtitle">
              App theme, editor typography, trash, and keyboard commands.
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
        <div className="preferences-window-body">
          <nav
            className="preferences-window-sidebar"
            aria-label="Preferences pages"
            role="tablist"
          >
            {PREFERENCE_PAGES.map((page) => (
              <button
                id={`preferences-tab-${page.id}`}
                key={page.id}
                type="button"
                role="tab"
                aria-selected={activePage === page.id}
                aria-controls={`preferences-${page.id}`}
                onMouseDown={preventFocusLoss}
                onClick={() => setActivePage(page.id)}
              >
                {page.label}
              </button>
            ))}
          </nav>
          <div className="preferences-window-content">
            {renderActivePreferencePage()}
          </div>
        </div>
      </div>
    </div>
  );
}
