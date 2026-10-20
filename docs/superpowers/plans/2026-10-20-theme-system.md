# Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the light/dark mode with nine selectable themes (NotePane Light/Dark, Catppuccin ×4, Nord, Dracula,
Tokyo Night) in which every visible colour comes from the selected theme, enforced by two mechanical ratchets.

**Architecture:** Theme definitions are data in `electron/themes.json`, read by both the renderer and the main
process. `buildThemeTokens(theme)` derives every CSS custom property from a theme. A layout effect applies those
properties to `document.documentElement`, and stylesheets read tokens only. User-painted colours pass through
`toneMatch()` when rendered. A static scan (`check:colors`) and a two-sentinel E2E leak detector each start from a
checked-in list of known leaks that may only shrink, and both lists must be empty at the end.

**Tech Stack:** React 19, BlockNote 0.52.1 (Mantine UI), Shiki 4.3.1 via `@blocknote/code-block`, Electron 43, Vite 8,
Playwright, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-20-theme-system-design.md`. Read it before any task. The spec's
"Allowed visible changes in NotePane Light and Dark" and "Tone matching" sections govern every judgement call
below.

## Global Constraints

- **Theme ids and labels** are exactly the following, in picker order:
  - `notepane-light` "NotePane Light", `notepane-dark` "NotePane Dark";
  - `catppuccin-latte` "Catppuccin Latte", `catppuccin-frappe` "Catppuccin Frappé",
    `catppuccin-macchiato` "Catppuccin Macchiato", `catppuccin-mocha` "Catppuccin Mocha";
  - `nord` "Nord", `dracula` "Dracula", `tokyo-night` "Tokyo Night".
- **Defaults:** the default theme is `notepane-light`. NotePane Light and Dark use `codeTheme: "github-dark"`.
- **Palette values** are six-digit lowercase hex, because `hexToRgb` reads nothing else. `overrides` values may be
  any CSS colour or shadow string.
- **Stored shape:** `appTheme` is `{ themeId, mode }`. `mode` always equals the theme's `scheme`.
  - Reading: a known `themeId` wins.
  - Otherwise `mode: "dark"` gives `notepane-dark`, and anything else gives `notepane-light`.
  - The backup format version stays 1.
- **IPC channels** keep their names: `app-theme:get`, `app-theme:update`, `app-theme:changed`.
- **Removals:** `toggleThemeMode`, its default `Mod+Shift+L`, and `HeaderModeSwitch` are deleted.
  `Mod+Shift+L` stays unbound.
- **Stored note colours** (`note.theme.tabTextColor`, `tabTextOpacity`, block colour names) are never rewritten.
- **NotePane Light and Dark** keep today's colours, except the categories in the spec's "Allowed visible
  changes". A failing NotePane colour assertion in an existing spec is a regression. Never loosen it.
- **The wordmark** keeps its brand PNGs: the light PNG for `scheme: "light"`, the dark PNG for `scheme: "dark"`.
- **Code placement** follows `AGENTS.md`:
  - logic lives in `src/style/`, `src/model/` and `src/hooks/`;
  - `src/main.jsx` gets composition only;
  - CSS goes in the owning file in `src/styles/`, and the `@import` order in `src/styles.css` is never changed.
- **UI copy** is English and matches the app: the section title "App theme", the description "The theme applies to
  every window.", and the radio group label "App theme".
- **Validation** is Tier 3:
  - run focused tests while iterating;
  - run `npm run check:refs` after moving code between files;
  - run `npm run verify` once, in Task 11;
  - the six-dot menu highlight test is a known load flake, so rerun it once before investigating it.
- **Setup:** this checkout's `node_modules` lacks `@blocknote/*`. Run `npm ci` before Task 1. If you work in a
  parallel checkout, set `NOTEPANE_TEST_PORT`.
- **Commits:** commit at the end of each task only if the owner has approved commits for this branch. Otherwise
  leave the changes staged and report them.

## Review Focus

1. **A new window opened while a dark theme is selected never shows a light frame.**
   - The main process passes `themeId` in the window URL, and the entry script applies the tokens before React
     mounts.
   - Test in Task 4: the Electron spec checks `document.documentElement.dataset.themeId` at `domcontentloaded`.
2. **Stored note colours at low opacity, neutral colours and extremes stay readable in every theme.** Examples:
   `tabTextOpacity: 0.35`, `#808080`, `#000000`, `#ffffff` and `#ff0000`.
   - Test in Task 8: tone-matching grid × opacity {1, 0.6, 0.35}.
3. **An unknown `themeId` (from a newer build, or a hand-edited `notes.json` or backup) falls back by `mode`**,
   and the app starts.
   - Test in Task 4: `tests/unit/store.test.cjs`.
4. **Exporting while Catppuccin Mocha is active produces NotePane Light colours,** including highlights and the code
   block.
   - Test in Task 6: `export-import.spec.mjs`.
5. **Changing the theme in one window updates an already-open second window,** including its portalled formatting
   toolbar root, without a reload.
   - Test in Task 10: `electron.spec.mjs`.

---

### Task 1: Spike the two technical unknowns (throwaway)

This task has no tests and no production code. It ends with a written decision.

**Files:**
- Modify: `docs/superpowers/specs/2026-10-20-theme-system-design.md` (the "Code blocks" section, which records the
  route taken)

- [ ] **Step 1: Run `npm ci`**, then `npm run build`. Expected: the build succeeds.
- [ ] **Step 2: Try the code-block route on a throwaway branch.** Replace `codeBlockOptions.createHighlighter` in
  `src/editor/schema.jsx:241` with a highlighter that loads two themes from `@shikijs/themes` 4.3.1:
  `github-dark` and `catppuccin-mocha`.
  - **Check the preferred route:** can Shiki's multi-theme output (`themes: { … }`, emitting `--shiki-<name>`
    variables) reach the DOM through BlockNote's parser? The parser calls the highlighter with
    `getLoadedThemes()[0]` (see the spec).
  - **If not, check the fallback route:** recreating the highlighter with the active theme first, then forcing the
    open code blocks to re-highlight (for example by re-setting the editor content, or with a no-op transaction on
    each code block), must recolour existing code without a reload.
- [ ] **Step 3: Check the `.bn-root` bridge.** Add one rule, `.bn-root.bn-root[data-color-scheme] {
  --bn-colors-menu-background: red; }`, and open the slash menu and the side menu. Expected: both turn red.
- [ ] **Step 4: Record the decision.** Write the chosen code-block route into the spec's "Code blocks" section,
  replacing "Preferred route/Fallback route" with the route taken and the exact mechanism. Discard the throwaway
  branch.

**Interfaces:**
- Produces: the code-block route that Task 9 implements.

---

### Task 2: Baselines and the `check:colors` ratchet

All captures run on unmodified code. Nothing in `src/` changes in this task.

**Files:**
- Create: `scripts/capture-theme-baseline.mjs`
- Create: `tests/unit/fixtures/theme-baseline.json` (generated)
- Create: `tests/unit/themeBaseline.test.cjs`
- Create: `tests/e2e/renderer/theme-baseline.spec.mjs`
- Create: `tests/e2e/fixtures/notepane-computed-baseline.json` (generated)
- Create: `scripts/check-colors.mjs`
- Create: `scripts/check-colors-allowlist.json`
- Create: `scripts/check-colors-known.json` (generated ratchet)
- Modify: `package.json` (`scripts`)
- Modify: `tests/e2e/support/renderer-helpers.mjs` (add `selectAppTheme`)

**Interfaces:**
- **Produces `tests/unit/fixtures/theme-baseline.json`**, with this shape:
  ```json
  { "tokens": { "light": { "--name": "value" }, "dark": { "--name": "value" } },
    "sticky": [ { "noteTheme": {}, "accentColor": "#rrggbb", "mode": "light", "style": {} } ],
    "tabs":   [ { "noteTheme": {}, "noteIndex": 0, "mode": "dark", "style": {} } ] }
  ```
  - **Light tokens:** the union of the `body.theme-light, .sticky-shell` block and the `.sticky-shell` find block
    (`tokens.css` 300–303).
  - **Dark tokens:** the light tokens overlaid with the dark block and the dark find block (305–308).
  - **Values:** whitespace is collapsed to single spaces.
  - **Sticky entries:** produced with `getStickyShellStyle(noteTheme, accentColor, mode)` for every pastel in
    `STICKY_PASTEL_PALETTE` plus `#ff0000` and `#808080`, × `tabTextOpacity` {1, 0.6, 0.35} × mode {light, dark}.
  - **Tab entries:** produced with `getSessionTabStyle(noteTheme, mode, noteIndex)` for `tabTextColor` ∈
    {null, each pastel} × the same opacities × modes × `noteIndex` {0, 3}.
- **Produces `selectAppTheme(page, themeId)`** in `renderer-helpers.mjs`. Until Task 10 it supports only
  `notepane-light` and `notepane-dark`: it presses `modifierShortcut("Shift+L")` when the current
  `document.body.dataset.themeMode` (after Task 4, `document.documentElement.dataset.themeScheme`) differs from the
  target. Task 10 reimplements it through the picker.
- **Produces `npm run check:colors`:**
  - It exits 1 when it finds a colour literal not covered by the allowlist or the known list. It also exits 1
    when a known entry no longer occurs, which prints "remove from check-colors-known.json".
  - It runs with `--write-known` to regenerate the known list. That flag is used only in this task.

- [ ] **Step 1: Write `scripts/capture-theme-baseline.mjs`** to produce the fixture above. It parses `tokens.css`
  with a small brace-matching reader, not a CSS library, and imports `src/style/themeStyles.js` and
  `src/constants.js` with dynamic `import()`. Run it with `node scripts/capture-theme-baseline.mjs`. Expected:
  the fixture is written, with more than 100 tokens per scheme, 48 sticky entries and 84 tab entries.
- [ ] **Step 2: Write `tests/unit/themeBaseline.test.cjs`** with one test, "baseline fixture matches current
  output". It regenerates the sticky and tab entries in memory and `assert.deepEqual`s them against the fixture.
  This test is replaced in Task 8; here it proves the fixture is reproducible. Run `npm run test:unit`. Expected:
  PASS.
- [ ] **Step 3: Write `tests/e2e/renderer/theme-baseline.spec.mjs`.** It defines `BASELINE_TARGETS`, a list of
  `{ name, locator, setup? }` for elements whose colour comes from NotePane tokens today:
  - the session sidebar and active tab;
  - the editor surface text, a heading, and inline code;
  - text and background in each of the nine named colours (insert them through the formatting toolbar's colour
    menu);
  - the table border, the formatting toolbar, the Preferences dialog surface and its section titles;
  - the find bar;
  - a toast;
  - the sticky header.

  For each target it reads `color`, `background-color`, `border-top-color` and the `box-shadow` colour, in
  `notepane-light` and then `notepane-dark` (via `selectAppTheme`).
  - **Capture mode:** with `NOTEPANE_CAPTURE_BASELINE=1`, the spec writes
    `tests/e2e/fixtures/notepane-computed-baseline.json`.
  - **Normal mode:** without the variable, the spec asserts equality per target and property, and names the target
    on failure.
  - **Exclusions:** elements in the spec's "Allowed visible changes" list are not targets.

  Run it with `NOTEPANE_CAPTURE_BASELINE=1 npx playwright test tests/e2e/renderer/theme-baseline.spec.mjs`, then
  without the variable. Expected: both PASS.
- [ ] **Step 4: Write `scripts/check-colors.mjs`.**
  - **Scope:** `src/**/*.{css,js,jsx}`, `electron/**/*.cjs` and `index.html`. It skips `electron/themes.json` and
    `src/style/sentinelThemes.js`.
  - **Patterns:** `#[0-9a-fA-F]{3,8}\b`, `\brgba?\(`, `\bhsla?\(`, `\boklch\(`, `\blch\(`, and the named
    colours `white`, `black`, `red`, `blue`, `gray`, `grey` used as a value in a CSS colour property.
  - **Entries:** each finding is `{ file, line, text }`. A known entry matches on `file` and trimmed `text`, not on
    the line number, so edits above a literal do not churn the list.
  - **Allowlist entries:** `{ file, text, reason }`. Seed it with:
    - `transparent` and `currentColor` (never matched by the patterns, listed for documentation);
    - `#00000000` in `electron/main.cjs`, the transparent window;
    - the template image URL in `electron/store.cjs:90` and `src/editor/schema.jsx:91`, which is content;
    - the `#211b0c` legacy sentinel in `electron/store.cjs` and `src/model/preferences.js`;
    - `STICKY_PASTEL_PALETTE` in `src/constants.js` and `electron/main.cjs`, which are user colour defaults;
    - the colour wheel, gradient and checkerboard in `controls.css`, which are colour-picking tools;
    - the crop frame and handles in `overlays.css` 103–145, which draw over images.
- [ ] **Step 5: Generate the known list.** Run `node scripts/check-colors.mjs --write-known`, then `npm run
  check:colors`. Expected: exit 0. Add a deliberate `color: #123456;` to `search.css`, rerun, and expect exit 1
  naming that line. Revert it.
- [ ] **Step 6: Wire the script into `package.json`.** Add `"check:colors": "node scripts/check-colors.mjs"`.
  Insert `npm run check:colors &&` after `npm run check:refs &&` in both `verify:quick` and `verify`. Run
  `npm run verify:quick`. Expected: PASS.
- [ ] **Step 7: Commit:** `test: capture NotePane theme baselines and add the check:colors ratchet`.

---

### Task 3: Theme data and `buildThemeTokens` reproducing NotePane exactly

**Files:**
- Create: `electron/themes.json` (two themes for now: `notepane-light`, `notepane-dark`)
- Create: `src/style/themes.js`
- Create: `src/style/themeTokens.js`
- Create: `tests/unit/themes.test.cjs`

**Interfaces:**
- **Produces the theme record:** `Theme = { id, label, scheme: "light"|"dark", codeTheme: string, palette, overrides,
  toneMatching: boolean, noteChrome? }`.
  - **`palette` keys** (the exported constant `PALETTE_KEYS`, in this order): `window`, `sidebar`, `header`,
    `panel`, `hover`, `line`, `lineStrong`, `text`, `muted`, `faint`, `accent`, `danger`, `success`, `warning`,
    `shadow`, `codeBg`, `codeText`, `codeMuted`, `gray`, `brown`, `red`, `orange`, `yellow`, `green`, `blue`,
    `purple`, `pink`.
  - **`noteChrome`** is defined in Task 8. NotePane themes set `toneMatching: false`, and other themes `true`.
- **Produces in `src/style/themes.js`:**
  - `PALETTE_KEYS: string[]`, `DEFAULT_THEME_ID = "notepane-light"`;
  - `getTheme(themeId: string): Theme`: an unknown id returns the `notepane-light` theme;
  - `listThemes(): Theme[]`: JSON order, then registered test themes;
  - `isKnownThemeId(themeId: string): boolean`;
  - `themeIdForMode(mode: string): "notepane-light" | "notepane-dark"`;
  - `registerTestThemes(themes: Theme[]): void`.
  - The file imports `../../electron/themes.json`.
- **Produces in `src/style/themeTokens.js`:**
  - `buildThemeTokens(theme: Theme): Record<string, string>` (CSS custom property → value; `overrides` applied
    last);
  - `THEME_TOKEN_NAMES: string[]` (sorted keys of `buildThemeTokens(getTheme(DEFAULT_THEME_ID))`).

- [ ] **Step 1: Write the failing tests** in `tests/unit/themes.test.cjs`. Load the modules with
  `import("../../src/style/themes.js")` as `search.test.cjs` does.

```js
test("every theme defines every palette key as six-digit hex", async () => {
  const { listThemes, PALETTE_KEYS } = await loadThemes();
  for (const theme of listThemes()) {
    for (const key of PALETTE_KEYS) assert.match(theme.palette[key], /^#[0-9a-f]{6}$/, `${theme.id}.${key}`);
    assert.ok(["light", "dark"].includes(theme.scheme), theme.id);
  }
});
test("theme ids are unique", ...);
test("NotePane Light tokens equal the captured tokens.css values", async () => {
  const baseline = require("./fixtures/theme-baseline.json");
  const { buildThemeTokens } = await loadTokens(); const { getTheme } = await loadThemes();
  assert.deepEqual(pickColourTokens(buildThemeTokens(getTheme("notepane-light"))), pickColourTokens(baseline.tokens.light));
});
test("NotePane Dark tokens equal the captured tokens.css values", ...same with dark);
test("every theme produces the same token names", ...);
test("an unknown theme id resolves to NotePane Light", async () => {
  assert.equal(getTheme("solarized").id, "notepane-light");
});
```

  `pickColourTokens` drops the six non-colour tokens: `--notepane-ui-font`, `--notepane-display-font`,
  `--icon-chrome-size`, `--chrome-icon-button-width`, `--chrome-icon-button-height` and
  `--chrome-icon-button-radius`. They stay in `tokens.css` under `:root` (Task 4).
- [ ] **Step 2: Run** `node --test tests/unit/themes.test.cjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Write the two NotePane themes** in `electron/themes.json`, with their palette values taken from
  today's tokens (for example `window` = `--sticky-shell-bg`, `text` = `--sticky-text-color`, the named colours =
  `--notepane-editor-*-text`, `codeBg` = `#0d1117`). Write `overrides` with every token whose derived value differs
  from the baseline, so that both tests pass.
- [ ] **Step 4: Implement `themes.js` and `buildThemeTokens`.** Derive every colour token name in the baseline from
  the palette: surfaces and text from palette keys, hover, border and shadow values by mixing with
  `mixHexColors`/`hexToCssRgb` toward `text`/`shadow`, and the editor colour `-bg` values by mixing the named colour
  into `window`. The formulas are yours. The NotePane tests pin the output through `overrides`, and Task 9's
  contrast tests pin it for the other themes.
- [ ] **Step 5: Run** `node --test tests/unit/themes.test.cjs`. Expected: PASS. Then run `npm run check:colors`.
  Expected: PASS (`themes.json` is skipped).
- [ ] **Step 6: Commit:** `feat: add theme definitions and token derivation`.

---

### Task 4: `themeId` end to end, runtime tokens, first paint, and the `.bn-root` bridge

After this task the app looks exactly as before, but it is driven by theme tokens. `Mod+Shift+L` still switches
between `notepane-light` and `notepane-dark` until Task 10.

**Files:**
- Create: `src/style/applyTheme.js`
- Create: `src/hooks/useAppliedTheme.js`
- Create: `electron/windowTheme.cjs`
- Modify: `src/constants.js:7-9` (`DEFAULT_APP_THEME = { themeId: "notepane-light", mode: "light" }`)
- Modify: `src/model/preferences.js:29-34` (`normalizeAppTheme`)
- Modify: `electron/store.cjs:14-16, 1279-1302` (`DEFAULT_APP_THEME`, `normalizeAppTheme`, `inferLegacyAppTheme`)
- Modify: `electron/main.cjs:187-190, 197-224` (window URL query and Windows `backgroundColor`)
- Modify: `src/main.jsx`:
  - 784–788: `updateAppThemeMode` becomes `updateAppTheme(themeId)`;
  - 1258: `appThemeMode` becomes `activeTheme`;
  - remove the class effect at 1361–1370;
  - 2998–3001: className and data attribute;
  - 3491: the `BlockNoteView` `theme` prop;
  - 3666: apply the theme before `createRoot`.
- Modify: `src/ui/overlays.jsx:98` (receives `scheme`)
- Modify: `src/hooks/useKeyboardCommands.js:95-97` (toggles `notepane-light`/`notepane-dark` via `updateAppTheme`)
- Modify: `src/styles/tokens.css` (delete both literal blocks and both find blocks; `:root` keeps the six
  non-colour tokens)
- Modify: `src/styles/chrome.css`, `src/styles/editor-surface.css` (`.theme-dark`/`body.theme-dark` →
  `:root[data-theme-scheme="dark"]`)
- Modify: `src/styles/blocknote.css` (add the `.bn-root` bridge rule)
- Test: `tests/unit/store.test.cjs`, `tests/unit/themes.test.cjs`, `tests/e2e/electron.spec.mjs`,
  `tests/e2e/renderer/appearance.spec.mjs:184`

**Interfaces:**
- **Consumes:** `getTheme`, `isKnownThemeId`, `themeIdForMode`, `buildThemeTokens` (Task 3).
- **Produces:**
  - `applyThemeToDocument(theme: Theme, root?: HTMLElement): void`. It sets every token with
    `root.style.setProperty`, removes tokens set by a previous call that the new theme lacks, and sets
    `root.dataset.themeId`, `root.dataset.themeScheme` and `root.style.colorScheme`. The default root is
    `document.documentElement`.
  - `useAppliedTheme(themeId: string): Theme`. It calls `applyThemeToDocument` in `useLayoutEffect`.
  - `normalizeAppTheme(value, fallback?) -> { themeId, mode }`, identical in `src/model/preferences.js` and
    `electron/store.cjs`.
  - `resolveWindowBackgroundColor(appTheme) -> "#rrggbb"`, which returns the theme's `palette.window`.
  - The renderer reads `themeId` from `window.location.search`.
- **The `.bn-root` bridge:** a rule in `blocknote.css`, `.bn-root.bn-root[data-color-scheme] { … }`. It maps every
  `--bn-colors-*` variable to the underlying NotePane token, never to itself (for example
  `--bn-colors-menu-background: var(--sticky-portal-menu-bg)`). It also maps the 18
  `--bn-colors-highlights-{gray..pink}-{text,background}` variables to `var(--notepane-editor-<name>-text|bg)`.

- [ ] **Step 1: Write the failing store tests** in `tests/unit/store.test.cjs`:
  - "normalizes a known theme id and keeps mode in step": `{ themeId: "catppuccin-mocha" }` gives
    `{ themeId: "catppuccin-mocha", mode: "dark" }`. Until Task 9 adds Mocha, use `notepane-dark` here and add
    the Mocha case in Task 9.
  - "maps a legacy mode to the NotePane theme": `{ mode: "dark" }` gives `{ themeId: "notepane-dark",
    mode: "dark" }`.
  - "an unknown theme id falls back by mode": `{ themeId: "solarized", mode: "dark" }` gives
    `{ themeId: "notepane-dark", mode: "dark" }`. This replaces the "solarized becomes light" test at 207–223.
  - "a backup with only mode restores the matching NotePane theme".

  Add `resolveWindowBackgroundColor({ themeId: "notepane-dark" })` → `"#191919"` to a new test in the same file.

  Add two tests to `tests/unit/themes.test.cjs`:
  - "renderer and store normalizeAppTheme agree": feed the same ten inputs (known id, unknown id, mode-only,
    `null`, a string, `{ themeId: 3 }`, and so on) to both functions and `deepEqual` the results;
  - "every token a stylesheet reads is defined":
    - collect every `var(--name` in `src/styles/*.css` and in the `<style>` text in `src/editor/sideMenu.jsx`;
    - each name must be in `THEME_TOKEN_NAMES`, declared by some rule in `src/styles/*.css`, set by
      `getStickyShellStyle`/`getSessionTabStyle`, or start with `--bn-`, `--mantine-`, `--shiki-` or
      `--prosemirror-`;
    - this test fails until the `tokens.css` blocks are deleted in Step 5, which is expected.
- [ ] **Step 2: Run** `npm run test:unit`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement the store, preferences, constants and `windowTheme.cjs` changes.** On Windows,
  `getWindowChromeOptions` uses `resolveWindowBackgroundColor(store.getAppTheme())`. Run `npm run test:unit`.
  Expected: PASS.
- [ ] **Step 4: Add the failing Electron test** "a new window starts with the current theme applied" to
  `electron.spec.mjs`:
  - persist `{ themeId: "notepane-dark", mode: "dark" }`;
  - launch the app;
  - on the first window's `domcontentloaded`, assert that `document.documentElement.dataset.themeId ===
    "notepane-dark"`;
  - assert that `getComputedStyle(document.documentElement).getPropertyValue("--sticky-shell-bg").trim() ===
    "#191919"`.

  Run `npx playwright test tests/e2e/electron.spec.mjs --grep "starts with the current theme"`. Expected: FAIL.
- [ ] **Step 5: Implement the renderer side:**
  - `applyTheme.js` and `useAppliedTheme.js`;
  - the window URL `themeId` query in `main.cjs`;
  - the entry calls `applyThemeToDocument(getTheme(initialThemeId))` before `createRoot`;
  - the `main.jsx` edits, `BlockNoteView theme={activeTheme.scheme}`, and the version-history editor's `scheme` prop;
  - the `tokens.css` deletions;
  - the selector rewrites in `chrome.css` and `editor-surface.css`;
  - the `.bn-root` bridge.

  `getStickyShellStyle` and `getSessionTabStyle` still receive `activeTheme.scheme` as their mode argument. Task 8
  changes that.
- [ ] **Step 6: Run the focused checks:**
  - the Electron test from Step 4;
  - `npx playwright test tests/e2e/renderer/theme-baseline.spec.mjs`;
  - `npx playwright test tests/e2e/renderer/appearance.spec.mjs tests/e2e/renderer/editor-text.spec.mjs`, after
    updating `appearance.spec.mjs:184` from `bodyHasDarkClass` to `documentElement.dataset.themeScheme === "dark"`;
  - `npm run check:refs`;
  - `npm run check:colors`.

  Expected: all PASS. Remove the known entries that `check:colors` reports as gone.
- [ ] **Step 7: Commit:** `refactor: drive colours from theme tokens and persist a theme id`.

---

### Task 5: Sentinel themes and the leak-detector ratchet

**Files:**
- Create: `src/style/sentinelThemes.js`
- Create: `tests/e2e/renderer/theme-leaks.spec.mjs`
- Create: `tests/e2e/fixtures/theme-leaks-known.json` (generated ratchet)
- Modify: `src/main.jsx` (the dev-only registration at the entry)

**Interfaces:**
- **Consumes:** `registerTestThemes`, `applyThemeToDocument`.
- **Produces `SENTINEL_THEMES`:** four themes, `sentinel-light-a`, `sentinel-light-b`, `sentinel-dark-a` and
  `sentinel-dark-b`.
  - Within a pair, no palette value is equal and every palette value differs by at least 40 in some RGB channel.
  - `toneMatching` is `true`, and `codeTheme` is the scheme's NotePane code theme.
- **Produces the dev-only registration.** When `import.meta.env.DEV` is true and the URL has `sentinelThemes`, the
  entry imports `sentinelThemes.js`, calls `registerTestThemes(SENTINEL_THEMES)`, and exposes
  `window.__notepaneTest = { setThemeId(id) }`, which calls the same `updateAppTheme` as the picker. Production
  builds contain neither the import nor the global. Task 11 checks this with `verify-dist.mjs`.

- [ ] **Step 1: Write `theme-leaks.spec.mjs`.** It opens `/?sentinelThemes=1` and, for each pair (light, dark),
  renders every screen in the spec's "Leak detector E2E → Screens covered" list.
  - **Reading colours:** for every visible element, and for its `::before`, `::after` and `::placeholder`, it reads
    `color`, `background-color`, the four border colours, `outline-color`, the `box-shadow` colours, `fill`,
    `stroke`, `caret-color` and `text-decoration-color`.
  - **Comparing:** it does this under theme A and under theme B, then compares. A visible, non-transparent value
    identical in both is a leak `{ screen, selector, property, value }`. The selector is the shortest unique CSS
    path.
  - **Exclusions:** `img`, `canvas`, the `.notepane-wordmark` image, and the allowlisted selectors (the colour
    wheel, the crop overlay).
  - **The ratchet:** the test fails when there is a leak not in `theme-leaks-known.json`, or a known leak that no
    longer occurs.
- [ ] **Step 2: Generate the known list.** Run with `NOTEPANE_WRITE_KNOWN_LEAKS=1 npx playwright test
  tests/e2e/renderer/theme-leaks.spec.mjs`, then without the variable. Expected: PASS. The known list is the work
  list for Tasks 6–8.
- [ ] **Step 3: Prove the detector works.** Temporarily add `.session-sidebar { border-right-color: #123456; }`,
  run, and expect FAIL naming `.session-sidebar` `border-right-color`. Revert it.
- [ ] **Step 4: Commit:** `test: add sentinel themes and the theme leak ratchet`.

---

### Task 6: Stylesheet literals, hidden token blocks and export

**Files:**
- Modify:
  - `src/styles/chrome.css` (sticky first-paint block 282–321, version-history fallbacks 229–260);
  - `src/styles/overlays.css` (toast dots 37–42, the export block 180–306);
  - `src/styles/editor-surface.css` (tooltips 605–642, `.loading` 726);
  - `src/styles/search.css:45`;
  - `src/styles/preferences.css:129, 316, 961`;
  - `src/styles/blocknote.css` (127–190, 423, 427, 431, 504–505);
  - `src/styles/controls.css:161, 232, 278`;
  - `src/styles/sidebar.css:165` (`--brand-pastel-sky`).
- Modify: `src/style/themeTokens.js` (new tokens)
- Modify: `src/main.jsx:1974-2001` (export applies NotePane Light)
- Test: `tests/e2e/renderer/export-import.spec.mjs`

**Interfaces:**
- **Consumes:** `buildThemeTokens`, `getTheme`.
- **Produces:** new tokens named `--notepane-<role>`. Each is derived in `buildThemeTokens` and added to the
  NotePane `overrides` with today's literal value, so NotePane output is unchanged. At least these are needed:
  - `--notepane-success`, `--notepane-progress`, `--notepane-focus-ring`;
  - `--notepane-tooltip-bg`, `--notepane-tooltip-text`;
  - `--notepane-code-tool-bg`, `--notepane-code-tool-text`, `--notepane-code-tool-success`,
    `--notepane-code-tool-error`;
  - `--notepane-icon-turn-into`, `--notepane-icon-colors`;
  - `--notepane-input-error`, `--notepane-loading-text`, `--notepane-slider-thumb`, `--notepane-brand-accent`.
  - Shadows that are literals today become `--notepane-shadow-*` tokens derived from `palette.shadow`.
- **Produces `withExportTheme(run: () => Promise<T>): Promise<T>`** in `src/style/applyTheme.js`.
  - While `run` executes, it sets every `notepane-light` token with priority `important` on `document.body` and on
    the `.sticky-shell` element, and restores the previous values afterwards, even if `run` throws.
  - The `body.is-exporting` literal block in `overlays.css` is deleted. Layout-only export rules stay.

- [ ] **Step 1: Write the failing export test** "export renders with NotePane Light under a dark theme" in
  `export-import.spec.mjs`:
  - select `notepane-dark` through `selectAppTheme`;
  - add a red-highlighted paragraph and a code block;
  - hook the export render (the code path that adds `is-exporting`) and, while it runs, read the computed colours;
  - assert shell text `rgb(55, 53, 47)`, code background `rgb(13, 17, 23)`, and the red highlight background equal
    to the `notepane-light` token `--notepane-editor-red-bg`.

  Run it. Expected: FAIL on the highlight, because the export block never set highlights.
- [ ] **Step 2: Implement `withExportTheme`** and use it around the export render. Run the test. Expected: PASS.
  After Task 9, add the same test with `catppuccin-mocha` (Review Focus 4).
- [ ] **Step 3: Migrate each listed literal to a token, file by file.** After each file:
  - run `npm run check:colors` and remove the known entries it reports as gone;
  - run `npx playwright test tests/e2e/renderer/theme-baseline.spec.mjs`, which must still PASS;
  - run `npx playwright test tests/e2e/renderer/theme-leaks.spec.mjs`, and remove fixed leaks from the known list.
- [ ] **Step 4: Run the renderer specs that assert these colours.** Run
  `npx playwright test tests/e2e/renderer/appearance.spec.mjs tests/e2e/renderer/editor-text.spec.mjs
  tests/e2e/renderer/editor-tables.spec.mjs tests/e2e/renderer/export-import.spec.mjs
  tests/e2e/renderer/session-sidebar.spec.mjs`. Expected: PASS without editing any NotePane colour assertion.
- [ ] **Step 5: Commit:** `refactor: move stylesheet colours and export colours onto theme tokens`.

---

### Task 7: BlockNote, Mantine, browser-native colours and the wordmark

**Files:**
- Modify: `src/styles/blocknote.css`, `src/styles/editor-surface.css`, `src/styles/tokens.css` (root native rules),
  `src/styles/chrome.css:65-77` (wordmark selector)
- Modify: `src/main.jsx:963-1000` (editor options: drop cursor colour)
- Modify: `src/style/themeTokens.js`

**Interfaces:**
- **Consumes:** the bridge from Task 4, and the tokens from Task 6.
- **Produces:** the tokens `--notepane-selection-bg`, `--notepane-caret`, `--notepane-control-accent`,
  `--notepane-placeholder`, `--notepane-quote`, `--notepane-node-outline`, `--notepane-drop-cursor`,
  `--notepane-resize-handle` and `--notepane-add-file-bg`/`-hover-bg`.
  - For NotePane themes, pick the nearest existing NotePane token. Do not copy BlockNote's literal. This is the
    spec's "Allowed visible changes".

- [ ] **Step 1: Write the overrides.** These go in `blocknote.css`, scoped under `.bn-root`:
  - the `Block.css` literals: blockquote, divider/page break, selected-node outline, add-file button, resize
    handles, `#adf`;
  - the Mantine variables under `.bn-mantine[data-mantine-color-scheme]`: the primary colour, `gray-2`, dimmed and
    chip hover, mapped to tokens.
- [ ] **Step 2: Add the root native rules** to `tokens.css`: `:root { accent-color; caret-color; }` and
  `::selection`, keeping the transparent block-selection rule at `blocknote.css:295`. Add `::placeholder` for the
  find, search and font inputs.
- [ ] **Step 3: Set the drop cursor colour from the token** when the editor is created. Read
  `getComputedStyle(document.documentElement).getPropertyValue("--notepane-drop-cursor")` and pass it as the
  editor's `dropCursor` colour option. If BlockNote 0.52.1 does not expose that option, override `.prosemirror-dropcursor-block,
  .prosemirror-dropcursor-inline` in CSS instead, and note which one you used in the commit message.
- [ ] **Step 4: Switch the wordmark swap** from `.theme-dark` to `:root[data-theme-scheme="dark"]`.
- [ ] **Step 5: Run the ratchets and baselines:**
  - `npx playwright test tests/e2e/renderer/theme-leaks.spec.mjs`, removing fixed leaks from the known list;
  - `npx playwright test tests/e2e/renderer/theme-baseline.spec.mjs` (must PASS);
  - `npx playwright test tests/e2e/renderer/editor-text.spec.mjs`. The test at 665 asserts `#4d79b8`/`#a45bb9`
    menu icons, which are NotePane tokens now and must still PASS. The test at 876 asserts the transparent
    selection.
  - `npm run check:colors`.
- [ ] **Step 6: Commit:** `refactor: theme BlockNote, Mantine and browser-native colours`.

---

### Task 8: Tone matching, note chrome from the theme, and the contrast fallback

**Files:**
- Create: `src/style/toneMatch.js`
- Modify: `src/style/colorMath.js` (OKLCH helpers, `pickReadableText`, `WHITE`/`BLACK`)
- Modify: `src/style/themeStyles.js` (all literals; new signatures)
- Modify: `src/constants.js:207-236` (remove `MODE_TAB_TEXT_DEFAULTS`, `SESSION_TAB_MODE_BASE_COLORS`,
  `SESSION_TAB_CONTRAST_TEXT`, `SESSION_TAB_DARK_MODE_TONE_MIX`)
- Modify: `electron/themes.json` (the NotePane `noteChrome`)
- Modify: `src/main.jsx` (callers at 1276–1283, 3152–3156, 3194–3198, 3567–3592)
- Modify: `src/ui/SearchPalette.jsx:119`, `src/ui/menus.jsx:28,49`, `src/ui/preferencesSections.jsx:164-182`
- Test: `tests/unit/themeBaseline.test.cjs` (rewritten), `tests/unit/toneMatch.test.cjs`

**Interfaces:**
- **Consumes:** `Theme`, `getTheme`.
- **Produces in `colorMath.js`:**
  - `WHITE = "#ffffff"`, `BLACK = "#000000"`;
  - `hexToOklch(hex) -> { l, c, h }`;
  - `oklchToHex({ l, c, h }) -> "#rrggbb"`, which reduces chroma until the colour is inside sRGB;
  - `pickReadableText(backgroundHex, [darkInk, lightInk]) -> hex`. It returns the candidate with the higher
    contrast if that reaches 4.5, and otherwise whichever of `BLACK`/`WHITE` contrasts more.
- **Produces in `toneMatch.js`:** `toneMatch(hex, theme, role: "fill"|"surface"|"mark") -> hex`.
  - It returns `hex` unchanged when `theme.toneMatching === false`.
  - The targets follow the spec's role table.
  - Inputs with OKLCH chroma below 0.02 map onto neutrals between `palette.window` and `palette.text`, keeping
    their relative lightness.
- **Produces `noteChrome`:** today's literal values for the two NotePane themes, and `deriveNoteChrome(theme)` in
  `themeStyles.js` for themes without it. Its fields are:
  - `base` (`#ffffff` / `#191919`), `inkDark` (`#37352f`), `inkLight` (`#f7f7f4`);
  - `tabBase` (`#f1f1ef` / `#2a2a2a`), `tabInkDark` (`#1f1f1f`), `tabInkLight` (`#fbfbfa`);
  - `tabToneMix` (`0` / `0.12`);
  - one field for each remaining literal in `getStickyShellStyle`, named after its current local variable
    (`selectedBackground`, `selectedText`, `iconColor`, `iconActiveColor`, `controlBackground`, and so on), as a
    `{ onLight, onDark }` pair.
- **New signatures:**
  - `getStickyShellStyle(noteTheme, accentColor, theme: Theme)`;
  - `getSessionTabStyle(noteTheme, theme: Theme, noteIndex)`;
  - `resolveTabTextColor(noteTheme, theme: Theme)`.
  - `isLightBackground` becomes `getRelativeLuminance(text) < getRelativeLuminance(background)`. The string
    comparison is removed.

- [ ] **Step 1: Write the failing tests.** In `tests/unit/themeBaseline.test.cjs`, replace the Task 2 test with
  "NotePane sticky and tab output equals the baseline". For every fixture entry, call the new signature with
  `getTheme(mode === "dark" ? "notepane-dark" : "notepane-light")` and `assert.deepEqual` the style. The only
  permitted difference is the text colour for the `#ff0000` entries, which must become the higher-contrast of
  `#000000`/`#ffffff`; assert that explicitly. In `tests/unit/toneMatch.test.cjs`, for every theme with
  `toneMatching: true`, over inputs (each pastel, `#ff0000`, `#00ff00`, `#0000ff`, `#ffffff`, `#000000`,
  `#808080`) × roles × opacity {1, 0.6, 0.35}:

```js
test("hue is kept for chromatic inputs", ...);          // |Δh| ≤ 3° when input c ≥ 0.02
test("neutral inputs stay neutral", ...);               // output c < 0.02
test("text on fill and surface results is readable", ...); // contrast(pickReadableText(blended, inks), blended) ≥ 4.5
test("distinct pastels stay distinct", ...);            // pairwise OKLab ΔE ≥ 0.02 per role
test("Mocha matches the spec's worked values", () => {
  assert.ok(deltaE(toneMatch("#fff2b8", mocha, "fill"), "#dacd95") < 0.03);
  assert.ok(deltaE(toneMatch("#fff2b8", mocha, "surface"), "#3a3417") < 0.03);
});
test("NotePane themes are never tone matched", () => {
  assert.equal(toneMatch("#fff2b8", getTheme("notepane-dark"), "surface"), "#fff2b8");
});
```

  `deltaE` is a test-local OKLab Euclidean distance built on `hexToOklch`. `blended` is the result applied over
  `noteChrome.base` at the given opacity, as `getStickyShellStyle` does. Until
  Task 9 adds Mocha, the Mocha test registers an inline Mocha palette with `registerTestThemes`. Task 9 swaps it
  for the real theme.
- [ ] **Step 2: Run** `npm run test:unit`. Expected: FAIL.
- [ ] **Step 3: Implement** the `colorMath` additions, `toneMatch.js`, `noteChrome` with `deriveNoteChrome`, and
  the new signatures.
  - `getStickyShellStyle` passes the accent through `toneMatch(accent, theme, "surface")`, and
    `getSessionTabStyle` uses `"fill"`.
  - The search dot, the context-menu swatch and the `ColorPanel` default use `"mark"`.
  - The Preferences pastel swatches and the colour panel's current-colour preview display
    `toneMatch(color, activeTheme, "surface")`, but still store the raw value.
  - Delete the glass variables (`themeStyles.js` 206–213), which no CSS reads.
- [ ] **Step 4: Run** `npm run test:unit`, then `npx playwright test tests/e2e/renderer/appearance.spec.mjs
  tests/e2e/renderer/session-sidebar.spec.mjs tests/e2e/renderer/theme-baseline.spec.mjs`, then
  `npm run check:refs`, then `npm run check:colors`. Expected: all PASS, and `src/style/themeStyles.js` and
  `src/constants.js` have no remaining known entries except the allowlisted pastels.
- [ ] **Step 5: Commit:** `feat: tone-match note colours to the active theme`.

---

### Task 9: The seven new themes and per-theme code highlighting

**Files:**
- Modify: `electron/themes.json`
- Modify: `src/editor/schema.jsx:241` (the highlighter, per Task 1's route)
- Create: `src/editor/codeHighlighter.js`
- Modify: `src/styles/blocknote.css:99-107` (code block colours from the active theme; `color-scheme` from the
  theme scheme)
- Modify: `package.json` (pin `"@shikijs/themes": "4.3.1"`, and `"@shikijs/core": "4.3.1"` if the route imports it)
- Test: `tests/unit/themes.test.cjs`, `tests/unit/toneMatch.test.cjs`, `tests/e2e/renderer/editor-text.spec.mjs`

**Interfaces:**
- **Consumes:** Task 1's route, `Theme.codeTheme`.
- **Produces:** `createNotePaneHighlighter()` in `src/editor/codeHighlighter.js`, used as
  `codeBlockOptions.createHighlighter`. If Task 1 chose the fallback route, it also produces
  `rehighlightCodeBlocks(editor)`.

- [ ] **Step 1: Write the failing tests:**
  - in `themes.test.cjs`, "ships the nine themes in picker order", asserting the exact id list from Global
    Constraints;
  - "text contrast meets the spec bar in every theme": text on `window`, `sidebar` and `panel` ≥ 4.5, and `muted`
    on `window` ≥ 3;
  - in `editor-text.spec.mjs`, "code blocks follow the theme": a JavaScript code block shows background
    `rgb(13, 17, 23)` under `notepane-light`. Under `catppuccin-mocha` it shows Mocha's code background, and the
    `const` keyword's colour differs from its `notepane-light` colour.
  - Switching back recolours the block without a reload.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Add the seven themes.** Use the official palettes:
  - Catppuccin v1 (`base`, `mantle`, `crust`, `surface0..2`, `overlay0..2`, `subtext0..1`, `text` and the
    fourteen accents);
  - Nord (`nord0..15`);
  - Dracula's official spec;
  - Tokyo Night (night variant).
  - Each palette's surfaces may follow `../tablepeek/web/src/palette.ts`.
  - **Named colours** must be pairwise distinct (OKLab ΔE ≥ 0.05). Where a palette has no brown or grey, take
    Catppuccin brown = `flamingo`, grey = `overlay2`; for the others, use the nearest distinct palette colour.
  - **`codeTheme`** comes from the spec's list.
- [ ] **Step 4: Implement the highlighter** by Task 1's route. Replace the inline Mocha in `toneMatch.test.cjs`
  with `getTheme("catppuccin-mocha")`. Add the Mocha case to the store test from Task 4, and the Mocha export test
  from Task 6.
- [ ] **Step 5: Run** `npm run test:unit`, then `npx playwright test tests/e2e/renderer/editor-text.spec.mjs
  tests/e2e/renderer/export-import.spec.mjs`, then the leak and baseline specs. Expected: all PASS.
- [ ] **Step 6: Commit:** `feat: add Catppuccin, Nord, Dracula and Tokyo Night themes`.

---

### Task 10: Theme picker and removing the light/dark switch

**Files:**
- Create: `src/ui/ThemePicker.jsx`
- Modify: `src/ui/preferencesWindow.jsx:52, 185-205` (props `appThemeId` and `onAppThemeChange`; replace
  `HeaderModeSwitch`)
- Modify: `src/ui/controls.jsx:20-42` (delete `HeaderModeSwitch`)
- Modify: `src/styles/controls.css:102-121` (delete the switch styles)
- Modify: `src/styles/preferences.css` (picker styles)
- Modify: `src/constants.js:82`, `electron/store.cjs:172`, `src/ui/preferencesSections.jsx:407`,
  `src/hooks/useKeyboardCommands.js:95-97` (remove `toggleThemeMode`)
- Modify: `src/main.jsx:2154-2160, 3628-3634` (pass `appThemeId` and `onAppThemeChange={updateAppTheme}`)
- Modify: `scripts/verify-dist.mjs:54` (require `"ThemePicker"` instead of `"HeaderModeSwitch"`)
- Modify: `tests/e2e/support/renderer-helpers.mjs` (`selectAppTheme` through the picker)
- Modify: the nine `modifierShortcut("Shift+L")` call sites (`appearance.spec.mjs` 158, 207, 405, 424, 1035,
  1065; `editor-text.spec.mjs` 500, 833) → `selectAppTheme`
- Test: `tests/e2e/renderer/theme.spec.mjs`, `tests/e2e/electron.spec.mjs`

**Interfaces:**
- **Consumes:** `listThemes`, `updateAppTheme(themeId)` (Task 4).
- **Produces:** `ThemePicker({ themeId: string, themes: Theme[], onChange: (themeId) => void })`.
  - It renders `role="radiogroup"` with `aria-label="App theme"`. Each card is `role="radio"`, with
    `aria-checked`, `data-testid="theme-card-<id>"`, the theme label as its accessible name, and roving
    `tabIndex`.
  - Arrow keys move between cards and select the focused one.
  - Each card's mini window is drawn with inline styles from that theme's palette (`window`, `sidebar`, `header`,
    `text`, and the named-colour dots). The picker is the one place that colours with another theme's values;
    allowlist `ThemePicker.jsx` in `check:colors` with the reason "previews other themes".

- [ ] **Step 1: Write the failing renderer tests** in `theme.spec.mjs`:
  - "picker lists the nine themes and marks the active one": the nine radio names in order, and
    `theme-card-notepane-light` has `aria-checked="true"`;
  - "choosing a card applies the theme immediately": click Mocha, then `document.documentElement.dataset.themeId
    === "catppuccin-mocha"`, and `--sticky-shell-bg` equals Mocha's `palette.window`;
  - "arrow keys move the selection";
  - "Mod+Shift+L no longer changes the theme";
  - "the shortcut list no longer offers Toggle light / dark";
  - "Preferences no longer shows the Theme mode switch": `getByRole("switch", { name: "Theme mode" })` has count 0.
- [ ] **Step 2: Write the failing Electron tests:**
  - "theme choice persists across restart": select Dracula, restart, `appTheme` equals `{ themeId: "dracula",
    mode: "dark" }`, and the window is Dracula;
  - "changing the theme updates an already-open window" (Review Focus 5): in sticky layout with two windows, change
    the theme from one, then the other's `documentElement.dataset.themeId` updates, and the computed background of
    its formatting toolbar portal root uses the new theme's panel colour;
  - update the `appTheme.mode` assertions at 89, 205, 286 and 2121 to the `{ themeId, mode }` shape.
- [ ] **Step 3: Run** both spec files with `--grep` on these names. Expected: FAIL.
- [ ] **Step 4: Implement:**
  - `ThemePicker` and the Preferences wiring;
  - the removals;
  - the `selectAppTheme` rewrite (open Preferences from the sidebar footer, then click `theme-card-<id>`, then close
    the dialog);
  - migrate the nine call sites;
  - the `verify-dist.mjs` change;
  - delete the temporary known entries for the switch CSS from `check-colors-known.json`.
- [ ] **Step 5: Run:**
  - `npx playwright test tests/e2e/renderer/theme.spec.mjs tests/e2e/renderer/appearance.spec.mjs
    tests/e2e/renderer/editor-text.spec.mjs`;
  - the Electron tests from Step 2 with `--grep`;
  - `npm run verify:quick`.

  Expected: all PASS.
- [ ] **Step 6: Commit:** `feat: replace the light/dark switch with a theme picker`.

---

### Task 11: Close the ratchets, update the docs, and run full verification

**Files:**
- Delete: `scripts/check-colors-known.json` (the script treats a missing file as empty)
- Delete: `tests/e2e/fixtures/theme-leaks-known.json` (same)
- Modify: `scripts/verify-dist.mjs` (fail if the built bundle contains `sentinelThemes` or `__notepaneTest`)
- Modify: `docs/architecture.md`:
  - the code map rows for `themes.js`, `themeTokens.js`, `toneMatch.js`, `applyTheme.js`, `useAppliedTheme.js`,
    `codeHighlighter.js` and `electron/themes.json`;
  - the persistence paragraph: `appTheme.themeId`.
- Modify: `docs/features.md:101`, `docs/usage.md` (theme picker, no light/dark shortcut)

- [ ] **Step 1: Empty the ratchets.** Delete both known-lists. Run `npm run check:colors` and
  `npx playwright test tests/e2e/renderer/theme-leaks.spec.mjs`. Expected: both PASS with no known entries. If
  anything remains, fix it at its source. Do not re-add a known list.
- [ ] **Step 2: Update `verify-dist.mjs` and the docs.** Run `git diff --check`. Expected: no output.
- [ ] **Step 3: Run `npm run verify`** and read the exit code; do not pipe it into `tail`. Expected: exit 0.
  Report any failure with its output. A failure in the six-dot highlight test is rerun once in isolation and
  reported either way.
- [ ] **Step 4: Inspect the diff for blockers:** `test.skip`, `.only`, `TODO` and stub tests. Fix any you find.
- [ ] **Step 5: Commit:** `docs: describe the theme system`.
