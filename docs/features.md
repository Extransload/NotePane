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
- Theme picker in Preferences > General > App theme: preview cards that apply the theme at once to every window;
  All / Light / Dark chips and a name filter narrow the cards, and arrow keys move within the cards shown
- Every colour comes from the selected theme, code block syntax colours included
- Flat surfaces: menus, toolbars, the colour panel, sticky settings, toasts and the search palette draw one soft
  outer shadow and the theme's border, with no glass highlight along their top edge; buttons and the header are flat
  too
- Session and sticky colours are shown in each theme's tone (tone matching): the hue is kept, the stored colour never
  changes, and text on it stays readable
- No light/dark toggle and no light/dark shortcut; `Command/Ctrl + Shift + L` is unbound
- Preferences panel via sidebar footer button, native app menu, or `Command/Ctrl + ,`: a sidebar of pages (General,
  Editor, Trash, Shortcuts, each with an icon) beside the page, which scrolls on its own. A page is its title and
  cards of settings: General has Appearance (the theme picker) and Data (backup export and import), Editor has
  Typography (editor and app font) and Behaviour (table of contents), Trash and Shortcuts one card each
- Preferences > Shortcuts lists every command as a 40px table row: name, on/off switch, the keys (click to record
  new ones) and Reset
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
- Open export menu: `Command/Ctrl + Shift + E`. The menu opens at the sidebar's export button, or under the right
  end of the header when the sidebar is not shown, and the formatting toolbar of a text selection hides while it is
  open and comes back after
- Delayed hover tooltips for clickable controls
- Short entrance motion: menus, popovers and the colour panel fade in (the slash menu and NotePane's own menus also
  slide a few pixels from their anchor), the sidebar slides between its width and the compact rail, Preferences and
  search fade in, and a switched note fades in. The motion is off when the system asks for reduced motion and in
  print and export
- Short exit motion for NotePane's own overlays: the session tab and export menus, dropdowns, the colour panels,
  dialogs (Preferences, sticky settings, the trash and close confirmations, Markdown import, version history, crop),
  the search palette, the find bar, tooltips and the zoom gauge fade back toward where they came from, and a backdrop
  fades with its dialog. While it leaves, an overlay takes no clicks or focus and is hidden from assistive technology;
  with reduced motion it is removed at once. BlockNote's own menus close with a shorter fade (Editor motion, below)
- Toasts spring up from the bottom and sink away. A toast that replaces another, such as an export finishing, changes
  its text and dot colour in place. The undo toast shows the time it has left on a thin bar, and any toast waits while
  the pointer or keyboard focus is on it
- Buttons press in slightly, menu items and list rows ease their hover colour, the zoom gauge springs in and glides
  between steps, and picking a theme in Preferences cross-fades that window to the new colours (other windows switch
  at once, and no window fades on its first paint)
- Shortcut labels read the same everywhere NotePane shows them (Preferences, tooltips, slash menu badges, the
  formatting toolbar's merge and colour buttons): `⌘⌥⇧1` on a Mac, `Ctrl+Alt+Shift+1` elsewhere
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
- Table block menu (six-dot handle): fit to width (to the text column), header row and header column switches
- Wide tables, as in Notion: a top-level table whose columns add up to more than the text column keeps its left edge
  on the column and grows right, up to 24px short of the editor's edge (and short of the table of contents rail),
  before it scrolls. Tables in columns, lists and toggles stay inside their block
- Editor motion: a toggle's children open and close with their height and the chevron turns; blocks you create
  (Enter, the slash menu, a paste, a drop) rise in once, and a loaded or switched note does not; blocks moved by drag
  and drop or `Command/Ctrl + Shift + Up/Down` glide to their new place; a checklist box pops when it is ticked. The
  slash menu, the formatting and link toolbars, the six-dot block menu and the table handle menus close with a short
  fade that takes no clicks. All of it is off under reduced motion and in print and export
- The six-dot block menu stays inside the editor: when the sidebar leaves no room on the handle's left, it opens on its
  right
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
- 2 columns: two columns of blocks side by side, from the slash menu (`/columns`), outside a column only. Dragging
  the gutter between them resizes them in one undo step, and the ratio is saved with the note. Backspace at the start
  of a column stays in it; in an empty column it removes the column, and the other column's blocks stay in place. A
  marquee inside a column selects its blocks; one that also touches a block outside selects the whole layout.
  Markdown export writes the columns' blocks one after another
- Bookmark: a card for a web page with its title, description, site name and preview image on the right, from the
  slash menu (`/bookmark`, then paste an address and press Enter) or the six-dot menu's Turn into bookmark on a
  paragraph that is exactly one link. Pasting an address into an empty paragraph still gives a link. Clicking the card
  opens the page in the browser. The desktop app reads the page and keeps the preview image as a local asset; the
  browser preview shows the address alone. Markdown export writes `[title](url)`
- Bullet List
- Numbered List
- Check List
- Toggle List
- Code Block
- Divider: a thin rule from `/divider`, or from `---` or `***` typed on an empty line; the caret moves on to
  a line below it. Backspace on the empty line below selects it and Backspace again deletes it. Markdown writes it as
  `---` and reads `---`, `***` and `___`
- Equations, rendered with KaTeX in the theme's text colour: an inline equation (`/inline equation`) inside the text,
  edited in a small popover opened by clicking it, where Enter or Escape commits and an emptied one is removed; and a
  block equation (`/block equation`) in display mode, whose TeX editor opens on a click, keeps Enter as a new line
  and commits on Escape or when focus leaves it. A source KaTeX cannot parse shows as that source in the theme's
  error colour. Markdown writes `$...$` and `$$` blocks, and pasting or importing reads them back; `$5 and $10`
  and code stay text
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
