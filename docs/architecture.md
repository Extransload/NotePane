# Architecture

## Stack

- Electron for desktop windows
- React for the renderer
- BlockNote for the editor
- Vite for renderer build
- Local JSON file for persistence

## Runtime split

| Layer | Responsibility |
| --- | --- |
| `electron/main.cjs` | app lifecycle, tab/sticky window orchestration, native menu, note/session create/activate/delete/detach/attach IPC, export/download IPC |
| `electron/store.cjs` | local JSON persistence |
| `electron/preload.cjs` | safe renderer bridge |
| `src/main.jsx` | composition only: the `App` shell and the `StickyEditor` component that wires everything below together |
| `src/styles.css` | ordered `@import` list for `src/styles/` |

## Code map

Renderer code is grouped by what it owns. Start here rather than reading `src/main.jsx` end to end.

| Directory | Owns | Notable files |
| --- | --- | --- |
| `src/` | entry point and shared constants | `main.jsx`, `constants.js` |
| `src/editor/` | editor engine and editor behaviour, independent of React state | `schema.jsx`, `selection.js`, `blocks.js`, `clipboard.js`, `images.js` |
| `src/model/` | normalising and deriving stored data | `notes.js`, `preferences.js`, `keyboardShortcuts.js` |
| `src/style/` | colour maths and computed inline styles | `colorMath.js`, `themeStyles.js` |
| `src/ui/` | presentational React components | `icons.jsx`, `controls.jsx`, `preferencesWindow.jsx`, `CropDialog.jsx` |
| `src/hooks/` | stateful behaviour lifted out of `StickyEditor` | `useNotePersistence.js`, `useEditorSurfaceShortcuts.js` |
| `src/utils/` | small generic helpers | `values.js`, `dom.js`, `sessionTabAnimation.js` |
| `src/styles/` | stylesheets, imported in cascade order | `tokens.css`, `chrome.css`, `blocknote.css` |

### Where behaviour lives

| To change this | Look here |
| --- | --- |
| Block schema, template content, custom blocks | `src/editor/schema.jsx` |
| Text selection, table cell selection and navigation | `src/editor/selection.js` |
| Block lookup, cut, table of contents extraction | `src/editor/blocks.js` |
| Copy/paste normalisation and Markdown round-tripping | `src/editor/clipboard.js` |
| Which element counts as an editor shortcut target | `src/editor/targets.js` |
| BlockNote floating menu positioning and clamping | `src/editor/floatingMenus.js` |
| Image download, crop geometry, upload | `src/editor/images.js` |
| Code block language detection and prettifying | `src/editor/codeFormatting.js` |
| Note titles, ordering, trash previews | `src/model/notes.js` |
| Preference and font normalisation and defaults | `src/model/preferences.js` |
| Shortcut parsing, matching, display labels | `src/model/keyboardShortcuts.js` |
| Sticky shell and session tab computed styles | `src/style/themeStyles.js` |
| Colour conversion and contrast | `src/style/colorMath.js` |
| Saving, debouncing, version snapshots | `src/hooks/useNotePersistence.js` |
| Keys handled on the editor surface | `src/hooks/useEditorSurfaceShortcuts.js` |
| Window, session and tab-mode keyboard commands | `src/hooks/useKeyboardCommands.js` |
| Session tab drag and drop | `src/hooks/useSessionTabDrag.js` |
| Export and font-size toasts | `src/hooks/useStickyToasts.js` |

`src/main.jsx` keeps only `App` (session list, theme and layout state, IPC subscriptions) and `StickyEditor`
(editor instance, the remaining per-note state, and the rendered tree). A new non-trivial behaviour belongs in a
module above, not in `main.jsx`.

### Stylesheets

`src/styles.css` contains nothing but `@import` lines. Later files intentionally override earlier ones, so the import
order is part of the contract and must not be rearranged. The built stylesheet is byte-identical to the previous single
file.

### Reference check

`npm run check:refs` parses every file under `src/` and fails on an identifier that is referenced but never declared,
imported, or provided by the runtime. It runs in about a second and catches an import dropped during a refactor long
before the browser suites would. It is the first step of both `verify:quick` and `verify`.

The renderer owns editor behavior. The desktop shell does not override BlockNote keyboard or mouse behavior.

## Persistence flow

1. BlockNote emits `onChange`.
2. Renderer serializes `editor.document` to `blocksJSON`.
3. Renderer also stores a lossy markdown fallback.
4. IPC sends the payload to Electron main.
5. `StickyStore` writes `notes.json` atomically.

Appearance changes use a separate IPC path and persist the note title, optional sidebar tab accent color/opacity, and
per-note editor typography in the matching local JSON note record. Light/Dark mode is app-wide state and is persisted
separately at the root of `notes.json` as `appTheme.mode`. Layout mode is also app-wide and is stored as root
`layoutMode`.

The renderer keeps a built-in font list for browser preview mode. In Electron, the preload bridge exposes `fonts:list`;
the main process reads macOS installed font families through `system_profiler SPFontsDataType`, caches the result, and
returns family names only. Windows and other unsupported platforms use the built-in font list only. Installed fonts are stored as `local:<font family>` so the setting can survive app restart
without copying font files into the app.

Editor defaults are app-wide preferences stored at `editorPreferences` in `notes.json`. New sessions copy those defaults
into their own per-note typography fields at creation time; changing defaults does not mutate existing sessions.

Sidebar session changes use note list/create/activate/delete/detach/attach IPC calls. Activating a session changes the note bound to
the current window, then remounts the BlockNote editor with that note's stored document. Deleting the active session
switches the current window to the next remaining session. The final remaining session cannot be deleted.

## Window model

The app supports two layout modes.

- Default size: `960 x 720`
- Minimum size: `640 x 500`
- `alwaysOnTop` defaults to `false`
- transparent window background for native note transparency
- Bounds are saved on move/resize/close
- Tab session mode keeps one primary tabs window for docked sessions
- Sticky mode opens every session as its own compact sticky-note window when entering the mode
- Sticky mode arranges note windows in a small grid using the current primary display work area
- Closing an individual sticky window records it as manually closed and does not immediately recreate it
- Show All NotePanes clears manually closed sticky windows and opens every note window again
- `Command/Ctrl + T` creates a new sidebar session tab; `Command/Ctrl + N` remains available for new note/session
- The dashed `+` directly under the last sidebar session tab creates a new note/session in the current tabs window
- Dragging a sidebar tab outside the sidebar detaches it into a separate window
- A detached sticky window can be docked back into the tabs window
- Sidebar tab close appears only on row hover and deletes a note/session when more than one session exists
- `Command/Ctrl + 1` through `Command/Ctrl + 9` activates the matching sidebar session
- `Command/Ctrl + Option/Alt + Left/Right` activates the previous/next sidebar session and wraps at the ends
- `Command/Ctrl + W` deletes the current sidebar session in tab session mode instead of closing the primary window
- Sidebar tab double-click starts inline rename

## BlockNote configuration

The renderer uses:

- `BlockNoteView`
- default BlockNote UI
- `portalElements={{ default: document.body }}`
- code block extension from `@blocknote/code-block`
- advanced table options
- data URL file uploads for local persistence

## Export and media

- Export is opened from one icon and then chooses PNG or PDF.
- PNG export captures the visible editor surface with Electron `capturePage`.
- PDF export uses Electron `printToPDF` with print CSS that hides app chrome.
- Both export paths temporarily remove app chrome/background styling so the exported content has no NotePane shell background.
- Image download is handled in Electron main so `data:`, `file:`, and `http(s):` image URLs can be saved through the native save dialog.
- Image crop is renderer-side canvas processing and updates the selected image block to a cropped PNG data URL.

## Theme mode and Preferences panel

The app theme is intentionally limited to a Notion-style binary mode:

- `light`
- `dark`

The Light/Dark mode drives the shell, header, sidebar, editor surface, BlockNote theme, text, code background, code
text, menus, image tools, and crop dialog through CSS tokens. Full-window custom background colors are deliberately
not supported because they conflict with editor-level colors such as text color, code background, code text, and user
authored inline colors.

Light/Dark mode is global for the whole app. Switching sidebar sessions or opening another sticky window does not
change the mode; all windows receive the same app theme via Electron IPC.

Session tab backgrounds can use each session's accent color. Active, inactive, and hover backgrounds are derived from
that accent plus the current Light/Dark mode. The title text color is calculated from the effective background so the
tab remains readable in both modes.

Light/Dark mode is changed through Preferences or `Command/Ctrl + Shift + L`; the app-wide shortcut/menu state remains global.
Tab and Sticky mode do not expose a persistent Light/Dark switch in the primary chrome.

The Preferences panel is opened from the sidebar footer button, native app menu, or `Command/Ctrl + ,` and keeps app-wide/default settings:

- Light/Dark app theme
- default editor font family and size for newly created sessions
- keyboard shortcut reference

Session tab color is a per-session setting opened from each session tab's right-click context menu:

- circular hue/saturation wheel
- brightness/value slider that remains unchanged when hue/saturation changes
- opacity slider for the sidebar tab accent alpha channel
- eyedropper integration through the browser `EyeDropper` API when available
- editable HEX/HSL/RGB/LCH fields
- HEX/HSL/RGB/LCH copy buttons

The selected or typed accent color is parsed back into the target session's `theme.tabTextColor`.
The opacity slider is parsed back into the target session's `theme.tabTextOpacity`.
Sticky-mode settings use the same fields for the sticky background, so returning to Tab session mode
keeps the selected color/opacity on that session tab.

## Sticky chrome boundary

Sticky styling is applied outside the BlockNote editor:

- `.sticky-header` has no title text in tab session mode.
- `.sticky-header` contains editable title in sticky mode.
- `.sticky-header` contains the sidebar toggle or title, drag strip, and mode-specific action controls.
- Sticky mode uses a shorter header.
- The sticky header exposes a gear button that opens per-sticky window settings for background color/opacity, pinning, layout, and editor controls.
- Sticky mode calculates text, border, code, and table colors from the current sticky background to keep contrast readable.
- The session tab context menu exposes per-tab color/opacity settings in Tab session mode.
- The export control uses a share-style icon and opens PNG/PDF choices.
- `.sticky-header` is the only drag region.
- `.sticky-editor-surface` is explicitly `no-drag`.
- Sidebar controls, header toggle, and image tools are explicitly `no-drag`.
- Clickable controls use pointer cursor, small hover animation, and delayed shortcut tooltips.
- BlockNote floating UI still portals to `document.body`.
- BlockNote block internals are not restyled.
