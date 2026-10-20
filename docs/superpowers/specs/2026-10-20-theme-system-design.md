# Theme System Design

## Goal

Replace the app-wide light/dark mode with a choice of named themes, as Table Peek does
(`../tablepeek/web/src/palette.ts`). The app ships nine themes:

- NotePane Light and NotePane Dark, which are today's light and dark colours, unchanged;
- Catppuccin Latte, Frappé, Macchiato and Mocha;
- Nord, Dracula and Tokyo Night.

Every visible colour in the app must come from the selected theme. Today it would not:

- `src/styles/tokens.css` writes about 110 tokens by hand for each mode, so each new theme would mean another 110
  hand-written values;
- outside the token blocks, `src/styles/*.css` holds 102 hard-coded colours, 47 neutral shadows or overlays, and 12
  `var()` fallbacks, including four hidden token blocks;
- about 68 sit in `src/style/themeStyles.js` and `src/constants.js`, including the sticky window base colours
  `#191919`/`#ffffff` and text colours `#37352f`/`#f7f7f4`;
- the Electron window background is fixed at `#f7f7f5` (`electron/main.cjs:205`, `:213`);
- code blocks are fixed to GitHub dark (`#0d1117`) in both modes.

The owner's requirement is that no colour is missed. Review cannot guarantee that, so the design makes it a
mechanical check (see Guards).

## Decisions made by the owner

- Several themes, one selected for the whole app.
- No light/dark switch. The `toggleThemeMode` command and its `Mod+Shift+L` shortcut are removed.
- Colours the user painted (sticky note colour, tab accent colour) are stored unchanged and are always displayed
  through tone matching: the hue is kept, and lightness and chroma are moved to the theme's own range.
- The structure below (theme data, derived tokens, CSS that uses tokens only, and a leak-detecting test theme).
- The sidebar wordmark keeps its brand colours in every theme (light PNG for light themes, dark PNG for dark themes).

## Non-goals

- Importing a theme from a URL or a file, and a custom theme editor. Themes are plain data so either can be added
  later.
- Following the system appearance. This would need a light theme and a dark theme chosen as a pair, which the owner
  declined.
- Per-note themes.
- Changing fonts, spacing or radii per theme. Themes carry colour only.
- Theming native OS chrome beyond the window background colour (native menus, traffic lights).

## Anti-goals

Any of these makes the change a failure, even if the feature works:

- NotePane Light or NotePane Dark changes a colour that NotePane designs today. That covers the token values,
  sticky windows and session tabs painted with each of the six default pastels, and every element whose colour
  comes from a NotePane token. Places that today show BlockNote's or the browser's own defaults are the exception:
  they become theme-driven and may change slightly (see "Allowed visible changes in NotePane Light and Dark").
- Stored note data is rewritten to change a user's colour.
- Any theme shows a NotePane grey, a GitHub-dark code block or another colour that did not come from the theme.
- Text becomes hard to read in any theme, including on a sticky window painted with any colour.

## Colour layers

```
theme definition (data, ~30 values)  ->  derived tokens (every --sticky-*, --notepane-*, --bn-* token)  ->  CSS
                                           ^
user colours  ->  tone matching  ---------/  (sticky shell and session tab styles)
```

### 1. Theme definition

A theme is data: `{ id, label, scheme, palette, overrides }`.

- `scheme` is `"light"` or `"dark"`. It is internal: it drives tone matching, BlockNote's `theme` prop, CSS
  `color-scheme`, and the default text colour choice. The user never sees it.
- `palette` holds the primitive colours, roughly:

| Group | Keys |
| --- | --- |
| Surfaces | window background, sidebar, header, panel/menu surface, hover surface |
| Lines | border, strong border (tables) |
| Text | text, muted text, faint/disabled text |
| Roles | accent (selection, focus, table focus), danger, success, warning |
| Named colours | gray, brown, red, orange, yellow, green, blue, purple, pink |
| Code | code background `codeBg` (the Shiki theme's background, except in NotePane Light and Dark), code text, code muted, and the syntax highlighting theme `codeTheme` (see Code blocks) |

- Catppuccin, Nord, Dracula and Tokyo Night take their values from the official palettes. Table Peek's
  `palette.ts` shows one way of assigning them to surfaces.
- Each theme must define all nine named colours. Where a palette has no exact match (Catppuccin has no brown or
  grey), the builder picks the closest palette colour, and the nine must stay visually distinct.
- `overrides` replaces individual derived tokens. NotePane Light and Dark use it to reproduce today's hand-tuned
  values exactly. Other themes should not need it; each use carries a comment saying why.

### 2. Derived tokens

`buildThemeTokens(theme)` returns every CSS custom property the stylesheets read. That is every token now in the two
`tokens.css` blocks, plus the tokens that replace the hard-coded literals listed in the inventory. Hover, border,
shadow, menu, table control, scrollbar and find-highlight values are computed from the palette. They are not
written per theme.

The renderer applies the result as custom properties on `document.documentElement`, together with
`data-theme-id`, `data-theme-scheme` and `color-scheme`. BlockNote menus are portalled to `document.body`, so they
inherit the tokens.

- The two literal blocks in `tokens.css` are removed.
- The `body.theme-light`/`theme-dark` and `.sticky-shell.theme-*` classes are removed. A rule that has to differ by
  scheme selects on `[data-theme-scheme]`, and only when a token cannot express the difference.
- Shadows are tokens too, because light and dark themes need different shadow strength.

### 3. CSS and JS use tokens only

No stylesheet or component writes a colour literal. `getStickyShellStyle` and `getSessionTabStyle` take the
resolved theme instead of `appThemeMode`. Their base colours, text colours, shadows and glass highlights come from
the theme. `SESSION_TAB_MODE_BASE_COLORS` and `MODE_TAB_TEXT_DEFAULTS` in `src/constants.js` are replaced by
theme values.

## Tone matching

User-painted colours are stored as hex and never rewritten. They are transformed only when rendered:
`toneMatch(hex, theme, role)`.

- **Hue** is kept. Work in OKLCH; add OKLab helpers to `src/style/colorMath.js` next to the existing CIE LCH ones.
- **Roles depend on what the colour fills, not on the widget.** A large filled area needs a quiet tint. A small mark
  can carry the theme's accent tone. *(Writer's call. The builder check found that targeting the accent median for
  tab fills makes Catppuccin Latte tabs saturated mid-tones, such as `#ba9700`, with no readable Latte text colour on
  them.)*

  | Role | Used for | Light scheme | Dark scheme |
  | --- | --- | --- | --- |
  | Fill | session tab background | pastel tint: lightness just below the theme window background, moderate chroma | median lightness and chroma of the theme's named colours: a bright pastel, as NotePane Dark's tabs are today. Mocha `#fff2b8` gives about `#dacd95`. |
  | Surface | sticky window background | the same pastel tint as Fill | dark tint: lightness just above the theme window background, low chroma. Mocha `#fff2b8` gives about `#3a3417`. |
  | Mark | search result dot, context menu swatch, accent dots | median lightness and chroma of the theme's named colours | the same |

  The note's stored opacity is then applied over the theme background, as today.
- **Neutral inputs** (chroma below about 0.02: whites, greys, blacks) map onto the theme's own neutral surfaces and
  text, keeping their relative lightness. A white note in Mocha uses Mocha surfaces.
- **Contrast:** the text colour on any filled result is chosen with the existing `getContrastingTextColor`. The
  theme's text colours are the candidates. If neither reaches 4.5:1, it falls back to pure black or pure white; for
  any colour, one of the two reaches at least 4.58:1.
  - **This applies to NotePane Light and Dark too.** Their output changes only for colours that are unreadable
    today. For example, a sticky painted pure red is at 3.7:1 with today's text pair `#37352f`/`#f7f7f4`.
  - **Readability over no-change:** this is where readability wins over "no visible change". *(Writer's call.)*
- **Targets are measured from the palette**, so a new theme needs no tuning. The exact offsets are the builder's
  call, held to the acceptance tests below.
- **NotePane Light and NotePane Dark** skip tone matching and keep today's behaviour: the pastels shown as they are,
  the 12% black mix on dark tabs (`SESSION_TAB_DARK_MODE_TONE_MIX`), and sticky blending over `#191919`/`#ffffff`.
  These colours were designed for those two themes. *(Writer's call.)* The contrast fallback above is the only
  change.
- **Named editor colours** (the text and background colours in the formatting menu) are stored by name. They map
  straight to the theme's named colours and do not go through tone matching. Background variants are derived from
  the named colour and the theme background.
- **Preferences swatches** (`src/ui/preferencesSections.jsx:170`) and the colour picker preview show the
  tone-matched colour, so what the user picks is what they see.

## BlockNote and Mantine

The audit found that BlockNote declares every `--bn-colors-*` variable on `.bn-root` and on
`.bn-root[data-color-scheme=dark]`. It puts the `bn-root` class on the editor container itself (`bn-root
bn-container`) and on its portal element. Verified in the prebundled `@blocknote/react` 0.52.1.

As a result, the `--bn-colors-*` values that NotePane sets on `body` and `.sticky-shell` never reach inside the
editor. NotePane works around this today by forcing the colour on content directly (`blocknote.css` 48–53) and by
redeclaring tokens on the menu dropdowns (`blocknote.css` 358–365, 472–476).

- **Set the variables on `.bn-root` itself.** The theme must set every BlockNote colour variable there, through a
  rule more specific than `.bn-root[data-color-scheme=dark]` that reads NotePane tokens. Passing a BlockNote theme
  object to `BlockNoteView` would also work. That includes the 18 `--bn-colors-highlights-{gray..pink}-{text,background}`
  variables, which colour the text and background colours in note content and which NotePane never sets today.
  These come from the theme's named colours.
  - **Spike result:** a `.bn-root.bn-root[data-color-scheme]` rule setting `--bn-colors-menu-background: red`
    reached both menus, in light and dark. The slash menu (`.bn-suggestion-menu`) painted red, and the side menu
    (`.bn-side-menu`, `.bn-side-menu .mantine-UnstyledButton-root`) resolved the variable to red; it paints no menu
    background, but its icons turned red when the same rule set `--bn-colors-side-menu`. Both menus live in the
    portal `.bn-root`, not in the editor's `bn-root bn-container`.
- **Picker icons** use `--notepane-editor-*` (`blocknote.css` 782–851). Derive them from the same named colours so
  the picker and the content agree.
- **`BlockNoteView theme`** (`main.jsx:3491`, `overlays.jsx` ~96) is set to the theme's `scheme`. It drives
  `data-color-scheme` and Mantine's palette, which is scoped to `.bn-mantine[data-mantine-color-scheme]` and supplies
  the primary blue, the `gray-2` suggestion menu border, dimmed text and chip hover. Those Mantine colours are
  overridden from tokens.
- **Hard-coded colours in `@blocknote/core` `Block.css`** that NotePane does not override yet:
  - blockquote and divider `#7d797a`;
  - the selected node outline `rgb(100,160,255)`;
  - the add-file button (light and dark greys);
  - resize handles `#000`/`#fff`;
  - the column-resize handle and table drop cursor `#adf`.

  Each is overridden from tokens.
- **The drop cursor** `#ddeeff` is an editor extension option. It is set from a token when the editor is created
  (`main.jsx` 963–1000).
- **Elements inside `.bn-root`** that today keep BlockNote's palette:
  - the slash menu and link toolbar;
  - the side menu icons;
  - the emoji grid;
  - the toggle arrow and the toggle "add block" button;
  - empty-block placeholders.

  The leak detector must open each of these.

## Code blocks

Today `codeBlockOptions` loads Shiki with `themes: ["github-dark", "github-light"]`, and the parser always takes
`getLoadedThemes()[0]`, so code is always GitHub dark. Shiki writes the token colours inline, and it sets
`--prosemirror-highlight`/`--prosemirror-highlight-bg`, which `blocknote.css` 99–103 reads before
`--sticky-code-bg`. The code block tool bar (`blocknote.css` 127–190) is literal dark glass.

- **Syntax colours:** each theme names a Shiki theme (`codeTheme`). NotePane Light and Dark name `github-dark`.
  The others name the matching theme bundled in `@shikijs/themes` 4.3.1: `catppuccin-latte`, `catppuccin-frappe`,
  `catppuccin-macchiato`, `catppuccin-mocha`, `nord`, `dracula`, `tokyo-night`.
  - **Why not one CSS-variables theme:** Shiki's CSS-variables theme maps scopes more coarsely than `github-dark`.
    It would therefore change NotePane's code colours, which the anti-goals forbid.
  - **The constraint:** `codeBlockOptions.createHighlighter` is replaceable, but the parser always uses
    `getLoadedThemes()[0]`.
  - **Route taken: highlight with the active code theme only, and re-highlight open code blocks when the theme
    changes.** This was the fallback. The multi-theme route (`themes: {…}`, `--shiki-<id>` variables selected by
    CSS) does reach the DOM through the parser, but Shiki tokenizes the whole block once per theme on every edit,
    so it was rejected (see Limitation).
  - **Highlighter:** `src/editor/schema.jsx` passes `createCodeBlockSpec({ ...codeBlockOptions, createHighlighter })`.
    `createHighlighter` awaits `codeBlockOptions.createHighlighter()`, which brings BlockNote's language bundle and
    loads `github-dark` and `github-light`. Any other code theme is loaded with
    `highlighter.loadTheme(() => import("@shikijs/themes/<id>"))`. It keeps the raw highlighter in a module variable
    and returns `{ ...highlighter, getLoadedThemes: () => [activeCodeTheme, ...the other loaded themes] }`. Nothing
    else is wrapped. `@shikijs/themes` is only a transitive dependency today, so it is added to `package.json`,
    pinned to 4.3.1.
  - **Selecting the colours:** the parser (`prosemirror-highlight` 0.15.3) evaluates `getLoadedThemes()[0]` on
    every call, so each highlight uses the code theme active at that moment. The output stays single-theme, as
    today: an inline `color` on each token, and `--prosemirror-highlight`/`--prosemirror-highlight-bg` on the block.
  - **Font styles stay dropped, as today.** Shiki's single-theme tokens carry `fontStyle` but no `htmlStyle`, so the
    parser writes only `color`. Observed: `github-dark` marks `# Title` bold and `*italic*` italic in Markdown, and
    every character rendered `font-style: normal`, `font-weight: 400`, `text-decoration-line: none`, both today and
    after the switch round trip. Catppuccin Mocha marks `// note` italic and goes through the same path, so it is
    dropped too. That case was confirmed in Shiki's tokens, not snapshotted in the DOM.
  - **Startup:** before its first editor renders, the window sets the module-level `activeCodeTheme` from the
    theme it starts with (the persisted one). `createHighlighter` loads that code theme before it resolves. The
    first highlight therefore never asks for a theme that is not loaded, which matters because Shiki throws on one
    (``Theme `x` not found``).
  - **Switching without a reload:** `createHighlighter` stores its promise in a module variable as it starts. The
    switch awaits that promise, loads the new code theme with `loadTheme`, and only then sets `activeCodeTheme` and
    re-highlights. If no code block has been highlighted yet, so the promise does not exist, setting
    `activeCodeTheme` is enough, because `createHighlighter` will load it. To re-highlight, each BlockNote editor of
    the window runs one `editor.transact((tr) => …)` that calls `tr.setNodeMarkup(pos, undefined, node.attrs)` on
    each `codeBlock` and sets `tr.setMeta("addToHistory", false)`. The editors are the window's `StickyEditor`
    editor (`useCreateBlockNote` in `src/main.jsx`) and, while it is open, the read-only version-history preview
    (`previewEditor` in `VersionHistoryPanel`, `src/ui/overlays.jsx`). Both use `schema`, so both share the
    highlighter. Both should run the same hook from `src/hooks/` when the active code theme changes; the spike
    exercised only the main editor. Editors mounted later highlight with the active theme on their own.
    - Verified empirically: replacing each code block with an equal node this way makes `prosemirror-highlight`
      re-parse it with the new theme. A `prosemirror-highlight-refresh` meta alone does not recolour. The source
      suggests the reason: the plugin's position cache keeps the decorations of unchanged nodes.
    - The document stays equal, so TipTap emits no `update` (0 events counted, against 1 for a real edit).
      BlockNote's `onChange` does not fire, the note is not saved, and undo is untouched.
    - The highlighter is never recreated: BlockNote caches its promise and the parser on `globalThis`
      (`Symbol.for("blocknote.shikiHighlighterPromise")`, `Symbol.for("blocknote.shikiParser")`).
  - **Code background:** for every theme except NotePane Light and Dark, `palette.codeBg` equals the background of
    that theme's Shiki theme. That keeps highlighted blocks (`--prosemirror-highlight-bg`) and plain text blocks
    (`--sticky-code-bg`) the same colour. The values are `catppuccin-latte` `#eff1f5`, `catppuccin-frappe`
    `#303446`, `catppuccin-macchiato` `#24273a`, `catppuccin-mocha` `#1e1e2e`, `nord` `#2e3440`, `dracula`
    `#282a36` and `tokyo-night` `#1a1b26`, plus `github-light` `#fff` for test themes. NotePane Light and Dark keep
    today's split exactly: highlighted blocks paint Shiki's `github-dark` `#24292e` through
    `--prosemirror-highlight-bg`, and plain text blocks paint `#0d1117` through `--sticky-code-bg`.
    *(Controller's ruling after the spike.)*
  - **Limitation:** the switch must reach every editor in the window, and each sticky window is its own renderer and
    re-highlights its own editors. Export renders with NotePane Light, so it switches the code theme to
    `github-dark` before the capture and back after it, the same way (see Export). The rejected route was measured:
    typing one character in a 200-line TypeScript block costs about 36 ms with one theme, 142 ms with four and
    325 ms with all nine code themes.
  - **NotePane colours unchanged:** checked in the rendered DOM of a JavaScript, Python, Markdown, CSS and plain
    text block: the computed `color`, `font-style`, `font-weight` and `text-decoration-line` of all 385 characters,
    and the background and colour of each block and its `pre`. Today's build and the new highlighter after switching
    to `catppuccin-mocha` and back are identical: `const` is `rgb(249, 117, 131)` (`#f97583`), a highlighted
    block's background is `rgb(36, 41, 46)` (`#24292e`, Shiki's `github-dark` background), and a plain text block's
    is `rgb(13, 17, 23)` (`#0d1117`, `--sticky-code-bg`).
- **Spiked** in Task 1. The route above is the result. *(Updated after the spike.)*
- **Code block tool bar:** it takes tokens.
- **NotePane Light and Dark:** they keep today's GitHub dark code block.

## Export

PNG and PDF export forces light colours today (`body.is-exporting`, `overlays.css` 180–306), whatever the mode.
Keep that behaviour: export renders with the NotePane Light theme's tokens, applied for the duration of the export,
instead of the literal block. *(Writer's call: exports stay printable and look the same whatever theme is selected.)*
Code blocks follow NotePane Light's `codeTheme`: the export switches the active code theme to `github-dark` and
re-highlights before the capture, then switches back after it (see Code blocks).

Applying the whole theme also sets the highlight colours. Today the export block never sets them, so a dark-mode
export probably keeps dark highlight colours (inferred by the audit, not reproduced).

## Allowed visible changes in NotePane Light and Dark

The owner's requirement is that every colour comes from the theme. Some places in NotePane Light and Dark today
show a library or browser default instead of a NotePane colour. Making them theme-driven is the purpose of the
change, so they may change slightly in the two NotePane themes. *(Writer's call, following from that requirement.)*

- **Inside `.bn-root`:** the slash menu, link toolbar, side menu icons, emoji grid, toggle controls and empty-block
  placeholders, which use BlockNote's palette today.
- **`Block.css` literals:** blockquote and divider `#7d797a`, the selected node outline, the add-file button,
  resize handles, `#adf`, and the drop cursor `#ddeeff`.
- **Browser defaults:**
  - text selection;
  - checkbox `accent-color` (system blue today, following the macOS accent setting);
  - the caret;
  - input placeholders;
  - focus rings.
- **The Windows window background** `#f7f7f5`, which becomes the theme's window background.
- **The contrast fallback** for painted colours that are unreadable today (see Tone matching).

For each of these, the NotePane theme should pick the nearest existing NotePane token, not copy the library value.

**The regression baseline** has three parts, all captured in step 1 before any refactor:

1. token values;
2. sticky and tab style output for the six pastels;
3. a computed-style capture of the elements whose colour already comes from NotePane tokens.

The elements listed in this section are excluded from that baseline. They are checked by the leak detector instead.

## Browser-native colours

The theme sets each of these from tokens. None is set at the root today.

- `color-scheme` on the root;
- `accent-color` (checklist and Trash checkboxes, which are system blue today);
- `::selection` everywhere, keeping the transparent selection during block selection;
- `caret-color`;
- `::placeholder` for the find, search and font inputs;
- focus rings.

## Theme picker

- **Placement:** Preferences > General > App theme replaces `HeaderModeSwitch`
  (`src/ui/preferencesWindow.jsx:194`) with a grid of preview cards, like Table Peek's `SettingsModal`.
- **Card contents:** each card shows a small window drawn with that theme's background, sidebar, header, text lines
  and named-colour dots, and the theme name.
- **Applying a theme:** clicking a card applies it at once in every window through the existing broadcast.
- **Semantics:** the grid is a radio group. Each card has `role="radio"`, `aria-checked`, arrow-key movement and
  `data-testid="theme-card-<id>"`.
- **Description:** the section text changes from "Light and dark mode are global for the whole app." to say the
  theme applies to every window.
- **Default:** for a new install, NotePane Light, which is today's default.

## Removing the light/dark switch

Remove `toggleThemeMode` everywhere:

- `src/constants.js:82` and `electron/store.cjs:172` (defaults);
- `src/ui/preferencesSections.jsx:407` (the shortcut list);
- `src/hooks/useKeyboardCommands.js:95` (the handler);
- the shortcut hint passed to `HeaderModeSwitch`;
- the `HeaderModeSwitch` component in `src/ui/controls.jsx` and its CSS, if nothing else uses it;
- `onAppThemeModeChanged` and its wiring in `src/main.jsx`.

`normalizeKeyboardShortcuts` only iterates known command ids, so a stored custom binding for the removed command is
dropped on load without a migration. `Mod+Shift+L` is left unbound.

Update `docs/features.md`, `docs/usage.md` and `docs/architecture.md`, which describe `appTheme.mode` and the toggle.
`scripts/verify-dist.mjs:54` requires the string `"HeaderModeSwitch"` in the built bundle. Change it to check for the
theme picker instead. Because this edits a verification script, `AGENTS.md` requires the full `npm run verify`.

## Persistence and IPC

- **Stored shape:** `appTheme` becomes `{ themeId, mode }`. `mode` is written as the theme's scheme only so that an
  older app version, or an older build restoring a backup, still gets a sensible light or dark fallback.
  *(Writer's call.)*
- **Reading `appTheme`:**
  - a known `themeId` wins;
  - otherwise `mode: "dark"` maps to `notepane-dark`, and anything else to `notepane-light`;
  - an unknown `themeId`, for example after a downgrade, falls back by `mode`.
- **Legacy and backup paths:** `inferLegacyAppTheme` and backup import go through the same normalisation. Old
  backups therefore restore to the matching NotePane theme, and the backup format version stays 1.
- **IPC:** the channels `app-theme:get`, `app-theme:update` and `app-theme:changed` keep their names, and only the
  payload changes. The renderer's `normalizeAppTheme` in `src/model/preferences.js` and the store's copy must
  agree; a unit test covers both.

## Electron

- **Window background:** on Windows, `BrowserWindow` `backgroundColor` uses the current theme's window background,
  so a dark theme does not flash light when a window opens. Windows are transparent on macOS and Linux (`#00000000`),
  and they stay transparent.
- **Single source:** the main process must read theme data from the same source as the renderer. It must not keep a
  second copy of theme colours. Where the shared data lives is the builder's call.

## Inventory of colour sources to migrate

A read-only audit on 2026-10-20 found the following. Line numbers are as of commit `77f2b36`. The guards below are
the authority; this list is the starting point, not a substitute for them.

### Stylesheets

| Class | Count | Where |
| --- | --- | --- |
| Real hard-coded colour | 102 | mostly `overlays.css` (48), `chrome.css` (20), `blocknote.css` (11), `editor-surface.css` (8), `controls.css` (7) |
| `var()` fallback only | 12 | `chrome.css` version history panel (229–260), `blocknote.css:431` |
| Neutral shadow, overlay or highlight | 47 | spread across all files |

Four hidden token blocks sit outside `tokens.css`. Each must become derived tokens or be removed:

| Block | Location | Notes |
| --- | --- | --- |
| Sticky layout first-paint defaults | `chrome.css` 282–321 (`.sticky-shell.layout-sticky`) | light only. Mostly overwritten by `getStickyShellStyle` at runtime, but it is what renders before that runs. |
| Export colours | `overlays.css` 180–306 (`body.is-exporting`) | light only. Only the `!important` rules at 285–306 take effect, because `.sticky-shell` redeclares the variables. |
| Find highlights | `tokens.css` 300–308 | |
| Tooltips | `editor-surface.css` 605–642 | uses `body.theme-dark` selectors |

Other literal colours:

- **Status and accent colours:**
  - toast dots `overlays.css` 37–42;
  - find no-match border `search.css:45`;
  - Markdown import error `preferences.css:129`;
  - import button tint `preferences.css:316`;
  - selected pastel swatch border `preferences.css:961`;
  - block menu icons `blocknote.css` 423, 427;
  - form popover focus `blocknote.css` 504–505;
  - code block tool states `blocknote.css` 127–190;
  - colour wheel focus ring `controls.css:161`;
  - slider thumbs `controls.css` 232, 278;
  - `.loading` text `editor-surface.css:726`.
- **Light-only brand tokens:** `--brand-*` is declared in the light block only, and `--brand-pastel-sky` is used in
  every mode (`sidebar.css:165`).
- **Light block as hidden base:** today the light block's selector includes a bare `.sticky-shell`. It is therefore
  the base for every mode, and any token a dark definition forgets silently falls back to light. Runtime tokens
  remove this trap.
- **To be deleted with the switch:** the `HeaderModeSwitch` track and icon colours (`controls.css` 102–121).
- **Allowlisted as theme-independent** (they draw over images or are colour-picking tools):
  - the colour wheel canvas, the brightness gradient and the checkerboard in `controls.css`;
  - the crop dialog frame and handles (`overlays.css` 103–145).

### JavaScript

| Location | What it fixes |
| --- | --- |
| `src/style/themeStyles.js:116` | sticky base background `#191919`/`#ffffff` |
| `themeStyles.js` 118–146 | text pair `#37352f`/`#f7f7f4`. "Is the background light" is decided by comparing `textColor === "#37352f"` as a string, which must become a luminance or scheme check. |
| `themeStyles.js` 79–83 | dark tab tone mix. `SESSION_TAB_MODE_BASE_COLORS[mode] ?? light` silently falls back to light for an unknown id. |
| `themeStyles.js` 187–249 | shadows, controls, code colours, selected and icon colours. The glass variables (206–213) are emitted, but no CSS reads them, so they can be dropped. |
| `src/constants.js` 207–236 | `MODE_TAB_TEXT_DEFAULTS`, `SESSION_TAB_MODE_BASE_COLORS`, `SESSION_TAB_CONTRAST_TEXT`, `SESSION_TAB_DARK_MODE_TONE_MIX` |
| `src/style/colorMath.js` 32–36 | `hexToRgb` accepts only six-digit hex and silently returns `#37352f` otherwise. Theme palette values must therefore be six-digit hex, with alpha applied separately. |
| `src/main.jsx` 1361–1370, 2998–3001 | the `theme-*` classes and `data-theme-mode` |
| `main.jsx:3491`, `src/ui/overlays.jsx` ~96 | the two `BlockNoteView theme=` props (editor and version history) |
| `src/ui/SearchPalette.jsx:119` | the result dot uses the raw `tabTextColor` and ignores the default pastel. Switch it to the resolved, tone-matched accent. |
| `src/ui/menus.jsx` 28, 49 and the `ColorPanel` default in `main.jsx` 3567–3592 | user colour swatches, which go through tone matching |

SVG icons are all `currentColor`. `src/hooks/` and `src/utils/` contain no colours.

### Electron

- `BrowserWindow` `backgroundColor` `#f7f7f5` is used on Windows only (`electron/main.cjs` 205, 213). On macOS and
  Linux, windows are transparent.
- `main.cjs` 41–48 duplicates `STICKY_PASTEL_PALETTE`, and `createDefaultStickyTheme` (289–299) persists a pastel
  into new notes. These pastels are user-colour defaults, not theme colours. They stay, and either share one source
  with `src/constants.js` or are allowlisted.
- There is no `nativeTheme`, so OS menus and dialogs follow the OS. That stays out of scope.
- `electron/store.cjs` 1279–1302 `normalizeAppTheme` accepts only `light`/`dark`.

### Other

- The wordmark is two multi-colour PNGs with baked brand colours (`assets/notepane-wordmark*.png`). They are swapped
  by the `theme-dark` class (`chrome.css` 65–77, `src/ui/icons.jsx` 1–33). **The owner decided to keep the logo as
  it is:**
  - the light PNG for light-scheme themes, and the dark PNG for dark-scheme themes;
  - the swap selects on `[data-theme-scheme]` instead of `theme-dark`;
  - the brand purple is kept in every theme, on purpose. The wordmark is a documented exception to the leak
    detector, which skips image pixels in any case.
- The template image URL bakes `1f2937/f8fafc` (`store.cjs:90`, `src/editor/schema.jsx:91`). It is content, and
  it stays.

## Guards

These are what make "no colour is missed" true. They come first in the work order, so each later step is checked
as it lands.

### `npm run check:colors`

A script beside `scripts/check-refs.mjs`:

- **Scope:** scans `src/**/*.{css,js,jsx}`, `electron/**/*.cjs` and the HTML entry files.
- **What it rejects:** any colour literal (hex, `rgb()`, `hsl()`, `oklch()`, named colours in colour properties,
  and literals inside `color-mix()`) outside the theme definition files and a short allowlist.
- **The allowlist:** each entry states its reason. Expected entries are `transparent`, `currentColor`, the
  transparent sticky window background, and the white/black endpoints in colour maths, which should be named
  constants in `colorMath.js`.
- **Where it runs:** in `verify:quick` and `verify`, right after `check:refs`.

### Unit tests (`tests/unit/themes.test.cjs`)

They load renderer modules with dynamic `import()`, as `tests/unit/search.test.cjs` does.

- **Completeness:** every theme defines every palette key. Ids are unique.
- **Token coverage:**
  - `buildThemeTokens` returns the same key set for every theme;
  - every custom property that a stylesheet reads with `var(--…)` is either produced by `buildThemeTokens` or
    defined locally by a rule;
  - this catches a stylesheet reading a token that no theme defines.
- **Contrast:** for every theme, text on the window, sidebar and panel backgrounds is at least 4.5:1, and muted
  text is at least 3:1.
- **Tone matching, for every theme:** run over a grid of inputs: the six default pastels, pure primaries, white,
  black and greys.
  - hue is kept within a few degrees for chromatic inputs;
  - neutral inputs stay neutral;
  - the chosen text colour on every Fill and Surface result is at least 4.5:1, including NotePane Light and Dark;
  - session tab text on the tab fill, active and inactive, meets the same bar;
  - distinct pastels stay distinct.
- **No regression:** for NotePane Light and Dark, check the three-part baseline described in "Allowed visible
  changes in NotePane Light and Dark":
  - `buildThemeTokens` output equals today's `tokens.css` values;
  - sticky and tab output for the six pastels, at default and reduced opacity, equals today's;
  - the computed-style capture runs in E2E.

### Leak detector E2E (`tests/e2e/renderer/theme.spec.mjs`)

- **Two sentinel themes:** two test-only themes of the same scheme, whose palettes share no colour value. They are
  never listed in the production picker.
- **The check:** the same screens are rendered under each sentinel. For every element, compare the computed
  colours:
  - `color` and `background-color`;
  - the four border colours, `outline-color` and the box-shadow colours;
  - `fill`, `stroke`, `caret-color` and `text-decoration-color`;
  - the same properties on `::before`/`::after` and on placeholders.
- **What counts as a leak:** any visible colour that is identical under both sentinels did not come from the theme.
  The test reports it with its selector. Fully transparent values and image pixels are excluded.
- **Why it compares two themes:** this catches derived and `color-mix()` values, which a fixed list of expected
  colours would miss.
- **Runs:** once with a pair of light sentinels and once with a pair of dark sentinels.
- **Screens covered:**
  - the tabs window with the sidebar;
  - a note containing headings, lists, a toggle, a table with a cell selection, a highlighted code block, inline
    code, a link, an image, and text and background in each named colour;
  - the slash menu, formatting toolbar, colour menu, side menu and drag handle, and the table handle menu;
  - the find bar with matches, and the search palette;
  - every Preferences section;
  - version history, Trash, the crop dialog and toasts;
  - a sticky layout window painted with a pastel;
  - scrollbars.

Plus a per-theme check that the picker applies the theme to every open window and that the choice survives a
restart (Electron suite).

### Existing tests

About 80 assertions across the E2E specs check exact RGB values:

- `appearance.spec.mjs`, `editor-text.spec.mjs`, `editor-tables.spec.mjs`, `export-import.spec.mjs`,
  `session-sidebar.spec.mjs` and `electron.spec.mjs`;
- the contrast helpers in `tests/e2e/support/renderer-helpers.mjs`.

Almost all of them check NotePane Light or Dark values, which must not change. They stay as they are and act as
regression guards. Only these change:

- assertions about switching modes;
- assertions on the `appTheme.mode` shape (`electron.spec.mjs` 89, 205, 286, 2121);
- `tests/unit/store.test.cjs` 207–223, which expects `mode: "solarized"` to become `"light"`. Rewrite it for
  unknown theme ids.

If a NotePane Light or Dark colour assertion fails, treat it as a regression. Do not relax the assertion to make it
pass.

## Work order

0. Spike: done (Task 1). Code blocks highlight with the active code theme only and are re-highlighted when the
   theme changes (see Code blocks). Setting `--bn-colors-*` on `.bn-root` reaches the slash menu and the side menu
   (see BlockNote and Mantine).
1. Capture the NotePane Light and Dark snapshots (tokens, sticky and tab styles), then add `check:colors` in
   report-only mode.
2. Add the theme definition model and `buildThemeTokens`, reproducing NotePane Light and Dark exactly. Apply the
   tokens at runtime and remove the `tokens.css` literal blocks and the theme classes.
3. Migrate the hard-coded literals, file by file, from the inventory. Then make `check:colors` blocking.
4. Make the sticky and tab styles read the theme, and add tone matching.
5. Add the seven new themes and the code block themes.
6. Build the picker, the persistence change and the `toggleThemeMode` removal.
7. Make the Electron window background follow the theme.
8. Add the leak detector E2E and update the docs.

This is Tier 3 under `AGENTS.md` (persistence, IPC, cross-cutting styles): focused tests while iterating, and
`npm run verify` once at the end.

## Left to the builder

- The exact derivation formulas for tokens, and the tone-matching offsets, held to the tests above.
- The named-colour assignment for palettes without a brown or grey.
- The preview card design, within the description above.
- Where the theme data shared by the renderer and the main process lives.
- How the sentinel themes are registered for tests only.
