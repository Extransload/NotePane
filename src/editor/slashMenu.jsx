import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core/extensions";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import {
  offset,
  shift,
  size,
} from "@floating-ui/react";
import {
  Heading4,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useMemo,
} from "react";
import {
  SLASH_MENU_MAX_HEIGHT,
} from "../constants.js";

export function createSlashMenuFloatingUIOptions() {
  return {
    useFloatingOptions: {
      placement: "bottom-start",
      middleware: [
        offset(10),
        {
          name: "notepaneSlashMenuPlacement",
          fn({ placement, rects }) {
            const spaceAbove = rects.reference.y;
            const spaceBelow = window.innerHeight -
              (rects.reference.y + rects.reference.height);
            const nextPlacement = spaceAbove > spaceBelow
              ? "top-start"
              : "bottom-start";
            return placement === nextPlacement
              ? {}
              : { reset: { placement: nextPlacement } };
          },
        },
        shift({ padding: 10 }),
        size({
          apply({ elements, availableHeight }) {
            elements.floating.style.maxHeight = `${Math.max(
              0,
              Math.min(availableHeight, SLASH_MENU_MAX_HEIGHT),
            )}px`;
          },
          padding: 10,
        }),
      ],
    },
  };
}

export function NotePaneSlashMenuController({ editor, onImportMarkdown }) {
  const floatingUIOptions = useMemo(createSlashMenuFloatingUIOptions, []);
  const getItems = useCallback(async (query) => {
    const importMarkdown = {
      title: "Import Markdown",
      subtext: "Choose a Markdown file and insert it here",
      aliases: ["import", "markdown", "md"],
      group: "Import",
      icon: <Upload size={18} />,
      key: "import_markdown",
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, { type: "paragraph" });
        onImportMarkdown?.();
      },
    };
    const toggleHeading4 = {
      title: "Toggle Heading 4",
      subtext: "Toggleable minor subsection heading",
      aliases: ["h4", "heading4", "subheading4", "collapsible"],
      group: "Subheadings",
      icon: <Heading4 size={18} />,
      key: "toggle_heading_4",
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, {
          type: "heading",
          props: { level: 4, isToggleable: true },
        });
      },
    };
    const items = getDefaultReactSlashMenuItems(editor);
    items.unshift(importMarkdown);
    const toggleHeading3Index = items.findIndex(
      (item) => item.key === "toggle_heading_3",
    );
    items.splice(toggleHeading3Index + 1, 0, toggleHeading4);
    return filterSuggestionItems(items, query);
  }, [editor, onImportMarkdown]);

  return (
    <SuggestionMenuController
      triggerCharacter="/"
      getItems={getItems}
      shouldOpen={(state) =>
        !state.selection.$from.parent.type.isInGroup("tableContent")
      }
      floatingUIOptions={floatingUIOptions}
    />
  );
}
