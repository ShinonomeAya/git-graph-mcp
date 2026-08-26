const assert = require("node:assert/strict");
const test = require("node:test");

const { commitFile, createTempRepo } = require("../helpers/git-repo");

const {
  GitError,
  normalizeLimit,
  parseStatusLines,
  resolveSelectionTarget,
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

test("resolveSelectionTarget returns immutable commit, range, and full-ref selections", () => {
  const repo = createTempRepo();
  try {
    const baseOid = commitFile(repo, "one.txt", "one\n", "one");
    const headOid = commitFile(repo, "two.txt", "two\n", "two");
    const branch = repo.runGit(["branch", "--show-current"]).trim();
    const ref = `refs/heads/${branch}`;

    assert.deepEqual(resolveSelectionTarget(repo.root, { kind: "commit", revision: baseOid }), {
      kind: "commit",
      oid: baseOid,
    });
    assert.deepEqual(resolveSelectionTarget(repo.root, { kind: "range", base: baseOid, head: headOid }), {
      kind: "range",
      baseOid,
      headOid,
    });
    assert.deepEqual(resolveSelectionTarget(repo.root, { kind: "ref", ref }), {
      kind: "ref",
      ref,
      oid: headOid,
    });
  } finally {
    repo.cleanup();
  }
});

test("resolveSelectionTarget rejects option-like revisions and non-full refs", () => {
  const repo = createTempRepo();
  try {
    const oid = commitFile(repo, "one.txt", "one\n", "one");
    assert.throws(
      () => resolveSelectionTarget(repo.root, { kind: "commit", revision: "--all" }),
      (error) => error instanceof GitError && error.code === "INVALID_REVISION"
    );
    assert.throws(
      () => resolveSelectionTarget(repo.root, { kind: "range", base: oid, head: "-HEAD" }),
      (error) => error instanceof GitError && error.code === "INVALID_REVISION"
    );
    assert.throws(
      () => resolveSelectionTarget(repo.root, { kind: "ref", ref: "main" }),
      (error) => error instanceof GitError && error.code === "INVALID_REF"
    );
  } finally {
    repo.cleanup();
  }
});
