// Saves still in flight per note, across editor instances. A window that
// switches away from a note and back must not read the note from disk before
// the previous editor's last save (and its retries) has landed.
const pendingSaves = new Map();

export function trackPendingSave(noteId, promise) {
  const settled = promise.then(
    () => undefined,
    () => undefined,
  );
  pendingSaves.set(noteId, settled);
  void settled.then(() => {
    if (pendingSaves.get(noteId) === settled) {
      pendingSaves.delete(noteId);
    }
  });
  return promise;
}

export function hasPendingSave(noteId) {
  return pendingSaves.has(noteId);
}

export function waitForPendingSave(noteId) {
  return pendingSaves.get(noteId) ?? Promise.resolve();
}
