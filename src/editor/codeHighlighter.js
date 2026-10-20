import {
  codeBlockOptions as blockNoteCodeBlockOptions,
} from "@blocknote/code-block";

// Code blocks are highlighted with the active theme's Shiki theme (`theme.codeTheme`). BlockNote
// creates the highlighter once per window and caches it, and its parser highlights each block
// with `getLoadedThemes()[0]`. So the highlighter keeps every code theme loaded and lists the
// active one first, and a theme change re-highlights the code blocks already on screen. See
// "Code blocks" in the theme system spec.

// NotePane Light and Dark's code theme, and the fallback for a code theme that is not loaded.
export const DEFAULT_CODE_THEME = "github-dark";

// The code themes BlockNote's bundle does not load. Each is its own chunk in the build.
const CODE_THEME_LOADERS = {
  "catppuccin-latte": () => import("@shikijs/themes/catppuccin-latte"),
  "catppuccin-frappe": () => import("@shikijs/themes/catppuccin-frappe"),
  "catppuccin-macchiato": () => import("@shikijs/themes/catppuccin-macchiato"),
  "catppuccin-mocha": () => import("@shikijs/themes/catppuccin-mocha"),
  nord: () => import("@shikijs/themes/nord"),
  dracula: () => import("@shikijs/themes/dracula"),
  "tokyo-night": () => import("@shikijs/themes/tokyo-night"),
};

// Every code theme the highlighter holds: BlockNote's own two, then the loaded ones.
export const CODE_THEME_IDS = ["github-dark", "github-light", ...Object.keys(CODE_THEME_LOADERS)];

// The window theme's code theme, and the code themes that temporarily replace it while
// withCodeTheme runs (the PDF export); the latest one wins.
let windowCodeTheme = DEFAULT_CODE_THEME;
const temporaryCodeThemes = [];

// The mounted editors, and the code theme each one's code blocks were last highlighted with.
const followingEditors = new Set();
const highlightedWith = new WeakMap();

function knownCodeTheme(codeTheme) {
  return CODE_THEME_IDS.includes(codeTheme) ? codeTheme : DEFAULT_CODE_THEME;
}

export function getActiveCodeTheme() {
  return temporaryCodeThemes.at(-1) ?? windowCodeTheme;
}

/**
 * BlockNote's `createHighlighter`: its language bundle with github-dark and github-light, plus
 * every other code theme, all loaded before it resolves, so switching never waits. Each theme
 * loads on its own: one that fails (a chunk that does not load) is logged and left out, and code
 * highlights with github-dark while that theme is active, because Shiki throws on a theme it
 * lacks. Only `getLoadedThemes` is wrapped. `loaders` replaces the theme chunks in tests.
 */
export async function createNotePaneHighlighter(loaders = CODE_THEME_LOADERS) {
  const highlighter = await blockNoteCodeBlockOptions.createHighlighter();
  await Promise.all(
    Object.entries(loaders).map(async ([codeTheme, load]) => {
      try {
        await highlighter.loadTheme(load);
      } catch (error) {
        console.error(`The ${codeTheme} code theme did not load; code highlights with ${DEFAULT_CODE_THEME}.`, error);
      }
    }),
  );
  return {
    ...highlighter,
    getLoadedThemes: () => {
      const loaded = highlighter.getLoadedThemes();
      const active = loaded.includes(getActiveCodeTheme()) ? getActiveCodeTheme() : DEFAULT_CODE_THEME;
      return [active, ...loaded.filter((id) => id !== active)];
    },
  };
}

// BlockNote's code block options (languages, default language) with NotePane's highlighter.
export const codeBlockOptions = {
  ...blockNoteCodeBlockOptions,
  createHighlighter: createNotePaneHighlighter,
};

/**
 * Re-highlights `editor`'s code blocks with the active code theme. prosemirror-highlight keeps
 * the decorations of an unchanged block, so each code block is set again with its own attributes.
 * The document stays equal, so nothing is saved, and the step stays out of the undo history.
 */
export function rehighlightCodeBlocks(editor) {
  const codeTheme = getActiveCodeTheme();
  editor.transact((tr) => {
    let codeBlockCount = 0;
    tr.doc.descendants((node, position) => {
      if (node.type.name !== "codeBlock") {
        return true;
      }
      tr.setNodeMarkup(position, undefined, node.attrs);
      codeBlockCount += 1;
      return false;
    });
    // Without steps or metadata BlockNote does not dispatch the transaction.
    if (codeBlockCount > 0) {
      tr.setMeta("addToHistory", false);
    }
  });
  // Only once the transaction went through, so a failed editor is tried again next time.
  highlightedWith.set(editor, codeTheme);
}

// Re-highlights one editor if it shows another code theme. An editor that throws (its view has
// gone) is logged and skipped: the other editors still change, a mount is not broken, and
// withCodeTheme's export result or error is never replaced by it.
function rehighlightIfStale(editor) {
  const active = getActiveCodeTheme();
  if (highlightedWith.get(editor) === active) {
    return;
  }
  try {
    rehighlightCodeBlocks(editor);
  } catch (error) {
    console.error(`Code blocks could not be re-highlighted with ${active}.`, error);
  }
}

function rehighlightFollowingEditors() {
  for (const editor of followingEditors) {
    rehighlightIfStale(editor);
  }
}

/**
 * Keeps a mounted editor's code blocks in the active code theme; returns the function that stops.
 * A newly mounted editor highlights with the active theme on its own; one mounted again after a
 * theme change is re-highlighted.
 */
export function followCodeTheme(editor) {
  followingEditors.add(editor);
  if (!highlightedWith.has(editor)) {
    highlightedWith.set(editor, getActiveCodeTheme());
  } else {
    rehighlightIfStale(editor);
  }
  return () => {
    followingEditors.delete(editor);
  };
}

// Sets the window theme's code theme and re-highlights the code blocks on screen. A code theme
// the highlighter does not hold falls back to github-dark.
export function setActiveCodeTheme(codeTheme) {
  windowCodeTheme = knownCodeTheme(codeTheme);
  rehighlightFollowingEditors();
}

/**
 * Highlights code with `codeTheme` while `run` (the PDF export render) runs, then returns to the
 * window's code theme, also when `run` throws. A theme chosen meanwhile applies afterwards.
 */
export async function withCodeTheme(codeTheme, run) {
  const temporary = knownCodeTheme(codeTheme);
  temporaryCodeThemes.push(temporary);
  rehighlightFollowingEditors();
  try {
    return await run();
  } finally {
    temporaryCodeThemes.splice(temporaryCodeThemes.lastIndexOf(temporary), 1);
    rehighlightFollowingEditors();
  }
}
