import {
  Apple,
  Clock,
  Flag,
  Leaf,
  Lightbulb,
  Plane,
  Search,
  Shapes,
  Shuffle,
  Smile,
  Star,
  Upload,
  Volleyball,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const SUGGESTED_CALLOUT_ICONS = [
  { icon: "💡", label: "Idea" },
  { icon: "📌", label: "Pin" },
  { icon: "⚠️", label: "Warning" },
  { icon: "❗", label: "Important" },
  { icon: "✅", label: "Done" },
  { icon: "ℹ️", label: "Info" },
  { icon: "❓", label: "Question" },
  { icon: "🔥", label: "Hot" },
  { icon: "📝", label: "Note" },
  { icon: "🚀", label: "Launch" },
  { icon: "⭐", label: "Star" },
  { icon: "🎯", label: "Goal" },
  { icon: "💬", label: "Comment" },
  { icon: "📎", label: "Attachment" },
  { icon: "🔒", label: "Locked" },
  { icon: "🗓️", label: "Date" },
];

const CATEGORIES = {
  people: { label: "Smileys & People", Icon: Smile },
  nature: { label: "Animals & Nature", Icon: Leaf },
  foods: { label: "Food & Drink", Icon: Apple },
  activity: { label: "Activity", Icon: Volleyball },
  places: { label: "Travel & Places", Icon: Plane },
  objects: { label: "Objects", Icon: Lightbulb },
  symbols: { label: "Symbols", Icon: Shapes },
  flags: { label: "Flags", Icon: Flag },
};

const RECENT_ICONS_KEY = "notepane.calloutIcons.recent";
const RECENT_ICON_LIMIT = 16;
const PICKER_MARGIN = 8;
const PICKER_GAP = 6;

// Uploaded icons are stored assets, or data URLs in the browser preview. Other URLs, which only a
// pasted note could carry, are not loaded, so a note cannot fetch a remote image when it opens.
export function isImageIcon(icon) {
  return /^(notepane-asset:|data:image\/)/.test(icon ?? "");
}

export function CalloutIconGlyph({ icon }) {
  if (isImageIcon(icon)) {
    return <img className="notepane-callout-icon-image" src={icon} alt="" draggable={false} />;
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(icon ?? "") ? null : icon;
}

// Recent icons are a per-viewer convenience, so browser storage that is missing or blocked only
// means no recent row.
function readRecentIcons() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_ICONS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((icon) => typeof icon === "string") : [];
  } catch {
    return [];
  }
}

function rememberRecentIcon(icon) {
  try {
    const recent = [icon, ...readRecentIcons().filter((candidate) => candidate !== icon)];
    window.localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(recent.slice(0, RECENT_ICON_LIMIT)));
  } catch {
    // Without storage the picker still works; it just forgets.
  }
}

function useEmojiData() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let isCurrent = true;
    // Without the data the picker still offers recent and suggested icons and upload.
    import("@emoji-mart/data").then(
      (module) => {
        if (isCurrent) setData(module.default);
      },
      () => {},
    );
    return () => {
      isCurrent = false;
    };
  }, []);
  return data;
}

// Below the anchor, or above it when the window has no room below, and always inside the window.
// It follows the anchor while the note scrolls.
function usePickerPosition(anchor, pickerRef) {
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      const picker = pickerRef.current;
      if (!anchor?.isConnected || !picker) return;
      const anchorRect = anchor.getBoundingClientRect();
      const { width, height } = picker.getBoundingClientRect();
      const roomBelow = window.innerHeight - anchorRect.bottom - PICKER_GAP - PICKER_MARGIN;
      const top = roomBelow >= height || anchorRect.top < height
        ? anchorRect.bottom + PICKER_GAP
        : anchorRect.top - PICKER_GAP - height;
      setPosition({
        left: Math.max(PICKER_MARGIN, Math.min(anchorRect.left, window.innerWidth - width - PICKER_MARGIN)),
        top: Math.max(PICKER_MARGIN, Math.min(top, window.innerHeight - height - PICKER_MARGIN)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, pickerRef]);
  return position;
}

function IconGrid({ label, items, onPick }) {
  return (
    <section className="notepane-callout-icon-section" role="group" aria-label={label}>
      <h3>{label}</h3>
      <div className="notepane-callout-icon-grid">
        {items.map(({ icon, label: itemLabel }) => (
          <button
            key={icon}
            type="button"
            aria-label={itemLabel}
            title={itemLabel}
            onClick={() => onPick(icon)}
          >
            <CalloutIconGlyph icon={icon} />
          </button>
        ))}
      </div>
    </section>
  );
}

export function CalloutIconPicker({ anchor, hasIcon, onPick, onRemove, onUpload, onClose }) {
  const pickerRef = useRef(null);
  const listRef = useRef(null);
  const filterRef = useRef(null);
  const fileInputRef = useRef(null);
  const [tab, setTab] = useState("emoji");
  const [query, setQuery] = useState("");
  const [recentIcons] = useState(readRecentIcons);
  const data = useEmojiData();
  const position = usePickerPosition(anchor, pickerRef);
  const isPlaced = position !== null;

  // Focused once placed: before that the picker is hidden, and a hidden field takes no focus.
  useEffect(() => {
    if (isPlaced && tab === "emoji") filterRef.current?.focus();
  }, [isPlaced, tab]);

  useEffect(() => {
    const closeOnOutsidePointer = (event) => {
      if (!pickerRef.current?.contains(event.target) && !anchor?.contains(event.target)) {
        onClose();
      }
    };
    // On the window, so it runs before the document's own Escape handlers and keeps them out.
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose({ returnFocus: true });
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [anchor, onClose]);

  const categories = useMemo(() => (data?.categories ?? []).map((category) => ({
    id: category.id,
    label: CATEGORIES[category.id]?.label ?? category.id,
    Icon: CATEGORIES[category.id]?.Icon ?? Shapes,
    items: category.emojis
      .map((id) => data.emojis[id])
      .filter(Boolean)
      .map((emoji) => ({
        icon: emoji.skins[0].native,
        label: emoji.name,
        searchText: [emoji.id, emoji.name, ...emoji.keywords].join(" ").toLowerCase(),
      })),
  })), [data]);
  const allEmoji = useMemo(() => categories.flatMap((category) => category.items), [categories]);

  const pick = (icon) => {
    rememberRecentIcon(icon);
    onPick(icon);
  };
  const filter = query.trim().toLowerCase();
  const results = filter ? allEmoji.filter((emoji) => emoji.searchText.includes(filter)) : [];
  const recentItems = recentIcons
    .filter((icon) => !isImageIcon(icon))
    .map((icon) => ({ icon, label: allEmoji.find((emoji) => emoji.icon === icon)?.label ?? icon }));
  const sections = [
    recentItems.length > 0 && { id: "recent", label: "Recent", Icon: Clock, items: recentItems },
    { id: "suggested", label: "Suggested", Icon: Star, items: SUGGESTED_CALLOUT_ICONS },
    ...categories,
  ].filter(Boolean);

  const scrollToSection = (id) => {
    listRef.current?.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ block: "start" });
  };

  return createPortal(
    <div
      ref={pickerRef}
      className="notepane-callout-icon-picker"
      role="dialog"
      aria-label="Callout icon"
      style={position ?? { visibility: "hidden" }}
    >
      <div className="notepane-callout-icon-picker-header">
        <div role="tablist" aria-label="Icon source">
          {[["emoji", "Emoji"], ["upload", "Upload"]].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" disabled={!hasIcon} onClick={onRemove}>Remove</button>
      </div>
      {tab === "emoji" ? (
        <>
          <div className="notepane-callout-icon-picker-search">
            <label>
              <Search size={14} aria-hidden="true" />
              <input
                ref={filterRef}
                type="text"
                value={query}
                placeholder="Filter…"
                aria-label="Filter emoji"
                spellCheck={false}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // Enter also confirms an IME composition, such as Korean, which must not pick.
                  if (event.key === "Enter" && !event.nativeEvent.isComposing && results[0]) {
                    event.preventDefault();
                    pick(results[0].icon);
                  }
                }}
              />
            </label>
            <button
              type="button"
              aria-label="Random emoji"
              title="Random emoji"
              disabled={allEmoji.length === 0}
              onClick={() => pick(allEmoji[Math.floor(Math.random() * allEmoji.length)].icon)}
            >
              <Shuffle size={15} aria-hidden="true" />
            </button>
          </div>
          <div ref={listRef} className="notepane-callout-icon-picker-list">
            {filter ? (
              results.length > 0
                ? <IconGrid label="Results" items={results} onPick={pick} />
                : <p className="notepane-callout-icon-picker-empty">No emoji match “{query.trim()}”.</p>
            ) : sections.map((section) => (
              <div key={section.id} data-section={section.id}>
                <IconGrid label={section.label} items={section.items} onPick={pick} />
              </div>
            ))}
          </div>
          {!filter && (
            <nav className="notepane-callout-icon-picker-nav" aria-label="Emoji categories">
              {sections.map(({ id, label, Icon }) => (
                <button key={id} type="button" aria-label={label} title={label} onClick={() => scrollToSection(id)}>
                  <Icon size={16} aria-hidden="true" />
                </button>
              ))}
            </nav>
          )}
        </>
      ) : (
        <div className="notepane-callout-icon-picker-upload">
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} aria-hidden="true" />
            Upload an image
          </button>
          <p>Square images look best.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            aria-label="Icon image file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) onUpload(file);
            }}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}
