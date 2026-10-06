# Note Search Design

## Goal

Let a user find which note holds some text and land on that text. Today NotePane has no search: no cross-note
search and no find inside a note.

## Scope

- `Mod+P` opens a note search palette over every active note (titles and bodies). Choosing a result opens that note
  with the find bar prefilled and the first match selected.
- `Mod+F` opens a find bar for the current note with highlighted matches and next/previous navigation.
- Matching is case-insensitive substring matching after Unicode NFC normalization, so decomposed (NFD) Hangul matches
  composed Hangul.
- Out of scope: replace, regular expressions, whole-word matching, Hangul initial-consonant (chosung) search, searching
  Trash, and search history.

`Mod+K` is not used because BlockNote binds it to link insertion.

## Units

| File | Responsibility | Depends on |
| --- | --- | --- |
| `src/model/search.js` | Pure functions: `normalizeSearchText`, `markdownToPlainText`, `findMatchRanges(text, query)`, `searchNotes(notes, query, options)` returning ranked results with match count and a snippet around the first match | nothing |
| `src/editor/findInNote.js` | BlockNote extension in the `BlockDragSelection` pattern. Holds the query and current index in ProseMirror plugin state, decorates every match, marks the current match, and exposes commands to set the query, step next/previous, and reveal the current match | `model/search.js` |
| `src/hooks/useFindInNote.js` | Find bar state (open, query, `current / total`) wired to the extension, plus the open request coming from the palette or IPC | the extension |
| `src/ui/SearchPalette.jsx` | Presentational palette: input, result list, empty state | `model/search.js` for snippet highlighting |
| `src/ui/FindBar.jsx` | Presentational find bar | none |

`src/main.jsx` only composes these. Styles go in a new `src/styles/search.css`, appended to the end of the
`src/styles.css` import list so that existing rules keep their order.

## Data flow

### Note search palette

1. `Mod+P` opens the palette in the focused window. An empty query lists notes in sidebar order, so the palette also works as
   a note switcher.
2. Results come from `searchNotes` over the App's note list, which excludes Trash. The current note's body is read from
   the live editor, because its latest edits may still be waiting on the save debounce. Other notes use the text of
   their stored `blocksJSON`, which is exact and carries no image data URLs. Notes without `blocksJSON` fall back to
   their stored markdown, converted to plain text.
3. Body text keeps one block (or table cell) per line, and a match never spans two lines, so the palette and the find
   bar agree on what matches. Snippets show whitespace as single spaces.
4. Ranking: title matches first, then body-only matches. Ties keep sidebar order.
5. Choosing a result:
   - The current note: close the palette and open the find bar with the query.
   - A docked note in Tabs mode: switch through the existing `selectSidebarNote` path, which flushes pending saves.
     After the editor remounts it opens the find bar with the query.
   - A detached note, or any note in Sticky mode: call the new IPC `notes:reveal { noteId, query }`. Main finds or
     creates that note's window. That includes a sticky window the user closed by hand: main drops it from the
     manually closed set and reopens only that note. Main then focuses the window and sends it `find:open { query }`.
     A note that no longer exists returns `null` and nothing happens.
   - A find request is dropped when the switch does not land on the chosen note, or when the window it was sent to
     closes or moves to another note before taking it, so it never opens find on a later visit.

### Find bar

1. `Mod+F` opens the bar. When the editor has a non-empty single-block text selection, the bar is prefilled with that
   text. Pressing `Mod+F` while the bar is open selects the whole query input.
2. Each query change recomputes matches across the document's text nodes, grouped by text block so that a match never
   spans two blocks. Document edits remap or recompute the matches. The current index stays on the match nearest to
   the previous one: refining the query keeps the current match while it still matches, or else moves to the nearest
   match after it. Without a current match, the search starts at the caret.
3. `Enter` moves to the next match and `Shift+Enter` to the previous one, wrapping at both ends. An `Enter` that commits
   an IME composition (`isComposing` or `keyCode === 229`) is ignored.
4. Moving to a match scrolls it into view. When the match is inside a collapsed toggle, only the toggles that contain
   it are expanded. Toggles open only for a step (`Enter`, `Shift+Enter`, the buttons) or for a find opened with a
   query; while the query is typed, only a visible match is scrolled to, so a partial query never opens toggles.
5. `Escape` clears the highlights and closes the bar. If there is a current match, it becomes the editor selection so
   the user can keep typing there.

Decorations never change the document, so find does not touch undo history or trigger saves.

## UI

- **Palette:** a modal near the top center of the window, with an input and a result list. Each row shows the note title,
  the session accent dot, the match count, and a one-line snippet with the query emphasised. Arrow keys move the
  selection, `Enter` opens the selected result, and `Escape` or an outside click closes the palette. Closing returns
  focus to the editor. With no results it shows "No matching notes".
- **Find bar:** overlays the top-right corner of the editor surface and fits sticky windows down to their minimum
  width. It holds the input, a `current / total` counter, previous and next buttons, and a close button. With no
  matches it shows `0 / 0` and a warning border on the input.
- **Highlight colours:** matches get a light highlight and the current match a strong one. Both are defined as tokens
  for light and dark mode in `src/styles/tokens.css`.

## Shortcuts

Add `searchNotes: "Mod+P"` and `findInNote: "Mod+F"` to `DEFAULT_KEYBOARD_SHORTCUTS` in both `electron/store.cjs` and
`src/constants.js`. Both can be rebound or disabled in Preferences. Stored preferences that lack the new ids are filled
from the defaults by the existing normalization. When a user already bound a new default's keys to another enabled
command, the user's binding wins: the new command starts disabled instead of shadowing it.

## Testing

- **Unit** (`tests/unit/search.test.cjs`, loading the ES module with `import()`):
  - case and NFC/NFD Hangul normalization
  - markdown to plain text
  - title-first ranking with sidebar-order ties
  - snippet boundaries
  - match ranges that never overlap
- **Unit** (`tests/unit/store.test.cjs`): stored keyboard shortcuts that lack `searchNotes` and `findInNote` receive their
  defaults.
- **Renderer E2E** (new file `tests/e2e/renderer/search.spec.mjs`):
  - `Mod+F` shows the match count and highlights
  - `Enter` and `Shift+Enter` wrap around
  - `Escape` removes the highlights
  - a Korean query matches
  - an IME-committing `Enter` does not move to the next match
  - a match inside a collapsed toggle expands that toggle
  - editing updates the count
  - `Mod+P` finds text in another session, and choosing it switches the session and opens the find bar with the query
- **Electron E2E:**
  - in Sticky mode, choosing another note brings its window forward with the find bar open
  - a sticky window closed by hand is reopened by `notes:reveal`
