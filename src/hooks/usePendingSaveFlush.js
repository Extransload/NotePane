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
 * the window or replacing the workspace, which skips the unmount. The result
 * tells main whether every write landed. The session appearance refs hold Maps
 * keyed by note id, one timer and one payload per recoloured session tab.
 */
export function usePendingSaveFlush({
  appearanceTimerRef,
  isEditorDirtyRef,
  pendingAppearanceRef,
  pendingSessionAppearanceRef,
  retrySaveNow,
  saveNow,
  saveRetryTimerRef,
  saveTimerRef,
  sessionAppearanceTimerRef,
}) {
  const saveNowRef = useRef(saveNow);
  const retrySaveNowRef = useRef(retrySaveNow);
  useEffect(() => {
    saveNowRef.current = saveNow;
    retrySaveNowRef.current = retrySaveNow;
  }, [retrySaveNow, saveNow]);

  const flushPendingSaves = useCallback(async () => {
    const writes = [];
    const hasPendingContentSave = Boolean(
      saveTimerRef.current || saveRetryTimerRef.current || isEditorDirtyRef.current,
    );
    if (hasPendingContentSave) {
      retrySaveNowRef.current();
      writes.push(saveNowRef.current());
    }
    if (appearanceTimerRef.current) {
      window.clearTimeout(appearanceTimerRef.current);
      appearanceTimerRef.current = null;
    }
    for (const timer of sessionAppearanceTimerRef.current.values()) {
      window.clearTimeout(timer);
    }
    sessionAppearanceTimerRef.current.clear();
    if (pendingAppearanceRef.current) {
      writes.push(electronApi?.updateAppearance(pendingAppearanceRef.current));
      pendingAppearanceRef.current = null;
    }
    for (const payload of pendingSessionAppearanceRef.current.values()) {
      writes.push(electronApi?.updateAppearance(payload));
    }
    pendingSessionAppearanceRef.current.clear();
    const results = await Promise.allSettled(writes);
    return { ok: results.every((result) => result.status === "fulfilled") };
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
