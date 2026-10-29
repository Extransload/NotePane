import {
  Search,
} from "lucide-react";
import {
  useRef,
  useState,
} from "react";
import {
  preventFocusLoss,
} from "../editor/images.js";

// The named colours a preview shows as dots.
const PREVIEW_DOT_COLOURS = ["red", "orange", "yellow", "green", "blue", "purple", "pink"];

const SCHEME_FILTERS = [
  { id: "all", label: "All" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

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

function filterThemes(themes, scheme, query) {
  const normalizedQuery = query.trim().toLowerCase();
  return themes.filter((theme) =>
    (scheme === "all" || theme.scheme === scheme) &&
    (!normalizedQuery || theme.label.toLowerCase().includes(normalizedQuery)));
}

/**
 * Preferences > General > App theme: one card per theme, as a radio group. Each card previews
 * its theme with a small window painted in that theme's own palette, the one place that colours
 * with a theme other than the active one; the card around it takes the active theme's tokens.
 *
 * Chips above the grid keep all, light or dark themes, and a field keeps the themes whose name
 * holds its text. Arrow keys move to the next or previous visible card, wrapping at both ends,
 * and select it. Only the checked card is in the tab order, or the first visible one when the
 * checked theme is filtered out. Like the rest of Preferences, a click does not take focus from
 * the editor.
 */
export function ThemePicker({ themeId, themes, onChange }) {
  const cardElements = useRef(new Map());
  const [scheme, setScheme] = useState("all");
  const [query, setQuery] = useState("");
  const visibleThemes = filterThemes(themes, scheme, query);
  const tabStopIndex = Math.max(visibleThemes.findIndex((theme) => theme.id === themeId), 0);

  const moveSelection = (fromIndex, offset) => {
    const nextTheme =
      visibleThemes[(fromIndex + offset + visibleThemes.length) % visibleThemes.length];
    cardElements.current.get(nextTheme.id)?.focus();
    onChange(nextTheme.id);
  };

  return (
    <div className="theme-picker-block">
      <div className="theme-picker-filters">
        <div className="theme-filter-chips" role="group" aria-label="Theme scheme">
          {SCHEME_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className="theme-filter-chip"
              aria-pressed={scheme === filter.id}
              onMouseDown={preventFocusLoss}
              onClick={() => setScheme(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="theme-filter-search">
          <Search aria-hidden="true" size={13} strokeWidth={2} />
          <input
            type="search"
            aria-label="Filter themes"
            placeholder="Filter themes"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className="theme-picker" role="radiogroup" aria-label="App theme">
        {visibleThemes.map((theme, index) => (
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
      {visibleThemes.length === 0 && (
        <div className="theme-picker-empty" role="status">
          No themes match.
        </div>
      )}
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
