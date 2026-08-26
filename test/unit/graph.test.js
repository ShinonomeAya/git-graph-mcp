const test = require("node:test");
const assert = require("node:assert/strict");
const { buildGraphRows, renderGraphAfter, renderLane } = require("../../src/graph");

function commit(hash, parents = [], graphPrefix = "") {
  return {
    hash,
    parents,
    graphPrefix,
    graphAfter: [],
  };
}

test("buildGraphRows returns an empty list for empty or invalid history", () => {
  assert.deepEqual(buildGraphRows([]), []);
  assert.deepEqual(buildGraphRows(null), []);
});

test("buildGraphRows keeps a linear history in one lane", () => {
  const rows = buildGraphRows([
    commit("a", ["b"]),
    commit("b"),
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].lane, 0);
  assert.equal(rows[0].width, 1);
  assert.equal(rows[1].lane, 0);
  assert.equal(rows[1].isMerge, false);
});

test("buildGraphRows adds a second lane for a merge parent", () => {
  const rows = buildGraphRows([
    commit("merge", ["main", "feature"]),
    commit("main", ["root"]),
    commit("feature", ["root"]),
    commit("root"),
  ]);

  assert.equal(rows[0].isMerge, true);
  assert.equal(rows[0].width, 2);
  assert.deepEqual(rows[0].lanes, ["merge"]);
  assert.equal(rows[1].lane, 0);
  assert.equal(rows[2].lane, 1);
});

test("renderLane converts graph prefixes to commit markers", () => {
  assert.equal(renderLane({ commit: commit("a", [], "| *"), isMerge: false }), "| ●");
  assert.equal(renderLane({ commit: commit("a", ["b", "c"], "| *"), isMerge: true }), "| ◆");
});

test("renderGraphAfter renders continuation markers", () => {
  const row = {
    commit: {
      graphAfter: ["|\\", "| *"],
    },
  };

  assert.deepEqual(renderGraphAfter(row), ["|\\", "| ●"]);
});
