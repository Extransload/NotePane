import { Check } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { filterCodeLanguages } from "../editor/codeLanguages.js";

/**
 * A code block's language menu, as in Notion: a search field over the languages. The arrow keys
 * move through the matches, Enter or a click picks one, Escape or a press elsewhere closes it.
 * It opens below the tool bar, or above it when the editor surface has more room there.
 */
export function CodeLanguageMenu({ language, toolbarRef, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => filterCodeLanguages(query), [query]);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, matches.findIndex(({ id }) => id === language)),
  );
  const [placement, setPlacement] = useState("below");
  const menuRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();
  const active = matches[activeIndex] ?? null;

  useLayoutEffect(() => {
    const menu = menuRef.current;
    menu.querySelector("input").focus({ preventScroll: true });
    const surface = menu.closest("[data-testid='sticky-editor-surface']");
    const toolbar = toolbarRef.current;
    if (!surface || !toolbar) {
      return;
    }
    const surfaceRect = surface.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const roomBelow = surfaceRect.bottom - toolbarRect.bottom;
    const roomAbove = toolbarRect.top - surfaceRect.top;
    if (menu.offsetHeight > roomBelow && roomAbove > roomBelow) {
      setPlacement("above");
    }
  }, [toolbarRef]);

  // Keeps the active language in view by scrolling the list alone, never the editor.
  useLayoutEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector("[data-active='true']");
    if (!item) {
      return;
    }
    if (item.offsetTop < list.scrollTop) {
      list.scrollTop = item.offsetTop;
    } else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
    }
  }, [active]);

  useEffect(() => {
    const closeOnOutsidePointer = (event) => {
      if (!toolbarRef.current?.contains(event.target)) {
        onClose();
      }
    };
    // On the window, so it runs before the editor's own Escape handlers and keeps them out.
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose({ returnFocus: true });
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [onClose, toolbarRef]);

  const moveActive = (step) => {
    if (matches.length > 0) {
      setActiveIndex((index) => (index + step + matches.length) % matches.length);
    }
  };

  return (
    <div
      ref={menuRef}
      className={`code-block-language-menu is-${placement}`}
      role="dialog"
      aria-label="Code language"
    >
      <input
        className="code-block-language-search"
        type="text"
        role="combobox"
        aria-label="Search for a language"
        aria-expanded="true"
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active ? `${listId}-${active.id}` : undefined}
        placeholder="Search for a language"
        spellCheck={false}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            moveActive(event.key === "ArrowDown" ? 1 : -1);
          } else if (event.key === "Enter" && !event.nativeEvent.isComposing && active) {
            // Enter also confirms an IME composition, such as Korean, which must not pick.
            event.preventDefault();
            onPick(active.id);
          }
        }}
      />
      <ul
        ref={listRef}
        id={listId}
        className="code-block-language-list"
        role="listbox"
        aria-label="Languages"
      >
        {matches.map((option, index) => (
          <li
            key={option.id}
            id={`${listId}-${option.id}`}
            role="option"
            aria-selected={option === active}
            data-active={option === active ? "true" : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onMouseMove={() => setActiveIndex(index)}
            onClick={() => onPick(option.id)}
          >
            <span>{option.name}</span>
            {option.id === language ? <Check aria-hidden="true" /> : null}
          </li>
        ))}
      </ul>
      {matches.length === 0 ? (
        <p className="code-block-language-empty">No matching language</p>
      ) : null}
    </div>
  );
}
