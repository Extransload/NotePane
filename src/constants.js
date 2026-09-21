export const electronApi = window.blocknoteSticky;

export const DEFAULT_TITLE = "Untitled";

export const AUTO_TITLE_MAX_LENGTH = 48;

export const DEFAULT_APP_THEME = {
  mode: "light",
};

export const DEFAULT_LAYOUT_MODE = "tabs";

export const DEFAULT_THEME = {
  tabTextColor: null,
  tabTextOpacity: 1,
};

export const DEFAULT_EDITOR_FONT_SCALE = 1;

export const EDITOR_FONT_SCALE_STEP = 0.08;

export const MIN_EDITOR_FONT_SCALE = 0.38;

export const MAX_EDITOR_FONT_SCALE = 9;

export const BASE_EDITOR_FONT_SIZE_PX = 16;

export const MIN_EDITOR_FONT_SIZE_PX = 6;

export const MAX_EDITOR_FONT_SIZE_PX = 144;

export const EDITOR_FONT_SIZE_PRESETS = [
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  18,
  20,
  22,
  24,
  26,
  28,
  32,
  36,
  40,
  48,
  56,
  64,
  72,
  84,
  96,
  120,
  144,
];

export const DEFAULT_EDITOR_FONT_FAMILY = "system";

export const DEFAULT_APP_FONT_FAMILY = "inter";

export const DEFAULT_KEYBOARD_SHORTCUTS = {
  newSession: "Mod+T",
  newNote: "Mod+N",
  closeWindow: "Mod+W",
  focusEditor: "Mod+Enter",
  previousTab: "Mod+Alt+ArrowLeft",
  nextTab: "Mod+Alt+ArrowRight",
  moveTabLeft: "Mod+Shift+[",
  moveTabRight: "Mod+Shift+]",
  toggleSidebar: "Mod+Shift+B",
  toggleLayoutMode: "Mod+Shift+T",
  toggleEditorWidth: "Mod+Shift+W",
  toggleTableOfContents: "Mod+Shift+O",
  toggleThemeMode: "Mod+Shift+L",
  exportPdf: "Mod+Shift+E",
  preferences: "Mod+,",
  increaseEditorFontSize: "Mod+=",
  decreaseEditorFontSize: "Mod+-",
  attachDetachedNote: "Mod+Shift+D",
  toggleAlwaysOnTop: "Mod+Shift+P",
};

export const KEYBOARD_SHORTCUT_COMMAND_IDS = Object.keys(DEFAULT_KEYBOARD_SHORTCUTS);

export const KEYBOARD_SHORTCUT_TOGGLE_COMMAND_IDS = [
  ...KEYBOARD_SHORTCUT_COMMAND_IDS,
  "selectTabByNumber",
];

export const DEFAULT_KEYBOARD_SHORTCUT_ENABLED = Object.fromEntries(
  KEYBOARD_SHORTCUT_TOGGLE_COMMAND_IDS.map((commandId) => [commandId, true]),
);

export const DEFAULT_EDITOR_PREFERENCES = {
  editorFontScale: DEFAULT_EDITOR_FONT_SCALE,
  editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
  appFontFamily: DEFAULT_APP_FONT_FAMILY,
  showTableOfContents: false,
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
  keyboardShortcutEnabled: DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
};

export const LOCAL_FONT_VALUE_PREFIX = "local:";

export const EDITOR_BUILTIN_FONT_FAMILY_OPTIONS = [
  {
    value: "system",
    label: "System",
    css: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
  },
  {
    value: "inter",
    label: "Inter",
    css: 'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
  },
  {
    value: "sf-pro",
    label: "SF Pro",
    css: '"SF Pro Text", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  {
    value: "avenir",
    label: "Avenir",
    css: 'Avenir, "Avenir Next", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  {
    value: "helvetica",
    label: "Helvetica",
    css: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  },
  {
    value: "arial",
    label: "Arial",
    css: 'Arial, Helvetica, sans-serif',
  },
  {
    value: "verdana",
    label: "Verdana",
    css: 'Verdana, Geneva, sans-serif',
  },
  {
    value: "trebuchet",
    label: "Trebuchet",
    css: '"Trebuchet MS", Trebuchet, sans-serif',
  },
  {
    value: "serif",
    label: "Serif",
    css: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
  },
  {
    value: "mono",
    label: "Mono",
    css: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  },
  {
    value: "rounded",
    label: "Rounded",
    css: '"SF Pro Rounded", ui-rounded, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
  },
  {
    value: "georgia",
    label: "Georgia",
    css: 'Georgia, Cambria, "Times New Roman", Times, serif',
  },
  {
    value: "palatino",
    label: "Palatino",
    css: 'Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif',
  },
  {
    value: "garamond",
    label: "Garamond",
    css: 'Garamond, Baskerville, "Baskerville Old Face", Georgia, serif',
  },
  {
    value: "times",
    label: "Times",
    css: '"Times New Roman", Times, serif',
  },
  {
    value: "menlo",
    label: "Menlo",
    css: 'Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  },
  {
    value: "courier",
    label: "Courier",
    css: '"Courier New", Courier, monospace',
  },
];

export const SESSION_TAB_ENTER_MS = 190;

export const SESSION_TAB_EXIT_MS = 170;

export const SESSION_TAB_REORDER_ANIMATION_MS = 180;

export const MODE_TAB_TEXT_DEFAULTS = {
  light: {
    tabTextColor: "#37352f",
    tabTextOpacity: 1,
  },
  dark: {
    tabTextColor: "#f1f1ef",
    tabTextOpacity: 1,
  },
};

export const SESSION_TAB_MODE_BASE_COLORS = {
  light: {
    active: "#f1f1ef",
    inactive: "#e7e7e4",
    hover: "#ededeb",
  },
  dark: {
    active: "#2a2a2a",
    inactive: "#202020",
    hover: "#252525",
  },
};

export const SESSION_TAB_CONTRAST_TEXT = {
  dark: "#1f1f1f",
  light: "#fbfbfa",
};

export const SESSION_TAB_DARK_MODE_TONE_MIX = 0.12;

export const STICKY_PASTEL_PALETTE = [
  "#fff2b8",
  "#ffd7e8",
  "#dff4d7",
  "#d9efff",
  "#eadcff",
  "#ffe4ca",
];

export const DEFAULT_STICKY_ACCENT_COLOR = STICKY_PASTEL_PALETTE[0];

export const DEFAULT_CROP = { x: 0, y: 0, width: 1, height: 1 };

export const MIN_CROP_SIZE = 0.02;

export const CROP_RESIZE_HANDLES = [
  { id: "nw", label: "top left" },
  { id: "n", label: "top" },
  { id: "ne", label: "top right" },
  { id: "e", label: "right" },
  { id: "se", label: "bottom right" },
  { id: "s", label: "bottom" },
  { id: "sw", label: "bottom left" },
  { id: "w", label: "left" },
];

export const SIDEBAR_DEFAULT_WIDTH = 204;

export const SIDEBAR_MIN_WIDTH = 156;

export const SIDEBAR_MAX_WIDTH = 340;

export const SIDEBAR_COLLAPSE_WIDTH = 124;

export const SIDEBAR_COMPACT_WIDTH = 64;

export const EXPORT_TOAST_TIMEOUT_MS = 2600;

export const TRASH_UNDO_TOAST_TIMEOUT_MS = 5200;

export const FONT_SIZE_TOAST_TIMEOUT_MS = 1400;

export const SLASH_MENU_MAX_HEIGHT = 400;

export const MAX_MARKDOWN_IMPORT_FILE_SIZE = 512 * 1024 * 1024;

export const LAYOUT_TRANSITION_TIMEOUT_MS = 6500;
