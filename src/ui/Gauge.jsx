/**
 * Progress as a gauge, as TablePeek shows it: the box that is busy fills from the left behind its
 * contents, in the accent. With `progress` (0 to 1) the fill follows it; without, it creeps
 * toward 90%, quickly at first and ever slower, with a light running across it, for work whose
 * length is unknown (a restart). The host needs the `gauge-host` class (src/styles/chrome.css),
 * which positions it and clips the fill to its corners. Only transform and opacity move.
 */
export function Gauge({ progress = null }) {
  const determinate = typeof progress === "number" && Number.isFinite(progress);
  return (
    <span className={`gauge${determinate ? "" : " is-indeterminate"}`} aria-hidden="true">
      <span
        className="gauge-fill"
        style={determinate ? { "--gauge-progress": Math.min(Math.max(progress, 0), 1) } : undefined}
      />
    </span>
  );
}
