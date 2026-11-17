import { useCallback, useEffect, useState } from "react";
import { electronApi } from "../constants.js";

/**
 * The Mac build's own update (electron/macSelfUpdate.cjs), as main reports it: `idle`,
 * `downloading`, `ready` (downloaded and checked, waiting for "Restart to update"),
 * `installing`, `error`, or `manual` (this copy cannot replace itself, so the release page
 * offers it). Elsewhere, and in the browser preview, the status is `off`.
 */
export function useAppUpdate() {
  const [update, setUpdate] = useState({ status: "off" });

  useEffect(() => {
    if (!electronApi?.getAppUpdateState) {
      return undefined;
    }
    let active = true;
    void electronApi.getAppUpdateState().then(
      (state) => {
        if (active && state) {
          setUpdate(state);
        }
      },
      () => {},
    );
    const unsubscribe = electronApi.onAppUpdateState?.((state) => setUpdate(state));
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const installUpdate = useCallback(() => {
    void electronApi?.installAppUpdate?.();
  }, []);

  const openRelease = useCallback(() => {
    if (update.version) {
      void electronApi?.openUpdateRelease?.(update.version);
    }
  }, [update.version]);

  return { update, installUpdate, openRelease };
}
