import { useCallback, useEffect, useState } from "react";
import { electronApi } from "../constants.js";

/**
 * Whether this window opens with the launch intro. The main process answers yes once per
 * launch, to the first window that asks, when Settings > Look > Theme > Show intro on launch is
 * on and the app opens in Tabs mode, so a sticky window, a new window or a reload never plays
 * it. The browser preview has no launch and never plays it. Reduced motion skips it without
 * asking, so the intro is still there for the next launch with motion.
 */
export function useLaunchIntro() {
  const [isLaunchIntroVisible, setIsLaunchIntroVisible] = useState(false);

  useEffect(() => {
    if (
      !electronApi?.takeLaunchIntro ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    void electronApi.takeLaunchIntro().then(
      (shouldPlay) => {
        if (shouldPlay) {
          setIsLaunchIntroVisible(true);
        }
      },
      () => {},
    );
  }, []);

  const finishLaunchIntro = useCallback(() => setIsLaunchIntroVisible(false), []);

  return { isLaunchIntroVisible, finishLaunchIntro };
}
