import { codeBlockOptions } from "@blocknote/code-block";
import { createExtension } from "@blocknote/core";
import { isHistoryTransaction } from "@tiptap/pm/history";
import { Plugin } from "@tiptap/pm/state";

const supportedLanguages = codeBlockOptions.supportedLanguages ?? {};
const LAST_CODE_LANGUAGE_KEY = "notepane.lastCodeLanguage";

export const CODE_LANGUAGES = Object.entries(supportedLanguages)
  .map(([id, { name, aliases = [] }]) => ({ id, name, aliases }))
  .sort((first, second) => first.name.localeCompare(second.name));

export function filterCodeLanguages(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return CODE_LANGUAGES;
  }
  const matches = CODE_LANGUAGES.filter(({ id, name, aliases }) =>
    [name, id, ...aliases].some((word) => word.toLowerCase().includes(needle)),
  );
  const startsWithQuery = ({ name }) => name.toLowerCase().startsWith(needle);
  return [
    ...matches.filter(startsWithQuery),
    ...matches.filter((language) => !startsWithQuery(language)),
  ];
}

export function readLastCodeLanguage() {
  try {
    const language = window.localStorage.getItem(LAST_CODE_LANGUAGE_KEY);
    if (language && Object.hasOwn(supportedLanguages, language)) {
      return language;
    }
  } catch {
    // Without storage a new code block starts in BlockNote's default language.
  }
  return codeBlockOptions.defaultLanguage;
}

export function rememberCodeLanguage(language) {
  try {
    window.localStorage.setItem(LAST_CODE_LANGUAGE_KEY, language);
  } catch {
    // Without storage the next code block starts in BlockNote's default language.
  }
}

// NotePane's code block has an empty default language (src/editor/schema.jsx), which tells a code
// block made without a language (slash menu, Turn into, "```", a paste) from one given a language.
// Such a new block starts in the language last picked from a language menu. A block that already
// was a code block keeps its language, and undo and redo bring blocks back as they were.
export const CodeLanguageMemory = createExtension(({ editor }) => ({
  key: "notepane-code-language-memory",
  prosemirrorPlugins: [
    new Plugin({
      appendTransaction(transactions, oldState, newState) {
        if (
          !editor.isEditable ||
          !transactions.some((transaction) => transaction.docChanged) ||
          transactions.some((transaction) => isHistoryTransaction(transaction))
        ) {
          return null;
        }
        const withoutLanguage = [];
        newState.doc.descendants((node, pos) => {
          const content = node.firstChild;
          if (
            node.type.name === "blockContainer" &&
            content?.type.name === "codeBlock" &&
            !content.attrs.language
          ) {
            withoutLanguage.push({ id: node.attrs.id, pos: pos + 1 });
          }
          return !node.isTextblock;
        });
        if (withoutLanguage.length === 0) {
          return null;
        }
        const codeBlockIds = new Set();
        oldState.doc.descendants((node) => {
          if (node.type.name === "blockContainer" && node.firstChild?.type.name === "codeBlock") {
            codeBlockIds.add(node.attrs.id);
          }
          return !node.isTextblock;
        });
        const newBlocks = withoutLanguage.filter(({ id }) => !codeBlockIds.has(id));
        if (newBlocks.length === 0) {
          return null;
        }
        const language = readLastCodeLanguage();
        const transaction = newState.tr;
        for (const { pos } of newBlocks) {
          transaction.setNodeAttribute(pos, "language", language);
        }
        // Backspace right after "```" undoes the shortcut from the input rule plugin's state
        // (src/editor/markdownShortcuts.js), which any later change clears; this one keeps it.
        for (const plugin of newState.plugins) {
          const undoable = plugin.spec.isInputRules ? plugin.getState(newState) : null;
          if (undoable) {
            transaction.setMeta(plugin, undoable);
          }
        }
        return transaction;
      },
    }),
  ],
}));
