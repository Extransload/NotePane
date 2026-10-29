import {
  useCallback,
  useRef,
} from "react";
import {
  electronApi,
} from "../constants.js";
import {
  getNoteDisplayTitle,
  isTitleManuallyEdited,
  normalizeTitle,
} from "../model/notes.js";
import {
  normalizeTheme,
} from "../model/preferences.js";

const APPEARANCE_SAVE_DEBOUNCE_MS = 160;

/**
 * Debounced appearance writes (title and colours): one queue for the note this window shows, and
 * one per session tab recoloured from the sidebar, so recolouring several tabs in quick succession
 * writes each of them. The pending payloads and timers are returned for `usePendingSaveFlush`;
 * the session ones are Maps keyed by note id.
 */
export function useNoteAppearance(noteId) {
  const appearanceTimerRef = useRef(null);
  const sessionAppearanceTimerRef = useRef(new Map());
  // Payloads waiting on the appearance debounce, sent on unmount instead of dropped.
  const pendingAppearanceRef = useRef(null);
  const pendingSessionAppearanceRef = useRef(new Map());

  const scheduleAppearanceSave = useCallback(
    (nextTitle, nextTheme, options = {}) => {
      if (!electronApi) {
        return;
      }

      if (appearanceTimerRef.current) {
        window.clearTimeout(appearanceTimerRef.current);
      }

      const payload = {
        noteId,
        title: normalizeTitle(nextTitle),
        theme: normalizeTheme(nextTheme),
      };
      if (Object.hasOwn(options, "titleManuallyEdited")) {
        payload.titleManuallyEdited = Boolean(options.titleManuallyEdited);
      }
      pendingAppearanceRef.current = payload;
      appearanceTimerRef.current = window.setTimeout(() => {
        appearanceTimerRef.current = null;
        pendingAppearanceRef.current = null;
        void electronApi.updateAppearance(payload);
      }, APPEARANCE_SAVE_DEBOUNCE_MS);
    },
    [noteId],
  );

  const scheduleSessionAppearanceSave = useCallback((sessionNote, nextTheme) => {
    if (!electronApi || !sessionNote?.id) {
      return;
    }

    const timers = sessionAppearanceTimerRef.current;
    const pendingPayloads = pendingSessionAppearanceRef.current;
    window.clearTimeout(timers.get(sessionNote.id));

    const payload = {
      noteId: sessionNote.id,
      title: getNoteDisplayTitle(sessionNote),
      titleManuallyEdited: isTitleManuallyEdited(sessionNote),
      theme: normalizeTheme(nextTheme),
    };
    pendingPayloads.set(sessionNote.id, payload);
    timers.set(sessionNote.id, window.setTimeout(() => {
      timers.delete(sessionNote.id);
      pendingPayloads.delete(sessionNote.id);
      void electronApi.updateAppearance(payload);
    }, APPEARANCE_SAVE_DEBOUNCE_MS));
  }, []);

  return {
    appearanceTimerRef,
    pendingAppearanceRef,
    pendingSessionAppearanceRef,
    scheduleAppearanceSave,
    scheduleSessionAppearanceSave,
    sessionAppearanceTimerRef,
  };
}
