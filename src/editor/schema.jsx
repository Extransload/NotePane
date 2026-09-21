import {
  codeBlockOptions,
} from "@blocknote/code-block";
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
  imageParse,
  imageRender,
  imageToExternalHTML,
} from "@blocknote/core";

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

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    image: createNonDestructiveImageBlockSpec(),
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

              editor.updateBlock(block, {
                type: "quote",
                props: {},
                content: [],
              });
              return true;
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
    codeBlock: createCodeBlockSpec(codeBlockOptions),
  },
  styleSpecs: {
    code: notionInlineCodeStyle,
  },
});
