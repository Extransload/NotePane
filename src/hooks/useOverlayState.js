import {
  useCallback,
  useMemo,
  useState,
} from "react";

// A flag overlay holds true while open; the others hold their payload (a menu
// position, a note id, the note awaiting confirmation) and null while closed.
const CLOSED_OVERLAYS = {
  colorPanel: false,
  exportFormatMenu: null,
  markdownImport: false,
  preferencesWindow: false,
  sessionCloseConfirm: null,
  sessionColorPanel: null,
  sessionTabMenu: null,
  sessionTrashConfirm: null,
  stickyActionBar: false,
  stickySettings: false,
  stickyTrashConfirm: false,
  versionHistory: false,
};

// Opening one of these closes the others; every other overlay stacks.
const EXCLUSIVE_OVERLAYS = [
  "colorPanel",
  "preferencesWindow",
  "sessionColorPanel",
  "sessionTabMenu",
  "sessionTrashConfirm",
  "stickySettings",
  "stickyTrashConfirm",
];

// Escape closes the first open overlay in this order.
const ESCAPE_ORDER = [
  "exportFormatMenu",
  "sessionTabMenu",
  "sessionColorPanel",
  "colorPanel",
  "markdownImport",
  "sessionTrashConfirm",
  "sessionCloseConfirm",
  "stickyTrashConfirm",
  "versionHistory",
  "stickySettings",
  "stickyActionBar",
  "preferencesWindow",
];

// Keeps the previous state object when nothing changes, so closing an overlay
// that is already closed does not render again.
function withOverlays(state, patch) {
  return Object.keys(patch).some((kind) => state[kind] !== patch[kind])
    ? { ...state, ...patch }
    : state;
}

function closedPatch(kinds) {
  return Object.fromEntries(kinds.map((kind) => [kind, CLOSED_OVERLAYS[kind]]));
}

/**
 * The panels, menus and confirmations layered over a note window, held as one
 * state. `open`, `close`, `closeExclusive` and `closeAll` keep their identity
 * across renders; `closeTopmost` closes the overlay Escape should close and
 * returns its kind, or null when none is open.
 */
export function useOverlayState() {
  const [overlays, setOverlays] = useState(CLOSED_OVERLAYS);

  const open = useCallback((kind, payload = true) => {
    setOverlays((state) => withOverlays(state, {
      ...(EXCLUSIVE_OVERLAYS.includes(kind) ? closedPatch(EXCLUSIVE_OVERLAYS) : {}),
      [kind]: typeof CLOSED_OVERLAYS[kind] === "boolean" ? true : payload,
    }));
  }, []);

  const close = useCallback((...kinds) => {
    setOverlays((state) => withOverlays(state, closedPatch(kinds)));
  }, []);

  const closeExclusive = useCallback(() => {
    setOverlays((state) => withOverlays(state, closedPatch(EXCLUSIVE_OVERLAYS)));
  }, []);

  const closeAll = useCallback(() => {
    setOverlays((state) => withOverlays(state, CLOSED_OVERLAYS));
  }, []);

  const topmostKind = ESCAPE_ORDER.find((kind) => Boolean(overlays[kind])) ?? null;
  const closeTopmost = useCallback(() => {
    if (topmostKind) {
      close(topmostKind);
    }
    return topmostKind;
  }, [close, topmostKind]);

  return useMemo(() => ({
    close,
    closeAll,
    closeExclusive,
    closeTopmost,
    exportFormatMenu: overlays.exportFormatMenu,
    isAnyOpen: topmostKind !== null,
    isColorPanelOpen: overlays.colorPanel,
    isMarkdownImportOpen: overlays.markdownImport,
    isPreferencesWindowOpen: overlays.preferencesWindow,
    isStickyActionBarOpen: overlays.stickyActionBar,
    isStickySettingsOpen: overlays.stickySettings,
    isStickyTrashConfirmOpen: overlays.stickyTrashConfirm,
    isVersionHistoryOpen: overlays.versionHistory,
    open,
    pendingSessionCloseNote: overlays.sessionCloseConfirm,
    pendingSessionTrashNote: overlays.sessionTrashConfirm,
    sessionColorPanelNoteId: overlays.sessionColorPanel,
    sessionTabMenu: overlays.sessionTabMenu,
  }), [close, closeAll, closeExclusive, closeTopmost, open, overlays, topmostKind]);
}
