import { useEffect, useRef } from "react";
import { installSmoothCaret } from "../editor/smoothCaret.js";

// The smooth caret (src/editor/smoothCaret.js) in the editor surface while the Smooth caret
// preference is on. A preference change (editor font, app zoom) measures the caret again.
export function useSmoothCaret(editor, surfaceRef, editorPreferences) {
  const enabled = editorPreferences.smoothCaret;
  const controllerRef = useRef(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!enabled || !surface) {
      return undefined;
    }
    const controller = installSmoothCaret(editor, surface);
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.destroy();
    };
  }, [editor, enabled, surfaceRef]);

  useEffect(() => {
    controllerRef.current?.refresh();
  }, [editorPreferences]);
}
