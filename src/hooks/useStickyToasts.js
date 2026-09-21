import { useCallback, useEffect, useRef, useState } from "react";
import {
  EXPORT_TOAST_TIMEOUT_MS,
  FONT_SIZE_TOAST_TIMEOUT_MS,
} from "../constants.js";
import { editorFontScaleToSize } from "../model/preferences.js";

/**
 * Transient status messages shown over the editor: the export/save toast with
 * an optional action button, and the font-size readout shown while zooming.
 * Both auto-dismiss on their own timer and cancel it on unmount.
 */
export function useStickyToasts() {
  const [exportToast, setExportToast] = useState(null);
  const [editorFontSizeToast, setEditorFontSizeToast] = useState("");
  const exportToastTimerRef = useRef(null);
  const editorFontSizeToastTimerRef = useRef(null);

  const showExportToast = useCallback((message, tone = "success", options = {}) => {
    if (exportToastTimerRef.current) {
      window.clearTimeout(exportToastTimerRef.current);
      exportToastTimerRef.current = null;
    }

    const action =
      typeof options.onAction === "function" && options.actionLabel
        ? {
            label: options.actionLabel,
            onClick: options.onAction,
          }
        : null;

    setExportToast({ action, message, tone });

    const timeout = options.timeout ?? EXPORT_TOAST_TIMEOUT_MS;
    if (timeout > 0) {
      exportToastTimerRef.current = window.setTimeout(() => {
        setExportToast(null);
        exportToastTimerRef.current = null;
      }, timeout);
    }
  }, []);

  const hideExportToast = useCallback(() => {
    if (exportToastTimerRef.current) {
      window.clearTimeout(exportToastTimerRef.current);
      exportToastTimerRef.current = null;
    }
    setExportToast(null);
  }, []);

  const showEditorFontSizeToast = useCallback((nextEditorFontScale) => {
    if (editorFontSizeToastTimerRef.current) {
      window.clearTimeout(editorFontSizeToastTimerRef.current);
      editorFontSizeToastTimerRef.current = null;
    }

    setEditorFontSizeToast(
      `Font size ${editorFontScaleToSize(nextEditorFontScale)}px`,
    );

    editorFontSizeToastTimerRef.current = window.setTimeout(() => {
      setEditorFontSizeToast("");
      editorFontSizeToastTimerRef.current = null;
    }, FONT_SIZE_TOAST_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (exportToastTimerRef.current) {
        window.clearTimeout(exportToastTimerRef.current);
      }
      if (editorFontSizeToastTimerRef.current) {
        window.clearTimeout(editorFontSizeToastTimerRef.current);
      }
    };
  }, []);

  return {
    editorFontSizeToast,
    exportToast,
    hideExportToast,
    showEditorFontSizeToast,
    showExportToast,
  };
}
