import {
  BlockNoteSchema,
  createBlockConfig,
  createBlockSpec,
  createCodeBlockSpec,
  createExtension,
  createHeadingBlockSpec,
  createImageBlockConfig,
  createStyleSpecFromTipTapMark,
  defaultBlockSpecs,
  defaultStyleSpecs,
  getBlockInfoFromSelection,
  imageParse,
  imageRender,
  imageToExternalHTML,
  updateBlockTr,
} from "@blocknote/core";
import { closeHistory } from "@tiptap/pm/history";
import { InputRule, inputRules } from "@tiptap/pm/inputrules";
import { TextSelection } from "@tiptap/pm/state";
import { createCalloutBlockSpec } from "./callout.jsx";
import { DividerMarkdownExport } from "./divider.jsx";
import { createMathBlockSpec, inlineMathSpec } from "./math.jsx";
import { indentCodeBlockLines } from "./codeFormatting.js";
import {
  codeBlockOptions,
  followCodeTheme,
} from "./codeHighlighter.js";

export const NOTE_PANE_TEMPLATE_BLOCKS = [
  {
    type: "heading",
    content: "NotePane",
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "A focused workspace for persistent notes, fast session switching, and polished exports.",
        styles: {},
      },
    ],
  },
  {
    type: "quote",
    content:
      "Capture the work, split the context into sessions, and keep the right pane visible when it matters.",
  },
  {
    id: "template-launch-checklist",
    type: "heading",
    props: { isToggleable: true },
    content: "Launch checklist",
    children: [
      {
        type: "paragraph",
        content: "Use this template when the workspace is clear and you are ready to start a new thread.",
      },
    ],
  },
  {
    type: "checkListItem",
    content: "Create one session per meeting, paper, decision, or workstream.",
  },
  {
    type: "checkListItem",
    content: "Pin a sticky window for reference notes that need to stay in view.",
  },
  {
    type: "checkListItem",
    content: "Tune app and editor typography from Preferences before a long writing pass.",
  },
  {
    type: "heading",
    content: "Workspace modes",
  },
  {
    type: "table",
    content: {
      type: "tableContent",
      rows: [
        {
          cells: ["Mode", "Best for", "Action"],
        },
        {
          cells: ["Tabs", "Drafting, comparing, and organizing sessions", "New session"],
        },
        {
          cells: ["Sticky", "Keeping an active note above other windows", "Switch mode"],
        },
        {
          cells: ["Export", "Turning a finished note into a clean PDF", "Export PDF"],
        },
      ],
    },
  },
  {
    type: "image",
    props: {
      url: "https://placehold.co/960x360/1f2937/f8fafc.png?text=NotePane+Workspace",
      caption: "NotePane workspace preview",
    },
  },
  {
    type: "heading",
    content: "Session brief",
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Objective:",
        styles: { bold: true },
      },
      {
        type: "text",
        text: " Define the outcome before adding supporting notes.",
        styles: {},
      },
    ],
  },
  {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Styled Text",
        styles: {
          bold: true,
          italic: true,
        },
      },
      {
        type: "text",
        text: " can mark the part that needs a decision or follow-up.",
        styles: {},
      },
    ],
  },
  {
    id: "template-follow-up",
    type: "toggleListItem",
    content: "Follow-up",
    children: [
      {
        type: "paragraph",
        content: "Add owners, dates, or unresolved questions before exporting.",
      },
    ],
  },
  {
    type: "codeBlock",
    props: { language: "javascript" },
    content:
      'const session = {\n  status: "ready",\n  panes: ["tabs", "sticky"],\n  export: "polished",\n};',
  },
  {
    type: "paragraph",
  },
];

export const NOTE_PANE_TEMPLATE_BLOCKS_JSON = JSON.stringify(NOTE_PANE_TEMPLATE_BLOCKS);

export const EMPTY_BLOCKS = [
  {
    type: "paragraph",
  },
];

export const notionInlineCodeStyle = createStyleSpecFromTipTapMark(
  defaultStyleSpecs.code.implementation.mark.extend({
    excludes: "bold italic underline strike",
  }),
  "boolean",
);

export const createNonDestructiveImageBlockSpec = createBlockSpec(
  createBlockConfig(() => {
    const imageConfig = createImageBlockConfig();
    return {
      ...imageConfig,
      propSchema: {
        ...imageConfig.propSchema,
        originalUrl: { default: "" },
        croppedUrl: { default: "" },
        cropX: { default: undefined, type: "number" },
        cropY: { default: undefined, type: "number" },
        cropWidth: { default: undefined, type: "number" },
        cropHeight: { default: undefined, type: "number" },
      },
    };
  }),
  () => ({
    meta: { fileBlockAccept: ["image/*"] },
    parse: imageParse(),
    render: imageRender(),
    toExternalHTML: imageToExternalHTML(),
    runsBefore: ["file"],
  }),
);

// Code blocks highlighted with the active theme's code theme. Every editor built from this schema
// (the note editor and the version history preview) follows theme changes while it is mounted.
// BlockNote's own Tab replaces a selection with two spaces and it leaves Shift+Tab to unnest the
// block, so both keys are NotePane's line indent instead.
function createNotePaneCodeBlockSpec() {
  const codeBlockSpec = createCodeBlockSpec({ ...codeBlockOptions, indentLineWithTab: false });
  const followTheme = createExtension(({ editor }) => ({
    key: "notepane-code-theme",
    mount: () => followCodeTheme(editor),
  }))();
  const indentLines = createExtension({
    key: "notepane-code-indent",
    keyboardShortcuts: {
      Tab: ({ editor }) => indentCodeBlockLines(editor, 1),
      "Shift-Tab": ({ editor }) => indentCodeBlockLines(editor, -1),
    },
  });
  return {
    ...codeBlockSpec,
    extensions: [...(codeBlockSpec.extensions ?? []), followTheme, indentLines],
  };
}

// BlockNote's `---` rule leaves the new divider node-selected, so the next key typed replaced it.
// As in Notion, the caret moves on to an empty paragraph below the divider: the next block when it
// is one, otherwise a new one. The rule only fires when `---` (or `***`) is all the block's text.
function createNotePaneDividerSpec() {
  const dividerShortcut = createExtension(({ editor }) => ({
    key: "notepane-divider-shortcut",
    prosemirrorPlugins: [
      inputRules({
        rules: [
          new InputRule(/^(?:---|\*\*\*)$/, (state, _match, start, end) => {
            const blockInfo = getBlockInfoFromSelection(state);
            if (
              !blockInfo.isBlockContainer ||
              editor.schema.blockSchema[blockInfo.blockNoteType]?.content !== "inline" ||
              end !== blockInfo.blockContent.afterPos - 1
            ) {
              return null;
            }

            const tr = state.tr.deleteRange(start, end);
            const dividerPos = blockInfo.bnBlock.beforePos;
            updateBlockTr(tr, dividerPos, { type: "divider", props: {}, content: [] });
            const belowPos = dividerPos + tr.doc.nodeAt(dividerPos).nodeSize;
            const below = tr.doc.resolve(belowPos).nodeAfter;
            const isEmptyParagraph =
              below?.childCount === 1 &&
              below.firstChild.type.name === "paragraph" &&
              below.firstChild.content.size === 0;
            if (!isEmptyParagraph) {
              const { blockContainer, paragraph } = state.schema.nodes;
              tr.insert(belowPos, blockContainer.create(null, paragraph.create()));
            }
            // Inside the blockContainer, then inside its paragraph.
            return tr.setSelection(TextSelection.create(tr.doc, belowPos + 2));
          }, { undoable: true }),
        ],
      }),
    ],
  }))();
  return {
    ...defaultBlockSpecs.divider,
    extensions: [dividerShortcut, DividerMarkdownExport],
  };
}

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    image: createNonDestructiveImageBlockSpec(),
    divider: createNotePaneDividerSpec(),
    quote: {
      ...defaultBlockSpecs.quote,
      extensions: [
        ...(defaultBlockSpecs.quote.extensions ?? []),
        createExtension({
          key: "notepane-quote-pipe-shortcut",
          keyboardShortcuts: {
            Space: ({ editor }) => {
              const { block } = editor.getTextCursorPosition();
              if (block.type !== "paragraph") {
                return false;
              }

              const marker = (block.content ?? [])
                .filter((content) => content.type === "text")
                .map((content) => content.text)
                .join("");
              if (marker !== "|" && marker !== "\\") {
                return false;
              }

              // The space goes in first and the conversion is its own undo step, so Cmd+Z gives
              // back the typed `| `, as for BlockNote's own shortcuts.
              const view = editor.prosemirrorView;
              view.dispatch(view.state.tr.insertText(" "));
              return editor.transact((transaction) => {
                closeHistory(transaction);
                editor.updateBlock(block, {
                  type: "quote",
                  props: {},
                  content: [],
                });
                return true;
              });
            },
          },
          inputRules: [
            {
              find: /^[|\\]\s$/,
              replace() {
                return { type: "quote", props: {} };
              },
            },
          ],
        }),
      ],
    },
    heading: createHeadingBlockSpec({ levels: [1, 2, 3, 4] }),
  },
}).extend({
  blockSpecs: {
    codeBlock: createNotePaneCodeBlockSpec(),
    callout: createCalloutBlockSpec(),
    mathBlock: createMathBlockSpec(),
  },
  inlineContentSpecs: {
    inlineMath: inlineMathSpec,
  },
  styleSpecs: {
    code: notionInlineCodeStyle,
  },
});
