# NotePane Repository Instructions

## Priorities

- Keep the edit-feedback loop proportional to the risk of the change.
- During implementation, run the smallest test that can disprove the change.
- Preserve unrelated work in the dirty worktree and do not broaden the task to fix unrelated failures.
- Report the exact commands run and distinguish focused validation from full validation.

## Validation Policy

Do not run `npm run verify` reflexively after every edit. Use the following tiers.

### Tier 0: Documentation and agent instructions

Examples: Markdown documentation, comments, and `AGENTS.md`-only changes.

- Run `git diff --check`.
- Do not build or run application tests unless executable behavior also changed.

### Tier 1: Isolated presentation changes

Examples: localized CSS, copy, labels, icons, spacing, and non-interactive markup.

- Run `npm run build`.
- Run only the directly related Renderer E2E test when the visual or rendered contract matters.

### Tier 2: Scoped Renderer behavior

Examples: editor commands, clipboard behavior, BlockNote integrations, keyboard handling within one context, and React state changes.

- Run `npm run verify:quick` once after the implementation stabilizes.
- Run the smallest relevant Renderer test with `npx playwright test tests/e2e/renderer --grep "<test name>"`.
- Include adjacent regression tests only when the changed handler or state is shared by them.

### Tier 3: Electron or cross-cutting behavior

Examples: persistence, IPC, application menus, window routing, sticky-session identity, export, dependencies, build configuration, schema migrations, or a shared global handler affecting multiple contexts.

- During iteration, run the relevant unit or E2E tests only.
- Run `npm run verify` once at the end, after focused checks pass.

### Full verification is also required when

- The user explicitly requests it.
- Preparing a release, commit, pull request, or handoff that claims the repository is fully verified.
- The impact boundary cannot be determined confidently.
- A change modifies test orchestration or verification scripts.

## Efficient Test Commands

- Undefined-reference check, about one second: `npm run check:refs`
- Fast build, unit, and distribution checks: `npm run verify:quick`
- Parallel browser-only suite: `npm run test:e2e:renderer`
- Serial Electron-only suite: `npm run test:e2e:electron`
- One Renderer feature file: `npx playwright test tests/e2e/renderer/<feature>.spec.mjs`
- One Renderer contract: `npx playwright test tests/e2e/renderer --grep "<test name>"`
- One Electron contract: `npx playwright test tests/e2e/electron.spec.mjs --grep "<test name>"`
- Full authoritative verification: `npm run verify`

Run `npm run check:refs` after any change that moves code between files. It catches a dropped import immediately,
which the build does not.

Run focused tests while iterating. Do not rerun the full suite solely because a test locator or test-only assertion was corrected unless the production code changed again or the failure indicates a wider regression.

If an unrelated or apparently flaky test fails:

1. Inspect its error context.
2. Re-run that test in isolation once.
3. Do not change unrelated production code to make it pass.
4. Report whether the failure was reproduced, without describing a failed full run as a pass.

Do not increase sleeps, timeouts, or retries just to hide instability.

## Code Structure

- Renderer code is grouped by ownership: `src/editor/`, `src/model/`, `src/style/`, `src/ui/`, `src/hooks/`, `src/utils/`.
  `docs/architecture.md` has a code map naming the file for each kind of behavior. Read it before searching.
- `src/main.jsx` holds composition only, that is `App` and `StickyEditor`. Put new non-trivial editor, keyboard,
  clipboard, formatting, or persistence logic in the matching module, and lift new stateful behavior into `src/hooks/`.
- `src/styles.css` is an ordered `@import` list. Add rules to the matching file in `src/styles/` and do not reorder
  the imports, because later files deliberately override earlier ones.
- Renderer tests are split by feature under `tests/e2e/renderer/`, with shared helpers in
  `tests/e2e/support/renderer-helpers.mjs`. Add a test to the file that owns its feature.
- Do not perform an unrelated large refactor as part of a small bug fix.
- Keep BlockNote/ProseMirror state and rendered DOM behavior aligned; validate user-visible selection, focus, clipboard, and window identity rather than only checking function calls.
- Prefer stable role, accessible-name, `data-testid`, or narrowly scoped locators in Playwright. Avoid broad selectors such as an unscoped `getByRole("toolbar")` when multiple toolbars can exist.

## Completion Report

After changing code, summarize the diff in a terminal-friendly form and include:

- What changed.
- Which focused checks ran.
- Whether `npm run verify` ran.
- Any skipped, flaky, or environment-limited checks.
