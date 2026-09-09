import { BlockDragSelection } from "./blockDragSelection.js";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { codeBlockOptions } from "@blocknote/code-block";
import {
  BlockNoteSchema,
  createBlockConfig,
  createBlockSpec,
  createCodeBlockSpec,
  createExtension,
  createHeadingBlockSpec,
  createImageBlockConfig,
  createStyleSpecFromTipTapMark,
  defaultBlockSpecs,
  defaultStyleSpecs,
  imageParse,
  imageRender,
  imageToExternalHTML,
} from "@blocknote/core";
import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core/extensions";
import "@blocknote/core/fonts/inter.css";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { offset, shift, size } from "@floating-ui/react";
import { TextSelection } from "@tiptap/pm/state";
import {
  CellSelection,
  columnResizingPluginKey,
  mergeCells,
  splitCell,
} from "prosemirror-tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  Check,
  Cog,
  Copy,
  Download,
  Ellipsis,
  Eye,
  FileDown,
  History,
  ArrowLeftRight,
  Heading4,
  Maximize2,
  Minimize2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTopClose,
  Pin,
  Plus,
  RotateCcw,
  TableOfContents as TableOfContentsIcon,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  applyEditorColor,
  RecentColorFormattingToolbarController,
  rememberEditorColor,
} from "./editorColorFormatting.jsx";
import {
  BlockMenuHighlightController,
  NotePaneSideMenuController,
} from "./editorSideMenu.jsx";
import {
  autoFitActiveTableColumn,
  previewActiveTableColumnResize,
} from "./tableColumnSizing.js";
import {
  handleToggleBackspace,
  handleToggleEnter,
  handleToggleSpace,
} from "./toggleKeyboard.js";
import notePaneWordmarkDarkUrl from "../assets/notepane-wordmark-dark.png";
import notePaneWordmarkUrl from "../assets/notepane-wordmark.png";
import "./styles.css";

const NOTE_PANE_TEMPLATE_BLOCKS = [
  {
    type: "heading",
    content: "NotePane",
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "A focused workspace for persistent notes, fast session switching, and polished exports.",
        styles: {},
      },
    ],
  },
  {
    type: "quote",
    content:
      "Capture the work, split the context into sessions, and keep the right pane visible when it matters.",
  },
  {
    id: "template-launch-checklist",
    type: "heading",
    props: { isToggleable: true },
    content: "Launch checklist",
    children: [
      {
        type: "paragraph",
        content: "Use this template when the workspace is clear and you are ready to start a new thread.",
      },
    ],
  },
  {
    type: "checkListItem",
    content: "Create one session per meeting, paper, decision, or workstream.",
  },
  {
    type: "checkListItem",
    content: "Pin a sticky window for reference notes that need to stay in view.",
  },
  {
    type: "checkListItem",
    content: "Tune app and editor typography from Preferences before a long writing pass.",
  },
  {
    type: "heading",
    content: "Workspace modes",
  },
  {
    type: "table",
    content: {
      type: "tableContent",
      rows: [
        {
          cells: ["Mode", "Best for", "Action"],
        },
        {
          cells: ["Tabs", "Drafting, comparing, and organizing sessions", "New session"],
        },
        {
          cells: ["Sticky", "Keeping an active note above other windows", "Switch mode"],
        },
        {
          cells: ["Export", "Turning a finished note into a clean PDF", "Export PDF"],
        },
      ],
    },
  },
  {
    type: "image",
    props: {
      url: "https://placehold.co/960x360/1f2937/f8fafc.png?text=NotePane+Workspace",
      caption: "NotePane workspace preview",
    },
  },
  {
    type: "heading",
    content: "Session brief",
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Objective:",
        styles: { bold: true },
      },
      {
        type: "text",
        text: " Define the outcome before adding supporting notes.",
        styles: {},
      },
    ],
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Styled Text",
        styles: {
          bold: true,
          italic: true,
        },
      },
      {
        type: "text",
        text: " can mark the part that needs a decision or follow-up.",
        styles: {},
      },
    ],
  },
  {
    id: "template-follow-up",
    type: "toggleListItem",
    content: "Follow-up",
    children: [
      {
        type: "paragraph",
        content: "Add owners, dates, or unresolved questions before exporting.",
      },
    ],
  },
  {
    type: "codeBlock",
    props: { language: "javascript" },
    content:
      'const session = {\n  status: "ready",\n  panes: ["tabs", "sticky"],\n  export: "polished",\n};',
  },
  {
    type: "paragraph",
  },
];
const NOTE_PANE_TEMPLATE_BLOCKS_JSON = JSON.stringify(NOTE_PANE_TEMPLATE_BLOCKS);

const EMPTY_BLOCKS = [
  {
    type: "paragraph",
  },
];

const notionInlineCodeStyle = createStyleSpecFromTipTapMark(
  defaultStyleSpecs.code.implementation.mark.extend({
    excludes: "bold italic underline strike",
  }),
  "boolean",
);

// Keep the uploaded source separate from the rendered crop. The current crop
// remains the block URL, while every later crop operation starts from this URL.
const createNonDestructiveImageBlockSpec = createBlockSpec(
  createBlockConfig(() => {
    const imageConfig = createImageBlockConfig();
    return {
      ...imageConfig,
      propSchema: {
        ...imageConfig.propSchema,
        originalUrl: { default: "" },
        cropX: { default: undefined, type: "number" },
        cropY: { default: undefined, type: "number" },
        cropWidth: { default: undefined, type: "number" },
        cropHeight: { default: undefined, type: "number" },
      },
    };
  }),
  () => ({
    meta: { fileBlockAccept: ["image/*"] },
    parse: imageParse(),
    render: imageRender(),
    toExternalHTML: imageToExternalHTML(),
    runsBefore: ["file"],
  }),
);

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    image: createNonDestructiveImageBlockSpec(),
    quote: {
      ...defaultBlockSpecs.quote,
      extensions: [
        ...(defaultBlockSpecs.quote.extensions ?? []),
        createExtension({
          key: "notepane-quote-pipe-shortcut",
          keyboardShortcuts: {
            Space: ({ editor }) => {
              const { block } = editor.getTextCursorPosition();
              if (block.type !== "paragraph") {
                return false;
              }

              const marker = (block.content ?? [])
                .filter((content) => content.type === "text")
                .map((content) => content.text)
                .join("");
              if (marker !== "|" && marker !== "\\") {
                return false;
              }

              editor.updateBlock(block, {
                type: "quote",
                props: {},
                content: [],
              });
              return true;
            },
          },
          inputRules: [
            {
              find: /^[|\\]\s$/,
              replace() {
                return { type: "quote", props: {} };
              },
            },
          ],
        }),
      ],
    },
    heading: createHeadingBlockSpec({ levels: [1, 2, 3, 4] }),
  },
}).extend({
  blockSpecs: {
    codeBlock: createCodeBlockSpec(codeBlockOptions),
  },
  styleSpecs: {
    code: notionInlineCodeStyle,
  },
});

const CODE_FORMAT_LANGUAGE_ALIASES = {
  js: "javascript",
  ts: "typescript",
  gql: "graphql",
  md: "markdown",
  yml: "yaml",
};
const CODE_FORMATTERS = {
  javascript: { parser: "babel", plugins: ["babel", "estree"] },
  jsx: { parser: "babel", plugins: ["babel", "estree"] },
  typescript: { parser: "typescript", plugins: ["typescript", "estree"] },
  tsx: { parser: "typescript", plugins: ["typescript", "estree"] },
  json: { parser: "json", plugins: ["babel", "estree"] },
  jsonc: { parser: "jsonc", plugins: ["babel", "estree"] },
  jsonl: { custom: "jsonl" },
  css: { parser: "css", plugins: ["postcss"] },
  postcss: { parser: "css", plugins: ["postcss"] },
  scss: { parser: "scss", plugins: ["postcss"] },
  less: { parser: "less", plugins: ["postcss"] },
  html: { parser: "html", plugins: ["html"] },
  "vue-html": { parser: "html", plugins: ["html"] },
  vue: { parser: "vue", plugins: ["html"] },
  markdown: { parser: "markdown", plugins: ["markdown"] },
  mdx: { parser: "mdx", plugins: ["markdown"] },
  yaml: { parser: "yaml", plugins: ["yaml"] },
  graphql: { parser: "graphql", plugins: ["graphql"] },
};
const CODE_FORMAT_PLUGIN_LOADERS = {
  babel: () => import("prettier/plugins/babel"),
  estree: () => import("prettier/plugins/estree"),
  typescript: () => import("prettier/plugins/typescript"),
  postcss: () => import("prettier/plugins/postcss"),
  html: () => import("prettier/plugins/html"),
  markdown: () => import("prettier/plugins/markdown"),
  yaml: () => import("prettier/plugins/yaml"),
  graphql: () => import("prettier/plugins/graphql"),
};
const loadedCodeFormatPlugins = new Map();

const electronApi = window.blocknoteSticky;
const DEFAULT_TITLE = "Untitled";
const AUTO_TITLE_MAX_LENGTH = 48;
const DEFAULT_APP_THEME = {
  mode: "light",
};
const DEFAULT_LAYOUT_MODE = "tabs";
const DEFAULT_THEME = {
  tabTextColor: null,
  tabTextOpacity: 1,
};
const DEFAULT_EDITOR_FONT_SCALE = 1;
const EDITOR_FONT_SCALE_STEP = 0.08;
const MIN_EDITOR_FONT_SCALE = 0.38;
const MAX_EDITOR_FONT_SCALE = 9;
const BASE_EDITOR_FONT_SIZE_PX = 16;
const MIN_EDITOR_FONT_SIZE_PX = 6;
const MAX_EDITOR_FONT_SIZE_PX = 144;
const EDITOR_FONT_SIZE_PRESETS = [
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
const DEFAULT_EDITOR_FONT_FAMILY = "system";
const DEFAULT_APP_FONT_FAMILY = "inter";
const DEFAULT_KEYBOARD_SHORTCUTS = {
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
const KEYBOARD_SHORTCUT_COMMAND_IDS = Object.keys(DEFAULT_KEYBOARD_SHORTCUTS);
const KEYBOARD_SHORTCUT_TOGGLE_COMMAND_IDS = [
  ...KEYBOARD_SHORTCUT_COMMAND_IDS,
  "selectTabByNumber",
];
const DEFAULT_KEYBOARD_SHORTCUT_ENABLED = Object.fromEntries(
  KEYBOARD_SHORTCUT_TOGGLE_COMMAND_IDS.map((commandId) => [commandId, true]),
);
const DEFAULT_EDITOR_PREFERENCES = {
  editorFontScale: DEFAULT_EDITOR_FONT_SCALE,
  editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
  appFontFamily: DEFAULT_APP_FONT_FAMILY,
  showTableOfContents: false,
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
  keyboardShortcutEnabled: DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
};
const LOCAL_FONT_VALUE_PREFIX = "local:";
const EDITOR_BUILTIN_FONT_FAMILY_OPTIONS = [
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
const SESSION_TAB_ENTER_MS = 190;
const SESSION_TAB_EXIT_MS = 170;
const SESSION_TAB_REORDER_ANIMATION_MS = 180;
const seenSessionTabIds = new Set();
let sessionTabAnimationsPrimed = false;
const MODE_TAB_TEXT_DEFAULTS = {
  light: {
    tabTextColor: "#37352f",
    tabTextOpacity: 1,
  },
  dark: {
    tabTextColor: "#f1f1ef",
    tabTextOpacity: 1,
  },
};
const SESSION_TAB_MODE_BASE_COLORS = {
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
const SESSION_TAB_CONTRAST_TEXT = {
  dark: "#1f1f1f",
  light: "#fbfbfa",
};
const SESSION_TAB_DARK_MODE_TONE_MIX = 0.12;
const STICKY_PASTEL_PALETTE = [
  "#fff2b8",
  "#ffd7e8",
  "#dff4d7",
  "#d9efff",
  "#eadcff",
  "#ffe4ca",
];
const DEFAULT_STICKY_ACCENT_COLOR = STICKY_PASTEL_PALETTE[0];
const DEFAULT_CROP = { x: 0, y: 0, width: 1, height: 1 };
const MIN_CROP_SIZE = 0.02;
const CROP_RESIZE_HANDLES = [
  { id: "nw", label: "top left" },
  { id: "n", label: "top" },
  { id: "ne", label: "top right" },
  { id: "e", label: "right" },
  { id: "se", label: "bottom right" },
  { id: "s", label: "bottom" },
  { id: "sw", label: "bottom left" },
  { id: "w", label: "left" },
];
const SIDEBAR_DEFAULT_WIDTH = 204;
const SIDEBAR_MIN_WIDTH = 156;
const SIDEBAR_MAX_WIDTH = 340;
const SIDEBAR_COLLAPSE_WIDTH = 124;
const SIDEBAR_COMPACT_WIDTH = 64;
const EXPORT_TOAST_TIMEOUT_MS = 2600;
const TRASH_UNDO_TOAST_TIMEOUT_MS = 5200;
const FONT_SIZE_TOAST_TIMEOUT_MS = 1400;
const SLASH_MENU_MAX_HEIGHT = 400;
const MAX_MARKDOWN_IMPORT_FILE_SIZE = 512 * 1024 * 1024;

function createSlashMenuFloatingUIOptions() {
  return {
    useFloatingOptions: {
      placement: "bottom-start",
      middleware: [
        offset(10),
        {
          name: "notepaneSlashMenuPlacement",
          fn({ placement, rects }) {
            const spaceAbove = rects.reference.y;
            const spaceBelow = window.innerHeight -
              (rects.reference.y + rects.reference.height);
            const nextPlacement = spaceAbove > spaceBelow
              ? "top-start"
              : "bottom-start";
            return placement === nextPlacement
              ? {}
              : { reset: { placement: nextPlacement } };
          },
        },
        shift({ padding: 10 }),
        size({
          apply({ elements, availableHeight }) {
            elements.floating.style.maxHeight = `${Math.max(
              0,
              Math.min(availableHeight, SLASH_MENU_MAX_HEIGHT),
            )}px`;
          },
          padding: 10,
        }),
      ],
    },
  };
}
const LAYOUT_TRANSITION_TIMEOUT_MS = 6500;

function App() {
  const [note, setNote] = useState(null);
  const [notes, setNotes] = useState([]);
  const [trashedNotes, setTrashedNotes] = useState([]);
  const [appTheme, setAppTheme] = useState(DEFAULT_APP_THEME);
  const [layoutMode, setLayoutMode] = useState(DEFAULT_LAYOUT_MODE);
  const [installedFontFamilies, setInstalledFontFamilies] = useState([]);
  const [editorPreferences, setEditorPreferences] = useState(
    DEFAULT_EDITOR_PREFERENCES,
  );
  const [recentEditorColors, setRecentEditorColors] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isEditorWide, setIsEditorWide] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sessionUndoToast, setSessionUndoToast] = useState(null);
  const [layoutTransition, setLayoutTransition] = useState(null);
  const sessionUndoToastTimerRef = useRef(null);
  const layoutTransitionTimerRef = useRef(null);

  const rememberRecentEditorColor = useCallback((colorChoice) => {
    setRecentEditorColors((currentColors) =>
      rememberEditorColor(currentColors, colorChoice),
    );
  }, []);

  const clearLayoutTransition = useCallback(() => {
    if (layoutTransitionTimerRef.current) {
      window.clearTimeout(layoutTransitionTimerRef.current);
      layoutTransitionTimerRef.current = null;
    }
    setLayoutTransition(null);
  }, []);

  const showLayoutTransition = useCallback(
    (payload = {}) => {
      if (layoutTransitionTimerRef.current) {
        window.clearTimeout(layoutTransitionTimerRef.current);
        layoutTransitionTimerRef.current = null;
      }

      setLayoutTransition({
        sourceMode: normalizeLayoutMode(payload.sourceMode),
        targetMode: normalizeLayoutMode(payload.targetMode),
        noteCount: Number.isFinite(payload.noteCount)
          ? payload.noteCount
          : notes.length,
      });
      layoutTransitionTimerRef.current = window.setTimeout(() => {
        setLayoutTransition(null);
        layoutTransitionTimerRef.current = null;
      }, LAYOUT_TRANSITION_TIMEOUT_MS);
    },
    [notes.length],
  );

  const hideSessionUndoToast = useCallback(() => {
    if (sessionUndoToastTimerRef.current) {
      window.clearTimeout(sessionUndoToastTimerRef.current);
      sessionUndoToastTimerRef.current = null;
    }
    setSessionUndoToast(null);
  }, []);

  const showSessionMovedToTrashToast = useCallback(({ noteId, title, source = "trash" }) => {
    if (sessionUndoToastTimerRef.current) {
      window.clearTimeout(sessionUndoToastTimerRef.current);
      sessionUndoToastTimerRef.current = null;
    }

    setSessionUndoToast({
      noteId,
      title: normalizeTitle(title),
      source,
    });
    sessionUndoToastTimerRef.current = window.setTimeout(() => {
      setSessionUndoToast(null);
      sessionUndoToastTimerRef.current = null;
    }, TRASH_UNDO_TOAST_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (sessionUndoToastTimerRef.current) {
        window.clearTimeout(sessionUndoToastTimerRef.current);
      }
      if (layoutTransitionTimerRef.current) {
        window.clearTimeout(layoutTransitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNote() {
      const noteId = new URLSearchParams(window.location.search).get("noteId");

      if (!electronApi) {
        const previewNote = {
          id: noteId || "browser-preview",
          title: DEFAULT_TITLE,
          titleManuallyEdited: false,
          blocksJSON: null,
          markdown: "",
          theme: DEFAULT_THEME,
          seedDemoContent: new URLSearchParams(window.location.search)
            .get("template") === "1",
          editorFontScale: DEFAULT_EDITOR_FONT_SCALE,
          editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
	          detached: false,
	          trashedAt: null,
	          sortOrder: notes.length + 1,
	          createdAt: Date.now(),
	          updatedAt: Date.now(),
	        };
        setNotes([previewNote]);
        setTrashedNotes([]);
        setNote(previewNote);
        setLayoutMode(DEFAULT_LAYOUT_MODE);
        return;
      }

      const resolvedNoteId = noteId || await electronApi.getCurrentNoteId();
      const [
        loadedNotes,
        loadedAppTheme,
        loadedLayoutMode,
        loadedEditorPreferences,
        loadedTrashedNotes,
      ] = await Promise.all([
        electronApi.listNotes(),
        electronApi.getAppTheme?.(),
        electronApi.getLayoutMode?.(),
        electronApi.getEditorPreferences?.(),
        electronApi.listTrash?.(),
      ]);
      const loadedNote = resolvedNoteId
        ? await electronApi.getNote(resolvedNoteId)
        : null;

      if (!cancelled) {
        setAppTheme(normalizeAppTheme(loadedAppTheme));
        setLayoutMode(normalizeLayoutMode(loadedLayoutMode));
        setEditorPreferences(normalizeEditorPreferences(loadedEditorPreferences));
        const fallbackNote =
          loadedNote ??
          loadedNotes[0] ?? {
            id: "missing-note",
            title: DEFAULT_TITLE,
            titleManuallyEdited: false,
            blocksJSON: null,
            markdown: "",
            theme: DEFAULT_THEME,
            seedDemoContent: false,
            editorFontScale: DEFAULT_EDITOR_FONT_SCALE,
            editorFontFamily: DEFAULT_EDITOR_FONT_FAMILY,
            detached: false,
            trashedAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        setNotes(mergeNotes(loadedNotes, fallbackNote));
        setTrashedNotes(Array.isArray(loadedTrashedNotes) ? loadedTrashedNotes : []);
        setNote(fallbackNote);
      }
    }

    loadNote();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return electronApi?.onAppThemeChanged?.((nextAppTheme) => {
      setAppTheme(normalizeAppTheme(nextAppTheme));
    });
  }, []);

  useEffect(() => {
    return electronApi?.onLayoutModeChanged?.((nextLayoutMode) => {
      setLayoutMode(normalizeLayoutMode(nextLayoutMode));
    });
  }, []);

  useEffect(() => {
    return electronApi?.onLayoutModeTransition?.((payload) => {
      if (payload?.phase === "start") {
        showLayoutTransition(payload);
        return;
      }

      if (payload?.phase === "finish") {
        clearLayoutTransition();
      }
    });
  }, [clearLayoutTransition, showLayoutTransition]);

  useEffect(() => {
    return electronApi?.onNotesChanged?.((payload) => {
      const nextNotes = Array.isArray(payload?.notes) ? payload.notes : [];
      const nextTrashedNotes = Array.isArray(payload?.trash) ? payload.trash : null;
      const activeNote = payload?.activeNote;

      setNotes(nextNotes);
      if (nextTrashedNotes) {
        setTrashedNotes(nextTrashedNotes);
      }
      setNote((currentNote) => {
        if (activeNote?.id) {
          return activeNote;
        }

        return (
          nextNotes.find((candidate) => candidate.id === currentNote?.id) ??
          nextNotes[0] ??
          currentNote
        );
      });
    });
  }, []);

  useEffect(() => {
    return electronApi?.onEditorPreferencesChanged?.((nextEditorPreferences) => {
      setEditorPreferences(normalizeEditorPreferences(nextEditorPreferences));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInstalledFonts() {
      const fontFamilies = await electronApi?.listFonts?.();
      if (!cancelled && Array.isArray(fontFamilies)) {
        setInstalledFontFamilies(fontFamilies);
      }
    }

    void loadInstalledFonts();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectNote = useCallback(
    async (noteId) => {
      const nextNote = electronApi
        ? await electronApi.activateNote(noteId)
        : notes.find((candidate) => candidate.id === noteId);

      if (nextNote) {
        setNote(nextNote);
        setNotes((currentNotes) => mergeNotes(currentNotes, nextNote));
      }
    },
    [notes],
  );

  const createSidebarNote = useCallback(async (options = {}) => {
    const template = options?.template === "default" ? "default" : "blank";
    const nextNote = electronApi
      ? await electronApi.createNote({ template })
      : {
          id: crypto.randomUUID(),
          title: template === "default" ? "NotePane" : DEFAULT_TITLE,
          titleManuallyEdited: false,
          blocksJSON:
            template === "default" ? NOTE_PANE_TEMPLATE_BLOCKS_JSON : null,
          markdown: "",
          theme: DEFAULT_THEME,
          seedDemoContent: false,
          editorFontScale: editorPreferences.editorFontScale,
          editorFontFamily: editorPreferences.editorFontFamily,
          detached: false,
          trashedAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

    setNotes((currentNotes) => mergeNotes(currentNotes, nextNote));

    if (electronApi) {
      const currentLayoutMode = normalizeLayoutMode(
        await electronApi.getLayoutMode?.() ?? layoutMode,
      );
      if (currentLayoutMode === "sticky") {
        return nextNote;
      }

      const activatedNote = await electronApi.activateNote(nextNote.id);
      setNote(activatedNote ?? nextNote);
      return;
    }

    setNote(nextNote);
  }, [editorPreferences, layoutMode, notes.length]);

  const reorderNotes = useCallback(
    async (orderedNoteIds, options = {}) => {
      const shouldPersist = options.persist !== false;
      setNotes((currentNotes) => reorderNotesByIds(currentNotes, orderedNoteIds));

      if (!electronApi || !shouldPersist) {
        return null;
      }

      const result = await electronApi.reorderNotes?.(orderedNoteIds);
      if (Array.isArray(result?.notes)) {
        setNotes(result.notes);
      }
      if (result?.activeNote) {
        setNote(result.activeNote);
      }
      return result;
    },
    [],
  );

  const deleteSidebarNote = useCallback(
    async (noteId, noteSnapshot = null) => {
      if (electronApi) {
        const result = await electronApi.deleteNote(noteId);
        const nextNotes = Array.isArray(result?.notes)
          ? result.notes
          : await electronApi.listNotes();
        const nextTrashedNotes = Array.isArray(result?.trash)
          ? result.trash
          : await electronApi.listTrash?.();
        const nextNote =
          result?.activeNote ??
          (note?.id === noteId
            ? nextNotes[0]
            : nextNotes.find((candidate) => candidate.id === note?.id));

        setNotes(nextNotes);
        if (Array.isArray(nextTrashedNotes)) {
          setTrashedNotes(nextTrashedNotes);
        }
        if (nextNote) {
          setNote(nextNote);
        }
        return result;
      }

      const storedDeletedNote = notes.find((candidate) => candidate.id === noteId);
      const deletedNote =
        noteSnapshot?.id === noteId
          ? { ...storedDeletedNote, ...noteSnapshot }
          : storedDeletedNote;
      if (!deletedNote) {
        return {
          deleted: false,
          notes,
          trash: trashedNotes,
          activeNote: note,
        };
      }
      const deletedNoteIndex = notes.findIndex((candidate) => candidate.id === noteId);
      const nextNotes = notes.filter((candidate) => candidate.id !== noteId);
      const now = Date.now();
      const trashedNote = {
        ...deletedNote,
        alwaysOnTop: false,
        detached: false,
        trashedAt: now,
        updatedAt: now,
      };
      const templateNote =
        nextNotes.length === 0 ? createTemplateSessionNote(deletedNote, now) : null;
      const visibleNotes = templateNote ? [templateNote] : nextNotes;
      setNotes(visibleNotes);
      setTrashedNotes((currentTrashedNotes) =>
        mergeTrashedNotes(currentTrashedNotes, trashedNote),
      );
      const nextNote =
        templateNote ??
        (note?.id === noteId
          ? nextNotes[deletedNoteIndex] ?? nextNotes[deletedNoteIndex - 1] ?? null
          : note);
      if (nextNote) {
        setNote(nextNote);
      }

      return {
        deleted: true,
        notes: visibleNotes,
        trash: mergeTrashedNotes(trashedNotes, trashedNote),
        activeNote: nextNote,
      };
    },
    [note, notes, trashedNotes],
  );

  const restoreTrashedNote = useCallback(
    async (noteId, options = {}) => {
      if (electronApi) {
        const result = await electronApi.restoreNote?.(noteId);
        const nextNotes = Array.isArray(result?.notes)
          ? result.notes
          : await electronApi.listNotes();
        const nextTrashedNotes = Array.isArray(result?.trash)
          ? result.trash
          : await electronApi.listTrash?.();
        const restoredNote = result?.note ?? nextNotes.find((candidate) => candidate.id === noteId);
        const nextNote =
          options.activate && restoredNote
            ? await electronApi.activateNote(restoredNote.id)
            : result?.activeNote ?? restoredNote ?? nextNotes[0] ?? null;

        setNotes(nextNotes);
        if (Array.isArray(nextTrashedNotes)) {
          setTrashedNotes(nextTrashedNotes);
        }
        if (nextNote) {
          setNote(nextNote);
        }
        return {
          ...result,
          activeNote: nextNote,
        };
      }

      const restoredNote = trashedNotes.find((candidate) => candidate.id === noteId);
      if (!restoredNote) {
        return;
      }

      const activeNote = {
        ...restoredNote,
        alwaysOnTop: false,
        detached: false,
        trashedAt: null,
        updatedAt: Date.now(),
      };
      setTrashedNotes((currentTrashedNotes) =>
        currentTrashedNotes.filter((candidate) => candidate.id !== noteId),
      );
      setNotes((currentNotes) => mergeNotes(currentNotes, activeNote));
      if (options.activate) {
        setNote(activeNote);
      } else {
        setNote((currentNote) => currentNote ?? activeNote);
      }
      return {
        restored: true,
        note: activeNote,
        activeNote,
      };
    },
    [trashedNotes],
  );

  const undoSessionMoveToTrash = useCallback(async () => {
    const noteId = sessionUndoToast?.noteId;
    if (!noteId) {
      return;
    }

    hideSessionUndoToast();
    await restoreTrashedNote(noteId, { activate: true });
  }, [hideSessionUndoToast, restoreTrashedNote, sessionUndoToast?.noteId]);

  const purgeTrashedNote = useCallback(
    async (noteId) => {
      if (electronApi) {
        const result = await electronApi.purgeNote?.(noteId);
        const nextTrashedNotes = Array.isArray(result?.trash)
          ? result.trash
          : await electronApi.listTrash?.();
        if (Array.isArray(result?.notes)) {
          setNotes(result.notes);
        }
        if (Array.isArray(nextTrashedNotes)) {
          setTrashedNotes(nextTrashedNotes);
        }
        if (result?.activeNote) {
          setNote(result.activeNote);
        }
        return;
      }

      setTrashedNotes((currentTrashedNotes) =>
        currentTrashedNotes.filter((candidate) => candidate.id !== noteId),
      );
    },
    [],
  );

  const updateNoteInList = useCallback((updatedNote) => {
    setNotes((currentNotes) => mergeNotes(currentNotes, updatedNote));
    setNote((currentNote) =>
      currentNote?.id === updatedNote.id
        ? { ...currentNote, ...updatedNote }
      : currentNote,
    );
  }, []);

  const updateAppThemeMode = useCallback(async (mode) => {
    const nextAppTheme = normalizeAppTheme({ mode });
    setAppTheme(nextAppTheme);
    await electronApi?.updateAppTheme?.(nextAppTheme);
  }, []);

  const updateLayoutMode = useCallback(async (mode) => {
    const previousLayoutMode = normalizeLayoutMode(layoutMode);
    const nextLayoutMode = normalizeLayoutMode(mode);
    const isChangingMode = previousLayoutMode !== nextLayoutMode;

    if (isChangingMode) {
      showLayoutTransition({
        sourceMode: previousLayoutMode,
        targetMode: nextLayoutMode,
        noteCount: notes.length,
      });
    }

    setLayoutMode(nextLayoutMode);
    try {
      const resolvedLayoutMode = await electronApi?.updateLayoutMode?.(nextLayoutMode);
      if (resolvedLayoutMode) {
        setLayoutMode(normalizeLayoutMode(resolvedLayoutMode));
      }
    } catch (error) {
      setLayoutMode(previousLayoutMode);
      console.error("Layout mode update failed", error);
    } finally {
      if (isChangingMode) {
        clearLayoutTransition();
      }
    }
  }, [clearLayoutTransition, layoutMode, notes.length, showLayoutTransition]);

  const updateEditorPreferences = useCallback(async (nextEditorPreferences) => {
    const normalizedEditorPreferences =
      normalizeEditorPreferences(nextEditorPreferences);
    setEditorPreferences(normalizedEditorPreferences);
    await electronApi?.updateEditorPreferences?.(normalizedEditorPreferences);
  }, []);

  const detachNote = useCallback(async (noteId) => {
    const result = await electronApi?.detachNote?.(noteId);
    if (!result) {
      return;
    }

    if (Array.isArray(result.notes)) {
      setNotes(result.notes);
    }
    if (result.activeNote) {
      setNote(result.activeNote);
    }
  }, []);

  const attachNote = useCallback(async (noteId) => {
    const result = await electronApi?.attachNote?.(noteId);
    if (!result) {
      return;
    }

    if (Array.isArray(result.notes)) {
      setNotes(result.notes);
    }
    if (result.activeNote) {
      setNote(result.activeNote);
    }
  }, []);

  if (!note) {
    return <div className="loading">Loading BlockNote…</div>;
  }

  return (
    <>
      <StickyEditor
        key={note.id}
        note={note}
        notes={notes}
        trashedNotes={trashedNotes}
        appTheme={appTheme}
        layoutMode={layoutMode}
        isSidebarOpen={isSidebarOpen}
        isEditorWide={isEditorWide}
        onEditorWidthChange={setIsEditorWide}
        setIsSidebarOpen={setIsSidebarOpen}
        sidebarWidth={sidebarWidth}
        setSidebarWidth={setSidebarWidth}
        onCreateNote={createSidebarNote}
        onDeleteNote={deleteSidebarNote}
        onRestoreTrashedNote={restoreTrashedNote}
        onPurgeTrashedNote={purgeTrashedNote}
        onSelectNote={selectNote}
        onNoteChanged={updateNoteInList}
        onAppThemeModeChanged={updateAppThemeMode}
        onLayoutModeChanged={updateLayoutMode}
        onDetachNote={detachNote}
        onAttachNote={attachNote}
        onReorderNotes={reorderNotes}
        onSessionMovedToTrash={showSessionMovedToTrashToast}
        installedFontFamilies={installedFontFamilies}
        editorPreferences={editorPreferences}
        onEditorPreferencesChanged={updateEditorPreferences}
        recentEditorColors={recentEditorColors}
        onEditorColorUsed={rememberRecentEditorColor}
        layoutTransition={layoutTransition}
      />
      {sessionUndoToast && (
        <StickyToast
        toast={{
            message:
              sessionUndoToast.source === "close"
                ? `${sessionUndoToast.title} closed.`
                : `${sessionUndoToast.title} moved to Trash.`,
            tone: "success",
            action: {
              label: "Undo",
              onClick: () => void undoSessionMoveToTrash(),
            },
          }}
        />
      )}
    </>
  );
}

function StickyEditor({
  note,
  notes,
  trashedNotes,
  appTheme,
  layoutMode,
  isSidebarOpen,
  isEditorWide,
  onEditorWidthChange,
  setIsSidebarOpen,
  sidebarWidth,
  setSidebarWidth,
  onCreateNote,
  onDeleteNote,
  onRestoreTrashedNote,
  onPurgeTrashedNote,
  onSelectNote,
  onNoteChanged,
  onAppThemeModeChanged,
  onLayoutModeChanged,
  onDetachNote,
  onAttachNote,
  onReorderNotes,
  onSessionMovedToTrash,
  installedFontFamilies,
  editorPreferences,
  onEditorPreferencesChanged,
  recentEditorColors,
  onEditorColorUsed,
  layoutTransition,
}) {
  const parsedStoredBlocks = useMemo(
    () => parseBlocksJSON(note.blocksJSON),
    [note.blocksJSON],
  );
  const initialEditorContent = useMemo(
    () =>
      parsedStoredBlocks ??
      (note.seedDemoContent ? NOTE_PANE_TEMPLATE_BLOCKS : EMPTY_BLOCKS),
    [note.seedDemoContent, parsedStoredBlocks],
  );
  const initialDisplayTitle = useMemo(
    () => getNoteDisplayTitle(note, initialEditorContent),
    [initialEditorContent, note],
  );

  const editor = useCreateBlockNote({
    schema,
    extensions: [BlockDragSelection],
    initialContent: initialEditorContent,
    tabBehavior: "prefer-indent",
    tables: {
      splitCells: true,
      cellBackgroundColor: true,
      cellTextColor: true,
      headers: true,
    },
    uploadFile,
    pasteHandler: ({ event, editor, defaultPasteHandler }) => {
      const plainText = event.clipboardData?.getData("text/plain") ?? "";
      if (plainText && !isSelectionInsideCodeBlock(editor)) {
        if (
          isStandaloneWebUrl(plainText) &&
          hasEditorRangeSelection(editor)
        ) {
          editor.insertInlineContent(plainText.trim(), { updateSelection: true });
          return true;
        }

        const normalizedPaste = normalizePastedMarkdownForBlockNote(plainText);
        if (normalizedPaste.shouldPasteAsMarkdown) {
          editor.pasteMarkdown(normalizedPaste.markdown);
          return true;
        }
      }

      return defaultPasteHandler({
        prioritizeMarkdownOverHTML: true,
        plainTextAsMarkdown: true,
      });
    },
  });
  useBlockNoteFloatingMenuGuard();
  const codeBlockToolTargets = useCodeBlockToolTargets();

  useEffect(() => {
    const copySelectedBlock = (event) => {
      if (
        event.type !== "copy" ||
        !event.clipboardData
      ) {
        return false;
      }

      const selectedBlocks = getBlocksForClipboard(editor);
      if (selectedBlocks.length === 0) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();
      const externalHTML = editor.blocksToHTMLLossy(selectedBlocks);
      const clipboardHTML = editor.blocksToFullHTML(selectedBlocks);
      const markdown = editor.blocksToMarkdownLossy(selectedBlocks);
      event.clipboardData.clearData();
      event.clipboardData.setData("blocknote/html", clipboardHTML);
      event.clipboardData.setData("text/html", externalHTML);
      event.clipboardData.setData("text/plain", markdown);
      return true;
    };

    const normalizeEditorClipboardText = (event) => {
      if (copySelectedBlock(event)) {
        return;
      }
      if (!isEditorShortcutTarget(event.target) || !event.clipboardData) {
        return;
      }

      const copiedPlainText = event.clipboardData.getData("text/plain");
      const selectedPlainText = window.getSelection()?.toString() ?? "";
      const normalizedPlainText = normalizeCopiedEditorPlainText(
        editor,
        copiedPlainText,
        selectedPlainText,
      );
      if (normalizedPlainText !== copiedPlainText) {
        event.clipboardData.setData("text/plain", normalizedPlainText);
      }
    };

    document.addEventListener("copy", normalizeEditorClipboardText, true);
    document.addEventListener("cut", normalizeEditorClipboardText, true);
    return () => {
      document.removeEventListener("copy", normalizeEditorClipboardText, true);
      document.removeEventListener("cut", normalizeEditorClipboardText, true);
    };
  }, [editor]);

  const [title, setTitle] = useState(initialDisplayTitle);
  const editorSurfaceRef = useRef(null);
  const suppressFocusedTableCellRef = useRef(false);
  const pendingTableExtensionFocusRef = useRef(null);
  const focusedTableDecorationsRef = useRef(null);
  const [isTableCellSelectionDismissed, setIsTableCellSelectionDismissed] =
    useState(false);
  const [isMultiTableCellSelection, setIsMultiTableCellSelection] = useState(
    false,
  );
  const updateFocusedTableCell = useCallback(() => {}, []);
  useEffect(() => {
    const view = editor.prosemirrorView;
    if (!view || view.isDestroyed) {
      return undefined;
    }
    const decorations = (state) => {
        if (
          suppressFocusedTableCellRef.current ||
          columnResizingPluginKey.getState(state)?.dragging
        ) {
          return DecorationSet.empty;
        }
        const selection = state.selection;
        const isSingleCellSelection = Boolean(
          selection.$anchorCell &&
            selection.$headCell &&
            selection.$anchorCell.pos === selection.$headCell.pos,
        );
        if (!selection.empty && !isSingleCellSelection && !pendingTableExtensionFocusRef.current) {
          return DecorationSet.empty;
        }
        const preservedCell = pendingTableExtensionFocusRef.current
          ? getTableCellElementForSnapshot(editor, pendingTableExtensionFocusRef.current)
          : null;
        const preservedRange = preservedCell
          ? getCurrentTableCellRange({
              $from: state.doc.resolve(view.posAtDOM(preservedCell, 0)),
            })
          : null;
        const cellRange = preservedRange || getCurrentTableCellRange(selection);
        const cellNode = cellRange ? state.doc.nodeAt(cellRange.cellPos) : null;
        if (!cellRange || !cellNode) {
          return DecorationSet.empty;
        }
        return DecorationSet.create(state.doc, [
          Decoration.node(
            cellRange.cellPos,
            cellRange.cellPos + cellNode.nodeSize,
            { class: "notepane-table-cell-focused" },
          ),
        ]);
      };
    focusedTableDecorationsRef.current = decorations;
    view.setProps({ decorations });
    return () => {
      if (!view.isDestroyed) {
        view.setProps({ decorations: undefined });
      }
      focusedTableDecorationsRef.current = null;
    };
  }, [editor]);
  useEffect(() => {
    const isTableExtensionButton = (target) => (
      target instanceof Element && target.closest(
        ".bn-extend-button-add-remove-columns, .bn-extend-button-add-remove-rows",
      )
    );
    const captureFocusedCellBeforeTableExtension = (event) => {
      if (!isTableExtensionButton(event.target)) {
        return;
      }

      pendingTableExtensionFocusRef.current = getFocusedTableCellSnapshot(editor);
    };
    const restoreFocusedCellAfterTableExtension = () => {
      const pendingSnapshot = pendingTableExtensionFocusRef.current;
      if (!pendingSnapshot) {
        return;
      }

      window.requestAnimationFrame(() => {
        const snapshot = pendingTableExtensionFocusRef.current;
        pendingTableExtensionFocusRef.current = null;
        if (snapshot && restoreFocusedTableCell(editor, snapshot)) {
          updateFocusedTableCell();
        }
      });
    };

    const handleTableExtensionMouseUp = () => {
      restoreFocusedCellAfterTableExtension();
    };
    const handleTableExtensionClick = (event) => {
      if (!(event.target instanceof Element) || !event.target.closest(
        ".bn-extend-button-add-remove-columns, .bn-extend-button-add-remove-rows",
      )) {
        return;
      }
      restoreFocusedCellAfterTableExtension();
    };

    document.addEventListener("mousedown", captureFocusedCellBeforeTableExtension, true);
    document.addEventListener("mouseup", handleTableExtensionMouseUp, true);
    document.addEventListener("click", handleTableExtensionClick, true);
    return () => {
      document.removeEventListener("mousedown", captureFocusedCellBeforeTableExtension, true);
      document.removeEventListener("mouseup", handleTableExtensionMouseUp, true);
      document.removeEventListener("click", handleTableExtensionClick, true);
    };
  }, [editor, updateFocusedTableCell]);
  const updateTableCellSelectionMode = useCallback(() => {
    const selection = editor.prosemirrorView?.state.selection;
    setIsMultiTableCellSelection(
      Boolean(
        selection?.$anchorCell &&
          selection?.$headCell &&
          selection.$anchorCell.pos !== selection.$headCell.pos,
      ),
    );
  }, [editor]);
  const [theme, setTheme] = useState(normalizeTheme(note.theme));
  const normalizedEditorPreferences = useMemo(
    () => normalizeEditorPreferences(editorPreferences),
    [editorPreferences],
  );
  const editorFontScale = normalizedEditorPreferences.editorFontScale;
  const editorFontFamily = normalizedEditorPreferences.editorFontFamily;
  const appFontFamily = normalizedEditorPreferences.appFontFamily;
  const showTableOfContents = normalizedEditorPreferences.showTableOfContents;
  const keyboardShortcuts = normalizedEditorPreferences.keyboardShortcuts;
  const keyboardShortcutEnabled =
    normalizedEditorPreferences.keyboardShortcutEnabled;
  const matchesEnabledKeyboardShortcut = useCallback(
    (event, commandId) =>
      isKeyboardShortcutEnabled(keyboardShortcutEnabled, commandId) &&
      matchesKeyboardShortcut(event, keyboardShortcuts[commandId]),
    [keyboardShortcutEnabled, keyboardShortcuts],
  );
  const getEnabledShortcut = useCallback(
    (commandId) =>
      isKeyboardShortcutEnabled(keyboardShortcutEnabled, commandId)
        ? keyboardShortcuts[commandId]
        : "",
    [keyboardShortcutEnabled, keyboardShortcuts],
  );
  const editorFontOptions = useMemo(
    () => getEditorFontFamilyOptions(installedFontFamilies, editorFontFamily),
    [editorFontFamily, installedFontFamilies],
  );
  const appFontOptions = useMemo(
    () => getEditorFontFamilyOptions(installedFontFamilies, appFontFamily),
    [appFontFamily, installedFontFamilies],
  );
  const appTypographyStyle = useMemo(() => {
    const appFontFamilyCss = getEditorFontFamilyCss(
      appFontFamily,
      appFontOptions,
    );
    return {
      "--notepane-ui-font": appFontFamilyCss,
      "--notepane-display-font": appFontFamilyCss,
    };
  }, [appFontFamily, appFontOptions]);
  const appThemeMode = normalizeAppTheme(appTheme).mode;
  const normalizedLayoutMode = normalizeLayoutMode(layoutMode);
  const effectiveLayoutMode =
    normalizedLayoutMode === "sticky" || note.detached ? "sticky" : "tabs";
  const dockedNotes = useMemo(
    () => notes.filter((candidate) => !candidate.detached),
    [notes],
  );
  const visibleSessionNotes = dockedNotes.length > 0 ? dockedNotes : notes;
  const visibleSessionNoteIds = useMemo(
    () => visibleSessionNotes.map((sessionNote) => sessionNote.id),
    [visibleSessionNotes],
  );
  const noteIndexById = useMemo(
    () => new Map(notes.map((candidate, index) => [candidate.id, index])),
    [notes],
  );
  const noteIndex = noteIndexById.get(note.id) ?? 0;
  const stickyAccentColor = resolveStickyAccentColor(theme, noteIndex);
  const stickyChromeStyle = useMemo(
    () =>
      effectiveLayoutMode === "sticky"
        ? getStickyShellStyle(theme, stickyAccentColor, appThemeMode)
        : {},
    [appThemeMode, effectiveLayoutMode, stickyAccentColor, theme],
  );
  const shellStyle = {
    ...stickyChromeStyle,
    ...appTypographyStyle,
    "--editor-font-scale": String(editorFontScale),
    "--editor-font-family": getEditorFontFamilyCss(
      editorFontFamily,
      editorFontOptions,
    ),
  };
  const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
  const [isPreferencesWindowOpen, setIsPreferencesWindowOpen] = useState(false);
  const [preferencesInitialPage, setPreferencesInitialPage] = useState("general");
  const [isStickySettingsOpen, setIsStickySettingsOpen] = useState(false);
  const [isStickyTrashConfirmOpen, setIsStickyTrashConfirmOpen] = useState(false);
  const [isStickyActionBarOpen, setIsStickyActionBarOpen] = useState(false);
  const [isDefaultTemplateSuggestionVisible, setIsDefaultTemplateSuggestionVisible] =
    useState(
      () =>
        effectiveLayoutMode === "tabs" &&
        isEmptySessionDocument(initialEditorContent),
    );
  const [pendingSessionTrashNote, setPendingSessionTrashNote] = useState(null);
  const [pendingSessionCloseNote, setPendingSessionCloseNote] = useState(null);
  const [sessionTabMenu, setSessionTabMenu] = useState(null);
  const [sessionColorPanelNoteId, setSessionColorPanelNoteId] = useState(null);
  const [isEditorActive, setIsEditorActive] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [draftSessionTitle, setDraftSessionTitle] = useState("");
  const [isDraftSessionTitleDirty, setIsDraftSessionTitleDirty] = useState(false);
  const [enteringSessionIds, setEnteringSessionIds] = useState(() => new Set());
  const [removingSessionIds, setRemovingSessionIds] = useState(() => new Set());
  const [draggingSessionNoteId, setDraggingSessionNoteId] = useState(null);
  const [isPinned, setIsPinned] = useState(Boolean(note.alwaysOnTop));
  const [activeImageBlockId, setActiveImageBlockId] = useState(null);
  const [cropState, setCropState] = useState(null);
  const [exportToast, setExportToast] = useState(null);
  const [exportFormatMenu, setExportFormatMenu] = useState(null);
  const [isMarkdownImportOpen, setIsMarkdownImportOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [noteVersions, setNoteVersions] = useState([]);
  const [isVersionBusy, setIsVersionBusy] = useState(false);
  const [editorFontSizeToast, setEditorFontSizeToast] = useState("");
  const [tableOfContentsEntries, setTableOfContentsEntries] = useState(() =>
    extractTableOfContentsEntries(initialEditorContent),
  );
  const [activeTableOfContentsEntryIds, setActiveTableOfContentsEntryIds] =
    useState(() => (tableOfContentsEntries[0]?.id ? [tableOfContentsEntries[0].id] : []));
  const saveTimerRef = useRef(null);
  const saveRetryTimerRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const isEditorDirtyRef = useRef(false);
  const appearanceTimerRef = useRef(null);
  const sessionAppearanceTimerRef = useRef(null);
  const exportToastTimerRef = useRef(null);
  const editorFontSizeToastTimerRef = useRef(null);
  const sessionTabRowsRef = useRef(new Map());
  const previousSessionTabRectsRef = useRef(null);
  const dragOriginalSessionOrderRef = useRef(null);
  const dragPreviewSessionOrderRef = useRef(null);
  const dragHasReorderedRef = useRef(false);
  const dragDroppedInsideRef = useRef(false);
  const lastSavedBlocksRef = useRef("");
  const isSidebarCompact = effectiveLayoutMode === "tabs" && !isSidebarOpen;
  const sidebarState = isSidebarCompact ? "compact" : "expanded";
  const sidebarStyle = {
    "--session-sidebar-width": `${
      isSidebarCompact ? SIDEBAR_COMPACT_WIDTH : sidebarWidth
    }px`,
  };
  const isTableOfContentsVisible =
    effectiveLayoutMode === "tabs" &&
    showTableOfContents &&
    tableOfContentsEntries.length > 0;
  const shouldRenderChromeHeader =
    effectiveLayoutMode === "sticky" || !isWindowsRuntime();

  useEffect(() => {
    document.body.classList.toggle("theme-dark", appThemeMode === "dark");
    document.body.classList.toggle("theme-light", appThemeMode === "light");
    document.body.dataset.themeMode = appThemeMode;

    return () => {
      document.body.classList.remove("theme-dark", "theme-light");
      delete document.body.dataset.themeMode;
    };
  }, [appThemeMode]);

  useEffect(() => {
    const portalStyleEntries = Object.entries({
      ...stickyChromeStyle,
      ...appTypographyStyle,
    });

    for (const [name, value] of portalStyleEntries) {
      document.body.style.setProperty(name, value);
    }

    return () => {
      for (const [name] of portalStyleEntries) {
        document.body.style.removeProperty(name);
      }
    };
  }, [appTypographyStyle, stickyChromeStyle]);

  useEffect(() => {
    setIsPinned(Boolean(note.alwaysOnTop));
  }, [note.alwaysOnTop, note.id]);

  useEffect(() => {
    setTitle(getNoteDisplayTitle(note, editor.document));
  }, [
    editor,
    note.blocksJSON,
    note.id,
    note.markdown,
    note.title,
    note.titleManuallyEdited,
  ]);

  const showExportToast = useCallback((message, tone = "success", options = {}) => {
    if (exportToastTimerRef.current) {
      window.clearTimeout(exportToastTimerRef.current);
      exportToastTimerRef.current = null;
    }

    const action =
      typeof options.onAction === "function" && options.actionLabel
        ? {
            label: options.actionLabel,
            onClick: options.onAction,
          }
        : null;

    setExportToast({ action, message, tone });

    const timeout = options.timeout ?? EXPORT_TOAST_TIMEOUT_MS;
    if (timeout > 0) {
      exportToastTimerRef.current = window.setTimeout(() => {
        setExportToast(null);
        exportToastTimerRef.current = null;
      }, timeout);
    }
  }, []);

  const hideExportToast = useCallback(() => {
    if (exportToastTimerRef.current) {
      window.clearTimeout(exportToastTimerRef.current);
      exportToastTimerRef.current = null;
    }
    setExportToast(null);
  }, []);

  const showEditorFontSizeToast = useCallback((nextEditorFontScale) => {
    if (editorFontSizeToastTimerRef.current) {
      window.clearTimeout(editorFontSizeToastTimerRef.current);
      editorFontSizeToastTimerRef.current = null;
    }

    setEditorFontSizeToast(
      `Font size ${editorFontScaleToSize(nextEditorFontScale)}px`,
    );

    editorFontSizeToastTimerRef.current = window.setTimeout(() => {
      setEditorFontSizeToast("");
      editorFontSizeToastTimerRef.current = null;
    }, FONT_SIZE_TOAST_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    if (effectiveLayoutMode !== "sticky") {
      setIsStickySettingsOpen(false);
      setIsStickyTrashConfirmOpen(false);
      setIsStickyActionBarOpen(false);
    }
    if (effectiveLayoutMode !== "tabs") {
      setPendingSessionTrashNote(null);
      setPendingSessionCloseNote(null);
    }
  }, [effectiveLayoutMode, note.id]);

  useEffect(() => {
    if (!pendingSessionTrashNote) {
      return;
    }

    const stillVisible = visibleSessionNotes.some(
      (sessionNote) => sessionNote.id === pendingSessionTrashNote.id,
    );
    if (!stillVisible) {
      setPendingSessionTrashNote(null);
    }
  }, [pendingSessionTrashNote, visibleSessionNotes]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (
        target.closest(".editor-font-setting-control") ||
        target.closest(".editor-floating-menu") ||
        target.closest(".session-tab-context-menu") ||
        target.closest(".export-format-menu") ||
        target.closest(".export-icon-button")
      ) {
        return;
      }

      setSessionTabMenu(null);
      setExportFormatMenu(null);
      if (!target.closest(".sticky-header-actions")) {
        setIsStickyActionBarOpen(false);
      }

      if (
        !target.closest("[data-testid='sticky-editor-surface']")
      ) {
        setIsEditorActive(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);

  useEffect(() => {
    if (parsedStoredBlocks || !note.markdown?.trim()) {
      return;
    }

    try {
      const blocks = editor.tryParseMarkdownToBlocks(note.markdown);
      if (blocks.length > 0) {
        editor.replaceBlocks(editor.document, blocks);
        setTableOfContentsEntries(extractTableOfContentsEntries(blocks));
      }
    } catch {
      const fallbackBlocks = [
        {
          type: "paragraph",
          content: note.markdown,
        },
      ];
      editor.replaceBlocks(editor.document, fallbackBlocks);
      setTableOfContentsEntries(extractTableOfContentsEntries(fallbackBlocks));
    }
  }, [editor, note.markdown, parsedStoredBlocks]);

  const updateAutomaticTitleFromBlocks = useCallback(
    (blocks) => {
      if (isTitleManuallyEdited(note)) {
        return normalizeTitle(note.title);
      }

      const nextTitle = deriveAutomaticTitleFromBlocks(blocks);
      setTitle((currentTitle) => currentTitle === nextTitle ? currentTitle : nextTitle);
      if (normalizeTitle(note.title) !== nextTitle || note.titleManuallyEdited !== false) {
        onNoteChanged({
          ...note,
          title: nextTitle,
          titleManuallyEdited: false,
        });
      }
      return nextTitle;
    },
    [note, onNoteChanged],
  );

  const getCurrentNoteSnapshot = useCallback(() => ({
    ...note,
    title: getNoteDisplayTitle(note, editor.document),
    titleManuallyEdited: isTitleManuallyEdited(note),
    blocksJSON: JSON.stringify(editor.document),
  }), [editor, note]);

  const saveNow = useCallback((options = {}) => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!electronApi?.saveContent) {
      return saveQueueRef.current;
    }

    const pendingSave = saveQueueRef.current.then(async () => {
      const blocksJSON = JSON.stringify(editor.document);
      if (blocksJSON === lastSavedBlocksRef.current) {
        isEditorDirtyRef.current = false;
        return;
      }

      let markdown = "";
      try {
        markdown = await editor.blocksToMarkdownLossy(editor.document);
      } catch {
        markdown = "";
      }

      const savedNote = await electronApi.saveContent({
        noteId: note.id,
        blocksJSON,
        markdown,
      });
      lastSavedBlocksRef.current = blocksJSON;
      isEditorDirtyRef.current = JSON.stringify(editor.document) !== blocksJSON;
      if (savedNote?.id) {
        setTitle(getNoteDisplayTitle(savedNote, editor.document));
        onNoteChanged(savedNote);
      }
      if (isEditorDirtyRef.current) {
        saveTimerRef.current = window.setTimeout(() => {
          saveTimerRef.current = null;
          void saveNow();
        }, 180);
      }
    });

    saveQueueRef.current = pendingSave.catch(() => {
      isEditorDirtyRef.current = true;
      if (saveRetryTimerRef.current) {
        window.clearTimeout(saveRetryTimerRef.current);
      }
      saveRetryTimerRef.current = window.setTimeout(() => {
        saveRetryTimerRef.current = null;
        void saveNow();
      }, 1000);
    });

    return options.throwOnError ? pendingSave : saveQueueRef.current;
  }, [editor, note.id, onNoteChanged]);

  const saveVersionNow = useCallback(async () => {
    await saveNow({ throwOnError: true });
    const markdown = await editor.blocksToMarkdownLossy(editor.document);
    const version = await electronApi?.createNoteVersion?.({
      noteId: note.id,
      title: getNoteDisplayTitle(note, editor.document),
      titleManuallyEdited: isTitleManuallyEdited(note),
      blocksJSON: JSON.stringify(editor.document),
      markdown,
      source: "manual",
    });
    if (version && isVersionHistoryOpen) {
      setNoteVersions((current) => [
        version,
        ...current.filter((item) => item.id !== version.id),
      ]);
    }
    return version;
  }, [editor, isVersionHistoryOpen, note, saveNow]);

  const scheduleSave = useCallback(() => {
    if (!electronApi) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void saveNow();
    }, 180);
  }, [saveNow]);


  const refreshTableOfContents = useCallback(() => {
    setTableOfContentsEntries(extractTableOfContentsEntries(editor.document));
  }, [editor]);

  useEffect(() => {
    const surface = editorSurfaceRef.current;
    if (!surface || !isTableOfContentsVisible || tableOfContentsEntries.length === 0) {
      setActiveTableOfContentsEntryIds([]);
      return undefined;
    }

    let frameId = 0;
    const updateActiveHeading = () => {
      frameId = 0;
      const surfaceTop = surface.getBoundingClientRect().top;
      const activationLine = surfaceTop + 48;
      const blocks = tableOfContentsEntries
        .map((entry) => ({ entry, element: getEditorBlockElement(entry.id) }))
        .filter(({ element }) => element);
      if (blocks.length === 0) return;

      const currentIndex = blocks.reduce((index, block, nextIndex) => (
        block.element.getBoundingClientRect().top <= activationLine ? nextIndex : index
      ), 0);
      const current = blocks[currentIndex];
      const activeIds = [current.entry.id];
      for (let index = currentIndex - 1; index >= 0; index -= 1) {
        if (blocks[index].entry.level < current.entry.level) {
          activeIds.push(blocks[index].entry.id);
          break;
        }
      }

      setActiveTableOfContentsEntryIds((previous) => (
        previous.length === activeIds.length && previous.every((id, index) => id === activeIds[index])
          ? previous
          : activeIds
      ));
    };
    const scheduleActiveHeadingUpdate = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updateActiveHeading);
    };

    surface.addEventListener("scroll", scheduleActiveHeadingUpdate, { passive: true });
    window.addEventListener("resize", scheduleActiveHeadingUpdate);
    scheduleActiveHeadingUpdate();
    return () => {
      surface.removeEventListener("scroll", scheduleActiveHeadingUpdate);
      window.removeEventListener("resize", scheduleActiveHeadingUpdate);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [isTableOfContentsVisible, tableOfContentsEntries]);

  const handleEditorChange = useCallback(() => {
    if (!isEmptySessionDocument(editor.document)) {
      setIsDefaultTemplateSuggestionVisible(false);
    }
    updateAutomaticTitleFromBlocks(editor.document);
    refreshTableOfContents();
    isEditorDirtyRef.current = true;
    scheduleSave();
  }, [editor, refreshTableOfContents, scheduleSave, updateAutomaticTitleFromBlocks]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (isEditorDirtyRef.current) {
        void saveNow();
      }
    }, 30000);
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden" && isEditorDirtyRef.current) {
        void saveNow();
      }
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flushWhenHidden);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flushWhenHidden);
    };
  }, [saveNow]);

  const openVersionHistory = useCallback(async () => {
    setIsVersionHistoryOpen(true);
    setIsVersionBusy(true);
    try {
      setNoteVersions(await electronApi?.listNoteVersions?.(note.id) ?? []);
    } finally {
      setIsVersionBusy(false);
    }
  }, [note.id]);

  const restoreVersion = useCallback(async (version) => {
    setIsVersionBusy(true);
    try {
      await saveNow();
      const restored = await electronApi?.restoreNoteVersion?.({ noteId: note.id, versionId: version.id });
      if (!restored) return;
      const blocks = JSON.parse(restored.blocksJSON);
      editor.replaceBlocks(editor.document, blocks);
      lastSavedBlocksRef.current = restored.blocksJSON;
      setTitle(restored.title);
      onNoteChanged(restored);
      setNoteVersions(await electronApi.listNoteVersions(note.id));
    } finally {
      setIsVersionBusy(false);
    }
  }, [editor, note.id, onNoteChanged, saveNow]);

  useEffect(() => {
    refreshTableOfContents();
  }, [note.id, refreshTableOfContents]);

  const scheduleAppearanceSave = useCallback(
    (nextTitle, nextTheme, options = {}) => {
      if (!electronApi) {
        return;
      }

      if (appearanceTimerRef.current) {
        window.clearTimeout(appearanceTimerRef.current);
      }

      appearanceTimerRef.current = window.setTimeout(() => {
        const payload = {
          noteId: note.id,
          title: normalizeTitle(nextTitle),
          theme: normalizeTheme(nextTheme),
        };
        if (Object.hasOwn(options, "titleManuallyEdited")) {
          payload.titleManuallyEdited = Boolean(options.titleManuallyEdited);
        }
        void electronApi.updateAppearance(payload);
      }, 160);
    },
    [note.id],
  );

  const scheduleSessionAppearanceSave = useCallback((sessionNote, nextTheme) => {
    if (!electronApi || !sessionNote?.id) {
      return;
    }

    if (sessionAppearanceTimerRef.current) {
      window.clearTimeout(sessionAppearanceTimerRef.current);
    }

    sessionAppearanceTimerRef.current = window.setTimeout(() => {
      void electronApi.updateAppearance({
        noteId: sessionNote.id,
        title: getNoteDisplayTitle(sessionNote),
        titleManuallyEdited: isTitleManuallyEdited(sessionNote),
        theme: normalizeTheme(nextTheme),
      });
    }, 160);
  }, []);

  const updateTheme = useCallback(
    (nextTheme) => {
      const normalizedTheme = normalizeTheme(nextTheme);
      setTheme(normalizedTheme);
      onNoteChanged({
        ...note,
        title: normalizeTitle(title),
        titleManuallyEdited: isTitleManuallyEdited(note),
        theme: normalizedTheme,
      });
      scheduleAppearanceSave(title, normalizedTheme);
    },
    [note, onNoteChanged, scheduleAppearanceSave, title],
  );

  const updateSessionNoteTheme = useCallback(
    (sessionNoteId, nextTheme) => {
      const targetNote =
        notes.find((sessionNote) => sessionNote.id === sessionNoteId) ??
        (note.id === sessionNoteId ? note : null);

      if (!targetNote) {
        return;
      }

      const normalizedTheme = normalizeTheme(nextTheme);
      const updatedNote = {
        ...targetNote,
        title: getNoteDisplayTitle(
          targetNote,
          targetNote.id === note.id ? editor.document : null,
        ),
        titleManuallyEdited: isTitleManuallyEdited(targetNote),
        theme: normalizedTheme,
      };

      if (targetNote.id === note.id) {
        setTheme(normalizedTheme);
      }

      onNoteChanged(updatedNote);
      scheduleSessionAppearanceSave(updatedNote, normalizedTheme);
    },
    [
      note,
      notes,
      editor,
      onNoteChanged,
      scheduleSessionAppearanceSave,
    ],
  );

  const updateGlobalEditorPreferences = useCallback(
    (nextEditorPreferences) => {
      const nextPreferences = normalizeEditorPreferences(
        nextEditorPreferences,
        normalizedEditorPreferences,
      );
      const didFontSizeChange =
        nextPreferences.editorFontScale !== editorFontScale;

      void onEditorPreferencesChanged?.(nextPreferences);

      if (didFontSizeChange) {
        showEditorFontSizeToast(nextPreferences.editorFontScale);
      }
    },
    [
      editorFontScale,
      normalizedEditorPreferences,
      onEditorPreferencesChanged,
      showEditorFontSizeToast,
    ],
  );

  const updateEditorFontScale = useCallback(
    (nextEditorFontScale) => {
      const normalizedEditorFontScale = normalizeEditorFontScale(nextEditorFontScale);
      updateGlobalEditorPreferences({
        ...normalizedEditorPreferences,
        editorFontScale: normalizedEditorFontScale,
      });
    },
    [normalizedEditorPreferences, updateGlobalEditorPreferences],
  );

  const toggleTableOfContents = useCallback(() => {
    updateGlobalEditorPreferences({
      ...normalizedEditorPreferences,
      showTableOfContents: !showTableOfContents,
    });
  }, [normalizedEditorPreferences, showTableOfContents, updateGlobalEditorPreferences]);

  const adjustEditorFontScale = useCallback(
    (direction) => {
      updateEditorFontScale(
        normalizeEditorFontScale(editorFontScale + direction * EDITOR_FONT_SCALE_STEP),
      );
    },
    [editorFontScale, updateEditorFontScale],
  );

  const selectTableOfContentsEntry = useCallback(
    (entry) => {
      const block = findBlockById(editor.document, entry?.id);
      if (!block) {
        return;
      }

      try {
        editor.focus();
        editor.setTextCursorPosition(block, "start");
      } catch {
        try {
          editor.setSelection(block, block);
        } catch {
          // The scroll target is still useful if this block type rejects selection.
        }
      }

      window.requestAnimationFrame(() => {
        scrollEditorBlockIntoView(entry.id);
      });
    },
    [editor],
  );

  const focusEditor = useCallback(() => {
    setIsEditorActive(true);
    window.requestAnimationFrame(() => {
      focusLastEditorBlock(editor);
    });
  }, [editor]);

  useEffect(() => {
    setIsEditorActive(true);
    const animationFrame = window.requestAnimationFrame(() => {
      focusLastEditorBlock(editor);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [editor]);

  const applyDefaultTemplate = useCallback(() => {
    const templateBlocks = JSON.parse(NOTE_PANE_TEMPLATE_BLOCKS_JSON);
    editor.replaceBlocks(editor.document, templateBlocks);
    setIsDefaultTemplateSuggestionVisible(false);
    handleEditorChange();
    focusEditor();
  }, [editor, focusEditor, handleEditorChange]);

  const useTemplateSession = useCallback(async () => {
    if (!note.seedDemoContent) {
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const blocksJSON = JSON.stringify(editor.document);
    let markdown = "";
    try {
      markdown = await editor.blocksToMarkdownLossy(editor.document);
    } catch {
      markdown = "";
    }

    lastSavedBlocksRef.current = blocksJSON;
    const savedNote = await electronApi?.saveContent({
      noteId: note.id,
      blocksJSON,
      markdown,
    });
    const nextNote = savedNote?.id
      ? savedNote
      : {
          ...note,
          blocksJSON,
          markdown,
          seedDemoContent: false,
          updatedAt: Date.now(),
        };

    setTitle(getNoteDisplayTitle(nextNote, editor.document));
    onNoteChanged(nextNote);
    focusEditor();
  }, [editor, focusEditor, note, onNoteChanged]);

  const openPreferencesPage = useCallback((pageId = "general") => {
    setPreferencesInitialPage(normalizePreferencePageId(pageId));
    setIsColorPanelOpen(false);
    setIsStickySettingsOpen(false);
    setIsStickyTrashConfirmOpen(false);
    setPendingSessionTrashNote(null);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    setIsPreferencesWindowOpen(true);
  }, []);

  const openPreferences = useCallback(() => {
    openPreferencesPage("general");
  }, [openPreferencesPage]);

  const requestNewSession = useCallback(() => {
    setIsColorPanelOpen(false);
    setIsStickySettingsOpen(false);
    setIsStickyTrashConfirmOpen(false);
    setPendingSessionTrashNote(null);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    setIsPreferencesWindowOpen(false);
    void onCreateNote({ template: "blank" });
  }, [onCreateNote]);

  const openTrashPreferences = useCallback(() => {
    openPreferencesPage("trash");
  }, [openPreferencesPage]);

  const openStickySettings = useCallback(() => {
    setIsColorPanelOpen(false);
    setIsPreferencesWindowOpen(false);
    setIsStickyTrashConfirmOpen(false);
    setPendingSessionTrashNote(null);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    setIsStickySettingsOpen(true);
  }, []);

  const toggleLayoutMode = useCallback(() => {
    setIsColorPanelOpen(false);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    setIsPreferencesWindowOpen(false);
    setIsStickySettingsOpen(false);
    setIsStickyTrashConfirmOpen(false);
    setPendingSessionTrashNote(null);
    void onLayoutModeChanged(normalizedLayoutMode === "tabs" ? "sticky" : "tabs");
  }, [normalizedLayoutMode, onLayoutModeChanged]);

  const openSidebar = useCallback(() => {
    setSidebarWidth((currentWidth) =>
      Math.max(currentWidth || SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH),
    );
    setIsSidebarOpen(true);
  }, []);

  const togglePin = useCallback(async () => {
    const nextPinned = !isPinned;
    setIsPinned(nextPinned);
    setIsColorPanelOpen(false);
    onNoteChanged({
      ...note,
      title: normalizeTitle(title),
      titleManuallyEdited: isTitleManuallyEdited(note),
      theme,
      alwaysOnTop: nextPinned,
    });

    try {
      const resolvedPinned = electronApi
        ? await electronApi.setAlwaysOnTop(nextPinned)
        : nextPinned;
      setIsPinned(Boolean(resolvedPinned));
      onNoteChanged({
        ...note,
        title: normalizeTitle(title),
        titleManuallyEdited: isTitleManuallyEdited(note),
        theme,
        alwaysOnTop: Boolean(resolvedPinned),
      });
    } catch (error) {
      setIsPinned(!nextPinned);
      onNoteChanged({
        ...note,
        title: normalizeTitle(title),
        titleManuallyEdited: isTitleManuallyEdited(note),
        theme,
        alwaysOnTop: !nextPinned,
      });
      showExportToast(error.message || "Pin failed.", "error");
    }
  }, [isPinned, note, onNoteChanged, showExportToast, theme, title]);

  const closeCurrentWindow = useCallback(() => {
    setIsStickyActionBarOpen(false);
    void electronApi?.closeCurrentWindow?.();
  }, []);

  const exportNote = useCallback(async (type = "pdf") => {
    setExportFormatMenu(null);
    if (!electronApi) {
      showExportToast("Note export is available in the desktop app.", "error");
      return;
    }

    const isPdf = type === "pdf";
    showExportToast(`Exporting ${isPdf ? "PDF" : "Markdown"}...`, "progress", { timeout: 0 });
    if (isPdf) {
      document.body.classList.add("is-exporting");
    }
    try {
      if (isPdf) {
        await nextAnimationFrame();
        await nextAnimationFrame();
      }
      const markdown = isPdf
        ? undefined
        : await editor.blocksToMarkdownLossy(editor.document);
      const result = await electronApi?.exportNote({
        noteId: note.id,
        title: normalizeTitle(title),
        type,
        markdown,
      });

      if (result?.canceled) {
        hideExportToast();
        return;
      }

      showExportToast(`${isPdf ? "PDF" : "Markdown"} exported`, "success");
    } catch (error) {
      showExportToast(error.message || `${isPdf ? "PDF" : "Markdown"} export failed.`, "error");
    } finally {
      if (isPdf) {
        document.body.classList.remove("is-exporting");
      }
    }
  }, [editor, hideExportToast, note.id, showExportToast, title]);

  const openExportFormatMenu = useCallback((event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setExportFormatMenu({
      x: Math.round(bounds.right),
      y: Math.round(bounds.top),
    });
  }, []);

  const importMarkdownFile = useCallback(async (file) => {
    if (!file || typeof file.text !== "function") {
      throw new Error("Choose a Markdown file to import.");
    }
    if (!/\.(md|markdown)$/i.test(file.name || "")) {
      throw new Error("Only .md and .markdown files can be imported.");
    }
    if (file.size > MAX_MARKDOWN_IMPORT_FILE_SIZE) {
      throw new Error("This Markdown file is larger than the 512 MB import limit.");
    }

    try {
      const markdown = await file.text();
      const blocks = editor.tryParseMarkdownToBlocks(markdown);
      if (blocks.length === 0) {
        throw new Error("This Markdown file is empty.");
      }
      const cursorBlock = editor.getTextCursorPosition().block;
      const insertedBlocks = editor.insertBlocks(blocks, cursorBlock, "after");
      if (isEmptyParagraphBlock(cursorBlock)) {
        editor.removeBlocks([cursorBlock]);
      }
      const firstInsertedBlock = insertedBlocks?.[0];
      if (firstInsertedBlock) {
        editor.focus();
        try {
          editor.setTextCursorPosition(firstInsertedBlock, "start");
        } catch {
          // Media-only Markdown imports may not expose a text cursor.
        }
      }
      refreshTableOfContents();
      scheduleSave();
      setIsMarkdownImportOpen(false);
      showExportToast(`${file.name || "Markdown file"} imported`, "success");
    } catch (error) {
      throw new Error(error.message || "Markdown import failed.");
    }
  }, [editor, refreshTableOfContents, scheduleSave, showExportToast]);

  const exportDataBackup = useCallback(async () => {
    if (!electronApi?.exportBackup) {
      showExportToast("Data backup is available in the desktop app.", "error");
      return { canceled: true };
    }

    showExportToast("Exporting backup...", "progress", { timeout: 0 });
    try {
      await saveNow();
      const result = await electronApi.exportBackup();
      if (result?.canceled) {
        hideExportToast();
        return result;
      }
      showExportToast("Backup exported", "success");
      return result;
    } catch (error) {
      showExportToast(error.message || "Backup export failed.", "error");
      return { canceled: true, error: true };
    }
  }, [electronApi, hideExportToast, saveNow, showExportToast]);

  const importDataBackup = useCallback(async () => {
    if (!electronApi?.importBackup) {
      showExportToast("Data restore is available in the desktop app.", "error");
      return { canceled: true };
    }

    try {
      await saveNow();
      const result = await electronApi.importBackup();
      if (result?.canceled) {
        return result;
      }
      showExportToast("Backup imported", "success");
      return result;
    } catch (error) {
      showExportToast(error.message || "Backup import failed.", "error");
      return { canceled: true, error: true };
    }
  }, [electronApi, saveNow, showExportToast]);

  useEffect(() => {
    return electronApi?.onOpenPreferences?.(openPreferences);
  }, [openPreferences]);

  useEffect(() => {
    return electronApi?.onCreateNoteRequested?.(requestNewSession);
  }, [requestNewSession]);

  useEffect(() => {
    const handlePreferencesShortcut = (event) => {
      if (
        isShortcutRecorderTarget(event.target) ||
        !matchesEnabledKeyboardShortcut(event, "preferences")
      ) {
        return;
      }

      event.preventDefault();
      openPreferences();
    };

    document.addEventListener("keydown", handlePreferencesShortcut, true);
    return () => {
      document.removeEventListener("keydown", handlePreferencesShortcut, true);
    };
  }, [matchesEnabledKeyboardShortcut, openPreferences]);

  useEffect(() => {
    const handleChromeShortcut = (event) => {
      if (isShortcutRecorderTarget(event.target)) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveVersionNow().then(
          () => showExportToast("Saved", "success"),
          () => showExportToast("Save failed", "error"),
        );
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, .preferences-window")
      ) {
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "toggleLayoutMode")) {
        event.preventDefault();
        toggleLayoutMode();
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "toggleTableOfContents")) {
        event.preventDefault();
        toggleTableOfContents();
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "toggleEditorWidth")) {
        event.preventDefault();
        onEditorWidthChange?.((value) => !value);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "toggleThemeMode")) {
        event.preventDefault();
        void onAppThemeModeChanged(appThemeMode === "dark" ? "light" : "dark");
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "exportPdf")) {
        event.preventDefault();
        setIsColorPanelOpen(false);
        setIsStickySettingsOpen(false);
        setPendingSessionTrashNote(null);
        setSessionTabMenu(null);
        setSessionColorPanelNoteId(null);
        setIsPreferencesWindowOpen(false);
        setExportFormatMenu({
          x: Math.round(window.innerWidth / 2),
          y: 52,
        });
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "increaseEditorFontSize")) {
        event.preventDefault();
        adjustEditorFontScale(1);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "decreaseEditorFontSize")) {
        event.preventDefault();
        adjustEditorFontScale(-1);
        return;
      }

      if (
        matchesEnabledKeyboardShortcut(event, "attachDetachedNote") &&
        note.detached
      ) {
        event.preventDefault();
        void onAttachNote(note.id);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "toggleSidebar")) {
        event.preventDefault();
        setIsSidebarOpen((value) => !value);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "focusEditor")) {
        event.preventDefault();
        focusEditor();
        return;
      }

      if (
        (
          matchesEnabledKeyboardShortcut(event, "newSession") ||
          matchesEnabledKeyboardShortcut(event, "newNote")
        ) &&
        effectiveLayoutMode === "tabs"
      ) {
        event.preventDefault();
        requestNewSession();
      }
    };

    document.addEventListener("keydown", handleChromeShortcut, true);
    return () => {
      document.removeEventListener("keydown", handleChromeShortcut, true);
    };
  }, [
    appThemeMode,
    effectiveLayoutMode,
    matchesEnabledKeyboardShortcut,
    note.detached,
    note.id,
    onAppThemeModeChanged,
    onAttachNote,
    adjustEditorFontScale,
    exportNote,
    focusEditor,
    requestNewSession,
    toggleTableOfContents,
    onEditorWidthChange,
    toggleLayoutMode,
    saveVersionNow,
    showExportToast,
  ]);

  useEffect(() => {
    if (
      !isColorPanelOpen &&
      !isPreferencesWindowOpen &&
      !isStickySettingsOpen &&
       !isStickyTrashConfirmOpen &&
       !isStickyActionBarOpen &&
      !isVersionHistoryOpen &&
       !pendingSessionTrashNote &&
       !pendingSessionCloseNote &&
      !sessionTabMenu &&
      !sessionColorPanelNoteId
      && !exportFormatMenu &&
      !isMarkdownImportOpen
    ) {
      return undefined;
    }

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsColorPanelOpen(false);
        setIsPreferencesWindowOpen(false);
        setIsStickySettingsOpen(false);
        setIsStickyTrashConfirmOpen(false);
        setIsStickyActionBarOpen(false);
        setIsVersionHistoryOpen(false);
        setPendingSessionTrashNote(null);
        setPendingSessionCloseNote(null);
        setSessionTabMenu(null);
        setSessionColorPanelNoteId(null);
        setExportFormatMenu(null);
        setIsMarkdownImportOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [
    isColorPanelOpen,
    isPreferencesWindowOpen,
    isStickySettingsOpen,
    isStickyTrashConfirmOpen,
    isStickyActionBarOpen,
    isVersionHistoryOpen,
    pendingSessionTrashNote,
    pendingSessionCloseNote,
    pendingSessionCloseNote,
    sessionColorPanelNoteId,
    sessionTabMenu,
    exportFormatMenu,
    isMarkdownImportOpen,
  ]);

  useEffect(() => {
    const handleEditorKeyDownCapture = (event) => {
      if (
        isEditorShortcutTarget(event.target) &&
        handleToggleBackspace(editor, event)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setIsEditorActive(true);
        return;
      }

      if (
        isEditorShortcutTarget(event.target) &&
        handleToggleEnter(editor, event)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setIsEditorActive(true);
        return;
      }

      if (
        event.key === " " &&
        !(event.metaKey || event.ctrlKey || event.altKey) &&
        !isEditableFormTarget(event.target) &&
        isEditorShortcutTarget(event.target) &&
        handleToggleSpace(editor, event)
      ) {
        event.preventDefault();
        setIsEditorActive(true);
        return;
      }

      if (event.key === "Tab") {
        if (isEditorShortcutTarget(event.target)) {
          setIsEditorActive(true);
          if (event.isComposing) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
          }
          if (moveTableTextCursorToAdjacentCell(editor, event.shiftKey ? -1 : 1)) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        }
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      const isRepeatRecentColorShortcut = key === "h" && event.shiftKey;
      if (key !== "a" && key !== "x" && !isRepeatRecentColorShortcut) {
        return;
      }

      if (isEditableFormTarget(event.target)) {
        return;
      }

      const isEditorTarget = isEditorActive && isEditorShortcutTarget(event.target);
      if (!isEditorTarget) {
        if (isRepeatRecentColorShortcut) {
          return;
        }
        if (!isEditableFormTarget(event.target)) {
          event.preventDefault();
        }
        return;
      }

      if (isRepeatRecentColorShortcut) {
        event.preventDefault();
        const recentColor = recentEditorColors[0];
        if (recentColor && hasEditorRangeSelection(editor)) {
          applyEditorColor(editor, recentColor);
          setIsEditorActive(true);
        }
        return;
      }

      if (key === "a") {
        event.preventDefault();
        if (isCurrentTableSelection(editor)) {
          if (isCurrentTableFullySelected(editor)) {
            selectAllBlocks(editor);
          } else {
            selectCurrentTable(editor);
          }
          return;
        }
        const tableCellRange = getCurrentTableCellRange(
          editor.prosemirrorView?.state.selection,
        );
        if (tableCellRange) {
          if (isCurrentTableCellContentSelected(editor, tableCellRange)) {
            selectCurrentTableCell(editor);
          } else {
            selectCurrentTableCellContent(editor);
          }
          return;
        }
        if (isSelectionInsideCodeBlock(editor)) {
          selectCurrentCodeBlockContent(editor);
          return;
        }
        selectAllBlocks(editor);
        return;
      }

      if (hasVisibleTextSelection()) {
        return;
      }

      event.preventDefault();
      void cutCurrentBlocks(editor, activeImageBlockId, scheduleSave);
    };

    const handleTextSelectionToolbarEscape = (event) => {
      if (
        event.key !== "Escape" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        !isEditorShortcutTarget(event.target) ||
        editor.prosemirrorView?.state.selection.empty ||
        editor.prosemirrorView?.state.selection.$anchorCell ||
        !isVisibleElement(document.querySelector(".bn-formatting-toolbar"))
      ) {
        return;
      }

      window.requestAnimationFrame(() => {
        if (!isVisibleElement(document.querySelector(".bn-formatting-toolbar"))) {
          editor.focus();
          setIsEditorActive(true);
        }
      });
    };

    const handleEditorTabKeyDown = (event) => {
      if (event.key !== "Tab") {
        return;
      }

      if (!isEditorShortcutTarget(event.target)) {
        if (!isEditableFormTarget(event.target)) {
          event.preventDefault();
          if (isEditorActive) {
            editor.focus();
          }
        }
        return;
      }

      setIsEditorActive(true);
      if (!event.defaultPrevented) {
        event.preventDefault();
      }
      window.requestAnimationFrame(() => {
        if (!isEditorShortcutTarget(document.activeElement)) {
          editor.focus();
        }
      });
    };

    const handleTableCellArrowKeyDownCapture = (event) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        !isEditorShortcutTarget(event.target)
      ) {
        return;
      }

      if (moveSelectedTableCell(editor, event.key)) {
        event.preventDefault();
        event.stopPropagation();
        setIsEditorActive(true);
      }
    };

    const handleTableCellModeEscapeKeyDownCapture = (event) => {
      const view = editor.prosemirrorView;
      const selection = view?.state.selection;
      if (
        event.key !== "Escape" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        !isEditorShortcutTarget(event.target)
      ) {
        return;
      }

      if (selection?.$anchorCell && selection?.$headCell) {
        event.preventDefault();
        event.stopPropagation();
        view.dom.blur();
        setIsTableCellSelectionDismissed(true);
        setIsEditorActive(false);
        return;
      }

      if (!selection?.empty) {
        return;
      }

      if (selectCurrentTableCell(editor)) {
        event.preventDefault();
        event.stopPropagation();
        setIsEditorActive(true);
      }
    };

    const handleTableCellMergeSplitKeyDownCapture = (event) => {
      if (
        event.key.toLowerCase() !== "m" ||
        !(event.metaKey || event.ctrlKey) ||
        !event.shiftKey ||
        event.altKey ||
        !isEditorShortcutTarget(event.target)
      ) {
        return;
      }

      const view = editor.prosemirrorView;
      const selection = view?.state.selection;
      if (!view || !selection?.$anchorCell || !selection?.$headCell) {
        return;
      }

      const selectedCell = selection.$anchorCell.nodeAfter;
      const isSingleCell = selection.$anchorCell.pos === selection.$headCell.pos;
      const isMergedCell = Boolean(
        selectedCell &&
          (selectedCell.attrs.colspan > 1 || selectedCell.attrs.rowspan > 1),
      );
      const command = isSingleCell && isMergedCell ? splitCell : mergeCells;
      if (command(view.state, view.dispatch)) {
        event.preventDefault();
        event.stopPropagation();
        view.focus();
      }
    };

    const handleTableColumnDoubleClickCapture = (event) => {
      if (
        event.button !== 0 ||
        !isEditorShortcutTarget(event.target) ||
        !(event.target instanceof Element) ||
        !event.target.closest("td, th")
      ) {
        return;
      }

      if (autoFitActiveTableColumn(editor, event.target)) {
        event.preventDefault();
        event.stopPropagation();
        window.requestAnimationFrame(updateFocusedTableCell);
      }
    };

    const handleTableColumnResizeMouseMoveCapture = (event) => {
      if (previewActiveTableColumnResize(editor, event)) {
        window.requestAnimationFrame(updateFocusedTableCell);
      }
    };

    document.addEventListener("keydown", handleEditorKeyDownCapture, true);
    document.addEventListener("keydown", handleTextSelectionToolbarEscape, true);
    document.addEventListener("keydown", handleTableCellArrowKeyDownCapture, true);
    document.addEventListener("keydown", handleTableCellModeEscapeKeyDownCapture, true);
    document.addEventListener("keydown", handleTableCellMergeSplitKeyDownCapture, true);
    document.addEventListener("dblclick", handleTableColumnDoubleClickCapture, true);
    window.addEventListener("mousemove", handleTableColumnResizeMouseMoveCapture, true);
    document.addEventListener("keydown", handleEditorTabKeyDown);
    return () => {
      document.removeEventListener("keydown", handleEditorKeyDownCapture, true);
      document.removeEventListener("keydown", handleTextSelectionToolbarEscape, true);
      document.removeEventListener("keydown", handleTableCellArrowKeyDownCapture, true);
      document.removeEventListener("keydown", handleTableCellModeEscapeKeyDownCapture, true);
      document.removeEventListener("keydown", handleTableCellMergeSplitKeyDownCapture, true);
      document.removeEventListener("dblclick", handleTableColumnDoubleClickCapture, true);
      window.removeEventListener("mousemove", handleTableColumnResizeMouseMoveCapture, true);
      document.removeEventListener("keydown", handleEditorTabKeyDown);
    };
  }, [
    activeImageBlockId,
    editor,
    isEditorActive,
    recentEditorColors,
    scheduleSave,
    updateFocusedTableCell,
  ]);

  useEffect(() => {
    const handleImageClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      if (
        target.closest(".image-tools, .bn-formatting-toolbar, .crop-dialog")
      ) {
        return;
      }

      const image = target.closest("img.bn-visual-media");
      if (!image) {
        setActiveImageBlockId(null);
        return;
      }

      const block = findImageBlockBySource(editor.document, image.currentSrc || image.src);
      if (!block) {
        return;
      }

      setActiveImageBlockId(block.id);
      try {
        editor.setSelection(block, block);
      } catch {
        // Media selection is best-effort; the toolbar still works from block id.
      }
    };

    document.addEventListener("click", handleImageClick, true);
    return () => {
      document.removeEventListener("click", handleImageClick, true);
    };
  }, [editor]);

  const downloadActiveImage = useCallback(async (selectedBlock) => {
    const block = selectedBlock?.id
      ? findBlockById(editor.document, selectedBlock.id) ?? selectedBlock
      : findBlockById(editor.document, activeImageBlockId);
    const url = block?.props?.url;
    if (!url) {
      return;
    }

    const defaultName = block.props.name?.trim() || imageFileName("", url);
    if (electronApi?.saveAsset) {
      await electronApi.saveAsset({
        url,
        defaultName,
        kind: block.type === "image" ? "image" : "file",
      });
      return;
    }

    downloadInBrowser(url, defaultName);
  }, [activeImageBlockId, editor]);

  const openCropDialog = useCallback(() => {
    const block = findBlockById(editor.document, activeImageBlockId);
    const url = block?.props?.originalUrl || block?.props?.url;
    if (!url) {
      return;
    }

    setCropState({
      blockId: block.id,
      sourceUrl: url,
      crop: getStoredImageCrop(block.props),
    });
  }, [activeImageBlockId, editor]);

  const startHeaderWindowDrag = useCallback(
    (event) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (isEditableFormTarget(target) ||
          target.closest("button, a, [role='button'], [role='switch'], [role='tab']"))
      ) {
        return;
      }

      if (
        event.button !== 0 ||
        effectiveLayoutMode !== "sticky" ||
        !electronApi?.moveWindowBy
      ) {
        return;
      }

      let previousScreenX = event.screenX;
      let previousScreenY = event.screenY;

      const moveWindow = (pointerEvent) => {
        const deltaX = pointerEvent.screenX - previousScreenX;
        const deltaY = pointerEvent.screenY - previousScreenY;
        previousScreenX = pointerEvent.screenX;
        previousScreenY = pointerEvent.screenY;

        if (deltaX === 0 && deltaY === 0) {
          return;
        }

        void electronApi.moveWindowBy({ deltaX, deltaY });
      };

      const stopWindowDrag = () => {
        window.removeEventListener("pointermove", moveWindow);
        window.removeEventListener("pointerup", stopWindowDrag);
        window.removeEventListener("pointercancel", stopWindowDrag);
      };

      event.currentTarget.setPointerCapture?.(event.pointerId);
      window.addEventListener("pointermove", moveWindow);
      window.addEventListener("pointerup", stopWindowDrag);
      window.addEventListener("pointercancel", stopWindowDrag);
    },
    [effectiveLayoutMode],
  );

  const applyCrop = useCallback(
    (croppedDataUrl, crop) => {
      const block = findBlockById(editor.document, cropState?.blockId);
      if (!block) {
        return;
      }

      editor.updateBlock(block, {
        props: {
          url: croppedDataUrl,
          originalUrl: block.props.originalUrl || block.props.url,
          cropX: crop.x,
          cropY: crop.y,
          cropWidth: crop.width,
          cropHeight: crop.height,
          name: ensurePngName(block.props.name || "cropped-image.png"),
          showPreview: true,
        },
      });
      setActiveImageBlockId(block.id);
      setCropState(null);
      scheduleSave();
    },
    [cropState?.blockId, editor, scheduleSave],
  );

  const selectSidebarNote = useCallback(
    async (noteId) => {
      if (noteId === note.id) {
        return;
      }

      await saveNow();
      await onSelectNote(noteId);
    },
    [note.id, onSelectNote, saveNow],
  );

  const sessionColorPanelNote = useMemo(
    () =>
      visibleSessionNotes.find(
        (sessionNote) => sessionNote.id === sessionColorPanelNoteId,
      ) ??
      notes.find((sessionNote) => sessionNote.id === sessionColorPanelNoteId) ??
      null,
    [notes, sessionColorPanelNoteId, visibleSessionNotes],
  );

  const sessionTabMenuNote = useMemo(
    () =>
      visibleSessionNotes.find(
        (sessionNote) => sessionNote.id === sessionTabMenu?.noteId,
      ) ??
      notes.find((sessionNote) => sessionNote.id === sessionTabMenu?.noteId) ??
      null,
    [notes, sessionTabMenu, visibleSessionNotes],
  );

  const getSessionDisplayTitle = useCallback(
    (sessionNote) =>
      getNoteDisplayTitle(
        sessionNote,
        sessionNote?.id === note.id ? editor.document : null,
      ),
    [editor, note.id],
  );

  const openSessionTabMenu = useCallback((sessionNote, event) => {
    event.preventDefault();
    setPendingSessionTrashNote(null);
    setSessionColorPanelNoteId(null);
    setIsColorPanelOpen(false);
    setIsStickySettingsOpen(false);
    setIsPreferencesWindowOpen(false);
    setIsStickyTrashConfirmOpen(false);
    setSessionTabMenu({
      noteId: sessionNote.id,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const openSessionColorPanel = useCallback((sessionNoteId) => {
    setSessionTabMenu(null);
    setPendingSessionTrashNote(null);
    setSessionColorPanelNoteId(sessionNoteId);
    setIsColorPanelOpen(false);
    setIsStickySettingsOpen(false);
    setIsPreferencesWindowOpen(false);
    setIsStickyTrashConfirmOpen(false);
  }, []);

  useEffect(() => {
    const visibleIds = visibleSessionNotes.map((sessionNote) => sessionNote.id);

    if (!sessionTabAnimationsPrimed) {
      visibleIds.forEach((id) => seenSessionTabIds.add(id));
      sessionTabAnimationsPrimed = true;
      return undefined;
    }

    const newSessionIds = visibleIds.filter((id) => !seenSessionTabIds.has(id));
    visibleIds.forEach((id) => seenSessionTabIds.add(id));

    if (newSessionIds.length === 0) {
      return undefined;
    }

    setEnteringSessionIds((currentIds) => {
      const nextIds = new Set(currentIds);
      newSessionIds.forEach((id) => nextIds.add(id));
      return nextIds;
    });

    const timerId = window.setTimeout(() => {
      setEnteringSessionIds((currentIds) => {
        const nextIds = new Set(currentIds);
        newSessionIds.forEach((id) => nextIds.delete(id));
        return nextIds;
      });
    }, SESSION_TAB_ENTER_MS);

    return () => window.clearTimeout(timerId);
  }, [visibleSessionNotes]);

  const startSessionRename = useCallback((sessionNote) => {
    setEditingSessionId(sessionNote.id);
    setDraftSessionTitle(getSessionDisplayTitle(sessionNote));
    setIsDraftSessionTitleDirty(false);
  }, [getSessionDisplayTitle]);

  const cancelSessionRename = useCallback(() => {
    setEditingSessionId(null);
    setDraftSessionTitle("");
    setIsDraftSessionTitleDirty(false);
  }, []);

  const commitSessionRename = useCallback(
    async (sessionNote) => {
      setEditingSessionId(null);
      setDraftSessionTitle("");
      setIsDraftSessionTitleDirty(false);

      if (!isDraftSessionTitleDirty) {
        return;
      }

      const normalizedTitle = normalizeTitle(
        draftSessionTitle,
        getSessionDisplayTitle(sessionNote),
      );

      const updatedNote = {
        ...sessionNote,
        title: normalizedTitle,
        titleManuallyEdited: true,
      };

      if (sessionNote.id === note.id) {
        setTitle(normalizedTitle);
        onNoteChanged({
          ...note,
          title: normalizedTitle,
          titleManuallyEdited: true,
          theme,
        });
        scheduleAppearanceSave(normalizedTitle, theme, {
          titleManuallyEdited: true,
        });
        return;
      }

      onNoteChanged(updatedNote);
      await electronApi?.updateAppearance({
        noteId: sessionNote.id,
        title: normalizedTitle,
        titleManuallyEdited: true,
        theme: normalizeTheme(sessionNote.theme),
      });
    },
    [
      draftSessionTitle,
      getSessionDisplayTitle,
      isDraftSessionTitleDirty,
      note,
      onNoteChanged,
      scheduleAppearanceSave,
      theme,
    ],
  );

  const requestDeleteSessionNote = useCallback(
    (sessionNote) => {
      if (removingSessionIds.has(sessionNote.id)) {
        return;
      }

      setEditingSessionId(null);
      setDraftSessionTitle("");
      setIsDraftSessionTitleDirty(false);
      setIsColorPanelOpen(false);
      setIsPreferencesWindowOpen(false);
      setIsStickySettingsOpen(false);
      setIsStickyTrashConfirmOpen(false);
      setSessionTabMenu(null);
      setSessionColorPanelNoteId(null);
      setPendingSessionTrashNote(sessionNote);
    },
    [removingSessionIds],
  );

  const deleteSessionNote = useCallback(
    async (sessionNote, options = {}) => {
      if (removingSessionIds.has(sessionNote.id)) {
        return;
      }

      setEditingSessionId(null);
      setDraftSessionTitle("");
      setIsDraftSessionTitleDirty(false);
      setRemovingSessionIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(sessionNote.id);
        return nextIds;
      });

      try {
        await delay(SESSION_TAB_EXIT_MS);
        await saveNow();
        const deletedSnapshot =
          sessionNote.id === note.id ? getCurrentNoteSnapshot() : sessionNote;
        const deletedTitle = getNoteDisplayTitle(
          deletedSnapshot,
          sessionNote.id === note.id ? editor.document : null,
        );
        const result = await onDeleteNote(
          sessionNote.id,
          deletedSnapshot,
        );
        if (result?.deleted === false) {
          showExportToast("Could not move session to Trash.", "error");
          return;
        }

        onSessionMovedToTrash?.({
          noteId: sessionNote.id,
          title: deletedTitle,
          source: options.source ?? "trash",
        });
      } finally {
        setRemovingSessionIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(sessionNote.id);
          return nextIds;
        });
      }
    },
    [
      editor.document,
      getCurrentNoteSnapshot,
      note.id,
      onDeleteNote,
      removingSessionIds,
      saveNow,
      showExportToast,
      onSessionMovedToTrash,
    ],
  );

  const hasSessionContent = useCallback(
    (sessionNote) => {
      if (sessionNote.id === note.id) {
        return !isEmptySessionDocument(editor.document);
      }

      if (sessionNote.seedDemoContent || Boolean(sessionNote.markdown?.trim())) {
        return true;
      }

      return !isEmptySessionDocument(parseBlocksJSON(sessionNote.blocksJSON) ?? EMPTY_BLOCKS);
    },
    [editor.document, note.id],
  );

  const requestCloseCurrentTab = useCallback(() => {
    if (effectiveLayoutMode !== "tabs") {
      closeCurrentWindow();
      return;
    }

    const currentSessionNote = visibleSessionNotes.find(
      (sessionNote) => sessionNote.id === note.id,
    );
    if (!currentSessionNote || removingSessionIds.has(currentSessionNote.id)) {
      return;
    }

    if (hasSessionContent(currentSessionNote)) {
      setPendingSessionCloseNote(currentSessionNote);
      return;
    }

    void deleteSessionNote(currentSessionNote, { source: "close" });
  }, [
    closeCurrentWindow,
    deleteSessionNote,
    effectiveLayoutMode,
    hasSessionContent,
    note.id,
    removingSessionIds,
    visibleSessionNotes,
  ]);

  const confirmCloseCurrentTab = useCallback(async () => {
    const sessionNote = pendingSessionCloseNote;
    if (!sessionNote) {
      return;
    }

    setPendingSessionCloseNote(null);
    await deleteSessionNote(sessionNote, { source: "close" });
  }, [deleteSessionNote, pendingSessionCloseNote]);

  useEffect(() => {
    return electronApi?.onCloseTabRequested?.(requestCloseCurrentTab);
  }, [requestCloseCurrentTab]);

  useEffect(() => {
    if (!pendingSessionCloseNote) {
      return;
    }

    if (!visibleSessionNotes.some((sessionNote) => sessionNote.id === pendingSessionCloseNote.id)) {
      setPendingSessionCloseNote(null);
    }
  }, [pendingSessionCloseNote, visibleSessionNotes]);

  useEffect(() => {
    const handleCloseShortcut = (event) => {
      if (
        !matchesEnabledKeyboardShortcut(event, "closeWindow") ||
        isShortcutRecorderTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      requestCloseCurrentTab();
    };

    document.addEventListener("keydown", handleCloseShortcut, true);
    return () => document.removeEventListener("keydown", handleCloseShortcut, true);
  }, [matchesEnabledKeyboardShortcut, requestCloseCurrentTab]);

  const confirmDeleteSessionNote = useCallback(async () => {
    const sessionNote = pendingSessionTrashNote;
    if (!sessionNote) {
      return;
    }

    setPendingSessionTrashNote(null);
    await deleteSessionNote(sessionNote);
  }, [deleteSessionNote, pendingSessionTrashNote]);

  const getSessionTabRowClassName = useCallback(
    (sessionNote) =>
      [
        "session-tab-row",
        sessionNote.id === note.id ? "active" : "",
        enteringSessionIds.has(sessionNote.id) ? "is-entering" : "",
        removingSessionIds.has(sessionNote.id) ? "is-leaving" : "",
        draggingSessionNoteId === sessionNote.id ? "is-dragging" : "",
      ]
        .filter(Boolean)
        .join(" "),
    [draggingSessionNoteId, enteringSessionIds, note.id, removingSessionIds],
  );

  const setSessionTabRowRef = useCallback((noteId, element) => {
    if (element) {
      sessionTabRowsRef.current.set(noteId, element);
      return;
    }

    sessionTabRowsRef.current.delete(noteId);
  }, []);

  const captureSessionTabRects = useCallback(() => {
    previousSessionTabRectsRef.current = getSessionTabRects(sessionTabRowsRef.current);
  }, []);

  const reorderSessionNotes = useCallback(
    async (orderedNoteIds, options = {}) => {
      if (effectiveLayoutMode !== "tabs") {
        return null;
      }

      const normalizedOrderedNoteIds = normalizeOrderedNoteIds(orderedNoteIds);
      if (normalizedOrderedNoteIds.length === 0) {
        return null;
      }

      captureSessionTabRects();
      return await onReorderNotes?.(normalizedOrderedNoteIds, options);
    },
    [captureSessionTabRects, effectiveLayoutMode, onReorderNotes],
  );

  const moveCurrentSessionNote = useCallback(
    async (direction) => {
      if (effectiveLayoutMode !== "tabs" || visibleSessionNoteIds.length <= 1) {
        return;
      }

      const currentIndex = visibleSessionNoteIds.indexOf(note.id);
      if (currentIndex < 0) {
        return;
      }

      const nextIndex = clamp(
        currentIndex + direction,
        0,
        visibleSessionNoteIds.length - 1,
        currentIndex,
      );
      if (nextIndex === currentIndex) {
        return;
      }

      await reorderSessionNotes(
        moveArrayItem(visibleSessionNoteIds, currentIndex, nextIndex),
        { persist: true },
      );
    },
    [
      effectiveLayoutMode,
      note.id,
      reorderSessionNotes,
      visibleSessionNoteIds,
    ],
  );

  useLayoutEffect(() => {
    const previousRects = previousSessionTabRectsRef.current;
    if (!previousRects) {
      return;
    }

    previousSessionTabRectsRef.current = null;
    animateSessionTabReorder(sessionTabRowsRef.current, previousRects);
  }, [visibleSessionNoteIds]);

  const selectRelativeSessionNote = useCallback(
    async (direction) => {
      if (effectiveLayoutMode !== "tabs" || visibleSessionNotes.length <= 1) {
        return;
      }

      const currentIndex = visibleSessionNotes.findIndex(
        (sessionNote) => sessionNote.id === note.id,
      );
      if (currentIndex < 0) {
        return;
      }

      const nextIndex =
        (currentIndex + direction + visibleSessionNotes.length) %
        visibleSessionNotes.length;
      const nextSessionNote = visibleSessionNotes[nextIndex];
      if (!nextSessionNote || nextSessionNote.id === note.id) {
        return;
      }

      await selectSidebarNote(nextSessionNote.id);
    },
    [effectiveLayoutMode, note.id, selectSidebarNote, visibleSessionNotes],
  );

  const requestMoveCurrentStickyNoteToTrash = useCallback(() => {
    if (notes.length <= 1) {
      showExportToast("At least one session must remain.", "error");
      return;
    }

    setIsColorPanelOpen(false);
    setIsPreferencesWindowOpen(false);
    setIsStickySettingsOpen(false);
    setPendingSessionTrashNote(null);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    setIsStickyTrashConfirmOpen(true);
  }, [notes.length, showExportToast]);

  const moveCurrentStickyNoteToTrash = useCallback(async () => {
    if (notes.length <= 1) {
      showExportToast("At least one session must remain.", "error");
      return;
    }

    setIsStickyTrashConfirmOpen(false);
    setIsColorPanelOpen(false);
    setIsPreferencesWindowOpen(false);
    setIsStickySettingsOpen(false);
    setPendingSessionTrashNote(null);
    setSessionTabMenu(null);
    setSessionColorPanelNoteId(null);
    await saveNow();
    await onDeleteNote(note.id, getCurrentNoteSnapshot());
  }, [
    getCurrentNoteSnapshot,
    note.id,
    notes.length,
    onDeleteNote,
    saveNow,
    showExportToast,
  ]);

  useEffect(() => {
    const handleSessionShortcut = (event) => {
      if (isShortcutRecorderTarget(event.target)) {
        return;
      }

      if (!isKeyboardShortcutEnabled(keyboardShortcutEnabled, "selectTabByNumber")) {
        return;
      }

      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, .preferences-window")
      ) {
        return;
      }

      const sessionIndex = Number(event.key) - 1;
      if (!Number.isInteger(sessionIndex) || sessionIndex < 0 || sessionIndex > 8) {
        return;
      }

      const sessionNote = visibleSessionNotes[sessionIndex];
      if (!sessionNote || sessionNote.id === note.id) {
        return;
      }

      event.preventDefault();
      void selectSidebarNote(sessionNote.id);
    };

    document.addEventListener("keydown", handleSessionShortcut, true);
    return () => {
      document.removeEventListener("keydown", handleSessionShortcut, true);
    };
  }, [keyboardShortcutEnabled, note.id, selectSidebarNote, visibleSessionNotes]);

  useEffect(() => {
    const handleTabModeShortcut = (event) => {
      if (isShortcutRecorderTarget(event.target)) {
        return;
      }

      if (event.target instanceof Element && event.target.closest("input, textarea, select")) {
        return;
      }

      if (effectiveLayoutMode !== "tabs" || visibleSessionNotes.length <= 1) {
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "moveTabLeft")) {
        event.preventDefault();
        event.stopPropagation();
        void moveCurrentSessionNote(-1);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "moveTabRight")) {
        event.preventDefault();
        event.stopPropagation();
        void moveCurrentSessionNote(1);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "previousTab")) {
        event.preventDefault();
        event.stopPropagation();
        void selectRelativeSessionNote(-1);
        return;
      }

      if (matchesEnabledKeyboardShortcut(event, "nextTab")) {
        event.preventDefault();
        event.stopPropagation();
        void selectRelativeSessionNote(1);
      }
    };

    document.addEventListener("keydown", handleTabModeShortcut, true);
    return () => {
      document.removeEventListener("keydown", handleTabModeShortcut, true);
    };
  }, [
    effectiveLayoutMode,
    matchesEnabledKeyboardShortcut,
    moveCurrentSessionNote,
    selectRelativeSessionNote,
    visibleSessionNotes.length,
  ]);

  const detachSessionNote = useCallback(
    async (sessionNote, event) => {
      if (normalizedLayoutMode !== "tabs" || sessionNote.detached) {
        return;
      }

      const sidebar = document.querySelector(".session-sidebar");
      const bounds = sidebar?.getBoundingClientRect();
      const isOutsideSidebar =
        bounds &&
        (event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom);

      if (!isOutsideSidebar) {
        return;
      }

      await saveNow();
      await onDetachNote(sessionNote.id);
    },
    [normalizedLayoutMode, onDetachNote, saveNow],
  );

  const startSessionTabDrag = useCallback(
    (sessionNote, event) => {
      if (normalizedLayoutMode !== "tabs" || sessionNote.detached) {
        return;
      }

      dragOriginalSessionOrderRef.current = visibleSessionNoteIds;
      dragPreviewSessionOrderRef.current = visibleSessionNoteIds;
      dragHasReorderedRef.current = false;
      dragDroppedInsideRef.current = false;
      setDraggingSessionNoteId(sessionNote.id);
      event.dataTransfer?.setData("application/x-notepane-note", sessionNote.id);
      event.dataTransfer?.setData("application/x-notepane-session-reorder", sessionNote.id);
      event.dataTransfer.effectAllowed = "move";
    },
    [normalizedLayoutMode, visibleSessionNoteIds],
  );

  const previewSessionTabReorder = useCallback(
    (sourceNoteId, targetNoteId, insertionSide = "before") => {
      if (!sourceNoteId || !targetNoteId || sourceNoteId === targetNoteId) {
        return;
      }

      const nextOrder = getReorderedNoteIdsForDrop(
        visibleSessionNoteIds,
        sourceNoteId,
        targetNoteId,
        insertionSide,
      );
      if (arraysEqual(nextOrder, visibleSessionNoteIds)) {
        return;
      }

      dragHasReorderedRef.current = true;
      dragPreviewSessionOrderRef.current = nextOrder;
      void reorderSessionNotes(nextOrder, { persist: false });
    },
    [reorderSessionNotes, visibleSessionNoteIds],
  );

  const handleSessionTabDragOver = useCallback(
    (sessionNote, event) => {
      const sourceNoteId = draggingSessionNoteId ??
        event.dataTransfer?.getData("application/x-notepane-session-reorder");
      if (!sourceNoteId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      const rect = event.currentTarget.getBoundingClientRect();
      previewSessionTabReorder(
        sourceNoteId,
        sessionNote.id,
        event.clientY > rect.top + rect.height / 2 ? "after" : "before",
      );
    },
    [draggingSessionNoteId, previewSessionTabReorder],
  );

  const handleSessionTabsDragOver = useCallback(
    (event) => {
      const sourceNoteId = draggingSessionNoteId ??
        event.dataTransfer?.getData("application/x-notepane-session-reorder");
      if (!sourceNoteId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      const firstNoteId = visibleSessionNoteIds[0];
      const lastNoteId = visibleSessionNoteIds.at(-1);
      const firstRow = firstNoteId ? sessionTabRowsRef.current.get(firstNoteId) : null;
      const lastRow = lastNoteId ? sessionTabRowsRef.current.get(lastNoteId) : null;

      if (firstNoteId && firstRow && event.clientY < firstRow.getBoundingClientRect().top) {
        previewSessionTabReorder(sourceNoteId, firstNoteId, "before");
        return;
      }

      if (lastNoteId && lastRow && event.clientY > lastRow.getBoundingClientRect().bottom) {
        previewSessionTabReorder(sourceNoteId, lastNoteId, "after");
      }
    },
    [draggingSessionNoteId, previewSessionTabReorder, visibleSessionNoteIds],
  );

  const dropSessionTab = useCallback(
    async (event) => {
      const sourceNoteId = draggingSessionNoteId ??
        event.dataTransfer?.getData("application/x-notepane-session-reorder");
      if (!sourceNoteId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragDroppedInsideRef.current = true;
      if (dragHasReorderedRef.current) {
        await reorderSessionNotes(dragPreviewSessionOrderRef.current ?? visibleSessionNoteIds, {
          persist: true,
        });
      }
    },
    [draggingSessionNoteId, reorderSessionNotes, visibleSessionNoteIds],
  );

  const endSessionTabDrag = useCallback(
    async (sessionNote, event) => {
      const droppedInside = dragDroppedInsideRef.current;
      const originalOrder = dragOriginalSessionOrderRef.current;
      const previewOrder = dragPreviewSessionOrderRef.current;
      const hasReordered = dragHasReorderedRef.current;
      const endedInsideSessionTabs = isPointInsideElement(
        event,
        document.querySelector(".session-tabs"),
      );
      dragOriginalSessionOrderRef.current = null;
      dragPreviewSessionOrderRef.current = null;
      dragHasReorderedRef.current = false;
      dragDroppedInsideRef.current = false;
      setDraggingSessionNoteId(null);

      if (!droppedInside && hasReordered) {
        if (endedInsideSessionTabs && previewOrder) {
          await reorderSessionNotes(previewOrder, { persist: true });
        } else if (originalOrder) {
          await reorderSessionNotes(originalOrder, { persist: false });
        }
      }

      if (!droppedInside && !endedInsideSessionTabs) {
        await detachSessionNote(sessionNote, event);
      }
    },
    [detachSessionNote, reorderSessionNotes],
  );

  const attachDraggedNote = useCallback(
    async (event) => {
      if (event.dataTransfer?.types.includes("application/x-notepane-session-reorder")) {
        return;
      }

      const noteId = event.dataTransfer?.getData("application/x-notepane-note");
      if (!noteId) {
        return;
      }

      event.preventDefault();
      await onAttachNote(noteId);
    },
    [onAttachNote],
  );

  const startSidebarResize = useCallback(
    (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = isSidebarOpen ? sidebarWidth : SIDEBAR_COMPACT_WIDTH;

      const resize = (pointerEvent) => {
        const nextWidth = startWidth + pointerEvent.clientX - startX;
        if (nextWidth <= SIDEBAR_COLLAPSE_WIDTH) {
          setIsSidebarOpen(false);
          return;
        }

        setSidebarWidth(clamp(nextWidth, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH));
        setIsSidebarOpen(true);
      };

      const stopResize = () => {
        window.removeEventListener("pointermove", resize);
        window.removeEventListener("pointerup", stopResize);
        window.removeEventListener("pointercancel", stopResize);
      };

      window.addEventListener("pointermove", resize);
      window.addEventListener("pointerup", stopResize);
      window.addEventListener("pointercancel", stopResize);
    },
    [isSidebarOpen, sidebarWidth],
  );

  const focusLastBlockFromEmptySurface = useCallback(
    (event) => {
      if (!isEmptyEditorSurfacePointer(event)) {
        return;
      }

      event.preventDefault();
      focusLastEditorBlock(editor);
    },
    [editor],
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (saveRetryTimerRef.current) {
        window.clearTimeout(saveRetryTimerRef.current);
      }
      if (appearanceTimerRef.current) {
        window.clearTimeout(appearanceTimerRef.current);
      }
      if (sessionAppearanceTimerRef.current) {
        window.clearTimeout(sessionAppearanceTimerRef.current);
      }
      if (exportToastTimerRef.current) {
        window.clearTimeout(exportToastTimerRef.current);
      }
      if (editorFontSizeToastTimerRef.current) {
        window.clearTimeout(editorFontSizeToastTimerRef.current);
      }
    };
  }, []);

  return (
    <main
      className={`sticky-shell theme-${appThemeMode} layout-${effectiveLayoutMode} sidebar-${sidebarState}`}
      style={shellStyle}
      data-testid="sticky-shell"
      data-theme-mode={appThemeMode}
      data-layout-mode={effectiveLayoutMode}
    >
      {shouldRenderChromeHeader && (
        <header
          className="sticky-header"
          data-testid="sticky-header"
          data-window-drag-handle={effectiveLayoutMode === "sticky" ? "true" : undefined}
          onPointerDown={startHeaderWindowDrag}
        >
        <div className="sticky-drag-strip" aria-hidden="true" />
        <div
          className={`sticky-header-actions${
            isStickyActionBarOpen ? " is-open" : ""
          }`}
          aria-label="Sticky controls"
        >
          {effectiveLayoutMode === "sticky" && (
            <>
              <div className="sticky-header-action-list">
                <StickyPinButton
                  isPinned={isPinned}
                  shortcut={getEnabledShortcut("toggleAlwaysOnTop")}
                  onClick={() => void togglePin()}
                />
                <ExportPdfButton
                  shortcut={getEnabledShortcut("exportPdf")}
                  onClick={openExportFormatMenu}
                />
                <LayoutModeSwitch
                  mode={normalizedLayoutMode}
                  compact
                  shortcut={getEnabledShortcut("toggleLayoutMode")}
                  onChange={toggleLayoutMode}
                />
                <EditorWidthSwitch
                  wide={isEditorWide}
                  shortcut={getEnabledShortcut("toggleEditorWidth")}
                  onChange={() => onEditorWidthChange?.((value) => !value)}
                />
                <StickySettingsButton
                  active={isStickySettingsOpen}
                  onClick={openStickySettings}
                />
                <StickyTrashButton
                  onClick={requestMoveCurrentStickyNoteToTrash}
                />
              </div>
              <button
                type="button"
                className="sticky-header-action-preview has-tooltip"
                aria-label={
                  isStickyActionBarOpen
                    ? "Close window"
                    : "Show sticky actions"
                }
                aria-expanded={isStickyActionBarOpen}
                data-tooltip={
                  isStickyActionBarOpen
                    ? formatShortcutTooltip(
                        "Close window",
                        getEnabledShortcut("closeWindow"),
                      )
                    : "Show sticky actions"
                }
                onMouseDown={preventFocusLoss}
                onClick={() => {
                  if (isStickyActionBarOpen) {
                    closeCurrentWindow();
                    return;
                  }
                  setIsStickyActionBarOpen(true);
                }}
              >
                {isStickyActionBarOpen ? (
                  <X className="notepane-action-icon" data-icon-tone="delete" />
                ) : (
                  <EllipsisIcon />
                )}
              </button>
            </>
          )}
          {note.detached && normalizedLayoutMode === "tabs" && (
            <button
              type="button"
              className="dock-note-button has-tooltip"
              aria-label="Dock note into tabs"
              data-tooltip={formatShortcutTooltip(
                "Dock to tabs",
                getEnabledShortcut("attachDetachedNote"),
              )}
              onMouseDown={preventFocusLoss}
              onClick={() => void onAttachNote(note.id)}
            >
              <DockIcon />
            </button>
          )}
        </div>
        </header>
      )}
      <div className="sticky-body">
        {effectiveLayoutMode === "tabs" && (
          <aside
            className={`session-sidebar ${isSidebarCompact ? "is-compact" : ""}`}
            data-testid="session-sidebar"
            data-sidebar-state={sidebarState}
            style={sidebarStyle}
            onDragOver={(event) => {
              if (event.dataTransfer?.types.includes("application/x-notepane-note")) {
                event.preventDefault();
              }
            }}
            onDrop={(event) => void attachDraggedNote(event)}
          >
            <div className="session-sidebar-topbar">
              <NotePaneWordmark />
              <button
                type="button"
                className="sidebar-toggle has-tooltip"
                aria-label={isSidebarCompact ? "Show sidebar" : "Hide sidebar"}
                data-tooltip={formatShortcutTooltip(
                  isSidebarCompact ? "Show sidebar" : "Hide sidebar",
                  getEnabledShortcut("toggleSidebar"),
                )}
                onMouseDown={preventFocusLoss}
                onClick={() => {
                  if (isSidebarCompact) {
                    openSidebar();
                    return;
                  }
                  setIsSidebarOpen(false);
                }}
              >
                <SidebarToggleIcon expanded={!isSidebarCompact} />
              </button>
            </div>
            <div className="session-sidebar-content" data-testid="session-sidebar-scroll">
              <div
                className="session-tabs"
                role="tablist"
                aria-label="Note sessions"
                onDragOver={handleSessionTabsDragOver}
                onDrop={(event) => void dropSessionTab(event)}
              >
                {visibleSessionNotes.map((sessionNote, index) =>
                  editingSessionId === sessionNote.id ? (
                    <div
                      key={sessionNote.id}
                      ref={(element) => setSessionTabRowRef(sessionNote.id, element)}
                      className={getSessionTabRowClassName(sessionNote)}
                      data-note-id={sessionNote.id}
                      style={getSessionTabStyle(
                        sessionNote.theme,
                        appThemeMode,
                        noteIndexById.get(sessionNote.id) ?? index,
                      )}
                    >
                      <div
                        role="tab"
                        aria-selected={sessionNote.id === note.id}
                        className="session-tab-edit"
                      >
                        <span className="session-dot">{index + 1}</span>
                        <input
                          aria-label="Session name"
                          value={draftSessionTitle}
                          autoFocus
                          spellCheck={false}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) => {
                            setDraftSessionTitle(event.target.value);
                            setIsDraftSessionTitleDirty(true);
                          }}
                          onBlur={() => void commitSessionRename(sessionNote)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void commitSessionRename(sessionNote);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelSessionRename();
                            }
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div
                      key={sessionNote.id}
                      ref={(element) => setSessionTabRowRef(sessionNote.id, element)}
                      className={getSessionTabRowClassName(sessionNote)}
                      data-note-id={sessionNote.id}
                      style={getSessionTabStyle(
                        sessionNote.theme,
                        appThemeMode,
                        noteIndexById.get(sessionNote.id) ?? index,
                      )}
                      draggable={normalizedLayoutMode === "tabs"}
                      aria-grabbed={
                        draggingSessionNoteId === sessionNote.id ? "true" : undefined
                      }
                      onContextMenu={(event) =>
                        openSessionTabMenu(sessionNote, event)
                      }
                      onDragStart={(event) => startSessionTabDrag(sessionNote, event)}
                      onDragOver={(event) => handleSessionTabDragOver(sessionNote, event)}
                      onDrop={(event) => void dropSessionTab(event)}
                      onDragEnd={(event) => void endSessionTabDrag(sessionNote, event)}
                    >
                      {isSidebarCompact ? (
                        <button
                          type="button"
                          role="tab"
                          aria-selected={sessionNote.id === note.id}
                          className="session-tab-button has-tooltip"
                          data-tooltip={formatShortcutTooltip(
                            `Open ${getSessionDisplayTitle(sessionNote)}`,
                            isKeyboardShortcutEnabled(
                              keyboardShortcutEnabled,
                              "selectTabByNumber",
                            )
                              ? `Mod+${index + 1}`
                              : "",
                          )}
                          onClick={() => void selectSidebarNote(sessionNote.id)}
                          onDoubleClick={(event) => {
                            event.preventDefault();
                            startSessionRename(sessionNote);
                          }}
                        >
                          <span className="session-dot">{index + 1}</span>
                          <span className="session-name">
                            {getSessionDisplayTitle(sessionNote)}
                          </span>
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="session-index-button session-delete-button has-tooltip"
                            aria-label={`Delete session ${getSessionDisplayTitle(sessionNote)}`}
                            disabled={removingSessionIds.has(sessionNote.id)}
                            data-tooltip={
                              sessionNote.id === note.id
                                ? "Move current session to Trash"
                                : "Move session to Trash"
                            }
                            onMouseDown={(event) => {
                              preventFocusLoss(event);
                              event.stopPropagation();
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              requestDeleteSessionNote(sessionNote);
                            }}
                          >
                            <span className="session-index-label">{index + 1}</span>
                            <span className="session-index-delete" aria-hidden="true">
                              <X
                                className="session-index-delete-icon"
                                size={14}
                                strokeWidth={2.25}
                              />
                            </span>
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={sessionNote.id === note.id}
                            className="session-tab-button has-tooltip"
                            data-tooltip={formatShortcutTooltip(
                              `Open ${getSessionDisplayTitle(sessionNote)}`,
                              isKeyboardShortcutEnabled(
                                keyboardShortcutEnabled,
                                "selectTabByNumber",
                              )
                                ? `Mod+${index + 1}`
                                : "",
                            )}
                            onClick={() => void selectSidebarNote(sessionNote.id)}
                            onDoubleClick={(event) => {
                              event.preventDefault();
                              startSessionRename(sessionNote);
                            }}
                          >
                            <span className="session-name">
                              {getSessionDisplayTitle(sessionNote)}
                            </span>
                          </button>
                          <span className="session-tab-trailing">
                            {index < 9 && (
                              <span
                                className="session-shortcut"
                                aria-label={`Shortcut ${getSessionShortcutLabel(index)}`}
                              >
                                {isKeyboardShortcutEnabled(
                                  keyboardShortcutEnabled,
                                  "selectTabByNumber",
                                )
                                  ? getSessionShortcutLabel(index)
                                  : ""}
                              </span>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  ),
                )}
              </div>
              <button
                type="button"
                className="session-add-button has-tooltip"
                aria-label="New session"
                data-tooltip={formatShortcutTooltip(
                  "New session",
                  getEnabledShortcut("newSession"),
                )}
                onMouseDown={preventFocusLoss}
                onClick={requestNewSession}
              >
                <Plus
                  className="session-add-icon"
                  aria-hidden="true"
                  size={14}
                  strokeWidth={2.4}
                />
                <span>New session</span>
              </button>
            </div>
            <div
              className="session-sidebar-footer"
              data-testid="session-sidebar-footer"
              aria-label="Session sidebar controls"
            >
              <div className="session-sidebar-footer-row">
                <button
                  type="button"
                  className="preferences-icon-button has-tooltip"
                  aria-label="Version history"
                  data-tooltip="Version history"
                  onMouseDown={preventFocusLoss}
                  onClick={() => void openVersionHistory()}
                >
                  <History aria-hidden="true" size={17} strokeWidth={2} />
                </button>
                <ExportPdfButton
                  shortcut={getEnabledShortcut("exportPdf")}
                  onClick={openExportFormatMenu}
                />
                <PreferencesButton
                  shortcut={getEnabledShortcut("preferences")}
                  onClick={openPreferences}
                />
                <TrashButton onClick={openTrashPreferences} />
                <LayoutModeSwitch
                  mode={normalizedLayoutMode}
                  compact={isSidebarCompact}
                  shortcut={getEnabledShortcut("toggleLayoutMode")}
                  onChange={toggleLayoutMode}
                />
                <EditorWidthSwitch
                  wide={isEditorWide}
                  shortcut={getEnabledShortcut("toggleEditorWidth")}
                  onChange={() => onEditorWidthChange?.((value) => !value)}
                />
              </div>
            </div>
            <div
              className="sidebar-resize-handle"
              role="separator"
              aria-label="Resize sidebar"
              aria-orientation="vertical"
              onPointerDown={startSidebarResize}
            />
          </aside>
        )}
        <section
          ref={editorSurfaceRef}
          className={[
            "sticky-editor-surface",
            isTableOfContentsVisible ? "has-table-of-contents" : "",
            isEditorWide ? "is-editor-wide" : "is-editor-reading-width",
            note.seedDemoContent ? "is-template-session" : "",
            isMultiTableCellSelection ? "has-multi-table-cell-selection" : "",
          ].filter(Boolean).join(" ")}
          data-testid="sticky-editor-surface"
          data-editor-active={isEditorActive ? "true" : "false"}
          data-toc-visible={isTableOfContentsVisible ? "true" : "false"}
          data-editor-width={isEditorWide ? "wide" : "reading"}
          onFocusCapture={() => {
            setIsEditorActive(true);
            setIsTableCellSelectionDismissed(false);
          }}
          onBlurCapture={(event) => {
            const nextTarget = event.relatedTarget;
            if (
              !(nextTarget instanceof Element) ||
              (!event.currentTarget.contains(nextTarget) &&
                !nextTarget.closest(".editor-floating-menu"))
            ) {
              setIsEditorActive(false);
            }
          }}
          onPointerDownCapture={(event) => {
            setIsEditorActive(true);
            setIsTableCellSelectionDismissed(false);
            suppressFocusedTableCellRef.current = isBlankTableSurfacePointer(event);
            if (suppressFocusedTableCellRef.current) {
              event.preventDefault();
              const view = editor.prosemirrorView;
              if (view && !view.isDestroyed) {
                view.setProps({ decorations: () => DecorationSet.empty });
              }
            }
          }}
          onPointerUpCapture={(event) => {
            if (!suppressFocusedTableCellRef.current) {
              const view = editor.prosemirrorView;
              if (view && !view.isDestroyed && focusedTableDecorationsRef.current) {
                view.setProps({ decorations: focusedTableDecorationsRef.current });
              }
              window.requestAnimationFrame(() => updateFocusedTableCell(event.target));
            }
          }}
          onClickCapture={(event) => {
            if (!suppressFocusedTableCellRef.current) {
              window.requestAnimationFrame(() => updateFocusedTableCell(event.target));
            }
          }}
          onMouseDown={focusLastBlockFromEmptySurface}
        >
          {editorFontSizeToast && (
            <div
              className="editor-font-size-toast"
              role="status"
              aria-live="polite"
            >
              {editorFontSizeToast}
            </div>
          )}
          {isTableOfContentsVisible && (
            <TableOfContentsRail
              entries={tableOfContentsEntries}
              activeEntryIds={activeTableOfContentsEntryIds}
              onSelectEntry={selectTableOfContentsEntry}
            />
          )}
          {note.seedDemoContent && (
            <button
              type="button"
              className="template-use-button"
              aria-label="Use this template"
              onMouseDown={preventFocusLoss}
              onClick={() => void useTemplateSession()}
            >
              <Check className="template-use-icon" aria-hidden="true" />
              <span>Use this template</span>
            </button>
          )}
          {isDefaultTemplateSuggestionVisible && (
            <div className="default-template-suggestion" role="status">
              <span>Start with the default template?</span>
              <button
                type="button"
                onMouseDown={preventFocusLoss}
                onClick={applyDefaultTemplate}
              >
                <Plus className="default-template-suggestion-icon" aria-hidden="true" />
                Add default template
              </button>
            </div>
          )}
          <BlockNoteView
            editor={editor}
            theme={appThemeMode}
            onChange={handleEditorChange}
            onSelectionChange={() => {
              window.requestAnimationFrame(() => {
                updateFocusedTableCell();
                updateTableCellSelectionMode();
              });
            }}
            portalElements={{ default: document.body }}
            formattingToolbar={false}
            sideMenu={false}
            slashMenu={false}
          >
            <NotePaneSlashMenuController
              editor={editor}
              onImportMarkdown={() => setIsMarkdownImportOpen(true)}
            />
            <RecentColorFormattingToolbarController
              recentColors={recentEditorColors}
              onColorUsed={onEditorColorUsed}
              onCropImage={openCropDialog}
              onDownloadImage={downloadActiveImage}
              activeImageBlockId={activeImageBlockId}
              portalElement={document.body}
              hidden={isTableCellSelectionDismissed}
            />
            <BlockMenuHighlightController />
            <NotePaneSideMenuController
              recentColors={recentEditorColors}
              onColorUsed={onEditorColorUsed}
            />
          </BlockNoteView>
          {codeBlockToolTargets.map(({ blockId, element }) => (
            <CodeBlockTools
              key={`code-block-tools-${blockId}`}
              editor={editor}
              blockId={blockId}
              targetElement={element}
            />
          ))}
        </section>
      </div>
      {isVersionHistoryOpen && (
        <VersionHistoryPanel
          versions={noteVersions}
          isBusy={isVersionBusy}
          theme={appThemeMode}
          onClose={() => setIsVersionHistoryOpen(false)}
          onRestore={(version) => void restoreVersion(version)}
        />
      )}
      {layoutTransition && (
        <LayoutTransitionOverlay transition={layoutTransition} />
      )}
      {sessionTabMenu && sessionTabMenuNote && (
        <SessionTabContextMenu
          x={sessionTabMenu.x}
          y={sessionTabMenu.y}
          sessionNote={sessionTabMenuNote}
          onOpenColor={() => openSessionColorPanel(sessionTabMenuNote.id)}
        />
      )}
      {exportFormatMenu && (
        <ExportFormatMenu
          x={exportFormatMenu.x}
          y={exportFormatMenu.y}
          onExport={(type) => void exportNote(type)}
        />
      )}
      {isMarkdownImportOpen && (
        <MarkdownImportDialog
          onClose={() => setIsMarkdownImportOpen(false)}
          onImport={importMarkdownFile}
        />
      )}
      {isColorPanelOpen && (
        <ColorPanel
          theme={theme}
          variant="sticky"
          defaultColor={
            effectiveLayoutMode === "sticky" ? stickyAccentColor : undefined
          }
          onChange={updateTheme}
          onClose={() => setIsColorPanelOpen(false)}
        />
      )}
      {sessionColorPanelNote && (
        <ColorPanel
          theme={normalizeTheme(sessionColorPanelNote.theme)}
          variant="tabs"
          defaultColor={resolveSessionTabAccentColor(
            sessionColorPanelNote.theme,
            resolveStickyAccentColor(
              sessionColorPanelNote.theme,
              noteIndexById.get(sessionColorPanelNote.id) ?? 0,
            ),
          )}
          onChange={(nextTheme) =>
            updateSessionNoteTheme(sessionColorPanelNote.id, nextTheme)
          }
          onClose={() => setSessionColorPanelNoteId(null)}
        />
      )}
      {pendingSessionTrashNote && (
        <SessionTrashConfirmDialog
          noteTitle={getSessionDisplayTitle(pendingSessionTrashNote)}
          onCancel={() => setPendingSessionTrashNote(null)}
          onConfirm={() => void confirmDeleteSessionNote()}
        />
      )}
      {pendingSessionCloseNote && (
        <SessionCloseConfirmDialog
          noteTitle={getSessionDisplayTitle(pendingSessionCloseNote)}
          onCancel={() => setPendingSessionCloseNote(null)}
          onConfirm={() => void confirmCloseCurrentTab()}
        />
      )}
      {isStickySettingsOpen && (
        <StickySettingsWindow
          noteTitle={title}
          theme={theme}
          defaultColor={stickyAccentColor}
          onThemeChange={updateTheme}
          onClose={() => setIsStickySettingsOpen(false)}
        />
      )}
      {isStickyTrashConfirmOpen && (
        <StickyTrashConfirmDialog
          noteTitle={title}
          onCancel={() => setIsStickyTrashConfirmOpen(false)}
          onConfirm={() => void moveCurrentStickyNoteToTrash()}
        />
      )}
      {isPreferencesWindowOpen && (
        <PreferencesWindow
          initialPage={preferencesInitialPage}
          appThemeMode={appThemeMode}
          editorPreferences={editorPreferences}
          keyboardShortcuts={keyboardShortcuts}
          appFontOptions={appFontOptions}
          fontOptions={editorFontOptions}
          trashedNotes={trashedNotes}
          onAppThemeModeChange={onAppThemeModeChanged}
          onEditorPreferencesChange={updateGlobalEditorPreferences}
          onExportBackup={exportDataBackup}
          onImportBackup={importDataBackup}
          onRestoreTrashedNote={onRestoreTrashedNote}
          onPurgeTrashedNote={onPurgeTrashedNote}
          onClose={() => setIsPreferencesWindowOpen(false)}
        />
      )}
      {exportToast && <StickyToast toast={exportToast} />}
      <AdaptiveTooltipPortal />
      {cropState && (
        <CropDialog
          sourceUrl={cropState.sourceUrl}
          initialCrop={cropState.crop}
          onApply={applyCrop}
          onClose={() => setCropState(null)}
        />
      )}
    </main>
  );
}

function CodeBlockTools({ editor, blockId, targetElement }) {
  const [copyStatus, setCopyStatus] = useState("idle");
  const [formatStatus, setFormatStatus] = useState("idle");
  const [position, setPosition] = useState(null);
  const copyResetTimerRef = useRef(null);
  const formatResetTimerRef = useRef(null);
  const block = findBlockById(editor.document, blockId);
  const language = normalizeCodeLanguage(block?.props?.language);
  const languageLabel = getCodeLanguageLabel(language);
  const code = getCodeBlockText(block);
  const canPrettify = Boolean(code.trim() && getCodeFormatter(language));

  useLayoutEffect(() => {
    const editorSurface = targetElement?.closest(
      "[data-testid='sticky-editor-surface']",
    );
    if (!editorSurface) {
      return undefined;
    }

    const updatePosition = () => {
      const blockRect = targetElement.getBoundingClientRect();
      const surfaceRect = editorSurface.getBoundingClientRect();
      const nextPosition = {
        top: blockRect.top - surfaceRect.top + editorSurface.scrollTop + 8,
        left: blockRect.right - surfaceRect.left + editorSurface.scrollLeft - 9,
      };
      setPosition((currentPosition) =>
        currentPosition &&
        Math.abs(currentPosition.top - nextPosition.top) < 0.5 &&
        Math.abs(currentPosition.left - nextPosition.left) < 0.5
          ? currentPosition
          : nextPosition,
      );
    };

    updatePosition();
    const editorDocument = targetElement.closest(".bn-editor");
    const resizeObserver = new ResizeObserver(updatePosition);
    resizeObserver.observe(targetElement);
    resizeObserver.observe(editorSurface);
    if (editorDocument) {
      resizeObserver.observe(editorDocument);
    }
    const layoutObserver = new MutationObserver(updatePosition);
    if (editorDocument) {
      layoutObserver.observe(editorDocument, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }
    window.addEventListener("resize", updatePosition);
    return () => {
      resizeObserver.disconnect();
      layoutObserver.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [targetElement]);

  useEffect(() => () => {
    if (copyResetTimerRef.current) {
      window.clearTimeout(copyResetTimerRef.current);
    }
    if (formatResetTimerRef.current) {
      window.clearTimeout(formatResetTimerRef.current);
    }
  }, []);

  const scheduleStatusReset = (timerRef, setter) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => setter("idle"), 1600);
  };

  const copyCode = async () => {
    const currentBlock = findBlockById(editor.document, blockId);
    const copied = await writeClipboardText(getCodeBlockText(currentBlock));
    setCopyStatus(copied ? "success" : "error");
    scheduleStatusReset(copyResetTimerRef, setCopyStatus);
  };

  const prettifyCodeBlock = async () => {
    const currentBlock = findBlockById(editor.document, blockId);
    const currentLanguage = normalizeCodeLanguage(currentBlock?.props?.language);
    const code = getCodeBlockText(currentBlock);
    if (!currentBlock || !code.trim() || !getCodeFormatter(currentLanguage)) {
      return;
    }

    setFormatStatus("working");
    try {
      const formattedCode = await formatCodeForLanguage(code, currentLanguage);
      if (formattedCode !== code) {
        editor.updateBlock(blockId, { content: formattedCode });
        setFormatStatus("success");
      } else {
        setFormatStatus("unchanged");
      }
    } catch {
      setFormatStatus("error");
    }
    scheduleStatusReset(formatResetTimerRef, setFormatStatus);
  };

  const formatLabel = !getCodeFormatter(language)
    ? `Prettify unavailable for ${languageLabel}`
    : formatStatus === "working"
      ? `Prettifying ${languageLabel} code`
      : formatStatus === "success"
        ? `${languageLabel} code prettified`
        : formatStatus === "unchanged"
          ? `${languageLabel} code is already formatted`
        : formatStatus === "error"
          ? `Could not prettify ${languageLabel} code`
          : `Prettify ${languageLabel} code`;
  const formatButtonText = formatStatus === "working"
    ? "Formatting…"
    : formatStatus === "success"
      ? "Formatted"
      : formatStatus === "unchanged"
        ? "Already formatted"
        : formatStatus === "error"
          ? "Failed"
          : "Prettify";
  const copyLabel = copyStatus === "success"
    ? `${languageLabel} code copied`
    : copyStatus === "error"
      ? `Could not copy ${languageLabel} code`
      : `Copy ${languageLabel} code`;

  return (
    <div
      className="code-block-tools"
      role="toolbar"
      aria-label={`${languageLabel} code block actions`}
      contentEditable={false}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      <button
        type="button"
        className={`code-block-tool-button code-block-prettify-button is-${formatStatus}`}
        aria-label={formatLabel}
        data-tooltip={formatLabel}
        title={!getCodeFormatter(language) ? formatLabel : undefined}
        disabled={!canPrettify || formatStatus === "working"}
        onMouseDown={preventFocusLoss}
        onClick={() => void prettifyCodeBlock()}
      >
        {formatButtonText}
      </button>
      <button
        type="button"
        className={`code-block-tool-button code-block-copy-button is-${copyStatus}`}
        aria-label={copyLabel}
        data-tooltip={copyLabel}
        onMouseDown={preventFocusLoss}
        onClick={() => void copyCode()}
      >
        {copyStatus === "success" ? (
          <Check aria-hidden="true" />
        ) : copyStatus === "error" ? (
          <X aria-hidden="true" />
        ) : (
          <Copy aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function useCodeBlockToolTargets() {
  const [targets, setTargets] = useState([]);

  useLayoutEffect(() => {
    const editorSurface = document.querySelector(
      "[data-testid='sticky-editor-surface']",
    );
    if (!editorSurface) {
      return undefined;
    }

    let animationFrame = null;
    const syncTargets = () => {
      animationFrame = null;
      const nextTargets = [...editorSurface.querySelectorAll(
        ".bn-block-content[data-content-type='codeBlock']",
      )].flatMap((element) => {
        const blockId = element.closest(".bn-block-outer[data-id]")?.dataset.id;
        return blockId ? [{ blockId, element }] : [];
      });

      setTargets((currentTargets) => {
        const unchanged =
          currentTargets.length === nextTargets.length &&
          currentTargets.every(
            (target, index) =>
              target.blockId === nextTargets[index].blockId &&
              target.element === nextTargets[index].element,
          );
        return unchanged ? currentTargets : nextTargets;
      });
    };
    const scheduleSync = () => {
      if (animationFrame !== null) {
        return;
      }
      animationFrame = window.requestAnimationFrame(syncTargets);
    };

    syncTargets();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(editorSurface, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  return targets;
}

function normalizeCodeLanguage(language) {
  const normalizedLanguage = String(language || "text").trim().toLowerCase();
  return CODE_FORMAT_LANGUAGE_ALIASES[normalizedLanguage] || normalizedLanguage;
}

function getCodeBlockText(block) {
  if (typeof block?.content === "string") {
    return block.content;
  }
  if (!Array.isArray(block?.content)) {
    return "";
  }
  return block.content
    .map((content) =>
      typeof content === "string" ? content : String(content?.text ?? ""),
    )
    .join("");
}

function getCodeLanguageLabel(language) {
  return codeBlockOptions.supportedLanguages?.[language]?.name || language || "Plain Text";
}

function getCodeFormatter(language) {
  return CODE_FORMATTERS[normalizeCodeLanguage(language)] || null;
}

async function formatCodeForLanguage(code, language) {
  const formatter = getCodeFormatter(language);
  if (!formatter) {
    throw new Error(`No formatter is available for ${language}.`);
  }

  if (formatter.custom === "jsonl") {
    return formatJsonLines(code);
  }

  const [{ format }, plugins] = await Promise.all([
    import("prettier/standalone"),
    Promise.all(formatter.plugins.map(loadCodeFormatPlugin)),
  ]);
  const formattedCode = await format(code, {
    parser: formatter.parser,
    plugins,
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
  });
  return formattedCode.replace(/\r\n?/g, "\n").replace(/\n$/, "");
}

function loadCodeFormatPlugin(pluginName) {
  if (!loadedCodeFormatPlugins.has(pluginName)) {
    const loader = CODE_FORMAT_PLUGIN_LOADERS[pluginName];
    if (!loader) {
      throw new Error(`Unknown code format plugin: ${pluginName}`);
    }
    loadedCodeFormatPlugins.set(pluginName, loader());
  }
  return loadedCodeFormatPlugins.get(pluginName);
}

function formatJsonLines(code) {
  return String(code)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.stringify(JSON.parse(line)))
    .join("\n");
}

function StickyToast({ toast }) {
  return (
    <div
      className={`sticky-toast sticky-toast-${toast.tone}`}
      role="status"
      aria-live="polite"
    >
      <span className="sticky-toast-message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="sticky-toast-action"
          onMouseDown={preventFocusLoss}
          onClick={toast.action.onClick}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

function VersionHistoryPanel({ versions, isBusy, theme, onClose, onRestore }) {
  const [selectedVersionId, setSelectedVersionId] = useState(versions[0]?.id ?? null);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0];
  const previewContent = useMemo(
    () => parseBlocksJSON(selectedVersion?.blocksJSON) ?? EMPTY_BLOCKS,
    [selectedVersion],
  );
  const previewEditor = useCreateBlockNote({
    schema,
    initialContent: previewContent,
  });

  useEffect(() => {
    if (!selectedVersion) return;
    previewEditor.replaceBlocks(previewEditor.document, previewContent);
  }, [previewContent, previewEditor, selectedVersion]);

  return createPortal(
    <div className="version-history-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="version-history-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="version-history-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="version-history-header">
          <h2 id="version-history-title">Version history</h2>
          <button
            type="button"
            aria-label="Close version history"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >×</button>
        </div>
        <div className="version-history-body">
          <div className="version-history-preview" aria-label="Version preview">
            {selectedVersion ? (
              <BlockNoteView
                editor={previewEditor}
                editable={false}
                theme={theme}
                formattingToolbar={false}
                sideMenu={false}
                slashMenu={false}
              />
            ) : (
              <p className="version-history-empty">No saved versions yet.</p>
            )}
          </div>
          <div className="version-history-list">
            {versions.length === 0 && <p className="version-history-empty">No saved versions yet.</p>}
            {versions.map((version) => (
              <button
                type="button"
                className={`version-history-item${version.id === selectedVersion?.id ? " is-selected" : ""}`}
                key={version.id}
                onClick={() => setSelectedVersionId(version.id)}
              >
                <time dateTime={new Date(version.createdAt).toISOString()}>
                  {new Date(version.createdAt).toLocaleString()}
                </time>
                <span className={`version-history-source version-history-source-${version.source ?? "auto"}`}>
                  {version.source === "manual"
                    ? "Saved manually"
                    : version.source === "restore"
                      ? "Before restore"
                      : "Auto-saved"}
                </span>
              </button>
            ))}
          </div>
        </div>
        {selectedVersion && (
          <div className="version-history-footer">
            <button type="button" disabled={isBusy} onClick={() => onRestore(selectedVersion)}>
              {isBusy ? "Restoring..." : "Restore this version"}
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}

function LayoutTransitionOverlay({ transition }) {
  const targetMode = normalizeLayoutMode(transition?.targetMode);
  const noteCount = Number.isFinite(transition?.noteCount)
    ? Math.max(0, transition.noteCount)
    : 0;
  const isStickyTarget = targetMode === "sticky";
  const title = isStickyTarget ? "Opening sticky windows" : "Switching to tabs";
  const detail = isStickyTarget
    ? `Preparing ${noteCount || "your"} sticky ${noteCount === 1 ? "window" : "windows"}...`
    : "Collecting notes into tabs...";

  return (
    <div
      className="layout-transition-overlay"
      data-testid="layout-transition-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="layout-transition-panel">
        <span className="layout-transition-spinner" aria-hidden="true" />
        <span className="layout-transition-copy">
          <strong>{title}</strong>
          <span>{detail}</span>
        </span>
      </div>
    </div>
  );
}

function TableOfContentsRail({ entries, activeEntryIds, onSelectEntry }) {
  return (
    <nav
      className="editor-table-of-contents"
      data-testid="editor-toc"
      aria-label="Table of contents"
    >
      <div className="editor-toc-header">
        <TableOfContentsIcon
          className="notepane-action-icon notepane-icon-toc"
          data-icon-tone="sidebar"
        />
        <span>Contents</span>
      </div>
      <div className="editor-toc-list" role="list">
        {entries.map((entry) => (
          <div className="editor-toc-item" role="listitem" key={entry.id}>
            <button
              type="button"
              className="editor-toc-entry"
              data-heading-level={entry.level}
              data-active={activeEntryIds.includes(entry.id) ? "true" : undefined}
              aria-current={activeEntryIds.includes(entry.id) ? "location" : undefined}
              style={{ "--toc-indent": `${(entry.level - 1) * 10}px` }}
              aria-label={`Jump to ${entry.title}, heading level ${entry.level}`}
              onMouseDown={preventFocusLoss}
              onClick={() => onSelectEntry(entry)}
            >
              {entry.title}
            </button>
          </div>
        ))}
      </div>
    </nav>
  );
}

function ColorSettingsSection({
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

function EditorPreferencesSection({
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

const PREFERENCE_SHORTCUT_COMMANDS = [
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

function KeyboardShortcutsSection({
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

function TrashPreferencesSection({
  trashedNotes = [],
  onRestoreNote,
  onPurgeNote,
}) {
  const [selectedTrashNoteIds, setSelectedTrashNoteIds] = useState(() => new Set());
  const [pendingPurgeNoteIds, setPendingPurgeNoteIds] = useState([]);
  const [previewTrashNoteId, setPreviewTrashNoteId] = useState(null);
  const visibleTrashedNotes = Array.isArray(trashedNotes) ? trashedNotes : [];
  const visibleTrashNoteIds = useMemo(
    () => visibleTrashedNotes.map((trashNote) => trashNote.id).filter(Boolean),
    [visibleTrashedNotes],
  );
  const selectedTrashNotes = useMemo(
    () => visibleTrashedNotes.filter((trashNote) => selectedTrashNoteIds.has(trashNote.id)),
    [selectedTrashNoteIds, visibleTrashedNotes],
  );
  const pendingPurgeNotes = useMemo(() => {
    const pendingIds = new Set(pendingPurgeNoteIds);
    return visibleTrashedNotes.filter((trashNote) => pendingIds.has(trashNote.id));
  }, [pendingPurgeNoteIds, visibleTrashedNotes]);
  const selectedCount = selectedTrashNotes.length;
  const selectedTrashNoteLabel = `${selectedCount} selected ${
    selectedCount === 1 ? "note" : "notes"
  }`;
  const allTrashNotesSelected =
    visibleTrashNoteIds.length > 0 && selectedCount === visibleTrashNoteIds.length;
  const someTrashNotesSelected = selectedCount > 0 && !allTrashNotesSelected;

  useEffect(() => {
    const visibleIds = new Set(visibleTrashNoteIds);
    if (previewTrashNoteId && !visibleIds.has(previewTrashNoteId)) {
      setPreviewTrashNoteId(null);
    }
    setSelectedTrashNoteIds((currentIds) => {
      const nextIds = new Set(
        [...currentIds].filter((noteId) => visibleIds.has(noteId)),
      );
      return nextIds.size === currentIds.size ? currentIds : nextIds;
    });
    setPendingPurgeNoteIds((currentIds) => {
      const nextIds = currentIds.filter((noteId) => visibleIds.has(noteId));
      return nextIds.length === currentIds.length ? currentIds : nextIds;
    });
  }, [previewTrashNoteId, visibleTrashNoteIds]);

  const toggleTrashNoteSelection = useCallback((noteId) => {
    setSelectedTrashNoteIds((currentIds) => {
      const nextIds = new Set(currentIds);
      if (nextIds.has(noteId)) {
        nextIds.delete(noteId);
      } else {
        nextIds.add(noteId);
      }
      return nextIds;
    });
  }, []);

  const handleTrashRowKeyDown = useCallback(
    (event, noteId) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      toggleTrashNoteSelection(noteId);
    },
    [toggleTrashNoteSelection],
  );

  const setAllTrashNotesSelected = useCallback(
    (checked) => {
      setSelectedTrashNoteIds(checked ? new Set(visibleTrashNoteIds) : new Set());
    },
    [visibleTrashNoteIds],
  );

  const restoreSelectedTrashNotes = useCallback(async () => {
    const noteIds = selectedTrashNotes.map((trashNote) => trashNote.id);
    if (noteIds.length === 0) {
      return;
    }

    setSelectedTrashNoteIds((currentIds) => {
      const nextIds = new Set(currentIds);
      for (const noteId of noteIds) {
        nextIds.delete(noteId);
      }
      return nextIds;
    });
    for (const noteId of noteIds) {
      await onRestoreNote?.(noteId);
    }
  }, [onRestoreNote, selectedTrashNotes]);

  const confirmSelectedTrashPurge = useCallback(() => {
    if (selectedTrashNotes.length === 0) {
      return;
    }

    setPendingPurgeNoteIds(selectedTrashNotes.map((trashNote) => trashNote.id));
  }, [selectedTrashNotes]);

  const purgePendingTrashNotes = useCallback(async () => {
    const noteIds = pendingPurgeNotes.map((trashNote) => trashNote.id);
    if (noteIds.length === 0) {
      setPendingPurgeNoteIds([]);
      return;
    }

    setPendingPurgeNoteIds([]);
    setSelectedTrashNoteIds((currentIds) => {
      const nextIds = new Set(currentIds);
      for (const noteId of noteIds) {
        nextIds.delete(noteId);
      }
      return nextIds;
    });
    for (const noteId of noteIds) {
      await onPurgeNote?.(noteId);
    }
  }, [onPurgeNote, pendingPurgeNotes]);

  const confirmPurgeNote = pendingPurgeNotes.length === 1
    ? {
        ...pendingPurgeNotes[0],
        title: getNoteDisplayTitle(pendingPurgeNotes[0]),
      }
    : null;
  const confirmPurgeCount = pendingPurgeNotes.length;
  const confirmPurgeSummary = confirmPurgeNote
    ? confirmPurgeNote.title
    : `${confirmPurgeCount} selected notes`;
  const previewTrashNote = previewTrashNoteId
    ? visibleTrashedNotes.find((trashNote) => trashNote.id === previewTrashNoteId) ?? null
    : null;

  return (
    <section className="preferences-section preferences-trash-section">
      <div className="preferences-section-title">Trash</div>
      <div className="preferences-section-description">
        Deleted sessions are hidden from tabs and sticky windows until restored.
      </div>
      {visibleTrashedNotes.length === 0 ? (
        <div className="trash-empty-state" role="status">
          Trash is empty.
        </div>
      ) : (
        <>
          <div className="trash-selection-toolbar" aria-label="Trash selection actions">
            <TrashSelectionCheckbox
              ariaLabel="Select all trash notes"
              checked={allTrashNotesSelected}
              className="trash-select-all-control"
              indeterminate={someTrashNotesSelected}
              onChange={(event) => setAllTrashNotesSelected(event.target.checked)}
            >
              Select all
            </TrashSelectionCheckbox>
            <div className="trash-selection-status" aria-live="polite">
              {selectedCount} selected
            </div>
            <div className="trash-bulk-actions">
              <button
                type="button"
                className="trash-action-button"
                aria-label={
                  selectedCount > 0
                    ? `Restore ${selectedTrashNoteLabel}`
                    : "Restore selected notes"
                }
                disabled={selectedCount === 0}
                onMouseDown={preventFocusLoss}
                onClick={() => void restoreSelectedTrashNotes()}
              >
                <RestoreNoteIcon />
                <span>Restore selected</span>
              </button>
              <button
                type="button"
                className="trash-action-button trash-action-danger"
                aria-label={
                  selectedCount > 0
                    ? `Delete permanently ${selectedTrashNoteLabel}`
                    : "Delete selected notes permanently"
                }
                disabled={selectedCount === 0}
                onMouseDown={preventFocusLoss}
                onClick={confirmSelectedTrashPurge}
              >
                <PermanentDeleteIcon />
                <span>Delete selected</span>
              </button>
            </div>
          </div>
          <div className="trash-note-list" role="list" aria-label="Trash notes">
            {visibleTrashedNotes.map((trashNote) => {
              const title = getNoteDisplayTitle(trashNote);
              const selected = selectedTrashNoteIds.has(trashNote.id);
              return (
                <div
                  className={`trash-note-row${selected ? " is-selected" : ""}`}
                  role="listitem"
                  key={trashNote.id}
                  aria-selected={selected}
                  tabIndex={0}
                  onClick={() => toggleTrashNoteSelection(trashNote.id)}
                  onKeyDown={(event) => handleTrashRowKeyDown(event, trashNote.id)}
                >
                  <div className="trash-note-main">
                    <TrashSelectionCheckbox
                      ariaLabel={`Select ${title}`}
                      checked={selected}
                      onChange={() => toggleTrashNoteSelection(trashNote.id)}
                    />
                    <div className="trash-note-meta">
                      <div className="trash-note-title">{title}</div>
                      <div className="trash-note-date">
                        {formatTrashTimestamp(trashNote.trashedAt)}
                      </div>
                    </div>
                  </div>
                  <div className="trash-note-row-actions">
                    <button
                      type="button"
                      className="trash-preview-button has-tooltip"
                      aria-label={`Preview ${title}`}
                      data-tooltip="Preview"
                      onMouseDown={(event) => {
                        preventFocusLoss(event);
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPreviewTrashNoteId(trashNote.id);
                      }}
                    >
                      <PreviewNoteIcon />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {confirmPurgeCount > 0 && (
        <div
          className="trash-confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingPurgeNoteIds([]);
            }
          }}
        >
          <div
            className="trash-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Delete permanently confirmation"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div>
              <div className="trash-confirm-title">
                {confirmPurgeNote ? "Delete permanently?" : "Delete selected permanently?"}
              </div>
              <div className="trash-confirm-message">
                {confirmPurgeNote
                  ? "This note cannot be recovered after deletion."
                  : "These notes cannot be recovered after deletion."}
              </div>
              <div className="trash-confirm-note">{confirmPurgeSummary}</div>
            </div>
            <div className="trash-confirm-actions">
              <button
                type="button"
                className="trash-confirm-button"
                onMouseDown={preventFocusLoss}
                onClick={() => setPendingPurgeNoteIds([])}
              >
                Cancel
              </button>
              <button
                type="button"
                className="trash-confirm-button trash-confirm-danger"
                aria-label={
                  confirmPurgeNote
                    ? `Yes, permanently delete ${confirmPurgeNote.title}`
                    : `Yes, permanently delete ${confirmPurgeCount} selected notes`
                }
                onMouseDown={preventFocusLoss}
                onClick={() => void purgePendingTrashNotes()}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
      {previewTrashNote && (
        <TrashPreviewDialog
          note={previewTrashNote}
          onClose={() => setPreviewTrashNoteId(null)}
        />
      )}
    </section>
  );
}

function TrashSelectionCheckbox({
  ariaLabel,
  checked,
  children = null,
  className = "",
  indeterminate = false,
  onChange,
}) {
  const inputRef = useRef(null);

  useLayoutEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <label
      className={`trash-selection-control ${className}`.trim()}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="checkbox"
        className="trash-selection-checkbox"
        aria-label={ariaLabel}
        checked={checked}
        onChange={onChange}
      />
      <span className="trash-selection-check" aria-hidden="true">
        {checked && <Check className="trash-selection-check-icon" size={13} strokeWidth={2.6} />}
      </span>
      {children && <span className="trash-selection-label">{children}</span>}
    </label>
  );
}

function TrashPreviewDialog({ note, onClose }) {
  const noteTitle = getNoteDisplayTitle(note);
  const previewLines = useMemo(() => getTrashPreviewLines(note), [note]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onClose]);

  return (
    <div
      className="trash-confirm-backdrop trash-preview-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="trash-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Trash note preview"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="trash-preview-header">
          <div>
            <div className="trash-preview-kicker">Preview</div>
            <div className="trash-preview-title">{noteTitle}</div>
          </div>
          <button
            type="button"
            className="trash-preview-close-button"
            aria-label="Close preview"
            onMouseDown={preventFocusLoss}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="trash-preview-date">
          {formatTrashTimestamp(note.trashedAt)}
        </div>
        <div className="trash-preview-content" role="document" tabIndex={0}>
          {previewLines.length > 0 ? (
            previewLines.map((line, index) => (
              <p className="trash-preview-line" key={`${line}-${index}`}>
                {line}
              </p>
            ))
          ) : (
            <div className="trash-preview-empty">No text content in this note.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ColorPanel({
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

function StickySettingsWindow({
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

function StickyTrashConfirmDialog({
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

function SessionTrashConfirmDialog({
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

function SessionCloseConfirmDialog({
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

function MoveToTrashConfirmDialog({
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

const PREFERENCE_PAGES = [
  { id: "general", label: "General" },
  { id: "editor", label: "Editor" },
  { id: "trash", label: "Trash" },
  { id: "shortcuts", label: "Shortcuts" },
];

function normalizePreferencePageId(pageId) {
  return PREFERENCE_PAGES.some((page) => page.id === pageId)
    ? pageId
    : "general";
}

function PreferencesWindow({
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

function HeaderModeSwitch({ mode, shortcut, onChange }) {
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

function PreferenceToggleSwitch({ checked, ariaLabel, onChange }) {
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

function PreferencesButton({ shortcut, onClick }) {
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

function TrashButton({ onClick }) {
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

function ExportPdfButton({ shortcut, onClick }) {
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

function StickyPinButton({ isPinned = false, shortcut, onClick }) {
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

function StickySettingsButton({ active = false, onClick }) {
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

function StickyTrashButton({ onClick }) {
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

function LayoutModeSwitch({ mode, compact = false, shortcut, onChange }) {
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
        aria-hidden="true"
      />
    </button>
  );
}

function EditorWidthSwitch({ wide = false, shortcut, onChange }) {
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
        aria-hidden="true"
      />
    </button>
  );
}

function SessionTabContextMenu({
  x,
  y,
  sessionNote,
  onOpenColor,
}) {
  const colorPreview = resolveSessionTabAccentColor(sessionNote.theme);

  return (
    <div
      className="session-tab-context-menu editor-floating-menu"
      role="menu"
      aria-label={`Session options for ${getNoteDisplayTitle(sessionNote)}`}
      style={{
        "--session-tab-menu-x": `${x}px`,
        "--session-tab-menu-y": `${y}px`,
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        onMouseDown={preventFocusLoss}
        onClick={onOpenColor}
      >
        <span
          className="session-tab-menu-color-swatch"
          style={{ "--session-tab-menu-color": colorPreview }}
          aria-hidden="true"
        />
        <span>Color...</span>
      </button>
    </div>
  );
}

function ExportFormatMenu({ x, y, onExport }) {
  return (
    <div
      className="export-format-menu editor-floating-menu"
      role="menu"
      aria-label="Export format"
      style={{
        "--export-format-menu-x": `${x}px`,
        "--export-format-menu-y": `${y}px`,
      }}
    >
      <button
        type="button"
        role="menuitem"
        onMouseDown={preventFocusLoss}
        onClick={() => onExport("pdf")}
      >
        <FileDown aria-hidden="true" size={16} strokeWidth={2} />
        <span className="export-format-menu-copy">
          <strong>PDF</strong>
          <small>Print-ready document</small>
        </span>
      </button>
      <button
        type="button"
        role="menuitem"
        onMouseDown={preventFocusLoss}
        onClick={() => onExport("md")}
      >
        <Download aria-hidden="true" size={16} strokeWidth={2} />
        <span className="export-format-menu-copy">
          <strong>Markdown</strong>
          <small>Editable .md file</small>
        </span>
      </button>
    </div>
  );
}

function MarkdownImportDialog({ onClose, onImport }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isImporting) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [isImporting, onClose]);

  const importFiles = useCallback(async (files) => {
    const file = Array.from(files || []).find((candidate) => candidate instanceof File);
    if (!file) {
      setError("Drop or choose a Markdown file.");
      return;
    }

    setError("");
    setIsImporting(true);
    try {
      await onImport(file);
    } catch (error) {
      setError(error.message || "Markdown import failed.");
    } finally {
      setIsImporting(false);
    }
  }, [onImport]);

  return (
    <div
      className="preferences-backdrop markdown-import-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isImporting) {
          onClose();
        }
      }}
    >
      <section
        className="markdown-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Import Markdown"
      >
        <header className="markdown-import-header">
          <div>
            <div className="markdown-import-title">Import Markdown</div>
            <p>Insert a Markdown file at the current block.</p>
          </div>
          <button
            type="button"
            className="preferences-close-button"
            aria-label="Close Markdown import"
            disabled={isImporting}
            onMouseDown={preventFocusLoss}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <input
          ref={inputRef}
          className="markdown-import-input"
          type="file"
          accept=".md,.markdown,text/markdown,text/plain"
          aria-label="Choose Markdown file"
          onChange={(event) => void importFiles(event.target.files)}
        />
        <button
          type="button"
          className={`markdown-import-dropzone${isDragging ? " is-dragging" : ""}`}
          disabled={isImporting}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) {
              setIsDragging(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            void importFiles(event.dataTransfer.files);
          }}
        >
          <Upload aria-hidden="true" size={22} strokeWidth={1.8} />
          <strong>{isImporting ? "Importing…" : "Drop a .md file here"}</strong>
          <span>or click to choose a file</span>
        </button>
        {error && <p className="markdown-import-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}

function NotePaneWordmark() {
  return (
    <div className="brand-wordmark" aria-label="NotePane wordmark">
      <img
        className="brand-wordmark-image brand-wordmark-image-light"
        src={notePaneWordmarkUrl}
        alt=""
        aria-hidden="true"
      />
      <img
        className="brand-wordmark-image brand-wordmark-image-dark"
        src={notePaneWordmarkDarkUrl}
        alt=""
        aria-hidden="true"
      />
    </div>
  );
}

function NotePaneSlashMenuController({ editor, onImportMarkdown }) {
  const floatingUIOptions = useMemo(createSlashMenuFloatingUIOptions, []);
  const getItems = useCallback(async (query) => {
    const importMarkdown = {
      title: "Import Markdown",
      subtext: "Choose a Markdown file and insert it here",
      aliases: ["import", "markdown", "md"],
      group: "Import",
      icon: <Upload size={18} />,
      key: "import_markdown",
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, { type: "paragraph" });
        onImportMarkdown?.();
      },
    };
    const toggleHeading4 = {
      title: "Toggle Heading 4",
      subtext: "Toggleable minor subsection heading",
      aliases: ["h4", "heading4", "subheading4", "collapsible"],
      group: "Subheadings",
      icon: <Heading4 size={18} />,
      key: "toggle_heading_4",
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, {
          type: "heading",
          props: { level: 4, isToggleable: true },
        });
      },
    };
    const items = getDefaultReactSlashMenuItems(editor);
    items.unshift(importMarkdown);
    const toggleHeading3Index = items.findIndex(
      (item) => item.key === "toggle_heading_3",
    );
    items.splice(toggleHeading3Index + 1, 0, toggleHeading4);
    return filterSuggestionItems(items, query);
  }, [editor, onImportMarkdown]);

  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={getItems}
      shouldOpen={(state) =>
        !state.selection.$from.parent.type.isInGroup("tableContent")
      }
      floatingUIOptions={floatingUIOptions}
    />
  );
}

function SidebarToggleIcon({ expanded = true }) {
  const Icon = expanded ? PanelLeftClose : PanelLeftOpen;
  return (
    <Icon
      className="notepane-action-icon notepane-icon-sidebar"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="sidebar"
      data-sidebar-icon-state={expanded ? "expanded" : "compact"}
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

function PaletteIcon() {
  return (
    <Palette
      className="notepane-action-icon notepane-icon-palette"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="palette"
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

function SettingsIcon() {
  return (
    <Cog
      className="notepane-action-icon notepane-icon-settings"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="settings"
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

function ExportPdfIcon() {
  return (
    <FileDown
      className="notepane-action-icon notepane-icon-export"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="export"
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

function CopyValueIcon() {
  return (
    <Copy
      className="notepane-action-icon notepane-icon-copy"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="copy"
      size={15}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

function PreviewNoteIcon() {
  return (
    <Eye
      className="notepane-action-icon notepane-icon-preview"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="sidebar"
      size={15}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

function RestoreNoteIcon() {
  return (
    <RotateCcw
      className="notepane-action-icon notepane-icon-restore"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="restore"
      size={15}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

function PermanentDeleteIcon() {
  return (
    <Trash2
      className="notepane-action-icon notepane-icon-delete"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="delete"
      size={15}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

function TrashSidebarIcon() {
  return (
    <Trash2
      className="notepane-action-icon notepane-icon-trash"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="trash"
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

function PinIcon({ pinned = false }) {
  return (
    <Pin
      className="notepane-action-icon notepane-icon-pin"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="pin"
      data-pin-state={pinned ? "pinned" : "unpinned"}
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

function EllipsisIcon() {
  return (
    <Ellipsis
      className="notepane-action-icon notepane-icon-ellipsis"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

function ModeTransitionIcon({ fromMode, toMode, compact = false }) {
  const FromGlyph = fromMode === "sticky" ? InlineStickyGlyph : InlineTabsGlyph;
  const ToGlyph = toMode === "sticky" ? InlineStickyGlyph : InlineTabsGlyph;

  if (compact) {
    return (
      <svg
        className="notepane-action-icon notepane-mode-transition-icon lucide lucide-mode-transition"
        data-icon-family="system-symbol"
        data-icon-pack="lucide"
        data-icon-tone={toMode}
        data-icon-layout="compact"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <ToGlyph x={2} />
      </svg>
    );
  }

  return (
    <svg
      className="notepane-action-icon notepane-mode-transition-icon lucide lucide-mode-transition"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone={toMode}
      data-icon-layout="transition"
      width="58"
      height="24"
      viewBox="0 0 58 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <FromGlyph x={1} />
      <path className="mode-transition-arrow" d="M26 12h10" />
      <path className="mode-transition-arrow-head" d="m33 9 3 3-3 3" />
      <ToGlyph x={40} />
    </svg>
  );
}

function InlineTabsGlyph({ x }) {
  return (
    <g className="mode-tabs-glyph" transform={`translate(${x} 0)`}>
      <rect x="1" y="5" width="18" height="15" rx="2" />
      <path d="M7 5v15" />
      <path d="M1 9.5h6" />
      <path d="M1 14h6" />
    </g>
  );
}

function InlineStickyGlyph({ x }) {
  return (
    <g className="mode-sticky-glyph" transform={`translate(${x} 0)`}>
      <path d="M2 4.5h15v10.2L12.3 20H2V4.5Z" />
      <path d="M17 14.7h-4.7V20" />
    </g>
  );
}

function DockIcon() {
  return (
    <PanelTopClose
      className="notepane-action-icon notepane-icon-dock"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="dock"
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

function ColorWheel({ hsv, ariaLabel, onChange }) {
  const wheelRef = useRef(null);
  const canvasRef = useRef(null);
  const isDraggingRef = useRef(false);
  const thumb = useMemo(() => {
    const angle = (hsv.h * Math.PI) / 180;
    const radius = hsv.s * 50;
    return {
      x: 50 + Math.sin(angle) * radius,
      y: 50 - Math.cos(angle) * radius,
    };
  }, [hsv.h, hsv.s]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const size = 320;
    const center = size / 2;
    const radius = center - 1;
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d", { willReadFrequently: false });
    const image = context.createImageData(size, size);

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const deltaX = x - center;
        const deltaY = y - center;
        const distance = Math.hypot(deltaX, deltaY);
        const index = (y * size + x) * 4;

        if (distance > radius) {
          image.data[index + 3] = 0;
          continue;
        }

        const saturation = clamp(distance / radius, 0, 1, 0);
        const hue = ((Math.atan2(deltaX, -deltaY) * 180) / Math.PI + 360) % 360;
        const [red, green, blue] = hsvToRgb(hue, saturation, 1);
        image.data[index] = red;
        image.data[index + 1] = green;
        image.data[index + 2] = blue;
        image.data[index + 3] = 255;
      }
    }

    context.putImageData(image, 0, 0);
  }, []);

  const updateFromPointer = useCallback(
    (event) => {
      const rect = wheelRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = event.clientX - centerX;
      const deltaY = event.clientY - centerY;
      const radius = rect.width / 2;
      const saturation = clamp(Math.hypot(deltaX, deltaY) / radius, 0, 1, 0);
      const hue = (Math.atan2(deltaX, -deltaY) * 180) / Math.PI;

      onChange({
        h: (hue + 360) % 360,
        s: saturation,
      });
    },
    [onChange],
  );

  const startDrag = useCallback(
    (event) => {
      event.preventDefault();
      isDraggingRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      updateFromPointer(event);
    },
    [updateFromPointer],
  );

  const moveDrag = useCallback(
    (event) => {
      if (!isDraggingRef.current) {
        return;
      }
      updateFromPointer(event);
    },
    [updateFromPointer],
  );

  const stopDrag = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const nudgeHue = useCallback(
    (delta) => {
      onChange({ h: (hsv.h + delta + 360) % 360 });
    },
    [hsv.h, onChange],
  );

  return (
    <div
      ref={wheelRef}
      className="color-wheel"
      role="slider"
      aria-label={ariaLabel}
      aria-valuetext={hsvToHex(hsv.h, hsv.s, hsv.v)}
      tabIndex={0}
      style={{
        "--wheel-color": hsvToHex(hsv.h, hsv.s, hsv.v),
        "--wheel-thumb-x": `${thumb.x}%`,
        "--wheel-thumb-y": `${thumb.y}%`,
      }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          event.preventDefault();
          nudgeHue(8);
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          event.preventDefault();
          nudgeHue(-8);
        }
      }}
    >
      <canvas ref={canvasRef} className="color-wheel-canvas" aria-hidden="true" />
      <span className="color-wheel-crosshair" />
      <span className="color-wheel-thumb" />
    </div>
  );
}

function CropDialog({ sourceUrl, initialCrop, onApply, onClose }) {
  const imageRef = useRef(null);
  const cropInteractionRef = useRef(null);
  const [crop, setCrop] = useState(() => normalizeCrop(initialCrop));
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const startResize = useCallback((event, handle) => {
    const point = getImagePoint(event, imageRef.current);
    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    cropInteractionRef.current = { crop, handle, mode: "resize", point };
  }, [crop]);

  const startMove = useCallback((event) => {
    const point = getImagePoint(event, imageRef.current);
    if (!point) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    cropInteractionRef.current = { crop, mode: "move", point };
  }, [crop]);

  const updateCropInteraction = useCallback((event) => {
    const interaction = cropInteractionRef.current;
    if (!interaction) {
      return;
    }

    const point = getImagePoint(event, imageRef.current);
    if (!point) {
      return;
    }

    setCrop(
      interaction.mode === "move"
        ? moveCrop(interaction, point)
        : resizeCrop(interaction, point),
    );
  }, []);

  const stopCropInteraction = useCallback(() => {
    cropInteractionRef.current = null;
  }, []);

  const applySelectedCrop = useCallback(async () => {
    setError("");
    try {
      const croppedDataUrl = await cropImageToPng(imageRef.current, crop);
      onApply(croppedDataUrl, crop);
    } catch (error) {
      setError(
        error.message ||
          "Crop failed. If this is an external image, download and re-upload it first.",
      );
    }
  }, [crop, onApply]);

  return (
    <div className="crop-dialog" role="dialog" aria-label="Crop image">
      <div className="crop-panel">
        <div
          className="crop-image-frame"
        >
          <div
            className="crop-image-canvas"
          >
            <img
              ref={imageRef}
              src={sourceUrl}
              crossOrigin="anonymous"
              alt=""
              draggable={false}
            />
            <div
              className="crop-selection"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.width * 100}%`,
                height: `${crop.height * 100}%`,
              }}
              onPointerDown={startMove}
              onPointerMove={updateCropInteraction}
              onPointerUp={stopCropInteraction}
              onPointerCancel={stopCropInteraction}
            >
              {CROP_RESIZE_HANDLES.map((handle) => (
                <button
                  key={handle.id}
                  type="button"
                  className="crop-resize-handle"
                  data-handle={handle.id}
                  aria-label={`Resize crop from ${handle.label}`}
                  onPointerDown={(event) => startResize(event, handle.id)}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="crop-actions">
          <span>Drag the grid to move it, or an edge or corner to resize.</span>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={() => void applySelectedCrop()}>
            Apply crop
          </button>
        </div>
        {error && <div className="crop-error">{error}</div>}
      </div>
    </div>
  );
}

function parseBlocksJSON(blocksJSON) {
  if (typeof blocksJSON !== "string" || blocksJSON.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(blocksJSON);
    return Array.isArray(parsed) && parsed.length > 0
      ? normalizeSupportedHeadingLevels(parsed)
      : null;
  } catch {
    return null;
  }
}

function normalizeSupportedHeadingLevels(blocks) {
  return blocks.map((block) => {
    const children = Array.isArray(block?.children)
      ? normalizeSupportedHeadingLevels(block.children)
      : block?.children;

    if (block?.type !== "heading") {
      return children === block?.children ? block : { ...block, children };
    }

    const level = clamp(
      Math.round(Number(block.props?.level ?? block.props?.headingLevel ?? 1)),
      1,
      4,
      1,
    );
    return {
      ...block,
      props: { ...block.props, level },
      children,
    };
  });
}

function createTemplateSessionNote(sourceNote = {}, timestamp = Date.now()) {
  return {
    id: crypto.randomUUID(),
    title: "NotePane",
    titleManuallyEdited: false,
    blocksJSON: null,
    markdown: "",
    bounds: sourceNote.bounds,
    theme: DEFAULT_THEME,
    alwaysOnTop: false,
    detached: false,
    seedDemoContent: true,
    editorFontScale: sourceNote.editorFontScale ?? DEFAULT_EDITOR_FONT_SCALE,
    editorFontFamily: sourceNote.editorFontFamily ?? DEFAULT_EDITOR_FONT_FAMILY,
    trashedAt: null,
    sortOrder: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function mergeNotes(notes, updatedNote) {
  const noteMap = new Map();
  for (const note of Array.isArray(notes) ? notes : []) {
    if (note?.id) {
      noteMap.set(note.id, note);
    }
  }

  if (updatedNote?.id) {
    noteMap.set(updatedNote.id, {
      ...noteMap.get(updatedNote.id),
      ...updatedNote,
    });
  }

  return [...noteMap.values()].sort(sortNotesByOrder);
}

function reorderNotesByIds(notes, orderedNoteIds) {
  const currentNotes = Array.isArray(notes) ? notes : [];
  const noteMap = new Map(currentNotes.map((note) => [note.id, note]));
  const orderedIds = normalizeOrderedNoteIds(orderedNoteIds);
  const nextNotes = [];
  const seenIds = new Set();

  for (const noteId of orderedIds) {
    const note = noteMap.get(noteId);
    if (!note || seenIds.has(note.id)) {
      continue;
    }
    nextNotes.push(note);
    seenIds.add(note.id);
  }

  for (const note of currentNotes) {
    if (!seenIds.has(note.id)) {
      nextNotes.push(note);
    }
  }

  return nextNotes.map((note, index) => ({
    ...note,
    sortOrder: index + 1,
  }));
}

function sortNotesByOrder(a, b) {
  return (
    (normalizeSortOrder(a?.sortOrder) ?? Number.POSITIVE_INFINITY) -
      (normalizeSortOrder(b?.sortOrder) ?? Number.POSITIVE_INFINITY) ||
    (a?.createdAt ?? 0) - (b?.createdAt ?? 0)
  );
}

function normalizeOrderedNoteIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((noteId) => typeof noteId === "string" && noteId);
}

function normalizeSortOrder(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? numericValue
    : null;
}

function mergeTrashedNotes(notes, updatedNote) {
  const noteMap = new Map();
  for (const note of Array.isArray(notes) ? notes : []) {
    if (note?.id) {
      noteMap.set(note.id, note);
    }
  }

  if (updatedNote?.id) {
    noteMap.set(updatedNote.id, {
      ...noteMap.get(updatedNote.id),
      ...updatedNote,
    });
  }

  return [...noteMap.values()].sort(
    (a, b) =>
      (b.trashedAt ?? 0) - (a.trashedAt ?? 0) ||
      (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
  );
}

function normalizeTitle(value, fallback = DEFAULT_TITLE) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 80)
    : fallback;
}

function isTitleManuallyEdited(note) {
  return note?.titleManuallyEdited === true;
}

function getNoteDisplayTitle(note, blocks = null) {
  if (isTitleManuallyEdited(note)) {
    return normalizeTitle(note?.title);
  }

  const titleFromBlocks = deriveAutomaticTitleFromBlocks(
    blocks ?? parseBlocksJSON(note?.blocksJSON),
  );
  if (titleFromBlocks !== DEFAULT_TITLE) {
    return titleFromBlocks;
  }

  return deriveAutomaticTitleFromMarkdown(note?.markdown);
}

function deriveAutomaticTitleFromBlocks(blocks) {
  const titleText = extractFirstBlockTitleText(blocks);
  return normalizeAutomaticTitleText(titleText);
}

function deriveAutomaticTitleFromMarkdown(markdown) {
  if (typeof markdown !== "string") {
    return DEFAULT_TITLE;
  }

  const line = markdown
    .split(/\r?\n/)
    .find((candidate) => stripMarkdownTitleSyntax(candidate).trim());

  return normalizeAutomaticTitleText(line ? stripMarkdownTitleSyntax(line) : "");
}

function normalizeAutomaticTitleText(value) {
  if (typeof value !== "string") {
    return DEFAULT_TITLE;
  }

  const normalizedText = value.replace(/\s+/g, " ").trim();
  return normalizedText
    ? normalizedText.slice(0, AUTO_TITLE_MAX_LENGTH)
    : DEFAULT_TITLE;
}

function extractFirstBlockTitleText(blocks) {
  if (!Array.isArray(blocks)) {
    return "";
  }

  for (const block of blocks) {
    const contentText = extractBlockPlainText(block?.content);
    if (contentText.trim()) {
      return contentText;
    }

    const childText = extractFirstBlockTitleText(block?.children);
    if (childText.trim()) {
      return childText;
    }
  }

  return "";
}

function stripMarkdownTitleSyntax(value) {
  return String(value)
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`~]/g, "");
}

function formatTrashTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "Deleted recently";
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "Deleted recently";
  }

  return `Deleted ${date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function getTrashPreviewLines(note) {
  const blocks = parseBlocksJSON(note?.blocksJSON);
  if (Array.isArray(blocks)) {
    const blockLines = [];
    collectBlocks(blocks, (block) => {
      const line = getBlockPreviewLine(block);
      if (line) {
        blockLines.push(line);
      }
    });
    const normalizedBlockLines = normalizeTrashPreviewLines(blockLines);
    if (normalizedBlockLines.length > 0) {
      return normalizedBlockLines;
    }
  }

  if (typeof note?.markdown === "string" && note.markdown.trim()) {
    return normalizeTrashPreviewLines(note.markdown.split(/\r?\n/));
  }

  return [];
}

function getBlockPreviewLine(block) {
  const plainText = normalizePreviewText(extractBlockPlainText(block?.content));
  if (plainText) {
    return plainText;
  }

  if (block?.type === "image") {
    return "Image";
  }

  if (block?.type === "file") {
    return "Attachment";
  }

  return "";
}

function normalizeTrashPreviewLines(lines) {
  const normalizedLines = [];
  for (const line of lines) {
    const normalizedLine = normalizePreviewText(line);
    if (!normalizedLine) {
      continue;
    }

    normalizedLines.push(
      normalizedLine.length > 260
        ? `${normalizedLine.slice(0, 257)}...`
        : normalizedLine,
    );
    if (normalizedLines.length >= 36) {
      break;
    }
  }

  return normalizedLines;
}

function normalizePreviewText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getSessionShortcutLabel(index) {
  return getShortcutLabel(`Mod+${index + 1}`);
}

function getSessionShortcutRangeLabel() {
  return `${getShortcutLabel("Mod+1")}-${getShortcutLabel("Mod+9")}`;
}

function getShortcutLabel(shortcut) {
  const parsedShortcut = parseKeyboardShortcut(shortcut);
  if (!parsedShortcut) {
    return getLegacyShortcutLabel(shortcut);
  }

  const keyLabel = getShortcutKeyLabel(parsedShortcut.key);
  if (isAppleRuntime()) {
    return [
      parsedShortcut.mod ? "⌘" : "",
      parsedShortcut.alt ? "⌥" : "",
      parsedShortcut.shift ? "⇧" : "",
      keyLabel,
    ].filter(Boolean).join("");
  }

  return [
    parsedShortcut.mod ? "Ctrl" : "",
    parsedShortcut.alt ? "Alt" : "",
    parsedShortcut.shift ? "Shift" : "",
    keyLabel,
  ].filter(Boolean).join("+");
}

function formatShortcutTooltip(label, shortcut) {
  const shortcutLabel = getShortcutLabel(shortcut);
  return shortcutLabel ? `${label} · ${shortcutLabel}` : label;
}

function getLegacyShortcutLabel(keys) {
  const normalizedKeys = String(keys ?? "");
  if (!normalizedKeys) {
    return "";
  }

  if (isAppleRuntime()) {
    return `⌘${normalizedKeys}`;
  }

  return `Ctrl+${normalizedKeys
    .replaceAll("⌥", "Alt+")
    .replaceAll("⇧", "Shift+")
    .replaceAll("Comma", ",")
    .replaceAll("comma", ",")}`;
}

function getShortcutKeyLabel(key) {
  const labels = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Enter: "↩",
    Escape: "Esc",
    Space: "Space",
    Comma: ",",
    "=": "+",
  };

  return labels[key] ?? key;
}

function matchesKeyboardShortcut(event, shortcut) {
  const parsedShortcut = parseKeyboardShortcut(shortcut);
  if (!parsedShortcut) {
    return false;
  }

  const eventKey = normalizeKeyboardShortcutEventKey(event);
  if (!eventKey) {
    return false;
  }

  const shiftMatches =
    Boolean(event.shiftKey) === parsedShortcut.shift ||
    (parsedShortcut.key === "=" && !parsedShortcut.shift && event.shiftKey);

  return (
    Boolean(event.metaKey || event.ctrlKey) === parsedShortcut.mod &&
    Boolean(event.altKey) === parsedShortcut.alt &&
    shiftMatches &&
    eventKey === parsedShortcut.key
  );
}

function isKeyboardShortcutEnabled(keyboardShortcutEnabled, commandId) {
  return (
    normalizeKeyboardShortcutEnabled(keyboardShortcutEnabled)[commandId] !== false
  );
}

function keyboardShortcutFromEvent(event) {
  const key = normalizeKeyboardShortcutEventKey(event);
  if (!key || key === "Escape") {
    return null;
  }

  const shortcut = {
    mod: Boolean(event.metaKey || event.ctrlKey),
    alt: Boolean(event.altKey),
    shift: Boolean(event.shiftKey),
    key,
  };

  return shortcut.mod ? formatKeyboardShortcutValue(shortcut) : null;
}

function normalizeKeyboardShortcuts(
  value,
  fallback = DEFAULT_KEYBOARD_SHORTCUTS,
) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackSource = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_KEYBOARD_SHORTCUTS;
  const normalizedShortcuts = {};

  for (const commandId of KEYBOARD_SHORTCUT_COMMAND_IDS) {
    normalizedShortcuts[commandId] = normalizeKeyboardShortcut(
      source[commandId],
      fallbackSource[commandId] ?? DEFAULT_KEYBOARD_SHORTCUTS[commandId],
    );
  }

  return normalizedShortcuts;
}

function normalizeKeyboardShortcutEnabled(
  value,
  fallback = DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackSource = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_KEYBOARD_SHORTCUT_ENABLED;
  const normalizedEnabled = {};

  for (const commandId of KEYBOARD_SHORTCUT_TOGGLE_COMMAND_IDS) {
    normalizedEnabled[commandId] =
      typeof source[commandId] === "boolean"
        ? source[commandId]
        : fallbackSource[commandId] !== false;
  }

  return normalizedEnabled;
}

function normalizeKeyboardShortcut(value, fallback) {
  const parsedShortcut = parseKeyboardShortcut(value);
  if (parsedShortcut) {
    return formatKeyboardShortcutValue(parsedShortcut);
  }

  const parsedFallback = parseKeyboardShortcut(fallback);
  return parsedFallback
    ? formatKeyboardShortcutValue(parsedFallback)
    : DEFAULT_KEYBOARD_SHORTCUTS.focusEditor;
}

function parseKeyboardShortcut(value) {
  if (typeof value !== "string") {
    return null;
  }

  const tokens = value
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length < 2) {
    return null;
  }

  const shortcut = {
    mod: false,
    alt: false,
    shift: false,
    key: "",
  };

  for (const token of tokens) {
    const normalizedToken = token.toLowerCase();
    if (
      normalizedToken === "mod" ||
      normalizedToken === "cmd" ||
      normalizedToken === "command" ||
      normalizedToken === "ctrl" ||
      normalizedToken === "control" ||
      normalizedToken === "commandorcontrol" ||
      normalizedToken === "cmdorctrl"
    ) {
      shortcut.mod = true;
      continue;
    }

    if (normalizedToken === "alt" || normalizedToken === "option") {
      shortcut.alt = true;
      continue;
    }

    if (normalizedToken === "shift") {
      shortcut.shift = true;
      continue;
    }

    if (shortcut.key) {
      return null;
    }

    shortcut.key = normalizeKeyboardShortcutKey(token);
    if (!shortcut.key) {
      return null;
    }
  }

  return shortcut.mod && shortcut.key ? shortcut : null;
}

function normalizeKeyboardShortcutEventKey(event) {
  if (
    event.key === "Meta" ||
    event.key === "Control" ||
    event.key === "Alt" ||
    event.key === "Shift"
  ) {
    return "";
  }

  if (
    event.code === "Equal" &&
    (event.key === "+" || event.key === "=")
  ) {
    return "=";
  }

  if (
    event.code === "Minus" &&
    (event.key === "-" || event.key === "_")
  ) {
    return "-";
  }

  if (event.code === "BracketLeft") {
    return "[";
  }

  if (event.code === "BracketRight") {
    return "]";
  }

  return normalizeKeyboardShortcutKey(event.key);
}

function normalizeKeyboardShortcutKey(value) {
  const token = String(value ?? "").trim();
  const normalizedToken = token.toLowerCase();
  const namedKeys = {
    arrowleft: "ArrowLeft",
    left: "ArrowLeft",
    arrowright: "ArrowRight",
    right: "ArrowRight",
    arrowup: "ArrowUp",
    up: "ArrowUp",
    arrowdown: "ArrowDown",
    down: "ArrowDown",
    enter: "Enter",
    return: "Enter",
    escape: "Escape",
    esc: "Escape",
    comma: ",",
    period: ".",
    dot: ".",
    slash: "/",
    backslash: "\\",
    backquote: "`",
    braceleft: "[",
    "{": "[",
    bracketleft: "[",
    leftbracket: "[",
    braceright: "]",
    "}": "]",
    bracketright: "]",
    rightbracket: "]",
    equal: "=",
    plus: "=",
    minus: "-",
    space: "Space",
  };

  if (namedKeys[normalizedToken]) {
    return namedKeys[normalizedToken];
  }

  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(token)) {
    return token.toUpperCase();
  }

  if (/^[a-z]$/i.test(token)) {
    return token.toUpperCase();
  }

  if (/^[0-9]$/.test(token)) {
    return token;
  }

  if (token.length === 1 && ",./;'[]\\=`-".includes(token)) {
    return token;
  }

  return "";
}

function formatKeyboardShortcutValue(shortcut) {
  return [
    shortcut.mod ? "Mod" : "",
    shortcut.alt ? "Alt" : "",
    shortcut.shift ? "Shift" : "",
    shortcut.key,
  ].filter(Boolean).join("+");
}

function isReservedKeyboardShortcut(shortcut) {
  const parsedShortcut = parseKeyboardShortcut(shortcut);
  return Boolean(
    parsedShortcut?.mod &&
      !parsedShortcut.alt &&
      !parsedShortcut.shift &&
      /^[1-9]$/.test(parsedShortcut.key),
  );
}

function isShortcutRecorderTarget(target) {
  return target instanceof Element && Boolean(
    target.closest(".shortcut-recorder-button"),
  );
}

function isWindowsRuntime() {
  return electronApi?.platform === "win32";
}

function isAppleRuntime() {
  if (electronApi?.platform) {
    return electronApi.platform === "darwin";
  }

  if (typeof navigator === "undefined") {
    return false;
  }

  return /mac|iphone|ipad|ipod/i.test(
    `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`,
  );
}

const FLOATING_EDITOR_MENU_MARGIN = 8;
const FLOATING_EDITOR_MENU_GAP = 5;
const BLOCKNOTE_FLOATING_MENU_SELECTOR = [
  ".bn-menu-dropdown",
  ".mantine-Popover-dropdown",
  "[data-menu-dropdown='true']",
].join(", ");
const BLOCKNOTE_NESTED_COLOR_ITEM_SELECTOR = [
  ".bn-color-picker-dropdown [data-test^='text-color-']",
  ".bn-color-picker-dropdown [data-test^='background-color-']",
].join(", ");
const BLOCKNOTE_VISIBLE_OVERFLOW_MENU_SELECTOR = [
  ".bn-drag-handle-menu",
  ".bn-table-handle-menu",
].join(", ");

function useBlockNoteFloatingMenuGuard() {
  useEffect(() => {
    let animationFrame = 0;

    const schedulePositionUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = window.requestAnimationFrame(repositionBlockNoteFloatingMenus);
      });
    };
    const scheduleDelayedPositionUpdate = (event) => {
      if (isBlockNoteFloatingMenuInteraction(event)) {
        return;
      }

      schedulePositionUpdate();
      window.setTimeout(schedulePositionUpdate, 0);
      window.setTimeout(schedulePositionUpdate, 80);
      window.setTimeout(schedulePositionUpdate, 180);
    };

    const observer = new MutationObserver(schedulePositionUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", schedulePositionUpdate);
    window.addEventListener("scroll", scheduleDelayedPositionUpdate, true);
    document.addEventListener("mousedown", scheduleDelayedPositionUpdate, true);
    document.addEventListener(
      "pointerup",
      dispatchBlockNoteColorItemClick,
      true,
    );
    document.addEventListener("pointerup", scheduleDelayedPositionUpdate, true);
    document.addEventListener("click", scheduleDelayedPositionUpdate);
    document.addEventListener("keydown", scheduleDelayedPositionUpdate, true);
    document.addEventListener("selectionchange", scheduleDelayedPositionUpdate);
    scheduleDelayedPositionUpdate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", schedulePositionUpdate);
      window.removeEventListener("scroll", scheduleDelayedPositionUpdate, true);
      document.removeEventListener("mousedown", scheduleDelayedPositionUpdate, true);
      document.removeEventListener(
        "pointerup",
        dispatchBlockNoteColorItemClick,
        true,
      );
      document.removeEventListener("pointerup", scheduleDelayedPositionUpdate, true);
      document.removeEventListener("click", scheduleDelayedPositionUpdate);
      document.removeEventListener("keydown", scheduleDelayedPositionUpdate, true);
      document.removeEventListener("selectionchange", scheduleDelayedPositionUpdate);
    };
  }, []);
}

function dispatchBlockNoteColorItemClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const colorItem = target.closest(BLOCKNOTE_NESTED_COLOR_ITEM_SELECTOR);
  if (!(colorItem instanceof HTMLElement)) {
    return;
  }

  const colorMenu = colorItem.closest(".bn-color-picker-dropdown");
  if (!colorMenu) {
    return;
  }
  if (colorMenu.classList.contains("notion-color-picker-dropdown")) {
    return;
  }

  colorItem.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    }),
  );
}

function isBlockNoteFloatingMenuInteraction(event) {
  const target = event?.target;
  return target instanceof Element && Boolean(target.closest(BLOCKNOTE_FLOATING_MENU_SELECTOR));
}

function repositionBlockNoteFloatingMenus() {
  for (const element of document.querySelectorAll(BLOCKNOTE_FLOATING_MENU_SELECTOR)) {
    if (
      !(element instanceof HTMLElement) ||
      element.closest(".editor-floating-menu")
    ) {
      continue;
    }

    if (isNestedBlockNoteFloatingMenu(element)) {
      keepNestedElementInsideViewport(element);
      continue;
    }

    keepElementInsideViewport(element);
  }
}

function isNestedBlockNoteFloatingMenu(element) {
  return Boolean(element.parentElement?.closest(BLOCKNOTE_FLOATING_MENU_SELECTOR));
}

function keepElementInsideViewport(element) {
  const computedStyle = window.getComputedStyle(element);
  if (
    computedStyle.display === "none" ||
    computedStyle.visibility === "hidden" ||
    Number(computedStyle.opacity) <= 0.01 ||
    element.getAttribute("aria-hidden") === "true"
  ) {
    return;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || element.scrollHeight <= 0) {
    return;
  }

  const margin = FLOATING_EDITOR_MENU_MARGIN;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxWidth = Math.max(1, viewportWidth - margin * 2);
  const maxHeight = Math.max(80, viewportHeight - margin * 2);
  const hasNestedFloatingMenu = Boolean(
    element.querySelector(
      ".bn-menu-dropdown, .mantine-Menu-dropdown, .mantine-Popover-dropdown",
    ),
  );
  const measuredWidth = hasNestedFloatingMenu
    ? rect.width
    : Math.max(rect.width, element.scrollWidth || rect.width);
  const measuredHeight = hasNestedFloatingMenu
    ? rect.height
    : Math.max(rect.height, element.scrollHeight || rect.height);
  const desiredWidth = Math.min(
    measuredWidth,
    maxWidth,
  );
  const desiredHeight = Math.min(
    measuredHeight,
    maxHeight,
  );
  const left = clamp(
    rect.left,
    margin,
    Math.max(margin, viewportWidth - desiredWidth - margin),
  );
  const top = clamp(
    rect.top,
    margin,
    Math.max(margin, viewportHeight - desiredHeight - margin),
  );
  const containingRect = getFixedPositionContainingRect(element);
  const allowsVisibleOverflow =
    hasNestedFloatingMenu || element.matches(BLOCKNOTE_VISIBLE_OVERFLOW_MENU_SELECTOR);

  setImportantStyle(element, "position", "fixed");
  setImportantStyle(element, "transform", "none");
  setImportantStyle(element, "left", `${left - containingRect.left}px`);
  setImportantStyle(element, "top", `${top - containingRect.top}px`);
  setImportantStyle(element, "max-width", `${maxWidth}px`);
  setImportantStyle(element, "max-height", `${maxHeight}px`);
  setImportantStyle(element, "overflow", allowsVisibleOverflow ? "visible" : "auto");
}

function keepNestedElementInsideViewport(element) {
  const computedStyle = window.getComputedStyle(element);
  if (
    computedStyle.display === "none" ||
    computedStyle.visibility === "hidden" ||
    Number(computedStyle.opacity) <= 0.01 ||
    element.getAttribute("aria-hidden") === "true"
  ) {
    return;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || element.scrollHeight <= 0) {
    return;
  }

  const margin = FLOATING_EDITOR_MENU_MARGIN;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxWidth = Math.max(1, viewportWidth - margin * 2);
  const maxHeight = Math.max(80, viewportHeight - margin * 2);
  const currentLeft = Number.parseFloat(computedStyle.left);
  const currentTop = Number.parseFloat(computedStyle.top);
  const baseLeft = Number.isFinite(currentLeft) ? currentLeft : 0;
  const baseTop = Number.isFinite(currentTop) ? currentTop : 0;
  let nextLeft = baseLeft;
  let nextTop = baseTop;

  if (rect.right > viewportWidth - margin) {
    nextLeft -= rect.right - (viewportWidth - margin);
  }
  if (rect.left + (nextLeft - baseLeft) < margin) {
    nextLeft += margin - (rect.left + (nextLeft - baseLeft));
  }
  if (rect.bottom > viewportHeight - margin) {
    nextTop -= rect.bottom - (viewportHeight - margin);
  }
  if (rect.top + (nextTop - baseTop) < margin) {
    nextTop += margin - (rect.top + (nextTop - baseTop));
  }

  setImportantStyle(element, "transform", "none");
  setImportantStyle(element, "left", `${nextLeft}px`);
  setImportantStyle(element, "top", `${nextTop}px`);
  setImportantStyle(element, "max-width", `${maxWidth}px`);
  setImportantStyle(element, "max-height", `${maxHeight}px`);
  setImportantStyle(element, "overflow", "auto");
}

function setImportantStyle(element, property, value) {
  if (
    element.style.getPropertyValue(property) === value &&
    element.style.getPropertyPriority(property) === "important"
  ) {
    return;
  }

  element.style.setProperty(property, value, "important");
}

function getFixedPositionContainingRect(element) {
  let parent = element.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    if (
      style.transform !== "none" ||
      style.perspective !== "none" ||
      style.filter !== "none" ||
      style.backdropFilter !== "none" ||
      style.willChange.includes("transform")
    ) {
      const rect = parent.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
      };
    }
    parent = parent.parentElement;
  }

  return {
    left: 0,
    top: 0,
  };
}

function FloatingDropdownMenu({
  anchorRef,
  ariaLabel,
  children,
  className = "",
  id,
  isOpen,
  maxHeight = 220,
  maxWidth = 260,
  minWidth = 120,
  onRequestClose,
  preferredWidth = 180,
  align = "start",
}) {
  const [style, setStyle] = useState(null);
  const menuRef = useRef(null);

  const updatePosition = useCallback(() => {
    const anchorElement = anchorRef.current;
    if (!isOpen || !anchorElement) {
      setStyle(null);
      return;
    }

    setStyle(
      getFloatingDropdownMenuStyle(anchorElement, {
        align,
        maxHeight,
        maxWidth,
        minWidth,
        preferredWidth,
      }),
    );
  }, [
    align,
    anchorRef,
    isOpen,
    maxHeight,
    maxWidth,
    minWidth,
    preferredWidth,
  ]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setStyle(null);
      return undefined;
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen || !onRequestClose) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (
        menuRef.current?.contains(target) ||
        anchorRef.current?.contains(target)
      ) {
        return;
      }

      onRequestClose();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onRequestClose();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [anchorRef, isOpen, onRequestClose]);

  if (!isOpen || !style || typeof document === "undefined") {
    return null;
  }
  const { placement, ...positionStyle } = style;

  return createPortal(
    <div
      ref={menuRef}
      id={id}
      className={`notepane-dropdown-menu ${className} editor-floating-menu`.trim()}
      role="listbox"
      aria-label={ariaLabel}
      data-placement={placement}
      style={positionStyle}
      onMouseDown={preventFocusLoss}
    >
      {children}
    </div>,
    document.body,
  );
}

function DropdownMenuOption({
  children,
  className = "",
  meta = null,
  selected = false,
  style,
  onClick,
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected ? "true" : "false"}
      className={`notepane-dropdown-option ${className}`.trim()}
      style={style}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={onClick}
    >
      <span className="notepane-dropdown-option-check" aria-hidden="true">
        {selected && <Check className="notepane-action-icon" />}
      </span>
      <span className="notepane-dropdown-option-label">{children}</span>
      {meta && <span className="notepane-dropdown-option-meta">{meta}</span>}
    </button>
  );
}

function AdaptiveTooltipPortal() {
  const [tooltip, setTooltip] = useState(null);
  const targetRef = useRef(null);
  const isPointerDownRef = useRef(false);

  const showTooltip = useCallback((target) => {
    if (isPointerDownRef.current) {
      return;
    }

    const text = target?.getAttribute?.("data-tooltip")?.trim();
    if (!text) {
      return;
    }

    targetRef.current = target;
    setTooltip({ target, text });
  }, []);

  const hideTooltip = useCallback((target) => {
    if (target && targetRef.current !== target) {
      return;
    }

    targetRef.current = null;
    setTooltip(null);
  }, []);

  useEffect(() => {
    const handlePointerOver = (event) => {
      if (isPointerDownRef.current) {
        return;
      }

      const target = getTooltipTarget(event.target);
      if (!target) {
        return;
      }

      if (
        event.relatedTarget instanceof Node &&
        target.contains(event.relatedTarget)
      ) {
        return;
      }

      showTooltip(target);
    };

    const handlePointerOut = (event) => {
      const target = getTooltipTarget(event.target);
      if (!target) {
        return;
      }

      if (
        event.relatedTarget instanceof Node &&
        target.contains(event.relatedTarget)
      ) {
        return;
      }

      hideTooltip(target);
    };

    const handleFocusIn = (event) => {
      if (isPointerDownRef.current) {
        return;
      }

      const target = getTooltipTarget(event.target);
      if (target) {
        showTooltip(target);
      }
    };

    const handleFocusOut = (event) => {
      const target = getTooltipTarget(event.target);
      if (target) {
        hideTooltip(target);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        hideTooltip();
      }
    };

    const handlePointerDown = () => {
      isPointerDownRef.current = true;
      hideTooltip();
    };

    const handlePointerUp = () => {
      isPointerDownRef.current = false;
    };

    const handleDragStart = () => {
      isPointerDownRef.current = true;
      hideTooltip();
    };

    const handleDragEnd = () => {
      isPointerDownRef.current = false;
      hideTooltip();
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointercancel", handleDragEnd, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("dragstart", handleDragStart, true);
    document.addEventListener("dragend", handleDragEnd, true);
    document.addEventListener("drop", handleDragEnd, true);

    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointercancel", handleDragEnd, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("dragstart", handleDragStart, true);
      document.removeEventListener("dragend", handleDragEnd, true);
      document.removeEventListener("drop", handleDragEnd, true);
    };
  }, [hideTooltip, showTooltip]);

  if (!tooltip || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <AdaptiveTooltip target={tooltip.target} text={tooltip.text} />,
    document.body,
  );
}

function AdaptiveTooltip({ target, text }) {
  const tooltipRef = useRef(null);
  const [style, setStyle] = useState({
    left: 0,
    top: 0,
    visibility: "hidden",
  });
  const { placement, ...positionStyle } = style;

  const updatePosition = useCallback(() => {
    const tooltipElement = tooltipRef.current;
    if (!tooltipElement || !target || !document.documentElement.contains(target)) {
      return;
    }

    const anchorRect = target.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();
    setStyle(
      getAdaptiveTooltipStyle(anchorRect, {
        width: tooltipRect.width,
        height: tooltipRect.height,
      }),
    );
  }, [target]);

  useLayoutEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition, text]);

  return (
    <div
      ref={tooltipRef}
      className="adaptive-tooltip"
      data-placement={placement}
      role="tooltip"
      style={positionStyle}
    >
      {text}
    </div>
  );
}

function getTooltipTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  return target.closest(".has-tooltip[data-tooltip]");
}

const ADAPTIVE_TOOLTIP_MARGIN = 8;
const ADAPTIVE_TOOLTIP_GAP = 8;

function getAdaptiveTooltipStyle(anchorRect, tooltipSize) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = Math.max(1, tooltipSize.width);
  const height = Math.max(1, tooltipSize.height);
  const margin = ADAPTIVE_TOOLTIP_MARGIN;
  const gap = ADAPTIVE_TOOLTIP_GAP;
  const centeredLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
  const clampLeft = (left) =>
    clamp(left, margin, Math.max(margin, viewportWidth - width - margin));
  const clampTop = (top) =>
    clamp(top, margin, Math.max(margin, viewportHeight - height - margin));
  const verticalCandidates = [
    {
      placement: "bottom",
      left: clampLeft(centeredLeft),
      top: anchorRect.bottom + gap,
    },
    {
      placement: "top",
      left: clampLeft(centeredLeft),
      top: anchorRect.top - height - gap,
    },
  ];
  const selectedVertical = verticalCandidates.find(
    (candidate) =>
      candidate.top >= margin &&
      candidate.top + height <= viewportHeight - margin,
  );
  const sidePlacement =
    anchorRect.left + anchorRect.width / 2 < viewportWidth / 2
      ? "right"
      : "left";
  const sideLeft =
    sidePlacement === "right"
      ? anchorRect.right + gap
      : anchorRect.left - width - gap;
  const selected =
    selectedVertical ?? {
      placement: sidePlacement,
      left: clampLeft(sideLeft),
      top: clampTop(anchorRect.top + anchorRect.height / 2 - height / 2),
    };

  return {
    left: `${selected.left}px`,
    top: `${clampTop(selected.top)}px`,
    placement: selected.placement,
    visibility: "visible",
  };
}

function getFloatingDropdownMenuStyle(
  anchorElement,
  { align, maxHeight, maxWidth, minWidth, preferredWidth },
) {
  const anchorRect = anchorElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = FLOATING_EDITOR_MENU_MARGIN;
  const viewportAvailableWidth = Math.max(1, viewportWidth - margin * 2);
  const resolvedMaxWidth = clamp(maxWidth, 1, viewportAvailableWidth);
  const resolvedMinWidth = Math.min(
    resolvedMaxWidth,
    Math.max(1, minWidth, anchorRect.width),
  );
  const width = clamp(preferredWidth, resolvedMinWidth, resolvedMaxWidth);
  const spaceBelow = viewportHeight - anchorRect.bottom - margin;
  const spaceAbove = anchorRect.top - margin;
  const shouldOpenAbove =
    spaceBelow < Math.min(maxHeight, 132) && spaceAbove > spaceBelow;
  const availableHeight = shouldOpenAbove ? spaceAbove : spaceBelow;
  const height = Math.max(72, Math.min(maxHeight, availableHeight));
  const rawLeft =
    align === "end"
      ? anchorRect.right - width
      : align === "center"
        ? anchorRect.left + anchorRect.width / 2 - width / 2
        : anchorRect.left;
  const left = clamp(
    rawLeft,
    margin,
    Math.max(margin, viewportWidth - width - margin),
  );
  const top = shouldOpenAbove
    ? clamp(
        anchorRect.top - height - FLOATING_EDITOR_MENU_GAP,
        margin,
        Math.max(margin, viewportHeight - height - margin),
      )
    : clamp(
        anchorRect.bottom + FLOATING_EDITOR_MENU_GAP,
        margin,
        Math.max(margin, viewportHeight - height - margin),
      );

  return {
    left: `${left}px`,
    maxHeight: `${height}px`,
    placement: shouldOpenAbove ? "top" : "bottom",
    top: `${top}px`,
    width: `${width}px`,
  };
}

function EditorFontFamilyControl({
  className = "",
  fontFamily,
  fontOptions = EDITOR_BUILTIN_FONT_FAMILY_OPTIONS,
  inputAriaLabel = "Editor font family",
  menuButtonAriaLabel = "Open font family menu",
  optionsAriaLabel = "Font family options",
  onFontFamilyChange,
}) {
  const normalizedFontFamily = normalizeEditorFontFamily(fontFamily);
  const selectedFontOption = getEditorFontFamilyOption(
    normalizedFontFamily,
    fontOptions,
  );
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [fontQuery, setFontQuery] = useState("");
  const fontMenuAnchorRef = useRef(null);
  const filteredFontOptions = useMemo(
    () => filterEditorFontOptions(fontOptions, fontQuery),
    [fontOptions, fontQuery],
  );

  const closeFontMenu = useCallback(() => {
    setFontQuery("");
    setIsFontMenuOpen(false);
  }, []);

  const applyFontFamily = useCallback(
    (nextFontFamily) => {
      const normalizedValue = normalizeEditorFontFamily(nextFontFamily);
      const option = getEditorFontFamilyOption(normalizedValue, fontOptions);
      onFontFamilyChange(normalizedValue);
      setFontQuery(option.label === selectedFontOption.label ? "" : option.label);
      closeFontMenu();
    },
    [closeFontMenu, fontOptions, onFontFamilyChange, selectedFontOption.label],
  );

  return (
    <div
      ref={fontMenuAnchorRef}
      className={`editor-font-setting-control editor-font-family-control ${className}`.trim()}
      onMouseDown={preventFocusLoss}
    >
      <div className="editor-font-family-combobox">
        <input
          className="editor-font-family-input"
          aria-label={inputAriaLabel}
          role="combobox"
          aria-expanded={isFontMenuOpen ? "true" : "false"}
          aria-haspopup="listbox"
          aria-controls="editor-font-family-options"
          spellCheck={false}
          placeholder={selectedFontOption.label}
          value={isFontMenuOpen ? fontQuery : selectedFontOption.label}
          onMouseDown={(event) => event.stopPropagation()}
          onFocus={() => {
            setFontQuery("");
            setIsFontMenuOpen(true);
          }}
          onChange={(event) => {
            setFontQuery(event.target.value);
            setIsFontMenuOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIsFontMenuOpen(true);
              return;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              const firstOption = filteredFontOptions[0];
              if (firstOption) {
                applyFontFamily(firstOption.value);
              }
              event.currentTarget.blur();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              closeFontMenu();
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="editor-font-family-menu-button"
          aria-label={menuButtonAriaLabel}
          aria-haspopup="listbox"
          aria-expanded={isFontMenuOpen ? "true" : "false"}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={() => {
            setFontQuery("");
            setIsFontMenuOpen((value) => !value);
          }}
        >
          ⌄
        </button>
        <FloatingDropdownMenu
          id="editor-font-family-options"
          anchorRef={fontMenuAnchorRef}
          ariaLabel={optionsAriaLabel}
          className="editor-font-family-menu"
          isOpen={isFontMenuOpen}
          maxHeight={216}
          maxWidth={238}
          minWidth={168}
          onRequestClose={closeFontMenu}
          preferredWidth={218}
        >
          {filteredFontOptions.length > 0 ? (
            filteredFontOptions.map((option) => (
              <DropdownMenuOption
                key={option.value}
                className="editor-font-family-option"
                selected={option.value === normalizedFontFamily}
                style={{ "--font-option-family": option.css }}
                onClick={() => applyFontFamily(option.value)}
                meta={option.source === "installed" ? "Local" : null}
              >
                {option.label}
              </DropdownMenuOption>
            ))
          ) : (
            <div className="editor-font-family-empty">No fonts found</div>
          )}
        </FloatingDropdownMenu>
      </div>
    </div>
  );
}

function EditorFontSizeControl({
  className = "",
  draftValue,
  scale,
  onDraftChange,
  onCommit,
  onFontSizeChange,
}) {
  const currentFontSize = editorFontScaleToSize(scale);
  const [isSizeMenuOpen, setIsSizeMenuOpen] = useState(false);
  const sizeMenuAnchorRef = useRef(null);

  const closeSizeMenu = useCallback(() => {
    setIsSizeMenuOpen(false);
  }, []);

  const applyFontSize = useCallback(
    (nextSize) => {
      const normalizedSize = normalizeEditorFontSize(nextSize, currentFontSize);
      onDraftChange(String(normalizedSize));
      onFontSizeChange(normalizedSize);
      closeSizeMenu();
    },
    [closeSizeMenu, currentFontSize, onDraftChange, onFontSizeChange],
  );

  return (
    <div
      ref={sizeMenuAnchorRef}
      className={`editor-font-setting-control editor-font-size-control ${className}`.trim()}
      onMouseDown={preventFocusLoss}
    >
      <div className="editor-font-size-combobox">
        <input
          className="editor-font-size-input"
          aria-label="Editor font size"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          min={MIN_EDITOR_FONT_SIZE_PX}
          max={MAX_EDITOR_FONT_SIZE_PX}
          value={draftValue}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const nextValue = event.target.value.trim();
            const nextSize = Number(nextValue);
            onDraftChange(nextValue);
            if (
              /^\d{1,3}$/.test(nextValue) &&
              Number.isFinite(nextSize) &&
              nextSize >= MIN_EDITOR_FONT_SIZE_PX &&
              nextSize <= MAX_EDITOR_FONT_SIZE_PX
            ) {
              onFontSizeChange(nextSize);
            }
          }}
          onFocus={() => setIsSizeMenuOpen(false)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIsSizeMenuOpen(true);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              onCommit();
              event.currentTarget.blur();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onDraftChange(String(currentFontSize));
              closeSizeMenu();
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="editor-font-size-menu-button"
          aria-label="Open font size menu"
          aria-haspopup="listbox"
          aria-expanded={isSizeMenuOpen ? "true" : "false"}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={() => setIsSizeMenuOpen((value) => !value)}
        >
          ⌄
        </button>
        <FloatingDropdownMenu
          anchorRef={sizeMenuAnchorRef}
          ariaLabel="Editor font size presets"
          className="editor-font-size-menu"
          isOpen={isSizeMenuOpen}
          align="end"
          maxHeight={196}
          maxWidth={104}
          minWidth={76}
          onRequestClose={closeSizeMenu}
          preferredWidth={86}
        >
          {EDITOR_FONT_SIZE_PRESETS.map((fontSize) => (
            <DropdownMenuOption
              key={fontSize}
              className="editor-font-size-option"
              selected={currentFontSize === fontSize}
              onClick={() => applyFontSize(fontSize)}
            >
              {fontSize}
            </DropdownMenuOption>
          ))}
        </FloatingDropdownMenu>
      </div>
    </div>
  );
}

function normalizeAppTheme(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    mode: source.mode === "dark" ? "dark" : "light",
  };
}

function normalizeLayoutMode(value) {
  return value === "sticky" ? "sticky" : DEFAULT_LAYOUT_MODE;
}

function normalizeEditorPreferences(
  value,
  fallback = DEFAULT_EDITOR_PREFERENCES,
) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackSource = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_EDITOR_PREFERENCES;

  return {
    editorFontScale: normalizeEditorFontScale(
      source.editorFontScale,
      fallbackSource.editorFontScale,
    ),
    editorFontFamily: normalizeEditorFontFamily(
      source.editorFontFamily,
      fallbackSource.editorFontFamily,
    ),
    appFontFamily: normalizeAppFontFamily(
      source.appFontFamily,
      fallbackSource.appFontFamily,
    ),
    showTableOfContents:
      typeof source.showTableOfContents === "boolean"
        ? source.showTableOfContents
        : Boolean(fallbackSource.showTableOfContents),
    keyboardShortcuts: normalizeKeyboardShortcuts(
      source.keyboardShortcuts,
      fallbackSource.keyboardShortcuts,
    ),
    keyboardShortcutEnabled: normalizeKeyboardShortcutEnabled(
      source.keyboardShortcutEnabled,
      fallbackSource.keyboardShortcutEnabled,
    ),
  };
}

function normalizeTheme(value) {
  const source = value && typeof value === "object" ? value : {};
  const migratedTabTextColor =
    isHexColor(source.textColor) &&
    source.textColor.toLowerCase() !== "#211b0c"
      ? source.textColor.toLowerCase()
      : DEFAULT_THEME.tabTextColor;

  return {
    tabTextColor: normalizeOptionalHexColor(
      source.tabTextColor,
      migratedTabTextColor,
    ),
    tabTextOpacity: normalizeOpacity(
      source.tabTextOpacity,
      DEFAULT_THEME.tabTextOpacity,
    ),
  };
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeOptionalHexColor(value, fallback = null) {
  return isHexColor(value)
    ? value.toLowerCase()
    : isHexColor(fallback)
      ? fallback.toLowerCase()
      : null;
}

function normalizeOpacity(value, fallback = DEFAULT_THEME.tabTextOpacity) {
  const hasExplicitValue =
    typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "");
  const numericValue = hasExplicitValue ? Number(value) : NaN;
  if (Number.isFinite(numericValue)) {
    return clamp(numericValue, 0, 1);
  }

  const hasFallbackValue =
    typeof fallback === "number" ||
    (typeof fallback === "string" && fallback.trim() !== "");
  const fallbackValue = hasFallbackValue ? Number(fallback) : NaN;
  return Number.isFinite(fallbackValue)
    ? clamp(fallbackValue, 0, 1)
    : DEFAULT_THEME.tabTextOpacity;
}

function normalizeEditorFontScale(value, fallback = DEFAULT_EDITOR_FONT_SCALE) {
  const numericValue = Number(value);
  const fallbackValue = Number(fallback);
  const resolvedValue = Number.isFinite(numericValue)
    ? numericValue
    : Number.isFinite(fallbackValue)
      ? fallbackValue
      : DEFAULT_EDITOR_FONT_SCALE;

  return Math.round(
    clamp(resolvedValue, MIN_EDITOR_FONT_SCALE, MAX_EDITOR_FONT_SCALE) * 100,
  ) / 100;
}

function normalizeEditorFontSize(value, fallback = BASE_EDITOR_FONT_SIZE_PX) {
  const numericValue = Number(value);
  const fallbackValue = Number(fallback);
  const resolvedValue = Number.isFinite(numericValue)
    ? numericValue
    : Number.isFinite(fallbackValue)
      ? fallbackValue
      : BASE_EDITOR_FONT_SIZE_PX;

  return Math.round(
    clamp(resolvedValue, MIN_EDITOR_FONT_SIZE_PX, MAX_EDITOR_FONT_SIZE_PX),
  );
}

function editorFontScaleToSize(scale) {
  return normalizeEditorFontSize(
    normalizeEditorFontScale(scale) * BASE_EDITOR_FONT_SIZE_PX,
  );
}

function editorFontSizeToScale(fontSize) {
  return normalizeEditorFontScale(
    normalizeEditorFontSize(fontSize) / BASE_EDITOR_FONT_SIZE_PX,
  );
}

function normalizeEditorFontFamily(value, fallback = DEFAULT_EDITOR_FONT_FAMILY) {
  const normalizedValue = normalizeEditorFontFamilyValue(value);
  if (isAllowedEditorFontFamily(normalizedValue)) {
    return normalizedValue;
  }

  const normalizedFallback = normalizeEditorFontFamilyValue(fallback);
  return isAllowedEditorFontFamily(normalizedFallback)
    ? normalizedFallback
    : DEFAULT_EDITOR_FONT_FAMILY;
}

function normalizeAppFontFamily(value, fallback = DEFAULT_APP_FONT_FAMILY) {
  const normalizedValue = normalizeEditorFontFamilyValue(value);
  if (isAllowedEditorFontFamily(normalizedValue)) {
    return normalizedValue;
  }

  const normalizedFallback = normalizeEditorFontFamilyValue(fallback);
  return isAllowedEditorFontFamily(normalizedFallback)
    ? normalizedFallback
    : DEFAULT_APP_FONT_FAMILY;
}

function normalizeEditorFontFamilyValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.replace(/\s+/g, " ").trim();
  if (trimmedValue.toLowerCase().startsWith(LOCAL_FONT_VALUE_PREFIX)) {
    const family = normalizeInstalledFontFamily(
      trimmedValue.slice(LOCAL_FONT_VALUE_PREFIX.length),
    );
    return family ? `${LOCAL_FONT_VALUE_PREFIX}${family}` : "";
  }

  return trimmedValue.toLowerCase();
}

function isAllowedEditorFontFamily(value) {
  return (
    EDITOR_BUILTIN_FONT_FAMILY_OPTIONS.some((option) => option.value === value) ||
    Boolean(parseLocalFontFamilyValue(value))
  );
}

function getEditorFontFamilyOptions(installedFontFamilies = [], selectedValue = "") {
  const options = [...EDITOR_BUILTIN_FONT_FAMILY_OPTIONS];
  const seenValues = new Set(options.map((option) => option.value));

  for (const family of installedFontFamilies) {
    const normalizedFamily = normalizeInstalledFontFamily(family);
    if (!normalizedFamily) {
      continue;
    }

    const value = `${LOCAL_FONT_VALUE_PREFIX}${normalizedFamily}`;
    if (seenValues.has(value)) {
      continue;
    }

    seenValues.add(value);
    options.push({
      value,
      label: normalizedFamily,
      css: `${quoteFontFamily(normalizedFamily)}, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`,
      source: "installed",
    });
  }

  const selectedFamily = parseLocalFontFamilyValue(selectedValue);
  if (selectedFamily) {
    const selectedValueKey = `${LOCAL_FONT_VALUE_PREFIX}${selectedFamily}`;
    if (!seenValues.has(selectedValueKey)) {
      options.push({
        value: selectedValueKey,
        label: selectedFamily,
        css: `${quoteFontFamily(selectedFamily)}, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif`,
        source: "installed",
      });
    }
  }

  return options;
}

function filterEditorFontOptions(fontOptions = [], query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return fontOptions.slice(0, 96);
  }

  return fontOptions
    .filter((option) =>
      `${option.label} ${option.value}`.toLowerCase().includes(normalizedQuery),
    )
    .slice(0, 96);
}

function getEditorFontFamilyOption(value, fontOptions = []) {
  const normalizedValue = normalizeEditorFontFamily(value);
  return (
    fontOptions.find((option) => option.value === normalizedValue) ??
    getEditorFontFamilyOptions([], normalizedValue).find(
      (option) => option.value === normalizedValue,
    ) ??
    EDITOR_BUILTIN_FONT_FAMILY_OPTIONS[0]
  );
}

function getEditorFontFamilyCss(value, fontOptions = []) {
  return (
    fontOptions.find(
      (option) => option.value === normalizeEditorFontFamily(value),
    )?.css ??
    getEditorFontFamilyOption(value, fontOptions).css ??
    EDITOR_BUILTIN_FONT_FAMILY_OPTIONS[0].css
  );
}

function parseLocalFontFamilyValue(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.replace(/\s+/g, " ").trim();
  if (!trimmedValue.toLowerCase().startsWith(LOCAL_FONT_VALUE_PREFIX)) {
    return "";
  }

  return normalizeInstalledFontFamily(
    trimmedValue.slice(LOCAL_FONT_VALUE_PREFIX.length),
  );
}

function normalizeInstalledFontFamily(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function quoteFontFamily(value) {
  return `"${normalizeInstalledFontFamily(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function resolveTabTextColor(theme, appThemeMode = DEFAULT_APP_THEME.mode) {
  const normalizedTheme = normalizeTheme(theme);
  const modeDefaults =
    MODE_TAB_TEXT_DEFAULTS[appThemeMode] ?? MODE_TAB_TEXT_DEFAULTS.light;
  return isHexColor(normalizedTheme.tabTextColor)
    ? normalizedTheme.tabTextColor
    : modeDefaults.tabTextColor;
}

function resolveThemeAccentColor(theme, fallbackColor) {
  const normalizedTheme = normalizeTheme(theme);
  return isHexColor(normalizedTheme.tabTextColor)
    ? normalizedTheme.tabTextColor
    : normalizeOptionalHexColor(fallbackColor, DEFAULT_STICKY_ACCENT_COLOR);
}

function resolveSessionTabAccentColor(theme, fallbackColor = null) {
  const normalizedTheme = normalizeTheme(theme);
  return isHexColor(normalizedTheme.tabTextColor)
    ? normalizedTheme.tabTextColor
    : normalizeOptionalHexColor(fallbackColor);
}

function resolveStickyAccentColor(theme, noteIndex = 0) {
  return resolveThemeAccentColor(theme, resolveDefaultStickyAccentColor(noteIndex));
}

function resolveTabTextOpacity(theme) {
  return normalizeTheme(theme).tabTextOpacity;
}

function resolveDefaultStickyAccentColor(noteIndex = 0) {
  return STICKY_PASTEL_PALETTE[
    Math.abs(Number.isFinite(noteIndex) ? noteIndex : 0) %
      STICKY_PASTEL_PALETTE.length
  ];
}

function getSessionTabStyle(
  theme,
  appThemeMode = DEFAULT_APP_THEME.mode,
  noteIndex = 0,
) {
  const accentColor = resolveSessionTabAccentColor(
    theme,
    resolveDefaultStickyAccentColor(noteIndex),
  );
  const tabTextOpacity = resolveTabTextOpacity(theme);

  if (!accentColor && tabTextOpacity === DEFAULT_THEME.tabTextOpacity) {
    return {};
  }

  const resolvedAccentColor = accentColor ?? DEFAULT_STICKY_ACCENT_COLOR;
  const displayAccentColor =
    appThemeMode === "dark"
      ? mixHexColors(resolvedAccentColor, "#000000", SESSION_TAB_DARK_MODE_TONE_MIX)
      : resolvedAccentColor;
  const modeBase =
    SESSION_TAB_MODE_BASE_COLORS[appThemeMode] ?? SESSION_TAB_MODE_BASE_COLORS.light;
  const activeEffectiveBackground = blendHexOverHex(
    displayAccentColor,
    modeBase.active,
    tabTextOpacity,
  );
  const activeTextColor = getSessionTabContrastingTextColor(activeEffectiveBackground);
  const inactiveTextColor = hexToCssRgb(activeTextColor, 0.72);
  const activeBorderColor = hexToCssRgb(activeTextColor, 0.34);
  const activeShadowColor = hexToCssRgb(activeTextColor, 0.12);
  const inactiveShadowColor = hexToCssRgb(activeTextColor, 0.04);
  const tabBackground = hexToCssRgb(displayAccentColor, tabTextOpacity);

  return {
    "--session-tab-active-bg": tabBackground,
    "--session-tab-hover-bg": tabBackground,
    "--session-tab-inactive-bg": tabBackground,
    "--session-tab-text-color": activeTextColor,
    "--session-tab-inactive-text-color": inactiveTextColor,
    "--session-tab-border-color": activeBorderColor,
    "--session-tab-active-shadow": `inset 0 0 0 1px ${activeBorderColor}, 0 7px 16px ${activeShadowColor}`,
    "--session-tab-inactive-shadow": `inset 0 0 0 1px ${inactiveShadowColor}`,
    "--session-tab-dot-bg": hexToCssRgb(displayAccentColor, 0.24),
    "--session-tab-dot-text-color": activeTextColor,
  };
}

function getStickyShellStyle(
  theme,
  accentColor,
  appThemeMode = DEFAULT_APP_THEME.mode,
) {
  const opacity = resolveTabTextOpacity(theme);
  const baseBackground = appThemeMode === "dark" ? "#191919" : "#ffffff";
  const effectiveBackground = blendHexOverHex(accentColor, baseBackground, opacity);
  const textColor = getContrastingTextColor(
    effectiveBackground,
    "#37352f",
    "#f7f7f4",
  );
  const isLightBackground = textColor === "#37352f";
  const headerColor = isLightBackground
    ? mixHexColors(accentColor, "#ffffff", 0.46)
    : mixHexColors(accentColor, "#000000", 0.08);
  const headerEffectiveBackground = blendHexOverHex(
    headerColor,
    baseBackground,
    Math.max(opacity, 0.96),
  );
  const panelColor = isLightBackground
    ? mixHexColors(accentColor, "#ffffff", 0.34)
    : mixHexColors(accentColor, "#ffffff", 0.08);
  const panelOpacity = Math.min(opacity + 0.04, 1);
  const panelEffectiveBackground = blendHexOverHex(
    panelColor,
    baseBackground,
    panelOpacity,
  );
  const panelTextColor = getContrastingTextColor(
    panelEffectiveBackground,
    "#37352f",
    "#f7f7f4",
  );
  const isLightPanelBackground = panelTextColor === "#37352f";
  const mutedColor = hexToCssRgb(textColor, isLightBackground ? 0.72 : 0.78);
  const panelMutedColor = hexToCssRgb(
    panelTextColor,
    isLightPanelBackground ? 0.68 : 0.76,
  );
  const borderColor = hexToCssRgb(textColor, isLightBackground ? 0.14 : 0.24);
  const tableBorderColor = getReadableBoundaryColor(
    effectiveBackground,
    textColor,
  );
  const tableControlBackground = mixHexColors(
    effectiveBackground,
    "#000000",
    isLightBackground ? 0.055 : 0.11,
  );
  const tableControlHoverBackground = mixHexColors(
    effectiveBackground,
    "#000000",
    isLightBackground ? 0.09 : 0.16,
  );
  const tableControlBorderColor = mixHexColors(
    effectiveBackground,
    textColor,
    isLightBackground ? 0.18 : 0.22,
  );
  const portalMenuBackground = mixHexColors(
    effectiveBackground,
    isLightBackground ? "#ffffff" : "#000000",
    isLightBackground ? 0.18 : 0.1,
  );
  const portalMenuHoverBackground = mixHexColors(
    portalMenuBackground,
    textColor,
    isLightBackground ? 0.08 : 0.14,
  );
  const portalMenuBorderColor = mixHexColors(
    portalMenuBackground,
    textColor,
    isLightBackground ? 0.16 : 0.22,
  );
  const tableControlShadow = isLightBackground
    ? "0 5px 12px rgb(55 53 47 / 0.12), inset 0 1px 0 rgb(255 255 255 / 0.28)"
    : "0 7px 16px rgb(0 0 0 / 0.34), inset 0 1px 0 rgb(255 255 255 / 0.08)";
  const portalMenuShadow = isLightBackground
    ? "0 12px 26px rgb(55 53 47 / 0.16), inset 0 1px 0 rgb(255 255 255 / 0.38)"
    : "0 14px 34px rgb(0 0 0 / 0.46), inset 0 1px 0 rgb(255 255 255 / 0.08)";
  const blockNoteShadowColor = isLightBackground
    ? "rgb(55 53 47 / 0.18)"
    : "rgb(0 0 0 / 0.48)";
  const controlBackground = isLightBackground
    ? "rgb(255 255 255 / 0.46)"
    : "rgb(0 0 0 / 0.20)";
  const controlHoverBackground = isLightBackground
    ? "rgb(255 255 255 / 0.68)"
    : "rgb(255 255 255 / 0.16)";
  const codeBorderColor = isLightBackground
    ? "rgb(31 35 40 / 0.32)"
    : "rgb(139 148 158 / 0.42)";
  const glassHighlight = isLightBackground
    ? "rgb(255 255 255 / 0.52)"
    : "rgb(255 255 255 / 0.14)";
  const glassLowlight = isLightBackground
    ? "rgb(55 53 47 / 0.10)"
    : "rgb(0 0 0 / 0.34)";
  const glassStroke = isLightBackground
    ? "rgb(255 255 255 / 0.46)"
    : "rgb(255 255 255 / 0.12)";
  const selectedBackground = isLightBackground ? "#37352f" : "#f7f7f4";
  const selectedText = isLightBackground ? "#ffffff" : "#191919";
  const iconColor = isLightBackground ? "#4f534f" : "#f1f1ef";
  const iconActiveColor = isLightBackground ? "#2f3437" : "#ffffff";
  const iconSurfaceFill = isLightBackground
    ? "rgb(255 255 255 / 0.40)"
    : "rgb(255 255 255 / 0.10)";
  const iconMutedFill = hexToCssRgb(textColor, isLightBackground ? 0.10 : 0.14);

  return {
    "--sticky-note-accent-color": accentColor,
    "--sticky-effective-bg": effectiveBackground,
    "--sticky-note-bg": hexToCssRgb(accentColor, opacity),
    "--sticky-note-header-bg": headerEffectiveBackground,
    "--sticky-note-panel-bg": hexToCssRgb(panelColor, panelOpacity),
    "--sticky-text-color": textColor,
    "--sticky-muted-color": mutedColor,
    "--sticky-panel-text": panelTextColor,
    "--sticky-panel-muted": panelMutedColor,
    "--sticky-border-color": borderColor,
    "--sticky-table-border-color": tableBorderColor,
    "--sticky-table-control-border-color": tableControlBorderColor,
    "--sticky-table-control-bg": tableControlBackground,
    "--sticky-table-control-hover-bg": tableControlHoverBackground,
    "--sticky-table-control-text": textColor,
    "--sticky-table-control-shadow": tableControlShadow,
    "--sticky-portal-menu-bg": portalMenuBackground,
    "--sticky-portal-menu-hover-bg": portalMenuHoverBackground,
    "--sticky-portal-menu-border-color": portalMenuBorderColor,
    "--sticky-portal-menu-shadow": portalMenuShadow,
    "--sticky-control-bg": controlBackground,
    "--sticky-control-hover-bg": controlHoverBackground,
    "--sticky-code-bg": "#0d1117",
    "--sticky-code-text": "#f0f6fc",
    "--sticky-code-border": codeBorderColor,
    "--sticky-code-muted": "#8b949e",
    "--sticky-glass-highlight": glassHighlight,
    "--sticky-glass-lowlight": glassLowlight,
    "--sticky-glass-stroke": glassStroke,
    "--bn-colors-editor-text": textColor,
    "--bn-colors-menu-text": textColor,
    "--bn-colors-menu-background": portalMenuBackground,
    "--bn-colors-tooltip-text": textColor,
    "--bn-colors-tooltip-background": portalMenuHoverBackground,
    "--bn-colors-hovered-text": textColor,
    "--bn-colors-hovered-background": portalMenuHoverBackground,
    "--bn-colors-selected-text": selectedText,
    "--bn-colors-selected-background": selectedBackground,
    "--bn-colors-disabled-text": hexToCssRgb(textColor, isLightBackground ? 0.42 : 0.48),
    "--bn-colors-disabled-background": hexToCssRgb(textColor, isLightBackground ? 0.08 : 0.12),
    "--bn-colors-border": borderColor,
    "--bn-colors-shadow": blockNoteShadowColor,
    "--bn-colors-side-menu": mutedColor,
    "--icon-chrome-color": iconColor,
    "--icon-chrome-active-color": iconActiveColor,
    "--icon-surface-fill": iconSurfaceFill,
    "--icon-muted-fill": iconMutedFill,
  };
}

function hexToRgb(hexColor) {
  const hex = isHexColor(hexColor)
    ? hexColor.slice(1)
    : MODE_TAB_TEXT_DEFAULTS.light.tabTextColor.slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function hexToCssRgb(hexColor, opacity = DEFAULT_THEME.tabTextOpacity) {
  const [red, green, blue] = hexToRgb(hexColor);
  return `rgb(${red} ${green} ${blue} / ${normalizeOpacity(opacity)})`;
}

function mixHexColors(hexColor, mixColor, mixAmount) {
  const sourceRgb = hexToRgb(hexColor);
  const mixRgb = hexToRgb(mixColor);
  const amount = clamp(mixAmount, 0, 1, 0);
  return rgbToHex(
    sourceRgb[0] * (1 - amount) + mixRgb[0] * amount,
    sourceRgb[1] * (1 - amount) + mixRgb[1] * amount,
    sourceRgb[2] * (1 - amount) + mixRgb[2] * amount,
  );
}

function blendHexOverHex(foregroundHexColor, backgroundHexColor, foregroundOpacity) {
  const foregroundRgb = hexToRgb(foregroundHexColor);
  const backgroundRgb = hexToRgb(backgroundHexColor);
  const opacity = normalizeOpacity(foregroundOpacity);
  return rgbToHex(
    foregroundRgb[0] * opacity + backgroundRgb[0] * (1 - opacity),
    foregroundRgb[1] * opacity + backgroundRgb[1] * (1 - opacity),
    foregroundRgb[2] * opacity + backgroundRgb[2] * (1 - opacity),
  );
}

function getContrastingTextColor(
  backgroundHexColor,
  darkTextColor = SESSION_TAB_CONTRAST_TEXT.dark,
  lightTextColor = SESSION_TAB_CONTRAST_TEXT.light,
) {
  const darkContrast = getContrastRatio(backgroundHexColor, darkTextColor);
  const lightContrast = getContrastRatio(backgroundHexColor, lightTextColor);
  return darkContrast >= lightContrast ? darkTextColor : lightTextColor;
}

function getSessionTabContrastingTextColor(backgroundHexColor) {
  return getRelativeLuminance(backgroundHexColor) > 0.46
    ? SESSION_TAB_CONTRAST_TEXT.dark
    : SESSION_TAB_CONTRAST_TEXT.light;
}

function getReadableBoundaryColor(
  backgroundHexColor,
  targetHexColor,
  minimumContrast = 3,
) {
  for (let mixAmount = 0.24; mixAmount <= 1; mixAmount += 0.04) {
    const candidateColor = mixHexColors(
      backgroundHexColor,
      targetHexColor,
      mixAmount,
    );

    if (getContrastRatio(candidateColor, backgroundHexColor) >= minimumContrast) {
      return candidateColor;
    }
  }

  return targetHexColor;
}

function getContrastRatio(firstHexColor, secondHexColor) {
  const firstLuminance = getRelativeLuminance(firstHexColor);
  const secondLuminance = getRelativeLuminance(secondHexColor);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance(hexColor) {
  const [red, green, blue] = hexToRgb(hexColor).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function hexToHsv(hexColor) {
  const [red, green, blue] = hexToRgb(hexColor).map((value) => value / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  const saturation = max === 0 ? 0 : delta / max;
  return {
    h: (hue + 360) % 360,
    s: saturation,
    v: max,
  };
}

function hsvToHex(hue, saturation, value) {
  return `#${hsvToRgb(hue, saturation, value)
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function hsvToRgb(hue, saturation, value) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = value * saturation;
  const huePrime = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = value - chroma;
  return [red, green, blue].map((channel) =>
    Math.round((channel + match) * 255),
  );
}

function formatColorValues(hexColor, opacity = DEFAULT_THEME.tabTextOpacity) {
  const [red, green, blue] = hexToRgb(hexColor);
  const hsl = rgbToHsl(red, green, blue);
  const lch = rgbToLch(red, green, blue);
  const alphaSuffix = formatColorAlphaSuffix(opacity);

  return [
    {
      label: "HEX",
      value: hexColor.slice(1).toLowerCase(),
    },
    {
      label: "HSL",
      value: `hsl(${Math.round(hsl.h)}deg ${Math.round(hsl.s * 100)}% ${Math.round(hsl.l * 100)}%${alphaSuffix})`,
    },
    {
      label: "RGB",
      value: `rgb(${red} ${green} ${blue}${alphaSuffix})`,
    },
    {
      label: "LCH",
      value: `lch(${Math.round(lch.l)}% ${Math.round(lch.c)} ${Math.round(lch.h)}deg${alphaSuffix})`,
    },
  ];
}

function formatColorAlphaSuffix(opacity) {
  const normalizedOpacity = normalizeOpacity(opacity);
  if (normalizedOpacity >= 1) {
    return "";
  }

  return ` / ${Math.round(normalizedOpacity * 100)}%`;
}

async function writeClipboardText(value) {
  const text = String(value ?? "");

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to the legacy copy path below.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function parseColorValue(label, value) {
  const normalizedLabel = String(label).toUpperCase();
  if (normalizedLabel === "HEX") {
    return parseHexColorValue(value);
  }
  if (normalizedLabel === "HSL") {
    return parseHslColorValue(value);
  }
  if (normalizedLabel === "RGB") {
    return parseRgbColorValue(value);
  }
  if (normalizedLabel === "LCH") {
    return parseLchColorValue(value);
  }

  return null;
}

function parseHexColorValue(value) {
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) {
    return null;
  }

  return `#${hex.slice(0, 6).toLowerCase()}`;
}

function parseHslColorValue(value) {
  if (!isCompleteFunctionalColorValue(value, "hsl")) {
    return null;
  }

  const numbers = extractColorNumbers(value);
  if (numbers.length < 3) {
    return null;
  }

  const [hue, saturation, lightness] = numbers;
  const [red, green, blue] = hslToRgb(
    hue,
    clamp(saturation / 100, 0, 1, 0),
    clamp(lightness / 100, 0, 1, 0),
  );

  return rgbToHex(red, green, blue);
}

function parseRgbColorValue(value) {
  if (!isCompleteFunctionalColorValue(value, "rgb")) {
    return null;
  }

  const numbers = extractColorNumbers(value);
  if (numbers.length < 3) {
    return null;
  }

  const [red, green, blue] = numbers;
  return rgbToHex(
    clamp(Math.round(red), 0, 255, 0),
    clamp(Math.round(green), 0, 255, 0),
    clamp(Math.round(blue), 0, 255, 0),
  );
}

function parseLchColorValue(value) {
  if (!isCompleteFunctionalColorValue(value, "lch")) {
    return null;
  }

  const numbers = extractColorNumbers(value);
  if (numbers.length < 3) {
    return null;
  }

  const [lightness, chroma, hue] = numbers;
  const [red, green, blue] = lchToRgb(
    clamp(lightness, 0, 100, 0),
    Math.max(0, chroma),
    hue,
  );

  return rgbToHex(red, green, blue);
}

function isCompleteFunctionalColorValue(value, functionName) {
  const trimmedValue = String(value).trim();
  const lowerValue = trimmedValue.toLowerCase();
  if (!lowerValue.startsWith(`${functionName}(`)) {
    return true;
  }

  return trimmedValue.endsWith(")");
}

function extractColorNumbers(value) {
  return (String(value).match(/[-+]?\d*\.?\d+/g) || [])
    .map(Number)
    .filter(Number.isFinite);
}

function rgbToHsl(red, green, blue) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness };
  }

  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;
  if (max === r) {
    hue = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  return { h: hue * 60, s: saturation, l: lightness };
}

function hslToRgb(hue, saturation, lightness) {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime >= 0 && huePrime < 1) {
    red = chroma;
    green = x;
  } else if (huePrime < 2) {
    red = x;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = x;
  } else if (huePrime < 4) {
    green = x;
    blue = chroma;
  } else if (huePrime < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = lightness - chroma / 2;
  return [red, green, blue].map((channel) =>
    clamp(Math.round((channel + match) * 255), 0, 255, 0),
  );
}

function rgbToLch(red, green, blue) {
  const r = srgbToLinear(red / 255);
  const g = srgbToLinear(green / 255);
  const b = srgbToLinear(blue / 255);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const fx = labPivot(x);
  const fy = labPivot(y);
  const fz = labPivot(z);
  const l = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const labB = 200 * (fy - fz);
  const c = Math.sqrt(a * a + labB * labB);
  const h = (Math.atan2(labB, a) * 180) / Math.PI;
  return {
    l: clamp(l, 0, 100, 0),
    c,
    h: (h + 360) % 360,
  };
}

function lchToRgb(lightness, chroma, hue) {
  const hueRadians = (hue * Math.PI) / 180;
  const a = Math.cos(hueRadians) * chroma;
  const b = Math.sin(hueRadians) * chroma;
  const fy = (lightness + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = inverseLabPivot(fx) * 0.95047;
  const y = inverseLabPivot(fy);
  const z = inverseLabPivot(fz) * 1.08883;

  return [
    linearToSrgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    linearToSrgb(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    linearToSrgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  ];
}

function srgbToLinear(value) {
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value) {
  const srgb = value <= 0.0031308
    ? 12.92 * value
    : 1.055 * value ** (1 / 2.4) - 0.055;
  return clamp(Math.round(srgb * 255), 0, 255, 0);
}

function labPivot(value) {
  return value > 216 / 24389
    ? Math.cbrt(value)
    : (24389 / 27 * value + 16) / 116;
}

function inverseLabPivot(value) {
  const cubed = value ** 3;
  return cubed > 216 / 24389
    ? cubed
    : (116 * value - 16) / (24389 / 27);
}

function rgbToHex(red, green, blue) {
  return `#${[red, green, blue]
    .map((channel) => clamp(Math.round(channel), 0, 255, 0).toString(16).padStart(2, "0"))
    .join("")}`;
}

function clamp(value, minimum, maximum, fallback = minimum) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(value, minimum), maximum);
}

function moveArrayItem(items, fromIndex, toIndex) {
  if (
    !Array.isArray(items) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return Array.isArray(items) ? [...items] : [];
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

function getReorderedNoteIdsForDrop(
  noteIds,
  sourceNoteId,
  targetNoteId,
  insertionSide = "before",
) {
  const currentNoteIds = Array.isArray(noteIds) ? noteIds : [];
  const sourceIndex = currentNoteIds.indexOf(sourceNoteId);
  const targetIndex = currentNoteIds.indexOf(targetNoteId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceNoteId === targetNoteId) {
    return [...currentNoteIds];
  }

  const nextNoteIds = currentNoteIds.filter((noteId) => noteId !== sourceNoteId);
  const targetIndexAfterRemoval = nextNoteIds.indexOf(targetNoteId);
  const insertionIndex = insertionSide === "after"
    ? targetIndexAfterRemoval + 1
    : targetIndexAfterRemoval;
  nextNoteIds.splice(clamp(insertionIndex, 0, nextNoteIds.length), 0, sourceNoteId);
  return nextNoteIds;
}

function arraysEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function isPointInsideElement(event, element) {
  if (!(element instanceof Element)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return (
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom
  );
}

function getSessionTabRects(rowMap) {
  const rects = new Map();
  for (const [noteId, element] of rowMap.entries()) {
    if (element instanceof Element) {
      rects.set(noteId, element.getBoundingClientRect());
    }
  }
  return rects;
}

function animateSessionTabReorder(rowMap, previousRects) {
  const animatedRows = [];
  for (const [noteId, element] of rowMap.entries()) {
    const previousRect = previousRects.get(noteId);
    if (!previousRect || !(element instanceof HTMLElement)) {
      continue;
    }

    const nextRect = element.getBoundingClientRect();
    const deltaY = previousRect.top - nextRect.top;
    if (Math.abs(deltaY) < 1) {
      continue;
    }

    element.classList.add("is-reorder-animating");
    element.style.transition = "none";
    element.style.setProperty("--session-tab-reorder-y", `${deltaY}px`);
    animatedRows.push(element);
  }

  if (animatedRows.length === 0) {
    return;
  }

  animatedRows[0].getBoundingClientRect();
  window.requestAnimationFrame(() => {
    for (const element of animatedRows) {
      element.style.transition = "";
      element.style.setProperty("--session-tab-reorder-y", "0px");
      window.setTimeout(() => {
        element.classList.remove("is-reorder-animating");
        element.style.removeProperty("--session-tab-reorder-y");
      }, SESSION_TAB_REORDER_ANIMATION_MS);
    }
  });
}

function nextAnimationFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function isEditorShortcutTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  if (
    target.closest(
      ".sticky-header, .session-sidebar, .image-tools, .crop-dialog, .preferences-panel, .preferences-window",
    )
  ) {
    return false;
  }

  return Boolean(
    target.closest(".bn-container") ||
      target.closest("[data-testid='sticky-editor-surface']"),
  );
}

function isVisibleElement(element) {
  if (!(element instanceof Element)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) > 0.01 &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function isEditableFormTarget(target) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select"));
}

function isSelectionInsideCodeBlock(editor) {
  try {
    return editor.transact(
      (transaction) =>
        Boolean(transaction.selection.$from.parent.type.spec.code) &&
        Boolean(transaction.selection.$to.parent.type.spec.code),
    );
  } catch {
    return false;
  }
}

function hasEditorRangeSelection(editor) {
  try {
    return editor.transact((transaction) => !transaction.selection.empty);
  } catch {
    return false;
  }
}

function isStandaloneWebUrl(text) {
  return /^https?:\/\/\S+$/i.test(String(text).trim());
}

function normalizeCopiedEditorPlainText(editor, clipboardText, selectedText = "") {
  let normalizedPlainText = String(clipboardText).replace(/\\\n/g, "\n");

  try {
    normalizedPlainText = editor.transact((transaction) => {
      let containsHardBreak = false;
      transaction.doc.nodesBetween(
        transaction.selection.from,
        transaction.selection.to,
        (node) => {
          if (node.type.name === "hardBreak") {
            containsHardBreak = true;
          }
        },
      );

      if (!containsHardBreak) {
        return normalizedPlainText;
      }

      return transaction.doc.textBetween(
        transaction.selection.from,
        transaction.selection.to,
        "\n",
        "\n",
      );
    });
  } catch {
    // Keep the clipboard serializer output when the editor selection is unavailable.
  }

  if (
    normalizedPlainText.endsWith("\n") &&
    !String(selectedText).endsWith("\n")
  ) {
    return normalizedPlainText.slice(0, -1);
  }

  return normalizedPlainText;
}

function normalizePastedMarkdownForBlockNote(markdown) {
  const normalizedLineEndings = String(markdown).replace(/\r\n?/g, "\n");
  const normalizedTables = normalizeWrappedMarkdownTables(normalizedLineEndings);

  return {
    markdown: normalizedTables,
    shouldPasteAsMarkdown:
      normalizedTables !== normalizedLineEndings ||
      containsCommonMarkdownBlockSyntax(normalizedTables),
  };
}

function containsCommonMarkdownBlockSyntax(markdown) {
  return /^(?: {0,3}#{1,6}(?:[ \t]+|$)| {0,3}(?:[-+*][ \t]+(?:\[[ xX]\][ \t]+)?|\d{1,9}[.)][ \t]+|>[ \t]?|`{3,}|~{3,})| {0,3}(?:[-*_][ \t]*){3,})/m.test(
    markdown,
  );
}

function normalizeWrappedMarkdownTables(markdown) {
  const lines = markdown.split("\n");
  const normalizedLines = [];
  let index = 0;

  while (index < lines.length) {
    if (isMarkdownFenceStart(lines[index])) {
      const fencedBlock = collectMarkdownFence(lines, index);
      normalizedLines.push(...fencedBlock.lines);
      index = fencedBlock.nextIndex;
      continue;
    }

    if (!isMarkdownTableHeaderAt(lines, index)) {
      normalizedLines.push(lines[index]);
      index += 1;
      continue;
    }

    const headerLine = lines[index];
    const separatorLine = lines[index + 1];
    const columnCount = parseMarkdownTableCells(headerLine).length;
    normalizedLines.push(headerLine, separatorLine);
    index += 2;

    while (index < lines.length) {
      const firstRowLine = lines[index];
      if (firstRowLine.trim() === "" || isMarkdownFenceStart(firstRowLine)) {
        break;
      }

      if (!firstRowLine.includes("|")) {
        break;
      }

      let logicalRow = "";
      let physicalLineCount = 0;

      while (index < lines.length) {
        const currentLine = lines[index];
        const nextLine = lines[index + 1] ?? "";
        const hasStartedRow = physicalLineCount > 0;

        if (currentLine.trim() === "") {
          break;
        }

        if (
          hasStartedRow &&
          currentLine.trim().startsWith("|") &&
          isLogicalMarkdownTableRowComplete(
            logicalRow,
            physicalLineCount,
            currentLine,
            columnCount,
          )
        ) {
          break;
        }

        if (!hasStartedRow && !currentLine.includes("|")) {
          break;
        }

        logicalRow = appendWrappedMarkdownTableLine(logicalRow, currentLine);
        physicalLineCount += 1;
        index += 1;

        if (
          isLogicalMarkdownTableRowComplete(
            logicalRow,
            physicalLineCount,
            nextLine,
            columnCount,
          )
        ) {
          break;
        }
      }

      if (!logicalRow) {
        break;
      }

      normalizedLines.push(logicalRow);
    }
  }

  return normalizedLines.join("\n");
}

function isMarkdownTableHeaderAt(lines, index) {
  return (
    index + 1 < lines.length &&
    lines[index].includes("|") &&
    isMarkdownTableSeparatorLine(lines[index + 1])
  );
}

function isMarkdownTableSeparatorLine(line) {
  return (
    line.includes("|") &&
    /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line)
  );
}

function appendWrappedMarkdownTableLine(logicalRow, line) {
  const normalizedLine = line.trim();
  return logicalRow ? `${logicalRow}<br>${normalizedLine}` : normalizedLine;
}

function isLogicalMarkdownTableRowComplete(
  logicalRow,
  physicalLineCount,
  nextLine,
  columnCount,
) {
  const cells = parseMarkdownTableCells(logicalRow);
  if (cells.length < columnCount) {
    return false;
  }

  if (logicalRow.trim().endsWith("|")) {
    return true;
  }

  const trimmedNextLine = nextLine.trim();
  if (trimmedNextLine === "" || isMarkdownFenceStart(trimmedNextLine)) {
    return true;
  }

  if (physicalLineCount === 1 && trimmedNextLine.startsWith("|")) {
    return true;
  }

  return false;
}

function parseMarkdownTableCells(line) {
  const trimmed = String(line).trim();
  const withoutLeadingPipe = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const content = withoutLeadingPipe.endsWith("|")
    ? withoutLeadingPipe.slice(0, -1)
    : withoutLeadingPipe;
  const cells = [];
  let currentCell = "";

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === "\\" && content[index + 1] === "|") {
      currentCell += "|";
      index += 1;
      continue;
    }

    if (character === "|") {
      cells.push(currentCell.trim());
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  cells.push(currentCell.trim());
  return cells;
}

function isMarkdownFenceStart(line) {
  return /^ {0,3}(`{3,}|~{3,})/.test(String(line));
}

function collectMarkdownFence(lines, startIndex) {
  const startLine = lines[startIndex];
  const fenceMatch = startLine.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!fenceMatch) {
    return { lines: [startLine], nextIndex: startIndex + 1 };
  }

  const fence = fenceMatch[1];
  const fenceCharacter = fence[0];
  const fenceLength = fence.length;
  const fencedLines = [startLine];
  let index = startIndex + 1;

  while (index < lines.length) {
    fencedLines.push(lines[index]);
    if (
      new RegExp(`^ {0,3}${escapeRegExp(fenceCharacter)}{${fenceLength},}\\s*$`).test(
        lines[index],
      )
    ) {
      index += 1;
      break;
    }
    index += 1;
  }

  return { lines: fencedLines, nextIndex: index };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasVisibleTextSelection() {
  const selection = window.getSelection();
  return Boolean(selection && !selection.isCollapsed && selection.toString());
}

function selectAllBlocks(editor) {
  if (editor.document.length === 0) {
    return;
  }

  selectAllEditorDocument(editor);
  if (hasVisibleTextSelection()) {
    return;
  }

  try {
    editor.focus();
    editor.setSelection(editor.document[0], editor.document[editor.document.length - 1]);
  } catch {
    // Some block types only support the ProseMirror whole-document selection above.
  }
}

function selectCurrentCodeBlockContent(editor) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  if (!view || !state || !state.selection.$from.parent.type.spec.code) {
    return false;
  }

  const codeBlockStart = state.selection.$from.start();
  const codeBlockEnd = state.selection.$from.end();
  const codeBlockSelection = TextSelection.between(
    state.doc.resolve(codeBlockStart),
    state.doc.resolve(codeBlockEnd),
  );
  view.dispatch(
    state.tr
      .setSelection(codeBlockSelection)
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

function selectCurrentTableCell(editor) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  const cellRange = getCurrentTableCellRange(state?.selection);
  if (!view || !state || !cellRange) {
    return false;
  }

  view.dispatch(
    state.tr
      .setSelection(CellSelection.create(state.doc, cellRange.cellPos))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

function selectCurrentTableCellContent(editor) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  const cellRange = getCurrentTableCellRange(state?.selection);
  if (!view || !state || !cellRange) {
    return false;
  }

  view.dispatch(
    state.tr
      .setSelection(TextSelection.between(
        state.doc.resolve(cellRange.from),
        state.doc.resolve(cellRange.to),
      ))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

function isCurrentTableCellContentSelected(editor, cellRange) {
  const selectedText = window.getSelection()?.toString() ?? "";
  const cellNode = editor.prosemirrorView?.nodeDOM(cellRange.cellPos);
  const cellElement = cellNode instanceof Element
    ? cellNode.closest("td, th")
    : cellNode?.parentElement?.closest("td, th");
  return Boolean(selectedText && selectedText === cellElement?.textContent);
}

function selectCurrentTable(editor) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  const cellPositions = getCurrentTableCellPositions(state?.selection);
  if (!view || !state || cellPositions.length === 0) {
    return false;
  }

  view.dispatch(
    state.tr
      .setSelection(CellSelection.create(
        state.doc,
        cellPositions[0],
        cellPositions[cellPositions.length - 1],
      ))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

function isCurrentTableSelection(editor) {
  const selection = editor.prosemirrorView?.state.selection;
  return Boolean(selection?.$anchorCell && selection?.$headCell);
}

function isCurrentTableFullySelected(editor) {
  const selection = editor.prosemirrorView?.state.selection;
  const cellPositions = getCurrentTableCellPositions(selection);
  return Boolean(
    selection?.$anchorCell &&
      selection?.$headCell &&
      cellPositions.length > 0 &&
      selection.$anchorCell.pos === cellPositions[0] &&
      selection.$headCell.pos === cellPositions[cellPositions.length - 1],
  );
}

function moveTableTextCursorToAdjacentCell(editor, direction) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  const currentCellRange = getCurrentTableCellRange(state?.selection);
  if (!view || !state || !currentCellRange) {
    return false;
  }

  const cellPositions = getCurrentTableCellPositions(state.selection);
  const currentIndex = cellPositions.indexOf(currentCellRange.cellPos);
  const nextCellPosition = cellPositions[currentIndex + direction];
  if (currentIndex < 0 || typeof nextCellPosition !== "number") {
    return false;
  }

  const nextCellRange = getCurrentTableCellRange({
    $from: state.doc.resolve(nextCellPosition + 1),
  });
  if (!nextCellRange) {
    return false;
  }

  view.dispatch(
    state.tr
      .setSelection(TextSelection.near(state.doc.resolve(nextCellRange.to), -1))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

function getCurrentTableCellPositions(selection) {
  const $from = selection?.$from;
  if (!$from) {
    return [];
  }

  let tableDepth = null;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.spec.tableRole === "table") {
      tableDepth = depth;
      break;
    }
  }
  if (tableDepth === null) {
    return [];
  }

  const tablePosition = $from.before(tableDepth);
  const cellPositions = [];
  $from.node(tableDepth).descendants((node, position) => {
    const tableRole = node.type.spec.tableRole;
    if (tableRole === "cell" || tableRole === "header_cell") {
      cellPositions.push(tablePosition + position + 1);
    }
  });
  return cellPositions;
}

function moveSelectedTableCell(editor, key) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  const selection = state?.selection;
  const anchorCell = selection?.$anchorCell;
  const headCell = selection?.$headCell;
  if (
    !view ||
    !state ||
    !anchorCell ||
    !headCell ||
    anchorCell.pos !== headCell.pos
  ) {
    return false;
  }

  const currentNode = view.nodeDOM(anchorCell.pos);
  const currentCell = (currentNode instanceof Element ? currentNode : currentNode?.parentElement)
    ?.closest("td, th");
  const currentRow = currentCell?.parentElement;
  const table = currentCell?.closest("table");
  if (!currentCell || !currentRow || !table) {
    return false;
  }

  const rows = [...table.rows];
  const rowIndex = rows.indexOf(currentRow);
  const cellIndex = [...currentRow.cells].indexOf(currentCell);
  let targetCell = null;
  if (key === "ArrowLeft") {
    targetCell = currentRow.cells[cellIndex - 1] || null;
  } else if (key === "ArrowRight") {
    targetCell = currentRow.cells[cellIndex + 1] || null;
  } else {
    const targetRow = rows[rowIndex + (key === "ArrowUp" ? -1 : 1)];
    targetCell = targetRow?.cells[Math.min(cellIndex, targetRow.cells.length - 1)] || null;
  }
  if (!targetCell) {
    return false;
  }

  const targetPosition = view.posAtDOM(targetCell, 0);
  const targetRange = getCurrentTableCellRange({
    $from: state.doc.resolve(targetPosition),
  });
  if (!targetRange) {
    return false;
  }

  view.dispatch(
    state.tr
      .setSelection(CellSelection.create(state.doc, targetRange.cellPos))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

function getCurrentTableCellRange(selection) {
  if (!selection) {
    return null;
  }

  const cellAnchor = selection.$anchorCell;
  if (cellAnchor?.nodeAfter?.type.spec.tableRole) {
    const cellNode = cellAnchor.nodeAfter;
    return {
      from: cellAnchor.pos + 1,
      to: cellAnchor.pos + cellNode.nodeSize - 1,
      cellPos: cellAnchor.pos,
    };
  }

  const { $from } = selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const tableRole = $from.node(depth).type.spec.tableRole;
    if (tableRole === "cell" || tableRole === "header_cell") {
      return {
        from: $from.start(depth),
        to: $from.end(depth),
        cellPos: $from.before(depth),
      };
    }
  }

  return null;
}

function getFocusedTableCellSnapshot(editor) {
  const view = editor.prosemirrorView;
  const selection = view?.state.selection;
  const cellRange = getCurrentTableCellRange(selection);
  if (!view || !selection?.empty || !cellRange) {
    return null;
  }

  const cellNode = view.nodeDOM(cellRange.cellPos);
  const cell = (cellNode instanceof Element ? cellNode : cellNode?.parentElement)
    ?.closest("td, th");
  const row = cell?.parentElement;
  const table = cell?.closest("table");
  const block = cell?.closest(".bn-block-outer[data-id]");
  if (!(row instanceof HTMLTableRowElement) || !table || !block?.dataset.id) {
    return null;
  }

  const rowIndex = Array.prototype.indexOf.call(table.rows, row);
  if (rowIndex < 0 || cell.cellIndex < 0) {
    return null;
  }

  return {
    blockId: block.dataset.id,
    rowIndex,
    columnIndex: cell.cellIndex,
  };
}

function restoreFocusedTableCell(editor, snapshot) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  if (!view || !state) {
    return false;
  }

  const targetCell = getTableCellElementForSnapshot(editor, snapshot);
  if (!targetCell) {
    return false;
  }

  const cellPosition = view.posAtDOM(targetCell, 0);
  const cellRange = getCurrentTableCellRange({
    $from: state.doc.resolve(cellPosition),
  });
  if (!cellRange) {
    return false;
  }

  view.dispatch(
    state.tr
      .setSelection(TextSelection.near(state.doc.resolve(cellRange.to), -1))
      .scrollIntoView(),
  );
  view.focus();
  return true;
}

function getTableCellElementForSnapshot(editor, snapshot) {
  const block = editor.prosemirrorView?.dom.querySelector(
    `.bn-block-outer[data-id="${CSS.escape(snapshot.blockId)}"]`,
  );
  const cell = block?.querySelector("table")?.rows[snapshot.rowIndex]
    ?.cells[snapshot.columnIndex];
  return cell instanceof HTMLTableCellElement ? cell : null;
}

function selectAllEditorDocument(editor) {
  const view = editor.prosemirrorView;
  const state = view?.state;
  if (!view || !state) {
    return;
  }

  const wholeTextSelection = TextSelection.between(
    state.doc.resolve(0),
    state.doc.resolve(state.doc.content.size),
  );

  view.dispatch(
    state.tr
      .setSelection(wholeTextSelection)
      .scrollIntoView(),
  );
  view.focus();
}

function getNodeSelectedBlocks(editor) {
  const view = editor.prosemirrorView;
  const selection = view?.state.selection;
  if (!view || !selection) {
    return [];
  }

  let blockId = null;
  if ("node" in selection) {
    const selectedElement = view.nodeDOM(selection.from);
    const blockElement = (
      selectedElement instanceof Element
        ? selectedElement
        : selectedElement?.parentElement
    )?.closest?.(".bn-block-outer[data-id]");
    blockId = blockElement?.getAttribute("data-id");
  }
  if (!blockId && selection.empty) {
    blockId = view.dom.getAttribute("data-notepane-handle-block-id");
  }
  const block = blockId ? findBlockById(editor.document, blockId) : null;
  return block ? [block] : [];
}

function getBlocksForClipboard(editor) {
  const nodeSelectedBlocks = getNodeSelectedBlocks(editor);
  if (nodeSelectedBlocks.length) {
    return nodeSelectedBlocks;
  }

  const selection = editor.prosemirrorView?.state.selection;
  if (selection?.toJSON().type === "notepane-block-range") {
    const blocks = [];
    editor.prosemirrorView.state.doc.nodesBetween(selection.from, selection.to, (node) => {
      if (node.type.name !== "blockContainer") return;
      const block = findBlockById(editor.document, node.attrs.id);
      if (block) blocks.push(block);
      return false;
    });
    return blocks;
  }
  if (selection?.$anchorCell || selection?.$headCell) {
    return [];
  }

  const selectedBlocks = editor.getSelection()?.blocks;
  return selectedBlocks?.length > 1 ? selectedBlocks : [];
}

function isEmptyEditorSurfacePointer(event) {
  if (event.button !== 0) {
    return false;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }

  if (
    target.closest(
      [
        ".bn-block-outer",
        ".bn-side-menu",
        ".bn-table-handle",
        ".bn-table-cell-handle",
        ".bn-formatting-toolbar",
        "[role='toolbar']",
        "[role='listbox']",
        "button",
        "input",
        "textarea",
        "select",
        "a",
      ].join(", "),
    )
  ) {
    return false;
  }

  return Boolean(target.closest("[data-testid='sticky-editor-surface']"));
}

function isBlankTableSurfacePointer(event) {
  if (event.button !== 0 || !(event.target instanceof Element)) {
    return false;
  }

  return Boolean(
    event.target.closest("table") && !event.target.closest("td, th"),
  );
}

function isEmptySessionDocument(blocks) {
  return Array.isArray(blocks) && blocks.length === 1 && isEmptyParagraphBlock(blocks[0]);
}

function isEmptyParagraphBlock(block) {
  if (block?.type !== "paragraph" || block.children?.length > 0) {
    return false;
  }

  if (block.content == null) {
    return true;
  }

  if (typeof block.content === "string") {
    return block.content.trim().length === 0;
  }

  return Array.isArray(block.content) && block.content.every(
    (item) => item?.type === "text" && !item.text?.trim(),
  );
}

function focusLastEditorBlock(editor) {
  const lastBlock = editor.document.at(-1);
  if (lastBlock && isEmptyParagraphBlock(lastBlock)) {
    editor.focus();
    editor.setTextCursorPosition(lastBlock, "start");
    return;
  }

  editor.focus();
  const insertedBlocks = lastBlock
    ? editor.insertBlocks([{ type: "paragraph" }], lastBlock.id, "after")
    : editor.replaceBlocks([], [{ type: "paragraph" }]).insertedBlocks;
  const insertedBlock = insertedBlocks?.[0];
  if (insertedBlock) {
    editor.setTextCursorPosition(insertedBlock, "start");
    return;
  }

  if (!lastBlock) {
    editor.focus();
    return;
  }

  try {
    editor.setTextCursorPosition(lastBlock, "end");
    return;
  } catch {
    // Non-text blocks can reject text cursor placement.
  }

  try {
    editor.setTextCursorPosition(lastBlock, "start");
    return;
  } catch {
    // Some media/table blocks cannot receive a text cursor.
  }

  try {
    editor.setSelection(lastBlock, lastBlock);
  } catch {
    // Final fallback: keep editor focused even if block selection is unavailable.
  }
}

async function cutCurrentBlocks(editor, activeImageBlockId, scheduleSave) {
  const blocks = resolveBlocksForCut(editor, activeImageBlockId);
  if (blocks.length === 0) {
    return;
  }

  try {
    const markdown = await editor.blocksToMarkdownLossy(blocks);
    await navigator.clipboard?.writeText(markdown);
  } catch {
    // Clipboard write is best-effort; the block removal should still happen.
  }

  const topLevelIds = new Set(editor.document.map((block) => block.id));
  const topLevelBlocks = blocks.filter((block) => topLevelIds.has(block.id));
  const removesEveryTopLevelBlock = topLevelBlocks.length === editor.document.length;

  if (removesEveryTopLevelBlock) {
    const { insertedBlocks } = editor.replaceBlocks(editor.document, [
      { type: "paragraph" },
    ]);
    editor.setTextCursorPosition(insertedBlocks[0], "start");
    scheduleSave();
    return;
  }

  const firstTopLevelIndex = editor.document.findIndex(
    (block) => block.id === topLevelBlocks[0]?.id,
  );
  const nextCursorBlock =
    firstTopLevelIndex >= 0
      ? editor.document[firstTopLevelIndex + topLevelBlocks.length] ||
        editor.document[firstTopLevelIndex - 1]
      : null;

  editor.removeBlocks(blocks);
  if (nextCursorBlock) {
    editor.setTextCursorPosition(nextCursorBlock, "start");
  } else if (editor.document[0]) {
    editor.setTextCursorPosition(editor.document[0], "start");
  }
  scheduleSave();
}

function resolveBlocksForCut(editor, activeImageBlockId) {
  const selectedBlocks = editor.getSelection()?.blocks;
  if (selectedBlocks?.length) {
    return selectedBlocks;
  }

  const nodeSelectedBlocks = getNodeSelectedBlocks(editor);
  if (nodeSelectedBlocks.length) {
    return nodeSelectedBlocks;
  }

  const activeImageBlock = findBlockById(editor.document, activeImageBlockId);
  if (activeImageBlock) {
    return [activeImageBlock];
  }

  try {
    return [editor.getTextCursorPosition().block];
  } catch {
    return [];
  }
}

function extractTableOfContentsEntries(blocks) {
  const entries = [];

  collectBlocks(blocks, (block) => {
    if (block?.type !== "heading" || !block.id) {
      return;
    }

    const title = extractBlockPlainText(block.content).trim();
    if (!title) {
      return;
    }

    entries.push({
      id: block.id,
      title,
      level: getHeadingLevel(block),
    });
  });

  return entries;
}

function extractBlockPlainText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(extractBlockPlainText).join("");
  }

  if (content && typeof content === "object") {
    if (typeof content.text === "string") {
      return content.text;
    }

    if (Array.isArray(content.rows)) {
      return content.rows
        .flatMap((row) => Array.isArray(row?.cells) ? row.cells : [])
        .map(extractBlockPlainText)
        .find((text) => text.trim()) ?? "";
    }

    return extractBlockPlainText(content.content);
  }

  return "";
}

function getHeadingLevel(block) {
  const level = Number(
    block?.props?.level ??
      block?.props?.headingLevel ??
      block?.props?.depth ??
      1,
  );

  return clamp(Math.round(level), 1, 4, 1);
}

function scrollEditorBlockIntoView(blockId) {
  const blockElement = getEditorBlockElement(blockId);
  blockElement?.scrollIntoView({
    block: "start",
    inline: "nearest",
    behavior: "smooth",
  });
}

function getEditorBlockElement(blockId) {
  if (!blockId) {
    return null;
  }

  const escapedBlockId =
    window.CSS?.escape?.(blockId) ?? String(blockId).replace(/["'\\]/g, "\\$&");
  const selectors = [
    `[data-id="${escapedBlockId}"]`,
    `[data-block-id="${escapedBlockId}"]`,
    `#${escapedBlockId}`,
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const blockElement = element?.closest?.(".bn-block-outer") ?? element;
    if (blockElement) {
      return blockElement;
    }
  }

  return null;
}

function findBlockById(blocks, blockId) {
  if (!blockId) {
    return null;
  }

  for (const block of blocks) {
    if (block.id === blockId) {
      return block;
    }

    const childBlock = findBlockById(block.children || [], blockId);
    if (childBlock) {
      return childBlock;
    }
  }

  return null;
}

function findImageBlockBySource(blocks, sourceUrl) {
  const imageBlocks = [];
  collectBlocks(blocks, (block) => {
    if (block.type === "image" && block.props?.url) {
      imageBlocks.push(block);
    }
  });

  return (
    imageBlocks.find((block) => urlsMatch(block.props.url, sourceUrl)) ||
    (imageBlocks.length === 1 ? imageBlocks[0] : null)
  );
}

function collectBlocks(blocks, callback) {
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block) {
      continue;
    }

    callback(block);
    collectBlocks(block.children || [], callback);
  }
}

function urlsMatch(left, right) {
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  try {
    return new URL(left, window.location.href).href === new URL(right, window.location.href).href;
  } catch {
    return false;
  }
}

function imageFileName(name, url) {
  const fallbackExtension = extensionFromSource(url);
  const sourceName =
    name ||
    (() => {
      try {
        const pathname = new URL(url, window.location.href).pathname;
        return decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
      } catch {
        return "";
      }
    })() ||
    `image.${fallbackExtension}`;

  const sanitized = sourceName
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return /\.[a-z0-9]{2,5}$/i.test(sanitized)
    ? sanitized
    : `${sanitized || "image"}.${fallbackExtension}`;
}

function ensurePngName(name) {
  return name.replace(/\.[a-z0-9]{2,5}$/i, "") + ".png";
}

function extensionFromSource(source) {
  if (/^data:image\/jpeg/i.test(source)) {
    return "jpg";
  }
  if (/^data:image\/gif/i.test(source)) {
    return "gif";
  }
  if (/^data:image\/webp/i.test(source)) {
    return "webp";
  }
  if (/\.(jpe?g)(?:[?#]|$)/i.test(source)) {
    return "jpg";
  }
  if (/\.(gif)(?:[?#]|$)/i.test(source)) {
    return "gif";
  }
  if (/\.(webp)(?:[?#]|$)/i.test(source)) {
    return "webp";
  }
  return "png";
}

function downloadInBrowser(url, fileName) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noreferrer";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function preventFocusLoss(event) {
  event.preventDefault();
}

function getStoredImageCrop(props = {}) {
  const crop = {
    x: props.cropX,
    y: props.cropY,
    width: props.cropWidth,
    height: props.cropHeight,
  };
  return Object.values(crop).every(Number.isFinite)
    ? normalizeCrop(crop)
    : { ...DEFAULT_CROP };
}

function normalizeCrop(crop = DEFAULT_CROP) {
  const x = clamp(Number(crop.x), 0, 1 - MIN_CROP_SIZE, DEFAULT_CROP.x);
  const y = clamp(Number(crop.y), 0, 1 - MIN_CROP_SIZE, DEFAULT_CROP.y);
  const width = clamp(
    Number(crop.width),
    MIN_CROP_SIZE,
    1 - x,
    DEFAULT_CROP.width,
  );
  const height = clamp(
    Number(crop.height),
    MIN_CROP_SIZE,
    1 - y,
    DEFAULT_CROP.height,
  );
  return { x, y, width, height };
}

function resizeCrop({ crop, handle }, point) {
  let left = crop.x;
  let top = crop.y;
  let right = crop.x + crop.width;
  let bottom = crop.y + crop.height;

  if (handle.includes("w")) {
    left = clamp(point.x, 0, right - MIN_CROP_SIZE, left);
  }
  if (handle.includes("e")) {
    right = clamp(point.x, left + MIN_CROP_SIZE, 1, right);
  }
  if (handle.includes("n")) {
    top = clamp(point.y, 0, bottom - MIN_CROP_SIZE, top);
  }
  if (handle.includes("s")) {
    bottom = clamp(point.y, top + MIN_CROP_SIZE, 1, bottom);
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

function moveCrop({ crop, point: startPoint }, point) {
  return {
    ...crop,
    x: clamp(point.x - startPoint.x + crop.x, 0, 1 - crop.width, crop.x),
    y: clamp(point.y - startPoint.y + crop.y, 0, 1 - crop.height, crop.y),
  };
}

function getImagePoint(event, image) {
  if (!image) {
    return null;
  }

  const rect = image.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return {
    x: clamp((event.clientX - rect.left) / rect.width, 0, 1, 0),
    y: clamp((event.clientY - rect.top) / rect.height, 0, 1, 0),
  };
}

async function cropImageToPng(image, crop) {
  await waitForImage(image);

  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const sx = Math.floor(crop.x * sourceWidth);
  const sy = Math.floor(crop.y * sourceHeight);
  const sw = Math.max(1, Math.floor(crop.width * sourceWidth));
  const sh = Math.max(1, Math.floor(crop.height * sourceHeight));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const context = canvas.getContext("2d");
  context.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas.toDataURL("image/png");
}

function waitForImage(image) {
  if (!image) {
    return Promise.reject(new Error("No image selected."));
  }

  if (image.complete && image.naturalWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("Image could not be loaded for cropping.")),
      { once: true },
    );
  });
}

function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Could not read selected file."));
    });
    reader.readAsDataURL(file);
  });
}

createRoot(document.getElementById("root")).render(<App />);
