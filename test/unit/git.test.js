const assert = require("node:assert/strict");
const test = require("node:test");

const { commitFile, createTempRepo } = require("../helpers/git-repo");

const {
  GitError,
  normalizeLimit,
  parseStatusLines,
  readCommitDiff,
  readFileHistory,
  searchCommits,
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

test("searchCommits pages deterministic metadata and preserves filters in its cursor", () => {
  const repo = createTempRepo();
  try {
    const base = commitFile(repo, "base.txt", "base\n", "base");
    const unicode = commitFile(repo, "unicode.txt", "✓\n", "修复 ✓");
    const latest = commitFile(repo, "latest.txt", "latest\n", "latest");
    repo.runGit(["branch", "search-ref"]);

    const before = {
      head: repo.runGit(["rev-parse", "HEAD"]).trim(),
      refs: repo.runGit(["show-ref"]).trim(),
      status: repo.runGit(["status", "--porcelain=v1"]).trim(),
    };
    const first = searchCommits(repo.root, { pageSize: 1 });
    assert.equal(first.schemaVersion, 2);
    assert.equal(first.results.length, 1);
    assert.equal(first.results[0].hash, latest);
    assert.equal(first.page.hasMore, true);
    assert.equal(typeof first.page.nextCursor, "string");

    const second = searchCommits(repo.root, { pageSize: 1, cursor: first.page.nextCursor });
    assert.equal(second.results.length, 1);
    assert.notEqual(second.results[0].hash, first.results[0].hash);
    assert.equal(second.page.cursor, first.page.nextCursor);

    const filtered = searchCommits(repo.root, {
      pageSize: 10,
      ref: "refs/heads/search-ref",
      author: "git-graph-mcp tests",
      message: "修复 ✓",
      since: "2000-01-01",
      until: "2030-01-01",
    });
    assert.deepEqual(filtered.results.map((commit) => commit.hash), [unicode]);
    assert.equal(filtered.filters.ref, "refs/heads/search-ref");
    assert.equal(filtered.page.hasMore, false);
    assert.equal(filtered.page.nextCursor, null);

    const empty = searchCommits(repo.root, { message: "does-not-exist" });
    assert.deepEqual(empty.results, []);
    assert.equal(empty.page.hasMore, false);

    assert.throws(
      () => searchCommits(repo.root, { ref: "main" }),
      (error) => error.code === "INVALID_REF"
    );
    assert.throws(
      () => searchCommits(repo.root, { ref: "refs/heads/missing" }),
      (error) => error.code === "INVALID_REVISION"
    );
    assert.throws(
      () => searchCommits(repo.root, { pageSize: 0 }),
      (error) => error.code === "INVALID_SEARCH_FILTER"
    );
    assert.throws(
      () => searchCommits(repo.root, { cursor: "not-a-cursor" }),
      (error) => error.code === "INVALID_SEARCH_CURSOR"
    );
    assert.throws(
      () => searchCommits(repo.root, { message: "other", cursor: first.page.nextCursor }),
      (error) => error.code === "INVALID_SEARCH_CURSOR"
    );

    assert.deepEqual({
      head: repo.runGit(["rev-parse", "HEAD"]).trim(),
      refs: repo.runGit(["show-ref"]).trim(),
      status: repo.runGit(["status", "--porcelain=v1"]).trim(),
    }, before);
    assert.ok(base);
  } finally {
    repo.cleanup();
  }
});

test("commit diff and file history reject unsafe paths and expose bounded patch metadata", () => {
  const repo = createTempRepo();
  try {
    const first = commitFile(repo, "history.txt", "one\n", "initial");
    const second = commitFile(repo, "history.txt", `${"x".repeat(500)}\n`, "large update");
    const diff = readCommitDiff(repo.root, second, {
      path: "history.txt",
      includePatch: true,
      maxBytes: 256,
    });
    assert.equal(diff.schemaVersion, 2);
    assert.equal(diff.isInitial, false);
    assert.equal(diff.files[0].status, "M");
    assert.equal(diff.files[0].isBinary, false);
    assert.equal(diff.patch.requested, true);
    assert.equal(diff.patch.truncated, true);
    assert.ok(Buffer.byteLength(diff.patch.text, "utf8") <= 256);

    const history = readFileHistory(repo.root, {
      path: "history.txt",
      pageSize: 1,
    });
    assert.equal(history.schemaVersion, 2);
    assert.equal(history.results[0].hash, second);
    assert.equal(history.page.hasMore, true);
    assert.equal(readFileHistory(repo.root, {
      path: "history.txt",
      pageSize: 1,
      cursor: history.page.nextCursor,
    }).results[0].hash, first);

    assert.throws(
      () => readCommitDiff(repo.root, second, { path: "../history.txt" }),
      (error) => error.code === "INVALID_GIT_PATH"
    );
    assert.throws(
      () => readFileHistory(repo.root, { path: require("node:path").join(repo.root, "history.txt") }),
      (error) => error.code === "INVALID_GIT_PATH"
    );
  } finally {
    repo.cleanup();
  }
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
