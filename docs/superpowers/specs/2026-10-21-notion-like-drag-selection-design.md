# Notion-like Drag Selection Design

## Goal

Make mouse-drag selection in the editor Notion-like, matching the reference app measured below. There are two drag
gestures today, and both change:

- A text drag that crosses a block boundary is promoted to a whole-block selection
  (`src/editor/blockDragSelection.js`). The reference app never does this, so the promotion goes.
- A drag that starts outside block content does nothing useful today. In the reference app it draws a translucent rectangle (a
  marquee) and block-selects every block the rectangle touches. NotePane gains the marquee.

The owner noticed the difference while using the reference app and asked for the same behaviour. The owner first guessed that
the reference app turns a text drag into a block selection when it reaches a non-text block. Measurement showed that it does not
(see the reference section), and the owner chose to follow the measured behaviour.

## Decisions made by the owner

- Behave exactly as measured. A text drag stays a text selection however many blocks, and whatever block types, it
  crosses. The existing promotion to a block selection is removed, and so is its e2e test
  (`tests/e2e/renderer/editor-text.spec.mjs`, "promotes a cross-block text drag into a block selection").
- Block selection by drag comes only from the marquee.
- Shift with the marquee adds to the selection as the reference app does, so a block selection can be non-contiguous, for
  example A and C without B. Every feature that acts on block-selected blocks acts on exactly the highlighted set, and
  never on blocks between them. These features are listed under "Acting on a non-contiguous selection".

## Measured reference behaviour

These results come from the Notion desktop app 7.39.0 on macOS, measured on 2026-10-21. Real pointer events were
sent through the Chrome DevTools Protocol to a private test page that held every block type NotePane has. A block
counted as block-selected when the app drew its selection halo, and as text-selected when `window.getSelection()` was
non-empty.

| Drag starts at → moves to | Measured result |
| --- | --- |
| Text → within the same block | Text selection |
| Text → another block (paragraph, heading, list, nested list, numbered list, quote, toggle, the page title) | Text selection spanning the blocks |
| Text → across a divider, code block, table or image to the next text | Text selection. It includes code and table-cell text. While the pointer is over the non-text block, the selection end stays at the last text reached |
| Text → into the left or right page margin, or below the last block | Text selection |
| Page margin (left, right, above the first block, below the last block) | Marquee. Each block the rectangle touches is block-selected while the drag is still in progress, and shrinking the rectangle deselects |
| Marquee drawn entirely inside a margin | Nothing selected until the rectangle reaches the content column |
| Marquee with Shift held | Added to the existing block selection, which can then be non-contiguous |
| Marquee with Cmd or no modifier | Replaces the existing selection |
| Marquee touching only a nested child's own row | The child alone |
| Marquee touching a nested child and a block outside its parent | The parent plus the outer block |
| Marquee touching a parent's own row | The parent, which carries its children |
| Click in a margin with no drag | Clears the block selection |
| Text drag starting inside a block that is block-selected | The block selection clears and the drag is a text selection |
| Table cell → other cells → outside the table | Cell selection, clamped to the table. No block selection |
| Pointer held near the top or bottom edge | The page auto-scrolls, for both the marquee and a text drag |
| A block's non-text area (bullet marker, image, divider, code-block padding, the top padding of a heading) | Moves the block (drag and drop) |
| Single click on an image | Block-selects the image |

The marquee began somewhere between 8 and 12 px of pointer travel. Hit testing is "any overlap with the block's own
row, on both axes". The exact pixel thresholds are noisy, because the app throttles marquee updates.

## Target behaviour in NotePane

### Text drag

- A drag that starts in inline content (`.bn-inline-content`) is plain ProseMirror text selection from start to
  finish. It is never promoted.
- If the drag starts while a block selection exists, that selection is replaced by the text selection.
- Table cells keep the current `prosemirror-tables` cell selection.
- The reference app holds the selection end at the last text reached while the pointer is over a non-text block. NotePane does
  not have to copy that intermediate state; it may use native ProseMirror and Chromium behaviour (my call). Copying it
  would need a new document-level text-drag handler, the same kind of code this change removes, and that would put the
  text-selection anti-goal at risk. Requirements:
  - When the pointer is released over text after crossing a divider, code block, table or image, the result is a text
    selection spanning those blocks.
  - No drag ever produces a block selection or changes the document.
  - Copy produces what is highlighted.
  - A release inside a table cell may leave whatever selection `prosemirror-tables` normalises to, as long as it is not
    a block selection.

### Marquee

**Where it starts.** A primary-button press with no Ctrl or Alt, whose target passes `isEmptyEditorSurfacePointer`
(`src/editor/blocks.js:56`). That target is inside `[data-testid='sticky-editor-surface']` but not inside a block or
any control. In practice this covers:

- the editor's top gutter and the bottom gutter below the last block;
- the 54px inline padding on each side of `.bn-editor`, except the side menu itself;
- the side margins outside `.bn-editor` in reading-width and wide modes;
- the 8px gaps between top-level blocks.

Shift and Meta may be held. Their effect is described under "Modifiers".

**When it starts.** After the pointer travels a few pixels, about 4px (my call). Releasing before that point is a click
(see "Click without drag").

**The rectangle.**

- It spans from the press point to the pointer.
- It is anchored in content coordinates, so the start corner scrolls with the document during auto-scroll.
- It is drawn as a translucent accent-coloured overlay that does not take pointer events, using theme tokens.
- It is removed on release, on Escape, and on blur.

**Hit test.** A block is touched when the rectangle overlaps that block's own row (`.bn-block-content`, not the whole
`.bn-block-outer`, which includes its children) on both axes.

**Nesting.** The touched blocks are normalised to one level:

- Find the shallowest depth among the touched blocks.
- Replace each deeper touched block with its ancestor at that depth.
- Remove duplicates.

This rule reproduces every nested case measured above. It is derived from the measurements, not documented by
the reference app.

**Live update.** The block selection is recomputed on every pointer move, so blocks are added and removed while the
pointer is still down. The selection that remains on release is the result.

**Modifiers.** Shift adds the marquee's blocks to the block selection that existed when the press began. Meta, and no
modifier, replace it.

**Auto-scroll.** While the marquee is active and the pointer is within a small band at the top or bottom of
`.sticky-editor-surface`, the surface scrolls and the selection updates even if the pointer stops moving. A text drag
must auto-scroll too. With the promotion removed, the native behaviour should provide this, but it has to be checked.

**Click without drag.** On release before the threshold, the existing empty-surface action runs:
`focusLastBlockFromEmptySurface` (`src/main.jsx:2979`) focuses the last empty paragraph or appends one. That action
also clears any block selection.

Today this action runs on `mousedown` and calls `preventDefault`. It must move to the release so that a press can
become a marquee. The press must still call `preventDefault`, so that pressing in a gutter does not start a native text
selection or move the caret.

### Existing features that must keep working

| Feature | Requirement |
| --- | --- |
| Copy and cut of a block selection (`getBlocksForClipboard`, `src/editor/blocks.js:32`; `src/main.jsx:1052`) | Still copy and cut exactly the selected blocks, in document order, including a non-contiguous Shift selection. Update the comment at `blocks.js:49-52`, which says cross-block drags are promoted |
| Copy of a cross-block text selection | Copies what is highlighted, serialised by the editor, as today for keyboard-made text selections |
| Block-selection styling (`src/styles/blocknote.css:391-404`) | `data-block-selected` and `data-block-selection` keep their meaning: the row tint, the hidden `::selection`, and the hidden formatting toolbar |
| Typing, Backspace and Delete with a block selection | Behave as they do today for a block-range selection. For a non-contiguous selection, see the next section |
| Side menu ⋮⋮ handle: click, menu, drag to move | Unchanged for a contiguous selection. A press on the side menu never starts a marquee. For a non-contiguous selection, see the next section |
| Table cell selection and column resizing | Unchanged |
| Image resize handles, the code-block language select, toggle buttons, checkboxes | Unchanged. They are controls or block content, not empty surface |
| Header window drag (`.sticky-header`) | Unchanged. It is outside the editor surface |
| Undo history | A selection change does not create an undo step. Keep the `closeHistory` behaviour of the current extension |

### Acting on a non-contiguous selection

A non-contiguous selection is a set of blocks at one nesting level after normalisation, such as {A, C} with B
unselected between them. The builder check found that several existing features find "the selected blocks" through
BlockNote's `editor.getSelection()`, and that function reads only `selection.from` and `selection.to`
(`@blocknote/core/src/api/blockManipulation/selections/selection.ts:30-35`). Spanning A to C would include B, so each
feature below must act on exactly the set:

| Feature | Where it lives today | Behaviour with {A, C} |
| --- | --- | --- |
| Copy, cut | `getBlocksForClipboard`, `src/main.jsx:1052` | A and C, in document order |
| Backspace, Delete | ProseMirror default for the selection | A and C are removed and B stays. The caret goes where A was, or to the nearest block if nothing is left there |
| Typing a character | ProseMirror text input | A and C are removed and the character starts a new paragraph where A was, the same rule as a contiguous block selection today (my call) |
| IME composition, such as Korean | Browser DOM selection, which holds one range | Same result as typing. The first composed syllable goes into the new paragraph and the composition continues there. This is required, and it needs an e2e test (my call) |
| ⋮⋮ menu Turn into and Colors | `src/editor/sideMenu.jsx:204` | If the handle's block is in the set, the change applies to A and C. Otherwise it applies to the handle's block alone, as today |
| ⋮⋮ menu Delete key | `sideMenu.jsx:329` | Same rule as Turn into |
| Cmd+X from the menu | `resolveBlocksForMenuBlock`, `src/hooks/useEditorSurfaceShortcuts.js:140` | Same rule as Turn into |
| Tab and Shift+Tab | BlockNote `sinkItem` and `liftItem`, through `tabBehavior: "prefer-indent"` | A and C are each indented or outdented where that is possible. A block that cannot move stays put, and the others still move (my call) |
| Shift+Cmd+Arrow | BlockNote `moveBlocksUp` and `moveBlocksDown` (`moveBlocks.ts:334`) | Each selected block moves one position past its unselected neighbour in that direction. If any selected block is already at the edge, nothing moves. The same rule as moving multiple lines in a code editor (my call) |

After each action, the selection covers the same blocks, or is cleared if they were removed, so the halo and the
document never disagree.

## Non-goals

- Moving a block by dragging its non-text area, as the reference app does. NotePane keeps the ⋮⋮ handle for moving blocks.
- Keyboard block-selection features: Escape to select the current block, Shift+Arrow to extend, and Cmd+A selecting
  blocks.
- Shift+click to extend a block selection.
- Changing how a single click on an image or divider selects it.

## Anti-goals

The change fails even if the marquee works when any of these happens:

- Text selection, caret placement, IME input or double-click word selection inside blocks regresses.
- A marquee starts from a control: the side menu, a toolbar, a table handle, a button, an input or a link.
- A click on the empty surface stops focusing or creating the last paragraph.
- The ProseMirror selection and the rendered highlight disagree. For example, a halo is drawn but copy uses a
  different set of blocks.

## Constraints

- Code placement follows `docs/architecture.md`. Editor behaviour lives in `src/editor/`. The marquee and the
  selection extension belong with `src/editor/blockDragSelection.js`, renamed if the builder prefers. Styles go in
  `src/styles/blocknote.css`. `src/main.jsx` only wires things.
- Tests are Renderer e2e tests in the file that owns block selection, `tests/e2e/renderer/editor-text.spec.mjs`, or in
  a new feature file if the builder splits block selection out. Assertions check rendered selection
  (`data-block-selected`, `window.getSelection()`) and clipboard contents, not function calls.
- Validation follows the AGENTS.md tiers. This changes document-level pointer handlers shared across the editor, so
  run focused Renderer tests while iterating and `npm run verify` once at the end. Run `npm run check:refs` if code
  moves between files.

## Left to the builder

- How a non-contiguous block selection is represented. It could be a new ProseMirror `Selection` subclass holding
  several block ranges, or decorations plus a separate plugin state. It must make every feature in "Acting on a
  non-contiguous selection" act on exactly the set. That may require changing those call sites, or overriding
  BlockNote's Tab and move commands, instead of relying on `editor.getSelection()`.
- What Escape does during a marquee, whether a Shift marquee adds to an image selected by a single click, and whether
  the editor takes focus after a marquee.
- The exact drag threshold, the auto-scroll band and speed, and the overlay's tokens and opacity.
- Whether the marquee hit test reads DOM rectangles on each move or caches them once per drag. It must stay correct
  while auto-scrolling.
- Whether the old `BlockRangeSelection` class is kept for contiguous selections or folded into the new one. Its JSON
  id `notepane-block-range` is read by `getBlocksForClipboard`.
