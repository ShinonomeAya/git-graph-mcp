const assert = require("node:assert/strict");
const test = require("node:test");

const {
  moveSelection,
  pickWindow,
  renderStaticGraph,
  truncateText,
} = require("../../src/tui");

function commit(hash, subject, parents = []) {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents,
    refs: [],
    subject,
    graphPrefix: "",
    graphAfter: [],
    author: { name: "tester", email: "tester@example.invalid" },
    date: "2026-08-26T00:00:00.000Z",
  };
}

test("moveSelection clamps at both ends and handles an empty list", () => {
  assert.equal(moveSelection(0, -1, 3), 0);
  assert.equal(moveSelection(2, 1, 3), 2);
  assert.equal(moveSelection(1, -1, 3), 0);
  assert.equal(moveSelection(0, 1, 0), -1);
});
test("pickWindow keeps the selected row visible and handles empty history", () => {
  const rows = [0, 1, 2, 3, 4].map((value) => ({ row: value }));
  assert.deepEqual(pickWindow(rows, 4, 3).map((item) => item.index), [0, 1, 2, 3, 4]);
  assert.deepEqual(pickWindow([], -1, 3), []);
});

test("empty static graphs render a clear bounded plain state", () => {
  const output = renderStaticGraph({ branch: "master", head: "NO_COMMITS", root: "C:/repo" }, [], -1, undefined, false, {
    width: 32,
    height: 12,
  });

  assert.match(output, /No commits yet/);
  assert.equal(/\x1b\[[0-9;?]*[ -/]*[@-~]/.test(output), false);
  assert.ok(output.split("\n").every((line) => line.length <= 32));
});

test("static graph output truncates long fields without changing commit data", () => {
  const rows = [{
    commit: commit("abcdef0123456789", "A very long subject that must be bounded for a narrow terminal"),
    lane: 0,
    lanes: ["abcdef0123456789"],
    width: 1,
    isMerge: false,
  }];
  const output = renderStaticGraph({ branch: "master", head: "abcdef0", root: "C:/a/very/long/repository/path" }, rows, 0, "saved", false, {
    width: 36,
    height: 12,
  });

  assert.match(output, /Selected: abcdef0/);
  assert.match(output, /…/);
  assert.ok(output.split("\n").every((line) => line.length <= 36));
  assert.equal(truncateText("short", 10), "short");
});
