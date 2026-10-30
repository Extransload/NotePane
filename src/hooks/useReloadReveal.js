import { useEffect } from "react";

import { isEditorMotionAllowed } from "../editor/editorMotion.js";

// What the shell looked like when the page went away, for public/boot.js to paint from the next
// page's first frame. Session storage outlives a reload of the same window and starts empty in a
// new one, so only a reload starts from it.
const BOOT_PAINT_KEY = "notepane.bootPaint";
// The app shows even when no editor comes up, as when a note fails to open.
const REVEAL_FALLBACK_MS = 1500;

function rememberBootPaint() {
  const shell = document.querySelector(".sticky-shell");
  if (!shell) {
    return;
  }
  const style = getComputedStyle(shell);
  try {
    sessionStorage.setItem(
      BOOT_PAINT_KEY,
      JSON.stringify({
        background: style.backgroundColor,
        color: style.color,
        radius: style.borderTopLeftRadius,
      }),
    );
  } catch {
    // Without storage the next load starts as a new window does.
  }
}

function revealApp() {
  const root = document.documentElement;
  const app = document.getElementById("root");
  const finish = () => {
    delete root.dataset.boot;
  };
  if (!app || !isEditorMotionAllowed(app)) {
    finish();
    return;
  }
  root.dataset.boot = "revealing";
  if (!app.getAnimations().some((animation) => "animationName" in animation)) {
    finish();
    return;
  }
  const handleEnd = (event) => {
    if (event.target !== app) {
      return;
    }
    app.removeEventListener("animationend", handleEnd);
    app.removeEventListener("animationcancel", handleEnd);
    finish();
  };
  app.addEventListener("animationend", handleEnd);
  app.addEventListener("animationcancel", handleEnd);
}

/**
 * Keeps a reloading window's look. On its way out the page stores the shell's background, text
 * colour and corners; public/boot.js paints them from the next page's first frame, and index.html
 * keeps the app hidden over them. Once the note's editor is drawn, the app fades in over that paint
 * and the paint goes, so the window never shows through, never shows a half-built shell and never
 * changes colour on the way. A window that opens fresh shows as before.
 */
export function useReloadReveal(isNoteLoaded) {
  useEffect(() => {
    window.addEventListener("pagehide", rememberBootPaint);
    return () => window.removeEventListener("pagehide", rememberBootPaint);
  }, []);

  useEffect(() => {
    const app = document.getElementById("root");
    if (!isNoteLoaded || !app || document.documentElement.dataset.boot !== "reload") {
      return undefined;
    }
    let frame = 0;
    const editorShown = () => Boolean(app.querySelector(".bn-editor .bn-block-group"));
    const observer = new MutationObserver(() => {
      if (editorShown()) {
        observer.disconnect();
        revealAfterNextFrame();
      }
    });
    const timer = window.setTimeout(reveal, REVEAL_FALLBACK_MS);

    function stop() {
      observer.disconnect();
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    }
    function reveal() {
      stop();
      revealApp();
    }
    // Two frames on, so what the editor fills in around it, such as the tab titles, is drawn too.
    function revealAfterNextFrame() {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(reveal);
      });
    }

    if (editorShown()) {
      revealAfterNextFrame();
    } else {
      observer.observe(app, { childList: true, subtree: true });
    }
    return stop;
  }, [isNoteLoaded]);
}
