// Folders group the tabs sidebar. electron/store.cjs keeps the stored folders and
// a twin of normalizeFolderName; this module derives what the sidebar shows.

export const DEFAULT_FOLDER_NAME = "New folder";
export const MAX_FOLDER_NAME_LENGTH = 60;

// Trimmed and cut to MAX_FOLDER_NAME_LENGTH characters; a blank name takes the fallback.
export function normalizeFolderName(value, fallback = DEFAULT_FOLDER_NAME) {
  const name = typeof value === "string" ? value.trim() : "";
  return name ? [...name].slice(0, MAX_FOLDER_NAME_LENGTH).join("").trim() : fallback;
}

/**
 * The sessions as the sidebar shows them: the ungrouped ones first, then one
 * section per folder in folder order, each in session order. A note whose
 * folder is not listed counts as ungrouped. A collapsed folder still shows the
 * open note, so the note being edited never disappears from the sidebar.
 * `visibleNotes` is the order of the tabs on screen, which numbers them and
 * which Cmd+1..9 follows; `orderedNotes` holds every session, hidden ones too.
 */
export function groupSessionNotes(notes, folders, activeNoteId) {
  const sections = (Array.isArray(folders) ? folders : []).map((folder) => ({
    folder,
    notes: [],
    visibleNotes: [],
  }));
  const sectionByFolderId = new Map(sections.map((section) => [section.folder.id, section]));
  const ungrouped = [];
  for (const note of Array.isArray(notes) ? notes : []) {
    const section = note.folderId ? sectionByFolderId.get(note.folderId) : null;
    if (section) {
      section.notes.push(note);
    } else {
      ungrouped.push(note);
    }
  }
  for (const section of sections) {
    section.visibleNotes = section.folder.collapsed
      ? section.notes.filter((note) => note.id === activeNoteId)
      : section.notes;
  }

  return {
    ungrouped,
    sections,
    orderedNotes: [...ungrouped, ...sections.flatMap((section) => section.notes)],
    visibleNotes: [...ungrouped, ...sections.flatMap((section) => section.visibleNotes)],
  };
}

/**
 * The full session order for a new order of the visible tabs. A tab hidden in a
 * collapsed folder keeps its place, and every session stays in its own group:
 * a tab dragged or moved past the edge of its group stays at that edge. A tab
 * changes group by its folder (a drop on a folder header, the tab menu, or a drag
 * over another group's tabs, see useSessionTabDrag), never by this order.
 */
export function getGroupedSessionOrder(orderedVisibleIds, grouping) {
  const visibleIds = grouping.visibleNotes.map((note) => note.id);
  const visibleIdSet = new Set(visibleIds);
  const queue = [...new Set(
    (Array.isArray(orderedVisibleIds) ? orderedVisibleIds : [])
      .filter((noteId) => visibleIdSet.has(noteId)),
  )];
  const queuedIds = new Set(queue);
  queue.push(...visibleIds.filter((noteId) => !queuedIds.has(noteId)));

  const groupIndexById = new Map(grouping.ungrouped.map((note) => [note.id, 0]));
  grouping.sections.forEach((section, index) => {
    section.notes.forEach((note) => groupIndexById.set(note.id, index + 1));
  });

  let nextVisible = 0;
  return grouping.orderedNotes
    .map((note, position) => ({
      id: visibleIdSet.has(note.id) ? queue[nextVisible++] : note.id,
      position,
    }))
    .sort((a, b) =>
      groupIndexById.get(a.id) - groupIndexById.get(b.id) || a.position - b.position,
    )
    .map((entry) => entry.id);
}
