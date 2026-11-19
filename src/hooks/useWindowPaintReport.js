import { useEffect } from "react";

import { electronApi } from "../constants.js";

/**
 * Calls `onDrawn` two frames after the note's editor is in the page, so what the editor fills in
 * around it, such as the tab titles, is drawn too. Returns a function that stops waiting.
 */
export function afterEditorDrawn(onDrawn) {
  const app = document.getElementById("root");
  let frame = 0;
  const editorShown = () => Boolean(app?.querySelector(".bn-editor .bn-block-group"));
  const observer = new MutationObserver(() => {
    if (editorShown()) {
      observer.disconnect();
      drawTwoFrames();
    }
  });

  function drawTwoFrames() {
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(onDrawn);
    });
  }

  if (editorShown()) {
    drawTwoFrames();
  } else if (app) {
    observer.observe(app, { childList: true, subtree: true });
  }
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}

/**
 * Tells the main process when this window has drawn its note in a layout: once the note first
 * shows, and again after each layout change. A layout switch keeps the windows it opens hidden,
 * and the tabs window that turns into a sticky window out of sight, until they have said so
 * (electron/main.cjs), so no window shows blank or half drawn.
 */
export function useWindowPaintReport(layoutMode, isNoteLoaded) {
  useEffect(() => {
    if (!isNoteLoaded || !electronApi?.reportWindowPainted) {
      return undefined;
    }
    return afterEditorDrawn(() => electronApi.reportWindowPainted(layoutMode));
  }, [isNoteLoaded, layoutMode]);
}
