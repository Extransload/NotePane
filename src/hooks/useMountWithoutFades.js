import { useLayoutEffect } from "react";

// The fade the sidebar's labels and an opened folder's tabs come in with (src/styles/motion.css,
// src/styles/sidebar.css). It is meant for the sidebar opening and a folder expanding.
const MOUNT_FADE = "notepaneMenuFadeIn";

/**
 * StickyEditor remounts for each note, so every session switch would replay the fades its
 * sidebar and folders show as they appear, and the window would blink. Before the first paint,
 * those fades jump to their end; later ones, as the sidebar opens or a folder expands, still run.
 */
export function useMountWithoutFades(rootRef) {
  useLayoutEffect(() => {
    for (const animation of rootRef.current?.getAnimations({ subtree: true }) ?? []) {
      if (animation.animationName === MOUNT_FADE) {
        animation.finish();
      }
    }
  }, [rootRef]);
}
