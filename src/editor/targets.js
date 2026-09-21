export function isEditorShortcutTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  if (
    target.closest(
      ".sticky-header, .session-sidebar, .image-tools, .crop-dialog, .preferences-panel, .preferences-window",
    )
  ) {
    return false;
  }

  return Boolean(
    target.closest(".bn-container") ||
      target.closest("[data-testid='sticky-editor-surface']"),
  );
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
