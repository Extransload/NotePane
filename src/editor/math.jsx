import { getNodeById } from "@blocknote/core";
import { createReactBlockSpec, createReactInlineContentSpec } from "@blocknote/react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import katex from "katex";
import { Radical, Sigma } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { collectMarkdownFence, isMarkdownFenceStart } from "./clipboard.js";
import { insertBlockWithLineBelow } from "./divider.jsx";

// KaTeX shows a source it cannot parse as that source in `errorColor`, here the theme's.
function renderLatex(latex, displayMode) {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      errorColor: "var(--notepane-error-text)",
    });
  } catch {
    // Errors other than a parse error still throw; the source is shown the same way.
    const source = document.createElement("span");
    source.className = "katex-error";
    source.style.color = "var(--notepane-error-text)";
    source.textContent = latex;
    return source.outerHTML;
  }
}

function MathPreview({ latex, displayMode, placeholder }) {
  if (!latex.trim()) {
    return <span className="notepane-math-placeholder">{placeholder}</span>;
  }
  return (
    <span
      className="notepane-math-rendered"
      dangerouslySetInnerHTML={{ __html: renderLatex(latex, displayMode) }}
    />
  );
}

const keepEditorFocus = (event) => event.preventDefault();

// The source being edited, or null while the equation is shown. Enter or Escape commits and
// returns focus to the editor, which blurs the field and would commit a second time; the ref
// says whether this edit is still open.
function useDraft() {
  const [draft, setDraftState] = useState(null);
  const isEditingRef = useRef(false);
  const setDraft = (value) => {
    isEditingRef.current = value !== null;
    setDraftState(value);
  };
  return [draft, setDraft, isEditingRef];
}

// A new equation opens its editor once it is mounted: the block equation by its id, the inline
// equation inserted next. React may mount the node view before or after the insert returns.
const EDIT_MATH_BLOCK_EVENT = "notepane:edit-math-block";
let pendingMathBlockId = null;
let isInlineMathEditPending = false;

function editMathBlock(blockId) {
  pendingMathBlockId = blockId;
  window.dispatchEvent(new CustomEvent(EDIT_MATH_BLOCK_EVENT, { detail: { blockId } }));
}

function MathBlock({ block, editor }) {
  const { latex } = block.props;
  const [draft, setDraft, isEditingRef] = useDraft();
  const inputRef = useRef(null);

  useEffect(() => {
    const open = () => {
      pendingMathBlockId = null;
      if (editor.isEditable) {
        setDraft(editor.getBlock(block.id)?.props.latex ?? "");
      }
    };
    if (pendingMathBlockId === block.id) {
      open();
    }
    const openForThisBlock = (event) => {
      if (event.detail?.blockId === block.id) open();
    };
    window.addEventListener(EDIT_MATH_BLOCK_EVENT, openForThisBlock);
    return () => window.removeEventListener(EDIT_MATH_BLOCK_EVENT, openForThisBlock);
  }, [block.id, editor]);

  useLayoutEffect(() => {
    if (draft !== null && document.activeElement !== inputRef.current) {
      inputRef.current?.focus();
    }
  }, [draft !== null]);

  const commit = ({ returnFocus }) => {
    if (!isEditingRef.current) {
      return;
    }
    setDraft(null);
    if (draft !== latex && editor.getBlock(block.id)) {
      editor.updateBlock(block.id, { props: { latex: draft } });
    }
    if (returnFocus) {
      // The equation stays selected, as after a click on it, so Backspace deletes it.
      const view = editor.prosemirrorView;
      const found = getNodeById(block.id, view.state.doc);
      if (found) {
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, found.posBeforeNode + 1)));
      }
      view.focus();
    }
  };

  return (
    <div className="notepane-math-block" data-testid="math-block">
      <div
        className="notepane-math-block-preview"
        data-testid="math-block-preview"
        // The press that selects the block makes ProseMirror mark it draggable, after which
        // Chrome may send no click, so the editor opens on the release.
        onMouseUp={(event) => {
          if (event.button === 0 && editor.isEditable && draft === null) setDraft(latex);
        }}
      >
        <MathPreview latex={draft ?? latex} displayMode placeholder="Add a TeX equation" />
      </div>
      {draft !== null && (
        <textarea
          ref={inputRef}
          className="notepane-math-block-input"
          data-testid="math-block-input"
          aria-label="TeX equation"
          spellCheck={false}
          rows={Math.max(2, draft.split("\n").length)}
          value={draft}
          placeholder="E = mc^2"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit({ returnFocus: false })}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              commit({ returnFocus: true });
            }
          }}
        />
      )}
    </div>
  );
}

// Markdown has no equation, so the export writes TeX between `$$` lines, which Markdown editors
// with math read back. BlockNote writes the text as it is. The attribute lets an HTML paste of
// the export read the equation back too.
function MathBlockExternalHTML({ block }) {
  const { latex } = block.props;
  return (
    <div data-math-block={latex}>
      <p>{`$$\n${latex}\n$$`}</p>
    </div>
  );
}

const readMathBlock = (element) =>
  element.hasAttribute("data-math-block") ? { latex: element.getAttribute("data-math-block") } : undefined;

export const createMathBlockSpec = createReactBlockSpec(
  {
    type: "mathBlock",
    propSchema: { latex: { default: "" } },
    content: "none",
  },
  {
    render: MathBlock,
    toExternalHTML: MathBlockExternalHTML,
    parse: readMathBlock,
  },
);

function findInlineMathPos(view, element) {
  let found = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) {
      return false;
    }
    if (node.type.name === "inlineMath" && view.nodeDOM(pos)?.contains(element)) {
      found = pos;
    }
    return true;
  });
  return found;
}

function InlineMathPopover({ anchor, value, onChange, onCommit }) {
  const inputRef = useRef(null);
  // Placed while rendering, so the field is visible, and can take focus, when it mounts.
  const rect = anchor.getBoundingClientRect();
  const position = { left: Math.max(8, rect.left), top: rect.bottom + 6 };

  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  return createPortal(
    <div
      className="notepane-inline-math-popover"
      data-testid="inline-math-popover"
      style={position}
    >
      <input
        ref={inputRef}
        className="notepane-inline-math-input"
        data-testid="inline-math-input"
        aria-label="Inline TeX equation"
        spellCheck={false}
        value={value}
        placeholder="x^2"
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => onCommit({ returnFocus: false })}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === "Escape") && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            onCommit({ returnFocus: true });
          }
        }}
      />
    </div>,
    document.body,
  );
}

function InlineMath({ inlineContent, editor }) {
  const { latex } = inlineContent.props;
  const [draft, setDraft, isEditingRef] = useDraft();
  const [element, setElement] = useState(null);

  useEffect(() => {
    if (isInlineMathEditPending && !latex && editor.isEditable) {
      isInlineMathEditPending = false;
      setDraft("");
    }
    // Only on mount: an equation inserted from the slash menu opens its editor.
  }, []);

  const commit = ({ returnFocus }) => {
    if (!isEditingRef.current) {
      return;
    }
    setDraft(null);
    const view = editor.prosemirrorView;
    const pos = findInlineMathPos(view, element);
    if (pos === null) {
      return;
    }
    const { tr } = view.state;
    if (!draft.trim()) {
      tr.delete(pos, pos + 1);
    } else if (draft !== latex) {
      tr.setNodeAttribute(pos, "latex", draft);
    }
    if (returnFocus) {
      // The caret goes after the equation, or where it was when an empty one is removed.
      tr.setSelection(TextSelection.create(tr.doc, draft.trim() ? pos + 1 : pos));
    }
    if (tr.docChanged || returnFocus) {
      view.dispatch(tr);
    }
    if (returnFocus) {
      view.focus();
    }
  };

  return (
    <span
      ref={setElement}
      className="notepane-inline-math"
      data-testid="inline-math"
      data-editing={draft !== null || undefined}
      onMouseDown={keepEditorFocus}
      onClick={() => {
        if (editor.isEditable && draft === null) setDraft(latex);
      }}
    >
      <MathPreview latex={draft ?? latex} displayMode={false} placeholder="New equation" />
      {draft !== null && element && (
        <InlineMathPopover anchor={element} value={draft} onChange={setDraft} onCommit={commit} />
      )}
    </span>
  );
}

export const inlineMathSpec = createReactInlineContentSpec(
  {
    type: "inlineMath",
    propSchema: { latex: { default: "" } },
    content: "none",
  },
  {
    render: InlineMath,
    // Written to Markdown as `$...$`, with the attribute for an HTML paste of the export.
    toExternalHTML: ({ inlineContent }) => (
      <span data-inline-math={inlineContent.props.latex}>{`$${inlineContent.props.latex}$`}</span>
    ),
    parse: (element) =>
      element.hasAttribute("data-inline-math") ? { latex: element.getAttribute("data-inline-math") } : undefined,
  },
);

export function getMathSlashMenuItems(editor) {
  return [
    {
      title: "Block equation",
      subtext: "A TeX equation on a line of its own",
      aliases: ["math", "equation", "latex", "katex", "tex", "formula", "수식"],
      group: "Advanced",
      icon: <Sigma size={18} />,
      key: "math_block",
      onItemClick: () => {
        const inserted = insertBlockWithLineBelow(editor, { type: "mathBlock" });
        editMathBlock(inserted.id);
      },
    },
    {
      title: "Inline equation",
      subtext: "A TeX equation inside the text",
      aliases: ["inline math", "math", "equation", "latex", "katex", "tex", "인라인 수식"],
      group: "Advanced",
      icon: <Radical size={18} />,
      key: "inline_math",
      onItemClick: () => {
        isInlineMathEditPending = true;
        editor.insertInlineContent([{ type: "inlineMath", props: { latex: "" } }], { updateSelection: true });
      },
    },
  ];
}

const escapeAttribute = (value) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// `$...$` in a line of text, as Pandoc reads it: the `$` that opens is not followed by a space,
// the one that closes is not preceded by one nor followed by a digit, so "$5 and $10" stays text.
// Code spans and `\$` are left as they are, and an equation never reaches into a code span.
function writeInlineMathAsHTML(line) {
  let written = "";
  let index = 0;
  while (index < line.length) {
    const character = line[index];
    if (character === "\\") {
      written += line.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (character === "`") {
      const fence = line.slice(index).match(/^`+/)[0];
      const close = line.indexOf(fence, index + fence.length);
      const end = close === -1 ? index + fence.length : close + fence.length;
      written += line.slice(index, end);
      index = end;
      continue;
    }
    if (character === "$" && line[index + 1] !== "$" && line[index + 1] && !/\s/.test(line[index + 1])) {
      let close = index + 1;
      while (close < line.length) {
        if (line[close] === "\\") {
          close += 2;
          continue;
        }
        if (line[close] === "$" || line[close] === "`") break;
        close += 1;
      }
      if (line[close] === "$" && !/\s/.test(line[close - 1]) && !/\d/.test(line[close + 1] ?? "")) {
        written += `<span data-inline-math="${escapeAttribute(line.slice(index + 1, close))}"></span>`;
        index = close + 1;
        continue;
      }
    }
    written += character;
    index += 1;
  }
  return written;
}

// Markdown math for BlockNote's Markdown parser, which knows no math: it would read `\{` as `{`
// and `a_1 b_1` as italics. A `$$` block becomes an element the math block reads and inline
// `$...$` one the inline equation reads. Fenced code is copied as it is.
export function writeMarkdownMathAsHTML(markdown) {
  const lines = markdown.split("\n");
  const written = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (isMarkdownFenceStart(line)) {
      const fence = collectMarkdownFence(lines, index);
      written.push(...fence.lines);
      index = fence.nextIndex;
      continue;
    }
    const oneLine = line.trim().match(/^\$\$(.+)\$\$$/);
    if (oneLine || line.trim() === "$$") {
      let latex = oneLine?.[1].trim();
      let next = index + 1;
      if (!oneLine) {
        const close = lines.findIndex((candidate, at) => at > index && candidate.trim() === "$$");
        if (close !== -1) {
          latex = lines.slice(index + 1, close).join("\n");
          next = close + 1;
        }
      }
      if (latex !== undefined) {
        written.push("", `<div data-math-block="${escapeAttribute(latex)}"></div>`, "");
        index = next;
        continue;
      }
    }
    written.push(line.includes("$") ? writeInlineMathAsHTML(line) : line);
    index += 1;
  }
  return written.join("\n");
}
