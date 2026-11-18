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
| `electron/main.cjs` | app lifecycle, tab/sticky window orchestration, native menu, note/session create/activate/delete IPC, export/download IPC |
| `electron/store.cjs` | local JSON persistence |
| `electron/assetStore.cjs` | content-addressed media files under `userData/assets`, served as `notepane-asset://local/<sha256>.<ext>` |
| `electron/assetOpen.cjs` | Open from the media menu: a web address goes to the browser, anything else opens as a copy named after its block in the temp folder, limited to media files so a note cannot launch a program (`assets:open`; `assets:reveal` shows a linked local file in Finder) |
| `electron/bookmarkMetadata.cjs` | the `bookmarks:fetch-metadata` IPC behind a bookmark card: reads a public http(s) page's title, description, site name and preview image, refusing other schemes and loopback, private and link-local addresses (redirects included), within 5 s and 1 MB |
| `electron/preload.cjs` | safe renderer bridge |
| `electron/appUpdates.cjs` | update checks for a packaged app against GitHub Releases: install on quit (Windows, a Developer ID Mac build), or hand each newer release to the Mac self-updater; `checkNow()` behind the About page's `app:check-for-updates` IPC, and `compareVersions` |
| `electron/macSelfUpdate.cjs` | the ad-hoc signed Mac build updating itself as TablePeek does: download the release zip (reporting `downloading` with `downloaded` and `total` bytes every 120 ms, then `verifying`), check its SHA-512 and version, and on "Restart to update" swap the bundle in with a detached script after the app quits; IPC `app-update:get-state`, `app-update:install`, `app-update:open-release` and the `app-update:state` broadcast in `electron/main.cjs` |
| `electron-builder.config.cjs` | packaging, signing and publishing; `.github/workflows/release.yml` runs it on a version tag (see `docs/release.md`) |
| `scripts/homebrew-cask.mjs` | the Homebrew cask for a published release; `.github/workflows/homebrew.yml` pushes it to `Extransload/homebrew-tap` |
| `scripts/capture-readme-media.mjs` | the README's screenshots (`docs/images/*.png`), tour GIF and MP4 (`docs/images/tour.gif`, `docs/media/tour.mp4`): each scene runs the built app on a temporary data folder seeded with demo notes, through Playwright's Electron driver, then `sips` and `ffmpeg`; the sticky windows picture (`scatter`) captures each off-screen window alone and lays them out on a backdrop page, so no desktop shows |
| `electron/themes.json` | the theme definitions (palette, code theme, overrides), the single source read by the renderer (`src/style/themes.js`) and the main process (`electron/windowTheme.cjs`, `electron/store.cjs`) |
| `src/main.jsx` | composition only: the `App` shell and the `StickyEditor` component that wires everything below together |
| `src/styles.css` | ordered `@import` list for `src/styles/` |

## Code map

Renderer code is grouped by what it owns. Start here rather than reading `src/main.jsx` end to end.

| Directory | Owns | Notable files |
| --- | --- | --- |
| `src/` | entry point and shared constants | `main.jsx`, `constants.js` |
| `src/editor/` | editor engine and editor behaviour, independent of React state | `schema.jsx`, `callout.jsx`, `calloutIconPicker.jsx`, `columns.jsx`, `bookmark.jsx`, `divider.jsx`, `math.jsx`, `selection.js`, `blockSelection.js`, `blockSelectionRules.js`, `blockDragSelection.js`, `blocks.js`, `clipboard.js`, `paste.js`, `tableFocus.js`, `images.js` |
| `src/model/` | normalising and deriving stored data | `notes.js`, `preferences.js`, `keyboardShortcuts.js` |
| `src/style/` | themes, theme tokens, tone matching, colour maths and computed inline styles | `themes.js`, `themeTokens.js`, `toneMatch.js`, `applyTheme.js`, `themeStyles.js`, `colorMath.js` |
| `src/ui/` | presentational React components | `icons.jsx`, `controls.jsx`, `preferencesWindow.jsx`, `CropDialog.jsx` |
| `src/hooks/` | stateful behaviour lifted out of `App` and `StickyEditor` | `useSessionList.js`, `useOverlayState.js`, `useNoteAppearance.js`, `useSessionTabActions.js`, `useNotePersistence.js`, `useEditorSurfaceShortcuts.js` |
| `src/utils/` | small generic helpers | `values.js`, `dom.js`, `sessionTabAnimation.js` |
| `src/styles/` | stylesheets, imported in cascade order | `tokens.css`, `chrome.css`, `blocknote.css`, `motion.css`, `editor-motion.css` |

### Where behaviour lives

| To change this | Look here |
| --- | --- |
| Block schema, template content, custom blocks | `src/editor/schema.jsx` |
| Callout block: Enter and Backspace in its text and body, drops into its body, Markdown export as a quote | `src/editor/callout.jsx` |
| Callout icon picker: emoji data, recent icons, upload, remove | `src/editor/calloutIconPicker.jsx` |
| Columns: the `columnList` and `column` nodes (the layout BlockNote core knows; `@blocknote/xl-multi-column` is GPL-3.0 and not used), the resize gutter, Backspace at a column's start, the slash menu's "2 columns" | `src/editor/columns.jsx` |
| Bookmark card: the address field, the card, opening the page, the metadata request, Markdown export as a link, the six-dot menu's Turn into bookmark | `src/editor/bookmark.jsx` (fetching in `electron/bookmarkMetadata.cjs`) |
| Text selection, table cell selection and navigation | `src/editor/selection.js` |
| Table row and column handle menus, the table items of the six-dot block menu | `src/editor/tableHandles.jsx` |
| Table column widths: live resize, double-click auto-fit, fit to width | `src/editor/tableColumnSizing.js` |
| How far a wide table grows right of the text column before it scrolls (a container query on `.sticky-editor-surface`) | table section of `src/styles/blocknote.css` |
| Editor motion: toggle open and close, new blocks rising in (a ProseMirror decoration dropped with the next transaction), moved blocks gliding into place (FLIP), the checklist pop; all through the Web Animations API or decorations, never DOM writes ProseMirror would observe | `src/editor/editorMotion.js`, `src/styles/editor-motion.css` |
| The smooth caret: a drawn caret at the ProseMirror selection head (`coordsAtPos`, in the surface's scroll coordinates) that glides small moves and snaps clicks, scrolls and jumps, and follows the text frame by frame while anything in the note animates (BlockNote's margin slide as a block nests, a block rising in); the native caret is transparent only while it shows (`data-smooth-caret` on the surface), and comes back for a range, block or cell selection, an IME composition, another focused field, print and export; the `smoothCaret` editor preference | `src/editor/smoothCaret.js`, `src/hooks/useSmoothCaret.js`, `src/styles/caret.css` |
| Block selection model, exactly-selected blocks, block-set indent and move | `src/editor/blockSelection.js`, `src/editor/blockSelectionRules.js` |
| Marquee and drag selection gestures, edge auto-scroll, and the keyboard (Enter, Tab, move, delete) and IME composition routing for a block set or the whole note | `src/editor/blockDragSelection.js` |
| Block lookup, cut, table of contents extraction | `src/editor/blocks.js` |
| Copy/paste normalisation, block clipboard formats for copy and cut, the document copy and cut listeners, and Markdown round-tripping | `src/editor/clipboard.js` |
| The editor's paste handler: files, a URL over a selection, NotePane and VS Code copies, Markdown | `src/editor/paste.js` |
| The focused table cell and cell range decorations, keeping the focused cell across add or remove row and column | `src/editor/tableFocus.js` |
| Which element counts as an editor shortcut target | `src/editor/targets.js` |
| Backspace right after a Markdown shortcut such as `- ` gives back exactly the typed marker | `src/editor/markdownShortcuts.js` |
| Divider: the `---` / `***` shortcut (in `src/editor/schema.jsx`), its slash menu item, Markdown export as `---` | `src/editor/divider.jsx` |
| Inline and block equations: KaTeX rendering, their editors, slash menu items, Markdown `$...$` / `$$` export and the import that reads them | `src/editor/math.jsx` |
| BlockNote floating menu positioning and clamping, and how its floating UI closes: the controllers' close transition, the Mantine theme for menus (`NotePaneMantineProvider`), the link toolbar controller, and the fading copy of a block menu whose side menu hid | `src/editor/floatingMenus.js` |
| Link toolbar content: the address, Copy, Edit and its form with Remove link | `src/editor/linkToolbar.jsx` |
| Image download, crop geometry, upload | `src/editor/images.js` |
| Pasting and dropping files: where the file block goes, its upload, one undo step for both | `src/editor/fileInsertion.js` |
| Code block language detection, prettifying, and Tab / Shift+Tab line indent; which formatter each language uses and why the others have none | `src/editor/codeFormatting.js` |
| The code block formatters that are not Prettier plugins, most of them WebAssembly, each loaded on first use. Their `.wasm` is inlined into its lazy chunk as a data: URL (`build.assetsInlineLimit` in `vite.config.js`) because the packaged renderer's file:// page cannot fetch a file beside it, and the CSP's `script-src` allows `'wasm-unsafe-eval'` to compile it | `src/editor/codeFormatEngines.js` |
| Code block languages: the language menu's list and search, the language a new code block starts in | `src/editor/codeLanguages.js` |
| Code block tool bar: showing on hover, the language menu, Prettify and Copy | `src/ui/CodeBlockTools.jsx`, `src/ui/CodeLanguageMenu.jsx` |
| Note search matching, snippets and plain-text extraction; the palette query's `#tag` and `folder:` filters (`parseSearchQuery`, `formatSearchQuery`, `filterSearchEntries`) | `src/model/search.js` |
| The note search palette: its results with their folder and tags, match count and last-edited labels, keyboard selection, the folder and tag filter chips, opening it on a query (`openPaletteWithQuery`) | `src/ui/SearchPalette.jsx`, `src/hooks/useNoteSearchPalette.js`, `formatRelativeEditTime` in `src/model/notes.js` |
| Palette commands: matching a query to commands, `>` for commands only (`matchCommands`, `parseCommandQuery`), and the list of commands with their actions and keys (`usePaletteCommands`, which makes New folder now that the sidebar has no button for it) | `src/model/commands.js`, `src/hooks/usePaletteCommands.js` |
| A shortcut that opened the palette, the find bar or the export menu closing it again (`useChromeShortcuts`), and Settings (`handlePreferencesShortcut` in `src/main.jsx`) | `src/hooks/useKeyboardCommands.js` |
| Nested list markers (•, ◦, ▪ and 1., a., i., cycling): `data-list-depth` decorations, and the rules that draw them and centre bullets and toggle arrows on the first line | `src/editor/listMarkers.js`, list section of `src/styles/blocknote.css` |
| Lists typed as text ("a) ", "(b) ", "2) "): the next marker on Enter, the list ending on a bare marker, Escape taking a new marker back (`dismissTextListContinuation`, called by the surface's Escape handler) | `src/editor/textLists.js` |
| Tag rules: trimmed, without "#", lower-cased, spaces as "-", 1 to 32 characters, at most 20 a note (a twin in `electron/store.cjs`) | `src/model/tags.js` |
| The tag chips above a note's first block: open the palette on a tag, add with suggestions, remove | `src/ui/NoteTags.jsx`, tag section of `src/styles/editor-surface.css` |
| Folders in the tabs sidebar: grouping and visible order, folder names (store twin and IPC `folders:*`, `notes:set-folder`, `notes:set-tags` in `electron/store.cjs` / `electron/main.cjs`) | `src/model/folders.js` |
| Folder headers, inline rename, the folder menu and dropping a tab on a header | `src/ui/SessionFolderHeader.jsx`, `src/hooks/useSessionFolders.js` |
| Find in note decorations and navigation | `src/editor/findInNote.js`, `src/hooks/useFindInNote.js` |
| Note titles, ordering, trash previews | `src/model/notes.js` |
| Preference and font normalisation and defaults | `src/model/preferences.js` |
| Shortcut parsing, matching, display labels (`formatKeyboardShortcutLabel`, the one label for NotePane's and BlockNote's shortcut forms) | `src/model/keyboardShortcuts.js` |
| Theme list, lookup and the fallback for an unknown theme id | `src/style/themes.js` (data in `electron/themes.json`) |
| Every colour token a theme produces, derived from its palette; `--sticky-portal-menu-shadow` is the one flat shadow of every floating surface | `src/style/themeTokens.js` |
| Showing a user-painted colour in the theme's tone | `src/style/toneMatch.js` |
| Applying a theme to the document, the first-paint theme, the export theme | `src/style/applyTheme.js` |
| Applying the selected theme in a window, code theme included | `src/hooks/useAppliedTheme.js` |
| A reload's first frames: the shell's last paint under the app, then the app's fade-in | `public/boot.js`, `index.html`, `src/hooks/useReloadReveal.js` |
| The launch intro: the app icon split into one layer per part (tile, three windows, three dots) flying into the mark, its box drawn by a turning half-plane sweep and filled, the name written out letter by letter, over an opaque veil in the window's colour; only transform and opacity animate, so the compositor runs it while the app mounts, and the motion starts once the app is first idle (at most 0.5 s). Once per launch in the tabs window: preload asks `app:take-launch-intro` synchronously (`sendSync`, `electron/main.cjs` answers yes once, never in a test run unless `BLOCKNOTE_STICKY_LAUNCH_INTRO=1`), so `App` renders it in its first frame, outside the per-note `StickyEditor`; skipped under reduced motion; the `launchIntro` editor preference | `src/ui/LaunchIntro.jsx`, `src/hooks/useLaunchIntro.js`, `src/styles/intro.css` |
| Code block syntax colours per theme, re-highlighting on a theme change | `src/editor/codeHighlighter.js` |
| The theme picker in Preferences | `src/ui/ThemePicker.jsx` |
| The Settings window (Tern-style floating window): grouped page sidebar (App: About, Appearance, Background, Tabs, Editor, Keyboard; Data: Trash, Backup), search over every setting (`SETTINGS_INDEX`, whose keywords keep the old names of moved settings), the hold-to-peek eye button, and the cards each page is made of; the Keyboard page's shortcut list | `src/ui/preferencesWindow.jsx`, `src/ui/PreferencesCard.jsx`, `src/ui/preferencesSections.jsx`, `src/ui/trashPreferences.jsx` |
| The Look pages and the controls they share: Appearance (theme, accent, corners, app font, launch intro), Editor (the note's text, headings, code, layout with text width and table of contents, smooth caret), Background (what sits behind the window, its adjustments and where it shows, then the Glass group: Material, Opacity, Menu blur, Border, Keep text readable, shown only while there is a background) and Tabs | `src/ui/lookPreferences.jsx`, `src/ui/settingsControls.jsx` |
| The look settings (`editorPreferences.look`): defaults, ranges, the surface style (`getSurfaceStyle`, `applySurfaceStyle`): the window's areas from one material, menus and Settings from their own blur (`FLOATING_BLUR_RANGE`, 0 for clear), all read back from the stored `surfaces`; `readableText`, built-in background pictures; the store keeps a twin normaliser and keeps background pictures through asset clean-up | `src/model/look.js`, `electron/store.cjs` |
| Applying the look: attributes and `--look-*` variables on `<html>` (`useLookStyles`, its pure half `getLookStyles`) and the rules that read them, `data-look-readable` for the text halo over a see-through window; the shell's stacking context over a background, raised above BlockNote's body-portalled handles while one of its dialogs is open; the default look changes nothing on screen | `src/hooks/useLookStyles.js`, `src/styles/look.css` |
| Tab colours (`look.tabs`: `barColor`, `activeFill`/`activeText`, `inactiveFill`/`inactiveText`, `fillOpacity`, `border`, `borderColor`, `blur`): `data-tab-*` attributes and `--look-tab-*` variables, a fill without a text colour getting black or white, whichever reads better; hidden numbers and shortcuts narrowing their grid columns and the close button moving over the right end | `getTabColorProperties` in `src/hooks/useLookStyles.js`, tabs section of `src/styles/look.css`, the Tabs page in `src/ui/lookPreferences.jsx` |
| Picking a background picture: `look:pick-background` stores the file as an asset (at most 32 MB) | `electron/main.cjs`, `electron/preload.cjs` |
| Preferences > About: version, description, Electron/Chromium versions, the manual update check (`app:info`, `app:check-for-updates`), and the Mac self-updater's progress (status, size, a progress bar) and Restart to update | `src/ui/aboutPreferences.jsx` |
| The update pill in the tabs header: the download filling it, Restart to update, the restart filling it again, a failed download, or the release page for a copy that cannot replace itself; what each state says and how far it has got, shared with About | `src/ui/UpdatePill.jsx`, `src/model/appUpdate.js`, `src/hooks/useAppUpdate.js`, update pill section of `src/styles/chrome.css` |
| A gauge: a box filling from the left behind its contents, following a value or creeping toward 90% when the length is unknown | `src/ui/Gauge.jsx`, gauge section of `src/styles/chrome.css` |
| Sticky shell and session tab computed styles | `src/style/themeStyles.js` |
| Colour conversion and contrast | `src/style/colorMath.js` |
| The window's session list and trash: load on startup, `notes:changed` updates, create, select, reorder, move to Trash, restore, purge, the undo toast after a move to Trash | `src/hooks/useSessionList.js` |
| Saving, debouncing, version snapshots | `src/hooks/useNotePersistence.js` |
| Debounced title and colour writes, for the open note and for each recoloured session tab | `src/hooks/useNoteAppearance.js` |
| Flushing pending saves on unmount or when main asks | `src/hooks/usePendingSaveFlush.js` |
| Keys handled on the editor surface | `src/hooks/useEditorSurfaceShortcuts.js` |
| Toggle keys (`> ` and Space, Enter, Backspace on a toggle title), the caret moving to a toggle's title when its chevron closes it over the caret, Backspace joining the line below a closed toggle to its title | `src/editor/toggleKeyboard.js` |
| Window, session and tab-mode keyboard commands | `src/hooks/useKeyboardCommands.js` |
| Session tab rename, duplicate, open as sticky, move to Trash, and closing the current tab | `src/hooks/useSessionTabActions.js` |
| The session tab menu (with its one-click tab colours), the media menu and the export format menu, placed at their anchor and clamped to the window | `src/ui/menus.jsx` |
| Right-clicking an image, video, audio or file block, and what its menu does | `src/hooks/useMediaContextMenu.js` |
| An image or video shown large from its menu | `src/ui/MediaPreview.jsx` |
| Session tab drag and drop: reordering, and a tab joining the group of the tabs it is dragged over (`previewNoteFolder` in `useSessionList` shows it there, the drop stores it with `notes:set-folder`, a cancelled drag puts it back); dragend is heard on the dragged row itself, since a tab that changes group is drawn again elsewhere | `src/hooks/useSessionTabDrag.js` |
| A session switch remounts `StickyEditor`; the fades its sidebar labels and folders show as they appear jump to their end before the first paint | `src/hooks/useMountWithoutFades.js` |
| Whether the tabs sidebar is open: the user's choice, and the compact sidebar of a narrow window | `src/hooks/useSidebarVisibility.js` |
| Export toast and zoom gauge timing | `src/hooks/useStickyToasts.js` |
| Zoom gauge, export toast and other overlays; the table of contents rail, whose slot keeps the closed rail's size in the note's flow while the panel opens over the text | `src/ui/overlays.jsx`, table of contents section of `src/styles/editor-surface.css` |
| Which panels, menus and confirmations are open, which ones close each other, and the order Escape closes them in | `src/hooks/useOverlayState.js` |

`src/main.jsx` keeps only `App` (theme, layout and preference state, IPC subscriptions, and the session list from
`useSessionList`) and `StickyEditor`
(editor instance, the remaining per-note state, and the rendered tree). A new non-trivial behaviour belongs in a
module above, not in `main.jsx`.

### Stylesheets

`src/styles.css` contains nothing but `@import` lines. Later files intentionally override earlier ones, so the import
order is part of the contract and must not be rearranged. The built stylesheet is byte-identical to the previous single
file. KaTeX's own stylesheet is imported just before `blocknote.css`, which gives equations the theme's colours; its
fonts are bundled from the package, as the packaged renderer's `font-src 'self' data:` policy requires.

### Reference check

`npm run check:refs` parses every file under `src/` and fails on an identifier that is referenced but never declared,
imported, or provided by the runtime. It runs in about a second and catches an import dropped during a refactor long
before the browser suites would. It is the first step of both `verify:quick` and `verify`.

### Colour check

Every colour must come from the theme. `npm run check:colors` scans `src/**/*.{css,js,jsx}`, `electron/**/*.cjs` and
`index.html` for colour literals: hex, `rgb()`, `hsl()`, `oklch()`, `lch()`, and the 148 CSS named colours in any case
wherever they are colours: in the value of a colour property (any `*-color`, shorthands, shadows, gradients, filters
and masks), read whole even when it spans several lines, inside a colour function or a shadow, in comments, and in JS
style values such as `{ borderLeftColor: "red" }`, `{ "--x": "white" }`, `"border-color: " + (on ? "red" : x)` or
`setAttribute("fill", "white")`. A deliberate literal goes in `scripts/check-colors-allowlist.json` with its reason,
one entry per literal line; an entry that no longer covers a literal fails the check. It runs right after
`check:refs` in `verify:quick` and `verify`. The theme leak detector (`tests/e2e/renderer/theme-leaks.spec.mjs`)
renders each screen under two test-only themes that share no colour and fails on any visible colour that stays the
same; its themes and test hook load only in a dev build, and `scripts/verify-dist.mjs` fails if they reach the built
bundle. The colour migration is finished, so neither check keeps a known-debt list: a committed
`scripts/check-colors-known.json` or `tests/e2e/fixtures/theme-leaks-known.json` fails it.

The renderer owns editor behavior. The desktop shell does not override BlockNote keyboard or mouse behavior.

## Persistence flow

1. BlockNote emits `onChange`.
2. Renderer serializes `editor.document` to `blocksJSON`.
3. Renderer also stores a lossy markdown fallback.
4. IPC sends the payload to Electron main.
5. `StickyStore` writes `notes.json` atomically (`electron/atomicWrite.cjs`): the temporary file is fsynced before
   the rename, and a rename blocked by a briefly locked file (EPERM/EBUSY/EACCES) is retried with a short backoff.

Before main destroys windows (the Windows layout switch) or reads or replaces the workspace (backup export and
import), it sends `notes:flush-requested` to every note window and waits, up to 1.5 s per window, for
`notes:flush-done` after the renderer has written its debounced content and appearance edits.

Uploaded media never stays in note JSON. Upload and crop store bytes through the `assets:store` IPC and insert a
`notepane-asset://local/<sha256>.<ext>` URL. Any base64 data URL that still reaches the store (pasted HTML, Markdown
import, backup restore) is moved into an asset file on save. On startup the store migrates inline images left in
`notes.json` and `note-history.json` (keeping `*.pre-assets-<timestamp>.json` copies), then deletes asset files that
no note, trashed note or history version references. It skips both steps when a store file failed to load. Workspace
backups and Markdown export inline the assets again, so those files stay self-contained. The browser preview has no
asset store and keeps data URLs.

Appearance changes use a separate IPC path and persist the note title, optional sidebar tab accent color/opacity, and
per-note editor typography in the matching local JSON note record. The app theme is app-wide state and is persisted
separately at the root of `notes.json` as `appTheme`, `{ themeId, mode }`. `appTheme.themeId` names the selected
theme; `mode` is always that theme's scheme (`light` or `dark`), written so an older build reading the file, or
restoring a backup, still gets a matching light or dark theme. On reading, a known `themeId` wins; otherwise
`mode: "dark"` gives NotePane Dark and anything else NotePane Light, so an unknown id from a newer build or a
hand-edited file falls back by `mode`. Backups go through the same normalisation and keep format version 1. Layout
mode is also app-wide and is stored as root `layoutMode`.

The renderer keeps a built-in font list for browser preview mode. In Electron, the preload bridge exposes `fonts:list`;
the main process reads macOS installed font families through `system_profiler SPFontsDataType`, caches the result, and
returns family names only. Windows and other unsupported platforms use the built-in font list only. Installed fonts are stored as `local:<font family>` so the setting can survive app restart
without copying font files into the app.

Editor defaults are app-wide preferences stored at `editorPreferences` in `notes.json`. New sessions copy those defaults
into their own per-note typography fields at creation time; changing defaults does not mutate existing sessions.
The app font family is also stored there and applies immediately to interface text in every open window. There is no
font size setting: as in Notion, text size follows the app zoom (`appZoom`), which the main process applies as page
zoom to every window (`setZoomFactor`) when preferences change and each time a window loads.

Sidebar session changes use note list/create/activate/delete IPC calls. Activating a session changes the note bound to
the current window, then remounts the BlockNote editor with that note's stored document. Deleting the active session
switches the current window to the next remaining session. The final remaining session cannot be deleted.

## Window model

The app supports two layout modes.

- Default size: `960 x 720`
- Minimum size: `640 x 500`
- `alwaysOnTop` defaults to `false`
- transparent window background for native note transparency
- Bounds are saved on move/resize/close
- The tabs window keeps its own always-on-top flag and bounds at `tabsWindow` in `notes.json`; sticky windows keep
  theirs per note, so pinning or resizing one never carries over to the other
- Tab session mode keeps every session in one primary tabs window
- Sticky mode opens every session as its own compact sticky-note window when entering the mode
- Sticky mode arranges note windows in a small grid using the current primary display work area
- Closing an individual sticky window records it as manually closed and does not immediately recreate it
- Show All NotePanes clears manually closed sticky windows and opens every note window again
- `Command/Ctrl + T` creates a new sidebar session tab; `Command/Ctrl + N` remains available for new note/session
- The dashed `+` directly under the last sidebar session tab creates a new note/session in the current tabs window
- Sidebar tab close appears only on row hover and deletes a note/session when more than one session exists
- `Command/Ctrl + 1` through `Command/Ctrl + 9` activates the matching sidebar session
- `Command/Ctrl + Option/Alt + Left/Right` activates the previous/next sidebar session and wraps at the ends
- `Command/Ctrl + W` moves the current sidebar session to Trash in tab session mode instead of closing the primary
  window; the confirmation and the undo toast both say so
- Sidebar tab double-click starts inline rename
- Open as sticky (session tab menu) calls `notes:open-sticky`: in the tabs layout, the note gets its own sticky
  window, marked `detachedSticky`, and the app's `layoutMode` stays `tabs`. `layout-mode:get` answers `sticky` to
  that window, layout syncs in the tabs layout keep it open, `notes:activate` from the tabs window for its note
  brings it forward instead, and `layout-mode:update` to `tabs` from it closes it after its flush and shows the note
  in the tabs window. Entering the sticky layout makes it an ordinary sticky window

## BlockNote configuration

The renderer uses:

- `BlockNoteView`
- default BlockNote UI
- `portalElements={{ default: document.body }}`
- code block extension from `@blocknote/code-block`
- advanced table options
- data URL file uploads for local persistence

## Export and media

- Export is opened from one icon: its menu exports the open note as PDF or Markdown in one click, and Options... opens
  the Export window (`src/ui/ExportDialog.jsx`, run by `src/hooks/useNoteExport.js`): the open note, its folder or every
  note; PDF (light or current theme colours, A4 or Letter), Markdown (images inside the file or in a folder beside
  it, optional title/tags/dates front matter), HTML (one self-contained page) or an image; Copy as Markdown.
- An image export renders the note's HTML page in a hidden window and captures it whole (`renderHtmlToPng` in
  `electron/noteExport.cjs`, cut at 16000 px). A folder or every note exports Markdown or HTML, one file per note in a
  folder the user picks, notes in folders written into sub-folders, same titles numbered (`export:notes`). Notes
  that are not open are converted by a detached editor (`src/editor/noteConversion.js`).
- PDF export uses Electron `printToPDF` with print CSS that hides app chrome.
- Both export paths temporarily remove app chrome/background styling so the exported content has no NotePane shell background.
- PDF export renders with NotePane Light's colours whatever theme is selected, its GitHub dark code blocks included, so
  exports stay printable and look the same in every theme; the selected theme returns afterwards.
- Image download is handled in Electron main so `data:`, `notepane-asset:`, `file:`, and `http(s):` image URLs can be saved through the native save dialog.
- Copy image puts the image pixels, not its URL, on the clipboard: Electron reads the URL through the same reader as download (`assets:copy-image`) and writes a native image; the browser preview writes a PNG `ClipboardItem` and hides the action when the async clipboard is unavailable.
- Image toolbar actions resolve the clicked image's block from its rendered `.bn-block-outer[data-id]`, because identical images share one asset URL.
- Image crop is renderer-side canvas processing; the cropped PNG is stored as an asset and replaces the block URL.
- A bookmark card's metadata comes from the main process through `bookmarks:fetch-metadata` (preload
  `fetchBookmarkMetadata(url)`, `electron/bookmarkMetadata.cjs`). Only http(s) addresses on public hosts are fetched:
  the host name is resolved and refused when any address is loopback, private, link-local, CGNAT, multicast or
  reserved, IPv4-mapped and NAT64 IPv6 included, and every redirect (at most four) is checked the same way. Each read
  stops after 5 s; a page is read up to 1 MB and parsed with a small regular-expression reader of `<title>`, the meta
  description and the `og:` tags. The preview image (PNG, JPEG, GIF, WebP or AVIF, up to 2 MB) is stored as an asset,
  so the card never hot-links it. The renderer writes the fetched fields without an undo step of their own. The
  browser preview has no bridge and shows the address alone. Clicking a card calls `window.open`, which main hands to
  `shell.openExternal` through `openExternalUrl`.

## Themes and Preferences panel

The app ships the original nine themes first, in picker order:

| Theme id | Name | Scheme |
| --- | --- | --- |
| `notepane-light` | NotePane Light (the default) | light |
| `notepane-dark` | NotePane Dark | dark |
| `catppuccin-latte` | Catppuccin Latte | light |
| `catppuccin-frappe` | Catppuccin Frappé | dark |
| `catppuccin-macchiato` | Catppuccin Macchiato | dark |
| `catppuccin-mocha` | Catppuccin Mocha | dark |
| `nord` | Nord | dark |
| `dracula` | Dracula | dark |
| `tokyo-night` | Tokyo Night | dark |

The picker then offers 41 themes adapted from TablePeek's catalog palettes not already present above; TablePeek's own two default themes are not offered, and a stored `tablepeek-dark` or `tablepeek-light` falls back by its `mode` to NotePane Dark or Light. Their window, sidebar, header, accent, text and status colours come from TablePeek's `web/src/palette.ts` and `web/src/themeCatalog.ts`. NotePane adjusts text where needed for readability, maps TablePeek's data type colours to editor colours, and uses a bundled Shiki theme with the same light or dark scheme for code blocks. Rosé Pine uses a stronger tint so its pastel note colours remain distinct. The original seven themes shared by both apps keep their existing NotePane palettes.

Last comes Neon Noir (`neon-noir`), NotePane's own: the dark neon noir Tern theme with the customisations in
`~/dotfiles/tern/themes/gyu.css` (Dracula's surfaces, the iTerm2 ANSI palette for the named colours, the `#287d8e`
teal of its active tab as the accent) and the Dracula code theme.

A theme is data in `electron/themes.json`: a `scheme`, a `palette` of 27 primitive colours (surfaces, lines, text,
roles, the nine named colours, code colours), a Shiki `codeTheme`, and `overrides`. `buildThemeTokens`
(`src/style/themeTokens.js`) derives every CSS custom property the stylesheets read from the palette; NotePane Light
and Dark use `overrides`, each with a recorded reason, to keep today's hand-tuned values exactly. The renderer sets the
tokens on the document root together with `data-theme-id`, `data-theme-scheme` and `color-scheme`, so BlockNote's
menus portalled to `document.body` inherit them. Stylesheets and components use tokens only (see Colour check). The
scheme is internal: it drives tone matching, BlockNote's `theme` prop, `color-scheme` and the wordmark, which keeps its
brand colours in every theme (the light PNG for light themes, the dark PNG for dark themes).

The theme is chosen in Settings > Appearance ("The colors of every window, light or dark."): a radio group of
preview cards, each a small window drawn in that theme's colours. Clicking a card, or moving with the arrow keys,
applies the theme at once in every open window, sticky windows and their portalled menus included, through the
`app-theme:update` and `app-theme:changed` IPC broadcast. There is no light/dark toggle: the former Light/Dark switch,
its `toggleThemeMode` command and its `Command/Ctrl + Shift + L` shortcut are gone, and `Command/Ctrl + Shift + L` is
left unbound. A stored custom binding for the removed command is dropped on load.

Colours the user paints are stored unchanged and shown through tone matching (`src/style/toneMatch.js`): the hue is
kept, and lightness and chroma move into the theme's own range, measured from its palette. A sticky window surface
becomes a quiet tint; a session tab fill does too on light themes, and on dark themes becomes a bright pastel in the
tone of the theme's named colours, like NotePane Dark's tabs. A small mark such as a search result dot takes the tone
of the theme's named colours, and whites, greys and blacks map onto the theme's neutral surfaces. Text on a painted
colour is the theme text colour that reaches 4.5:1, or black or white when neither does. NotePane Light and Dark skip
tone matching and show the pastels as they are, the contrast fallback being their only change. Preferences swatches
and the colour panel preview show the tone-matched colour. Named editor colours (the formatting menu's text and
background colours) are stored by name and take the theme's named colours directly.

A session tab is plain until its note has a colour of its own: an outline, faintly filled on hover and when open
(`.session-tab-row.is-plain`), and its search result dot is an empty ring. A sticky window without a colour still shows
the pastel of its place in the stored note order. Once a session has an accent colour, the tab's active, inactive, and
hover backgrounds are derived from it, tone-matched to the current theme, and the title text color is calculated from
the effective background so the tab remains readable in every theme. The colour panel's "No color" swatch clears it.
Full-window custom background colors are deliberately not supported
because they conflict with editor-level colors such as text color, code background, code text, and user authored
inline colors.

Code blocks are highlighted with the theme's Shiki theme: GitHub dark in NotePane Light and Dark, and the matching
bundled theme in the others. A theme change re-highlights the open code blocks without saving the note or touching
undo history.

A code block's background is `--sticky-code-surface` (`codeSurfaceColour` in `src/style/themeTokens.js`), the same for
highlighted and plain blocks: the code theme's background where it already stands 0.06 OKLab lightness from the page,
otherwise the page raised towards the code text by just enough. Most themes paint code on their page colour, which
left a block marked only by its edge. The raise never takes the code text below 4.5:1, or below what it already reads
at on the page, so Everforest Light, Solarized Dark and Light and Material Lighter stand apart by less or only by the
edge. NotePane Light keeps GitHub dark's `#24292e`, and NotePane Dark takes GitHub dark dimmed's `#2d333b`. Only the
block paints: the `pre` inside is transparent, so the block's 1px inset edge shows on every side.

The theme is global for the whole app. Switching sidebar sessions or opening another sticky window does not change it.
The main process passes the theme id in each new window's URL, and the renderer applies the theme before React mounts,
so a window opened under a dark theme never shows a light frame. On Windows, where windows are opaque, the window
background colour is the theme's window colour; on macOS and Linux windows stay transparent.

Settings is opened from the sidebar footer button, the app menu's Settings… item, or `Command/Ctrl + ,` and keeps app-wide/default settings:

- app theme
- default editor font family and size for newly created sessions
- keyboard shortcut reference

Settings opens in the tabs window only, because a sticky window is too small for it. The menu item is disabled in the
sticky layout, a window that turns sticky closes Settings, and the shortcut does nothing in a sticky window.

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

- `.sticky-header` shows the note's display title, centred and not editable, and the save status in tab session
  mode. Both are text only, so the header stays one drag region. The status follows `onSaveStateChanged` from
  `useNotePersistence`: `saving` when a write starts, `saved` after it lands, `failed` for each failed attempt.
- `.sticky-header` contains editable title in sticky mode.
- `.sticky-header` contains the sidebar toggle or title, drag strip, and mode-specific action controls.
- Sticky mode uses a shorter header.
- The sticky header exposes a gear button that opens per-sticky window settings for background color/opacity, pinning, layout, and editor controls.
- Sticky mode calculates text, border, code, and table colors from the current sticky background to keep contrast readable.
- The session tab context menu exposes per-tab color/opacity settings in Tab session mode.
- The export control uses a share-style icon and opens PDF/Markdown choices and the Export window.
- `.sticky-header` is the only drag region.
- `.sticky-editor-surface` is explicitly `no-drag`.
- Sidebar controls, header toggle, and image tools are explicitly `no-drag`.
- Clickable controls use pointer cursor, small hover animation, and delayed shortcut tooltips.
- BlockNote floating UI still portals to `document.body`.
- BlockNote block internals are not restyled.
