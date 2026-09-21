import {
  SESSION_TAB_REORDER_ANIMATION_MS,
} from "../constants.js";
import {
  clamp,
} from "./values.js";

// Session tabs only animate in once a baseline of visible tabs exists, so the
// very first render shows its tabs without an entrance animation.
const seenSessionTabIds = new Set();
let sessionTabAnimationsPrimed = false;

export function collectNewSessionTabIds(visibleNoteIds) {
  if (!sessionTabAnimationsPrimed) {
    visibleNoteIds.forEach((id) => seenSessionTabIds.add(id));
    sessionTabAnimationsPrimed = true;
    return [];
  }

  const newSessionIds = visibleNoteIds.filter((id) => !seenSessionTabIds.has(id));
  visibleNoteIds.forEach((id) => seenSessionTabIds.add(id));
  return newSessionIds;
}

export function getReorderedNoteIdsForDrop(
  noteIds,
  sourceNoteId,
  targetNoteId,
  insertionSide = "before",
) {
  const currentNoteIds = Array.isArray(noteIds) ? noteIds : [];
  const sourceIndex = currentNoteIds.indexOf(sourceNoteId);
  const targetIndex = currentNoteIds.indexOf(targetNoteId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceNoteId === targetNoteId) {
    return [...currentNoteIds];
  }

  const nextNoteIds = currentNoteIds.filter((noteId) => noteId !== sourceNoteId);
  const targetIndexAfterRemoval = nextNoteIds.indexOf(targetNoteId);
  const insertionIndex = insertionSide === "after"
    ? targetIndexAfterRemoval + 1
    : targetIndexAfterRemoval;
  nextNoteIds.splice(clamp(insertionIndex, 0, nextNoteIds.length), 0, sourceNoteId);
  return nextNoteIds;
}

export function getSessionTabRects(rowMap) {
  const rects = new Map();
  for (const [noteId, element] of rowMap.entries()) {
    if (element instanceof Element) {
      rects.set(noteId, element.getBoundingClientRect());
    }
  }
  return rects;
}

export function animateSessionTabReorder(rowMap, previousRects) {
  const animatedRows = [];
  for (const [noteId, element] of rowMap.entries()) {
    const previousRect = previousRects.get(noteId);
    if (!previousRect || !(element instanceof HTMLElement)) {
      continue;
    }

    const nextRect = element.getBoundingClientRect();
    const deltaY = previousRect.top - nextRect.top;
    if (Math.abs(deltaY) < 1) {
      continue;
    }

    element.classList.add("is-reorder-animating");
    element.style.transition = "none";
    element.style.setProperty("--session-tab-reorder-y", `${deltaY}px`);
    animatedRows.push(element);
  }

  if (animatedRows.length === 0) {
    return;
  }

  animatedRows[0].getBoundingClientRect();
  window.requestAnimationFrame(() => {
    for (const element of animatedRows) {
      element.style.transition = "";
      element.style.setProperty("--session-tab-reorder-y", "0px");
      window.setTimeout(() => {
        element.classList.remove("is-reorder-animating");
        element.style.removeProperty("--session-tab-reorder-y");
      }, SESSION_TAB_REORDER_ANIMATION_MS);
    }
  });
}
