import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getColspan, getRowspan, mapTableCell } from "@blocknote/core";
import { SideMenuExtension, TableHandlesExtension } from "@blocknote/core/extensions";
import {
  TableHandle,
  TableHandlesController,
  useBlockNoteEditor,
  useComponentsContext,
  useExtension,
  useEditorState,
  useExtensionState,
} from "@blocknote/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleX,
  Copy,
  MoveHorizontal,
  PaintRoller,
  PanelLeft,
  PanelTop,
  Trash2,
} from "lucide-react";
import { EditorColorPickerSections } from "./colorFormatting.jsx";
import { selectTableHandleCells } from "./selection.js";
import { fitTableToWidth } from "./tableColumnSizing.js";

const TableMenuColorContext = createContext({ recentColors: [], onColorUsed: undefined });

// BlockNote's table handles with Notion's row and column menu. The menu reads the recent colours
// from context, so its component stays the same and an open menu is not remounted when they change.
export function NotePaneTableHandlesController({ recentColors, onColorUsed }) {
  const colors = useMemo(
    () => ({ recentColors, onColorUsed }),
    [onColorUsed, recentColors],
  );
  return (
    <TableMenuColorContext.Provider value={colors}>
      <TableHandlesController tableHandle={NotePaneTableHandle} />
    </TableMenuColorContext.Provider>
  );
}

function NotePaneTableHandle(props) {
  return <TableHandle {...props} tableHandleMenu={NotePaneTableHandleMenu} />;
}

function NotePaneTableHandleMenu({ orientation }) {
  const Components = useComponentsContext();
  return (
    <Components.Generic.Menu.Dropdown className="bn-table-handle-menu notepane-table-handle-menu">
      <TableHandleMenuItems orientation={orientation} />
    </Components.Generic.Menu.Dropdown>
  );
}

// Rendered only while the menu is open.
function TableHandleMenuItems({ orientation }) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  const tableHandles = useExtension(TableHandlesExtension);
  const { recentColors, onColorUsed } = useContext(TableMenuColorContext);
  const { block, rowIndex, colIndex } = useExtensionState(TableHandlesExtension, {
    selector: (state) => ({
      block: state?.block,
      rowIndex: state?.rowIndex,
      colIndex: state?.colIndex,
    }),
  });
  const [activePanel, setActivePanel] = useState(null);
  const isRow = orientation === "row";
  const index = isRow ? rowIndex : colIndex;
  const hasHandleCell = Boolean(block) && rowIndex !== undefined && colIndex !== undefined;

  // Opening the menu selects its row or column, as in Notion, and the selection stays after the
  // menu closes. This runs once, on open: the open menu freezes the handles on their cell.
  useEffect(() => {
    if (hasHandleCell) {
      selectTableHandleCells(editor, block.id, orientation, rowIndex, colIndex);
    }
  }, []);

  if (!Components || !tableHandles || !hasHandleCell) {
    return null;
  }

  const cells = isRow
    ? tableHandles.getCellsAtRowHandle(block, index)
    : tableHandles.getCellsAtColumnHandle(block, index);
  const headerKey = isRow ? "headerRows" : "headerCols";
  const isHeader = Boolean(block.content[headerKey]);
  const hasMergedCells = block.content.rows.some((row) => row.cells.some((cell) => (
    getColspan(cell) > 1 || getRowspan(cell) > 1
  )));
  const lineCount = isRow
    ? block.content.rows.length
    : block.content.rows[0]?.cells.reduce((total, cell) => total + getColspan(cell), 0) ?? 0;
  const firstCell = cells[0]?.cell;
  const colorState = {
    textColor: cells.every(({ cell }) => cell.props?.textColor === firstCell?.props?.textColor)
      ? firstCell?.props?.textColor ?? "default"
      : "default",
    backgroundColor: cells.every(({ cell }) => (
      cell.props?.backgroundColor === firstCell?.props?.backgroundColor
    ))
      ? firstCell?.props?.backgroundColor ?? "default"
      : "default",
  };

  // One updateBlock, so one undo step; it moves the selection out of the table, so the row or
  // column at `selectIndex` is selected again afterwards.
  const updateTable = (transformContent, selectIndex = index) => {
    const currentBlock = editor.getBlock(block.id);
    if (currentBlock?.type !== "table") {
      return;
    }
    const content = structuredClone(currentBlock.content);
    content.rows = content.rows.map((row) => ({ ...row, cells: row.cells.map(mapTableCell) }));
    editor.updateBlock(currentBlock, { type: "table", content: transformContent(content) });
    selectTableHandleCells(
      editor,
      block.id,
      orientation,
      isRow ? selectIndex : rowIndex,
      isRow ? colIndex : selectIndex,
    );
  };
  const updateHandleCells = (updateCell) => updateTable((content) => {
    for (const { row, col } of cells) {
      updateCell(content.rows[row].cells[col]);
    }
    return content;
  });
  const closePanel = () => setActivePanel(null);
  const itemProps = { className: "bn-menu-item", onPointerEnter: closePanel };

  return (
    <>
      {index === 0 && editor.settings.tables.headers && (
        <MenuSwitchItem
          {...itemProps}
          checked={isHeader}
          icon={isRow ? PanelTop : PanelLeft}
          label={isRow ? "Header row" : "Header column"}
          onClick={() => updateTable((content) => ({
            ...content,
            [headerKey]: isHeader ? undefined : 1,
          }))}
        />
      )}
      <Components.Generic.Menu.Item
        className="bn-menu-item"
        closeMenuOnClick={false}
        onClick={() => setActivePanel("colors")}
        onPointerEnter={() => setActivePanel("colors")}
      >
        <MenuItemContent icon={PaintRoller} label="Color" />
      </Components.Generic.Menu.Item>
      <Components.Generic.Menu.Item
        {...itemProps}
        onClick={() => tableHandles.addRowOrColumn(
          index,
          isRow ? { orientation: "row", side: "above" } : { orientation: "column", side: "left" },
        )}
      >
        <MenuItemContent
          icon={isRow ? ArrowUp : ArrowLeft}
          label={isRow ? "Insert above" : "Insert left"}
        />
      </Components.Generic.Menu.Item>
      <Components.Generic.Menu.Item
        {...itemProps}
        onClick={() => tableHandles.addRowOrColumn(
          index,
          isRow ? { orientation: "row", side: "below" } : { orientation: "column", side: "right" },
        )}
      >
        <MenuItemContent
          icon={isRow ? ArrowDown : ArrowRight}
          label={isRow ? "Insert below" : "Insert right"}
        />
      </Components.Generic.Menu.Item>
      {!hasMergedCells && (
        <Components.Generic.Menu.Item
          {...itemProps}
          onClick={() => updateTable((content) => {
            if (isRow) {
              content.rows.splice(index + 1, 0, structuredClone(content.rows[index]));
            } else {
              for (const row of content.rows) {
                row.cells.splice(index + 1, 0, structuredClone(row.cells[index]));
              }
              content.columnWidths?.splice(index + 1, 0, content.columnWidths[index]);
            }
            return content;
          }, index + 1)}
        >
          <MenuItemContent icon={Copy} label="Duplicate" />
        </Components.Generic.Menu.Item>
      )}
      <Components.Generic.Menu.Item
        {...itemProps}
        onClick={() => updateHandleCells((cell) => {
          cell.content = [];
        })}
      >
        <MenuItemContent icon={CircleX} label="Clear contents" />
      </Components.Generic.Menu.Item>
      <Components.Generic.Menu.Item
        {...itemProps}
        onClick={() => {
          // Deleting the table's only row or column deletes the table, as in Notion.
          if (lineCount <= 1) {
            editor.removeBlocks([block.id]);
          } else {
            tableHandles.removeRowOrColumn(index, isRow ? "row" : "column");
          }
        }}
      >
        <MenuItemContent icon={Trash2} label="Delete" />
      </Components.Generic.Menu.Item>
      {activePanel === "colors" && (
        <div className="notepane-block-menu-subpanel" data-panel="colors" role="menu" aria-label="Color">
          <EditorColorPickerSections
            recentColors={recentColors}
            state={colorState}
            onSelect={({ kind, color }) => {
              updateHandleCells((cell) => {
                cell.props[kind === "text" ? "textColor" : "backgroundColor"] = color;
              });
              onColorUsed?.({ kind, color });
            }}
          />
        </div>
      )}
    </>
  );
}

// The table items of the six-dot block menu, as in Notion: fit to width and the header switches.
export function TableBlockMenuItems({ onPointerEnter }) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  const block = useExtensionState(SideMenuExtension, {
    selector: (state) => state?.block,
  });
  // The side menu keeps the block it opened on; a header switch reads the live block, as the
  // menu stays open after it.
  const headers = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      const content = block?.type === "table"
        ? currentEditor.getBlock(block.id)?.content
        : undefined;
      return (content?.headerRows ? 1 : 0) | (content?.headerCols ? 2 : 0);
    },
  });
  // A header switch leaves the menu open, so the editor takes focus back once it closes, and
  // Cmd+Z then undoes the switch. The items mount only while the menu is open. ProseMirror's own
  // focus keeps the scroll position, where the selection may be far from the table.
  const hasToggledHeaderRef = useRef(false);
  useEffect(() => () => {
    if (hasToggledHeaderRef.current && editor.isEditable) {
      editor.prosemirrorView?.focus();
    }
  }, [editor]);

  if (!Components || block?.type !== "table") {
    return null;
  }

  const toggleHeader = (headerKey) => {
    const currentBlock = editor.getBlock(block.id);
    if (currentBlock?.type !== "table") {
      return;
    }
    hasToggledHeaderRef.current = true;
    editor.updateBlock(currentBlock, {
      content: {
        ...currentBlock.content,
        [headerKey]: currentBlock.content[headerKey] ? undefined : 1,
      },
    });
  };

  return (
    <>
      <Components.Generic.Menu.Item
        className="bn-menu-item"
        onPointerEnter={onPointerEnter}
        onClick={() => {
          // The editor takes focus back, as after a header switch, for Cmd+Z.
          editor.prosemirrorView?.focus();
          fitTableToWidth(editor, block.id);
        }}
      >
        <MenuItemContent icon={MoveHorizontal} label="Fit to width" />
      </Components.Generic.Menu.Item>
      {editor.settings.tables.headers && (
        <>
          <MenuSwitchItem
            className="bn-menu-item"
            onPointerEnter={onPointerEnter}
            checked={Boolean(headers & 1)}
            icon={PanelTop}
            label="Header row"
            onClick={() => toggleHeader("headerRows")}
          />
          <MenuSwitchItem
            className="bn-menu-item"
            onPointerEnter={onPointerEnter}
            checked={Boolean(headers & 2)}
            icon={PanelLeft}
            label="Header column"
            onClick={() => toggleHeader("headerCols")}
          />
        </>
      )}
      <Components.Generic.Menu.Divider />
    </>
  );
}

// A menu item with a switch, which keeps the menu open, as Notion's header toggles do.
function MenuSwitchItem({ checked, icon, label, ...props }) {
  const Components = useComponentsContext();
  return (
    <Components.Generic.Menu.Item
      {...props}
      closeMenuOnClick={false}
    >
      <MenuItemContent icon={icon} label={label} />
      <span className="notepane-menu-switch" data-checked={checked ? "true" : "false"} aria-hidden="true" />
    </Components.Generic.Menu.Item>
  );
}

function MenuItemContent({ icon: Icon, label }) {
  return (
    <span className="notepane-block-menu-item-content">
      <Icon className="notepane-block-menu-icon" aria-hidden="true" />
      {label}
    </span>
  );
}
