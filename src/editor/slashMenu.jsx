import {
  SuggestionMenu,
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core/extensions";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useExtension,
} from "@blocknote/react";
import {
  offset,
  shift,
  size,
} from "@floating-ui/react";
import {
  Heading4,
  Lightbulb,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
} from "react";
import {
  SLASH_MENU_MAX_HEIGHT,
} from "../constants.js";
import { setDividerSlashMenuItem } from "./divider.jsx";
import { getMathSlashMenuItems } from "./math.jsx";

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

// The menu's own Escape handling skips every Escape from a composition's start to its end, so an
// input method that never reports the end, as when the input source is switched mid-composition,
// leaves the menu open. The key event itself says whether it belongs to a composition.
// An Escape that does belong to one is the input method's, a Korean one ending the composition
// with it, so the menu closes once that composition ends and one press is still enough.
function useCloseSuggestionMenuOnEscape() {
  const suggestionMenu = useExtension(SuggestionMenu);
  useEffect(() => {
    let closeAfterComposition = false;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape" || !suggestionMenu.shown()) {
        return;
      }
      if (event.isComposing) {
        closeAfterComposition = true;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      suggestionMenu.closeMenu();
    };
    const forgetEscape = () => {
      closeAfterComposition = false;
    };
    // Bubbling, so the editor has taken the committed text first.
    const closeAfterCompositionEnd = () => {
      if (closeAfterComposition && suggestionMenu.shown()) {
        suggestionMenu.closeMenu();
      }
      closeAfterComposition = false;
    };
    window.addEventListener("keydown", closeOnEscape, true);
    window.addEventListener("compositionstart", forgetEscape, true);
    window.addEventListener("compositionend", closeAfterCompositionEnd);
    return () => {
      window.removeEventListener("keydown", closeOnEscape, true);
      window.removeEventListener("compositionstart", forgetEscape, true);
      window.removeEventListener("compositionend", closeAfterCompositionEnd);
    };
  }, [suggestionMenu]);
}

export function NotePaneSlashMenuController({ editor, onImportMarkdown }) {
  const floatingUIOptions = useMemo(createSlashMenuFloatingUIOptions, []);
  useCloseSuggestionMenuOnEscape();
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
    const callout = {
      title: "Callout",
      subtext: "Text in a coloured box with an icon",
      aliases: ["callout", "box", "note", "info", "콜아웃", "박스"],
      group: "Basic blocks",
      icon: <Lightbulb size={18} />,
      key: "callout",
      onItemClick: () => {
        insertOrUpdateBlockForSlashMenu(editor, { type: "callout" });
      },
    };
    const items = getDefaultReactSlashMenuItems(editor);
    setDividerSlashMenuItem(items, editor);
    items.splice(items.findIndex((item) => item.key === "quote") + 1, 0, callout);
    const toggleHeading3Index = items.findIndex(
      (item) => item.key === "toggle_heading_3",
    );
    items.splice(toggleHeading3Index + 1, 0, toggleHeading4);
    // Equations join the Advanced group, after the table.
    items.splice(items.findIndex((item) => item.key === "table") + 1, 0, ...getMathSlashMenuItems(editor));
    // Last, so `/` and Enter inserts a block rather than opening a file dialog.
    items.push(importMarkdown);
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
