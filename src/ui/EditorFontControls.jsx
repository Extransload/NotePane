import {
  size,
} from "@floating-ui/react";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EDITOR_BUILTIN_FONT_FAMILY_OPTIONS,
} from "../constants.js";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  filterEditorFontOptions,
  getEditorFontFamilyOption,
  normalizeEditorFontFamily,
} from "../model/preferences.js";
import {
  DropdownMenuOption,
  FloatingDropdownMenu,
} from "./FloatingDropdownMenu.jsx";

export function EditorFontFamilyControl({
  className = "",
  fontFamily,
  fontOptions = EDITOR_BUILTIN_FONT_FAMILY_OPTIONS,
  inputAriaLabel = "Editor font family",
  menuButtonAriaLabel = "Open font family menu",
  optionsAriaLabel = "Font family options",
  onFontFamilyChange,
}) {
  const normalizedFontFamily = normalizeEditorFontFamily(fontFamily);
  const selectedFontOption = getEditorFontFamilyOption(
    normalizedFontFamily,
    fontOptions,
  );
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false);
  const [fontQuery, setFontQuery] = useState("");
  const fontMenuAnchorRef = useRef(null);
  const filteredFontOptions = useMemo(
    () => filterEditorFontOptions(fontOptions, fontQuery),
    [fontOptions, fontQuery],
  );

  const closeFontMenu = useCallback(() => {
    setFontQuery("");
    setIsFontMenuOpen(false);
  }, []);

  const applyFontFamily = useCallback(
    (nextFontFamily) => {
      const normalizedValue = normalizeEditorFontFamily(nextFontFamily);
      const option = getEditorFontFamilyOption(normalizedValue, fontOptions);
      onFontFamilyChange(normalizedValue);
      setFontQuery(option.label === selectedFontOption.label ? "" : option.label);
      closeFontMenu();
    },
    [closeFontMenu, fontOptions, onFontFamilyChange, selectedFontOption.label],
  );

  return (
    <div
      ref={fontMenuAnchorRef}
      className={`editor-font-setting-control editor-font-family-control ${className}`.trim()}
      onMouseDown={preventFocusLoss}
    >
      <div className="editor-font-family-combobox">
        <input
          className="editor-font-family-input"
          aria-label={inputAriaLabel}
          role="combobox"
          aria-expanded={isFontMenuOpen ? "true" : "false"}
          aria-haspopup="listbox"
          aria-controls="editor-font-family-options"
          spellCheck={false}
          placeholder={selectedFontOption.label}
          value={isFontMenuOpen ? fontQuery : selectedFontOption.label}
          onMouseDown={(event) => event.stopPropagation()}
          onFocus={() => {
            setFontQuery("");
            setIsFontMenuOpen(true);
          }}
          onChange={(event) => {
            setFontQuery(event.target.value);
            setIsFontMenuOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIsFontMenuOpen(true);
              return;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              const firstOption = filteredFontOptions[0];
              if (firstOption) {
                applyFontFamily(firstOption.value);
              }
              event.currentTarget.blur();
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              closeFontMenu();
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="editor-font-family-menu-button"
          aria-label={menuButtonAriaLabel}
          aria-haspopup="listbox"
          aria-expanded={isFontMenuOpen ? "true" : "false"}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={() => {
            setFontQuery("");
            setIsFontMenuOpen((value) => !value);
          }}
        >
          ⌄
        </button>
        <FloatingDropdownMenu
          id="editor-font-family-options"
          anchorRef={fontMenuAnchorRef}
          ariaLabel={optionsAriaLabel}
          className="editor-font-family-menu"
          isOpen={isFontMenuOpen}
          maxHeight={216}
          maxWidth={238}
          minWidth={168}
          onRequestClose={closeFontMenu}
          preferredWidth={218}
        >
          {filteredFontOptions.length > 0 ? (
            filteredFontOptions.map((option) => (
              <DropdownMenuOption
                key={option.value}
                className="editor-font-family-option"
                selected={option.value === normalizedFontFamily}
                style={{ "--font-option-family": option.css }}
                onClick={() => applyFontFamily(option.value)}
                meta={option.source === "installed" ? "Local" : null}
              >
                {option.label}
              </DropdownMenuOption>
            ))
          ) : (
            <div className="editor-font-family-empty">No fonts found</div>
          )}
        </FloatingDropdownMenu>
      </div>
    </div>
  );
}
