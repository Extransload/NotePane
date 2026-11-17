import {
  Plus,
  X,
} from "lucide-react";
import {
  useCallback,
  useRef,
  useState,
} from "react";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  formatKeyboardShortcutLabel,
} from "../model/keyboardShortcuts.js";
import {
  BUILTIN_BACKGROUNDS,
  DEFAULT_LOOK,
  LOOK_ACCENTS,
  SURFACE_MATERIALS,
  applySurfaceStyle,
  getSurfaceStyle,
} from "../model/look.js";
import {
  normalizeEditorFontFamily,
  normalizeEditorPreferences,
} from "../model/preferences.js";
import {
  isHexColor,
} from "../style/colorMath.js";
import {
  EditorFontFamilyControl,
} from "./EditorFontControls.jsx";
import {
  ColorInput,
  PositionGrid,
  Segmented,
  SettingRow,
  SettingsGroup,
  Slider,
  Switch,
  SwatchPicker,
} from "./settingsControls.jsx";
import {
  ThemePicker,
} from "./ThemePicker.jsx";

// The Look pages of Settings: Theme, Fonts, Background, Surfaces and Tabs. Each page draws only
// its groups; the window draws the page title. `look` arrives normalized, and every change hands
// a whole new look to `onLookChange`, leaving the old object untouched.

const formatPx = (value) => `${value}px`;
const formatPercent = (value) => `${value}%`;
const formatDegrees = (value) => `${value}°`;
const formatLineHeight = (value) => value.toFixed(2);
const formatEm = (value) => `${value.toFixed(2)}em`;

const DEFAULT_PICTURE = BUILTIN_BACKGROUNDS[0]?.id ?? DEFAULT_LOOK.background.picture;
const MAX_USER_PICTURES = 12;

// A custom colour starts from what the user sees now: the theme's value of the token when it
// resolves to a plain #rrggbb, else the given fallback.
function readThemeColor(element, token, fallback) {
  if (!element) {
    return fallback;
  }
  const value = getComputedStyle(element).getPropertyValue(token).trim().toLowerCase();
  return isHexColor(value) ? value : fallback;
}

function cssUrl(url) {
  return `url(${JSON.stringify(url)})`;
}

// One section of the look (fonts, background, tabs): a setter that merges a patch into it and
// the changed/onReset props of a row covering some of its keys.
function useLookSection(look, onLookChange, section) {
  const set = useCallback(
    (patch) => onLookChange({ ...look, [section]: { ...look[section], ...patch } }),
    [look, onLookChange, section],
  );
  const reset = (...keys) => ({
    changed: keys.some((key) => look[section][key] !== DEFAULT_LOOK[section][key]),
    onReset: () =>
      set(Object.fromEntries(keys.map((key) => [key, DEFAULT_LOOK[section][key]]))),
  });
  return [look[section], set, reset];
}

const ACCENT_OPTIONS = Object.entries(LOOK_ACCENTS).map(([name, color]) => ({
  value: color,
  label: name.charAt(0).toUpperCase() + name.slice(1),
  color,
}));

const CORNER_OPTIONS = [
  { value: "sharp", label: "Sharp" },
  { value: "default", label: "Default" },
  { value: "round", label: "Round" },
];

export function ThemeLookPage({
  look,
  onLookChange,
  appThemeId,
  themes,
  onAppThemeChange,
  launchIntro,
  onLaunchIntroChange,
}) {
  const pageRef = useRef(null);
  const setLook = (patch) => onLookChange({ ...look, ...patch });
  const isCustomAccent =
    look.accentColor != null && !ACCENT_OPTIONS.some((option) => option.value === look.accentColor);

  return (
    <div ref={pageRef} className="look-page">
      <SettingsGroup label="Theme">
        <SettingRow
          id="appTheme"
          title="App theme"
          description="Applies to every window. The theme sets light or dark."
          wide
          className="app-theme-setting"
        >
          <ThemePicker themeId={appThemeId} themes={themes} onChange={onAppThemeChange} />
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup label="Accent and shape">
        <SettingRow
          id="accentColor"
          title="Accent color"
          description="Buttons, switches, focus rings and selection."
          changed={look.accentColor !== DEFAULT_LOOK.accentColor}
          onReset={() => setLook({ accentColor: DEFAULT_LOOK.accentColor })}
        >
          <SwatchPicker
            label="Accent color"
            value={look.accentColor}
            options={ACCENT_OPTIONS}
            allowNone
            noneLabel="Theme accent"
            allowCustom
            customFallback={readThemeColor(
              pageRef.current,
              "--notepane-control-accent",
              LOOK_ACCENTS.blue,
            )}
            onChange={(accentColor) => setLook({ accentColor })}
          />
        </SettingRow>
        {isCustomAccent && (
          <SettingRow id="accentCustomColor" title="Custom accent">
            <ColorInput
              label="Custom accent"
              value={look.accentColor}
              onChange={(accentColor) => setLook({ accentColor })}
            />
          </SettingRow>
        )}
        <SettingRow
          id="corners"
          title="Corners"
          description="Windows, menus, cards and buttons."
          changed={look.corners !== DEFAULT_LOOK.corners}
          onReset={() => setLook({ corners: DEFAULT_LOOK.corners })}
        >
          <Segmented
            label="Corners"
            value={look.corners}
            options={CORNER_OPTIONS}
            onChange={(corners) => setLook({ corners })}
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup label="Launch">
        <SettingRow
          id="launchIntro"
          title="Show intro on launch"
          description="The NotePane mark plays in as the app opens. Any key or click skips it."
          changed={launchIntro !== true}
          onReset={() => onLaunchIntroChange(true)}
        >
          <Switch label="Show intro on launch" checked={launchIntro} onChange={onLaunchIntroChange} />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}

const HEADING_FONT_OPTIONS = [
  { value: "same", label: "Same as text" },
  { value: "serif", label: "Serif" },
  { value: "display", label: "Display" },
  { value: "rounded", label: "Rounded" },
];

const HEADING_WEIGHT_OPTIONS = [
  { value: 600, label: "Semibold" },
  { value: 700, label: "Bold" },
  { value: 800, label: "Heavy" },
];

const CODE_FONT_OPTIONS = [
  { value: "system", label: "System" },
  { value: "menlo", label: "Menlo" },
  { value: "jetbrains", label: "JetBrains Mono" },
  { value: "courier", label: "Courier" },
];

export function FontsLookPage({
  look,
  onLookChange,
  editorPreferences,
  fontOptions,
  appFontOptions,
  onEditorPreferencesChange,
  onAppFontFamilyChange,
}) {
  const normalizedEditorPreferences = normalizeEditorPreferences(editorPreferences);
  const [fonts, setFonts, resetFonts] = useLookSection(look, onLookChange, "fonts");
  const { keyboardShortcuts } = normalizedEditorPreferences;

  const updateEditorFontFamily = useCallback(
    (nextEditorFontFamily) => {
      onEditorPreferencesChange?.({
        ...normalizedEditorPreferences,
        editorFontFamily: normalizeEditorFontFamily(nextEditorFontFamily),
      });
    },
    [normalizedEditorPreferences, onEditorPreferencesChange],
  );

  return (
    <div className="look-page">
      <SettingsGroup label="Preview">
        {/* look.css types this sample from the same variables as the editor. */}
        <div className="look-font-preview" aria-label="Font preview">
          <h3>Launch checklist</h3>
          <p>
            The quick brown fox jumps over the lazy dog. 다람쥐 헌 쳇바퀴에 타고파. 0123456789
          </p>
          <pre>{'const pane = { mode: "sticky" } // => != ==='}</pre>
        </div>
      </SettingsGroup>
      <SettingsGroup
        label="Fonts"
        note={`Fonts apply to every session tab. Zoom the app with ${formatKeyboardShortcutLabel(
          keyboardShortcuts.zoomIn,
        )} and ${formatKeyboardShortcutLabel(keyboardShortcuts.zoomOut)}.`}
      >
        <SettingRow
          id="editorFontFamily"
          title="Editor font"
          description="Default typeface for note text."
          className="editor-font-family-setting"
        >
          <EditorFontFamilyControl
            className="preferences-font-family-control"
            fontFamily={normalizedEditorPreferences.editorFontFamily}
            fontOptions={fontOptions}
            onFontFamilyChange={updateEditorFontFamily}
          />
        </SettingRow>
        <SettingRow
          id="appFontFamily"
          title="App font"
          description="Interface typeface for chrome, menus, and preferences."
          className="app-font-family-setting"
        >
          <EditorFontFamilyControl
            className="preferences-font-family-control"
            fontFamily={normalizedEditorPreferences.appFontFamily}
            fontOptions={appFontOptions}
            inputAriaLabel="App font family"
            menuButtonAriaLabel="Open app font menu"
            optionsAriaLabel="App font family options"
            onFontFamilyChange={onAppFontFamilyChange}
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup label="Editor text">
        <SettingRow id="editorSize" title="Size" {...resetFonts("editorSize")}>
          <Slider
            label="Text size"
            value={fonts.editorSize}
            min={12}
            max={24}
            step={1}
            format={formatPx}
            onChange={(editorSize) => setFonts({ editorSize })}
          />
        </SettingRow>
        <SettingRow id="lineHeight" title="Line height" {...resetFonts("lineHeight")}>
          <Slider
            label="Line height"
            value={fonts.lineHeight}
            min={1.2}
            max={2.2}
            step={0.05}
            format={formatLineHeight}
            onChange={(lineHeight) => setFonts({ lineHeight })}
          />
        </SettingRow>
        <SettingRow id="letterSpacing" title="Letter spacing" {...resetFonts("letterSpacing")}>
          <Slider
            label="Letter spacing"
            value={fonts.letterSpacing}
            min={-0.03}
            max={0.08}
            step={0.01}
            format={formatEm}
            onChange={(letterSpacing) => setFonts({ letterSpacing })}
          />
        </SettingRow>
        <SettingRow
          id="blockSpacing"
          title="Space between blocks"
          description="Extra room between paragraphs, headings and lists."
          {...resetFonts("blockSpacing")}
        >
          <Slider
            label="Space between blocks"
            value={fonts.blockSpacing}
            min={0}
            max={24}
            step={1}
            format={formatPx}
            onChange={(blockSpacing) => setFonts({ blockSpacing })}
          />
        </SettingRow>
        <SettingRow
          id="textWidth"
          title="Text width"
          description="How wide the text runs in the reading layout."
          {...resetFonts("textWidth")}
        >
          <Slider
            label="Text width"
            value={fonts.textWidth}
            min={560}
            max={1100}
            step={20}
            format={formatPx}
            onChange={(textWidth) => setFonts({ textWidth })}
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup label="Headings">
        <SettingRow id="headingFont" title="Font" {...resetFonts("headingFont")}>
          <Segmented
            label="Heading font"
            value={fonts.headingFont}
            options={HEADING_FONT_OPTIONS}
            onChange={(headingFont) => setFonts({ headingFont })}
          />
        </SettingRow>
        <SettingRow id="headingWeight" title="Weight" {...resetFonts("headingWeight")}>
          <Segmented
            label="Heading weight"
            value={fonts.headingWeight}
            options={HEADING_WEIGHT_OPTIONS}
            onChange={(headingWeight) => setFonts({ headingWeight })}
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup label="Code">
        <SettingRow id="codeFont" title="Font" {...resetFonts("codeFont")}>
          <Segmented
            label="Code font"
            value={fonts.codeFont}
            options={CODE_FONT_OPTIONS}
            onChange={(codeFont) => setFonts({ codeFont })}
          />
        </SettingRow>
        <SettingRow id="codeSize" title="Size" {...resetFonts("codeSize")}>
          <Slider
            label="Code size"
            value={fonts.codeSize}
            min={11}
            max={20}
            step={1}
            format={formatPx}
            onChange={(codeSize) => setFonts({ codeSize })}
          />
        </SettingRow>
        <SettingRow
          id="codeLigatures"
          title="Ligatures"
          description="Draw => and != as single glyphs where the font has them."
          {...resetFonts("codeLigatures")}
        >
          <Switch
            label="Code ligatures"
            checked={fonts.codeLigatures}
            onChange={(codeLigatures) => setFonts({ codeLigatures })}
          />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}

const BACKGROUND_TYPE_OPTIONS = [
  { value: "none", label: "None" },
  { value: "color", label: "Color" },
  { value: "gradient", label: "Gradient" },
  { value: "picture", label: "Picture" },
];

const BACKGROUND_FIT_OPTIONS = [
  { value: "cover", label: "Fill" },
  { value: "contain", label: "Fit" },
  { value: "tile", label: "Tile" },
];

export function BackgroundLookPage({ look, onLookChange, onPickBackground }) {
  const [background, setBackground, resetBackground] = useLookSection(
    look,
    onLookChange,
    "background",
  );
  const [isPicking, setIsPicking] = useState(false);
  // The file dialog is open for as long as the user likes; the look it resolves into is the one
  // current then, not the one this render saw.
  const lookRef = useRef(look);
  lookRef.current = look;

  const addPicture = async () => {
    setIsPicking(true);
    try {
      const url = await onPickBackground();
      if (!url) {
        return;
      }
      const latest = lookRef.current;
      onLookChange({
        ...latest,
        background: {
          ...latest.background,
          type: "picture",
          picture: url,
          pictures: [url, ...latest.background.pictures.filter((entry) => entry !== url)].slice(
            0,
            MAX_USER_PICTURES,
          ),
        },
      });
    } finally {
      setIsPicking(false);
    }
  };

  const removePicture = (url) => {
    setBackground({
      picture: background.picture === url ? DEFAULT_PICTURE : background.picture,
      pictures: background.pictures.filter((entry) => entry !== url),
    });
  };

  const hasBackground = background.type !== "none";
  const surfaceStyle = getSurfaceStyle(look);
  const defaultSurfaceStyle = getSurfaceStyle(DEFAULT_LOOK);
  const setSurfaceStyle = (patch) => onLookChange(applySurfaceStyle(look, { ...surfaceStyle, ...patch }));
  const resetSurfaceStyle = (key) => ({
    changed: surfaceStyle[key] !== defaultSurfaceStyle[key],
    onReset: () => setSurfaceStyle({ [key]: defaultSurfaceStyle[key] }),
  });

  return (
    <div className="look-page">
      <SettingsGroup label="Background">
        <SettingRow
          id="backgroundType"
          title="Background"
          description="Shown behind every window."
          {...resetBackground("type")}
        >
          <Segmented
            label="Background"
            value={background.type}
            options={BACKGROUND_TYPE_OPTIONS}
            onChange={(type) => setBackground({ type })}
          />
        </SettingRow>
        {background.type === "color" && (
          <SettingRow id="backgroundColor" title="Color" {...resetBackground("color")}>
            <ColorInput
              label="Background color"
              value={background.color}
              onChange={(color) => setBackground({ color })}
            />
          </SettingRow>
        )}
        {background.type === "gradient" && (
          <>
            <SettingRow id="backgroundGradient" title="From" {...resetBackground("from")}>
              <ColorInput
                label="Gradient start color"
                value={background.from}
                onChange={(from) => setBackground({ from })}
              />
            </SettingRow>
            <SettingRow id="backgroundGradientTo" title="To" {...resetBackground("to")}>
              <ColorInput
                label="Gradient end color"
                value={background.to}
                onChange={(to) => setBackground({ to })}
              />
            </SettingRow>
            <SettingRow id="backgroundGradientAngle" title="Angle" {...resetBackground("angle")}>
              <Slider
                label="Gradient angle"
                value={background.angle}
                min={0}
                max={360}
                step={5}
                format={formatDegrees}
                onChange={(angle) => setBackground({ angle })}
              />
            </SettingRow>
          </>
        )}
        {background.type === "picture" && (
          <>
            <SettingRow
              id="backgroundPicture"
              title="Picture"
              description="Pictures you add stay on this Mac."
              wide
              {...resetBackground("picture")}
            >
              <div className="settings-picture-tiles">
                <div className="settings-picture-choices" role="radiogroup" aria-label="Picture">
                  {BUILTIN_BACKGROUNDS.map((builtin) => (
                    <button
                      key={builtin.id}
                      type="button"
                      role="radio"
                      aria-checked={background.picture === builtin.id ? "true" : "false"}
                      aria-label={builtin.label}
                      className="settings-picture-tile"
                      style={{ backgroundImage: cssUrl(builtin.thumb) }}
                      onMouseDown={preventFocusLoss}
                      onClick={() => setBackground({ picture: builtin.id })}
                    >
                      <span className="settings-picture-caption" aria-hidden="true">
                        {builtin.label}
                      </span>
                    </button>
                  ))}
                  {background.pictures.map((url, index) => (
                    <div key={url} className="settings-picture-tile-wrap">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={background.picture === url ? "true" : "false"}
                        aria-label={`Picture ${index + 1}`}
                        className="settings-picture-tile"
                        style={{ backgroundImage: cssUrl(url) }}
                        onMouseDown={preventFocusLoss}
                        onClick={() => setBackground({ picture: url })}
                      />
                      <button
                        type="button"
                        className="settings-picture-remove"
                        aria-label={`Remove picture ${index + 1}`}
                        title="Remove"
                        onMouseDown={preventFocusLoss}
                        onClick={() => removePicture(url)}
                      >
                        <X aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="settings-picture-tile is-add"
                  aria-label="Add picture"
                  title="Add a PNG, JPEG, WebP or GIF picture"
                  disabled={!onPickBackground || isPicking}
                  onMouseDown={preventFocusLoss}
                  onClick={() => void addPicture()}
                >
                  <Plus aria-hidden="true" />
                </button>
              </div>
            </SettingRow>
            <SettingRow id="backgroundFit" title="Fit" {...resetBackground("fit")}>
              <Segmented
                label="Picture fit"
                value={background.fit}
                options={BACKGROUND_FIT_OPTIONS}
                onChange={(fit) => setBackground({ fit })}
              />
            </SettingRow>
            <SettingRow
              id="backgroundPosition"
              title="Position"
              description="Which part stays in view when the window is a different shape."
              {...resetBackground("position")}
            >
              <PositionGrid
                label="Picture position"
                value={background.position}
                onChange={(position) => setBackground({ position })}
              />
            </SettingRow>
          </>
        )}
      </SettingsGroup>
      <SettingsGroup
        label="Window"
        note={hasBackground ? null : "These show once there is a background above."}
      >
        <SettingRow
          id="surfaceMaterial"
          title="Material"
          description="What the window is made of, over the background."
          {...resetSurfaceStyle("material")}
        >
          <Segmented
            label="Material"
            value={surfaceStyle.material}
            options={MATERIAL_OPTIONS}
            onChange={(material) => setSurfaceStyle({ material })}
          />
        </SettingRow>
        {surfaceStyle.material !== "solid" && (
          <SettingRow
            id="surfaceOpacity"
            title="Opacity"
            description="How much the window hides the background. Menus and popups stay at least 80%."
            {...resetSurfaceStyle("opacity")}
          >
            <Slider
              label="Window opacity"
              value={surfaceStyle.opacity}
              min={10}
              max={95}
              step={5}
              format={formatPercent}
              onChange={(opacity) => setSurfaceStyle({ opacity })}
            />
          </SettingRow>
        )}
        <SettingRow
          id="floatingMaterial"
          title="Menus and popups"
          description="Menus, the search palette and Settings float over your note. Frosted blurs the text under them."
          {...resetSurfaceStyle("floating")}
        >
          <Segmented
            label="Menus and popups"
            value={surfaceStyle.floating}
            options={MATERIAL_OPTIONS}
            onChange={(floating) => setSurfaceStyle({ floating })}
          />
        </SettingRow>
        <SettingRow
          id="surfaceBorder"
          title="Border"
          description="The line round the sidebar, title bar and menus."
          {...resetSurfaceStyle("border")}
        >
          <Segmented
            label="Border"
            value={surfaceStyle.border}
            options={BORDER_OPTIONS}
            onChange={(border) => setSurfaceStyle({ border })}
          />
        </SettingRow>
        <SettingRow
          id="readableText"
          title="Keep text readable"
          description="While the background shows through, text gets a soft halo of the window colour."
          changed={look.readableText !== DEFAULT_LOOK.readableText}
          onReset={() => onLookChange({ ...look, readableText: DEFAULT_LOOK.readableText })}
        >
          <Switch
            label="Keep text readable"
            checked={look.readableText}
            onChange={(readableText) => onLookChange({ ...look, readableText })}
          />
        </SettingRow>
      </SettingsGroup>
      {hasBackground && (
        <>
          <SettingsGroup label="Adjust">
            <SettingRow id="backgroundBlur" title="Blur" {...resetBackground("blur")}>
              <Slider
                label="Background blur"
                value={background.blur}
                min={0}
                max={64}
                step={1}
                format={formatPx}
                onChange={(blur) => setBackground({ blur })}
              />
            </SettingRow>
            <SettingRow
              id="backgroundBrightness"
              title="Brightness"
              {...resetBackground("brightness")}
            >
              <Slider
                label="Background brightness"
                value={background.brightness}
                min={40}
                max={160}
                step={1}
                format={formatPercent}
                onChange={(brightness) => setBackground({ brightness })}
              />
            </SettingRow>
            <SettingRow
              id="backgroundSaturation"
              title="Saturation"
              {...resetBackground("saturation")}
            >
              <Slider
                label="Background saturation"
                value={background.saturation}
                min={0}
                max={200}
                step={1}
                format={formatPercent}
                onChange={(saturation) => setBackground({ saturation })}
              />
            </SettingRow>
            <SettingRow
              id="backgroundTint"
              title="Tint"
              description="A colour laid over the background so text stays readable."
              {...resetBackground("tint", "tintAmount")}
            >
              <div className="settings-inline">
                <ColorInput
                  label="Tint color"
                  value={background.tint}
                  onChange={(tint) => setBackground({ tint })}
                />
                <Slider
                  label="Tint amount"
                  value={background.tintAmount}
                  min={0}
                  max={80}
                  step={1}
                  format={formatPercent}
                  onChange={(tintAmount) => setBackground({ tintAmount })}
                />
              </div>
            </SettingRow>
          </SettingsGroup>
          <SettingsGroup label="Where">
            <SettingRow
              id="backgroundBehindStickies"
              title="Behind sticky windows too"
              {...resetBackground("behindStickies")}
            >
              <Switch
                label="Behind sticky windows too"
                checked={background.behindStickies}
                onChange={(behindStickies) => setBackground({ behindStickies })}
              />
            </SettingRow>
            <SettingRow
              id="backgroundDimInDark"
              title="Dim in dark mode"
              description="Darkens the background by a third when the theme is dark."
              {...resetBackground("dimInDark")}
            >
              <Switch
                label="Dim in dark mode"
                checked={background.dimInDark}
                onChange={(dimInDark) => setBackground({ dimInDark })}
              />
            </SettingRow>
          </SettingsGroup>
        </>
      )}
    </div>
  );
}

const MATERIAL_LABELS = { solid: "Solid", frosted: "Frosted", clear: "Clear" };
const MATERIAL_OPTIONS = SURFACE_MATERIALS.map((value) => ({ value, label: MATERIAL_LABELS[value] }));

const BORDER_OPTIONS = [
  { value: "none", label: "None" },
  { value: "hairline", label: "Hairline" },
  { value: "strong", label: "Strong" },
];

const TAB_STYLE_OPTIONS = [
  { value: "plain", label: "Plain" },
  { value: "outline", label: "Outline" },
  { value: "filled", label: "Filled" },
];

const TAB_HEIGHT_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "regular", label: "Regular" },
  { value: "tall", label: "Tall" },
];

const NEW_TAB_COLOR_OPTIONS = [
  { value: "none", label: "None" },
  { value: "cycle", label: "In order" },
];

export function TabsLookPage({ look, onLookChange }) {
  const [tabs, setTabs, resetTabs] = useLookSection(look, onLookChange, "tabs");

  return (
    <div className="look-page">
      <SettingsGroup label="Shape">
        <SettingRow
          id="tabStyle"
          title="Style"
          description="How tabs without a colour of their own are told apart."
          {...resetTabs("style")}
        >
          <Segmented
            label="Tab style"
            value={tabs.style}
            options={TAB_STYLE_OPTIONS}
            onChange={(style) => setTabs({ style })}
          />
        </SettingRow>
        <SettingRow id="tabHeight" title="Height" {...resetTabs("height")}>
          <Segmented
            label="Tab height"
            value={tabs.height}
            options={TAB_HEIGHT_OPTIONS}
            onChange={(height) => setTabs({ height })}
          />
        </SettingRow>
        <SettingRow id="tabRadius" title="Corner radius" {...resetTabs("radius")}>
          <Slider
            label="Tab corner radius"
            value={tabs.radius}
            min={0}
            max={14}
            step={1}
            format={formatPx}
            onChange={(radius) => setTabs({ radius })}
          />
        </SettingRow>
        <SettingRow id="tabShowNumbers" title="Show numbers" {...resetTabs("showNumbers")}>
          <Switch
            label="Show tab numbers"
            checked={tabs.showNumbers}
            onChange={(showNumbers) => setTabs({ showNumbers })}
          />
        </SettingRow>
        <SettingRow
          id="tabShowShortcuts"
          title="Show shortcuts"
          description="The ⌘1 to ⌘9 shortcut beside each tab."
          {...resetTabs("showShortcuts")}
        >
          <Switch
            label="Show tab shortcuts"
            checked={tabs.showShortcuts}
            onChange={(showShortcuts) => setTabs({ showShortcuts })}
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsGroup label="Color">
        <SettingRow
          id="tabNewColor"
          title="New tab color"
          description="In order gives each new tab the next pastel. Right-click a tab to colour it."
          {...resetTabs("newTabColor")}
        >
          <Segmented
            label="New tab color"
            value={tabs.newTabColor}
            options={NEW_TAB_COLOR_OPTIONS}
            onChange={(newTabColor) => setTabs({ newTabColor })}
          />
        </SettingRow>
        <SettingRow
          id="tabColorStrength"
          title="Color strength"
          description="How strongly a coloured tab is filled."
          {...resetTabs("colorStrength")}
        >
          <Slider
            label="Tab color strength"
            value={tabs.colorStrength}
            min={20}
            max={100}
            step={1}
            format={formatPercent}
            onChange={(colorStrength) => setTabs({ colorStrength })}
          />
        </SettingRow>
      </SettingsGroup>
    </div>
  );
}
