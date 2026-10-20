const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const fixturePath = path.join(__dirname, "fixtures", "theme-baseline.json");

test("baseline fixture matches current output", async () => {
  const { buildStyleBaseline } = await import("../../scripts/capture-theme-baseline.mjs");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const current = await buildStyleBaseline();
  assert.deepEqual(current.sticky, fixture.sticky);
  assert.deepEqual(current.tabs, fixture.tabs);
});
