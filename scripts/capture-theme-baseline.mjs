#!/usr/bin/env node
// Captures today's NotePane Light/Dark colour tokens and the sticky/tab style output
// into tests/unit/fixtures/theme-baseline.json. The theme refactor must reproduce it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS_CSS = path.join(ROOT, "src/styles/tokens.css");
const FIXTURE = path.join(ROOT, "tests/unit/fixtures/theme-baseline.json");

const OPACITIES = [1, 0.6, 0.35];
const MODES = ["light", "dark"];
const EXTRA_ACCENTS = ["#ff0000", "#808080"];

const collapse = (text) => text.replace(/\s+/g, " ").trim();

// Returns top-level `selector { body }` rules. Brace matching only; no at-rule nesting needed.
function readTopLevelBlocks(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{") {
      if (depth === 0) {
        bodyStart = i + 1;
      }
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        blocks.push({
          selector: collapse(source.slice(selectorStart, bodyStart - 1)),
          body: source.slice(bodyStart, i),
        });
        selectorStart = i + 1;
      }
    }
  }
  return blocks;
}

function readCustomProperties(body) {
  const tokens = {};
  for (const declaration of body.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const name = declaration.slice(0, colon).trim();
    if (name.startsWith("--")) {
      tokens[name] = collapse(declaration.slice(colon + 1));
    }
  }
  return tokens;
}

function pickTokens(blocks, selector, requiredMarker = "") {
  const matches = blocks.filter(
    (block) => block.selector === selector && block.body.includes(requiredMarker),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one "${selector}" block${requiredMarker ? ` with ${requiredMarker}` : ""} in tokens.css, found ${matches.length}`,
    );
  }
  return readCustomProperties(matches[0].body);
}

export function readTokenBaseline(css = fs.readFileSync(TOKENS_CSS, "utf8")) {
  const blocks = readTopLevelBlocks(css);
  // The `.sticky-shell` selector also owns a layout rule, so the find blocks are told apart
  // by the --notepane-find-* tokens they declare.
  const light = {
    ...pickTokens(blocks, "body.theme-light, .sticky-shell"),
    ...pickTokens(blocks, ".sticky-shell", "--notepane-find-"),
  };
  const dark = {
    ...light,
    ...pickTokens(blocks, "body.theme-dark, .sticky-shell.theme-dark"),
    ...pickTokens(blocks, ".sticky-shell.theme-dark", "--notepane-find-"),
  };
  return { light, dark };
}

async function loadModules() {
  // src/constants.js reads window.blocknoteSticky at load time; plain Node has no window.
  globalThis.window ??= {};
  const themeStyles = await import(pathToFileURL(path.join(ROOT, "src/style/themeStyles.js")).href);
  const constants = await import(pathToFileURL(path.join(ROOT, "src/constants.js")).href);
  return { themeStyles, constants };
}

export async function buildStyleBaseline() {
  const { themeStyles, constants } = await loadModules();
  const pastels = constants.STICKY_PASTEL_PALETTE;
  const sticky = [];
  const tabs = [];

  for (const accentColor of [...pastels, ...EXTRA_ACCENTS]) {
    for (const tabTextOpacity of OPACITIES) {
      for (const mode of MODES) {
        const noteTheme = { tabTextColor: accentColor, tabTextOpacity };
        sticky.push({
          noteTheme,
          accentColor,
          mode,
          style: themeStyles.getStickyShellStyle(noteTheme, accentColor, mode),
        });
      }
    }
  }

  for (const tabTextColor of [null, ...pastels]) {
    for (const tabTextOpacity of OPACITIES) {
      for (const mode of MODES) {
        for (const noteIndex of [0, 3]) {
          const noteTheme = { tabTextColor, tabTextOpacity };
          tabs.push({
            noteTheme,
            noteIndex,
            mode,
            style: themeStyles.getSessionTabStyle(noteTheme, mode, noteIndex),
          });
        }
      }
    }
  }

  return { sticky, tabs };
}

async function main() {
  const baseline = { tokens: readTokenBaseline(), ...(await buildStyleBaseline()) };
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(
    `theme baseline: ${Object.keys(baseline.tokens.light).length} light tokens, ` +
      `${Object.keys(baseline.tokens.dark).length} dark tokens, ` +
      `${baseline.sticky.length} sticky, ${baseline.tabs.length} tabs -> ${path.relative(ROOT, FIXTURE)}`,
  );
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
