import { useCallback, useEffect, useRef, useState } from "react";
import {
  EXPORT_TOAST_TIMEOUT_MS,
  ZOOM_GAUGE_TIMEOUT_MS,
} from "../constants.js";

/**
 * Transient status shown over the editor: the export/save toast with an
 * optional action button, and the zoom gauge shown while zooming the app.
 * Both auto-dismiss on their own timer and cancel it on unmount.
 */
export function useStickyToasts() {
  const [exportToast, setExportToast] = useState(null);
  const [zoomGauge, setZoomGauge] = useState(null);
  const exportToastTimerRef = useRef(null);
  const zoomGaugeTimerRef = useRef(null);

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

  const showZoomGauge = useCallback((zoom) => {
    if (zoomGaugeTimerRef.current) {
      window.clearTimeout(zoomGaugeTimerRef.current);
      zoomGaugeTimerRef.current = null;
    }

    setZoomGauge(zoom);

    zoomGaugeTimerRef.current = window.setTimeout(() => {
      setZoomGauge(null);
      zoomGaugeTimerRef.current = null;
    }, ZOOM_GAUGE_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (exportToastTimerRef.current) {
        window.clearTimeout(exportToastTimerRef.current);
      }
      if (zoomGaugeTimerRef.current) {
        window.clearTimeout(zoomGaugeTimerRef.current);
      }
    };
  }, []);

  return {
    exportToast,
    hideExportToast,
    showExportToast,
    showZoomGauge,
    zoomGauge,
  };
}
