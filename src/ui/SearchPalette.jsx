import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  formatRelativeEditTime,
} from "../model/notes.js";
import {
  resolveNoteMarkColor,
} from "../style/themeStyles.js";

function formatMatchCount(count) {
  return `${count} ${count === 1 ? "match" : "matches"}`;
}

function HighlightedText({ text, ranges }) {
  const parts = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      parts.push(<span key={`text-${index}`}>{text.slice(cursor, range.start)}</span>);
    }
    parts.push(<mark key={`match-${index}`}>{text.slice(range.start, range.end)}</mark>);
    cursor = range.end;
  });
  if (cursor < text.length) {
    parts.push(<span key="text-end">{text.slice(cursor)}</span>);
  }
  return parts;
}

export function SearchPalette({
  query,
  results,
  activeTheme,
  noteIndexById,
  onQueryChange,
  onChoose,
  onClose,
}) {
  const inputRef = useRef(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Results can shrink while the palette is open, for example when the stored
  // notes arrive, so the selection is clamped to the current list.
  const activeIndex = Math.max(0, Math.min(selectedIndex, results.length - 1));

  const moveSelection = (delta) => {
    if (results.length === 0) {
      return;
    }
    setSelectedIndex((activeIndex + delta + results.length) % results.length);
  };

  const handleKeyDown = (event) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSelection(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const result = results[activeIndex];
      if (result) {
        onChoose(result);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const activeResult = results[activeIndex];
  const activeResultId = activeResult?.note.id;

  // The list scrolls once it reaches the palette's height; the keyboard selection stays in view.
  useEffect(() => {
    if (activeResultId) {
      document.getElementById(`search-result-${activeResultId}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeResultId]);

  return (
    <div
      className="search-palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="search-palette" role="dialog" aria-modal="true" aria-label="Search notes">
        <input
          ref={inputRef}
          className="search-palette-input"
          aria-label="Search notes"
          placeholder="Search notes"
          spellCheck={false}
          value={query}
          aria-controls="search-palette-results"
          aria-activedescendant={activeResult ? `search-result-${activeResult.note.id}` : undefined}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {results.length === 0 ? (
          <div className="search-palette-empty">No matching notes</div>
        ) : (
          <ul
            id="search-palette-results"
            className="search-palette-results"
            role="listbox"
            aria-label="Matching notes"
          >
            {results.map((result, index) => (
              <li
                key={result.note.id}
                id={`search-result-${result.note.id}`}
                role="option"
                aria-selected={index === activeIndex}
                className={index === activeIndex ? "search-result is-selected" : "search-result"}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChoose(result);
                }}
              >
                <span
                  className="search-result-dot"
                  aria-hidden="true"
                  style={{
                    background: resolveNoteMarkColor(
                      result.note.theme,
                      activeTheme,
                      noteIndexById.get(result.note.id),
                    ),
                  }}
                />
                <span className="search-result-title">
                  <HighlightedText text={result.title} ranges={result.titleRanges} />
                </span>
                <span className="search-result-meta">
                  {result.matchCount > 0 && (
                    <span className="search-result-count">
                      {formatMatchCount(result.matchCount)}
                    </span>
                  )}
                  {result.note.updatedAt > 0 && (
                    <time
                      className="search-result-time"
                      dateTime={new Date(result.note.updatedAt).toISOString()}
                      title={`Edited ${new Date(result.note.updatedAt).toLocaleString()}`}
                    >
                      {formatRelativeEditTime(result.note.updatedAt)}
                    </time>
                  )}
                </span>
                {result.snippet.text && (
                  <span className="search-result-snippet">
                    {result.snippet.clippedStart ? "…" : ""}
                    <HighlightedText text={result.snippet.text} ranges={result.snippet.ranges} />
                    {result.snippet.clippedEnd ? "…" : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
