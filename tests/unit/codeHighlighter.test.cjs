const test = require("node:test");
const assert = require("node:assert/strict");

const load = async () => {
  // src/constants.js reads window.blocknoteSticky at import time.
  globalThis.window ??= {};
  const highlighter = await import("../../src/editor/codeHighlighter.js");
  const { listThemes } = await import("../../src/style/themes.js");
  const { SENTINEL_THEMES } = await import("../../src/style/sentinelThemes.js");
  return { ...highlighter, listThemes, SENTINEL_THEMES };
};

test.afterEach(async () => {
  const { setActiveCodeTheme, DEFAULT_CODE_THEME } = await load();
  setActiveCodeTheme(DEFAULT_CODE_THEME);
});

// A BlockNote editor as rehighlightCodeBlocks sees it: transact hands the callback a
// transaction over a document whose top-level nodes are `nodes` ([position, type name]). Each
// call records the positions it re-set and its metadata. Like BlockNote, a transaction with
// neither steps nor metadata is not dispatched, so it is not recorded.
function fakeEditor(nodes) {
  const dispatched = [];
  return {
    dispatched,
    // While true, transact throws, as an editor whose view has gone away would.
    broken: false,
    transact(callback) {
      if (this.broken) {
        throw new Error("The editor view is gone");
      }
      const tr = {
        marked: [],
        meta: {},
        doc: {
          descendants(visit) {
            for (const [position, name] of nodes) {
              visit({ type: { name }, attrs: { language: "javascript" } }, position);
            }
          },
        },
        setNodeMarkup(position, type, attrs) {
          assert.equal(type, undefined);
          assert.deepEqual(attrs, { language: "javascript" });
          this.marked.push(position);
          return this;
        },
        setMeta(key, value) {
          this.meta[key] = value;
          return this;
        },
      };
      const result = callback(tr);
      if (tr.marked.length > 0 || Object.keys(tr.meta).length > 0) {
        dispatched.push({ marked: tr.marked, meta: tr.meta });
      }
      return result;
    },
  };
}

test("every theme names a code theme the highlighter loads", async () => {
  const { listThemes, SENTINEL_THEMES, CODE_THEME_IDS } = await load();
  for (const theme of [...listThemes(), ...SENTINEL_THEMES]) {
    assert.ok(CODE_THEME_IDS.includes(theme.codeTheme), `${theme.id} names ${theme.codeTheme}`);
  }
});

test("the highlighter loads every code theme and highlights with the active one", async () => {
  const { createNotePaneHighlighter, setActiveCodeTheme, getActiveCodeTheme, CODE_THEME_IDS } = await load();
  const highlighter = await createNotePaneHighlighter();
  assert.deepEqual([...highlighter.getLoadedThemes()].sort(), [...CODE_THEME_IDS].sort());
  await highlighter.loadLanguage("javascript");
  // prosemirror-highlight's parser highlights with getLoadedThemes()[0] on every call.
  const keywordColour = () =>
    highlighter
      .codeToTokens("const answer = 42;", { lang: "javascript", theme: highlighter.getLoadedThemes()[0] })
      .tokens[0][0].color.toLowerCase();

  assert.equal(getActiveCodeTheme(), "github-dark");
  assert.equal(highlighter.getLoadedThemes()[0], "github-dark");
  assert.equal(keywordColour(), "#f97583");
  setActiveCodeTheme("catppuccin-mocha");
  assert.equal(highlighter.getLoadedThemes()[0], "catppuccin-mocha");
  assert.equal(keywordColour(), "#cba6f7");
  assert.equal(new Set(highlighter.getLoadedThemes()).size, CODE_THEME_IDS.length);
  // A code theme the highlighter never loaded would make Shiki throw on every highlight.
  setActiveCodeTheme("not-a-code-theme");
  assert.equal(getActiveCodeTheme(), "github-dark");
  assert.equal(keywordColour(), "#f97583");
});

// Collects console.error calls while `run` runs.
async function capturingErrors(run) {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    await run(errors);
  } finally {
    console.error = original;
  }
  return errors;
}

test("a code theme that fails to load leaves the others working and falls back to github-dark", async () => {
  const { createNotePaneHighlighter, setActiveCodeTheme } = await load();
  const errors = await capturingErrors(async () => {
    const highlighter = await createNotePaneHighlighter({
      nord: () => Promise.reject(new Error("The nord chunk failed to load")),
      "catppuccin-mocha": () => import("@shikijs/themes/catppuccin-mocha"),
    });
    await highlighter.loadLanguage("javascript");
    const keywordColour = () =>
      highlighter
        .codeToTokens("const answer = 42;", { lang: "javascript", theme: highlighter.getLoadedThemes()[0] })
        .tokens[0][0].color.toLowerCase();
    assert.ok(!highlighter.getLoadedThemes().includes("nord"));
    assert.ok(highlighter.getLoadedThemes().includes("catppuccin-mocha"));
    setActiveCodeTheme("nord");
    assert.equal(highlighter.getLoadedThemes()[0], "github-dark");
    assert.equal(keywordColour(), "#f97583");
    setActiveCodeTheme("catppuccin-mocha");
    assert.equal(highlighter.getLoadedThemes()[0], "catppuccin-mocha");
    assert.equal(keywordColour(), "#cba6f7");
  });
  assert.equal(errors.length, 1);
  assert.match(String(errors[0].join(" ")), /nord/);
});

test("an editor that fails to re-highlight stops neither the others nor the export", async () => {
  const { followCodeTheme, setActiveCodeTheme, withCodeTheme } = await load();
  const failing = fakeEditor([[0, "codeBlock"]]);
  const healthy = fakeEditor([[0, "codeBlock"]]);
  const unfollowFailing = followCodeTheme(failing);
  const unfollowHealthy = followCodeTheme(healthy);
  try {
    const errors = await capturingErrors(async () => {
      failing.broken = true;
      setActiveCodeTheme("nord");
      assert.deepEqual(failing.dispatched, []);
      assert.equal(healthy.dispatched.length, 1);

      // The failed editor was not marked as highlighted, so the next pass retries it alone.
      failing.broken = false;
      setActiveCodeTheme("nord");
      assert.equal(failing.dispatched.length, 1);
      assert.equal(healthy.dispatched.length, 1);

      // The export's own result and error survive a failing re-highlight around it.
      failing.broken = true;
      assert.equal(await withCodeTheme("github-dark", async () => "rendered"), "rendered");
      await assert.rejects(
        withCodeTheme("github-dark", async () => {
          throw new Error("export failed");
        }),
        /export failed/,
      );
      assert.equal(healthy.dispatched.length, 5);
    });
    // The first switch, then one on the way into each export. On the way out the window's code
    // theme is back to nord, which the failing editor already shows, so it is left alone.
    assert.equal(errors.length, 3);
  } finally {
    failing.broken = false;
    unfollowFailing();
    unfollowHealthy();
  }
});

test("a theme change re-highlights the code blocks of every followed editor, outside history", async () => {
  const { followCodeTheme, setActiveCodeTheme } = await load();
  const withCode = fakeEditor([[0, "paragraph"], [4, "codeBlock"], [20, "codeBlock"]]);
  const withoutCode = fakeEditor([[0, "paragraph"]]);
  const unfollowWithCode = followCodeTheme(withCode);
  const unfollowWithoutCode = followCodeTheme(withoutCode);
  // Following an editor does not re-highlight it: its first highlight uses the active theme.
  assert.deepEqual(withCode.dispatched, []);

  setActiveCodeTheme("catppuccin-latte");
  assert.deepEqual(withCode.dispatched, [{ marked: [4, 20], meta: { addToHistory: false } }]);
  assert.deepEqual(withoutCode.dispatched, []);

  // The same code theme again, as a theme with the same code theme gives: nothing to redo.
  setActiveCodeTheme("catppuccin-latte");
  assert.equal(withCode.dispatched.length, 1);

  unfollowWithCode();
  unfollowWithoutCode();
  setActiveCodeTheme("nord");
  assert.equal(withCode.dispatched.length, 1);
});

test("an editor followed again after a theme change is re-highlighted", async () => {
  const { followCodeTheme, setActiveCodeTheme } = await load();
  const editor = fakeEditor([[2, "codeBlock"]]);
  followCodeTheme(editor)();
  setActiveCodeTheme("dracula");
  assert.deepEqual(editor.dispatched, []);
  const unfollow = followCodeTheme(editor);
  assert.deepEqual(editor.dispatched, [{ marked: [2], meta: { addToHistory: false } }]);
  unfollow();
});

test("withCodeTheme highlights with its code theme while it runs and restores the window's", async () => {
  const { followCodeTheme, setActiveCodeTheme, getActiveCodeTheme, withCodeTheme } = await load();
  const editor = fakeEditor([[0, "codeBlock"]]);
  const unfollow = followCodeTheme(editor);
  try {
    setActiveCodeTheme("catppuccin-mocha");
    assert.equal(editor.dispatched.length, 1);

    const result = await withCodeTheme("github-dark", async () => {
      assert.equal(getActiveCodeTheme(), "github-dark");
      assert.equal(editor.dispatched.length, 2);
      return "rendered";
    });
    assert.equal(result, "rendered");
    assert.equal(getActiveCodeTheme(), "catppuccin-mocha");
    assert.equal(editor.dispatched.length, 3);

    await assert.rejects(
      withCodeTheme("github-dark", async () => {
        throw new Error("export failed");
      }),
      /export failed/,
    );
    assert.equal(getActiveCodeTheme(), "catppuccin-mocha");
    assert.equal(editor.dispatched.length, 5);

    // A theme chosen while the export runs (the save dialog can stay open) waits for it, then wins.
    await withCodeTheme("github-dark", async () => {
      setActiveCodeTheme("nord");
      assert.equal(getActiveCodeTheme(), "github-dark");
    });
    assert.equal(getActiveCodeTheme(), "nord");
    assert.equal(editor.dispatched.length, 7);
  } finally {
    unfollow();
  }
});
