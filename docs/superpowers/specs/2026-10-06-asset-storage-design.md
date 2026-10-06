# Asset Storage Design

## Goal

Stop storing uploaded media inline as base64 data URLs. Today, measured on a real workspace:

- `notes.json` is 1.35 MB, and 97% of it is two images.
- `note-history.json` is 15 MB, and 88% of it is those same images repeated across 167 version snapshots.

The cost is paid in several places:

- disk size;
- a full rewrite of `notes.json` on every 180 ms save;
- megabytes of IPC on every save and on every `notes:changed` broadcast to all windows.

This follows the direction already set by `docs/collaboration-sync-design.md` §7.2 and §7.3:

- no data URLs in note JSON;
- assets identified by a SHA-256 checksum;
- the original `notes.json` kept as a backup during migration;
- a migration that is safe to repeat.

## Scope

- Uploaded media is stored as content-addressed files, and notes reference it by URL. This covers image, file, video and
  audio blocks, which all use the same upload path today.
- Existing data migrates automatically on startup.
- The following must behave exactly as before:
  - the portable workspace backup (one self-contained `.notepane` file, format version 1);
  - PNG, PDF and Markdown export;
  - image download;
  - image crop.
- Out of scope:
  - changing Trash or history retention (history stays at 50 versions per note, and Trash is kept until the user
    empties it);
  - copying images to other applications;
  - thumbnails;
  - cloud sync.

## Asset identity and URL

- An asset file lives at `<userData>/assets/<sha256-hex>.<ext>`.
- The hash is the lowercase hex SHA-256 of the file bytes. The extension comes from the MIME type through a fixed
  map, and unknown types use `bin`:
  - `png`, `jpg`, `gif`, `webp`, `svg`, `bmp`, `avif`
  - `mp4`, `webm`, `mov`, `mp3`, `wav`, `ogg`, `pdf`
- Notes reference an asset as `notepane-asset://local/<sha256-hex>.<ext>`. The fixed host `local` keeps the hash in
  the path, which standard-scheme URL parsing never lowercases or rewrites.
- Identical bytes always produce the same file and URL. Writing an asset that already exists does nothing.

## Units

| File | Responsibility |
| --- | --- |
| `electron/assetStore.cjs` (new, plain Node, no Electron import) | `AssetStore(directory)` with: `put(buffer, mimeType) -> url`, written atomically through a temp file and rename; `read(url) -> {buffer, mimeType} \| null`; `externalizeDataUrls(text) -> text`, which replaces every base64 data URL with an asset URL; `inlineAssetUrls(text) -> text`, the reverse, which leaves unknown assets untouched; `collectGarbage(referencedUrls)`, which deletes asset files not in the set; and `parseAssetUrl(url) -> {hash, ext} \| null` |
| `electron/store.cjs` | Owns an `AssetStore` under its user-data directory and calls it on every write path and in migration, backup export and restore. |
| `electron/main.cjs` | Registers the scheme and serves it. Adds the `assets:store` IPC, extends `assets:save-url`, and inlines assets for Markdown export. |
| `electron/preload.cjs` | Exposes `storeAsset({bytes, mimeType}) -> url`. |
| `src/editor/images.js` | Upload and crop store bytes through `storeAsset` when it exists, and otherwise keep data URLs (browser preview). |

`parseAssetUrl` accepts only `^[0-9a-f]{64}\.[a-z0-9]{1,5}$` as the file name. Anything else is rejected, so no URL
can reach a path outside the assets directory.

Only base64 data URLs (`data:<mime>;base64,<payload>`) are externalized. Other data URLs, such as `data:image/svg+xml;utf8,…`,
are rare and are left as they are.

## Serving assets

- Before the app is ready, `protocol.registerSchemesAsPrivileged` registers `notepane-asset` with `standard`, `secure`,
  `supportFetchAPI`, `corsEnabled` and `stream`.
- After it is ready, `protocol.handle("notepane-asset", …)` resolves the URL with `parseAssetUrl`:
  - **Found:** it returns the file with its content type and `Access-Control-Allow-Origin: *`, so a cropped image does
    not taint the canvas.
  - **Rejected or missing:** it returns 404.

## Write paths (the safety net)

- `updateContent`, `createNoteVersion`, `restoreBackup` and the note-creation paths pass `blocksJSON` and `markdown`
  through `externalizeDataUrls` before storing them.
- Upload is the main way media arrives. Pasted HTML, Markdown import and backup restore can still bring in data
  URLs, so the main process is the last gate.
- The renderer may keep showing a data URL until the note remounts. That is harmless: the stored copy is already
  externalized, and the next save maps to the same asset.

## Migration (startup, safe to repeat)

1. After loading, the store checks whether `notes.json` or `note-history.json` contains a base64 data URL. If neither
   does, migration does nothing. This check is what makes it safe to run on every startup.
2. Otherwise it first copies each affected file to `notes.pre-assets-<timestamp>.json` and
   `note-history.pre-assets-<timestamp>.json`.
3. It externalizes every active note, every trashed note and every history version, then saves both files.
4. If any step throws, the in-memory state and the files on disk stay as loaded. The error is logged and the app keeps
   working with data URLs. The next startup tries again.

## Garbage collection

At startup, only after a successful migration (or when none was needed), the store deletes asset files that no active
note, trashed note or history version references. It never runs while the app is running, because an open editor's
undo history may still hold an asset URL.

## Renderer flows

- **Upload** (`uploadFile`): with `electronApi.storeAsset`, it reads the file into an `ArrayBuffer`, sends the bytes
  with `file.type`, and returns the asset URL. Without it, it returns a data URL as today.
- **Crop:** turns the canvas into a PNG `Blob`, then stores it the same way. `originalUrl` keeps the asset URL of the
  original image.
- **Download:** `assets:save-url` reads `notepane-asset:` URLs through `AssetStore.read`, in addition to `data:`,
  `file:` and `http(s):`.
- **Copy and paste between NotePane windows** keeps working, because the asset URL resolves in every window.

## Backup and export

- **Workspace backup export** (`createBackup`) runs `inlineAssetUrls` over every note and version it writes, so the
  `.notepane` file stays self-contained and keeps format version 1. Older app versions can still import it.
- **Workspace backup import** (`restoreBackup`) goes through the write-path safety net, which externalizes the data
  URLs again.
- **Markdown export:** main runs `inlineAssetUrls` over the Markdown before writing, so the exported file stays
  self-contained, as today.
- **PNG and PDF export** capture the rendered page. Assets load through the protocol, so nothing changes.

## Known limitation

Copying an image and pasting it into another application (mail, chat) used to carry the image as a data URL. It will
now carry a `notepane-asset:` URL that other applications cannot load. The copy event is synchronous, so the bytes
cannot be read in time. The image toolbar's download action still works. A dedicated "Copy image" action can come
later.

## Testing

**Unit** (`tests/unit/assetStore.test.cjs`):

- identical bytes are stored once;
- extensions map from MIME type;
- data URL to asset URL and back is lossless;
- malformed names and path traversal are rejected;
- garbage collection keeps referenced files and deletes the rest.

**Unit** (`tests/unit/store.test.cjs`):

- saving content with a data URL stores an asset URL, and the file exists;
- migration of a fixture whose active notes, trashed notes and history all hold data URLs:
  - writes the backup files;
  - leaves no data URL;
  - changes nothing and writes no new backup when run a second time;
- a migration failure leaves both files byte-identical;
- backup export contains data URLs and no asset URLs;
- backup restore stores asset URLs.

**Electron E2E:**

- an uploaded image is stored as a `notepane-asset:` URL and renders (`naturalWidth > 0`);
- crop produces an asset URL;
- a downloaded image's bytes match the original;
- Markdown export contains a data URL;
- starting from a `notes.json` that holds a data URL migrates it, and the image still renders.

**Renderer E2E:** the existing image tests keep passing on the data URL path.
