# Usage guide

[Back to README](../README.md)

The shortcuts below use the default macOS bindings: `⌘` is Command,
`⌥` is Option, and `⇧` is Shift. On Windows, use Ctrl for Command and Alt
for Option. Configurable shortcuts can be changed in Preferences.

### Sessions and windows

| Shortcut | Action |
| --- | --- |
| `⌘T` / `⌘N` | New session |
| `⌘1` … `⌘9` | Jump to a session |
| `⌘⌥←` / `⌘⌥→` | Previous / next session, wrapping at the ends |
| `⌘W` | Close the current session tab |
| `⌘⇧[` / `⌘⇧]` | Move the current session along the sidebar |
| `⌘⇧B` | Show or hide the sidebar |
| `⌘⇧T` | Switch between Tab sessions mode and Sticky windows mode |
| `⌘⇧0` | Show every sticky window again |
| `` ⌘` `` | Cycle sticky windows |
| `⌘⇧P` | Keep the current window above others |

### Writing

| Shortcut | Action |
| --- | --- |
| `/` | Open the block palette |
| `Enter` / `Shift+Enter` | New block / line break inside a block |
| `⌘A` | Select the whole note; in a table, the cell text, the cell, the table, then the note; in a code block, its code |
| `⌘P` | Search every note and jump to a match |
| `⌘F` | Find in the current note (`Enter` / `⇧Enter` to step, `Esc` to close) |
| `⌘X` | Cut the current block when nothing is selected |
| `⌘⇧W` | Toggle the wide canvas |
| `⌘⇧O` | Table of contents |
| `⌘↩` | Move focus back into the editor |

### Appearance and output

| Shortcut | Action |
| --- | --- |
| `⌘,` | Preferences |
| `⌘⇧E` | Export menu |
| `⌘=` / `⌘-` / `⌘0` | Zoom the whole app in, out, or back to 100% |

Zoom works like Notion's: every window scales together, from 50% to 200%, and
the zoom is kept after a restart. While you zoom, a gauge at the top of the
editor shows where the zoom sits between the smallest and the largest step.

Choose the app theme in Preferences > General > App theme. 52 themes are
available: NotePane Light (the default), NotePane Dark, Catppuccin Latte,
Frappé, Macchiato and Mocha, Nord, Dracula and Tokyo Night, then 43 palettes
adapted from TablePeek. Click a card, or
move between cards with the arrow keys, and the theme applies at once to every
window. There is no separate light/dark toggle and no light/dark shortcut:
pick a light or a dark theme instead.

Per-session colour is set from a tab's
right-click menu, with a colour wheel, opacity, an eyedropper where the
browser supports it, and editable HEX/HSL/RGB/LCH values. That colour becomes
the sticky window's background in Sticky windows mode and returns to the tab in Tab sessions
mode. Each theme shows it in its own tone, keeping the hue and keeping the
text on it readable; the colour you picked is stored unchanged, so switching
themes never loses it.

Export produces a PDF of the note with all app chrome removed, or an editable
Markdown file. A PDF uses NotePane Light's colours whatever theme is selected.
