import { buildThemeTokens } from "./themeTokens.js";

// The token names each root received last, so a theme that lacks one clears the old value
// instead of leaving the previous theme's colour behind.
const appliedTokenNames = new WeakMap();

// One adopted stylesheet per document, holding the body rule below.
const bodyRuleSheets = new WeakMap();

/**
 * Applies a theme to the document: every derived token becomes a custom property on `root`,
 * tokens a previous call set that this theme lacks are removed, and the theme's id and scheme
 * are recorded as `data-theme-id`, `data-theme-scheme` and `color-scheme`. BlockNote's menus
 * are portalled into `document.body`, so they inherit the tokens from the root.
 */
export function applyThemeToDocument(theme, root = document.documentElement) {
  const tokens = buildThemeTokens(theme);
  for (const name of appliedTokenNames.get(root) ?? []) {
    if (!Object.hasOwn(tokens, name)) {
      root.style.removeProperty(name);
    }
  }
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
  appliedTokenNames.set(root, new Set(Object.keys(tokens)));
  root.dataset.themeId = theme.id;
  root.dataset.themeScheme = theme.scheme;
  root.style.colorScheme = theme.scheme;
  if (root === root.ownerDocument.documentElement) {
    declareReferencingTokensOnBody(root.ownerDocument, tokens);
  }
}

// A token whose value reads another token, such as the scrollbar thumb's
// `color-mix(in srgb, var(--sticky-text-color) 28%, transparent)`, takes the referenced value
// where it is declared, and descendants inherit the result. A sticky window copies its note's
// colours inline onto body for the menus portalled there, and the export rule overrides body
// too, so these tokens must resolve on body, not only on the root. A stylesheet rule on `body`
// keeps them below body's inline style and below `body.is-exporting`, as the theme rule that
// declared every token on body did.
function declareReferencingTokensOnBody(ownerDocument, tokens) {
  let sheet = bodyRuleSheets.get(ownerDocument);
  if (!sheet) {
    sheet = new ownerDocument.defaultView.CSSStyleSheet();
    ownerDocument.adoptedStyleSheets = [...ownerDocument.adoptedStyleSheets, sheet];
    bodyRuleSheets.set(ownerDocument, sheet);
  }
  const declarations = Object.entries(tokens)
    .filter(([, value]) => value.includes("var("))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
  sheet.replaceSync(`body {\n${declarations}\n}`);
}

// The main process puts the current theme id in each window's URL, so the entry script can
// apply it before React mounts and the first frame already has the theme's colours.
export function readInitialThemeId(search = window.location.search) {
  return new URLSearchParams(search).get("themeId");
}
