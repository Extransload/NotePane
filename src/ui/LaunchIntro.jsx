import { useEffect, useRef, useState } from "react";
import notePaneIconSvg from "../../assets/notepane-icon.svg?raw";

// How long the intro stays once it has played in, then how long it takes to clear.
const HOLD_MS = 3000;
const LEAVE_MS = 420;

// The tile's outline, from the top centre round the rounded square: drawn round the three
// windows once they have gathered (see intro.css).
const TILE_OUTLINE_PATH =
  "M529 0H236C105.661 0 0 105.661 0 236V862C0 992.339 105.661 1098 236 1098H822C952.339 1098 1058 992.339 1058 862V236C1058 105.661 952.339 0 822 0H529Z";

/**
 * The intro played as NotePane opens: three windows fly in from round the screen and stack
 * into the mark, its box is drawn round them and filled, then the name is written out, over a
 * blur of the app. A click or any key clears it at once and still reaches the app, since the
 * intro takes no pointer events and leaves keys alone.
 */
export function LaunchIntro({ onDone }) {
  const [isLeaving, setIsLeaving] = useState(false);
  // The parent passes a fresh callback each render; the clearing timer keeps going.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const leave = window.setTimeout(() => setIsLeaving(true), HOLD_MS);
    const skip = () => setIsLeaving(true);
    window.addEventListener("pointerdown", skip, true);
    window.addEventListener("keydown", skip, true);
    return () => {
      window.clearTimeout(leave);
      window.removeEventListener("pointerdown", skip, true);
      window.removeEventListener("keydown", skip, true);
    };
  }, []);

  useEffect(() => {
    if (!isLeaving) {
      return undefined;
    }
    const done = window.setTimeout(() => onDoneRef.current(), LEAVE_MS);
    return () => window.clearTimeout(done);
  }, [isLeaving]);

  return (
    <div
      className={`launch-intro${isLeaving ? " is-leaving" : ""}`}
      data-testid="launch-intro"
      aria-hidden="true"
    >
      <div className="launch-intro-lockup">
        <div className="launch-intro-mark">
          <span
            className="launch-intro-icon"
            // The app icon itself, so its windows can move one by one.
            dangerouslySetInnerHTML={{ __html: notePaneIconSvg }}
          />
          <svg className="launch-intro-outline" viewBox="0 0 1058 1098" fill="none">
            <path pathLength="1" d={TILE_OUTLINE_PATH} />
          </svg>
        </div>
        <div className="launch-intro-name">
          Note<span className="launch-intro-name-pane">Pane</span>
        </div>
      </div>
    </div>
  );
}
