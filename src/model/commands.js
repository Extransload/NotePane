import { normalizeSearchText } from "./search.js";

// The search palette (Cmd+P) also runs commands. Typed words list the commands whose title or
// keywords hold every word, above the matching notes; a query that starts with ">" lists only
// commands, all of them while nothing follows the ">".
export const COMMAND_PREFIX = ">";

export function parseCommandQuery(query) {
  const text = String(query ?? "");
  const trimmed = text.trimStart();
  return trimmed.startsWith(COMMAND_PREFIX)
    ? { commandsOnly: true, text: trimmed.slice(COMMAND_PREFIX.length).trim() }
    : { commandsOnly: false, text: text.trim() };
}

/**
 * The commands for a palette query, best first: a title that starts with the typed text, then a
 * title holding every word, then keywords holding them. A plain query with no words lists none,
 * so an empty palette shows the notes as before.
 */
export function matchCommands(commands, query) {
  const { commandsOnly, text } = parseCommandQuery(query);
  const words = normalizeSearchText(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return commandsOnly ? [...commands] : [];
  }
  const needle = words.join(" ");
  return commands
    .map((command, order) => {
      const title = normalizeSearchText(command.title);
      const haystack = `${title} ${normalizeSearchText(command.keywords ?? "")}`;
      if (!words.every((word) => haystack.includes(word))) {
        return null;
      }
      const rank = title.startsWith(needle) ? 0 : words.every((word) => title.includes(word)) ? 1 : 2;
      return { command, rank, order };
    })
    .filter(Boolean)
    .sort((left, right) => left.rank - right.rank || left.order - right.order)
    .map(({ command }) => command);
}
