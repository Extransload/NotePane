// Note tags. A tag is stored in one normal form so "#Launch", "launch" and
// " LAUNCH " are the same tag in the note, the palette's filters and search.
// electron/store.cjs keeps a twin of these rules for what the main process stores.

export const MAX_TAG_LENGTH = 32;
export const MAX_TAGS_PER_NOTE = 20;

// Trimmed, without a leading "#", lower-cased, inner whitespace as "-". A tag
// longer than MAX_TAG_LENGTH characters is refused rather than cut, so the user
// never ends up with a tag they did not type. Returns "" for no valid tag.
export function normalizeTag(value) {
  const tag = String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/^#+/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  const length = [...tag].length;
  return length >= 1 && length <= MAX_TAG_LENGTH ? tag : "";
}

// Unique, valid tags in the order they were added, at most MAX_TAGS_PER_NOTE.
export function normalizeTags(values) {
  const tags = [];
  for (const value of Array.isArray(values) ? values : []) {
    const tag = normalizeTag(value);
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
      if (tags.length === MAX_TAGS_PER_NOTE) {
        break;
      }
    }
  }
  return tags;
}
