import { createExtension } from "@blocknote/core";
import { Plugin } from "@tiptap/pm/state";

// BlockNote runs its Markdown shortcuts (`- `, `# `, `1. `, `[] `, `" `, ` ``` `) through
// @handlewithcare/prosemirror-inputrules, which inserts the typed space in a transaction of its own
// before the rule converts the block. The Backspace right after undoes the rule with Tiptap's
// undoInputRule, which inverts the rule's steps and then inserts the typed text again, as a rule that
// ran before its text reached the document needs, so `- ` came back as `-  `. A rule whose steps start
// from a document other than the one its key was pressed in already holds that text, so inverting
// its steps alone gives back exactly what was typed. Any other rule is left to BlockNote.
export const MarkdownShortcutUndo = createExtension(() => {
  let docAtKeyDown = null;
  return {
    key: "notepane-markdown-shortcut-undo",
    prosemirrorPlugins: [new Plugin({
      props: {
        handleDOMEvents: {
          keydown(view, event) {
            if (
              event.key === "Backspace" &&
              !event.isComposing &&
              !(event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) &&
              undoRuleAfterItsText(view, docAtKeyDown)
            ) {
              event.preventDefault();
              return true;
            }
            // Only a key that can type is a rule's own key; Shift, Caps Lock or Cmd+S between the
            // rule and the Backspace must not hide which document the rule started from.
            if (canTypeText(event)) {
              docAtKeyDown = view.state.doc;
            }
            return false;
          },
        },
      },
    })],
  };
})();

function canTypeText(event) {
  if (event.metaKey || event.ctrlKey) {
    return false;
  }
  return event.key.length === 1 || event.key === "Enter" || event.isComposing || event.keyCode === 229;
}

function undoRuleAfterItsText(view, docAtKeyDown) {
  const { state } = view;
  if (!state.selection.empty) {
    return false;
  }
  // The rule Tiptap's undoInputRule would undo: the first input rule plugin that holds one.
  const undoable = state.plugins
    .find((plugin) => plugin.spec.isInputRules && plugin.getState(state))
    ?.getState(state);
  const { transform, from, text } = undoable ?? {};
  const ruleStart = transform?.docs[0];
  if (
    !text ||
    !ruleStart ||
    ruleStart === docAtKeyDown ||
    ruleStart.textBetween(Math.max(0, from - text.length), from) !== text
  ) {
    return false;
  }

  const tr = state.tr;
  for (let index = transform.steps.length - 1; index >= 0; index -= 1) {
    tr.step(transform.steps[index].invert(transform.docs[index]));
  }
  view.dispatch(tr);
  return true;
}
