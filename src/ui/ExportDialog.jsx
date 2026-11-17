import {
  ClipboardCopy,
  FileCode,
  FileText,
  ImageDown,
  Printer,
  X,
} from "lucide-react";
import {
  useState,
} from "react";
import {
  preventFocusLoss,
} from "../editor/images.js";
import {
  usePresenceContext,
} from "../hooks/usePresence.js";
import {
  Segmented,
  SettingRow,
  SettingsGroup,
  Switch,
} from "./settingsControls.jsx";

export const EXPORT_FORMATS = [
  { value: "pdf", label: "PDF", description: "For printing and sharing.", Icon: Printer },
  { value: "md", label: "Markdown", description: "Plain text for other apps.", Icon: FileText },
  { value: "html", label: "HTML", description: "A web page in one file.", Icon: FileCode },
  { value: "png", label: "Image", description: "A PNG of the whole note.", Icon: ImageDown },
];

// PDF and image are drawn from the open note's window, so they export one note at a time.
const SINGLE_NOTE_FORMATS = new Set(["pdf", "png"]);

const ICON_PROPS = { size: 18, strokeWidth: 1.9, "aria-hidden": "true" };

export const DEFAULT_EXPORT_OPTIONS = {
  colors: "light",
  pageSize: "A4",
  images: "inline",
  frontMatter: true,
  scale: 2,
};

/**
 * Export, as a window like Settings: what to export (the open note, its folder, or every note),
 * the format, that format's options, and Copy as Markdown. `onExport({ scope, format, options })`
 * runs the export; the dialog closes itself through `onClose`.
 */
export function ExportDialog({
  noteTitle,
  folderName = null,
  folderNoteCount = 0,
  noteCount,
  onExport,
  onCopyMarkdown,
  onClose,
}) {
  const { rootProps } = usePresenceContext();
  const [scope, setScope] = useState("note");
  const [format, setFormat] = useState("pdf");
  const [options, setOptions] = useState(DEFAULT_EXPORT_OPTIONS);
  const setOption = (key) => (value) => setOptions((current) => ({ ...current, [key]: value }));
  const formatLabel = EXPORT_FORMATS.find((entry) => entry.value === format).label;

  const chooseScope = (nextScope) => {
    setScope(nextScope);
    if (nextScope !== "note" && SINGLE_NOTE_FORMATS.has(format)) {
      setFormat("md");
    }
  };

  const scopeOptions = [
    { value: "note", label: "This note" },
    ...(folderName ? [{ value: "folder", label: "Folder" }] : []),
    { value: "all", label: "All notes" },
  ];
  const scopeDescription = {
    note: "The open note.",
    folder: `${folderNoteCount} ${folderNoteCount === 1 ? "note" : "notes"} in ${folderName}, one file each.`,
    all: `${noteCount} ${noteCount === 1 ? "note" : "notes"}, one file each, folders kept as folders.`,
  }[scope];

  return (
    <div
      {...rootProps}
      className="export-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="export-dialog" role="dialog" aria-modal="true" aria-label="Export">
        <header className="export-dialog-header">
          <h2>Export</h2>
          <button
            type="button"
            className="export-dialog-close"
            aria-label="Close export"
            onMouseDown={preventFocusLoss}
            onClick={onClose}
          >
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </header>
        <div className="export-dialog-body">
          <SettingsGroup label="What">
            <SettingRow id="exportScope" title={scope === "note" ? noteTitle : scopeOptions.find((entry) => entry.value === scope).label} description={scopeDescription}>
              <Segmented label="Export what" value={scope} options={scopeOptions} onChange={chooseScope} />
            </SettingRow>
          </SettingsGroup>
          <SettingsGroup label="Format">
            <div className="export-formats" role="radiogroup" aria-label="Format">
              {EXPORT_FORMATS.map(({ value, label, description, Icon }) => {
                const disabled = scope !== "note" && SINGLE_NOTE_FORMATS.has(value);
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={format === value ? "true" : "false"}
                    aria-label={label}
                    className={`export-format${format === value ? " is-checked" : ""}`}
                    disabled={disabled}
                    title={disabled ? "Exports one note at a time" : undefined}
                    onMouseDown={preventFocusLoss}
                    onClick={() => setFormat(value)}
                  >
                    <Icon {...ICON_PROPS} />
                    <span className="export-format-label">{label}</span>
                    <small>{description}</small>
                  </button>
                );
              })}
            </div>
          </SettingsGroup>
          <SettingsGroup label="Options">
            {(format === "pdf" || format === "png") && (
              <SettingRow
                id="exportColors"
                title="Colors"
                description="Light prints well; the current theme keeps the look you see."
              >
                <Segmented
                  label="Colors"
                  value={options.colors}
                  options={[{ value: "light", label: "Light" }, { value: "theme", label: "Current theme" }]}
                  onChange={setOption("colors")}
                />
              </SettingRow>
            )}
            {format === "pdf" && (
              <SettingRow id="exportPageSize" title="Page size">
                <Segmented
                  label="Page size"
                  value={options.pageSize}
                  options={[{ value: "A4", label: "A4" }, { value: "Letter", label: "Letter" }]}
                  onChange={setOption("pageSize")}
                />
              </SettingRow>
            )}
            {format === "png" && (
              <SettingRow id="exportScale" title="Scale" description="2× stays sharp on Retina screens.">
                <Segmented
                  label="Scale"
                  value={options.scale}
                  options={[{ value: 1, label: "1×" }, { value: 2, label: "2×" }]}
                  onChange={setOption("scale")}
                />
              </SettingRow>
            )}
            {format === "md" && (
              <>
                <SettingRow
                  id="exportImages"
                  title="Images"
                  description="Written into the file, or copied beside it in a folder."
                >
                  <Segmented
                    label="Images"
                    value={options.images}
                    options={[{ value: "inline", label: "Inline" }, { value: "folder", label: "Folder" }]}
                    onChange={setOption("images")}
                  />
                </SettingRow>
                <SettingRow
                  id="exportFrontMatter"
                  title="Title, tags and dates"
                  description="Added at the top as front matter."
                >
                  <Switch label="Title, tags and dates" checked={options.frontMatter} onChange={setOption("frontMatter")} />
                </SettingRow>
              </>
            )}
            {format === "html" && (
              <SettingRow id="exportHtmlNote" title="One file" description="Images are written into the page, so it opens anywhere." />
            )}
          </SettingsGroup>
        </div>
        <footer className="export-dialog-footer">
          <button
            type="button"
            className="export-dialog-secondary"
            onMouseDown={preventFocusLoss}
            onClick={onCopyMarkdown}
          >
            <ClipboardCopy size={15} strokeWidth={2} aria-hidden="true" />
            Copy as Markdown
          </button>
          <span className="export-dialog-spacer" />
          <button type="button" className="export-dialog-secondary" onMouseDown={preventFocusLoss} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="export-dialog-primary"
            onMouseDown={preventFocusLoss}
            onClick={() => onExport({ scope, format, options })}
          >
            {`Export ${formatLabel}...`}
          </button>
        </footer>
      </div>
    </div>
  );
}
