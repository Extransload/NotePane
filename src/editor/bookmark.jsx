import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { createReactBlockSpec, useBlockNoteEditor, useComponentsContext, useExtensionState } from "@blocknote/react";
import { Bookmark as BookmarkIcon, Globe, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// A bookmark is a card for a web page: its title, description, site and preview image. The main
// process reads them (`bookmarks:fetch-metadata`, electron/bookmarkMetadata.cjs) and stores the
// image as an asset; the browser preview has no bridge and shows the address alone.

const keepEditorFocus = (event) => event.preventDefault();

// Bookmarks inserted from the slash menu in this window, whose address field takes focus once.
const bookmarksAwaitingFocus = new Set();

function getMetadataFetcher() {
  return window.blocknoteSticky?.fetchBookmarkMetadata;
}

export function isWebUrl(value) {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// What the user typed, as an address: `example.com` is read as https.
function normalizeTypedUrl(value) {
  const text = value.trim();
  return /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Main routes a window opened for an http(s) address to the default browser (see openExternalUrl
// in electron/main.cjs); the browser preview opens a tab.
function openBookmark(url) {
  if (isWebUrl(url)) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// The props a bookmark gets for `url`: it starts loading its card where the bridge can fetch one.
export function bookmarkPropsForUrl(url) {
  return { url, title: "", description: "", imageUrl: "", siteName: "", status: getMetadataFetcher() ? "loading" : "" };
}

// The fetched card replaces the loading state without an undo step of its own, so undo goes back
// to before the address was given, not to a card that would load again.
function applyFetchedProps(editor, blockId, props) {
  if (!editor.getBlock(blockId)) {
    return;
  }
  editor.transact((tr) => {
    tr.setMeta("addToHistory", false);
    editor.updateBlock(blockId, { props });
  });
}

function useBookmarkMetadata(block, editor) {
  const { url, status } = block.props;
  useEffect(() => {
    const fetchMetadata = getMetadataFetcher();
    // A read-only editor, such as the version history preview, never writes the card.
    if (status !== "loading" || !editor.isEditable || !fetchMetadata) {
      return undefined;
    }
    let isCurrent = true;
    fetchMetadata(url).then(
      (metadata) => {
        if (isCurrent) {
          applyFetchedProps(editor, block.id, {
            title: metadata?.title ?? "",
            description: metadata?.description ?? "",
            imageUrl: metadata?.imageUrl ?? "",
            siteName: metadata?.siteName ?? "",
            status: "ready",
          });
        }
      },
      () => {
        if (isCurrent) {
          applyFetchedProps(editor, block.id, { status: "error" });
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [block.id, editor, status, url]);
}

function BookmarkUrlField({ block, editor }) {
  const [value, setValue] = useState("");
  const [isInvalid, setIsInvalid] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (bookmarksAwaitingFocus.delete(block.id)) {
      inputRef.current?.focus();
    }
  }, [block.id]);

  const submit = () => {
    const url = normalizeTypedUrl(value);
    if (!value.trim() || !isWebUrl(url)) {
      setIsInvalid(true);
      return;
    }
    editor.updateBlock(block.id, { props: bookmarkPropsForUrl(url) });
    editor.focus();
  };

  return (
    <div className="notepane-bookmark-field" contentEditable={false}>
      <Link2 className="notepane-bookmark-field-icon" size={16} aria-hidden="true" />
      <input
        ref={inputRef}
        className="notepane-bookmark-field-input"
        data-testid="bookmark-url-input"
        type="url"
        aria-label="Bookmark address"
        aria-invalid={isInvalid}
        placeholder="Paste a web address and press Enter"
        disabled={!editor.isEditable}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setIsInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            editor.focus();
          }
        }}
      />
      <button
        type="button"
        className="notepane-bookmark-field-button"
        disabled={!editor.isEditable}
        onMouseDown={keepEditorFocus}
        onClick={submit}
      >
        Create bookmark
      </button>
    </div>
  );
}

function Bookmark({ block, editor }) {
  useBookmarkMetadata(block, editor);
  const { url, title, description, imageUrl, siteName, status } = block.props;
  if (!url) {
    return <BookmarkUrlField block={block} editor={editor} />;
  }

  return (
    <div
      className="notepane-bookmark"
      contentEditable={false}
      data-testid="bookmark-card"
      data-status={status || "idle"}
      role="link"
      title={url}
      onClick={() => openBookmark(url)}
    >
      <div className="notepane-bookmark-text">
        <div className="notepane-bookmark-title">{title || url}</div>
        {description && <div className="notepane-bookmark-description">{description}</div>}
        <div className="notepane-bookmark-site">
          <Globe className="notepane-bookmark-site-icon" size={14} aria-hidden="true" />
          <span className="notepane-bookmark-site-name">{siteName || hostOf(url)}</span>
          {status === "loading" && <span className="notepane-bookmark-status">Loading preview</span>}
          {status === "error" && <span className="notepane-bookmark-status">Preview unavailable</span>}
        </div>
      </div>
      {imageUrl && (
        <img className="notepane-bookmark-thumbnail" src={imageUrl} alt="" draggable={false} />
      )}
    </div>
  );
}

// Markdown has no card, so the export is a link to the page under its title.
function BookmarkExternalHTML({ block }) {
  const { url, title } = block.props;
  return url ? <p><a href={url}>{title || url}</a></p> : <p />;
}

export const createBookmarkBlockSpec = createReactBlockSpec(
  {
    type: "bookmark",
    propSchema: {
      url: { default: "" },
      title: { default: "" },
      description: { default: "" },
      imageUrl: { default: "" },
      siteName: { default: "" },
      status: { default: "" },
    },
    content: "none",
  },
  { render: Bookmark, toExternalHTML: BookmarkExternalHTML },
);

// The slash menu's "Bookmark": an empty card whose address field takes focus.
export function insertBookmark(editor) {
  const block = insertOrUpdateBlockForSlashMenu(editor, { type: "bookmark" });
  bookmarksAwaitingFocus.add(block.id);
}

// The web address of a paragraph that is exactly one link, or null.
function soleLinkUrl(block) {
  const content = block?.type === "paragraph" ? block.content : null;
  if (!Array.isArray(content) || content.length !== 1 || content[0].type !== "link") {
    return null;
  }
  return isWebUrl(content[0].href) ? content[0].href : null;
}

// The six-dot menu's "Turn into bookmark", for a paragraph that is exactly one link.
export function TurnIntoBookmarkItem() {
  const Components = useComponentsContext();
  const editor = useBlockNoteEditor();
  const block = useExtensionState("sideMenu", {
    selector: (state) => state?.block,
  });
  // The side menu keeps the block as it was when the pointer reached it, so its content is read
  // again: a link pasted since then is still found.
  const url = soleLinkUrl(block ? editor.getBlock(block.id) : undefined);

  if (!Components || !url) {
    return null;
  }

  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => editor.updateBlock(block.id, { type: "bookmark", props: bookmarkPropsForUrl(url) })}
    >
      <span className="notepane-block-menu-item-content">
        <BookmarkIcon className="notepane-block-menu-icon" aria-hidden="true" />
        Turn into bookmark
      </span>
    </Components.Generic.Menu.Item>
  );
}
