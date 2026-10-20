#!/usr/bin/env node
// Colour-literal check. Every colour in the renderer, the Electron main process and index.html
// comes from the theme. A hard-coded colour fails the check unless it is allowlisted on purpose
// in scripts/check-colors-allowlist.json, one entry per literal line, each with its reason.
//
// What counts as a colour:
//   - hex, rgb()/rgba(), hsl()/hsla(), oklch() and lch() anywhere in a line, comments included;
//   - one of the 148 CSS named colours, in any case, where it is a colour: in the value of a
//     colour property (color, any *-color, background, border, outline, fill, stroke, shadows,
//     filter, mask, list-style-image, scrollbar-color, ...; property names in any case) or of a
//     custom property, inside a colour function (color-mix(), rgb(), hsl(), *-gradient(),
//     drop-shadow(), light-dark()), and in a shadow ("inset ... white", "0 1px 0 white").
//     Comments are read the same way. In .js/.jsx/.cjs this applies to string literals,
//     templates and `+` concatenations, where a `${…}` or concatenated expression standing in
//     a colour position has its string branches read as colours ("0 0 0 1px ${on ? "red" : x}",
//     "border-color: " + (on ? "red" : x)). The value of a colour-property object key, JSX
//     attribute, style assignment, setProperty() or setAttribute() call ({ borderLeftColor:
//     "red" }, { "--x": "white" }, setAttribute("fill", "white")) is read for named colours
//     through templates, calls, ?:, ||, ?? and +; setAttribute("style", …) is read as CSS text.
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

// A property whose value can hold a colour, lower-cased and without its vendor prefix: color or
// any *-color (border-inline-start-color, -webkit-text-fill-color, scrollbar-color, ...), and
// the shorthands and image, shadow and filter properties that take a colour.
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

// A JS name (borderLeftColor, WebkitTextFillColor, stopColor, "--pastel-color", "stop-color",
// "Background-Color") read as the CSS property it sets.
function isColourKey(name) {
  if (name.startsWith("--")) return true;
  if (name.includes("-")) return isColourProperty(name);
  const kebab = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return isColourProperty(kebab) || isColourProperty(name) || JS_COLOUR_PROPERTIES.has(kebab);
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
// A CSS declaration, from its property (in any case) to the `;` or the end of the block that
// ends it, so a value spanning several lines (a multi-line gradient, say) is read whole.
const CSS_DECLARATION = /(?:^|[\s;{"'`])(--[\w-]+|-?[a-z][\w-]*)\s*:([^;{}]*)/gi;

// Offsets, within `text`, of every named colour in it.
function namedColourOffsets(text) {
  return [...text.matchAll(NAMED_COLOUR)].map((match) => match.index);
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

// Offsets of the named colours that are colours inside `text`, a stylesheet, a comment or a JS
// string: colour-function arguments, shadows, and the values of colour and custom properties.
function colourOffsetsInText(text) {
  const offsets = [];
  for (const call of text.matchAll(COLOUR_FUNCTION)) {
    const open = call.index + call[0].length - 1;
    for (const offset of namedColourOffsets(argumentsAt(text, open))) offsets.push(open + 1 + offset);
  }
  for (const shadow of text.matchAll(SHADOW)) {
    for (const offset of namedColourOffsets(shadow[0])) offsets.push(shadow.index + offset);
  }
  for (const declaration of text.matchAll(CSS_DECLARATION)) {
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

// Lines of a stylesheet (or index.html) that hold a named colour as a colour. The code is read
// with its comments blanked, keeping every line where it is, and each comment on its own.
function cssNamedColourLines(source) {
  const lineOf = lineIndex(source);
  const comments = [...source.matchAll(/\/\*[\s\S]*?\*\//g)];
  const code = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  const offsets = colourOffsetsInText(code);
  for (const comment of comments) {
    for (const offset of colourOffsetsInText(comment[0])) offsets.push(comment.index + offset);
  }
  return new Set(offsets.map(lineOf));
}

/* ---------- JS: strings, templates, concatenations and colour-property values ---------- */

function* childNodes(node) {
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments" || key === "innerComments") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === "string") yield item;
    } else if (value && typeof value.type === "string") yield value;
  }
}

const isConcatenation = (node) => node?.type === "BinaryExpression" && node.operator === "+";

// A string, a template or a `+` concatenation as segments: literal text with its source offset,
// or an expression.
function segmentsOf(node, source) {
  if (node.type === "StringLiteral") return [{ text: source.slice(node.start + 1, node.end - 1), start: node.start + 1 }];
  if (node.type === "TemplateLiteral") {
    return node.quasis.flatMap((quasi, index) => [
      { text: source.slice(quasi.start, quasi.end), start: quasi.start },
      ...(index < node.expressions.length ? [{ expression: node.expressions[index] }] : []),
    ]);
  }
  if (isConcatenation(node)) return [...segmentsOf(node.left, source), ...segmentsOf(node.right, source)];
  return [{ expression: node }];
}

// The segments as one text, each expression replaced by `standIn(index)`, and where each
// segment sits in it.
function joinSegments(segments, standIn) {
  let text = "";
  const placed = segments.map((segment, index) => {
    const piece = segment.expression ? standIn(index) : segment.text;
    const at = text.length;
    text += piece;
    return { at, end: text.length, segment };
  });
  return { text, placed };
}

// The string and template literals a colour value can evaluate to: through templates' `${…}`,
// call and `new` arguments, ?:, ||, ?? and +.
function* valueLiterals(node) {
  if (!node) return;
  switch (node.type) {
    case "StringLiteral":
      yield node;
      break;
    case "TemplateLiteral":
      yield node;
      for (const expression of node.expressions) yield* valueLiterals(expression);
      break;
    case "CallExpression":
    case "OptionalCallExpression":
    case "NewExpression":
      for (const argument of node.arguments) yield* valueLiterals(argument);
      break;
    case "ConditionalExpression":
      yield* valueLiterals(node.consequent);
      yield* valueLiterals(node.alternate);
      break;
    case "LogicalExpression":
      yield* valueLiterals(node.left);
      yield* valueLiterals(node.right);
      break;
    case "BinaryExpression":
      if (node.operator === "+") {
        yield* valueLiterals(node.left);
        yield* valueLiterals(node.right);
      }
      break;
    case "JSXExpressionContainer":
    case "ParenthesizedExpression":
      yield* valueLiterals(node.expression);
      break;
    default:
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

// [name, value] when `node` gives a CSS-like property or a presentation attribute a value: an
// object key, a JSX attribute, an assignment to a member (element.style.color = …), or a
// setProperty(name, …) or setAttribute(name, …) call.
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
      const method =
        callee.type === "MemberExpression" || callee.type === "OptionalMemberExpression"
          ? keyName(callee.property, callee.computed)
          : null;
      return (method === "setProperty" || method === "setAttribute") && node.arguments[0]?.type === "StringLiteral"
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
  // Every named colour in each literal `node` can evaluate to.
  const addNamedColours = (node) => {
    for (const literal of valueLiterals(node)) {
      const { text, placed } = joinSegments(segmentsOf(literal, source), () => "0");
      for (const offset of namedColourOffsets(text)) {
        const { at, segment } = placed.find((place) => offset >= place.at && offset < place.end);
        if (!segment.expression) lines.add(lineOf(segment.start + offset - at));
      }
    }
  };
  // Colours in a string, template or concatenation read as CSS text. Its own text is read with
  // each expression as a number; then each expression in turn stands in as a colour, and if
  // that lands in a colour position, the expression's literals are read as colours.
  const addTextColours = (node) => {
    const segments = segmentsOf(node, source);
    if (!segments.some((segment) => !segment.expression)) return;
    const plain = joinSegments(segments, () => "0");
    for (const offset of colourOffsetsInText(plain.text)) {
      const { at, segment } = plain.placed.find((place) => offset >= place.at && offset < place.end);
      if (!segment.expression) lines.add(lineOf(segment.start + offset - at));
    }
    segments.forEach((segment, index) => {
      if (!segment.expression) return;
      const probe = joinSegments(segments, (other) => (other === index ? "red" : "0"));
      const { at, end } = probe.placed[index];
      if (colourOffsetsInText(probe.text).some((offset) => offset >= at && offset < end)) {
        addNamedColours(segment.expression);
      }
    });
  };
  const visit = (node, parent) => {
    const isText =
      node.type === "StringLiteral" ||
      node.type === "TemplateLiteral" ||
      (isConcatenation(node) && !isConcatenation(parent));
    if (isText) addTextColours(node);
    const [name, value] = propertyValue(node);
    if (name && name.toLowerCase() === "style" && node.type !== "ObjectProperty" && node.type !== "JSXAttribute") {
      // setAttribute("style", …) and element.style = …: CSS text.
      for (const literal of valueLiterals(value)) addTextColours(literal);
    } else if (name && isColourKey(name)) {
      addNamedColours(value);
    }
    for (const child of childNodes(node)) visit(child, node);
  };
  visit(ast.program, null);
  for (const comment of ast.comments ?? []) {
    for (const offset of colourOffsetsInText(comment.value)) lines.add(lineOf(comment.start + 2 + offset));
  }
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
// literal later added inside them. An entry that covers nothing fails the check too, since it
// would silently admit the next matching line; one kept only to document a non-literal carries
// `"documentation": true` and covers nothing.
function readAllowlist() {
  const allowlist = JSON.parse(fs.readFileSync(ALLOWLIST_FILE, "utf8"));
  const invalid = allowlist.filter(
    (entry) =>
      typeof entry.file !== "string" ||
      typeof entry.text !== "string" || !entry.text ||
      typeof entry.reason !== "string" || !entry.reason.trim() ||
      ("documentation" in entry && entry.documentation !== true) ||
      "lines" in entry,
  );
  for (const entry of invalid) {
    console.error(
      `check-colors: allowlist entry needs a file, the text of one line and a reason, no lines, and documentation only as true: ${JSON.stringify(entry)}`,
    );
  }
  if (invalid.length) process.exit(1);
  return allowlist;
}

// A maximum one-to-one matching of findings to the allowlist entries that cover them, by
// augmenting paths, file by file. Findings are tried in line order and entries in allowlist
// order, so the result is deterministic. Returns the findings and the entries left unmatched.
function matchAllowlist(findings, allowlist) {
  const entries = allowlist.filter((entry) => entry.documentation !== true);
  const entryOf = new Map(); // finding -> entry
  const findingOf = new Map(); // entry -> finding
  const covers = (entry, finding) => entry.file === finding.file && finding.text.includes(entry.text);
  const augment = (finding, visited) => {
    for (const entry of entries) {
      if (visited.has(entry) || !covers(entry, finding)) continue;
      visited.add(entry);
      const holder = findingOf.get(entry);
      if (holder === undefined || augment(holder, visited)) {
        findingOf.set(entry, finding);
        entryOf.set(finding, entry);
        return true;
      }
    }
    return false;
  };
  for (const finding of findings) augment(finding, new Set());
  return {
    unallowed: findings.filter((finding) => !entryOf.has(finding)),
    unused: entries.filter((entry) => !findingOf.has(entry)),
  };
}

if (fs.existsSync(KNOWN_FILE)) {
  console.error(`check-colors: scripts/${path.basename(KNOWN_FILE)} exists. ${FINISHED}.`);
  process.exit(1);
}

const findings = await findLiterals();
const { unallowed, unused } = matchAllowlist(findings, readAllowlist());

if (process.argv.includes("--write-known")) {
  console.log(JSON.stringify(unallowed.map(({ file, text }) => ({ file, text })), null, 2));
  process.exit(0);
}

for (const finding of unallowed) {
  console.error(`${finding.file}:${finding.line}: new colour literal: ${finding.text}`);
}
for (const entry of unused) {
  console.error(`${entry.file}: allowlist entry covers no colour literal, remove it: ${entry.text}`);
}
if (unallowed.length || unused.length) {
  console.error(
    `check-colors: ${unallowed.length} new, ${unused.length} unused. Take colours from the theme tokens, or, for a deliberate literal, add it to scripts/check-colors-allowlist.json with a reason; remove an entry whose literal is gone.`,
  );
  process.exit(1);
}
console.log(`check-colors: ok (${findings.length} allowlisted)`);
