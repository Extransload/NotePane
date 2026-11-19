import {
  AppWindow,
  Download,
  Eye,
  FileText,
  Keyboard,
  PanelLeft,
  Search,
  Settings2,
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
  GeneralPreferencesPage,
} from "./generalPreferences.jsx";
import {
  AppearanceLookPage,
  EditorLookPage,
  SearchLookPage,
  SidebarLookPage,
  WindowLookPage,
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

// The sidebar's groups, in order, as Tern lays out its Settings: a page for each part of the app
// a setting changes (General, then how it looks, the window, the sidebar, the note, the search
// palette and the keys), then the data. A group heading only labels its pages; it is not a tab.
// Page ids stay as stored by older versions (`theme` is Appearance, `shortcuts` is Keyboard).
export const PREFERENCE_PAGE_GROUPS = [
  {
    label: "App",
    pages: [
      { id: "general", label: "General", Icon: Settings2 },
      { id: "theme", label: "Appearance", Icon: Sun },
      { id: "window", label: "Window", Icon: AppWindow },
      { id: "sidebar", label: "Sidebar", Icon: PanelLeft },
      { id: "editor", label: "Editor", Icon: FileText },
      { id: "search", label: "Search", Icon: Search },
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

// Pages that were merged into others keep opening where their settings went: About became
// General, Fonts joined Editor, Background (and Surfaces before it) became Window, and Tabs
// became Sidebar.
const RENAMED_PREFERENCE_PAGES = {
  about: "general",
  fonts: "editor",
  background: "window",
  surfaces: "window",
  tabs: "sidebar",
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
 * does not render itself (Trash, Keyboard) are found by `selector` instead. A row that only shows
 * for some choices (a picture's size while the background is a color) opens its page without a
 * highlight; the Sidebar page opens More colors for a row behind it. Keywords keep the names
 * settings and pages had before, so old words still find them.
 */
export const SETTINGS_INDEX = [
  { page: "general", id: "appVersion", title: "NotePane version", description: "Which NotePane you are running.", keywords: "about version electron chromium" },
  { page: "general", id: "checkForUpdates", title: "Check for updates", description: "Looks for a newer NotePane.", keywords: "about updates upgrade new version download latest" },
  { page: "general", id: "autoDownloadUpdates", title: "Download updates automatically", description: "Off asks before downloading a new version.", keywords: "about updates download automatic auto ask prompt background" },
  { page: "general", id: "releaseNotes", title: "What's new", description: "What changed in each version.", keywords: "about release notes changelog github" },
  { page: "general", id: "launchIntro", title: "Show intro on launch", description: "The NotePane logo plays as the app opens.", keywords: "appearance intro splash launch startup start opening animation logo" },
  { page: "theme", id: "appTheme", title: "App theme", description: "The colors of every window, light or dark.", keywords: "theme colour color dark light mode palette scheme" },
  { page: "theme", id: "accentColor", title: "Accent color", description: "Colors buttons, switches and selections.", keywords: "accent colour color highlight tint blue purple green orange pink" },
  { page: "theme", id: "corners", title: "Corners", description: "How round windows, menus and buttons are.", keywords: "radius rounded round sharp square shape" },
  { page: "theme", id: "appFontFamily", title: "Interface font", description: "The sidebar, menus and Settings.", keywords: "app font fonts family typeface interface ui chrome" },
  { page: "window", id: "backgroundType", title: "Background", description: "What shows behind your notes and the sidebar.", keywords: "background type wallpaper backdrop picture image colour color gradient none" },
  { page: "window", id: "backgroundColor", title: "Background color", description: "The flat color behind the window.", keywords: "background colour color solid" },
  { page: "window", id: "backgroundGradient", title: "Gradient start color", description: "The color the gradient starts from.", keywords: "gradient from start colour color background" },
  { page: "window", id: "backgroundGradientTo", title: "Gradient end color", description: "The color the gradient ends on.", keywords: "gradient to end colour color background" },
  { page: "window", id: "backgroundGradientAngle", title: "Gradient angle", description: "Which way the gradient runs.", keywords: "gradient angle direction rotate degrees background" },
  { page: "window", id: "backgroundPicture", title: "Picture", description: "A built-in picture or one of your own.", keywords: "background picture image photo wallpaper upload add" },
  { page: "window", id: "backgroundFit", title: "Picture size", description: "Fill the window, fit the whole picture, or tile it.", keywords: "background fit cover contain tile repeat fill picture size scale" },
  { page: "window", id: "backgroundPosition", title: "Picture position", description: "Which edge or corner the picture lines up with.", keywords: "background align anchor focus picture position" },
  { page: "window", id: "backgroundBlur", title: "Background blur", description: "Softens the picture or gradient.", keywords: "blur soften background picture adjust" },
  { page: "window", id: "backgroundBrightness", title: "Background brightness", description: "Lightens or darkens the background.", keywords: "brightness light dark exposure adjust background" },
  { page: "window", id: "backgroundSaturation", title: "Background saturation", description: "How much color the background keeps.", keywords: "saturation colour color grayscale vivid adjust background" },
  { page: "window", id: "backgroundTint", title: "Tint", description: "How strongly the tint color washes over the background.", keywords: "tint amount strength overlay colour color wash adjust background" },
  { page: "window", id: "backgroundTintColor", title: "Tint color", description: "The color washed over the background.", keywords: "tint overlay colour color wash adjust background" },
  { page: "window", id: "backgroundDimInDark", title: "Dim in dark mode", description: "Darkens the background while the theme is dark.", keywords: "dim dark mode night background" },
  { page: "window", id: "surfaceMaterial", title: "Material", description: "Solid, frosted or clear glass over the background.", keywords: "material glass frosted clear solid surfaces transparent see-through window background" },
  { page: "window", id: "surfaceOpacity", title: "Opacity", description: "How much the window covers the background.", keywords: "opacity transparency transparent see-through glass surfaces window background" },
  { page: "window", id: "floatingBlur", title: "Menu blur", description: "How much menus, the palette and Settings blur what is behind them.", keywords: "menus popups popover floating blur strength frosted glass clear palette dropdown overlap background" },
  { page: "window", id: "surfaceBorder", title: "Border", description: "The line around the sidebar, title bar and menus.", keywords: "border outline hairline thin edge line surfaces glass background" },
  { page: "window", id: "readableText", title: "Text glow", description: "A soft glow behind text over a background.", keywords: "keep text readable contrast legibility halo glow shadow glass background" },
  { page: "window", id: "backgroundBehindStickies", title: "Show background behind sticky notes", description: "Sticky note windows show the background too.", keywords: "behind sticky notes windows background where" },
  { page: "sidebar", id: "tabStyle", title: "Tab style", description: "How tabs without a color of their own are drawn.", keywords: "tabs plain outline filled style" },
  { page: "sidebar", id: "tabHeight", title: "Tab height", description: "How tall each tab is.", keywords: "tabs height compact regular tall size" },
  { page: "sidebar", id: "tabRadius", title: "Tab corners", description: "How round each tab is.", keywords: "tabs radius corners rounded corner radius" },
  { page: "sidebar", id: "tabBorder", title: "Tab border", description: "The line around each tab.", keywords: "tabs border outline line stroke" },
  { page: "sidebar", id: "tabBorderColor", title: "Tab border color", description: "The color of the line around each tab.", keywords: "tabs border outline colour color" },
  { page: "sidebar", id: "tabBarColor", title: "Tab bar", description: "The sidebar behind the tabs.", keywords: "tabs bar sidebar background colour color" },
  { page: "sidebar", id: "tabActiveFill", title: "Active tab", description: "The tab of the note you are in.", keywords: "tabs open tab current selected fill background colour color" },
  { page: "sidebar", id: "tabActiveText", title: "Active tab text", description: "Text color of the active tab.", keywords: "tabs open tab text current foreground colour color more colors" },
  { page: "sidebar", id: "tabInactiveFill", title: "Inactive tabs", description: "The tabs of your other notes.", keywords: "tabs other tabs fill background colour color" },
  { page: "sidebar", id: "tabInactiveText", title: "Inactive tab text", description: "Text color of the inactive tabs.", keywords: "tabs other tabs text foreground colour color more colors" },
  { page: "sidebar", id: "tabFillOpacity", title: "Tab opacity", description: "How solid the tab colors are.", keywords: "tabs opacity transparency alpha fill more colors" },
  { page: "sidebar", id: "tabBlur", title: "Tab blur", description: "How much the tabs blur a background behind them.", keywords: "tabs blur frosted glass more colors" },
  { page: "sidebar", id: "tabNewColor", title: "New tab color", description: "Gives each new tab the next color.", keywords: "tabs note colors colour color new cycle pastel" },
  { page: "sidebar", id: "tabColorStrength", title: "Note color intensity", description: "How strongly a tab shows its note's color.", keywords: "tabs colored tabs color strength colour intensity" },
  { page: "sidebar", id: "tabShowNumbers", title: "Tab numbers", description: "The number before each title.", keywords: "tabs show tab numbers index hide" },
  { page: "sidebar", id: "tabShowShortcuts", title: "Tab shortcuts", description: "The key beside each tab that opens it.", keywords: "tabs show tab shortcuts keys hints hide" },
  { page: "editor", id: "editorFontFamily", title: "Text font", description: "The font notes are written in.", keywords: "editor font fonts family typeface text" },
  { page: "editor", id: "editorSize", title: "Text size", description: "How large note text is.", keywords: "font fonts size text bigger smaller scale" },
  { page: "editor", id: "lineHeight", title: "Line height", description: "Space between the lines of a paragraph.", keywords: "leading line spacing fonts" },
  { page: "editor", id: "letterSpacing", title: "Letter spacing", description: "Space between letters.", keywords: "tracking kerning fonts" },
  { page: "editor", id: "blockSpacing", title: "Paragraph spacing", description: "Extra space between paragraphs, headings and lists.", keywords: "block spacing space between blocks paragraph gap fonts" },
  { page: "editor", id: "headingFont", title: "Heading font", description: "The font of headings.", keywords: "headings title serif display rounded font family typeface fonts" },
  { page: "editor", id: "headingWeight", title: "Heading weight", description: "How bold headings are.", keywords: "headings bold weight fonts" },
  { page: "editor", id: "codeFont", title: "Code font", description: "The font of code blocks and inline code.", keywords: "monospace mono menlo jetbrains courier code font family typeface fonts" },
  { page: "editor", id: "codeSize", title: "Code size", description: "How large code is.", keywords: "code font fonts size" },
  { page: "editor", id: "codeLigatures", title: "Code ligatures", description: "Shows => and != as single symbols.", keywords: "ligature code font fonts" },
  { page: "editor", id: "textWidth", title: "Text width", description: "How long a line of text gets in a wide window.", keywords: "width column measure reading layout line length fonts" },
  { page: "editor", id: "tableOfContents", title: "Table of contents", description: "Lists the note's headings on the right in the tabs layout.", keywords: "toc outline headings rail navigation layout" },
  { page: "editor", id: "smoothCaret", title: "Smooth caret", description: "The cursor glides as you type.", keywords: "caret cursor smooth animation glide blink typing" },
  { page: "search", id: "paletteWidth", title: "Search palette width", description: "How wide the palette opens.", keywords: "appearance command palette search cmd+p quick open size bigger wider width" },
  { page: "search", id: "paletteHeight", title: "Search palette height", description: "How much of the window the results fill before they scroll.", keywords: "appearance command palette search cmd+p quick open size bigger taller height results" },
  { page: "search", id: "paletteTextSize", title: "Search palette text size", description: "How large the results are.", keywords: "appearance command palette search cmd+p quick open size bigger font text larger" },
  { page: "search", id: "palettePosition", title: "Search palette position", description: "Where in the window the palette opens.", keywords: "appearance command palette search cmd+p quick open position top center middle" },
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
 * own. General comes from src/ui/generalPreferences.jsx and the Look pages (Appearance, Window,
 * Sidebar, Editor, Search) from src/ui/lookPreferences.jsx; Keyboard and Trash are
 * PreferencesCard sections.
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

  const updateAutoDownloadUpdates = useCallback(
    (autoDownloadUpdates) => {
      onEditorPreferencesChange?.({
        ...normalizedEditorPreferences,
        autoDownloadUpdates: Boolean(autoDownloadUpdates),
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
      case "general":
        return (
          <GeneralPreferencesPage
            autoDownloadUpdates={normalizedEditorPreferences.autoDownloadUpdates}
            onAutoDownloadUpdatesChange={updateAutoDownloadUpdates}
            launchIntro={normalizedEditorPreferences.launchIntro}
            onLaunchIntroChange={updateLaunchIntro}
          />
        );
      case "window":
        return (
          <WindowLookPage
            look={look}
            onLookChange={updateLook}
            onPickBackground={onPickBackground}
          />
        );
      case "sidebar":
        return (
          <SidebarLookPage
            look={look}
            onLookChange={updateLook}
            revealSettingId={pendingSearchHit?.id}
          />
        );
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
      case "search":
        return (
          <SearchLookPage
            look={look}
            onLookChange={updateLook}
            editorPreferences={editorPreferences}
          />
        );
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
