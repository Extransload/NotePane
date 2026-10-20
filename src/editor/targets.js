export function isEditorShortcutTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  if (
    target.closest(
      ".sticky-header, .session-sidebar, .image-tools, .crop-dialog, .preferences-panel, .preferences-window, .find-bar, .search-palette",
    )
  ) {
    return false;
  }

  return Boolean(
    target.closest(".bn-container") ||
      target.closest("[data-testid='sticky-editor-surface']"),
  );
}

// Opening the six-dot menu moves focus into its Mantine dropdown, which is
// portalled outside `.bn-container`, so it is not an editor shortcut target.
export function isDragHandleMenuTarget(target) {
  return target instanceof Element && Boolean(target.closest(".bn-drag-handle-menu"));
}

export function isSelectionInsideCodeBlock(editor) {
  try {
    return editor.transact(
      (transaction) =>
        Boolean(transaction.selection.$from.parent.type.spec.code) &&
        Boolean(transaction.selection.$to.parent.type.spec.code),
    );
  } catch {
    return false;
  }
}

export function hasEditorRangeSelection(editor) {
  try {
    return editor.transact((transaction) => !transaction.selection.empty);
  } catch {
    return false;
  }
}
