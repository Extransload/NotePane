const test = require("node:test");
const assert = require("node:assert/strict");

const load = async () => ({
  sel: await import("../../src/editor/blockSelection.js"),
  model: await import("@tiptap/pm/model"),
  state: await import("@tiptap/pm/state"),
  transform: await import("@tiptap/pm/transform"),
});

async function setup() {
  const m = await load();
  const { Schema } = m.model;
  const schema = new Schema({
    nodes: {
      doc: { content: "blockGroup" },
      blockGroup: { content: "blockContainer+" },
      blockContainer: { content: "paragraph blockGroup?", attrs: { id: { default: null } } },
      paragraph: { content: "text*" },
      text: {},
    },
  });
  const para = () => schema.nodes.paragraph.create();
  const bc = (id, children) => schema.nodes.blockContainer.create(
    { id }, children ? [para(), schema.nodes.blockGroup.create(null, children)] : [para()]);
  const doc = schema.nodes.doc.create(null, schema.nodes.blockGroup.create(null, [
    bc("a"), bc("b"), bc("p", [bc("c1"), bc("c2"), bc("c3")]), bc("f"),
  ]));
  const posOf = (d, id) => {
    let found;
    d.descendants((n, pos) => { if (n.attrs.id === id) found = pos; });
    return found;
  };
  const del = (d, id) => {
    const pos = posOf(d, id);
    const tr = new m.transform.Transform(d).delete(pos, pos + d.nodeAt(pos).nodeSize);
    return tr;
  };
  return { ...m, doc, posOf, del };
}
const spans = (s) => s.ranges.map((r) => [r.$from.pos, r.$to.pos]);

test("contiguous ids give one range, non-adjacent ids give several", async () => {
  const { sel, doc, posOf } = await setup();
  const one = sel.createBlockSetSelection(doc, ["a", "b"]);
  assert.equal(one.ranges.length, 1);
  assert.deepEqual(sel.getBlockSetIds(one), ["a", "b"]);
  const two = sel.createBlockSetSelection(doc, ["a", "p"]);
  assert.equal(two.ranges.length, 2);
  assert.equal(two.from, posOf(doc, "a"));
  assert.equal(sel.createBlockSetSelection(doc, ["nope"]), null);
  assert.equal(sel.isBlockSetSelection(one), true);
});

test("nested selections return the children, not the parent", async () => {
  const { sel, doc } = await setup();
  const ids = (list) => sel.getBlockSetIds(sel.createBlockSetSelection(doc, list));
  assert.deepEqual(ids(["c1"]), ["c1"]);
  assert.deepEqual(ids(["c2", "c3"]), ["c2", "c3"]);
  assert.deepEqual(ids(["c1", "c3"]), ["c1", "c3"]);
  assert.equal(sel.createBlockSetSelection(doc, ["c1", "c3"]).ranges.length, 2);
  assert.deepEqual(ids(["p", "c1"]), ["p"]);
});

test("eq and JSON round-trip", async () => {
  const { sel, state, doc } = await setup();
  const a = sel.createBlockSetSelection(doc, ["a", "c2"]);
  assert.ok(a.eq(sel.createBlockSetSelection(doc, ["c2", "a"])));
  assert.ok(!a.eq(sel.createBlockSetSelection(doc, ["a"])));
  const back = state.Selection.fromJSON(doc, JSON.parse(JSON.stringify(a.toJSON())));
  assert.equal(a.toJSON().type, "notepane-block-set");
  assert.ok(a.eq(back));
});

test("map merges ranges that become adjacent", async () => {
  const { sel, doc, del } = await setup();
  const s = sel.createBlockSetSelection(doc, ["a", "p"]);
  const tr = del(doc, "b");
  const mapped = s.map(tr.doc, tr.mapping);
  assert.equal(mapped.ranges.length, 1);
  assert.ok(mapped.eq(sel.createBlockSetSelection(tr.doc, ["a", "p"])));
});

test("map keeps survivors when the first block of a run is deleted", async () => {
  const { sel, doc, del } = await setup();
  const s = sel.createBlockSetSelection(doc, ["a", "b"]);
  const tr = del(doc, "a");
  const mapped = s.map(tr.doc, tr.mapping);
  assert.ok(sel.isBlockSetSelection(mapped));
  assert.deepEqual(sel.getBlockSetIds(mapped), ["b"]);
  const s2 = sel.createBlockSetSelection(doc, ["c1", "c2"]);
  const tr2 = del(doc, "c2");
  assert.deepEqual(sel.getBlockSetIds(s2.map(tr2.doc, tr2.mapping)), ["c1"]);
});

test("map falls back to a non-block selection when everything is deleted", async () => {
  const { sel, doc, del } = await setup();
  const s = sel.createBlockSetSelection(doc, ["b"]);
  const tr = del(doc, "b");
  const mapped = s.map(tr.doc, tr.mapping);
  assert.equal(sel.isBlockSetSelection(mapped), false);
});
