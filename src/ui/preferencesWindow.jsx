import {
  AppWindow,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Info,
  Keyboard,
  Search,
  SlidersHorizontal,
  Sun,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  version as PACKAGE_VERSION,
} from "../../package.json";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  usePresenceContext,
} from "../hooks/usePresence.js";
import {
  hasPlatformModifier,
  isShortcutRecorderTarget,
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
  BackgroundLookPage,
  FontsLookPage,
  TabsLookPage,
  ThemeLookPage,
} from "./lookPreferences.jsx";
import {
  EditorPreferencesSection,
  KeyboardShortcutsSection,
  PREFERENCE_SHORTCUT_COMMANDS,
} from "./preferencesSections.jsx";
import {
  SettingRow,
  SettingsGroup,
} from "./settingsControls.jsx";
import {
  TrashPreferencesSection,
} from "./trashPreferences.jsx";

const PICKER_THEMES = listBuiltInThemes();

// The sidebar's groups, in order. A group heading only labels its pages; it is not a tab.
export const PREFERENCE_PAGE_GROUPS = [
  {
    label: "App",
    pages: [{ id: "editor", label: "Editor", Icon: FileText }],
  },
  {
    label: "Look",
    pages: [
      { id: "theme", label: "Theme", Icon: Sun },
      { id: "fonts", label: "Fonts", Icon: Type },
      { id: "background", label: "Background", Icon: ImageIcon },
      { id: "tabs", label: "Tabs", Icon: AppWindow },
    ],
  },
  {
    label: "Data",
    pages: [
      { id: "trash", label: "Trash", Icon: Trash2 },
      { id: "backup", label: "Backup", Icon: Download },
    ],
  },
  {
    label: "System",
    pages: [
      { id: "shortcuts", label: "Shortcuts", Icon: Keyboard },
      { id: "about", label: "About", Icon: Info },
    ],
  },
];

export const PREFERENCE_PAGES = PREFERENCE_PAGE_GROUPS.flatMap(({ label, pages }) =>
  pages.map((page) => ({ ...page, group: label })),
);

const DEFAULT_PREFERENCE_PAGE_ID = "theme";

// Pages that were merged into others keep opening where their settings went: the app theme left
// General for Theme, and Surfaces became the Window group of Background.
const RENAMED_PREFERENCE_PAGES = {
  general: "theme",
  surfaces: "background",
};

export function normalizePreferencePageId(pageId) {
  const renamedPageId = RENAMED_PREFERENCE_PAGES[pageId] ?? pageId;
  return PREFERENCE_PAGES.some((page) => page.id === renamedPageId)
    ? renamedPageId
    : DEFAULT_PREFERENCE_PAGE_ID;
}

function getPreferencePage(pageId) {
  return PREFERENCE_PAGES.find((page) => page.id === pageId);
}

/**
 * Every setting the search field can find. `id` is the row's `data-setting-id`; rows this window
 * does not render itself (Editor, Trash, Shortcuts, About) are found by `selector` instead. A row
 * that only shows for some choices (a picture's fit while the background is a colour) opens its
 * page without a highlight.
 */
export const SETTINGS_INDEX = [
  { page: "theme", id: "appTheme", title: "App theme", description: "The colours every NotePane window uses.", keywords: "colour color dark light mode palette scheme" },
  { page: "theme", id: "accentColor", title: "Accent color", description: "Buttons, switches, focus rings and selection.", keywords: "accent colour color highlight tint blue purple green orange pink" },
  { page: "theme", id: "corners", title: "Corners", description: "How round windows, menus and buttons are.", keywords: "radius rounded round sharp square" },
  { page: "theme", id: "launchIntro", title: "Show intro on launch", description: "The NotePane mark plays in as the app opens.", keywords: "intro splash launch start opening animation logo" },
  { page: "fonts", id: "editorFontFamily", title: "Editor font", description: "The typeface notes are written in.", keywords: "font family typeface editor" },
  { page: "fonts", id: "appFontFamily", title: "App font", description: "The typeface of the sidebar, menus and Settings.", keywords: "font family typeface interface ui chrome" },
  { page: "fonts", id: "editorSize", title: "Size", description: "How large the editor text is.", keywords: "font size text bigger smaller scale" },
  { page: "fonts", id: "lineHeight", title: "Line height", description: "The space between lines of a paragraph.", keywords: "leading line spacing" },
  { page: "fonts", id: "letterSpacing", title: "Letter spacing", description: "The space between letters.", keywords: "tracking kerning" },
  { page: "fonts", id: "blockSpacing", title: "Block spacing", description: "Extra space between blocks.", keywords: "paragraph gap spacing" },
  { page: "fonts", id: "textWidth", title: "Text width", description: "How wide the reading column is.", keywords: "width column measure reading layout" },
  { page: "fonts", id: "headingFont", title: "Heading font", description: "The typeface of headings.", keywords: "headings title serif display rounded" },
  { page: "fonts", id: "headingWeight", title: "Heading weight", description: "How bold headings are.", keywords: "headings bold weight" },
  { page: "fonts", id: "codeFont", title: "Code font", description: "The typeface of code blocks and inline code.", keywords: "monospace mono menlo jetbrains courier code" },
  { page: "fonts", id: "codeSize", title: "Code size", description: "How large code is.", keywords: "code font size" },
  { page: "fonts", id: "codeLigatures", title: "Code ligatures", description: "Join character pairs such as => in code.", keywords: "ligature code font" },
  { page: "background", id: "backgroundType", title: "Background", description: "None, a colour, a gradient or a picture behind the app.", keywords: "wallpaper backdrop picture image colour color gradient" },
  { page: "background", id: "backgroundColor", title: "Background colour", description: "The colour behind the app.", keywords: "background colour color solid" },
  { page: "background", id: "backgroundGradient", title: "Gradient", description: "The colour the gradient starts from.", keywords: "gradient from start colour color background" },
  { page: "background", id: "backgroundGradientTo", title: "Gradient end", description: "The colour the gradient ends on.", keywords: "gradient to end colour color background" },
  { page: "background", id: "backgroundGradientAngle", title: "Gradient angle", description: "Which way the gradient runs.", keywords: "gradient angle direction rotate background" },
  { page: "background", id: "backgroundPicture", title: "Picture", description: "A built-in picture or one of your own.", keywords: "picture image photo wallpaper upload add" },
  { page: "background", id: "backgroundFit", title: "Fit", description: "Cover the window, fit inside it, or tile.", keywords: "cover contain tile repeat fill picture" },
  { page: "background", id: "backgroundPosition", title: "Position", description: "Which part of the picture stays in view.", keywords: "align anchor focus picture" },
  { page: "background", id: "backgroundBlur", title: "Background blur", description: "Soften the background.", keywords: "blur soften background" },
  { page: "background", id: "backgroundBrightness", title: "Brightness", description: "Lighten or darken the background.", keywords: "brightness light dark exposure" },
  { page: "background", id: "backgroundSaturation", title: "Saturation", description: "More or less colour in the background.", keywords: "saturation colour color grayscale vivid" },
  { page: "background", id: "backgroundTint", title: "Tint", description: "Wash the background with a colour.", keywords: "tint overlay colour color wash" },
  { page: "background", id: "backgroundBehindStickies", title: "Behind sticky notes", description: "Show the background in sticky note windows too.", keywords: "sticky notes windows background" },
  { page: "background", id: "backgroundDimInDark", title: "Dim in dark mode", description: "Darken the background while the theme is dark.", keywords: "dim dark mode night background" },
  { page: "background", id: "surfaceMaterial", title: "Material", description: "Solid, frosted or clear glass over the background.", keywords: "material glass frosted clear solid surfaces transparent see-through window" },
  { page: "background", id: "surfaceOpacity", title: "Opacity", description: "How much the window hides the background.", keywords: "opacity transparency transparent see-through glass surfaces window" },
  { page: "background", id: "surfaceBorder", title: "Border", description: "The line round the sidebar, title bar and menus.", keywords: "border outline hairline edge line surfaces" },
  { page: "background", id: "readableText", title: "Keep text readable", description: "A soft halo behind text over a background.", keywords: "readable contrast legibility halo text shadow" },
  { page: "tabs", id: "tabStyle", title: "Tab style", description: "How tabs without their own colour are drawn.", keywords: "tabs plain outline filled style" },
  { page: "tabs", id: "tabHeight", title: "Tab height", description: "Compact, regular or tall tabs.", keywords: "tabs height compact tall size" },
  { page: "tabs", id: "tabRadius", title: "Tab corner radius", description: "How round tabs are.", keywords: "tabs radius corners rounded" },
  { page: "tabs", id: "tabShowNumbers", title: "Show numbers", description: "Number each tab in the sidebar.", keywords: "tabs numbers index" },
  { page: "tabs", id: "tabShowShortcuts", title: "Show shortcuts", description: "Show each tab's keyboard shortcut.", keywords: "tabs shortcuts keys hints" },
  { page: "tabs", id: "tabNewColor", title: "New tab colour", description: "Give each new tab the next pastel colour.", keywords: "tabs colour color new cycle pastel" },
  { page: "tabs", id: "tabColorStrength", title: "Colour strength", description: "How strongly a coloured tab is filled.", keywords: "tabs colour color strength intensity" },
  { page: "editor", id: "tableOfContents", selector: '[aria-label="Show table of contents"]', title: "Table of contents", description: "Show the right rail of headings in tab mode.", keywords: "toc outline headings rail navigation" },
  { page: "editor", id: "smoothCaret", selector: '[aria-label="Smooth caret"]', title: "Smooth caret", description: "The cursor glides as you type.", keywords: "caret cursor smooth animation glide blink" },
  { page: "trash", id: "trashDeletedNotes", selector: ".preferences-trash-section", title: "Deleted notes", description: "Restore or permanently delete notes in the Trash.", keywords: "trash deleted restore purge bin recycle" },
  { page: "backup", id: "exportBackup", title: "Workspace backup", description: "Save the whole workspace to a .notepane file.", keywords: "backup export save data file" },
  { page: "backup", id: "importBackup", title: "Restore a backup", description: "Replace the workspace with a .notepane file.", keywords: "backup import restore data file" },
  { page: "about", id: "aboutVersion", selector: ".about-card", title: "Version", description: "Which NotePane is running.", keywords: "about version electron chromium" },
  { page: "about", id: "checkForUpdates", selector: ".about-update-row", title: "Check for updates", description: "Look for a newer NotePane.", keywords: "updates upgrade new version download" },
  { page: "about", id: "releaseNotes", selector: '.preferences-card a[href$="/releases"]', title: "What's new", description: "Every version and what changed in it.", keywords: "release notes changelog github" },
  ...PREFERENCE_SHORTCUT_COMMANDS.map((command) => ({
    page: "shortcuts",
    id: `shortcut-${command.id}`,
    selector: `[aria-label="Enable ${command.label} shortcut"]`,
    title: command.label,
    description: "Keyboard shortcut",
    keywords: "shortcut keys hotkey keyboard",
  })),
];

// Every word of the query has to appear somewhere in the entry; entries whose title starts with
// the query come first, then titles that contain it, then the rest in index order.
function searchSettings(query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }
  const words = normalizedQuery.split(/\s+/);
  return SETTINGS_INDEX
    .map((entry, order) => {
      const title = entry.title.toLowerCase();
      const page = getPreferencePage(entry.page);
      const haystack = [title, entry.description, entry.keywords, page.label, page.group]
        .join(" ")
        .toLowerCase();
      if (!words.every((word) => haystack.includes(word))) {
        return null;
      }
      const rank = title.startsWith(normalizedQuery) ? 0 : title.includes(normalizedQuery) ? 1 : 2;
      return { entry, order, rank };
    })
    .filter(Boolean)
    .sort((left, right) => left.rank - right.rank || left.order - right.order)
    .map(({ entry }) => entry);
}

// How long a row found by search stays highlighted; matches preferencesSearchHit in
// src/styles/preferences.css.
const SEARCH_HIT_MS = 1600;

const SEARCH_HIT_ROW_SELECTOR = [
  ".settings-row",
  ".preference-setting-row",
  ".shortcut-row",
  ".preferences-card",
  ".settings-group",
].join(", ");

function findSettingElement(container, entry) {
  const element =
    container.querySelector(`[data-setting-id="${entry.id}"]`) ??
    (entry.selector ? container.querySelector(entry.selector) : null);
  return element ? element.closest(SEARCH_HIT_ROW_SELECTOR) ?? element : null;
}

/**
 * The Settings window, laid out like Tern's: a sidebar (brand, search, pages under group
 * headings, version) beside the active page, whose title sits above cards that scroll on their
 * own. Look pages come from src/ui/lookPreferences.jsx; the rest are PreferencesCard sections.
 */
export function PreferencesWindow({
  initialPage = DEFAULT_PREFERENCE_PAGE_ID,
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
  onPickBackground,
  onRestoreTrashedNote,
  onPurgeTrashedNote,
  onClose,
}) {
  const { rootProps } = usePresenceContext();
  const [activePage, setActivePage] = useState(() =>
    normalizePreferencePageId(initialPage),
  );
  const [backupOperation, setBackupOperation] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  // The entry a search result opened; once its page has rendered, the row is scrolled to and
  // highlighted.
  const [pendingSearchHit, setPendingSearchHit] = useState(null);
  const [isPeeking, setIsPeeking] = useState(false);
  const searchInputRef = useRef(null);
  const pageBodyRef = useRef(null);
  // The row search last highlighted and the timer that clears it; kept outside the effect that
  // sets it, which re-runs as soon as it consumes the pending entry.
  const searchHighlightRef = useRef(null);
  const resultsId = useId();

  useEffect(() => {
    setActivePage(normalizePreferencePageId(initialPage));
  }, [initialPage]);

  const normalizedEditorPreferences = useMemo(
    () => normalizeEditorPreferences(editorPreferences),
    [editorPreferences],
  );

  const updateLook = useCallback(
    (nextLook) => {
      onEditorPreferencesChange?.({
        ...normalizedEditorPreferences,
        look: nextLook,
      });
    },
    [normalizedEditorPreferences, onEditorPreferencesChange],
  );

  const updateLaunchIntro = useCallback(
    (launchIntro) => {
      onEditorPreferencesChange?.({
        ...normalizedEditorPreferences,
        launchIntro: Boolean(launchIntro),
      });
    },
    [normalizedEditorPreferences, onEditorPreferencesChange],
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

  const isSearching = searchQuery.trim() !== "";
  const searchResults = useMemo(() => searchSettings(searchQuery), [searchQuery]);
  const activeResult = searchResults[Math.min(activeResultIndex, searchResults.length - 1)];

  const openPage = useCallback((pageId) => {
    setSearchQuery("");
    setActivePage(pageId);
  }, []);

  const openSearchResult = useCallback((entry) => {
    if (!entry) {
      return;
    }
    setSearchQuery("");
    setActivePage(entry.page);
    setPendingSearchHit(entry);
  }, []);

  const clearSearchHighlight = useCallback(() => {
    const highlight = searchHighlightRef.current;
    if (highlight) {
      window.clearTimeout(highlight.timer);
      highlight.target.removeAttribute("data-search-hit");
      searchHighlightRef.current = null;
    }
  }, []);

  useEffect(() => clearSearchHighlight, [clearSearchHighlight]);

  useEffect(() => {
    const body = pageBodyRef.current;
    if (!pendingSearchHit || isSearching || !body) {
      return;
    }
    setPendingSearchHit(null);
    clearSearchHighlight();
    const target = findSettingElement(body, pendingSearchHit);
    if (!target) {
      body.scrollTo({ top: 0 });
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    // A data attribute, not a class, so React re-rendering the row's className leaves it be.
    target.setAttribute("data-search-hit", "");
    searchHighlightRef.current = {
      target,
      timer: window.setTimeout(clearSearchHighlight, SEARCH_HIT_MS),
    };
  }, [clearSearchHighlight, isSearching, pendingSearchHit]);

  // Window capture runs ahead of the app's own Escape and Find handlers on document
  // (src/main.jsx, src/hooks/useKeyboardCommands.js), so these two keys stay with Settings: Escape
  // in a filled search field clears it rather than closing the window, and Command-F searches
  // settings rather than the note behind.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.isComposing || isShortcutRecorderTarget(event.target)) {
        return;
      }
      const searchInput = searchInputRef.current;
      if (event.key === "Escape") {
        if (searchInput && event.target === searchInput && searchInput.value !== "") {
          event.preventDefault();
          event.stopPropagation();
          setSearchQuery("");
        }
        return;
      }
      if (
        hasPlatformModifier(event) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "f" &&
        !document.querySelector(".trash-confirm-backdrop:not([data-state='closing'])")
      ) {
        event.preventDefault();
        event.stopPropagation();
        searchInput?.focus();
        searchInput?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  const handleSearchKeyDown = (event) => {
    if (!isSearching || searchResults.length === 0) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveResultIndex((index) =>
        (Math.min(index, searchResults.length - 1) + step + searchResults.length) %
        searchResults.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      openSearchResult(activeResult);
    }
  };

  // Peeking hides the window while the eye button is held, so a Look change can be judged
  // against the app behind. Pointer capture keeps the release with the button even though the
  // window it sits in is invisible.
  const startPeeking = (event) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsPeeking(true);
  };
  const stopPeeking = () => setIsPeeking(false);

  const activePageEntry = getPreferencePage(activePage);
  const activePageTitle = isSearching ? "Search" : activePageEntry.label;

  const renderBackupPage = () => (
    <SettingsGroup label="Workspace">
      <SettingRow
        id="exportBackup"
        title="Workspace backup"
        description="Every active note, Trash item and preference in one portable .notepane file, for NotePane on macOS and Windows."
      >
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
      </SettingRow>
      <SettingRow
        id="importBackup"
        title="Restore a backup"
        description="Import replaces the current workspace after making an automatic safety backup."
      >
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
      </SettingRow>
    </SettingsGroup>
  );

  const renderActivePreferencePage = () => {
    const look = normalizedEditorPreferences.look;
    switch (activePage) {
      case "editor":
        return (
          <EditorPreferencesSection
            editorPreferences={editorPreferences}
            onEditorPreferencesChange={onEditorPreferencesChange}
          />
        );
      case "fonts":
        return (
          <FontsLookPage
            look={look}
            onLookChange={updateLook}
            editorPreferences={editorPreferences}
            fontOptions={fontOptions}
            appFontOptions={appFontOptions}
            onEditorPreferencesChange={onEditorPreferencesChange}
            onAppFontFamilyChange={updateAppFontFamily}
          />
        );
      case "background":
        return (
          <BackgroundLookPage
            look={look}
            onLookChange={updateLook}
            onPickBackground={onPickBackground}
          />
        );
      case "tabs":
        return <TabsLookPage look={look} onLookChange={updateLook} />;
      case "trash":
        return (
          <TrashPreferencesSection
            trashedNotes={trashedNotes}
            onRestoreNote={onRestoreTrashedNote}
            onPurgeNote={onPurgeTrashedNote}
          />
        );
      case "backup":
        return renderBackupPage();
      case "shortcuts":
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
      case "about":
        return <AboutPreferencesSection />;
      default:
        return (
          <ThemeLookPage
            look={look}
            onLookChange={updateLook}
            appThemeId={appThemeId}
            themes={PICKER_THEMES}
            onAppThemeChange={onAppThemeChange}
            launchIntro={normalizedEditorPreferences.launchIntro}
            onLaunchIntroChange={updateLaunchIntro}
          />
        );
    }
  };

  const renderSearchResults = () => {
    if (searchResults.length === 0) {
      return (
        <div className="settings-search-empty" role="status">
          No settings match “{searchQuery.trim()}”.
        </div>
      );
    }
    return (
      <div
        id={resultsId}
        className="settings-search-results"
        role="listbox"
        aria-label="Settings search results"
      >
        {searchResults.map((entry) => {
          const page = getPreferencePage(entry.page);
          const isActive = entry === activeResult;
          return (
            <button
              id={`${resultsId}-${entry.id}`}
              key={entry.id}
              type="button"
              role="option"
              aria-selected={isActive}
              className="settings-search-result"
              onMouseDown={preventFocusLoss}
              onMouseEnter={() => setActiveResultIndex(searchResults.indexOf(entry))}
              onClick={() => openSearchResult(entry)}
            >
              <page.Icon className="settings-search-result-icon" size={15} aria-hidden="true" />
              <span className="settings-search-result-text">
                <span className="settings-search-result-title">{entry.title}</span>
                <span className="settings-search-result-description">{entry.description}</span>
              </span>
              <span className="settings-search-result-page">
                {page.group} › {page.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div
      {...rootProps}
      className={`preferences-backdrop${isPeeking ? " is-peeking" : ""}`}
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
        <aside className="preferences-window-sidebar">
          <div className="preferences-brand">
            <span className="preferences-brand-mark" aria-hidden="true">
              <SlidersHorizontal size={15} strokeWidth={2.2} />
            </span>
            <span className="preferences-window-title">Settings</span>
          </div>
          <label className="settings-search-field">
            <Search className="settings-search-icon" size={15} aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              aria-label="Search settings"
              placeholder="Search settings"
              autoComplete="off"
              spellCheck={false}
              value={searchQuery}
              aria-controls={isSearching && searchResults.length > 0 ? resultsId : undefined}
              aria-activedescendant={
                isSearching && activeResult ? `${resultsId}-${activeResult.id}` : undefined
              }
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setActiveResultIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
            />
          </label>
          <nav
            className="preferences-nav"
            aria-label="Preferences pages"
            role="tablist"
            aria-orientation="vertical"
          >
            {PREFERENCE_PAGE_GROUPS.map((group) => (
              <div key={group.label} className="preferences-nav-group" role="presentation">
                <div className="preferences-nav-heading" role="presentation">{group.label}</div>
                {group.pages.map(({ id, label, Icon }) => (
                  <button
                    id={`preferences-tab-${id}`}
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={activePage === id}
                    aria-controls={`preferences-${id}`}
                    onMouseDown={preventFocusLoss}
                    onClick={() => openPage(id)}
                  >
                    <Icon className="preferences-tab-icon" size={16} strokeWidth={2} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="preferences-window-footer">NotePane {PACKAGE_VERSION}</div>
        </aside>
        <section
          id={`preferences-${activePage}`}
          className="preferences-window-content preferences-window-section"
          role="tabpanel"
          aria-labelledby={`preferences-tab-${activePage}`}
        >
          <header className="preferences-page-header">
            <h2 className="preferences-section-title preferences-page-title">{activePageTitle}</h2>
            <button
              type="button"
              className="preferences-header-button preferences-peek-button"
              aria-label="Hold to see the app"
              title="Hold to see the app"
              aria-pressed={isPeeking}
              onMouseDown={preventFocusLoss}
              onPointerDown={startPeeking}
              onPointerUp={stopPeeking}
              onPointerCancel={stopPeeking}
              onLostPointerCapture={stopPeeking}
              onKeyDown={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  setIsPeeking(true);
                }
              }}
              onKeyUp={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  stopPeeking();
                }
              }}
              onBlur={stopPeeking}
            >
              <Eye size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="preferences-header-button preferences-close-button"
              aria-label="Close preferences"
              onMouseDown={preventFocusLoss}
              onClick={onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div ref={pageBodyRef} className="preferences-page-body">
            {isSearching ? renderSearchResults() : renderActivePreferencePage()}
          </div>
        </section>
      </div>
    </div>
  );
}
