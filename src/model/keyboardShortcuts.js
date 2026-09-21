import {
  shift,
} from "@floating-ui/react";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
  KEYBOARD_SHORTCUT_COMMAND_IDS,
  KEYBOARD_SHORTCUT_TOGGLE_COMMAND_IDS,
  electronApi,
} from "../constants.js";

export function getSessionShortcutLabel(index) {
  return getShortcutLabel(`Mod+${index + 1}`);
}

export function getSessionShortcutRangeLabel() {
  return `${getShortcutLabel("Mod+1")}-${getShortcutLabel("Mod+9")}`;
}

export function getShortcutLabel(shortcut) {
  const parsedShortcut = parseKeyboardShortcut(shortcut);
  if (!parsedShortcut) {
    return getLegacyShortcutLabel(shortcut);
  }

  const keyLabel = getShortcutKeyLabel(parsedShortcut.key);
  if (isAppleRuntime()) {
    return [
      parsedShortcut.mod ? "⌘" : "",
      parsedShortcut.alt ? "⌥" : "",
      parsedShortcut.shift ? "⇧" : "",
      keyLabel,
    ].filter(Boolean).join("");
  }

  return [
    parsedShortcut.mod ? "Ctrl" : "",
    parsedShortcut.alt ? "Alt" : "",
    parsedShortcut.shift ? "Shift" : "",
    keyLabel,
  ].filter(Boolean).join("+");
}

export function formatShortcutTooltip(label, shortcut) {
  const shortcutLabel = getShortcutLabel(shortcut);
  return shortcutLabel ? `${label} · ${shortcutLabel}` : label;
}

export function getLegacyShortcutLabel(keys) {
  const normalizedKeys = String(keys ?? "");
  if (!normalizedKeys) {
    return "";
  }

  if (isAppleRuntime()) {
    return `⌘${normalizedKeys}`;
  }

  return `Ctrl+${normalizedKeys
    .replaceAll("⌥", "Alt+")
    .replaceAll("⇧", "Shift+")
    .replaceAll("Comma", ",")
    .replaceAll("comma", ",")}`;
}

export function getShortcutKeyLabel(key) {
  const labels = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Enter: "↩",
    Escape: "Esc",
    Space: "Space",
    Comma: ",",
    "=": "+",
  };

  return labels[key] ?? key;
}

export function matchesKeyboardShortcut(event, shortcut) {
  const parsedShortcut = parseKeyboardShortcut(shortcut);
  if (!parsedShortcut) {
    return false;
  }

  const eventKey = normalizeKeyboardShortcutEventKey(event);
  if (!eventKey) {
    return false;
  }

  const shiftMatches =
    Boolean(event.shiftKey) === parsedShortcut.shift ||
    (parsedShortcut.key === "=" && !parsedShortcut.shift && event.shiftKey);

  return (
    Boolean(event.metaKey || event.ctrlKey) === parsedShortcut.mod &&
    Boolean(event.altKey) === parsedShortcut.alt &&
    shiftMatches &&
    eventKey === parsedShortcut.key
  );
}

export function isKeyboardShortcutEnabled(keyboardShortcutEnabled, commandId) {
  return (
    normalizeKeyboardShortcutEnabled(keyboardShortcutEnabled)[commandId] !== false
  );
}

export function keyboardShortcutFromEvent(event) {
  const key = normalizeKeyboardShortcutEventKey(event);
  if (!key || key === "Escape") {
    return null;
  }

  const shortcut = {
    mod: Boolean(event.metaKey || event.ctrlKey),
    alt: Boolean(event.altKey),
    shift: Boolean(event.shiftKey),
    key,
  };

  return shortcut.mod ? formatKeyboardShortcutValue(shortcut) : null;
}

export function normalizeKeyboardShortcuts(
  value,
  fallback = DEFAULT_KEYBOARD_SHORTCUTS,
) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackSource = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_KEYBOARD_SHORTCUTS;
  const normalizedShortcuts = {};

  for (const commandId of KEYBOARD_SHORTCUT_COMMAND_IDS) {
    normalizedShortcuts[commandId] = normalizeKeyboardShortcut(
      source[commandId],
      fallbackSource[commandId] ?? DEFAULT_KEYBOARD_SHORTCUTS[commandId],
    );
  }

  return normalizedShortcuts;
}

export function normalizeKeyboardShortcutEnabled(
  value,
  fallback = DEFAULT_KEYBOARD_SHORTCUT_ENABLED,
) {
  const source = value && typeof value === "object" ? value : {};
  const fallbackSource = fallback && typeof fallback === "object"
    ? fallback
    : DEFAULT_KEYBOARD_SHORTCUT_ENABLED;
  const normalizedEnabled = {};

  for (const commandId of KEYBOARD_SHORTCUT_TOGGLE_COMMAND_IDS) {
    normalizedEnabled[commandId] =
      typeof source[commandId] === "boolean"
        ? source[commandId]
        : fallbackSource[commandId] !== false;
  }

  return normalizedEnabled;
}

export function normalizeKeyboardShortcut(value, fallback) {
  const parsedShortcut = parseKeyboardShortcut(value);
  if (parsedShortcut) {
    return formatKeyboardShortcutValue(parsedShortcut);
  }

  const parsedFallback = parseKeyboardShortcut(fallback);
  return parsedFallback
    ? formatKeyboardShortcutValue(parsedFallback)
    : DEFAULT_KEYBOARD_SHORTCUTS.focusEditor;
}

export function parseKeyboardShortcut(value) {
  if (typeof value !== "string") {
    return null;
  }

  const tokens = value
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length < 2) {
    return null;
  }

  const shortcut = {
    mod: false,
    alt: false,
    shift: false,
    key: "",
  };

  for (const token of tokens) {
    const normalizedToken = token.toLowerCase();
    if (
      normalizedToken === "mod" ||
      normalizedToken === "cmd" ||
      normalizedToken === "command" ||
      normalizedToken === "ctrl" ||
      normalizedToken === "control" ||
      normalizedToken === "commandorcontrol" ||
      normalizedToken === "cmdorctrl"
    ) {
      shortcut.mod = true;
      continue;
    }

    if (normalizedToken === "alt" || normalizedToken === "option") {
      shortcut.alt = true;
      continue;
    }

    if (normalizedToken === "shift") {
      shortcut.shift = true;
      continue;
    }

    if (shortcut.key) {
      return null;
    }

    shortcut.key = normalizeKeyboardShortcutKey(token);
    if (!shortcut.key) {
      return null;
    }
  }

  return shortcut.mod && shortcut.key ? shortcut : null;
}

export function normalizeKeyboardShortcutEventKey(event) {
  if (
    event.key === "Meta" ||
    event.key === "Control" ||
    event.key === "Alt" ||
    event.key === "Shift"
  ) {
    return "";
  }

  if (
    event.code === "Equal" &&
    (event.key === "+" || event.key === "=")
  ) {
    return "=";
  }

  if (
    event.code === "Minus" &&
    (event.key === "-" || event.key === "_")
  ) {
    return "-";
  }

  if (event.code === "BracketLeft") {
    return "[";
  }

  if (event.code === "BracketRight") {
    return "]";
  }

  return normalizeKeyboardShortcutKey(event.key);
}

export function normalizeKeyboardShortcutKey(value) {
  const token = String(value ?? "").trim();
  const normalizedToken = token.toLowerCase();
  const namedKeys = {
    arrowleft: "ArrowLeft",
    left: "ArrowLeft",
    arrowright: "ArrowRight",
    right: "ArrowRight",
    arrowup: "ArrowUp",
    up: "ArrowUp",
    arrowdown: "ArrowDown",
    down: "ArrowDown",
    enter: "Enter",
    return: "Enter",
    escape: "Escape",
    esc: "Escape",
    comma: ",",
    period: ".",
    dot: ".",
    slash: "/",
    backslash: "\\",
    backquote: "`",
    braceleft: "[",
    "{": "[",
    bracketleft: "[",
    leftbracket: "[",
    braceright: "]",
    "}": "]",
    bracketright: "]",
    rightbracket: "]",
    equal: "=",
    plus: "=",
    minus: "-",
    space: "Space",
  };

  if (namedKeys[normalizedToken]) {
    return namedKeys[normalizedToken];
  }

  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(token)) {
    return token.toUpperCase();
  }

  if (/^[a-z]$/i.test(token)) {
    return token.toUpperCase();
  }

  if (/^[0-9]$/.test(token)) {
    return token;
  }

  if (token.length === 1 && ",./;'[]\\=`-".includes(token)) {
    return token;
  }

  return "";
}

export function formatKeyboardShortcutValue(shortcut) {
  return [
    shortcut.mod ? "Mod" : "",
    shortcut.alt ? "Alt" : "",
    shortcut.shift ? "Shift" : "",
    shortcut.key,
  ].filter(Boolean).join("+");
}

export function isReservedKeyboardShortcut(shortcut) {
  const parsedShortcut = parseKeyboardShortcut(shortcut);
  return Boolean(
    parsedShortcut?.mod &&
      !parsedShortcut.alt &&
      !parsedShortcut.shift &&
      /^[1-9]$/.test(parsedShortcut.key),
  );
}

export function isShortcutRecorderTarget(target) {
  return target instanceof Element && Boolean(
    target.closest(".shortcut-recorder-button"),
  );
}

export function isWindowsRuntime() {
  return electronApi?.platform === "win32";
}

export function isAppleRuntime() {
  if (electronApi?.platform) {
    return electronApi.platform === "darwin";
  }

  if (typeof navigator === "undefined") {
    return false;
  }

  return /mac|iphone|ipad|ipod/i.test(
    `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`,
  );
}
