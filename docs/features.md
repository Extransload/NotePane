# Features

## Desktop

- Multiple sticky windows
- Tab session mode: one primary window with sidebar note/session tabs
- Sticky mode: each session opens as an individual sticky window
- Switching into Sticky mode arranges sessions as compact sticky-note windows
- Closing an individual sticky window keeps it closed until Show All NotePanes or another Sticky-mode entry
- Sticky mode windows have per-session pastel color, opacity, pinning, layout, and editor controls in a header settings modal
- Sticky color/opacity carries back to the sidebar session tab color when returning to Tab session mode
- Custom NotePane shell
- Padded draggable header that shows, in tab session mode, the open note's title centred (the sidebar tab's text,
  following a rename) and its save status at the right: "Saving..." while a write is in flight, a muted "Saved" that
  fades after a moment, and "Not saved - retrying" in the danger colour while writes fail
- Editable title in sticky mode header
- Session rename by double-clicking a sidebar tab
- Hover-only session delete button in the sidebar tab row
- Below 760px of window width the tabs sidebar turns compact by itself and returns when the window is wider again;
  the show/hide choice made in a wide window is kept, and one made in a narrow window lasts until the window crosses
  the breakpoint
- 52 app themes: NotePane Light (default) and NotePane Dark, Catppuccin Latte, Frappé, Macchiato and Mocha, Nord,
  Dracula and Tokyo Night, followed by 43 palettes adapted from TablePeek
- Theme picker in Preferences > General > App theme: preview cards that apply the theme at once to every window
- Every colour comes from the selected theme, code block syntax colours included
- Session and sticky colours are shown in each theme's tone (tone matching): the hue is kept, the stored colour never
  changes, and text on it stays readable
- No light/dark toggle and no light/dark shortcut; `Command/Ctrl + Shift + L` is unbound
- Preferences panel via sidebar footer button, native app menu, or `Command/Ctrl + ,`
- Default editor font family for every session; there is no font size setting, text size follows the app zoom
- App zoom with `Command/Ctrl + =`, `-` and `0`, from 50% to 200%: every window zooms together, a gauge shows the zoom
  between its smallest and largest step, and the zoom persists
- Right-click session tab context menu, opened at the pointer and kept inside the window: Rename (inline rename),
  Duplicate (a new session with the same content, colour and "<title> copy" as its name), Open as sticky (desktop
  tabs layout: the note opens in its own sticky window while the app stays in tabs; its tab then brings that window
  forward, and switching the window to tabs puts the note back), Color... for the per-session tab color, and Move
  to Trash with its confirmation
- Sidebar tab background/accent color customization with automatic contrast text
- Tab color wheel
- Color brightness/value slider that is preserved when the wheel color changes
- Color opacity slider for the sidebar tab accent
- Eyedropper for session tab color when the runtime supports the browser `EyeDropper` API
- Editable HEX/HSL/RGB/LCH session tab color values
- Copy buttons for HEX/HSL/RGB/LCH session tab color values
- New note/session: `Command/Ctrl + T` or `Command/Ctrl + N`
- New sidebar session: dashed `+` button directly under the last session tab
- Switch sidebar sessions: `Command/Ctrl + 1` through `Command/Ctrl + 9`
- Previous/next sidebar session: `Command/Ctrl + Option/Alt + Left/Right`, wrapping across the first and last tabs
- Close current tab in tab session mode: `Command/Ctrl + W`
- Show all sticky notes: `Command/Ctrl + Shift + 0`
- Cycle sticky windows: `Command/Ctrl + Backtick`
- Toggle always on top: `Command/Ctrl + Shift + P`
- Toggle Tab/Sticky mode: `Command/Ctrl + Shift + T`
- Open export menu: `Command/Ctrl + Shift + E`
- Delayed hover tooltips for clickable controls
- Sidebar footer actions (version history, export, Preferences, layout, editor width) share one muted chrome tone;
  the theme's accent marks only the button under the pointer and a pressed toggle
- Window bounds persistence
- Editor area is explicitly non-drag so BlockNote mouse interactions remain intact
- Single share-style export icon with PDF/Markdown format choices
- PDF export hides app chrome and sticky background
- PDF export renders with NotePane Light colours whatever theme is selected

## Editor

BlockNote handles editor interaction directly.

- `/` slash menu
- `Enter` creates the next block
- `Shift + Enter` creates a line break inside the current block
- Side menu
- Drag handles
- Block drag/drop
- Block nesting
- Formatting toolbar
- Link toolbar
- Table handles: a row or column handle selects its whole row or column, outlined as one rectangle, and opens
  Notion's menu: header row or column switch (first row or column), colour, insert above/below or left/right,
  duplicate (tables without merged cells), clear contents and delete
- Table block menu (six-dot handle): fit to width, header row and header column switches
- `Command/Ctrl + A` selects all editor blocks
- `Command/Ctrl + X` cuts/removes the current block when no text is selected
- Search notes: `Command/Ctrl + P` searches titles and bodies of every note outside Trash and opens the chosen note at its first match.
  The palette is as tall as its results, up to 70% of the window, and scrolls past that with the keyboard selection
  kept in view; each result shows its match count ("7 matches") and when the note was last edited ("5 min. ago")
- Find in note: `Command/Ctrl + F` highlights matches, steps with `Enter` / `Shift + Enter`, and expands collapsed toggles that hold the current match
- Editor typography control with searchable font family dropdown and installed macOS font discovery where supported

## Blocks

- Paragraph
- Heading
- Toggle Heading
- Quote
- Callout: a box with an icon and nested blocks; Enter adds a line inside, Enter on an empty last line leaves it, and
  Backspace at the start of a line joins it to the text above inside the box. The
  icon comes from an emoji picker (filter, recent, random, categories) or an uploaded image, can be removed, and is
  edited from the icon or the block menu's Edit icon. A block dragged onto a callout's line or padding lands in its body
- Bullet List
- Numbered List
- Check List
- Toggle List
- Code Block
- Table
- File
- Image
- Video
- Audio

## Media tools

- Image blocks expose an app-level image toolbar after selection
- Image download uses the desktop save dialog
- Image crop replaces the selected image block with a cropped PNG data URL

## Local storage

Stored fields:

- note id
- BlockNote document JSON
- markdown fallback
- window bounds
- always-on-top flag
- app-wide tabs window state: `tabsWindow.alwaysOnTop` and `tabsWindow.bounds`, apart from every note
- note title
- app-wide theme: `appTheme.themeId`, one of the theme ids in `electron/themes.json`, with `appTheme.mode` (`light` or `dark`, the theme's
  scheme) kept so older versions fall back to the matching NotePane theme
- app-wide layout mode: `layoutMode`, either `tabs` or `sticky`
- app-wide editor defaults: default font family
- app-wide zoom: `editorPreferences.appZoom`, one of the zoom steps from 0.5 to 2
- optional sidebar tab accent color
- optional sidebar tab accent opacity
- per-note editor font family
- timestamps
