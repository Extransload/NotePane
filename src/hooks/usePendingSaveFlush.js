import {
  electronApi,
} from "../constants.js";
import {
  useCallback,
  useEffect,
  useRef,
} from "react";

/**
 * Writes edits still waiting on a debounce or retry: the note content through
 * `saveNow`, and any queued appearance payloads. It runs when the editor
 * unmounts (switching notes) and when the main process asks before destroying
 * the window or replacing the workspace, which skips the unmount.
 */
export function usePendingSaveFlush({
  appearanceTimerRef,
  isEditorDirtyRef,
  pendingAppearanceRef,
  pendingSessionAppearanceRef,
  saveNow,
  saveRetryTimerRef,
  saveTimerRef,
  sessionAppearanceTimerRef,
}) {
  const saveNowRef = useRef(saveNow);
  useEffect(() => {
    saveNowRef.current = saveNow;
  }, [saveNow]);

  const flushPendingSaves = useCallback(() => {
    const writes = [];
    const hasPendingContentSave = Boolean(
      saveTimerRef.current || saveRetryTimerRef.current || isEditorDirtyRef.current,
    );
    if (saveRetryTimerRef.current) {
      window.clearTimeout(saveRetryTimerRef.current);
      saveRetryTimerRef.current = null;
    }
    if (hasPendingContentSave) {
      writes.push(saveNowRef.current());
    }
    for (const timerRef of [appearanceTimerRef, sessionAppearanceTimerRef]) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    for (const pendingRef of [pendingAppearanceRef, pendingSessionAppearanceRef]) {
      if (pendingRef.current) {
        writes.push(electronApi?.updateAppearance(pendingRef.current));
        pendingRef.current = null;
      }
    }
    return Promise.allSettled(writes);
  }, []);

  useEffect(() => electronApi?.onFlushRequested?.(flushPendingSaves), [flushPendingSaves]);

  // The editor remounts whenever the window switches notes. Flush whatever is
  // still waiting on a debounce or retry so the switch never drops edits.
  useEffect(() => {
    return () => {
      void flushPendingSaves();
    };
  }, [flushPendingSaves]);
}
