const test = require("node:test");
const assert = require("node:assert/strict");

const loadFolders = () => import("../../src/model/folders.js");

const note = (id, folderId = null) => ({ id, folderId });
const ids = (notes) => notes.map((item) => item.id);

test("groups sessions: ungrouped first, then each folder in folder order", async () => {
  const { groupSessionNotes } = await loadFolders();
  const folders = [
    { id: "work", name: "Work", collapsed: false },
    { id: "home", name: "Home", collapsed: false },
  ];
  const grouping = groupSessionNotes(
    [note("a", "home"), note("b"), note("c", "work"), note("d", "gone"), note("e", "home")],
    folders,
    "b",
  );

  // A note whose folder is not listed counts as ungrouped.
  assert.deepEqual(ids(grouping.ungrouped), ["b", "d"]);
  assert.deepEqual(grouping.sections.map((section) => ids(section.notes)), [["c"], ["a", "e"]]);
  assert.deepEqual(ids(grouping.visibleNotes), ["b", "d", "c", "a", "e"]);
  assert.deepEqual(ids(grouping.orderedNotes), ["b", "d", "c", "a", "e"]);
});

test("a collapsed folder hides its sessions except the open one", async () => {
  const { groupSessionNotes } = await loadFolders();
  const folders = [{ id: "work", name: "Work", collapsed: true }];
  const notes = [note("a", "work"), note("b"), note("c", "work")];

  assert.deepEqual(ids(groupSessionNotes(notes, folders, "b").visibleNotes), ["b"]);
  assert.deepEqual(ids(groupSessionNotes(notes, folders, "c").visibleNotes), ["b", "c"]);
  assert.deepEqual(ids(groupSessionNotes(notes, folders, "c").orderedNotes), ["b", "a", "c"]);
});

test("a reorder of the visible tabs keeps hidden tabs in place and every tab in its group", async () => {
  const { getGroupedSessionOrder, groupSessionNotes } = await loadFolders();
  const notes = [note("a"), note("b"), note("c", "work"), note("d", "work"), note("e", "home")];
  const open = groupSessionNotes(notes, [
    { id: "work", name: "Work", collapsed: false },
    { id: "home", name: "Home", collapsed: false },
  ], "a");

  // Within a group the new order is kept.
  assert.deepEqual(getGroupedSessionOrder(["b", "a", "d", "c", "e"], open), ["b", "a", "d", "c", "e"]);
  // A tab moved past its group's edge stays at that edge of its own group.
  assert.deepEqual(getGroupedSessionOrder(["a", "c", "b", "d", "e"], open), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(getGroupedSessionOrder(["e", "a", "b", "c", "d"], open), ["a", "b", "c", "d", "e"]);

  // With Work collapsed and "d" open, "c" is hidden and keeps its slot.
  const collapsed = groupSessionNotes(notes, [
    { id: "work", name: "Work", collapsed: true },
    { id: "home", name: "Home", collapsed: false },
  ], "d");
  assert.deepEqual(ids(collapsed.visibleNotes), ["a", "b", "d", "e"]);
  assert.deepEqual(getGroupedSessionOrder(["b", "a", "d", "e"], collapsed), ["b", "a", "c", "d", "e"]);
  // Ids that are not visible are ignored, and a visible id left out keeps its turn.
  assert.deepEqual(getGroupedSessionOrder(["c", "b"], collapsed), ["b", "a", "c", "d", "e"]);
});

test("normalises a folder name like the store", async () => {
  const { normalizeFolderName } = await loadFolders();
  assert.equal(normalizeFolderName("  Work  "), "Work");
  assert.equal(normalizeFolderName("   "), "New folder");
  assert.equal(normalizeFolderName("", "Kept"), "Kept");
  assert.equal(normalizeFolderName(5, "Kept"), "Kept");
  assert.equal(normalizeFolderName("x".repeat(70)), "x".repeat(60));
});
