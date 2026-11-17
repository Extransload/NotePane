import {
  AppWindow,
  FileText,
  Layers,
  Minus,
  PanelLeft,
  Plus,
  Settings,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  BACKGROUND_POSITIONS,
  LOOK_AREAS,
} from "../model/look.js";
import {
  isHexColor,
} from "../style/colorMath.js";

// The building blocks of every Settings page: a labelled card of rows, each row a title and a
// muted description on the left and its control on the right. Like the rest of Preferences, a
// click on a button does not take focus from the editor behind the window.

export function SettingsGroup({ label, note, children }) {
  return (
    <section className="settings-group" aria-label={label}>
      {label && <h3 className="settings-group-label">{label}</h3>}
      <div className="settings-card">{children}</div>
      {note && <p className="settings-group-note">{note}</p>}
    </section>
  );
}

// `changed` marks a value that differs from its default with a dot and a Reset link, so a page
// shows at a glance what the user has touched. A `wide` row puts its control under the text, for
// controls that need the card's full width.
export function SettingRow({
  id,
  title,
  description,
  changed = false,
  onReset,
  wide = false,
  className = "",
  children,
}) {
  return (
    <div
      className={`settings-row${wide ? " is-wide" : ""} ${className}`.trim()}
      data-setting-id={id}
    >
      <div className="settings-row-text">
        <div className="settings-row-title">
          <span>{title}</span>
          {changed && (
            <>
              <span className="settings-row-changed-dot" aria-hidden="true" />
              {onReset && (
                <button
                  type="button"
                  className="settings-row-reset"
                  aria-label={`Reset ${title}`}
                  onMouseDown={preventFocusLoss}
                  onClick={onReset}
                >
                  Reset
                </button>
              )}
            </>
          )}
        </div>
        {description && <div className="settings-row-description">{description}</div>}
      </div>
      {children != null && <div className="settings-row-control">{children}</div>}
    </div>
  );
}

// Arrow keys move a radio group's choice the way native radio buttons do: only the checked
// choice is in the tab order, and moving selects. `columns` turns Up and Down into a row jump
// for a grid.
function radioArrowOffset(event, columns = 1) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return 0;
  }
  switch (event.key) {
    case "ArrowRight":
      return 1;
    case "ArrowLeft":
      return -1;
    case "ArrowDown":
      return columns;
    case "ArrowUp":
      return -columns;
    default:
      return 0;
  }
}

function useRadioKeys(values, value, onChange, columns = 1) {
  const buttons = useRef([]);
  const checkedIndex = values.findIndex((candidate) => candidate === value);
  const tabStopIndex = Math.max(checkedIndex, 0);

  const onKeyDown = (event, index) => {
    const offset = radioArrowOffset(event, columns);
    if (!offset) {
      return;
    }
    event.preventDefault();
    const nextIndex = (index + offset + values.length) % values.length;
    buttons.current[nextIndex]?.focus();
    onChange(values[nextIndex]);
  };

  const bind = (index) => ({
    ref: (element) => {
      buttons.current[index] = element;
    },
    tabIndex: index === tabStopIndex ? 0 : -1,
    onKeyDown: (event) => onKeyDown(event, index),
  });

  return bind;
}

export function Segmented({ label, value, options, onChange }) {
  const bindRadio = useRadioKeys(
    options.map((option) => option.value),
    value,
    onChange,
  );
  return (
    <div className="settings-segmented" role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={checked ? "true" : "false"}
            className={`settings-segment${checked ? " is-checked" : ""}`}
            onMouseDown={preventFocusLoss}
            onClick={() => onChange(option.value)}
            {...bindRadio(index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ label, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      className="settings-switch"
      aria-label={label}
      aria-checked={checked ? "true" : "false"}
      onMouseDown={preventFocusLoss}
      onClick={() => onChange(!checked)}
    />
  );
}

function decimalsOf(step) {
  const [, fraction = ""] = String(step).split(".");
  return fraction.length;
}

// A range with − and + buttons that move one step, for exact values the thumb is too coarse
// for, and the value as the user reads it. Steps are rounded to the step's decimals so 0.05
// steps never drift into 1.4500000000000002.
export function Slider({ label, value, min, max, step = 1, format = String, onChange }) {
  const decimals = decimalsOf(step);
  const clamp = (next) => Math.min(max, Math.max(min, Number(next.toFixed(decimals))));
  const formatted = format(value);

  return (
    <div className="settings-slider">
      <button
        type="button"
        className="settings-slider-step"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onMouseDown={preventFocusLoss}
        onClick={() => onChange(clamp(value - step))}
      >
        <Minus aria-hidden="true" />
      </button>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={formatted}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value)))}
      />
      <button
        type="button"
        className="settings-slider-step"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onMouseDown={preventFocusLoss}
        onClick={() => onChange(clamp(value + step))}
      >
        <Plus aria-hidden="true" />
      </button>
      <span className="settings-slider-value" aria-hidden="true">{formatted}</span>
    </div>
  );
}

function toHexDraft(text) {
  const trimmed = text.trim();
  return (trimmed.startsWith("#") ? trimmed : `#${trimmed}`).toLowerCase();
}

// The system colour well and the hex it holds. The hex can be typed; it applies as soon as it
// is a whole #rrggbb, and a half-typed value goes back to the stored colour on blur.
export function ColorInput({ label, value, onChange }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <div className="settings-color-input">
      <input
        type="color"
        className="settings-color-well"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value.toLowerCase())}
      />
      <input
        type="text"
        className="settings-color-hex"
        aria-label={`${label} hex`}
        spellCheck={false}
        maxLength={7}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          const next = toHexDraft(event.target.value);
          if (isHexColor(next)) {
            onChange(next);
          }
        }}
        onBlur={() => setDraft(value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Escape") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

// Round colour swatches. `allowNone` adds a first swatch for null (the theme's own colour);
// `allowCustom` adds a rainbow swatch over the system colour picker, checked whenever the value
// is a colour none of the options hold.
export function SwatchPicker({
  label,
  value,
  options,
  onChange,
  allowNone = false,
  noneLabel = "None",
  allowCustom = false,
  customFallback,
}) {
  const isCustom = value != null && !options.some((option) => option.value === value);
  const customValue = isHexColor(value) ? value : customFallback ?? options[0]?.color;

  return (
    <div className="settings-swatches" role="group" aria-label={label}>
      {allowNone && (
        <button
          type="button"
          className="settings-swatch is-none"
          aria-label={noneLabel}
          title={noneLabel}
          aria-pressed={value == null ? "true" : "false"}
          onMouseDown={preventFocusLoss}
          onClick={() => onChange(null)}
        />
      )}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="settings-swatch"
          aria-label={option.label}
          title={option.label}
          aria-pressed={option.value === value ? "true" : "false"}
          style={{ "--settings-swatch-color": option.color }}
          onMouseDown={preventFocusLoss}
          onClick={() => onChange(option.value)}
        />
      ))}
      {allowCustom && (
        <label
          className="settings-swatch is-custom"
          title="Custom"
          data-checked={isCustom ? "true" : "false"}
        >
          <input
            type="color"
            aria-label={`Custom ${label.toLowerCase()}`}
            value={customValue}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
          />
        </label>
      )}
    </div>
  );
}

const POSITION_LABELS = {
  "left top": "Top left",
  "center top": "Top",
  "right top": "Top right",
  "left center": "Left",
  center: "Center",
  "right center": "Right",
  "left bottom": "Bottom left",
  "center bottom": "Bottom",
  "right bottom": "Bottom right",
};

export function PositionGrid({ label, value, onChange }) {
  const bindRadio = useRadioKeys(BACKGROUND_POSITIONS, value, onChange, 3);
  return (
    <div className="settings-position-grid" role="radiogroup" aria-label={label}>
      {BACKGROUND_POSITIONS.map((position, index) => {
        const checked = position === value;
        const positionLabel = POSITION_LABELS[position] ?? position;
        return (
          <button
            key={position}
            type="button"
            role="radio"
            aria-checked={checked ? "true" : "false"}
            aria-label={positionLabel}
            title={positionLabel}
            onMouseDown={preventFocusLoss}
            onClick={() => onChange(position)}
            {...bindRadio(index)}
          />
        );
      })}
    </div>
  );
}

// The five areas a Look can paint, in LOOK_AREAS order, with the names the Surfaces page shows.
export const LOOK_AREA_OPTIONS = [
  { value: "sidebar", label: "Sidebar", Icon: PanelLeft },
  { value: "header", label: "Title bar", Icon: AppWindow },
  { value: "editor", label: "Editor", Icon: FileText },
  { value: "menus", label: "Menus", Icon: Layers },
  { value: "settings", label: "Settings", Icon: Settings },
].filter((option) => LOOK_AREAS.includes(option.value));

export function AreaPicker({ value, onChange }) {
  const bindRadio = useRadioKeys(
    LOOK_AREA_OPTIONS.map((option) => option.value),
    value,
    onChange,
  );
  return (
    <div className="settings-area-picker" role="radiogroup" aria-label="Area">
      {LOOK_AREA_OPTIONS.map(({ value: area, label, Icon }, index) => {
        const checked = area === value;
        return (
          <button
            key={area}
            type="button"
            role="radio"
            aria-checked={checked ? "true" : "false"}
            onMouseDown={preventFocusLoss}
            onClick={() => onChange(area)}
            {...bindRadio(index)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
