const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildRangeSelection,
  buildRefSelection,
  moveSelection,
  pickWindow,
  resolveVisibleRef,
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

test("range selection draft exposes both anchors and resolves a visible branch ref", () => {
  const baseOid = "a".repeat(40);
  const headOid = "b".repeat(40);
  const current = commit(headOid, "head");
  current.refs = ["main"];

  assert.deepEqual(buildRangeSelection(baseOid, headOid), {
    kind: "range",
    baseOid,
    headOid,
  });
  assert.equal(resolveVisibleRef({ branch: "main", headOid }, current), "refs/heads/main");
  assert.deepEqual(buildRefSelection({ branch: "main", headOid }, current), {
    kind: "ref",
    ref: "refs/heads/main",
    oid: headOid,
  });

  const output = renderStaticGraph(
    { branch: "main", head: headOid.slice(0, 7), headOid, root: "C:/repo" },
    [{ commit: current, lane: 0, lanes: [headOid], width: 1, isMerge: false }],
    0,
    "Move to endpoint and press e to save",
    false,
    {
      width: 80,
      height: 16,
      selectionDraft: buildRangeSelection(baseOid, headOid),
    }
  );
  assert.match(output, /Selection mode: RANGE/);
  assert.match(output, new RegExp(`Range base: ${baseOid.slice(0, 7)}`));
  assert.match(output, new RegExp(`Range head: ${headOid.slice(0, 7)}`));
});

test("visible ref resolution supports tags and rejects commits without a ref", () => {
  const tagCommit = commit("c".repeat(40), "tagged");
  tagCommit.refs = ["tag:v1.0.0"];
  assert.equal(
    resolveVisibleRef({ branch: "main", headOid: "d".repeat(40) }, tagCommit),
    "refs/tags/v1.0.0"
  );

  assert.throws(
    () => resolveVisibleRef({ branch: "DETACHED", headOid: tagCommit.hash }, commit("e".repeat(40), "none")),
    /No full ref is visible/
  );
});
