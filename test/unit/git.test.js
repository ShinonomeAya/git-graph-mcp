const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GitError,
  normalizeLimit,
  parseStatusLines,
  resolveRepo,
} = require("../../src/git");

test("normalizeLimit accepts bounded integer input and rejects malformed values", () => {
  assert.equal(normalizeLimit(undefined), 80);
  assert.equal(normalizeLimit("12"), 12);
  assert.equal(normalizeLimit(500), 500);
  assert.throws(() => normalizeLimit(""), (error) => error.code === "INVALID_LIMIT");
  assert.throws(() => normalizeLimit("1.5"), (error) => error.code === "INVALID_LIMIT");
  assert.throws(() => normalizeLimit(501), (error) => error.code === "INVALID_LIMIT");
});
test("parseStatusLines preserves compact lines and separates index/worktree changes", () => {
  const status = parseStatusLines([
    "## main",
    "M  staged.txt",
    " M modified.txt",
    "?? new.txt",
  ]);

  assert.deepEqual(status.lines, [
    "## main",
    "M  staged.txt",
    " M modified.txt",
    "?? new.txt",
  ]);
  assert.equal(status.branch, "main");
  assert.equal(status.isDirty, true);
  assert.equal(status.index.changed, 1);
  assert.equal(status.worktree.changed, 2);
  assert.deepEqual(status.entries.map((entry) => entry.path), [
    "staged.txt",
    "modified.txt",
    "new.txt",
  ]);
});

test("resolveRepo normalizes a Git directory and reports stable path errors", () => {
  assert.throws(
    () => resolveRepo("C:/path/that/does/not/exist/git-graph-mcp"),
    (error) => error instanceof GitError && error.code === "INVALID_REPO_PATH"
  );
});
