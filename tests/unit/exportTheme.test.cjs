const test = require("node:test");
const assert = require("node:assert/strict");

const loadModules = async () => {
  // src/constants.js reads window.blocknoteSticky at import time.
  globalThis.window ??= {};
  const { withExportTheme } = await import("../../src/style/applyTheme.js");
  const { buildThemeTokens } = await import("../../src/style/themeTokens.js");
  const { getTheme } = await import("../../src/style/themes.js");
  return { withExportTheme, lightTokens: buildThemeTokens(getTheme("notepane-light")) };
};

// The parts of an element's inline CSSStyleDeclaration that withExportTheme uses. Each
// declaration is [value, priority], as getPropertyValue and getPropertyPriority report them.
function fakeElement(initial) {
  const declarations = new Map(Object.entries(initial));
  return {
    declarations,
    style: {
      setProperty(name, value, priority = "") {
        declarations.set(name, [String(value), priority]);
      },
      getPropertyValue: (name) => declarations.get(name)?.[0] ?? "",
      getPropertyPriority: (name) => declarations.get(name)?.[1] ?? "",
      removeProperty(name) {
        declarations.delete(name);
      },
    },
  };
}

function fakeWindow() {
  // A sticky window: the theme is on the root, React set the note's colours inline on the
  // shell and copied them to body.
  const root = fakeElement({
    "--sticky-text-color": ["#f1f1ef", ""],
    "color-scheme": ["dark", ""],
  });
  const body = fakeElement({
    "--sticky-text-color": ["#f7f7f4", ""],
    "--notepane-ui-font": ["Inter", ""],
  });
  const shell = fakeElement({
    "--sticky-text-color": ["#f7f7f4", ""],
    "--sticky-border-color": ["rgb(1 2 3 / 0.5)", "important"],
    "--editor-font-scale": ["1", ""],
  });
  const ownerDocument = {
    documentElement: root,
    body,
    querySelectorAll: (selector) => (selector === ".sticky-shell" ? [shell] : []),
  };
  const snapshot = () => [root, body, shell].map((element) => Object.fromEntries(element.declarations));
  return { root, body, shell, ownerDocument, snapshot };
}

test("withExportTheme forces every NotePane Light token while the export runs", async () => {
  const { withExportTheme, lightTokens } = await loadModules();
  const { root, body, shell, ownerDocument } = fakeWindow();
  const result = await withExportTheme(async () => {
    for (const element of [body, shell]) {
      for (const [name, value] of Object.entries(lightTokens)) {
        assert.equal(element.style.getPropertyValue(name), value, name);
        assert.equal(element.style.getPropertyPriority(name), "important", name);
      }
    }
    // The printed page's canvas follows the root's colour scheme.
    for (const element of [root, body, shell]) {
      assert.equal(element.style.getPropertyValue("color-scheme"), "light");
      assert.equal(element.style.getPropertyPriority("color-scheme"), "important");
    }
    assert.equal(root.style.getPropertyValue("--sticky-text-color"), "#f1f1ef");
    return "exported";
  }, ownerDocument);
  assert.equal(result, "exported");
});

test("withExportTheme restores each previous declaration, its priority and its absence", async () => {
  const { withExportTheme } = await loadModules();
  const { ownerDocument, snapshot } = fakeWindow();
  const before = snapshot();
  await withExportTheme(async () => {}, ownerDocument);
  assert.deepEqual(snapshot(), before);
});

test("withExportTheme restores the previous declarations when the export throws", async () => {
  const { withExportTheme } = await loadModules();
  const { ownerDocument, snapshot } = fakeWindow();
  const before = snapshot();
  await assert.rejects(
    withExportTheme(async () => {
      throw new Error("printToPDF failed");
    }, ownerDocument),
    /printToPDF failed/,
  );
  assert.deepEqual(snapshot(), before);
});

test("withExportTheme keeps a declaration that changed while the export ran", async () => {
  const { withExportTheme } = await loadModules();
  const { root, shell, ownerDocument } = fakeWindow();
  // The save dialog can stay open for a while; a theme change meanwhile rewrites the root and
  // React rewrites the shell, both without priority. Those values are newer than the saved ones.
  await withExportTheme(async () => {
    root.style.setProperty("color-scheme", "light");
    shell.style.setProperty("--sticky-text-color", "#123456");
  }, ownerDocument);
  assert.deepEqual(root.declarations.get("color-scheme"), ["light", ""]);
  assert.deepEqual(shell.declarations.get("--sticky-text-color"), ["#123456", ""]);
  assert.deepEqual(shell.declarations.get("--sticky-border-color"), ["rgb(1 2 3 / 0.5)", "important"]);
});
