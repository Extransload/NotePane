import {
  codeBlockOptions,
} from "@blocknote/code-block";

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
  });
  return formattedCode.replace(/\r\n?/g, "\n").replace(/\n$/, "");
}

export function loadCodeFormatPlugin(pluginName) {
  if (!loadedCodeFormatPlugins.has(pluginName)) {
    const loader = CODE_FORMAT_PLUGIN_LOADERS[pluginName];
    if (!loader) {
      throw new Error(`Unknown code format plugin: ${pluginName}`);
    }
    loadedCodeFormatPlugins.set(pluginName, loader());
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
