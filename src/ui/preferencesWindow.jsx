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
  AppearanceLookPage,
  BackgroundLookPage,
  EditorLookPage,
  TabsLookPage,
} from "./lookPreferences.jsx";
import {
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

// The sidebar's groups, in order, as Tern lays out its Settings: About first, so an update is one
// glance away, then how the app looks, then the note itself, then the keys. A group heading only
// labels its pages; it is not a tab. Page ids stay as stored by older versions (`theme` is
// Appearance, `shortcuts` is Keyboard).
export const PREFERENCE_PAGE_GROUPS = [
  {
    label: "App",
    pages: [
      { id: "about", label: "About", Icon: Info },
      { id: "theme", label: "Appearance", Icon: Sun },
      { id: "background", label: "Background", Icon: ImageIcon },
      { id: "tabs", label: "Tabs", Icon: AppWindow },
      { id: "editor", label: "Editor", Icon: FileText },
      { id: "shortcuts", label: "Keyboard", Icon: Keyboard },
    ],
  },
  {
    label: "Data",
    pages: [
      { id: "trash", label: "Trash", Icon: Trash2 },
      { id: "backup", label: "Backup", Icon: Download },
    ],
  },
];

export const PREFERENCE_PAGES = PREFERENCE_PAGE_GROUPS.flatMap(({ label, pages }) =>
  pages.map((page) => ({ ...page, group: label })),
);

const DEFAULT_PREFERENCE_PAGE_ID = "theme";

// Pages that were merged into others keep opening where their settings went: the app theme left
// General for Appearance, Surfaces became the Glass group of Background, and Fonts joined Editor.
const RENAMED_PREFERENCE_PAGES = {
  general: "theme",
  surfaces: "background",
  fonts: "editor",
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
 * does not render itself (Trash, Keyboard, About) are found by `selector` instead. A row that
 * only shows for some choices (a picture's size while the background is a color) opens its page
 * without a highlight. Keywords keep the names settings had before, so old words still find them.
 */
export const SETTINGS_INDEX = [
  { page: "about", id: "aboutVersion", selector: ".about-card", title: "Version", description: "Which NotePane you are running.", keywords: "about version electron chromium" },
  { page: "about", id: "checkForUpdates", selector: ".about-update-row", title: "Check for updates", description: "Looks for a newer NotePane.", keywords: "updates upgrade new version download latest" },
  { page: "about", id: "releaseNotes", selector: '.preferences-card a[href$="/releases"]', title: "What's new", description: "What changed in each version.", keywords: "release notes changelog github" },
  { page: "theme", id: "appTheme", title: "App theme", description: "The colors of every window, light or dark.", keywords: "theme colour color dark light mode palette scheme" },
  { page: "theme", id: "accentColor", title: "Accent color", description: "Colors buttons, switches and selections.", keywords: "accent colour color highlight tint blue purple green orange pink" },
  { page: "theme", id: "corners", title: "Corners", description: "How round windows, menus and buttons are.", keywords: "radius rounded round sharp square shape" },
  { page: "theme", id: "appFontFamily", title: "App font", description: "The font of the sidebar, menus and Settings.", keywords: "font fonts family typeface interface ui chrome" },
  { page: "theme", id: "launchIntro", title: "Show intro on launch", description: "The NotePane logo plays as the app opens.", keywords: "intro splash launch start opening animation logo" },
  { page: "editor", id: "editorFontFamily", title: "Editor font", description: "The font notes are written in.", keywords: "font fonts family typeface text" },
  { page: "editor", id: "editorSize", title: "Text size", description: "How large note text is.", keywords: "font fonts size text bigger smaller scale" },
  { page: "editor", id: "lineHeight", title: "Line height", description: "Space between the lines of a paragraph.", keywords: "leading line spacing fonts" },
  { page: "editor", id: "letterSpacing", title: "Letter spacing", description: "Space between letters.", keywords: "tracking kerning fonts" },
  { page: "editor", id: "blockSpacing", title: "Paragraph spacing", description: "Extra space between paragraphs, headings and lists.", keywords: "block spacing space between blocks paragraph gap fonts" },
  { page: "editor", id: "headingFont", title: "Heading font", description: "The font of headings.", keywords: "headings title serif display rounded fonts" },
  { page: "editor", id: "headingWeight", title: "Heading weight", description: "How bold headings are.", keywords: "headings bold weight fonts" },
  { page: "editor", id: "codeFont", title: "Code font", description: "The font of code blocks and inline code.", keywords: "monospace mono menlo jetbrains courier code fonts" },
  { page: "editor", id: "codeSize", title: "Code size", description: "How large code is.", keywords: "code font fonts size" },
  { page: "editor", id: "codeLigatures", title: "Code ligatures", description: "Shows => and != as single symbols.", keywords: "ligature code font fonts" },
  { page: "editor", id: "textWidth", title: "Text width", description: "How long a line of text gets in a wide window.", keywords: "width column measure reading layout line length fonts" },
  { page: "editor", id: "tableOfContents", title: "Table of contents", description: "Lists the note's headings on the right in the tabs layout.", keywords: "toc outline headings rail navigation layout" },
  { page: "editor", id: "smoothCaret", title: "Smooth caret", description: "The cursor glides as you type.", keywords: "caret cursor smooth animation glide blink typing" },
  { page: "background", id: "backgroundType", title: "Background", description: "What shows behind your notes and the sidebar.", keywords: "wallpaper backdrop picture image colour color gradient none" },
  { page: "background", id: "backgroundColor", title: "Background color", description: "The flat color behind the window.", keywords: "background colour color solid" },
  { page: "background", id: "backgroundGradient", title: "Gradient start color", description: "The color the gradient starts from.", keywords: "gradient from start colour color background" },
  { page: "background", id: "backgroundGradientTo", title: "Gradient end color", description: "The color the gradient ends on.", keywords: "gradient to end colour color background" },
  { page: "background", id: "backgroundGradientAngle", title: "Gradient angle", description: "Which way the gradient runs.", keywords: "gradient angle direction rotate degrees background" },
  { page: "background", id: "backgroundPicture", title: "Picture", description: "A built-in picture or one of your own.", keywords: "picture image photo wallpaper upload add" },
  { page: "background", id: "backgroundFit", title: "Picture size", description: "Fill the window, fit the whole picture, or tile it.", keywords: "fit cover contain tile repeat fill picture size scale" },
  { page: "background", id: "backgroundPosition", title: "Picture position", description: "Which edge or corner the picture lines up with.", keywords: "align anchor focus picture position" },
  { page: "background", id: "backgroundBlur", title: "Background blur", description: "Softens the picture or gradient.", keywords: "blur soften background picture adjust" },
  { page: "background", id: "backgroundBrightness", title: "Background brightness", description: "Lightens or darkens the background.", keywords: "brightness light dark exposure adjust" },
  { page: "background", id: "backgroundSaturation", title: "Background saturation", description: "More or less color in the background.", keywords: "saturation colour color grayscale vivid adjust" },
  { page: "background", id: "backgroundTint", title: "Tint", description: "How strongly a color washes over the background.", keywords: "tint amount strength overlay colour color wash adjust" },
  { page: "background", id: "backgroundTintColor", title: "Tint color", description: "The color washed over the background.", keywords: "tint overlay colour color wash adjust" },
  { page: "background", id: "backgroundDimInDark", title: "Dim in dark mode", description: "Darkens the background while the theme is dark.", keywords: "dim dark mode night background" },
  { page: "background", id: "backgroundBehindStickies", title: "Show behind sticky notes", description: "Sticky note windows show the background too.", keywords: "behind sticky notes windows background where" },
  { page: "background", id: "surfaceMaterial", title: "Material", description: "Solid, frosted or clear glass over the background.", keywords: "material glass frosted clear solid surfaces transparent see-through window" },
  { page: "background", id: "surfaceOpacity", title: "Opacity", description: "How much the window covers the background.", keywords: "opacity transparency transparent see-through glass surfaces window" },
  { page: "background", id: "floatingBlur", title: "Menu blur", description: "How much menus, the palette and Settings blur what is behind them.", keywords: "menus popups popover floating blur strength frosted glass clear palette dropdown overlap" },
  { page: "background", id: "surfaceBorder", title: "Border", description: "The line around the sidebar, title bar and menus.", keywords: "border outline hairline thin edge line surfaces glass" },
  { page: "background", id: "readableText", title: "Keep text readable", description: "A soft glow behind text over a background.", keywords: "readable contrast legibility halo glow text shadow glass" },
  { page: "tabs", id: "tabStyle", title: "Tab style", description: "How tabs without a color of their own are drawn.", keywords: "tabs plain outline filled style" },
  { page: "tabs", id: "tabHeight", title: "Tab height", description: "Compact, regular or tall tabs.", keywords: "tabs height compact tall size" },
  { page: "tabs", id: "tabRadius", title: "Tab corners", description: "How round each tab is.", keywords: "tabs radius corners rounded corner radius" },
  { page: "tabs", id: "tabBorder", title: "Tab border", description: "The line around each tab.", keywords: "tabs border outline line stroke" },
  { page: "tabs", id: "tabBorderColor", title: "Tab border color", description: "The color of the line around each tab.", keywords: "tabs border outline colour color" },
  { page: "tabs", id: "tabBarColor", title: "Tab bar", description: "The sidebar behind the tabs.", keywords: "tabs bar sidebar background colour color" },
  { page: "tabs", id: "tabActiveFill", title: "Open tab", description: "The tab of the note you are in.", keywords: "tabs active current selected fill background colour color" },
  { page: "tabs", id: "tabActiveText", title: "Open tab text", description: "Text color of the open tab.", keywords: "tabs active current text foreground colour color" },
  { page: "tabs", id: "tabInactiveFill", title: "Other tabs", description: "Fill of the tabs you are not in.", keywords: "tabs inactive other fill background colour color" },
  { page: "tabs", id: "tabInactiveText", title: "Other tabs text", description: "Text color of the other tabs.", keywords: "tabs inactive other text foreground colour color" },
  { page: "tabs", id: "tabFillOpacity", title: "Tab opacity", description: "How solid the tab colors are.", keywords: "tabs opacity transparency alpha fill" },
  { page: "tabs", id: "tabBlur", title: "Tab blur", description: "How much the tabs blur a background behind them.", keywords: "tabs blur frosted glass" },
  { page: "tabs", id: "tabNewColor", title: "New tab color", description: "Give each new tab the next pastel.", keywords: "tabs colour color new cycle pastel" },
  { page: "tabs", id: "tabColorStrength", title: "Color strength", description: "How strongly a colored tab is filled.", keywords: "tabs colour color strength intensity" },
  { page: "tabs", id: "tabShowNumbers", title: "Show tab numbers", description: "Off gives the title the room.", keywords: "tabs numbers index show hide" },
  { page: "tabs", id: "tabShowShortcuts", title: "Show tab shortcuts", description: "The ⌘1 to ⌘9 key beside each tab.", keywords: "tabs shortcuts keys hints show hide" },
  { page: "trash", id: "trashDeletedNotes", selector: ".preferences-trash-section", title: "Deleted notes", description: "Restore deleted notes or delete them for good.", keywords: "trash deleted restore purge bin recycle" },
  { page: "backup", id: "exportBackup", title: "Export a backup", description: "Saves every note and setting to a .notepane file.", keywords: "backup export save data file workspace" },
  { page: "backup", id: "importBackup", title: "Import a backup", description: "Replaces your notes with a .notepane file.", keywords: "backup import restore data file workspace" },
  ...PREFERENCE_SHORTCUT_COMMANDS.map((command) => ({
    page: "shortcuts",
    id: `shortcut-${command.id}`,
    selector: `[aria-label="Enable ${command.label} shortcut"]`,
    title: command.label,
    description: "Keyboard shortcut",
    keywords: `shortcut shortcuts keys hotkey keyboard ${command.keywords ?? ""}`.trim(),
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
 * own. Look pages (Appearance, Background, Tabs, Editor) come from src/ui/lookPreferences.jsx;
 * About, Keyboard and Trash are PreferencesCard sections.
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
    <SettingsGroup label="Backup file">
      <SettingRow
        id="exportBackup"
        title="Export a backup"
        description="Saves every note, the Trash and your settings in one .notepane file, for Mac or Windows."
      >
        <button
          type="button"
          className="preference-data-button"
          disabled={Boolean(backupOperation)}
          onMouseDown={preventFocusLoss}
          onClick={() => void runBackupOperation("export", onExportBackup)}
        >
          <Download size={13} aria-hidden="true" />
          {backupOperation === "export" ? "Exporting…" : "Export backup"}
        </button>
      </SettingRow>
      <SettingRow
        id="importBackup"
        title="Import a backup"
        description="Replaces all notes and settings with a .notepane file; a safety copy is saved first."
      >
        <button
          type="button"
          className="preference-data-button preference-data-button-import"
          disabled={Boolean(backupOperation)}
          onMouseDown={preventFocusLoss}
          onClick={() => void runBackupOperation("import", onImportBackup)}
        >
          <Upload size={13} aria-hidden="true" />
          {backupOperation === "import" ? "Importing…" : "Import backup"}
        </button>
      </SettingRow>
    </SettingsGroup>
  );

  const renderActivePreferencePage = () => {
    const look = normalizedEditorPreferences.look;
    switch (activePage) {
      case "editor":
        return (
          <EditorLookPage
            look={look}
            onLookChange={updateLook}
            editorPreferences={editorPreferences}
            fontOptions={fontOptions}
            onEditorPreferencesChange={onEditorPreferencesChange}
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
          <AppearanceLookPage
            look={look}
            onLookChange={updateLook}
            appThemeId={appThemeId}
            themes={PICKER_THEMES}
            onAppThemeChange={onAppThemeChange}
            appFontFamily={normalizedEditorPreferences.appFontFamily}
            appFontOptions={appFontOptions}
            onAppFontFamilyChange={updateAppFontFamily}
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
