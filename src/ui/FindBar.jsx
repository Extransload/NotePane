import { ChevronDown, ChevronUp, X } from "lucide-react";
import {
  useEffect,
  useRef,
} from "react";

export function FindBar({
  query,
  current,
  total,
  focusRequest,
  isFindShortcut,
  onQueryChange,
  onStep,
  onClose,
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  const handleKeyDown = (event) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onStep(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (isFindShortcut(event.nativeEvent)) {
      event.preventDefault();
      event.currentTarget.select();
    }
  };

  const hasNoMatch = query !== "" && total === 0;

  return (
    <div
      className="find-bar"
      role="search"
      aria-label="Find in note"
      onMouseDown={(event) => {
        event.stopPropagation();
        // Keep focus in the input when a button is clicked, so Enter, Shift+Enter
        // and Escape keep working afterwards.
        if (event.target instanceof Element && event.target.closest("button")) {
          event.preventDefault();
        }
      }}
    >
      <input
        ref={inputRef}
        className={hasNoMatch ? "find-bar-input has-no-match" : "find-bar-input"}
        aria-label="Find in note"
        placeholder="Find"
        spellCheck={false}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
      <span className="find-bar-count" aria-live="polite">{`${current} / ${total}`}</span>
      <button
        type="button"
        className="find-bar-button"
        aria-label="Previous match"
        disabled={total === 0}
        onClick={() => onStep(-1)}
      >
        <ChevronUp aria-hidden="true" size={15} />
      </button>
      <button
        type="button"
        className="find-bar-button"
        aria-label="Next match"
        disabled={total === 0}
        onClick={() => onStep(1)}
      >
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      <button
        type="button"
        className="find-bar-button"
        aria-label="Close find"
        onClick={onClose}
      >
        <X aria-hidden="true" size={15} />
      </button>
    </div>
  );
}
