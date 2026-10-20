#!/usr/bin/env node
// Colour-literal check. Every colour in the renderer, the Electron main process and index.html
// comes from the theme. A hard-coded colour fails the check unless it is allowlisted on purpose
// in scripts/check-colors-allowlist.json, one entry per literal line, each with its reason.
//
// What counts as a colour:
//   - hex, rgb()/rgba(), hsl()/hsla(), oklch() and lch() anywhere in a line, comments included;
//   - one of the 148 CSS named colours, in any case, where it is a colour: in the value of a
//     colour property (color, any *-color, background, border, outline, fill, stroke, shadows,
//     filter, mask, list-style-image, scrollbar-color, ...) or of a custom property, and
//     inside a colour function (color-mix(), rgb(), hsl(), *-gradient(), drop-shadow(),
//     light-dark()). In .js/.jsx/.cjs the same applies to string and template literals: a
//     colour-function argument, a shadow ("inset ... white", "0 1px 0 white"), a CSS text
//     ("border-color: red"), and the value of a colour-property object key, JSX attribute,
//     style assignment or setProperty() call ({ borderLeftColor: "red" }, { "--x": "white" }).
//     Elsewhere a colour name is a word: a palette key, a list of BlockNote colour names, a class
//     name. `transparent` and `currentColor` are not colours to this check.
//
// The colour migration is finished, so there is no known-debt list. A committed
// scripts/check-colors-known.json fails the check: fix the colour at its source or allowlist
// it with a reason. `--write-known` is a diagnostic: it prints, to stdout, the list such a file
// would hold (every literal that is not allowlisted) and writes nothing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALLOWLIST_FILE = path.join(ROOT, "scripts/check-colors-allowlist.json");
const KNOWN_FILE = path.join(ROOT, "scripts/check-colors-known.json");
const FINISHED =
  "The colour migration is finished: fix the colour at its source or allowlist it with a reason";

const SCAN_DIRS = [
  { dir: "src", extensions: [".css", ".js", ".jsx"] },
  { dir: "electron", extensions: [".cjs"] },
];
const SCAN_FILES = ["index.html"];
// Theme definitions: the only files whose colours are the theme.
const SKIPPED_FILES = new Set(["electron/themes.json", "src/style/sentinelThemes.js"]);

// The CSS Color 4 named colours, 148 with both spellings of grey.
const NAMED_COLOURS = [
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black",
  "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse",
  "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan",
  "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki", "darkmagenta",
  "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
  "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink",
  "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen",
  "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow",
  "grey", "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
  "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan",
  "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon",
  "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue",
  "lightyellow", "lime", "limegreen", "linen", "magenta", "maroon", "mediumaquamarine",
  "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
  "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream",
  "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange",
  "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred",
  "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple",
  "red", "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell",
  "sienna", "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow", "springgreen",
  "steelblue", "tan", "teal", "thistle", "tomato", "turquoise", "violet", "wheat", "white",
  "whitesmoke", "yellow", "yellowgreen",
];
const NAMED = NAMED_COLOURS.join("|");
// A named colour as a whole word: not part of a name such as --red or .white-space, and not a
// function such as tan().
const NAMED_COLOUR = new RegExp(`(?<![\\w-])(?:${NAMED})(?![\\w(-])`, "gi");

// Hex and colour functions, matched anywhere in a line.
const LITERAL_PATTERNS = [/#[0-9a-fA-F]{3,8}\b/, /\brgba?\(/, /\bhsla?\(/, /\boklch\(/, /\blch\(/];

// A property whose value can hold a colour, without its vendor prefix: color or any *-color
// (border-inline-start-color, -webkit-text-fill-color, scrollbar-color, ...), and the
// shorthands and image, shadow and filter properties that take a colour.
const COLOUR_PROPERTY = new RegExp(
  "^(?:color|[a-z-]+-color|background(?:-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?" +
    "|border-image(?:-source)?|outline|column-rule|text-decoration|text-emphasis|text-stroke|fill|stroke" +
    "|box-shadow|text-shadow|filter|backdrop-filter|mask(?:-image|-border(?:-source)?)?|list-style(?:-image)?)$",
);
// Canvas colour properties, set from JS only.
const JS_COLOUR_PROPERTIES = new Set(["fill-style", "stroke-style"]);
const VENDOR_PREFIX = /^-(?:webkit|moz|ms|o)-/;

function isColourProperty(property) {
  return property.startsWith("--") || COLOUR_PROPERTY.test(property.toLowerCase().replace(VENDOR_PREFIX, ""));
}

// A JS name (borderLeftColor, WebkitTextFillColor, stopColor, "--pastel-color",
// "stop-color") read as the CSS property it sets.
function isColourKey(name) {
  if (name.startsWith("--")) return true;
  const kebab = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return isColourProperty(kebab) || JS_COLOUR_PROPERTIES.has(kebab);
}

// A colour function, whose arguments are colours wherever they are not numbers or keywords.
const COLOUR_FUNCTION = /(?<![\w-])(?:color-mix|rgba?|hsla?|oklch|lch|light-dark|drop-shadow|[a-z-]*gradient)\(/gi;
// A shadow layer that ends in a named colour: `inset ... <colour>` or `<length> <length>
// [<length> [<length>]] <colour>`, and the colour-first `<colour> <length> <length> ...`.
const LENGTH = "-?(?:\\d*\\.)?\\d+(?:[a-z]+|%)?";
const SHADOW = new RegExp(
  `(?:\\binset\\b[^,;{}()]*?|(?:${LENGTH}\\s+){2,4})(?<![\\w-])(?:${NAMED})(?![\\w(-])` +
    `|(?<![\\w-])(?:${NAMED})(?:\\s+${LENGTH}){2,4}(?![\\w(-])`,
  "gi",
);
// A CSS declaration, from its property to the `;` or the end of the block that ends it, so a
// value spanning several lines (a multi-line gradient, say) is read whole.
const CSS_DECLARATION = /(?:^|[\s;{"'`])(--[\w-]+|-?[a-z][\w-]*)\s*:([^;{}]*)/g;

// A url() names a file, not a colour: blanked before a value is read.
const blankUrls = (text) => text.replace(/\burl\([^)]*\)/gi, (url) => " ".repeat(url.length));

// Offsets, within `text`, of every named colour in it.
function namedColourOffsets(text) {
  return [...blankUrls(text).matchAll(NAMED_COLOUR)].map((match) => match.index);
}

// The text between the parentheses of the call whose `(` is at `open`.
function argumentsAt(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")" && --depth === 0) return text.slice(open + 1, index);
  }
  return text.slice(open + 1);
}

// Offsets of the named colours that are colours inside `text`, a stylesheet or a JS string:
// colour-function arguments, shadows, and the values of colour and custom properties.
function colourOffsetsInText(text) {
  const offsets = [];
  const clean = blankUrls(text);
  for (const call of clean.matchAll(COLOUR_FUNCTION)) {
    const open = call.index + call[0].length - 1;
    for (const offset of namedColourOffsets(argumentsAt(clean, open))) offsets.push(open + 1 + offset);
  }
  for (const shadow of clean.matchAll(SHADOW)) {
    for (const offset of namedColourOffsets(shadow[0])) offsets.push(shadow.index + offset);
  }
  for (const declaration of clean.matchAll(CSS_DECLARATION)) {
    const [whole, property, value] = declaration;
    if (!isColourProperty(property)) continue;
    const valueStart = declaration.index + whole.length - value.length;
    for (const offset of namedColourOffsets(value)) offsets.push(valueStart + offset);
  }
  return offsets;
}

function lineIndex(source) {
  const lineStarts = [0];
  for (let index = source.indexOf("\n"); index !== -1; index = source.indexOf("\n", index + 1)) {
    lineStarts.push(index + 1);
  }
  return (offset) => lineStarts.findLastIndex((start) => start <= offset) + 1;
}

// Lines of a stylesheet (or index.html) that hold a named colour as a colour. Comments are
// blanked first, keeping every line where it is.
function cssNamedColourLines(source) {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const lineOf = lineIndex(css);
  return new Set(colourOffsetsInText(css).map(lineOf));
}

/* ---------- JS: string literals and colour-property values ---------- */

function* childNodes(node) {
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments" || key === "innerComments") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === "string") yield item;
    } else if (value && typeof value.type === "string") yield value;
  }
}

// A string or template literal as { text, start }: its source between the quotes, with each
// `${…}` blanked to zeros (a number, so `0 1px ${blur} white` still reads as a shadow). Its
// offsets are source offsets.
function literalText(node, source) {
  if (node.type === "StringLiteral") return { text: source.slice(node.start + 1, node.end - 1), start: node.start + 1 };
  if (node.type !== "TemplateLiteral") return null;
  const start = node.start + 1;
  let text = source.slice(start, node.end - 1);
  // Between two quasis lies one `${…}`.
  node.quasis.slice(1).forEach((quasi, index) => {
    const from = node.quasis[index].end - start;
    const to = quasi.start - start;
    text = `${text.slice(0, from)}${"0".repeat(to - from)}${text.slice(to)}`;
  });
  return { text, start };
}

// The string and template literals a value can evaluate to, through ?:, ||, ?? and +.
function* valueLiterals(node) {
  if (!node) return;
  if (node.type === "StringLiteral" || node.type === "TemplateLiteral") yield node;
  else if (node.type === "ConditionalExpression") {
    yield* valueLiterals(node.consequent);
    yield* valueLiterals(node.alternate);
  } else if (node.type === "LogicalExpression" || node.type === "BinaryExpression") {
    yield* valueLiterals(node.left);
    yield* valueLiterals(node.right);
  } else if (node.type === "JSXExpressionContainer" || node.type === "ParenthesizedExpression") {
    yield* valueLiterals(node.expression);
  }
}

// The name a key, JSX attribute or member sets, when it is a plain name.
function keyName(key, computed) {
  if (!key) return null;
  if (key.type === "Identifier" && !computed) return key.name;
  if (key.type === "JSXIdentifier") return key.name;
  if (key.type === "StringLiteral") return key.value;
  return null;
}

// [name, value] when `node` gives a CSS-like property a value: an object key, a JSX attribute,
// an assignment to a member (element.style.color = …) or element.style.setProperty(name, …).
function propertyValue(node) {
  switch (node.type) {
    case "ObjectProperty":
      return [keyName(node.key, node.computed), node.value];
    case "JSXAttribute":
      return [keyName(node.name, false), node.value];
    case "AssignmentExpression":
      return node.left.type === "MemberExpression" || node.left.type === "OptionalMemberExpression"
        ? [keyName(node.left.property, node.left.computed), node.right]
        : [null, null];
    case "CallExpression":
    case "OptionalCallExpression": {
      const { callee } = node;
      const isSetProperty =
        (callee.type === "MemberExpression" || callee.type === "OptionalMemberExpression") &&
        keyName(callee.property, callee.computed) === "setProperty";
      return isSetProperty && node.arguments[0]?.type === "StringLiteral"
        ? [node.arguments[0].value, node.arguments[1]]
        : [null, null];
    }
    default:
      return [null, null];
  }
}

async function jsNamedColourLines(source, file) {
  let ast;
  try {
    ({ ast } = await prettier.__debug.parse(source, { parser: "babel", filepath: path.join(ROOT, file) }));
  } catch (error) {
    throw new Error(`${file}: parse error - ${error.message}`);
  }
  const lineOf = lineIndex(source);
  const lines = new Set();
  const visit = (node) => {
    const literal = literalText(node, source);
    if (literal) {
      for (const offset of colourOffsetsInText(literal.text)) lines.add(lineOf(literal.start + offset));
    }
    const [name, value] = propertyValue(node);
    if (name && isColourKey(name)) {
      for (const valueNode of valueLiterals(value)) {
        const { text, start } = literalText(valueNode, source);
        for (const offset of namedColourOffsets(text)) lines.add(lineOf(start + offset));
      }
    }
    for (const child of childNodes(node)) visit(child);
  };
  visit(ast.program);
  return lines;
}

/* ---------- run ---------- */

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

async function findLiterals() {
  const files = [
    ...SCAN_DIRS.flatMap(({ dir, extensions }) => listFiles(dir, extensions)),
    ...SCAN_FILES,
  ]
    .filter((file) => !SKIPPED_FILES.has(file))
    .sort();
  const findings = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    const namedLines = /\.(?:css|html)$/.test(file)
      ? cssNamedColourLines(source)
      : await jsNamedColourLines(source, file);
    source.split("\n").forEach((line, index) => {
      if (namedLines.has(index + 1) || LITERAL_PATTERNS.some((pattern) => pattern.test(line))) {
        findings.push({ file, line: index + 1, text: line.trim() });
      }
    });
  }
  return findings;
}

// Every entry names a file, the text of one literal line, and its reason. An entry covers one
// finding in its file whose line contains its text, so two identical literal lines need two
// entries and a third copy fails the check. There are no line ranges: they would hide any
// literal later added inside them.
function readAllowlist() {
  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, "utf8"));
  const invalid = allowlist.filter(
    (entry) =>
      typeof entry.file !== "string" ||
      typeof entry.text !== "string" || !entry.text ||
      typeof entry.reason !== "string" || !entry.reason.trim() ||
      "lines" in entry,
  );
  for (const entry of invalid) {
    console.error(`check-colors: allowlist entry needs a file, the text of one line and a reason, and no lines: ${JSON.stringify(entry)}`);
  }
  if (invalid.length) process.exit(1);
  return allowlist;
}

function unallowed(findings, allowlist) {
  const unused = new Set(allowlist);
  return findings.filter((finding) => {
    const entry = [...unused]
      .filter((candidate) => candidate.file === finding.file && finding.text.includes(candidate.text))
      .sort((first, second) => second.text.length - first.text.length)[0];
    if (!entry) return true;
    unused.delete(entry);
    return false;
  });
}

if (fs.existsSync(KNOWN_FILE)) {
  console.error(`check-colors: scripts/${path.basename(KNOWN_FILE)} exists. ${FINISHED}.`);
  process.exit(1);
}

const findings = await findLiterals();
const candidates = unallowed(findings, readAllowlist());

if (process.argv.includes("--write-known")) {
  console.log(JSON.stringify(candidates.map(({ file, text }) => ({ file, text })), null, 2));
  process.exit(0);
}

for (const finding of candidates) {
  console.error(`${finding.file}:${finding.line}: new colour literal: ${finding.text}`);
}
if (candidates.length) {
  console.error(
    `check-colors: ${candidates.length} new. Take colours from the theme tokens, or, for a deliberate literal, add it to scripts/check-colors-allowlist.json with a reason.`,
  );
  process.exit(1);
}
console.log(`check-colors: ok (${findings.length} allowlisted)`);
