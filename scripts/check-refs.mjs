#!/usr/bin/env node
// Static check: find identifiers that are referenced but never declared, imported,
// or provided by the runtime. Catches imports dropped during refactors in ~1s,
// long before the browser suites would.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

// Built-in DOM interfaces such as HTMLTableCellElement or SVGSVGElement.
const DOM_INTERFACE = /^(?:HTML|SVG|MathML)[A-Za-z]*Element$/;
const GLOBALS = new Set([
  // language
  "globalThis", "Object", "Array", "String", "Number", "Boolean", "Symbol", "BigInt",
  "Math", "JSON", "Date", "RegExp", "Error", "TypeError", "RangeError", "SyntaxError",
  "Map", "Set", "WeakMap", "WeakSet", "Promise", "Proxy", "Reflect", "Function",
  "Infinity", "NaN", "undefined", "parseInt", "parseFloat", "isNaN", "isFinite",
  "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI", "structuredClone",
  "queueMicrotask", "Intl", "ArrayBuffer", "Uint8Array", "Uint8ClampedArray", "DataView",
  // browser
  "window", "document", "navigator", "location", "history", "screen", "console",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback",
  "fetch", "Request", "Response", "Headers", "FormData", "URL", "URLSearchParams",
  "Blob", "File", "FileReader", "Image", "Audio", "Option", "Worker", "MessageChannel",
  "Element", "HTMLElement", "HTMLInputElement", "HTMLImageElement", "HTMLCanvasElement",
  "HTMLTextAreaElement", "HTMLSelectElement", "HTMLAnchorElement", "SVGElement",
  "Node", "NodeList", "Text", "Range", "Selection", "DOMParser", "XMLSerializer",
  "Event", "CustomEvent", "KeyboardEvent", "MouseEvent", "PointerEvent", "DragEvent",
  "ClipboardEvent", "InputEvent", "FocusEvent", "WheelEvent", "TouchEvent",
  "ResizeObserver", "IntersectionObserver", "MutationObserver", "AbortController",
  "getComputedStyle", "matchMedia", "DataTransfer", "ClipboardItem", "OffscreenCanvas",
  "crypto", "performance", "localStorage", "sessionStorage", "alert", "confirm", "prompt",
  "CSS", "customElements", "devicePixelRatio", "createImageBitmap", "atob", "btoa",
  "process",
]);

/* ---------- generic AST walk ---------- */
function* childNodes(node) {
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments" || key === "innerComments") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === "string") yield item;
    } else if (value && typeof value.type === "string") yield value;
  }
}

/* ---------- scope model ---------- */
class Scope {
  constructor(parent, kind) {
    this.parent = parent;
    this.kind = kind; // "module" | "function" | "block"
    this.names = new Set();
  }
  declare(name) { this.names.add(name); }
  has(name) {
    for (let s = this; s; s = s.parent) if (s.names.has(name)) return true;
    return false;
  }
  functionScope() {
    let s = this;
    while (s.kind === "block") s = s.parent;
    return s;
  }
}

function declarePattern(node, scope) {
  if (!node) return;
  switch (node.type) {
    case "Identifier": scope.declare(node.name); break;
    case "ObjectPattern":
      for (const p of node.properties) {
        if (p.type === "RestElement") declarePattern(p.argument, scope);
        else declarePattern(p.value, scope);
      }
      break;
    case "ArrayPattern":
      for (const e of node.elements) if (e) declarePattern(e, scope);
      break;
    case "AssignmentPattern": declarePattern(node.left, scope); break;
    case "RestElement": declarePattern(node.argument, scope); break;
    default: break;
  }
}

// hoist declarations that belong to `scope` from a list of statements
function hoist(body, scope, { varsOnly = false } = {}) {
  for (const stmt of body) {
    if (!stmt) continue;
    switch (stmt.type) {
      case "VariableDeclaration":
        if (stmt.kind === "var") for (const d of stmt.declarations) declarePattern(d.id, scope.functionScope());
        else if (!varsOnly) for (const d of stmt.declarations) declarePattern(d.id, scope);
        break;
      case "FunctionDeclaration":
        if (stmt.id) scope.declare(stmt.id.name);
        break;
      case "ClassDeclaration":
        if (!varsOnly && stmt.id) scope.declare(stmt.id.name);
        break;
      case "ImportDeclaration":
        for (const s of stmt.specifiers) scope.declare(s.local.name);
        break;
      case "ExportNamedDeclaration":
      case "ExportDefaultDeclaration":
        if (stmt.declaration) hoist([stmt.declaration], scope, { varsOnly });
        break;
      case "IfStatement":
        hoist([stmt.consequent, stmt.alternate].filter(Boolean), scope, { varsOnly: true });
        break;
      case "ForStatement": case "ForInStatement": case "ForOfStatement":
      case "WhileStatement": case "DoWhileStatement": case "LabeledStatement":
        hoist([stmt.body], scope, { varsOnly: true });
        if (stmt.init) hoist([stmt.init], scope, { varsOnly: true });
        if (stmt.left) hoist([stmt.left], scope, { varsOnly: true });
        break;
      case "BlockStatement":
        hoist(stmt.body, scope, { varsOnly: true });
        break;
      case "TryStatement":
        hoist([stmt.block, stmt.handler?.body, stmt.finalizer].filter(Boolean), scope, { varsOnly: true });
        break;
      case "SwitchStatement":
        for (const c of stmt.cases) hoist(c.consequent, scope, { varsOnly: true });
        break;
      default: break;
    }
  }
}

function analyze(ast, filename) {
  const unresolved = new Map(); // name -> first line

  function reference(node, scope) {
    const name = node.name;
      if (scope.has(name) || GLOBALS.has(name) || DOM_INTERFACE.test(name)) return;
    if (!unresolved.has(name)) unresolved.set(name, node.loc?.start?.line ?? 0);
  }

  function visit(node, scope) {
    if (!node) return;
    switch (node.type) {
      case "Program": {
        const s = new Scope(null, "module");
        hoist(node.body, s);
        for (const stmt of node.body) visit(stmt, s);
        return;
      }
      case "ImportDeclaration": return;
      case "Identifier": reference(node, scope); return;
      case "JSXIdentifier":
        // element names starting lowercase are intrinsic tags, not references
        if (/^[a-z]/.test(node.name)) return;
        reference(node, scope);
        return;
      case "JSXAttribute": visit(node.value, scope); return;
      case "JSXNamespacedName": return;
      case "JSXMemberExpression": visit(node.object, scope); return;
      case "MemberExpression":
      case "OptionalMemberExpression":
        visit(node.object, scope);
        if (node.computed) visit(node.property, scope);
        return;
      case "ObjectProperty":
        if (node.computed) visit(node.key, scope);
        visit(node.value, scope);
        return;
      case "ObjectMethod":
        if (node.computed) visit(node.key, scope);
        visitFunction(node, scope);
        return;
      case "ClassMethod":
      case "ClassPrivateMethod":
        if (node.computed) visit(node.key, scope);
        visitFunction(node, scope);
        return;
      case "ClassProperty":
      case "ClassPrivateProperty":
        if (node.computed) visit(node.key, scope);
        visit(node.value, scope);
        return;
      case "LabeledStatement": visit(node.body, scope); return;
      case "BreakStatement": case "ContinueStatement": return;
      case "FunctionDeclaration":
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        visitFunction(node, scope);
        return;
      case "ClassDeclaration":
      case "ClassExpression": {
        const s = new Scope(scope, "block");
        if (node.id) s.declare(node.id.name);
        visit(node.superClass, s);
        for (const el of node.body.body) visit(el, s);
        return;
      }
      case "BlockStatement": {
        const s = new Scope(scope, "block");
        hoist(node.body, s);
        for (const stmt of node.body) visit(stmt, s);
        return;
      }
      case "CatchClause": {
        const s = new Scope(scope, "block");
        declarePattern(node.param, s);
        hoist(node.body.body, s);
        for (const stmt of node.body.body) visit(stmt, s);
        return;
      }
      case "ForStatement": {
        const s = new Scope(scope, "block");
        if (node.init?.type === "VariableDeclaration") {
          for (const d of node.init.declarations) declarePattern(d.id, s);
          for (const d of node.init.declarations) visit(d.init, s);
        } else visit(node.init, s);
        visit(node.test, s); visit(node.update, s); visit(node.body, s);
        return;
      }
      case "ForInStatement":
      case "ForOfStatement": {
        const s = new Scope(scope, "block");
        if (node.left.type === "VariableDeclaration") for (const d of node.left.declarations) declarePattern(d.id, s);
        else visit(node.left, s);
        visit(node.right, s); visit(node.body, s);
        return;
      }
      case "VariableDeclarator":
        declarePattern(node.id, scope);
        visitPatternDefaults(node.id, scope);
        visit(node.init, scope);
        return;
      default: break;
    }
    for (const child of childNodes(node)) visit(child, scope);
  }

  // default values inside destructuring patterns are expressions
  function visitPatternDefaults(node, scope) {
    if (!node) return;
    switch (node.type) {
      case "ObjectPattern":
        for (const p of node.properties) {
          if (p.type === "RestElement") { visitPatternDefaults(p.argument, scope); continue; }
          if (p.computed) visit(p.key, scope);
          visitPatternDefaults(p.value, scope);
        }
        break;
      case "ArrayPattern":
        for (const e of node.elements) visitPatternDefaults(e, scope);
        break;
      case "AssignmentPattern":
        visitPatternDefaults(node.left, scope);
        visit(node.right, scope);
        break;
      case "RestElement": visitPatternDefaults(node.argument, scope); break;
      default: break;
    }
  }

  function visitFunction(node, scope) {
    const s = new Scope(scope, "function");
    if (node.type === "FunctionExpression" && node.id) s.declare(node.id.name);
    for (const p of node.params) declarePattern(p, s);
    for (const p of node.params) visitPatternDefaults(p, s);
    if (node.body.type === "BlockStatement") {
      hoist(node.body.body, s);
      for (const stmt of node.body.body) visit(stmt, s);
    } else visit(node.body, s);
  }

  visit(ast, null);
  return unresolved;
}

/* ---------- run ---------- */
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|jsx|mjs)$/.test(entry.name)) files.push(full);
  }
})(SRC);
files.sort();

let problems = 0;
for (const file of files) {
  const code = fs.readFileSync(file, "utf8");
  let parsed;
  try {
    parsed = await prettier.__debug.parse(code, { parser: "babel", filepath: file });
  } catch (error) {
    console.error(`${path.relative(ROOT, file)}: parse error - ${error.message}`);
    problems += 1;
    continue;
  }
  const unresolved = analyze(parsed.ast, file);
  if (unresolved.size === 0) continue;
  for (const [name, line] of [...unresolved].sort((a, b) => a[1] - b[1])) {
    console.error(`${path.relative(ROOT, file)}:${line}  '${name}' is not defined`);
    problems += 1;
  }
}

if (problems > 0) {
  console.error(`\ncheck-refs: ${problems} undefined reference(s)`);
  process.exit(1);
}
console.log(`check-refs: ${files.length} files, no undefined references`);
