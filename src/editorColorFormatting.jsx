import { useCallback } from "react";
import { formatKeyboardShortcut } from "@blocknote/core";
import { TableHandlesExtension } from "@blocknote/core/extensions";
import { Combine, Crop, Download, SplitSquareHorizontal } from "lucide-react";
import {
  BasicTextStyleButton,
  blockTypeSelectItems as getBlockTypeSelectItems,
  BlockTypeSelect,
  CreateLinkButton,
  FormattingToolbarController,
  getFormattingToolbarItems,
  TextAlignButton,
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
  useExtension,
} from "@blocknote/react";

const EDITOR_COLOR_VALUES = [
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
];
const RECENT_EDITOR_COLOR_LIMIT = 5;
const CONTEXTUAL_FORMATTING_TOOL_KEYS = new Set([
  "fileCaptionButton",
  "replaceFileButton",
  "fileRenameButton",
  "fileDeleteButton",
  "filePreviewButton",
]);
const FORMATTING_TOOLBAR_FLOATING_OPTIONS = {
  useFloatingOptions: {
    placement: "right-start",
  },
};

export function rememberEditorColor(recentColors, colorChoice) {
  if (!isEditorColorChoice(colorChoice)) {
    return recentColors;
  }

  return [
    colorChoice,
    ...recentColors.filter(
      (choice) =>
        choice.kind !== colorChoice.kind || choice.color !== colorChoice.color,
    ),
  ].slice(0, RECENT_EDITOR_COLOR_LIMIT);
}

export function applyEditorColor(editor, colorChoice) {
  if (!editor || !isEditorColorChoice(colorChoice)) {
    return false;
  }

  const styleType = colorChoice.kind === "text" ? "textColor" : "backgroundColor";
  try {
    if (colorChoice.color === "default") {
      editor.removeStyles({ [styleType]: "default" });
    } else {
      editor.addStyles({ [styleType]: colorChoice.color });
    }
    return true;
  } catch {
    return false;
  }
}

export function RecentColorFormattingToolbarController({
  recentColors,
  onColorUsed,
  onCropImage,
  onDownloadImage,
  activeImageBlockId,
  portalElement,
  hidden = false,
}) {
  const Toolbar = useCallback(
    (props) => (
      <RecentColorFormattingToolbar
        {...props}
        recentColors={recentColors}
        onColorUsed={onColorUsed}
        onCropImage={onCropImage}
        onDownloadImage={onDownloadImage}
        activeImageBlockId={activeImageBlockId}
      />
    ),
    [activeImageBlockId, onColorUsed, onCropImage, onDownloadImage, recentColors],
  );

  if (hidden) {
    return null;
  }

  return (
    <FormattingToolbarController
      formattingToolbar={Toolbar}
      floatingUIOptions={FORMATTING_TOOLBAR_FLOATING_OPTIONS}
      portalElement={portalElement}
    />
  );
}

function RecentColorFormattingToolbar({
  blockTypeSelectItems,
  recentColors,
  onColorUsed,
  onCropImage,
  onDownloadImage,
  activeImageBlockId,
}) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  const isInsideTableCell = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const selection = currentEditor.prosemirrorState.selection;
      if (selection.$anchorCell) {
        return true;
      }

      for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
        if (selection.$from.node(depth).type.spec.tableRole?.endsWith("cell")) {
          return true;
        }
      }
      return false;
    },
  });
  const selectedFileBlock = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const selectedBlocks = currentEditor.getSelection()?.blocks || [
        currentEditor.getTextCursorPosition().block,
      ];
      return selectedBlocks.length === 1 && selectedBlocks[0]?.type === "file"
        ? selectedBlocks[0]
        : null;
    },
  });
  const isFileContext = Boolean(selectedFileBlock);
  const supportedBlockTypeSelectItems = (
    blockTypeSelectItems ?? getBlockTypeSelectItems(editor.dictionary)
  ).filter(
    (item) => item.type !== "heading" || Number(item.props?.level ?? 1) <= 4,
  );
  const contextualItems = getFormattingToolbarItems(supportedBlockTypeSelectItems).filter(
    (item) => CONTEXTUAL_FORMATTING_TOOL_KEYS.has(item.key),
  );
  const imageBlock = activeImageBlockId ? editor.getBlock(activeImageBlockId) : null;
  const downloadableBlock = imageBlock?.type === "image"
    ? imageBlock
    : selectedFileBlock;

  if (!Components) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Root
      className={[
        "bn-toolbar bn-formatting-toolbar notepane-formatting-toolbar",
        isInsideTableCell ? "is-table-context" : "",
        isFileContext ? "is-file-context" : "",
      ].filter(Boolean).join(" ")}
    >
      {!isInsideTableCell && !isFileContext && (
        <div className="notepane-formatting-type-row">
          <BlockTypeSelect items={supportedBlockTypeSelectItems} />
        </div>
      )}
      {!isFileContext && (
        <div
          className="notepane-formatting-actions"
          role="group"
          aria-label="Text formatting"
        >
          <RecentColorStyleButton
            recentColors={recentColors}
            onColorUsed={onColorUsed}
          />
          <BasicTextStyleButton basicTextStyle="bold" />
          <BasicTextStyleButton basicTextStyle="italic" />
          <BasicTextStyleButton basicTextStyle="underline" />
          <BasicTextStyleButton basicTextStyle="strike" />
          <CreateLinkButton />
          <BasicTextStyleButton basicTextStyle="code" />
          <TextAlignButton textAlignment="left" />
          <TextAlignButton textAlignment="center" />
          <TextAlignButton textAlignment="right" />
        </div>
      )}
      <div
        className="notepane-formatting-contextual-actions"
        role="group"
        aria-label="Selected item actions"
      >
        {contextualItems}
        {downloadableBlock && onDownloadImage && (
          <Components.FormattingToolbar.Button
            className="bn-button notepane-file-download-button"
            label={`Download ${downloadableBlock.type}`}
            mainTooltip={`Download ${downloadableBlock.type}`}
            icon={<Download />}
            onClick={() => onDownloadImage(downloadableBlock)}
          />
        )}
        {imageBlock?.type === "image" && onCropImage && (
          <Components.FormattingToolbar.Button
            className="bn-button notepane-image-crop-button"
            label="Crop image"
            mainTooltip="Crop image"
            icon={<Crop />}
            onClick={() => onCropImage(imageBlock)}
          />
        )}
        <TableCellMergeSplitButton />
      </div>
    </Components.FormattingToolbar.Root>
  );
}

function TableCellMergeSplitButton() {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  const tableHandles = useExtension(TableHandlesExtension);
  const action = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const selection = currentEditor.prosemirrorState.selection;
      const selectedCell = selection.$anchorCell?.nodeAfter;
      if (!selection.$anchorCell || !selection.$headCell || !selectedCell) {
        return null;
      }
      if (selection.$anchorCell.pos !== selection.$headCell.pos) {
        return "merge";
      }
      return selectedCell.attrs.colspan > 1 || selectedCell.attrs.rowspan > 1
        ? "split"
        : null;
    },
  });

  if (!Components || !action) {
    return null;
  }

  const isMerge = action === "merge";
  const label = isMerge ? "Merge selected cells" : "Split merged cell";

  return (
    <Components.FormattingToolbar.Button
      className="bn-button notepane-table-merge-split-button"
      label={label}
      mainTooltip={label}
      secondaryTooltip={formatKeyboardShortcut("Mod-Shift-M")}
      icon={isMerge ? <Combine /> : <SplitSquareHorizontal />}
      onClick={() => {
        if (isMerge) {
          tableHandles.mergeCells();
        } else {
          tableHandles.splitCell();
        }
      }}
    />
  );
}

function RecentColorStyleButton({ recentColors, onColorUsed }) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor.isEditable) {
        return undefined;
      }

      const selectedBlocks = currentEditor.getSelection()?.blocks || [
        currentEditor.getTextCursorPosition().block,
      ];
      if (!selectedBlocks.some((block) => block.content !== undefined)) {
        return undefined;
      }

      const activeStyles = currentEditor.getActiveStyles();
      return {
        textColor: activeStyles.textColor || "default",
        backgroundColor: activeStyles.backgroundColor || "default",
      };
    },
  });

  if (!Components || !state) {
    return null;
  }

  const dictionary = editor.dictionary;
  const applyColor = (colorChoice) => {
    if (!applyEditorColor(editor, colorChoice)) {
      return;
    }

    onColorUsed(colorChoice);
    window.setTimeout(() => editor.focus(), 0);
  };

  return (
    <Components.Generic.Menu.Root>
      <Components.Generic.Menu.Trigger>
        <Components.FormattingToolbar.Button
          className="bn-button notepane-color-toolbar-button"
          label={dictionary.formatting_toolbar.colors.tooltip}
          mainTooltip={dictionary.formatting_toolbar.colors.tooltip}
          secondaryTooltip="Mod+Shift+H"
          icon={(
            <ActiveColorIcon
              textColor={state.textColor}
              backgroundColor={state.backgroundColor}
            />
          )}
        />
      </Components.Generic.Menu.Trigger>
      <Components.Generic.Menu.Dropdown
        className="bn-menu-dropdown bn-color-picker-dropdown notion-color-picker-dropdown"
      >
        <EditorColorPickerSections
          recentColors={recentColors}
          state={state}
          onSelect={applyColor}
        />
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  );
}

export function EditorColorPickerSections({ recentColors = [], state, onSelect }) {
  const editor = useBlockNoteEditor();
  return (
    <div className="notion-color-picker-content">
      {recentColors.length > 0 && (
        <ColorSection
          title="Recently used"
          choices={recentColors}
          state={state}
          colorLabels={editor.dictionary.color_picker.colors}
          onSelect={onSelect}
          recent
        />
      )}
      <ColorSection
        title="Text color"
        choices={EDITOR_COLOR_VALUES.map((color) => ({ kind: "text", color }))}
        state={state}
        colorLabels={editor.dictionary.color_picker.colors}
        onSelect={onSelect}
      />
      <ColorSection
        title="Background color"
        choices={EDITOR_COLOR_VALUES.map((color) => ({ kind: "background", color }))}
        state={state}
        colorLabels={editor.dictionary.color_picker.colors}
        onSelect={onSelect}
      />
    </div>
  );
}

function ColorSection({
  title,
  choices,
  state,
  colorLabels,
  onSelect,
  recent = false,
}) {
  const Components = useComponentsContext();

  return (
    <section
      className="notion-color-picker-section"
      aria-label={title}
      data-testid={recent ? "recent-editor-colors" : undefined}
    >
      <div className="notion-color-picker-label">{title}</div>
      <div className="notion-color-picker-grid">
        {choices.map((choice, index) => {
          const colorName = colorLabels[choice.color] || choice.color;
          const kindLabel = choice.kind === "text" ? "text color" : "background color";
          const label = `${colorName} ${kindLabel}`;
          const isActive = choice.kind === "text"
            ? state.textColor === choice.color
            : state.backgroundColor === choice.color;

          return (
            <Components.Generic.Menu.Item
              className="notion-color-swatch"
              aria-label={recent ? `Recent: ${label}` : label}
              data-active={isActive ? "true" : undefined}
              data-color-kind={choice.kind}
              data-color-value={choice.color}
              data-test={recent ? undefined : `${choice.kind}-color-${choice.color}`}
              data-testid={recent ? `recent-editor-color-${index}` : undefined}
              key={`${choice.kind}-${choice.color}`}
              onClick={() => onSelect(choice)}
            >
              <ColorChoiceIcon choice={choice} />
            </Components.Generic.Menu.Item>
          );
        })}
      </div>
    </section>
  );
}

function ActiveColorIcon({ textColor, backgroundColor }) {
  return (
    <span
      className="bn-color-icon notepane-editor-color-icon notepane-toolbar-color-icon"
      data-background-color={backgroundColor}
      data-text-color={textColor}
      aria-hidden="true"
    >
      A
    </span>
  );
}

function ColorChoiceIcon({ choice }) {
  return (
    <span
      className="bn-color-icon notepane-editor-color-icon notepane-color-choice-icon"
      data-background-color={choice.kind === "background" ? choice.color : "default"}
      data-text-color={choice.kind === "text" ? choice.color : "default"}
      aria-hidden="true"
    >
      {choice.kind === "text" ? "A" : ""}
    </span>
  );
}

function isEditorColorChoice(colorChoice) {
  return Boolean(
    colorChoice &&
      (colorChoice.kind === "text" || colorChoice.kind === "background") &&
      EDITOR_COLOR_VALUES.includes(colorChoice.color),
  );
}
