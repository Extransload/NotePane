import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  AddBlockButton,
  blockTypeSelectItems as getBlockTypeSelectItems,
  DragHandleButton,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  useBlockNoteEditor,
  useComponentsContext,
  useExtension,
  useExtensionState,
} from "@blocknote/react";
import { ArrowRightLeft, Palette, Trash2 } from "lucide-react";
import { EditorColorPickerSections } from "./editorColorFormatting.jsx";

export function NotePaneSideMenuController({
  portalElement,
  recentColors,
  onColorUsed,
}) {
  const editor = useBlockNoteEditor();
  const SideMenu = useCallback(
    () => (
      <NotePaneSideMenu
        recentColors={recentColors}
        onColorUsed={onColorUsed}
      />
    ),
    [onColorUsed, recentColors],
  );
  const blockId = useExtensionState("sideMenu", {
    selector: (state) => state?.block?.id,
  });
  const blockIdRef = useRef(blockId);
  blockIdRef.current = blockId;

  useEffect(() => {
    const ownerDocument = editor.domElement?.ownerDocument;
    if (!ownerDocument) {
      return undefined;
    }
    const preserveDragPreviewWidth = (event) => {
      const button = event.target instanceof Element
        ? event.target.closest("button[draggable='true']")
        : null;
      if (!button?.querySelector("[data-test='dragHandle']")) {
        return;
      }
      const block = editor.domElement?.querySelector(
        `.bn-block-outer[data-id="${escapeCssAttribute(blockIdRef.current)}"]`,
      );
      if (block) {
        ownerDocument.documentElement.style.setProperty(
          "--notepane-drag-preview-width",
          `${block.getBoundingClientRect().width}px`,
        );
      }
    };
    const clearDragPreviewWidth = () => {
      ownerDocument.documentElement.style.removeProperty(
        "--notepane-drag-preview-width",
      );
    };
    const clearHandleSelectionHint = () => {
      editor.domElement?.removeAttribute("data-notepane-handle-block-id");
    };
    const rememberBlockFromDragHandle = (event) => {
      const handle = event.target instanceof Element
        ? event.target.closest(".bn-side-menu button[aria-expanded]")
        : null;
      if (!handle || !blockIdRef.current) {
        return;
      }
      editor.domElement?.setAttribute(
        "data-notepane-handle-block-id",
        blockIdRef.current,
      );
    };
    ownerDocument.addEventListener("dragstart", preserveDragPreviewWidth, true);
    ownerDocument.addEventListener("dragend", clearDragPreviewWidth, true);
    ownerDocument.addEventListener("mousedown", clearHandleSelectionHint, true);
    ownerDocument.addEventListener("click", rememberBlockFromDragHandle, true);
    return () => {
      ownerDocument.removeEventListener("dragstart", preserveDragPreviewWidth, true);
      ownerDocument.removeEventListener("dragend", clearDragPreviewWidth, true);
      ownerDocument.removeEventListener("mousedown", clearHandleSelectionHint, true);
      ownerDocument.removeEventListener("click", rememberBlockFromDragHandle, true);
      clearDragPreviewWidth();
      clearHandleSelectionHint();
    };
  }, [editor]);

  return (
    <SideMenuController
      portalElement={portalElement}
      sideMenu={SideMenu}
    />
  );
}

function NotePaneSideMenu({ recentColors, onColorUsed }) {
  const DragHandleMenu = useCallback(
    () => (
      <NotePaneDragHandleMenu
        recentColors={recentColors}
        onColorUsed={onColorUsed}
      />
    ),
    [onColorUsed, recentColors],
  );

  return (
    <SideMenu>
      <AddBlockButton />
      <DragHandleButton dragHandleMenu={DragHandleMenu} />
    </SideMenu>
  );
}

function NotePaneDragHandleMenu({
  recentColors,
  onColorUsed,
}) {
  const Components = useComponentsContext();
  const [activePanel, setActivePanel] = useState(null);

  if (!Components) {
    return null;
  }

  return (
    <DragHandleMenu>
      <Components.Generic.Menu.Item
        className="bn-menu-item"
        closeMenuOnClick={false}
        onClick={() => setActivePanel("turn-into")}
        onPointerEnter={() => setActivePanel("turn-into")}
      >
        <span className="notepane-block-menu-item-content">
          <ArrowRightLeft className="notepane-block-menu-icon is-turn-into" aria-hidden="true" />
          Turn into
        </span>
      </Components.Generic.Menu.Item>
      <Components.Generic.Menu.Item
        className="bn-menu-item"
        closeMenuOnClick={false}
        onClick={() => setActivePanel("colors")}
        onPointerEnter={() => setActivePanel("colors")}
      >
        <span className="notepane-block-menu-item-content">
          <Palette className="notepane-block-menu-icon is-colors" aria-hidden="true" />
          Colors
        </span>
      </Components.Generic.Menu.Item>
      <RemoveBlockItem>
        <span className="notepane-block-menu-item-content">
          <Trash2 className="notepane-block-menu-icon is-delete" aria-hidden="true" />
          Delete
        </span>
      </RemoveBlockItem>
      <BlockMenuSubpanel
        activePanel={activePanel}
        recentColors={recentColors}
        onColorUsed={onColorUsed}
      />
    </DragHandleMenu>
  );
}

function BlockMenuSubpanel({ activePanel, recentColors, onColorUsed }) {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  const sideMenu = useExtension(SideMenuExtension);
  const block = useExtensionState("sideMenu", {
    selector: (state) => state?.block,
  });

  if (!Components || !block || !activePanel) {
    return null;
  }

  const blockTypeItems = getBlockTypeSelectItems(editor.dictionary).filter(
    (item) => item.type !== "heading" || Number(item.props?.level ?? 1) <= 4,
  );
  const selectedBlocks = editor.getSelection()?.blocks;
  const targetBlocks = selectedBlocks?.some((selectedBlock) => selectedBlock.id === block.id)
    ? selectedBlocks
    : [block];

  const updateSelectedBlocks = (update) => {
    editor.focus();
    editor.transact(() => {
      for (const targetBlock of targetBlocks) {
        editor.updateBlock(targetBlock, update(targetBlock));
      }
    });
  };

  return (
    <div
      className="notepane-block-menu-subpanel"
      data-panel={activePanel}
      role="menu"
      aria-label={activePanel === "turn-into" ? "Turn into" : "Colors"}
    >
      {activePanel === "turn-into" ? blockTypeItems.map((item) => {
          const Icon = item.icon;
          const isCurrentType = item.type === block.type && Object.entries(item.props || {})
            .every(([key, value]) => block.props[key] === value);
          return (
            <Components.Generic.Menu.Item
              className="bn-menu-item notepane-block-type-menu-item"
              checked={isCurrentType}
              key={`${item.type}-${JSON.stringify(item.props || {})}`}
              onClick={() => {
                updateSelectedBlocks(() => ({ type: item.type, props: item.props }));
                sideMenu.unfreezeMenu();
              }}
            >
              <span className="notepane-block-menu-item-content">
                <Icon className="notepane-block-menu-icon is-block-type" size={16} aria-hidden="true" />
                {item.name}
              </span>
            </Components.Generic.Menu.Item>
          );
        }) : (
          <>
            <EditorColorPickerSections
              recentColors={recentColors}
              state={{
                textColor: block.props.textColor || "default",
                backgroundColor: block.props.backgroundColor || "default",
              }}
              onSelect={({ kind, color }) => {
                updateSelectedBlocks(() => ({
                  props: { [kind === "text" ? "textColor" : "backgroundColor"]: color },
                }));
                onColorUsed?.({ kind, color });
              }}
            />
          </>
        )}
    </div>
  );
}

export function BlockMenuHighlightController() {
  const editor = useBlockNoteEditor();
  const sideMenu = useExtension(SideMenuExtension);
  const blockId = useExtensionState("sideMenu", {
    selector: (state) => state?.block?.id,
  });
  const [openBlockId, setOpenBlockId] = useState(null);

  useLayoutEffect(() => {
    const ownerDocument = editor.domElement?.ownerDocument;
    if (!ownerDocument) {
      return undefined;
    }

    const syncHighlight = () => {
      const openHandle = ownerDocument.querySelector(
        ".bn-side-menu [data-test='dragHandle']",
      )?.closest("button[aria-expanded='true']");
      setOpenBlockId(openHandle && blockId ? String(blockId) : null);
    };

    const observer = new MutationObserver(syncHighlight);
    observer.observe(ownerDocument.body, {
      attributes: true,
      attributeFilter: ["aria-expanded"],
      childList: true,
      subtree: true,
    });
    syncHighlight();

    return () => {
      observer.disconnect();
    };
  }, [blockId, editor]);

  useEffect(() => {
    if (!openBlockId) {
      return undefined;
    }

    const ownerDocument = editor.domElement?.ownerDocument;
    if (!ownerDocument) {
      return undefined;
    }
    const deleteOpenBlock = (event) => {
      if (
        (event.key !== "Delete" && event.key !== "Backspace") ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        (event.target instanceof Element &&
          event.target.closest("input, textarea, select"))
      ) {
        return;
      }

      const block = editor.getBlock(openBlockId);
      if (!block) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const selectedBlocks = editor.getSelection()?.blocks;
      editor.removeBlocks(
        selectedBlocks?.some((selectedBlock) => selectedBlock.id === block.id)
          ? selectedBlocks
          : [block],
      );
      sideMenu.unfreezeMenu();
    };
    ownerDocument.addEventListener("keydown", deleteOpenBlock, true);
    return () => {
      ownerDocument.removeEventListener("keydown", deleteOpenBlock, true);
    };
  }, [editor, openBlockId, sideMenu]);

  if (!openBlockId) {
    return null;
  }

  const blockSelector = `.bn-editor .bn-block-outer[data-id="${escapeCssAttribute(
    openBlockId,
  )}"] > .bn-block`;
  return (
    <style data-block-menu-highlight={openBlockId}>
      {`${blockSelector} {
        background-color: color-mix(in srgb, var(--sticky-text-color) 7%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sticky-text-color) 9%, transparent);
        animation: blockMenuSelectionIn 180ms ease-out both;
      }
      @media (prefers-reduced-motion: reduce) {
        ${blockSelector} { animation: none; }
      }`}
    </style>
  );
}

function escapeCssAttribute(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
