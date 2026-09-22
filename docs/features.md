# Features

## Desktop

- Multiple sticky windows
- Tab session mode: one primary window with sidebar note/session tabs
- Sticky mode: each session opens as an individual sticky window
- Switching into Sticky mode arranges sessions as compact sticky-note windows
- Closing an individual sticky window keeps it closed until Show All NotePanes or another Sticky-mode entry
- Sticky mode windows have per-session pastel color, opacity, pinning, layout, and editor controls in a header settings modal
- Sticky color/opacity carries back to the sidebar session tab color when returning to Tab session mode
- Drag a session tab outside the sidebar to detach it into a separate window
- Dock a detached sticky window back into tab sessions
- Custom NotePane shell
- Padded draggable header with no visible title in tab session mode
- Editable title in sticky mode header
- Session rename by double-clicking a sidebar tab
- Hover-only session delete button in the sidebar tab row
- Global Notion-style Light/Dark app theme via sidebar Preferences or shortcut
- Preferences panel via sidebar footer button, native app menu, or `Command/Ctrl + ,`
- Default editor font family and font size customization for newly created sessions
- Right-click session tab context menu for per-session tab color
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
- Toggle Light/Dark mode: `Command/Ctrl + Shift + L`
- Open export menu: `Command/Ctrl + Shift + E`
- Delayed hover tooltips for clickable controls
- Window bounds persistence
- Editor area is explicitly non-drag so BlockNote mouse interactions remain intact
- Single share-style export icon with PNG/PDF format choices
- PNG/PDF export hides app chrome and sticky background

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
- Table handles
- `Command/Ctrl + A` selects all editor blocks
- `Command/Ctrl + X` cuts/removes the current block when no text is selected
- Active editor-only typography control with searchable font family dropdown, installed macOS font discovery where supported, and 6-144px size presets/manual input

## Blocks

- Paragraph
- Heading
- Toggle Heading
- Quote
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
- detached/docked state
- note title
- app-wide theme mode: `appTheme.mode`, either `light` or `dark`
- app-wide layout mode: `layoutMode`, either `tabs` or `sticky`
- app-wide editor defaults: default font size scale and default font family
- optional sidebar tab accent color
- optional sidebar tab accent opacity
- per-note editor font size scale
- per-note editor font family
- timestamps
