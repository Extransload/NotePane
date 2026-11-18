import { useCallback, useState } from "react";
import { electronApi } from "../constants.js";

// The answer, asked once per page: React may call a state initialiser twice, and the main process
// answers yes only once.
let launchIntroAnswer;

function takeLaunchIntro() {
  if (launchIntroAnswer === undefined) {
    let answer = false;
    try {
      answer =
        Boolean(electronApi?.takeLaunchIntro) &&
        !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches &&
        electronApi.takeLaunchIntro() === true;
    } catch {
      // Without an answer the app opens without the intro.
    }
    launchIntroAnswer = answer;
  }
  return launchIntroAnswer;
}

/**
 * Whether this window opens with the launch intro. The main process answers yes once per
 * launch, to the first window that asks, when Settings > Appearance > Show intro on launch is
 * on and the app opens in Tabs mode, so a sticky window, a new window or a reload never plays
 * it. The answer is synchronous, so the intro is in the app's very first frame and nothing of the
 * app shows before it. The browser preview has no launch and never plays it. Reduced motion skips
 * it without asking.
 */
export function useLaunchIntro() {
  const [isLaunchIntroVisible, setIsLaunchIntroVisible] = useState(takeLaunchIntro);
  const finishLaunchIntro = useCallback(() => setIsLaunchIntroVisible(false), []);
  return { isLaunchIntroVisible, finishLaunchIntro };
}
