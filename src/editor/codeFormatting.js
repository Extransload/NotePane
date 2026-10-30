import {
  codeBlockOptions,
} from "@blocknote/code-block";
import { loadCodeFormatEngine } from "./codeFormatEngines.js";

export const CODE_FORMAT_LANGUAGE_ALIASES = {
  js: "javascript",
  ts: "typescript",
  gql: "graphql",
  md: "markdown",
  yml: "yaml",
};

export const CODE_FORMATTERS = {
  javascript: { parser: "babel", plugins: ["babel", "estree"] },
  jsx: { parser: "babel", plugins: ["babel", "estree"] },
  typescript: { parser: "typescript", plugins: ["typescript", "estree"] },
  tsx: { parser: "typescript", plugins: ["typescript", "estree"] },
  json: { parser: "json", plugins: ["babel", "estree"] },
  jsonc: { parser: "jsonc", plugins: ["babel", "estree"] },
  jsonl: { custom: "jsonl" },
  css: { parser: "css", plugins: ["postcss"] },
  postcss: { parser: "css", plugins: ["postcss"] },
  scss: { parser: "scss", plugins: ["postcss"] },
  less: { parser: "less", plugins: ["postcss"] },
  html: { parser: "html", plugins: ["html"] },
  "vue-html": { parser: "html", plugins: ["html"] },
  vue: { parser: "vue", plugins: ["html"] },
  markdown: { parser: "markdown", plugins: ["markdown"] },
  mdx: { parser: "mdx", plugins: ["markdown"] },
  yaml: { parser: "yaml", plugins: ["yaml"] },
  graphql: { parser: "graphql", plugins: ["graphql"] },
  // "auto", the plugin's default, looks for composer.json through Node's process and fs. PHP's
  // coding standard (PSR-12) indents by four spaces.
  php: { parser: "php", plugins: ["php"], options: { phpVersion: "8.5", tabWidth: 4 } },
  // Prettier's XML default keeps every whitespace run, which leaves minified XML on one line.
  xml: { parser: "xml", plugins: ["xml"], options: { xmlWhitespaceSensitivity: "ignore" } },
  svelte: { parser: "svelte", plugins: ["svelte", "babel", "estree", "postcss"] },
  glsl: { parser: "glsl-parser", plugins: ["glsl"] },
  c: { engine: "clangFormat", fileName: "main.c", style: "Google" },
  cpp: { engine: "clangFormat", fileName: "main.cpp", style: "Google" },
  "objective-c": { engine: "clangFormat", fileName: "main.m", style: "Google" },
  java: { engine: "clangFormat", fileName: "Main.java", style: "Google" },
  csharp: { engine: "clangFormat", fileName: "Main.cs", style: "Microsoft" },
  python: { engine: "ruff" },
  lua: { engine: "stylua" },
  shellscript: { engine: "shfmt" },
  latex: { engine: "texFmt" },
  rust: { engine: "rustfmt" },
  swift: { engine: "swiftFormat" },
  ruby: { engine: "syntaxTree" },
  sql: { engine: "sqlFormatter" },
  sass: { engine: "sassFormatter" },
};

// The code block languages without Prettify, each with the reason. Every language the code block
// offers is either in CODE_FORMATTERS or here (tests/unit/codeFormatting.test.cjs checks it).
export const CODE_LANGUAGES_WITHOUT_FORMATTER = {
  text: "Plain text has no syntax to format.",
  regexp: "A regular expression has no layout to format, and its whitespace is significant.",
  mermaid: "There is no Mermaid formatter.",
  haml: "HAML is formatted only by Ruby tools (haml-lint), with no browser build.",
  pug: "@prettier/plugin-pug runs only in Node: it reads process.env when it loads and imports node:util.",
  julia: "JuliaFormatter runs only in Julia.",
  r: "R formatters (styler, air) have no browser or WebAssembly build.",
  haskell: "Ormolu and Fourmolu have no published WebAssembly or JavaScript build.",
  scala: "scalafmt has no maintained JavaScript or WebAssembly build.",
  kotlin: "The one WebAssembly Kotlin formatter, @scalar/kotlin-fmt, requires Node 24.15, so the engine-strict install on Node 22 refuses it.",
  wasm: "There is no WebAssembly text formatter that keeps comments.",
  wgsl: "The one WGSL formatter, @wasm-fmt/wgslfmt 0.1.0, breaks code: it joins `@vertex fn` into `@vertexfn`.",
};

export const CODE_FORMAT_PLUGIN_LOADERS = {
  babel: () => import("prettier/plugins/babel"),
  estree: () => import("prettier/plugins/estree"),
  typescript: () => import("prettier/plugins/typescript"),
  postcss: () => import("prettier/plugins/postcss"),
  html: () => import("prettier/plugins/html"),
  markdown: () => import("prettier/plugins/markdown"),
  yaml: () => import("prettier/plugins/yaml"),
  graphql: () => import("prettier/plugins/graphql"),
  php: () => import("@prettier/plugin-php/standalone"),
  xml: () => import("@prettier/plugin-xml"),
  svelte: () => import("prettier-plugin-svelte/browser"),
  glsl: () => import("prettier-plugin-glsl"),
};

export const loadedCodeFormatPlugins = new Map();

export function normalizeCodeLanguage(language) {
  const normalizedLanguage = String(language || "text").trim().toLowerCase();
  return CODE_FORMAT_LANGUAGE_ALIASES[normalizedLanguage] || normalizedLanguage;
}

export function getCodeBlockText(block) {
  if (typeof block?.content === "string") {
    return block.content;
  }
  if (!Array.isArray(block?.content)) {
    return "";
  }
  return block.content
    .map((content) =>
      typeof content === "string" ? content : String(content?.text ?? ""),
    )
    .join("");
}

const CODE_INDENT = "  ";

/**
 * Tab and Shift+Tab inside a code block. A caret Tab types two spaces; Tab with a selection
 * indents every line the selection touches; Shift+Tab takes up to two leading spaces, or a
 * leading tab, from those lines or from the caret's line. Both keys stay in the code block even
 * with nothing to dedent, so Shift+Tab never lifts the block out of its parent.
 */
export function indentCodeBlockLines(editor, direction) {
  return editor.transact((tr) => {
    const { selection } = tr;
    const { $from, $to } = selection;
    if (!$from.parent.type.spec.code || !$from.sameParent($to)) {
      return false;
    }
    if (direction > 0 && selection.empty) {
      tr.insertText(CODE_INDENT);
      return true;
    }

    // Code is plain text, so a text offset in the block is a position offset too. A line that
    // starts where a selection ends is not part of it.
    const text = $from.parent.textContent;
    const lineStarts = [
      $from.parentOffset === 0 ? 0 : text.lastIndexOf("\n", $from.parentOffset - 1) + 1,
    ];
    for (
      let index = text.indexOf("\n", lineStarts[0]);
      index !== -1 && index + 1 < $to.parentOffset;
      index = text.indexOf("\n", index + 1)
    ) {
      lineStarts.push(index + 1);
    }

    // Later lines first, so the earlier offsets stay valid.
    const blockStart = $from.start();
    for (const lineStart of lineStarts.reverse()) {
      if (direction > 0) {
        tr.insertText(CODE_INDENT, blockStart + lineStart);
        continue;
      }
      const indent = text.slice(lineStart).match(/^(?:\t| {1,2})/)?.[0].length ?? 0;
      if (indent > 0) {
        tr.delete(blockStart + lineStart, blockStart + lineStart + indent);
      }
    }
    return true;
  });
}

export function getCodeLanguageLabel(language) {
  return codeBlockOptions.supportedLanguages?.[language]?.name || language || "Plain Text";
}

export function getCodeFormatter(language) {
  return CODE_FORMATTERS[normalizeCodeLanguage(language)] || null;
}

export async function formatCodeForLanguage(code, language) {
  const formatter = getCodeFormatter(language);
  if (!formatter) {
    throw new Error(`No formatter is available for ${language}.`);
  }

  if (formatter.custom === "jsonl") {
    return formatJsonLines(code);
  }

  if (formatter.engine) {
    const format = await loadCodeFormatEngine(formatter.engine);
    return normalizeFormattedCode(await format(code, formatter));
  }

  const [{ format }, plugins] = await Promise.all([
    import("prettier/standalone"),
    Promise.all(formatter.plugins.map(loadCodeFormatPlugin)),
  ]);
  const formattedCode = await format(code, {
    parser: formatter.parser,
    plugins,
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    ...formatter.options,
  });
  return normalizeFormattedCode(formattedCode);
}

function normalizeFormattedCode(formattedCode) {
  if (typeof formattedCode !== "string") {
    throw new Error("The formatter returned no code.");
  }
  return formattedCode.replace(/\r\n?/g, "\n").replace(/\n$/, "");
}

export function loadCodeFormatPlugin(pluginName) {
  if (!loadedCodeFormatPlugins.has(pluginName)) {
    const loader = CODE_FORMAT_PLUGIN_LOADERS[pluginName];
    if (!loader) {
      throw new Error(`Unknown code format plugin: ${pluginName}`);
    }
    // Plugins published with a default export (php, xml, svelte) are that object.
    loadedCodeFormatPlugins.set(
      pluginName,
      loader().then((plugin) => plugin.default ?? plugin),
    );
  }
  return loadedCodeFormatPlugins.get(pluginName);
}

export function formatJsonLines(code) {
  return String(code)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.stringify(JSON.parse(line)))
    .join("\n");
}
