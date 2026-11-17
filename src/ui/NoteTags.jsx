import {
  Plus,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  MAX_TAGS_PER_NOTE,
  normalizeTag,
} from "../model/tags.js";

// Enough to pick from without the list covering the note.
const MAX_SUGGESTIONS = 8;

function isComposingKey(event) {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

/**
 * The tag chips above a note's first block. A chip opens the search palette
 * filtered to its tag; "+ Tag" turns into an input that suggests the tags other
 * notes use. Every change goes out through `onChange` as the whole normalised
 * list, so the caller stores one value.
 */
export function NoteTags({ tags, allTags = [], onChange, onOpenTag }) {
  const noteTags = Array.isArray(tags) ? tags : [];
  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const groupRef = useRef(null);
  const inputRef = useRef(null);
  const addButtonRef = useRef(null);
  // What should hold focus once the tags or the input change: a chip index, or "add".
  const pendingFocusRef = useRef(null);
  // Set once the input is closing, so a blur fired as it leaves the page does
  // not add text that Escape meant to throw away.
  const isClosingRef = useRef(false);
  const listboxId = useId();

  const typedTag = normalizeTag(draft);
  const suggestions = isAdding
    ? allTags
      .filter((tag) => !noteTags.includes(tag) && (!typedTag || tag.includes(typedTag)))
      .slice(0, MAX_SUGGESTIONS)
    : [];
  const canAddMore = noteTags.length < MAX_TAGS_PER_NOTE;

  useEffect(() => {
    if (isAdding) {
      inputRef.current?.focus();
    }
  }, [isAdding]);

  // Focus moves after the render that removed a chip or closed the input,
  // because the element it lands on may only exist then.
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (target === null || isAdding) {
      return;
    }
    pendingFocusRef.current = null;
    const chips = groupRef.current?.querySelectorAll(".note-tag-chip") ?? [];
    const element = typeof target === "number" ? chips[target] : null;
    (element ?? addButtonRef.current ?? chips[chips.length - 1])?.focus();
  }, [isAdding, noteTags]);

  const addTag = (value) => {
    const tag = normalizeTag(value);
    if (!tag || noteTags.includes(tag) || !canAddMore) {
      return false;
    }
    onChange([...noteTags, tag]);
    return true;
  };

  const removeTag = (tag, focusAfter) => {
    const index = noteTags.indexOf(tag);
    pendingFocusRef.current = focusAfter ? (index > 0 ? index - 1 : "add") : null;
    onChange(noteTags.filter((candidate) => candidate !== tag));
  };

  const closeInput = ({ returnFocus }) => {
    isClosingRef.current = true;
    setIsAdding(false);
    setDraft("");
    setActiveSuggestion(-1);
    pendingFocusRef.current = returnFocus ? "add" : null;
  };

  // Adds what was typed or picked and keeps the input open for the next tag,
  // unless the note has reached its limit.
  const commit = (value) => {
    const added = addTag(value);
    setDraft("");
    setActiveSuggestion(-1);
    if (added && noteTags.length + 1 >= MAX_TAGS_PER_NOTE) {
      closeInput({ returnFocus: false });
    }
  };

  const handleInputKeyDown = (event) => {
    if (isComposingKey(event)) {
      return;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length > 0) {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      // -1 is "no suggestion", so Enter adds what was typed.
      setActiveSuggestion((current) => {
        const next = current + step;
        if (next < -1) {
          return suggestions.length - 1;
        }
        return next >= suggestions.length ? -1 : next;
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const picked = suggestions[activeSuggestion];
      if (picked) {
        commit(picked);
      } else if (draft.trim()) {
        commit(draft);
      } else {
        closeInput({ returnFocus: true });
      }
      return;
    }
    if (event.key === ",") {
      event.preventDefault();
      if (draft.trim()) {
        commit(draft);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeInput({ returnFocus: true });
    }
  };

  const handleInputChange = (event) => {
    const value = event.target.value;
    // A pasted "a, b, c" adds every complete tag and leaves the last part to edit.
    if (value.includes(",")) {
      const parts = value.split(",");
      const rest = parts.pop();
      const next = [...noteTags];
      for (const part of parts) {
        const tag = normalizeTag(part);
        if (tag && !next.includes(tag) && next.length < MAX_TAGS_PER_NOTE) {
          next.push(tag);
        }
      }
      if (next.length !== noteTags.length) {
        onChange(next);
      }
      setDraft(rest.trimStart());
    } else {
      setDraft(value);
    }
    setActiveSuggestion(-1);
  };

  const handleChipKeyDown = (event, tag) => {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      removeTag(tag, true);
    }
  };

  const activeSuggestionId = activeSuggestion >= 0 ? `${listboxId}-option-${activeSuggestion}` : undefined;

  return (
    <div ref={groupRef} className="note-tags" role="group" aria-label="Note tags">
      {noteTags.map((tag) => (
        <span key={tag} className="note-tag">
          <button
            type="button"
            className="note-tag-chip"
            // The # is drawn in its own span for colour; the name reads as one word, "#guide".
            aria-label={`#${tag}`}
            onClick={() => onOpenTag?.(tag)}
            onKeyDown={(event) => handleChipKeyDown(event, tag)}
          >
            <span className="note-tag-hash">#</span>
            {tag}
          </button>
          <button
            type="button"
            className="note-tag-remove"
            aria-label={`Remove tag ${tag}`}
            // Backspace on the chip removes it from the keyboard, so this one stays out of the Tab order.
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => removeTag(tag, false)}
          >
            <X size={10} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </span>
      ))}
      {isAdding ? (
        <span className="note-tag-entry">
          <input
            ref={inputRef}
            className="note-tag-input"
            aria-label="New tag"
            placeholder="tag"
            spellCheck={false}
            autoComplete="off"
            value={draft}
            maxLength={64}
            aria-autocomplete="list"
            aria-controls={suggestions.length > 0 ? listboxId : undefined}
            aria-activedescendant={activeSuggestionId}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onBlur={() => {
              if (isClosingRef.current) {
                return;
              }
              if (draft.trim()) {
                addTag(draft);
              }
              closeInput({ returnFocus: false });
            }}
          />
          {suggestions.length > 0 && (
            <ul id={listboxId} className="note-tag-suggestions" role="listbox" aria-label="Tag suggestions">
              {suggestions.map((tag, index) => (
                <li
                  key={tag}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeSuggestion}
                  className={index === activeSuggestion ? "note-tag-suggestion is-active" : "note-tag-suggestion"}
                  onMouseEnter={() => setActiveSuggestion(index)}
                  // The input keeps focus, so its blur does not add the half-typed text first.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    commit(tag);
                  }}
                >
                  #{tag}
                </li>
              ))}
            </ul>
          )}
        </span>
      ) : canAddMore && (
        <button
          ref={addButtonRef}
          type="button"
          className="note-tag-add"
          aria-label="Add tag"
          onClick={() => {
            isClosingRef.current = false;
            setIsAdding(true);
          }}
        >
          <Plus size={12} strokeWidth={2} aria-hidden="true" />
          Tag
        </button>
      )}
    </div>
  );
}
