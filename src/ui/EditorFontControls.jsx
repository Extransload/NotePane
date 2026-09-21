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
  EDITOR_FONT_SIZE_PRESETS,
  MAX_EDITOR_FONT_SIZE_PX,
  MIN_EDITOR_FONT_SIZE_PX,
} from "../constants.js";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  editorFontScaleToSize,
  filterEditorFontOptions,
  getEditorFontFamilyOption,
  normalizeEditorFontFamily,
  normalizeEditorFontSize,
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

export function EditorFontSizeControl({
  className = "",
  draftValue,
  scale,
  onDraftChange,
  onCommit,
  onFontSizeChange,
}) {
  const currentFontSize = editorFontScaleToSize(scale);
  const [isSizeMenuOpen, setIsSizeMenuOpen] = useState(false);
  const sizeMenuAnchorRef = useRef(null);

  const closeSizeMenu = useCallback(() => {
    setIsSizeMenuOpen(false);
  }, []);

  const applyFontSize = useCallback(
    (nextSize) => {
      const normalizedSize = normalizeEditorFontSize(nextSize, currentFontSize);
      onDraftChange(String(normalizedSize));
      onFontSizeChange(normalizedSize);
      closeSizeMenu();
    },
    [closeSizeMenu, currentFontSize, onDraftChange, onFontSizeChange],
  );

  return (
    <div
      ref={sizeMenuAnchorRef}
      className={`editor-font-setting-control editor-font-size-control ${className}`.trim()}
      onMouseDown={preventFocusLoss}
    >
      <div className="editor-font-size-combobox">
        <input
          className="editor-font-size-input"
          aria-label="Editor font size"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          min={MIN_EDITOR_FONT_SIZE_PX}
          max={MAX_EDITOR_FONT_SIZE_PX}
          value={draftValue}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const nextValue = event.target.value.trim();
            const nextSize = Number(nextValue);
            onDraftChange(nextValue);
            if (
              /^\d{1,3}$/.test(nextValue) &&
              Number.isFinite(nextSize) &&
              nextSize >= MIN_EDITOR_FONT_SIZE_PX &&
              nextSize <= MAX_EDITOR_FONT_SIZE_PX
            ) {
              onFontSizeChange(nextSize);
            }
          }}
          onFocus={() => setIsSizeMenuOpen(false)}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIsSizeMenuOpen(true);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              onCommit();
              event.currentTarget.blur();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onDraftChange(String(currentFontSize));
              closeSizeMenu();
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="editor-font-size-menu-button"
          aria-label="Open font size menu"
          aria-haspopup="listbox"
          aria-expanded={isSizeMenuOpen ? "true" : "false"}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={() => setIsSizeMenuOpen((value) => !value)}
        >
          ⌄
        </button>
        <FloatingDropdownMenu
          anchorRef={sizeMenuAnchorRef}
          ariaLabel="Editor font size presets"
          className="editor-font-size-menu"
          isOpen={isSizeMenuOpen}
          align="end"
          maxHeight={196}
          maxWidth={104}
          minWidth={76}
          onRequestClose={closeSizeMenu}
          preferredWidth={86}
        >
          {EDITOR_FONT_SIZE_PRESETS.map((fontSize) => (
            <DropdownMenuOption
              key={fontSize}
              className="editor-font-size-option"
              selected={currentFontSize === fontSize}
              onClick={() => applyFontSize(fontSize)}
            >
              {fontSize}
            </DropdownMenuOption>
          ))}
        </FloatingDropdownMenu>
      </div>
    </div>
  );
}
