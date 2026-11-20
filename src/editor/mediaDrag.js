import { createExtension } from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { Plugin } from "@tiptap/pm/state";

// The object of an image, video, audio or file block: the picture or player, the file name and the
// caption. Bookmark cards and the empty "Add image" placeholder have no such wrapper.
const MEDIA_OBJECT_SELECTOR = ".bn-file-block-content-wrapper";
// Parts of the object that keep their own press: the image resize handles, the upload placeholder
// and the audio player, which is all controls.
const OWN_PRESS_SELECTOR = ".bn-resize-handle, .bn-add-file-button, .bn-file-loading-preview, audio";
// Chromium draws a video's controls, buttons and timeline, in this band at its bottom. They live in
// a closed shadow root, so the band is told by its place.
const VIDEO_CONTROLS_HEIGHT = 72;
const DRAG_PREVIEW_WIDTH = "--notepane-drag-preview-width";

function isOnVideoControls(target, event) {
  if (!(target instanceof HTMLVideoElement) || !target.controls) return false;
  return event.clientY > target.getBoundingClientRect().bottom - VIDEO_CONTROLS_HEIGHT;
}

// The media object a press may drag, or null when the press belongs to a control.
function draggableMediaObject(view, event) {
  const { target } = event;
  if (!(target instanceof Element) || target.closest(OWN_PRESS_SELECTOR)) return null;
  if (isOnVideoControls(target, event)) return null;
  const object = target.closest(MEDIA_OBJECT_SELECTOR);
  return object && view.dom.contains(object) ? object : null;
}

// Pressing on a media block's picture, file name or caption and dragging moves the block, as in
// Notion. The press makes the object draggable, so Chromium starts a drag only once the pointer
// has moved past its drag threshold and a press that does not move stays a click that selects the
// block. The drag itself is BlockNote's six-dot handle drag (`blockDragStart`): the same drag
// preview, drop cursor, drop targets (between blocks, into columns and callouts) and one undo step.
function mediaDragView(editor, view) {
  const doc = view.dom.ownerDocument;
  const win = doc.defaultView;
  let press = null;

  function release() {
    press?.object.removeAttribute("draggable");
    press = null;
    doc.removeEventListener("mouseup", release, true);
    win.removeEventListener("blur", release);
  }

  return {
    onMouseDown(event) {
      release();
      if (event.button !== 0 || event.ctrlKey || !editor.isEditable) return;
      const object = draggableMediaObject(view, event);
      const outer = object?.closest(".bn-block-outer[data-id]");
      if (!outer) return;
      press = { object, outer };
      object.draggable = true;
      doc.addEventListener("mouseup", release, true);
      win.addEventListener("blur", release);
    },

    onDragStart(event) {
      if (!press || !press.object.contains(event.target)) return false;
      const block = editor.getBlock(press.outer.dataset.id);
      if (!block) return false;
      const { object, outer } = press;
      const sideMenu = editor.getExtension(SideMenuExtension);
      doc.removeEventListener("mouseup", release, true);
      doc.documentElement.style.setProperty(DRAG_PREVIEW_WIDTH, `${outer.getBoundingClientRect().width}px`);
      sideMenu.blockDragStart(event, block);
      // The drop draws the moved block anew, so dragend reaches only the object, out of the document.
      object.addEventListener("dragend", () => {
        release();
        doc.documentElement.style.removeProperty(DRAG_PREVIEW_WIDTH);
        sideMenu.blockDragEnd();
        // BlockNote blurs the editor as a block drag ends; the editor takes focus back with the
        // dropped block selected, so Cmd+Z undoes the move at once, as after a six-dot drag.
        if (editor.isEditable) editor.focus();
      }, { once: true });
      // ProseMirror's own dragstart would drag the selection instead.
      return true;
    },

    destroy: release,
  };
}

export const MediaDrag = createExtension(({ editor }) => {
  let media = null;
  return {
    key: "notepaneMediaDrag",
    prosemirrorPlugins: [new Plugin({
      view(view) {
        media = mediaDragView(editor, view);
        return { destroy: () => media.destroy() };
      },
      props: {
        handleDOMEvents: {
          mousedown(_view, event) {
            media?.onMouseDown(event);
            return false;
          },
          dragstart(_view, event) {
            return media?.onDragStart(event) ?? false;
          },
        },
      },
    })],
  };
})();
