import {
  Download,
  Info,
  Keyboard,
  Settings2,
  Trash2,
  Type,
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
  usePresenceContext,
} from "../hooks/usePresence.js";
import {
  normalizeKeyboardShortcutEnabled,
  normalizeKeyboardShortcuts,
} from "../model/keyboardShortcuts.js";
import {
  normalizeAppFontFamily,
  normalizeEditorPreferences,
} from "../model/preferences.js";
import {
  listBuiltInThemes,
} from "../style/themes.js";
import {
  AboutPreferencesSection,
} from "./aboutPreferences.jsx";
import {
  PreferencesCard,
} from "./PreferencesCard.jsx";
import {
  EditorPreferencesSection,
  KeyboardShortcutsSection,
} from "./preferencesSections.jsx";
import {
  ThemePicker,
} from "./ThemePicker.jsx";
import {
  TrashPreferencesSection,
} from "./trashPreferences.jsx";

const PICKER_THEMES = listBuiltInThemes();

export const PREFERENCE_PAGES = [
  { id: "general", label: "General", Icon: Settings2 },
  { id: "editor", label: "Editor", Icon: Type },
  { id: "trash", label: "Trash", Icon: Trash2 },
  { id: "shortcuts", label: "Shortcuts", Icon: Keyboard },
  { id: "about", label: "About", Icon: Info },
];

export function normalizePreferencePageId(pageId) {
  return PREFERENCE_PAGES.some((page) => page.id === pageId)
    ? pageId
    : "general";
}

/**
 * The Preferences window: a sidebar of pages on the left and the active page on the right, which
 * scrolls on its own. A page is its title and cards of settings (src/ui/PreferencesCard.jsx).
 */
export function PreferencesWindow({
  initialPage = "general",
  appThemeId,
  editorPreferences,
  keyboardShortcuts,
  appFontOptions,
  fontOptions,
  trashedNotes,
  onAppThemeChange,
  onEditorPreferencesChange,
  onExportBackup,
  onImportBackup,
  onRestoreTrashedNote,
  onPurgeTrashedNote,
  onClose,
}) {
  const { rootProps } = usePresenceContext();
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

  const activePageLabel = PREFERENCE_PAGES.find((page) => page.id === activePage).label;

  const renderActivePreferencePage = () => {
    if (activePage === "editor") {
      return (
        <EditorPreferencesSection
          editorPreferences={editorPreferences}
          fontOptions={fontOptions}
          appFontOptions={appFontOptions}
          onAppFontFamilyChange={updateAppFontFamily}
          onEditorPreferencesChange={onEditorPreferencesChange}
        />
      );
    }

    if (activePage === "trash") {
      return (
        <TrashPreferencesSection
          trashedNotes={trashedNotes}
          onRestoreNote={onRestoreTrashedNote}
          onPurgeNote={onPurgeTrashedNote}
        />
      );
    }

    if (activePage === "about") {
      return <AboutPreferencesSection />;
    }

    if (activePage === "shortcuts") {
      return (
        <KeyboardShortcutsSection
          keyboardShortcuts={keyboardShortcuts}
          keyboardShortcutEnabled={
            normalizedEditorPreferences.keyboardShortcutEnabled
          }
          onKeyboardShortcutsChange={updateKeyboardShortcuts}
          onKeyboardShortcutEnabledChange={updateKeyboardShortcutEnabled}
        />
      );
    }

    return (
      <>
        <PreferencesCard
          title="Appearance"
          description="How every NotePane window looks."
        >
          <div className="preference-setting-row app-theme-setting">
            <div>
              <div className="preference-setting-title">App theme</div>
              <div className="preferences-section-description">
                The theme applies to every window.
              </div>
            </div>
            <ThemePicker
              themeId={appThemeId}
              themes={PICKER_THEMES}
              onChange={onAppThemeChange}
            />
          </div>
        </PreferencesCard>
        <PreferencesCard
          title="Data"
          description="Every active note, Trash item and preference in one portable .notepane file, for NotePane on macOS and Windows."
        >
          <div className="preference-setting-row preference-backup-row">
            <div>
              <div className="preference-setting-title">Workspace backup</div>
              <div className="preferences-section-description">
                Save the whole workspace to a file.
              </div>
            </div>
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
          </div>
          <div className="preference-setting-row preference-backup-row">
            <div>
              <div className="preference-setting-title">Restore a backup</div>
              <div className="preferences-section-description">
                Import replaces the current workspace after making an automatic safety backup.
              </div>
            </div>
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
        </PreferencesCard>
      </>
    );
  };

  return (
    <div
      {...rootProps}
      className="preferences-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="preferences-window is-two-pane"
        role="dialog"
        aria-modal="true"
        aria-label="Preferences window"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <nav
          className="preferences-window-sidebar"
          aria-label="Preferences pages"
          role="tablist"
        >
          <div className="preferences-window-title">Preferences</div>
          {PREFERENCE_PAGES.map(({ id, label, Icon }) => (
            <button
              id={`preferences-tab-${id}`}
              key={id}
              type="button"
              role="tab"
              aria-selected={activePage === id}
              aria-controls={`preferences-${id}`}
              onMouseDown={preventFocusLoss}
              onClick={() => setActivePage(id)}
            >
              <Icon className="preferences-tab-icon" size={15} strokeWidth={2} aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <section
          id={`preferences-${activePage}`}
          className="preferences-window-content preferences-window-section"
          role="tabpanel"
          aria-labelledby={`preferences-tab-${activePage}`}
        >
          <header className="preferences-page-header">
            <h2 className="preferences-section-title preferences-page-title">{activePageLabel}</h2>
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
          <div className="preferences-page-body">
            {renderActivePreferencePage()}
          </div>
        </section>
      </div>
    </div>
  );
}
