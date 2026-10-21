const test = require("node:test");
const assert = require("node:assert/strict");

const loadRules = () => import("../../src/editor/blockSelectionRules.js");

test("normalises touched blocks to the shallowest touched level", async () => {
  const { normalizeTouchedBlocks: n } = await loadRules();
  assert.deepEqual(n([]), []);
  assert.deepEqual(n([{ id: "a", ancestorIds: [] }, { id: "b", ancestorIds: [] }]), ["a", "b"]);
  assert.deepEqual(n([{ id: "c1", ancestorIds: ["p"] }]), ["c1"]);
  assert.deepEqual(n([{ id: "c1", ancestorIds: ["p"] }, { id: "f", ancestorIds: [] }]), ["p", "f"]);
  assert.deepEqual(n([{ id: "p", ancestorIds: [] }, { id: "c1", ancestorIds: ["p"] }]), ["p"]);
  assert.deepEqual(n([{ id: "g", ancestorIds: ["p", "c"] }, { id: "c2", ancestorIds: ["p"] }]), ["c", "c2"]);
});

test("moves each selected sibling past its unselected neighbour, or nothing at an edge", async () => {
  const { planSiblingMove: m } = await loadRules();
  const s = ["a", "b", "c", "d"];
  assert.deepEqual(m(s, ["c"], -1), ["a", "c", "b", "d"]);
  assert.deepEqual(m(s, ["b", "d"], -1), ["b", "a", "d", "c"]);
  assert.deepEqual(m(s, ["b", "c"], -1), ["b", "c", "a", "d"]);
  assert.deepEqual(m(s, ["a", "c"], 1), ["b", "a", "d", "c"]);
  assert.equal(m(s, ["a", "c"], -1), null);
  assert.equal(m(s, ["d"], 1), null);
  assert.equal(m(s, [], 1), null);
});
