import {
  useCallback,
} from "react";
import {
  electronApi,
} from "../constants.js";
import {
  withCodeTheme,
} from "../editor/codeHighlighter.js";
import {
  noteToHtml,
  noteToMarkdown,
} from "../editor/noteConversion.js";
import {
  normalizeTitle,
} from "../model/notes.js";
import {
  getExportTheme,
  withExportTheme,
} from "../style/applyTheme.js";
import {
  writeClipboardText,
} from "../style/colorMath.js";
import {
  nextAnimationFrame,
} from "../utils/values.js";

const FORMAT_LABELS = { pdf: "PDF", md: "Markdown", html: "HTML", png: "Image" };

// The theme's page colours, for an HTML or PNG export that keeps the look on screen.
function readThemePageColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    background: style.getPropertyValue("--sticky-editor-bg").trim(),
    text: style.getPropertyValue("--sticky-text-color").trim(),
  };
}

/**
 * Export from the Export window (src/ui/ExportDialog.jsx).
 *
 * - The open note: PDF is printed from this window (in light colours unless the current theme
 *   is chosen), Markdown and HTML come from the editor, and the image is the HTML page captured
 *   whole by the main process.
 * - A folder or every note: Markdown or HTML, one file per note, written into a folder the user
 *   picks; notes that are not open are converted by a detached editor
 *   (src/editor/noteConversion.js), the open one from the live editor so unsaved edits go too.
 */
export function useNoteExport({ editor, note, title, notes, folders, showToast, hideToast }) {
  const exportOpenNote = useCallback(async (format, options) => {
    const payload = { noteId: note.id, title: normalizeTitle(title), type: format };
    if (format === "pdf") {
      // The note is laid out for print only while it prints; the save dialog then comes up over
      // the window as it was, not over a page of dark text on a see-through window.
      payload.pageSize = options.pageSize;
      document.body.classList.add("is-exporting");
      try {
        const render = async () => {
          await nextAnimationFrame();
          await nextAnimationFrame();
          await electronApi.printPdf(payload);
        };
        if (options.colors === "light") {
          await withExportTheme(() => withCodeTheme(getExportTheme().codeTheme, render));
        } else {
          await render();
        }
      } finally {
        document.body.classList.remove("is-exporting");
      }
      await nextAnimationFrame();
      return electronApi.savePdf();
    }
    if (format === "md") {
      payload.markdown = await editor.blocksToMarkdownLossy(editor.document);
      payload.images = options.images;
      payload.frontMatter = options.frontMatter
        ? { tags: note.tags ?? [], createdAt: note.createdAt, updatedAt: note.updatedAt }
        : null;
      return electronApi.exportNote(payload);
    }
    payload.html = await editor.blocksToHTMLLossy(editor.document);
    payload.colors = options.colors === "theme" ? readThemePageColors() : null;
    payload.scale = options.scale;
    return electronApi.exportNote(payload);
  }, [editor, note, title]);

  const exportManyNotes = useCallback(async (scope, format, options) => {
    const folderNames = new Map((folders ?? []).map((folder) => [folder.id, folder.name]));
    const chosen = (notes ?? []).filter((candidate) =>
      !candidate.trashedAt && (scope === "all" || candidate.folderId === note.folderId));
    const entries = [];
    for (const candidate of chosen) {
      const isOpen = candidate.id === note.id;
      const content = format === "md"
        ? (isOpen ? await editor.blocksToMarkdownLossy(editor.document) : await noteToMarkdown(candidate))
        : (isOpen ? await editor.blocksToHTMLLossy(editor.document) : await noteToHtml(candidate));
      entries.push({
        folder: scope === "all" ? folderNames.get(candidate.folderId) ?? null : null,
        title: normalizeTitle(isOpen ? title : candidate.title),
        content,
        tags: candidate.tags ?? [],
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
      });
    }
    return electronApi.exportNotes({
      format,
      folderName: scope === "folder" ? folderNames.get(note.folderId) ?? "NotePane" : "NotePane",
      images: options.images,
      frontMatter: Boolean(options.frontMatter),
      entries,
    });
  }, [editor, folders, note, notes, title]);

  const runExport = useCallback(async ({ scope, format, options }) => {
    const label = FORMAT_LABELS[format];
    if (!electronApi?.exportNote) {
      showToast("Note export is available in the desktop app.", "error");
      return;
    }
    showToast(`Exporting ${label}...`, "progress", { timeout: 0 });
    try {
      const result = scope === "note"
        ? await exportOpenNote(format, options)
        : await exportManyNotes(scope, format, options);
      if (result?.canceled) {
        hideToast();
        return;
      }
      const count = result?.count ?? 0;
      showToast(scope === "note" ? `${label} exported` : `${count} ${count === 1 ? "note" : "notes"} exported`, "success");
    } catch (error) {
      showToast(error?.message || `${label} export failed.`, "error");
    }
  }, [exportManyNotes, exportOpenNote, hideToast, showToast]);

  const copyMarkdown = useCallback(async () => {
    try {
      await writeClipboardText(await editor.blocksToMarkdownLossy(editor.document));
      showToast("Markdown copied", "success");
    } catch (error) {
      showToast(error?.message || "Could not copy.", "error");
    }
  }, [editor, showToast]);

  return { runExport, copyMarkdown };
}
