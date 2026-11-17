import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Folder,
  Hash,
} from "lucide-react";
import {
  usePresenceContext,
} from "../hooks/usePresence.js";
import {
  formatRelativeEditTime,
} from "../model/notes.js";
import {
  formatSearchQuery,
  normalizeSearchText,
  parseSearchQuery,
} from "../model/search.js";
import {
  resolveNoteMarkColor,
} from "../style/themeStyles.js";

function formatMatchCount(count) {
  return `${count} ${count === 1 ? "match" : "matches"}`;
}

function sameFolderName(left, right) {
  return normalizeSearchText(String(left ?? "").trim()) === normalizeSearchText(String(right ?? "").trim());
}

// A long tag list would push the title aside, so a row names a few and counts the rest.
const RESULT_TAG_LIMIT = 3;

function ResultPath({ note, folderById }) {
  const folder = note.folderId ? folderById.get(note.folderId) : null;
  const tags = Array.isArray(note.tags) ? note.tags : [];
  if (!folder && tags.length === 0) {
    return null;
  }
  const shownTags = tags.slice(0, RESULT_TAG_LIMIT);
  return (
    <span className="search-result-path">
      {folder && (
        <span className="search-result-folder">
          <Folder size={12} strokeWidth={1.9} aria-hidden="true" />
          {folder.name}
        </span>
      )}
      {tags.length > 0 && (
        <span className="search-result-tags">
          {shownTags.map((tag) => `#${tag}`).join(" ")}
          {tags.length > shownTags.length ? ` +${tags.length - shownTags.length}` : ""}
        </span>
      )}
    </span>
  );
}

function FilterChip({ pressed, icon, label, ariaLabel, onToggle }) {
  return (
    <button
      type="button"
      className="search-filter-chip"
      aria-label={ariaLabel}
      aria-pressed={pressed}
      // The query field keeps focus, so typing carries on after a chip is toggled.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
    >
      {icon}
      <span className="search-filter-chip-label">{label}</span>
    </button>
  );
}

// The palette's filters as chips. The query text is the one source of truth:
// each chip reads its state from the parsed query and a toggle writes a new
// query, so typed `#tag` and `folder:` tokens and the chips always agree.
function SearchFilterChips({ query, folders, tags, onQueryChange }) {
  const parsed = parseSearchQuery(query);
  const writeQuery = (changes) => onQueryChange(formatSearchQuery({ ...parsed, ...changes }));
  const toggleTag = (tag) => writeQuery({
    tags: parsed.tags.includes(tag) ? parsed.tags.filter((candidate) => candidate !== tag) : [...parsed.tags, tag],
  });
  return (
    <div className="search-palette-filters" role="group" aria-label="Search filters">
      <FilterChip
        pressed={parsed.folder === null}
        icon={<Folder size={12} strokeWidth={1.9} aria-hidden="true" />}
        label="All folders"
        onToggle={() => writeQuery({ folder: null })}
      />
      {folders.map((folder) => {
        const pressed = parsed.folder !== null && sameFolderName(parsed.folder, folder.name);
        return (
          <FilterChip
            key={folder.id}
            pressed={pressed}
            icon={<Folder size={12} strokeWidth={1.9} aria-hidden="true" />}
            label={folder.name}
            onToggle={() => writeQuery({ folder: pressed ? null : folder.name })}
          />
        );
      })}
      {tags.length > 0 && <span className="search-palette-filters-gap" aria-hidden="true" />}
      {tags.map((tag) => (
        <FilterChip
          key={tag}
          pressed={parsed.tags.includes(tag)}
          icon={<Hash size={12} strokeWidth={1.9} aria-hidden="true" />}
          label={tag}
          ariaLabel={`#${tag}`}
          onToggle={() => toggleTag(tag)}
        />
      ))}
    </div>
  );
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
  folders = [],
  tags = [],
  activeTheme,
  onQueryChange,
  onChoose,
  onClose,
}) {
  const inputRef = useRef(null);
  const noteMarkColor = (result) => resolveNoteMarkColor(result.note.theme, activeTheme);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { rootProps } = usePresenceContext();
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );

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
      {...rootProps}
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
        {(folders.length > 0 || tags.length > 0) && (
          <SearchFilterChips
            query={query}
            folders={folders}
            tags={tags}
            onQueryChange={onQueryChange}
          />
        )}
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
                  className={noteMarkColor(result) ? "search-result-dot" : "search-result-dot is-plain"}
                  aria-hidden="true"
                  style={{ background: noteMarkColor(result) ?? undefined }}
                />
                <span className="search-result-title">
                  <HighlightedText text={result.title} ranges={result.titleRanges} />
                </span>
                <span className="search-result-meta">
                  <ResultPath note={result.note} folderById={folderById} />
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
