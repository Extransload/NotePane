import {
  clearFind,
  getFindState,
  revealCurrentFindMatch,
  selectCurrentFindMatch,
  setFindQuery,
  stepFind,
} from "../editor/findInNote.js";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/**
 * Find bar state. The query is applied from an effect, after the editor view
 * exists, so a find opened right after a note switch still finds its matches.
 * Collapsed toggles open only for a step or for a find opened with a query,
 * never while the query is typed.
 */
export function useFindInNote(editor) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState({ current: 0, total: 0 });
  const [focusRequest, setFocusRequest] = useState(0);
  const [applyRequest, setApplyRequest] = useState(0);
  const expandOnApplyRef = useRef(false);

  const refreshStatus = useCallback(() => {
    const { matches, index } = getFindState(editor);
    setStatus({ current: matches.length > 0 ? index + 1 : 0, total: matches.length });
  }, [editor]);

  useEffect(() => editor.onChange(refreshStatus), [editor, refreshStatus]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setFindQuery(editor, query);
    refreshStatus();
    revealCurrentFindMatch(editor, { expandToggles: expandOnApplyRef.current });
    expandOnApplyRef.current = false;
  }, [applyRequest, editor, isOpen, query, refreshStatus]);

  const openFind = useCallback((initialQuery) => {
    if (typeof initialQuery === "string") {
      setQuery(initialQuery);
      expandOnApplyRef.current = true;
    }
    setIsOpen(true);
    setFocusRequest((value) => value + 1);
    setApplyRequest((value) => value + 1);
  }, []);

  const step = useCallback((delta) => {
    stepFind(editor, delta);
    refreshStatus();
    revealCurrentFindMatch(editor);
  }, [editor, refreshStatus]);

  const closeFind = useCallback(() => {
    selectCurrentFindMatch(editor);
    clearFind(editor);
    setIsOpen(false);
    setQuery("");
    refreshStatus();
    editor.focus();
  }, [editor, refreshStatus]);

  return {
    isOpen,
    query,
    current: status.current,
    total: status.total,
    focusRequest,
    openFind,
    updateQuery: setQuery,
    step,
    closeFind,
  };
}
