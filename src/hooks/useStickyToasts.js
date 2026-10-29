import { useCallback, useEffect, useRef, useState } from "react";
import {
  EXPORT_TOAST_TIMEOUT_MS,
  ZOOM_GAUGE_TIMEOUT_MS,
} from "../constants.js";
import { useTimedToast } from "./useTimedToast.js";

/**
 * Transient status shown over the editor: the export/save toast with an
 * optional action button, and the zoom gauge shown while zooming the app.
 * Both auto-dismiss on their own timer and cancel it on unmount; the toast's
 * timer waits while `exportToastTimer.pause()` holds it (useTimedToast).
 */
export function useStickyToasts() {
  const {
    hide: hideExportToast,
    show: showTimedToast,
    timer: exportToastTimer,
    toast: exportToast,
  } = useTimedToast();
  const [zoomGauge, setZoomGauge] = useState(null);
  const zoomGaugeTimerRef = useRef(null);

  const showExportToast = useCallback((message, tone = "success", options = {}) => {
    const action =
      typeof options.onAction === "function" && options.actionLabel
        ? {
            label: options.actionLabel,
            onClick: options.onAction,
          }
        : null;

    showTimedToast({ action, message, tone }, options.timeout ?? EXPORT_TOAST_TIMEOUT_MS);
  }, [showTimedToast]);

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
      if (zoomGaugeTimerRef.current) {
        window.clearTimeout(zoomGaugeTimerRef.current);
      }
    };
  }, []);

  return {
    exportToast,
    exportToastTimer,
    hideExportToast,
    showExportToast,
    showZoomGauge,
    zoomGauge,
  };
}
