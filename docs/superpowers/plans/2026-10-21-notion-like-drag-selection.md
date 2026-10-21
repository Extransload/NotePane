# Notion-like Drag Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**

- Cross-block text drags stay text selections.
- Blocks are block-selected by a marquee drawn from the empty editor surface. Shift adds blocks, so a selection can
  be non-contiguous.
- Every block command acts on exactly the selected set.

**Architecture:**

- `BlockRangeSelection` becomes `BlockSetSelection`, a ProseMirror `Selection` with one range per run of adjacent
  selected siblings. ProseMirror's own `replace` and `replaceWith` then delete and replace every range.
- Pure rules (nesting normalisation, sibling moves) live in a dependency-free module with unit tests.
- The marquee gesture lives in the existing `BlockDragSelection` extension. Call sites that ask BlockNote's
  `editor.getSelection()` for "the selected blocks" switch to `getSelectedBlocks(editor)`.

**Tech Stack:**

- BlockNote 0.52.1 with ProseMirror (`@tiptap/pm/state`, `@tiptap/pm/view`, `@tiptap/pm/model`, `@tiptap/pm/history`).
- React.
- Playwright Renderer e2e tests.
- `node --test` unit tests.

**Spec:** `docs/superpowers/specs/2026-10-21-notion-like-drag-selection-design.md`

## Global Constraints

- **Colours:** every colour comes from theme tokens (`npm run check:colors`). The marquee fill is
  `var(--notepane-selection-bg)` and its border is `color-mix(in srgb, var(--notepane-input-focus-border) 55%, transparent)`.
- **Code placement:** follow `docs/architecture.md`. Editor behaviour goes in `src/editor/`, and `src/main.jsx` only
  wires things. Styles go in `src/styles/blocknote.css`. Do not reorder `src/styles.css`.
- **Tests:** new Renderer tests go in a new feature file, `tests/e2e/renderer/editor-block-selection.spec.mjs`. Its
  helpers stay in that file unless a second file needs them.
- **Marquee values:**
  - It starts after 4px of pointer travel.
  - The auto-scroll band is 40px at the top and bottom of `[data-testid='sticky-editor-surface']`.
  - The scroll speed is `Math.ceil(((40 - distanceToEdge) / 40) * 18)` px per animation frame.
- **Undo:** a selection change never creates an undo step. Dispatch selection-only transactions through
  `closeHistory(tr)`.
- **`check:refs`:** run `npm run check:refs` after any task that moves code between files.
- **Validation:** run the focused tests named in each task, and `npm run verify` once in Task 7.
- **Commits:** commit only when the owner has asked for commits in this run (repository policy). Each task's commit
  step is a checkpoint to offer.

## Review Focus

Each of these failure modes is tested in the task named:

1. **A marquee across a scrolled surface.** The start corner stays anchored to the document, so the first selected
   block is still the one under the press point (Task 4, auto-scroll test).
2. **Undo after deleting a non-contiguous selection.** One Cmd+Z restores A and C in their original places (Task 5).
3. **The window loses focus, or the button is released outside the window, mid-marquee.** The overlay disappears, and
   the next click places a caret normally (Task 3).
4. **Enter with a non-contiguous selection.** The unselected block between A and C is never removed (Task 5).
5. **A Shift marquee touching a child of an already-selected parent.** The parent stays selected once, and the child
   is not added separately (Task 4).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/editor/blockSelectionRules.js` (new) | Pure rules: nesting normalisation and sibling-move planning. No imports |
| `src/editor/blockSelection.js` (new) | `BlockSetSelection` and its constructors and readers. Block-set commands: indent, move, replace with an empty paragraph. `getSelectedBlocks(editor)` |
| `src/editor/blockDragSelection.js` | The `BlockDragSelection` extension: decorations and attributes, keyboard and composition routing for block sets, the marquee gesture, edge auto-scroll |
| `src/editor/blocks.js` | `getBlocksForClipboard`, `resolveBlocksForCut` and `resolveBlocksForMenuBlock` read `getSelectedBlocks` |
| `src/editor/clipboard.js` | `normalizeCopiedEditorPlainText` reads every selection range |
| `src/editor/sideMenu.jsx` | Menu actions read `getSelectedBlocks`. A NotePane delete item replaces BlockNote's `RemoveBlockItem` |
| `src/main.jsx` | Drop the empty-surface `onMouseDown`, which moves into the extension. Copy handler handles `cut` for block sets |
| `src/styles/blocknote.css` | `.notepane-marquee` |
| `tests/unit/blockSelectionRules.test.cjs` (new) | Unit tests for the pure rules |
| `tests/e2e/renderer/editor-block-selection.spec.mjs` (new) | All Renderer tests for this feature |
| `tests/e2e/renderer/editor-text.spec.mjs` | Remove "promotes a cross-block text drag into a block selection" |
| `docs/architecture.md` | Code map rows for the new modules |

### Shared test helpers

These are defined once at the top of `editor-block-selection.spec.mjs` and used by Tasks 2 to 6. The `beforeEach`
mirrors `editor-text.spec.mjs`: `page.goto("/")` and wait for `sticky-editor-surface`.

```js
const FIXTURE = [
  "Alpha paragraph", "", "Bravo paragraph", "", "Charlie paragraph", "",
  "- Delta bullet", "  - Delta child", "- Echo bullet", "", "---", "",
  "Foxtrot paragraph", "", "```js", "const golf = 1;", "```", "", "Hotel paragraph",
].join("\n");
```

| Helper | What it does |
| --- | --- |
| `pasteSelectionFixture(page)` | `createBlankSession`, then `clickLastEmptyParagraph`, then `pastePlainText(page, FIXTURE)`. Expects `row(page, "Hotel paragraph")` to be visible and `getBulletItemDepth(page, "Delta child")` to be one more than `"Delta bullet"` |
| `row(page, text)` | `page.locator(".bn-editor .bn-block-content").filter({ hasText: new RegExp(`^${escapeRegExp(text)}$`) })` |
| `selectedBlockTexts(page)` | Evaluates `[...document.querySelectorAll('.bn-editor [data-block-selected="true"]')]` and returns `el.querySelector(":scope > .bn-block > .bn-block-content").textContent.trim()` for each |
| `marquee(page, fromText, toText, { modifier, release = true } = {})` | Starts at `x = editorBox.x + editorBox.width - 20`, where `editorBox` is the `.bn-editor` bounding box, and `y = fromRow.y + 2`. Holds `modifier` if one is given. Moves with `steps: 10` to `x = editorBox.x + editorBox.width / 2` and `y = toRow.y + toRow.height - 2`. Releases when `release` is set |
| `textDrag(page, fromText, toText)` | Presses 8px into `fromText`'s first text line and moves with `steps: 12` to 8px before the right end of `toText`'s text box. Releases |
| `blockDepth(page, text)` | The number of `.bn-block-group` ancestors of `row(page, text)` |
| `topLevelTexts(page)` | The trimmed texts of `.bn-editor > .bn-block-group > .bn-block-outer > .bn-block > .bn-block-content`, in order |
| `pasteLines(page, count)` | `createBlankSession`, then `clickLastEmptyParagraph`, then `pastePlainText(page, Array.from({ length: count }, (_, i) => `Line ${i + 1}`).join("\n\n"))` |
| `clipboardText(page)` | `page.evaluate(() => navigator.clipboard.readText())`. Call `grantPermissions(["clipboard-read", "clipboard-write"])` first |

---

### Task 1: Block selection model

**Files:**
- Create: `src/editor/blockSelectionRules.js`
- Create: `src/editor/blockSelection.js`
- Create: `tests/unit/blockSelectionRules.test.cjs`
- Modify: `src/editor/blockDragSelection.js:1-40`. Use `BlockSetSelection` instead of `BlockRangeSelection` in
  `decorations`, `attributes` and `select()`. The promotion itself stays until Task 2
- Modify: `src/editor/blocks.js:38-48`. `getBlocksForClipboard` returns `getSelectedBlocks(editor)` when
  `isBlockSetSelection(selection)`

**Interfaces:**

Produces from `src/editor/blockSelectionRules.js`:
- `normalizeTouchedBlocks(touched: Array<{ id: string, ancestorIds: string[] }>): string[]`. `touched` is in document
  order. `ancestorIds` runs from the outermost block to the nearest parent.
- `planSiblingMove(siblingIds: string[], selectedIds: Iterable<string>, direction: -1 | 1): string[] | null`. Returns
  the new sibling order, or `null` when nothing may move.

Produces from `src/editor/blockSelection.js`:
- `class BlockSetSelection extends Selection`:
  - `visible` is `false`.
  - It registers `Selection.jsonID("notepane-block-set", …)`.
  - It holds one `SelectionRange` per maximal run of adjacent selected sibling `blockContainer`s.
- `createBlockSetSelection(doc: Node, blockIds: Iterable<string>): BlockSetSelection | null`
- `isBlockSetSelection(selection: Selection): boolean`
- `getBlockSetIds(selection: Selection): string[]`. Returns the ids of the selected `blockContainer`s in document order,
  not their descendants.
- `getSelectedBlocks(editor): Block[]`. Returns the exact set for a block set. Otherwise it returns
  `editor.getSelection()?.blocks ?? []`.

- [ ] **Step 1: Write the failing unit tests** in `tests/unit/blockSelectionRules.test.cjs`, in the style of
  `tests/unit/search.test.cjs`, with `const loadRules = () => import("../../src/editor/blockSelectionRules.js")`.

```js
test("normalises touched blocks to the shallowest touched level", async () => {
  const { normalizeTouchedBlocks: n } = await loadRules();
  assert.deepEqual(n([]), []);
  assert.deepEqual(n([{ id: "a", ancestorIds: [] }, { id: "b", ancestorIds: [] }]), ["a", "b"]);
  assert.deepEqual(n([{ id: "c1", ancestorIds: ["p"] }]), ["c1"]);
  assert.deepEqual(n([{ id: "c1", ancestorIds: ["p"] }, { id: "f", ancestorIds: [] }]), ["p", "f"]);
  assert.deepEqual(n([{ id: "p", ancestorIds: [] }, { id: "c1", ancestorIds: ["p"] }]), ["p"]);
  assert.deepEqual(n([{ id: "g", ancestorIds: ["p", "c"] }, { id: "c2", ancestorIds: ["p"] }]), ["c", "c2"]);
});

test("moves each selected sibling past its unselected neighbour, or nothing at an edge", async () => {
  const { planSiblingMove: m } = await loadRules();
  const s = ["a", "b", "c", "d"];
  assert.deepEqual(m(s, ["c"], -1), ["a", "c", "b", "d"]);
  assert.deepEqual(m(s, ["b", "d"], -1), ["b", "a", "d", "c"]);
  assert.deepEqual(m(s, ["b", "c"], -1), ["b", "c", "a", "d"]);
  assert.deepEqual(m(s, ["a", "c"], 1), ["b", "a", "d", "c"]);
  assert.equal(m(s, ["a", "c"], -1), null);
  assert.equal(m(s, ["d"], 1), null);
  assert.equal(m(s, [], 1), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `node --test tests/unit/blockSelectionRules.test.cjs`

  Expected: FAIL, because the module is not found.

- [ ] **Step 3: Implement both functions in `src/editor/blockSelectionRules.js`**

  `normalizeTouchedBlocks`:
  - Take `d`, the minimum `ancestorIds.length`.
  - Map each entry to its own `id` when its depth is `d`, and to `ancestorIds[d]` otherwise.
  - De-duplicate, keeping the first occurrence.

  `planSiblingMove`:
  - Return `null` if nothing is selected.
  - Return `null` if any selected id is at index 0 for `-1`, or at the last index for `1`.
  - Otherwise do one pass in the movement direction, swapping each selected item with its neighbour when that
    neighbour is unselected.

- [ ] **Step 4: Run the unit tests**

  Run: `node --test tests/unit/blockSelectionRules.test.cjs`

  Expected: PASS.

- [ ] **Step 5: Implement `src/editor/blockSelection.js`**

  `BlockSetSelection`:
  - Pass `$anchor = ranges[0].$from`, `$head = ranges.at(-1).$to`, and the ranges to `super`.
  - `eq` compares the range lists.
  - `map` maps each range and drops ranges that were deleted or collapsed. With no range left, it returns
    `Selection.near(doc.resolve(mappedFirstFrom))`.
  - `toJSON` returns `{ type: "notepane-block-set", ranges: [[from, to], …] }`, and `fromJSON` reverses it.

  `createBlockSetSelection`:
  - Walk `doc.descendants`, and stop descending at a `blockContainer` whose `attrs.id` is selected.
  - Merge a selected container into the previous range when it starts exactly where that range ends.

  `getSelectedBlocks` maps `getBlockSetIds` through `editor.getBlock(id)` and drops misses.

- [ ] **Step 6: Switch the extension and the clipboard helper to the new class**

  In `blockDragSelection.js`:
  - Delete `BlockRangeSelection`.
  - `select()` builds `createBlockSetSelection(view.state.doc, [startId, endId] range ids)`. Keep today's from–to
    range semantics: collect the containers between the two ids.
  - Decorations iterate `getBlockSetIds`.

  In `blocks.js`, replace the `"notepane-block-range"` JSON check with `isBlockSetSelection`.

- [ ] **Step 7: Run the existing e2e contract, which still exercises the promotion**

  Run: `npx playwright test tests/e2e/renderer --grep "promotes a cross-block text drag into a block selection"`

  Expected: PASS.

  Then run `npm run check:refs`. Expected: no undefined references.

- [ ] **Step 8: Commit checkpoint**

  `git add src/editor/blockSelectionRules.js src/editor/blockSelection.js src/editor/blockDragSelection.js src/editor/blocks.js tests/unit/blockSelectionRules.test.cjs`

  Message: `refactor: represent block selections as a multi-range block set`

---

### Task 2: Text drags stay text selections

**Files:**
- Modify: `src/editor/blockDragSelection.js`. Delete the `mousedown`, `mousemove`, `mouseup` and `selectstart`
  promotion listeners, and `blockAt` and `select`
- Modify: `src/editor/blocks.js:49-52`. Rewrite the comment: cross-block drags are not promoted, and block sets come
  from the marquee
- Modify: `tests/e2e/renderer/editor-text.spec.mjs:966`. Delete "promotes a cross-block text drag into a block
  selection"
- Create: `tests/e2e/renderer/editor-block-selection.spec.mjs` with the shared helpers and the tests below

**Interfaces:**
- Consumes: nothing new.
- Produces: the spec file and helpers listed under "Shared test helpers".

- [ ] **Step 1: Write the failing tests**

  1. **"keeps a cross-block text drag as a text selection"**
     - Use `loadTemplatePreview`, then "Use this template".
     - Run `textDrag(page, "A focused workspace for persistent notes", "Create one session per meeting")`.
     - Expect `selectedBlockTexts(page)` to equal `[]`, and `.bn-editor` to have `data-block-selection="false"`.
     - Expect `window.getSelection().toString()` to contain both texts.
     - After `Meta+C`, `clipboardText` contains both texts and not `"Pin a sticky window"`.
  2. **"keeps a text drag across a table and an image as a text selection"**
     - Use the template, and run `textDrag(page, "Workspace modes", "Session brief")`.
     - Expect `[]` selected blocks.
     - Expect the selection string to contain `"Workspace modes"`, `"Best for"` and `"Session brief"`.
  3. **"keeps a text drag across a divider and a code block as a text selection"**
     - Use `pasteSelectionFixture`, and record `.bn-editor .bn-block-content` count.
     - Run `textDrag(page, "Echo bullet", "Hotel paragraph")`.
     - Expect `[]` selected blocks.
     - Expect the selection string to contain `"Foxtrot paragraph"`, `"const golf = 1;"` and `"Hotel"`.
     - Expect the block count to be unchanged.

- [ ] **Step 2: Run them to verify test 1 fails**

  Run: `npx playwright test tests/e2e/renderer/editor-block-selection.spec.mjs`

  Expected: test 1 FAILS, with one or more selected blocks.

- [ ] **Step 3: Delete the promotion listeners and the old test**

- [ ] **Step 4: Run the new file and the text suite**

  Run: `npx playwright test tests/e2e/renderer/editor-block-selection.spec.mjs tests/e2e/renderer/editor-text.spec.mjs tests/e2e/renderer/editor-tables.spec.mjs`

  Expected: PASS. The tables file is included because the deleted handlers excluded `td` and `th`.

- [ ] **Step 5: Commit checkpoint**

  Message: `feat: keep cross-block text drags as text selections`

---

### Task 3: Marquee from the empty editor surface

**Files:**
- Modify: `src/editor/blockDragSelection.js`. Convert to the factory form,
  `createExtension(({ editor }) => ({ key: "notepaneBlockDragSelection", prosemirrorPlugins: [...] }))()`, as
  `src/editor/schema.jsx:198` does. The plugin `view()` owns the gesture
- Modify: `src/main.jsx:2979-2989, 3437`. Remove `focusLastBlockFromEmptySurface`, its `onMouseDown`, and the
  `isEmptyEditorSurfacePointer` import if it is unused
- Modify: `src/styles/blocknote.css`. Add `.notepane-marquee` next to the `data-block-selected` rules: absolute
  position, `pointer-events: none`, `z-index: 3`, a 2px radius, and the colours from Global Constraints
- Test: `tests/e2e/renderer/editor-block-selection.spec.mjs`

**Interfaces:**
- Consumes: `normalizeTouchedBlocks`, `createBlockSetSelection`, `getBlockSetIds` and `isBlockSetSelection` from Task
  1; `isEmptyEditorSurfacePointer` and `focusLastEditorBlock` from `src/editor/blocks.js`.
- Produces:
  - `collectTouchedBlocks(editorDom: HTMLElement, rect: { left, top, right, bottom }): Array<{ id, ancestorIds }>`,
    exported for Task 4. It scans `.bn-block-content` in DOM order and keeps the elements whose client rect
    overlaps `rect` on both axes. `id` comes from `closest(".bn-block-outer[data-id]")`, and the ancestor ids come from
    the enclosing `.bn-block-outer`s.
  - The DOM contract `div.notepane-marquee[data-testid="block-marquee"]`. It is a child of
    `[data-testid='sticky-editor-surface']` and is positioned in the surface's content coordinates.

**Gesture rules** (spec "Marquee"):

- **Press.** A document `mousedown` in the capture phase. It applies when `isEmptyEditorSurfacePointer(event)` is true,
  `!event.ctrlKey && !event.altKey`, and the event's surface contains `view.dom`. Call `event.preventDefault()`, then
  record:
  - the start point in content coordinates, `clientY - surfaceRect.top + surface.scrollTop`, and the same for x;
  - `event.shiftKey`;
  - the selection at press time.
- **Move.** Ignore movement under 4px. The first move past that point creates the overlay. Every move after that does
  the following:
  - Redraw the overlay.
  - Convert it to client coordinates and call `collectTouchedBlocks`.
  - Compute `ids = normalizeTouchedBlocks(...)`.
  - If the ids changed, dispatch `closeHistory(tr.setSelection(...))`.
  - When `ids` is empty, restore the press-time selection. If that was a block set, collapse to
    `Selection.near(doc.resolve(firstRange.from))` instead.
  - Prevent `selectstart` while the press is pending or the marquee is active.
- **Release.** Remove the overlay. If the marquee never started, call `focusLastEditorBlock(editor)`. A pointer `move`
  with `(event.buttons & 1) === 0` counts as a release outside the window.
- **Escape, or a window `blur`, while the marquee is active.** Remove the overlay, end the gesture, and keep the
  current selection.

- [ ] **Step 1: Write the failing tests**

  1. **"selects every block a marquee touches and deselects blocks as it shrinks"**
     - Use the fixture, and run `marquee(page, "Alpha paragraph", "Charlie paragraph", { release: false })`.
     - Expect the selection to be `["Alpha paragraph","Bravo paragraph","Charlie paragraph"]`, and
       `getByTestId("block-marquee")` to be visible.
     - Move to the middle of the Alpha row. Expect `["Alpha paragraph"]`.
     - `mouse.up()`. Expect `["Alpha paragraph"]`, the marquee count to be 0, and `data-block-selection="true"`.
  2. **"selects nothing while the marquee stays in the side padding"**
     - Press at `editorBox.right - 40` on the Alpha row, and move to `editorBox.right - 10` on the Charlie row. Expect
       `[]`.
     - Move to the editor's centre. Expect three selected blocks.
  3. **"selects a nested child alone, and its parent with an outer block"**
     - Run `marquee(page, "Delta child", "Delta child")`. Expect `["Delta child"]`.
     - Run `marquee(page, "Delta child", "Echo bullet")`. Expect `["Delta bullet","Echo bullet"]`.
  4. **"focuses the last block on a click in the empty surface and clears a block selection"**
     - Select Alpha with a marquee.
     - Click 40px below the bottom of the last `.bn-block-outer`.
     - Expect `data-block-selection="false"`, then `expectEditorFocused`.
     - The last `.bn-block-content` is an empty paragraph.
  5. **"never starts a marquee from the side menu handle"**
     - Hover the Alpha row.
     - Press on `.bn-side-menu [data-test='dragHandle']`, move 10px, and check that `block-marquee` has count 0.
     - Press `Escape`, then `mouse.up()`. Expect `[]`.
  6. **"replaces a block selection with a text selection when a drag starts in selected text"**
     - Marquee from Alpha to Bravo.
     - Run `textDrag(page, "Alpha paragraph", "Alpha paragraph")`.
     - Expect `[]`, and the selection string to be non-empty.
  7. **"ends a marquee when the window loses focus mid-drag"** (Review Focus 3)
     - Start a marquee and move to activate it.
     - Run `page.evaluate(() => window.dispatchEvent(new Event("blur")))`.
     - Expect `block-marquee` to have count 0. Then `mouse.up()`.
     - Click into "Bravo paragraph". Expect a collapsed selection inside Bravo.

- [ ] **Step 2: Run to verify they fail**

  Run: `npx playwright test tests/e2e/renderer/editor-block-selection.spec.mjs --grep "marquee|empty surface|side menu handle|starts in selected text|loses focus"`

  Expected: FAIL. No overlay exists, and nothing is selected.

- [ ] **Step 3: Implement the gesture, the CSS and the `main.jsx` removal**

- [ ] **Step 4: Run the new tests, plus the empty-surface and table neighbours**

  Run: `npx playwright test tests/e2e/renderer/editor-block-selection.spec.mjs`

  Run: `npx playwright test tests/e2e/renderer --grep "blank table surface|keeps sticky chrome outside"`

  Expected: PASS.

  Then run `npm run check:refs` and `npm run check:colors`. Expected: clean.

- [ ] **Step 5: Commit checkpoint**

  Message: `feat: select blocks with a marquee from the empty editor surface`

---

### Task 4: Shift union and edge auto-scroll

**Files:**
- Modify: `src/editor/blockDragSelection.js`
- Test: `tests/e2e/renderer/editor-block-selection.spec.mjs`

**Interfaces:**
- Consumes: `collectTouchedBlocks` (Task 3) and `normalizeTouchedBlocks` (Task 1).
- Produces: `startEdgeAutoScroll(surface: HTMLElement, getPointer: () => ({ x, y }), onScroll: () => void): () => void`.
  It returns a stop function, and uses the band and speed from Global Constraints. It scrolls in a
  `requestAnimationFrame` loop while the pointer is inside the band, even when the pointer does not move.

**Rules:**

- **Shift.** Base ids are `getBlockSetIds` of the press-time selection; there is no base without Shift. On each move,
  normalise the union:
  - Build `{ id, ancestorIds }` records for the base ids and the touched ids, from DOM order, through
    `.bn-block-outer[data-id]`.
  - Pass them to `normalizeTouchedBlocks`.
- **Meta** behaves like no modifier: the marquee replaces the selection.
- **Auto-scroll.** Start it when the marquee activates, and stop it on release. `onScroll` re-runs the hit test,
  because the overlay's start corner lives in content coordinates.

- [ ] **Step 1: Write the failing tests**

  1. **"adds a Shift marquee to the existing block selection without the blocks between"**
     - Run `marquee(Alpha, Alpha)`, then `marquee(Charlie, Charlie, { modifier: "Shift" })`.
     - Expect `["Alpha paragraph","Charlie paragraph"]`.
     - Run `marquee(Foxtrot, Foxtrot, { modifier: "Meta" })`. Expect `["Foxtrot paragraph"]`.
  2. **"keeps one parent when a Shift marquee touches a child of a selected parent"** (Review Focus 5)
     - Run `marquee("Delta bullet", "Delta bullet")`.
     - Run `marquee("Delta child", "Delta child", { modifier: "Shift" })`.
     - Expect `["Delta bullet"]`.
  3. **"auto-scrolls a marquee held at the bottom edge and keeps its start anchored"** (Review Focus 1)
     - Run `pasteLines(page, 60)`.
     - Start `marquee("Line 1", "Line 1", { release: false })`.
     - Move to `surfaceBox.y + surfaceBox.height - 5` and wait 800ms without moving.
     - Expect the surface's `scrollTop` to be greater than 0.
     - Expect `selectedBlockTexts[0]` to be `"Line 1"` and the selection length to be greater than 20. Then
       `mouse.up()`.
  4. **"auto-scrolls a text drag held at the bottom edge"**
     - Use the same document. Press in the `Line 1` text.
     - Move to the bottom edge and wait 800ms.
     - Expect `scrollTop > 0`, `[]` selected blocks, and the selection string to contain `"Line 20"`.

- [ ] **Step 2: Run to verify the results**

  Run: `npx playwright test tests/e2e/renderer/editor-block-selection.spec.mjs --grep "Shift marquee|auto-scrolls"`

  Expected: tests 1 to 3 FAIL.

  Test 4 checks Chromium's native selection auto-scroll. If it already PASSES, do not add code for it, and say so in
  the task report.

- [ ] **Step 3: Implement the Shift union and `startEdgeAutoScroll` for the marquee**

  Only if test 4 failed, also start the auto-scroller for a primary-button drag that began in `.bn-inline-content`.
  Its `onScroll` dispatches
  `TextSelection.create(doc, pressTimeAnchor, view.posAtCoords(lastPointer).pos)`, and does nothing when `posAtCoords`
  returns `null`.

- [ ] **Step 4: Run the whole feature file**

  Run: `npx playwright test tests/e2e/renderer/editor-block-selection.spec.mjs`

  Expected: PASS.

- [ ] **Step 5: Commit checkpoint**

  Message: `feat: add Shift marquee union and edge auto-scroll`

---

### Task 5: Editing a non-contiguous selection

**Files:**
- Modify: `src/main.jsx:1040-1072`. `copySelectedBlock` also handles `event.type === "cut"` when
  `isBlockSetSelection(editor.prosemirrorView.state.selection)`. It writes the clipboard as it does for a copy, then
  dispatches `state.tr.deleteSelection().scrollIntoView()`. The node-selection cut path is unchanged
- Modify: `src/editor/clipboard.js:9-31`. Read every range in `transaction.selection.ranges` for the hard-break check,
  and join `textBetween` per range with `"\n"`
- Modify: `src/editor/blocks.js:213-217`. `resolveBlocksForCut` asks `getSelectedBlocks(editor)` first
- Modify: `src/editor/blockSelection.js`. Add `replaceBlockSelectionWithParagraph(view: EditorView): void`. In one
  transaction it deletes every range, inserts one empty paragraph `blockContainer` at the mapped start of the first
  range, and puts a `TextSelection` inside it
- Modify: `src/editor/blockDragSelection.js`. Plugin `handleDOMEvents`:
  - `compositionstart`, and `keydown` with `event.isComposing || event.keyCode === 229`: call
    `replaceBlockSelectionWithParagraph` when the selection is a block set, and return `false`.
  - `keydown` `Enter` with no modifiers on a block set: `preventDefault`, keep the selection, and return `true` (my
    call, Review Focus 4).
- Test: `tests/e2e/renderer/editor-block-selection.spec.mjs`

**Interfaces:**
- Consumes: `isBlockSetSelection` and `getSelectedBlocks` (Task 1), and the Shift union (Task 4).
- Produces: `replaceBlockSelectionWithParagraph(view)`.

Every test below starts the same way: `pasteSelectionFixture`, `marquee(Alpha, Alpha)`, then
`marquee(Charlie, Charlie, { modifier: "Shift" })`.

- [ ] **Step 1: Write the failing tests**

  1. **"copies exactly the blocks of a non-contiguous selection"**
     - `Meta+C`.
     - The clipboard contains `"Alpha paragraph"` and `"Charlie paragraph"`, and not `"Bravo"`.
  2. **"cuts exactly the blocks of a non-contiguous selection"**
     - `Meta+X`.
     - The clipboard is as in test 1.
     - Alpha and Charlie rows have count 0. The Bravo row has count 1.
  3. **"deletes a non-contiguous selection and restores it with one undo"** (Review Focus 2)
     - `Backspace`. Alpha and Charlie have count 0, and Bravo has count 1.
     - `Meta+Z`. The first three `.bn-block-content` texts are `["Alpha paragraph","Bravo paragraph","Charlie paragraph"]`.
  4. **"replaces a non-contiguous selection with typed text"**
     - `keyboard.type("x")`.
     - The first two `.bn-block-content` texts are `["x","Bravo paragraph"]`, and Charlie has count 0.
  5. **"replaces a non-contiguous selection with Korean IME text"**
     - Open `cdp = await page.context().newCDPSession(page)`.
     - Send `Input.imeSetComposition` with `{ text: "ㅎ", selectionStart: 1, selectionEnd: 1 }`, then the same with
       `"하"`, then `Input.insertText` with `{ text: "한" }`.
     - The first two texts are `["한","Bravo paragraph"]`.
     - Charlie has count 0, and `"Delta bullet"` is still present.
  6. **"keeps the unselected block when Enter is pressed on a non-contiguous selection"** (Review Focus 4)
     - `Enter`.
     - Alpha, Bravo and Charlie each have count 1.
     - The selection is still `["Alpha paragraph","Charlie paragraph"]`.

- [ ] **Step 2: Run to verify which tests fail**

  Run: `npx playwright test tests/e2e/renderer/editor-block-selection.spec.mjs --grep "non-contiguous"`

  Expected: tests 2, 5 and 6 FAIL. Test 2 puts only Alpha on the clipboard. Test 5 removes Bravo or mangles the text.
  Test 6 changes Bravo.

  Tests 1, 3 and 4 may already pass through ProseMirror's multi-range `replace`. Keep them as contracts.

- [ ] **Step 3: Implement the changes listed under Files**

- [ ] **Step 4: Run the feature file and the clipboard neighbours**

  Run: `npx playwright test tests/e2e/renderer/editor-block-selection.spec.mjs`

  Run: `npx playwright test tests/e2e/renderer/editor-text.spec.mjs`

  Expected: PASS. This file owns the clipboard, the hard-break copy and the six-dot cut contracts that share the
  changed copy handler and normaliser.

- [ ] **Step 5: Commit checkpoint**

  Message: `feat: copy, cut, delete and type over a non-contiguous block selection`

---

### Task 6: Block commands on a non-contiguous selection

**Files:**
- Modify: `src/editor/blockSelection.js`. Add `indentBlockSelection` and `moveBlockSelection`
- Modify: `src/editor/blockDragSelection.js`. Plugin `handleDOMEvents.keydown` on a block set:
  - `Tab` with no modifier other than Shift: call `indentBlockSelection(editor, event.shiftKey ? -1 : 1)`.
  - `Shift+Mod+ArrowUp` and `Shift+Mod+ArrowDown`: call `moveBlockSelection(editor, ∓1)`.
  - In both cases, `preventDefault` and return `true`.
- Modify: `src/editor/sideMenu.jsx`:
  - At `:204-207`, `targetBlocks` comes from `getSelectedBlocks(editor)`.
  - At `:315-336`, `deleteOpenBlock` uses `getSelectedBlocks`.
  - Replace BlockNote's `RemoveBlockItem` with a local `RemoveSelectedBlocksItem`. It uses the same
    `Components.Generic.Menu.Item` markup, removes `getSelectedBlocks` when that set contains the menu block, and
    otherwise removes the menu block alone.
- Modify: `src/editor/blocks.js:239-249`. `resolveBlocksForMenuBlock` uses `getSelectedBlocks`
- Test: `tests/e2e/renderer/editor-block-selection.spec.mjs`

**Interfaces:**
- Consumes: `planSiblingMove`, `createBlockSetSelection`, `getBlockSetIds` and `getSelectedBlocks` (Task 1).
- Produces:
  - `indentBlockSelection(editor, direction: 1 | -1): boolean`. Inside one `editor.transact`, for each selected id in
    document order:
    - put a text cursor in that block, or skip a block that has no inline content;
    - call `editor.nestBlock()` or `editor.unnestBlock()` when `editor.canNestBlock()` or `canUnnestBlock()` allows
      it.
    - Then restore `createBlockSetSelection(doc, ids)`.
  - `moveBlockSelection(editor, direction: -1 | 1): boolean`:
    - Group the selected ids by parent `blockGroup`, and call `planSiblingMove` per group.
    - If any group returns `null`, return `true` and change nothing.
    - Otherwise, in one transaction, replace each group's child range with its children re-ordered. Move the same
      node objects so that ids are kept, then restore the block set. The result is one undo step.

- [ ] **Step 1: Write the failing tests** (each starts with `{Alpha, Charlie}` selected as in Task 5)

  1. **"turns a non-contiguous selection into headings from the block menu"**
     - Hover the Charlie row, click `.bn-side-menu [data-test='dragHandle']`, then "Turn into" and "Heading 1".
     - Alpha and Charlie `.bn-block-content` have `data-content-type="heading"`, and Bravo stays `"paragraph"`.
  2. **"colors a non-contiguous selection from the block menu"**
     - Hover the Charlie row and open the handle menu.
     - Choose "Colors", then the first background swatch in the panel.
     - Alpha and Charlie have a `data-background-color` attribute, and Bravo does not.
  3. **"deletes a non-contiguous selection from the block menu"**
     - Open the handle menu on Charlie and click "Delete". Alpha and Charlie have count 0, and Bravo has count 1.
     - Undo, select `{Alpha, Charlie}` again, open the menu, and press `Delete`. The result is the same.
  4. **"cuts a non-contiguous selection from the block menu shortcut"**
     - Open the handle menu on Charlie and press `Meta+X`.
     - The clipboard contains Alpha and Charlie, and not Bravo. Bravo has count 1.
  5. **"indents and outdents each block of a non-contiguous selection"**
     - `Tab`. `blockDepth("Alpha paragraph")` is unchanged, `blockDepth("Charlie paragraph")` is one more than
       Bravo's, and the selection is still `["Alpha paragraph","Charlie paragraph"]`.
     - `Shift+Tab`. Charlie's depth equals Bravo's again.
  6. **"moves each block of a non-contiguous selection past its neighbour"**
     - Select `{Bravo, Echo bullet}` with a marquee and a Shift marquee.
     - `Shift+Meta+ArrowUp`. The top-level row texts begin
       `["Bravo paragraph","Alpha paragraph","Charlie paragraph","Echo bullet","Delta bullet"]`.
     - Select `{Alpha, Charlie}`, then `Shift+Meta+ArrowUp`. Nothing moves.

- [ ] **Step 2: Run to verify they fail**

  Run: `npx playwright test tests/e2e/renderer/editor-block-selection.spec.mjs --grep "block menu|indents|moves each"`

  Expected: FAIL. Bravo is changed, or only Alpha or Charlie is affected.

- [ ] **Step 3: Implement the changes listed under Files**

- [ ] **Step 4: Run the feature file and the existing menu, cut and toggle contracts**

  Run: `npx playwright test tests/e2e/renderer/editor-block-selection.spec.mjs tests/e2e/renderer/editor-text.spec.mjs tests/e2e/renderer/editor-tables.spec.mjs tests/e2e/renderer/editor-toggles.spec.mjs`

  Expected: PASS. The six-dot menu, menu cut and Turn into contracts live in the text and tables files. A failure that
  is unrelated goes through the AGENTS.md flake procedure.

  Then run `npm run check:refs`.

- [ ] **Step 5: Commit checkpoint**

  Message: `feat: apply block menu, indent and move to a non-contiguous selection`

---

### Task 7: Architecture notes and full verification

**Files:**
- Modify: `docs/architecture.md`. Add rows under "Where behaviour lives":
  - "Block selection model, exactly-selected blocks, block-set indent and move" →
    `src/editor/blockSelection.js`, `src/editor/blockSelectionRules.js`.
  - "Marquee and drag selection gestures, edge auto-scroll" → `src/editor/blockDragSelection.js`.
  - Add `blockSelection.js` to the `src/editor/` notable files.

- [ ] **Step 1: Edit `docs/architecture.md`, then run `git diff --check`.** Expected: no output.

- [ ] **Step 2: Run the quick gate.** Run: `npm run verify:quick`. Expected: it exits 0.

- [ ] **Step 3: Run full verification once.** Run: `npm run verify`. Expected: it exits 0.

  The known flakes on `main` are recorded in project memory: the six-dot load flake and five serial-only flakes. A
  failure outside this feature is inspected and re-run in isolation once. It is reported as reproduced or not
  reproduced, and never as a pass.

- [ ] **Step 4: Commit checkpoint**

  Message: `docs: map block selection modules`
