import {
  useRef,
} from "react";
import {
  preventFocusLoss,
} from "../editor/images.js";

// The named colours a preview shows as dots.
const PREVIEW_DOT_COLOURS = ["red", "orange", "yellow", "green", "blue", "purple", "pink"];

function arrowKeyOffset(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return 0;
  }
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    return 1;
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    return -1;
  }
  return 0;
}

/**
 * Preferences > General > App theme: one card per theme, as a radio group. Each card previews
 * its theme with a small window painted in that theme's own palette, the one place that colours
 * with a theme other than the active one; the card around it takes the active theme's tokens.
 *
 * Arrow keys move to the next or previous card, wrapping at both ends, and select it. Only the
 * checked card is in the tab order, or the first one when the active theme is not listed. Like
 * the rest of Preferences, a click does not take focus from the editor.
 */
export function ThemePicker({ themeId, themes, onChange }) {
  const cardElements = useRef(new Map());
  const tabStopIndex = Math.max(themes.findIndex((theme) => theme.id === themeId), 0);

  const moveSelection = (fromIndex, offset) => {
    const nextTheme = themes[(fromIndex + offset + themes.length) % themes.length];
    cardElements.current.get(nextTheme.id)?.focus();
    onChange(nextTheme.id);
  };

  return (
    <div className="theme-picker" role="radiogroup" aria-label="App theme">
      {themes.map((theme, index) => (
        <button
          key={theme.id}
          ref={(element) => {
            if (element) {
              cardElements.current.set(theme.id, element);
            } else {
              cardElements.current.delete(theme.id);
            }
          }}
          type="button"
          className="theme-card"
          role="radio"
          aria-checked={theme.id === themeId}
          tabIndex={index === tabStopIndex ? 0 : -1}
          data-testid={`theme-card-${theme.id}`}
          onMouseDown={preventFocusLoss}
          onClick={() => {
            // The checked card is already the theme: choosing it again stores nothing.
            if (theme.id !== themeId) {
              onChange(theme.id);
            }
          }}
          onKeyDown={(event) => {
            const offset = arrowKeyOffset(event);
            if (offset !== 0 && !event.defaultPrevented) {
              event.preventDefault();
              moveSelection(index, offset);
            }
          }}
        >
          <ThemePreview palette={theme.palette} />
          <span className="theme-card-label">{theme.label}</span>
        </button>
      ))}
    </div>
  );
}

// A small window: sidebar, header, two lines of text and the named colours.
function ThemePreview({ palette }) {
  return (
    <span
      className="theme-card-preview"
      aria-hidden="true"
      style={{ background: palette.window, borderColor: palette.line }}
    >
      <span className="theme-card-preview-sidebar" style={{ background: palette.sidebar }} />
      <span className="theme-card-preview-main">
        <span className="theme-card-preview-header" style={{ background: palette.header }} />
        <span className="theme-card-preview-text" style={{ background: palette.text }} />
        <span className="theme-card-preview-text is-short" style={{ background: palette.muted }} />
        <span className="theme-card-preview-dots">
          {PREVIEW_DOT_COLOURS.map((name) => (
            <span key={name} className="theme-card-preview-dot" style={{ background: palette[name] }} />
          ))}
        </span>
      </span>
    </span>
  );
}
