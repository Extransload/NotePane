import notePaneWordmarkDarkUrl from "../../assets/notepane-wordmark-dark.png";
import notePaneWordmarkUrl from "../../assets/notepane-wordmark.png";
import {
  Cog,
  Copy,
  Ellipsis,
  Eye,
  FileDown,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTopClose,
  Pin,
  RotateCcw,
  Trash2,
} from "lucide-react";

export function NotePaneWordmark() {
  return (
    <div className="brand-wordmark" aria-label="NotePane wordmark">
      <img
        className="brand-wordmark-image brand-wordmark-image-light"
        src={notePaneWordmarkUrl}
        alt=""
        aria-hidden="true"
      />
      <img
        className="brand-wordmark-image brand-wordmark-image-dark"
        src={notePaneWordmarkDarkUrl}
        alt=""
        aria-hidden="true"
      />
    </div>
  );
}

export function SidebarToggleIcon({ expanded = true }) {
  const Icon = expanded ? PanelLeftClose : PanelLeftOpen;
  return (
    <Icon
      className="notepane-action-icon notepane-icon-sidebar"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="sidebar"
      data-sidebar-icon-state={expanded ? "expanded" : "compact"}
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

export function PaletteIcon() {
  return (
    <Palette
      className="notepane-action-icon notepane-icon-palette"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="palette"
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

export function SettingsIcon() {
  return (
    <Cog
      className="notepane-action-icon notepane-icon-settings"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="settings"
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

export function ExportPdfIcon() {
  return (
    <FileDown
      className="notepane-action-icon notepane-icon-export"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="export"
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

export function CopyValueIcon() {
  return (
    <Copy
      className="notepane-action-icon notepane-icon-copy"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="copy"
      size={15}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

export function PreviewNoteIcon() {
  return (
    <Eye
      className="notepane-action-icon notepane-icon-preview"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="sidebar"
      size={15}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

export function RestoreNoteIcon() {
  return (
    <RotateCcw
      className="notepane-action-icon notepane-icon-restore"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="restore"
      size={15}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

export function PermanentDeleteIcon() {
  return (
    <Trash2
      className="notepane-action-icon notepane-icon-delete"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="delete"
      size={15}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

export function TrashSidebarIcon() {
  return (
    <Trash2
      className="notepane-action-icon notepane-icon-trash"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="trash"
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

export function PinIcon({ pinned = false }) {
  return (
    <Pin
      className="notepane-action-icon notepane-icon-pin"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="pin"
      data-pin-state={pinned ? "pinned" : "unpinned"}
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

export function EllipsisIcon() {
  return (
    <Ellipsis
      className="notepane-action-icon notepane-icon-ellipsis"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}

export function ModeTransitionIcon({ fromMode, toMode, compact = false }) {
  const FromGlyph = fromMode === "sticky" ? InlineStickyGlyph : InlineTabsGlyph;
  const ToGlyph = toMode === "sticky" ? InlineStickyGlyph : InlineTabsGlyph;

  if (compact) {
    return (
      <svg
        className="notepane-action-icon notepane-mode-transition-icon lucide lucide-mode-transition"
        data-icon-family="system-symbol"
        data-icon-pack="lucide"
        data-icon-tone={toMode}
        data-icon-layout="compact"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <ToGlyph x={2} />
      </svg>
    );
  }

  return (
    <svg
      className="notepane-action-icon notepane-mode-transition-icon lucide lucide-mode-transition"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone={toMode}
      data-icon-layout="transition"
      width="58"
      height="24"
      viewBox="0 0 58 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <FromGlyph x={1} />
      <path className="mode-transition-arrow" d="M26 12h10" />
      <path className="mode-transition-arrow-head" d="m33 9 3 3-3 3" />
      <ToGlyph x={40} />
    </svg>
  );
}

export function InlineTabsGlyph({ x }) {
  return (
    <g className="mode-tabs-glyph" transform={`translate(${x} 0)`}>
      <rect x="1" y="5" width="18" height="15" rx="2" />
      <path d="M7 5v15" />
      <path d="M1 9.5h6" />
      <path d="M1 14h6" />
    </g>
  );
}

export function InlineStickyGlyph({ x }) {
  return (
    <g className="mode-sticky-glyph" transform={`translate(${x} 0)`}>
      <path d="M2 4.5h15v10.2L12.3 20H2V4.5Z" />
      <path d="M17 14.7h-4.7V20" />
    </g>
  );
}

export function DockIcon() {
  return (
    <PanelTopClose
      className="notepane-action-icon notepane-icon-dock"
      data-icon-family="system-symbol"
      data-icon-pack="lucide"
      data-icon-tone="dock"
      size={24}
      strokeWidth={1.9}
      aria-hidden="true"
    />
  );
}
