import { useEffect, useMemo, useRef, useState } from "react";
import notePaneIconSvg from "../../assets/notepane-icon.svg?raw";

// How long the intro stays once it starts playing, then how long it takes to clear.
const HOLD_MS = 3000;
const LEAVE_MS = 420;
// The window opens while the app is still mounting, and a busy main thread would stall the
// first frames. The veil shows at once; the motion waits for the first idle moment, at most this.
const START_TIMEOUT_MS = 500;

// The tile's outline, from the top centre round the rounded square: drawn round the three
// windows once they have gathered (see intro.css).
const TILE_OUTLINE_PATH =
  "M529 0H236C105.661 0 0 105.661 0 236V862C0 992.339 105.661 1098 236 1098H822C952.339 1098 1058 992.339 1058 862V236C1058 105.661 952.339 0 822 0H529Z";

const NAME = [..."Note"];
const NAME_PANE = [..."Pane"];

// The app icon cut into its parts, each a whole SVG of its own: the tile, the back, middle and
// front windows, and the three dots. Every part becomes its own layer, so the compositor moves
// it without repainting the icon's filters on each frame.
function splitIcon(svgText) {
  const root = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;
  const viewBox = root.getAttribute("viewBox");
  const defs = root.querySelector("defs")?.outerHTML ?? "";
  return [...root.children]
    .filter((node) => node.tagName !== "defs")
    .map((node) => `<svg viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg">${defs}${node.outerHTML}</svg>`);
}

const PART_NAMES = ["tile", "back", "middle", "front", "dot-1", "dot-2", "dot-3"];

// The box drawn round the windows: one half of the outline is revealed by a turning half-plane
// whose content turns back as much, so the outline stays put while a sweep uncovers it.
function OutlineSweep() {
  const outline = (
    <svg viewBox="0 0 1058 1098" fill="none" aria-hidden="true">
      <path d={TILE_OUTLINE_PATH} />
    </svg>
  );
  return (
    <div className="launch-intro-outline">
      <div className="launch-intro-outline-half is-right">
        <div className="launch-intro-outline-turn">
          <div className="launch-intro-outline-counter">{outline}</div>
        </div>
      </div>
      <div className="launch-intro-outline-half is-left">
        <div className="launch-intro-outline-turn">
          <div className="launch-intro-outline-counter">{outline}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * The intro played as NotePane opens: three windows fly in from round the screen and stack
 * into the mark, its box is drawn round them and filled, then the name is written out, over a
 * blur of the app. Every moving part animates only transform and opacity on a layer of its own,
 * so the motion stays smooth while the app mounts underneath. A click or any key clears it at
 * once and still reaches the app, since the intro takes no pointer events and leaves keys alone.
 */
export function LaunchIntro({ onDone }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const parts = useMemo(() => splitIcon(notePaneIconSvg), []);
  // The parent passes a fresh callback each render; the clearing timer keeps going.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    let frame = 0;
    const play = () => {
      // Two frames, so the waiting veil has been painted before the motion starts.
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => setIsPlaying(true));
      });
    };
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback(play, { timeout: START_TIMEOUT_MS })
      : window.setTimeout(play, START_TIMEOUT_MS);
    return () => {
      if (window.cancelIdleCallback) {
        window.cancelIdleCallback(idle);
      } else {
        window.clearTimeout(idle);
      }
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const skip = () => setIsLeaving(true);
    window.addEventListener("pointerdown", skip, true);
    window.addEventListener("keydown", skip, true);
    return () => {
      window.removeEventListener("pointerdown", skip, true);
      window.removeEventListener("keydown", skip, true);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }
    const leave = window.setTimeout(() => setIsLeaving(true), HOLD_MS);
    return () => window.clearTimeout(leave);
  }, [isPlaying]);

  useEffect(() => {
    if (!isLeaving) {
      return undefined;
    }
    const done = window.setTimeout(() => onDoneRef.current(), LEAVE_MS);
    return () => window.clearTimeout(done);
  }, [isLeaving]);

  return (
    <div
      className={`launch-intro${isPlaying ? " is-playing" : ""}${isLeaving ? " is-leaving" : ""}`}
      data-testid="launch-intro"
      aria-hidden="true"
    >
      <div className="launch-intro-lockup">
        <div className="launch-intro-mark">
          <div className="launch-intro-glow" />
          {parts.map((svg, index) => (
            <div
              key={PART_NAMES[index] ?? index}
              className={`launch-intro-part is-${PART_NAMES[index] ?? "extra"}`}
              // The app icon itself, one part per layer.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ))}
          <OutlineSweep />
        </div>
        <div className="launch-intro-name">
          {NAME.map((letter, index) => (
            <span key={`note-${index}`} className="launch-intro-letter" style={{ "--i": index }}>
              {letter}
            </span>
          ))}
          <span className="launch-intro-name-pane">
            {NAME_PANE.map((letter, index) => (
              <span
                key={`pane-${index}`}
                className="launch-intro-letter is-pane"
                style={{ "--i": NAME.length + index, "--j": index }}
                data-letter={letter}
              >
                {letter}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
