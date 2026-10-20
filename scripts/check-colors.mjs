#!/usr/bin/env node
// Colour-literal check. Every hard-coded colour in the renderer, Electron main process and
// index.html is allowlisted on purpose (scripts/check-colors-allowlist.json), each entry with
// its reason. The known-debt list (scripts/check-colors-known.json) is empty, so its file is
// gone; a missing file is an empty list:
//   - a literal that is in neither list fails the check;
//   - a known entry that no longer occurs fails the check.
// `--write-known` regenerates the known list from the current tree, and leaves no file when
// the list is empty.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST_FILE = path.join(ROOT, "scripts/check-colors-allowlist.json");
const KNOWN_FILE = path.join(ROOT, "scripts/check-colors-known.json");
const KNOWN_NAME = "check-colors-known.json";

const SCAN_DIRS = [
  { dir: "src", extensions: [".css", ".js", ".jsx"] },
  { dir: "electron", extensions: [".cjs"] },
];
const SCAN_FILES = ["index.html"];
const SKIPPED_FILES = new Set(["electron/themes.json", "src/style/sentinelThemes.js"]);

const NAMED = "white|black|red|blue|gray|grey";
const COLOR_PROPERTIES =
  "color|background|background-color|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline(?:-color)?" +
  "|fill|stroke|caret-color|accent-color|box-shadow|text-shadow|text-decoration-color";
const PATTERNS = [
  /#[0-9a-fA-F]{3,8}\b/,
  /\brgba?\(/,
  /\bhsla?\(/,
  /\boklch\(/,
  /\blch\(/,
  // A named colour used as the value of a CSS colour property.
  new RegExp(`(?:^|[\\s;{])(?:${COLOR_PROPERTIES})\\s*:[^;]*(?<![\\w-])(?:${NAMED})(?![\\w-])`),
  // The same in a JS style object, e.g. color: "white".
  new RegExp(
    `\\b(?:color|backgroundColor|borderColor|outlineColor|fill|stroke)\\s*:\\s*["'\`](?:${NAMED})["'\`]`,
  ),
];

// A CSS declaration, from its property to the `;` or the end of the block that ends it, so a
// value spanning several lines (a multi-line gradient's color-mix(), say) is read whole. Its
// value is checked for named colours when the property is a colour property or a custom
// property, or when the value mixes colours with color-mix().
const CSS_DECLARATION = /(?:^|[\s;{])(--[\w-]+|-?[a-z][\w-]*)\s*:([^;{}]*)/g;
const CSS_COLOUR_PROPERTY = new RegExp(`^(?:${COLOR_PROPERTIES}|--[\\w-]+)$`);
const CSS_NAMED_COLOUR = new RegExp(`(?<![\\w-])(?:${NAMED})(?![\\w-])`, "g");

// The lines of a stylesheet that hold a named colour inside a colour declaration. Comments
// are blanked first, keeping every line where it is.
function namedColourLines(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const lineStarts = [0];
  for (let index = css.indexOf("\n"); index !== -1; index = css.indexOf("\n", index + 1)) {
    lineStarts.push(index + 1);
  }
  const lineOf = (offset) => lineStarts.findLastIndex((start) => start <= offset) + 1;
  const found = new Set();
  for (const declaration of css.matchAll(CSS_DECLARATION)) {
    const [whole, property, value] = declaration;
    if (!CSS_COLOUR_PROPERTY.test(property) && !value.includes("color-mix(")) continue;
    const valueStart = declaration.index + whole.length - value.length;
    for (const colour of value.matchAll(CSS_NAMED_COLOUR)) {
      found.add(lineOf(valueStart + colour.index));
    }
  }
  return found;
}

function listFiles(dir, extensions) {
  const found = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      found.push(...listFiles(relative, extensions));
    } else if (extensions.includes(path.extname(entry.name))) {
      found.push(relative);
    }
  }
  return found;
}

function findLiterals() {
  const files = [
    ...SCAN_DIRS.flatMap(({ dir, extensions }) => listFiles(dir, extensions)),
    ...SCAN_FILES,
  ]
    .filter((file) => !SKIPPED_FILES.has(file))
    .sort();
  const findings = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    const declarationLines = file.endsWith(".css") ? namedColourLines(source) : new Set();
    source.split("\n").forEach((line, index) => {
      if (declarationLines.has(index + 1) || PATTERNS.some((pattern) => pattern.test(line))) {
        findings.push({ file, line: index + 1, text: line.trim() });
      }
    });
  }
  return findings;
}

function readJson(file, fallback) {
  // A missing file is an empty list: the known list is deleted once the migration is done.
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

// An allowlist entry covers a finding in the same file whose line contains
// `text`, or, when it carries `lines: [first, last]`, any finding inside that line range.
function isAllowed(finding, allowlist) {
  return allowlist.some((entry) => {
    if (entry.file !== finding.file) return false;
    if (Array.isArray(entry.lines)) {
      return finding.line >= entry.lines[0] && finding.line <= entry.lines[1];
    }
    return finding.text.includes(entry.text);
  });
}

function keyOf(entry) {
  return `${entry.file}\u0000${entry.text}`;
}

const findings = findLiterals();
const allowlist = readJson(ALLOWLIST_FILE, []);
const candidates = findings.filter((finding) => !isAllowed(finding, allowlist));

if (process.argv.includes("--write-known")) {
  const known = candidates.map(({ file, text }) => ({ file, text }));
  if (known.length) {
    fs.writeFileSync(KNOWN_FILE, `${JSON.stringify(known, null, 2)}\n`);
    console.log(`check-colors: wrote ${known.length} known literals to scripts/${KNOWN_NAME}`);
  } else {
    fs.rmSync(KNOWN_FILE, { force: true });
    console.log(`check-colors: no known literals; scripts/${KNOWN_NAME} is not written`);
  }
  process.exit(0);
}

// Known entries are a multiset: two identical lines in one file need two entries.
const remaining = new Map();
for (const entry of readJson(KNOWN_FILE, [])) {
  remaining.set(keyOf(entry), (remaining.get(keyOf(entry)) ?? 0) + 1);
}
const unknown = [];
for (const finding of candidates) {
  const left = remaining.get(keyOf(finding)) ?? 0;
  if (left > 0) {
    remaining.set(keyOf(finding), left - 1);
  } else {
    unknown.push(finding);
  }
}
const stale = [...remaining].filter(([, count]) => count > 0);

for (const finding of unknown) {
  console.error(`${finding.file}:${finding.line}: new colour literal: ${finding.text}`);
}
for (const [key, count] of stale) {
  const [file, text] = key.split("\u0000");
  console.error(`${file}: known colour literal no longer occurs (x${count}), remove from ${KNOWN_NAME}: ${text}`);
}

if (unknown.length || stale.length) {
  console.error(
    `check-colors: ${unknown.length} new, ${stale.length} stale. Take colours from the theme tokens, or, for a deliberate literal, add it to scripts/check-colors-allowlist.json with a reason.`,
  );
  process.exit(1);
}
console.log(
  `check-colors: ok (${candidates.length} known, ${findings.length - candidates.length} allowlisted)`,
);
