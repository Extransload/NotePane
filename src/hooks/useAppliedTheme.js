import {
  useLayoutEffect,
} from "react";
import {
  setActiveCodeTheme,
} from "../editor/codeHighlighter.js";
import {
  applyThemeToDocument,
} from "../style/applyTheme.js";
import {
  getTheme,
} from "../style/themes.js";

/**
 * Resolves `themeId` (an unknown id gives NotePane Light) and applies that theme's tokens to
 * the document before the browser paints, and its code theme to the window's code blocks. The
 * tokens stay applied when the component unmounts: the next theme replaces them, and removing
 * them would flash unstyled colours.
 */
export function useAppliedTheme(themeId) {
  const theme = getTheme(themeId);

  useLayoutEffect(() => {
    applyThemeToDocument(theme);
    setActiveCodeTheme(theme.codeTheme);
  }, [theme]);

  return theme;
}
