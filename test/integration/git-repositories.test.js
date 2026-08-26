const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  commitFile,
  createTempRepo,
} = require("../helpers/git-repo");
const {
  compareWithHead,
  getGitContext,
  getGitStatus,
  readCommit,
  resolveRepo,
} = require("../../src/git");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const BIN = path.join(PROJECT_ROOT, "bin", "git-graph-mcp.js");

function withRepo(callback) {
  const repo = createTempRepo();
  try {
    return callback(repo);
  } finally {
    repo.cleanup();
  }
}

function snapshotGitState(repo) {
  return {
    head: repo.runGit(["rev-parse", "--verify", "HEAD"]).trim(),
    refs: repo.runGit(["show-ref"]).trim(),
    status: repo.runGit(["status", "--porcelain=v1"]).trim(),
  };
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

function createLinearFixture() {
  const repo = createTempRepo();
  const base = commitFile(repo, "base.txt", "base\n", "base");
  const mainBranch = repo.runGit(["branch", "--show-current"]).trim();
  repo.runGit(["checkout", "-b", "ahead"]);
  const ahead = commitFile(repo, "ahead.txt", "ahead\n", "ahead");
  repo.runGit(["checkout", mainBranch]);
  return { repo, base, ahead, mainBranch };
}

function createDivergedFixture() {
  const repo = createTempRepo();
  const base = commitFile(repo, "base.txt", "base\n", "base");
  const mainBranch = repo.runGit(["branch", "--show-current"]).trim();
  repo.runGit(["checkout", "-b", "feature"]);
  const feature = commitFile(repo, "feature.txt", "feature\n", "feature");
  repo.runGit(["checkout", mainBranch]);
  const head = commitFile(repo, "main.txt", "main\n", "main");
  return { repo, base, feature, head, mainBranch };
}

test("empty repositories return an explicit no-HEAD context", () => {
  withRepo((repo) => {
    const context = getGitContext(repo.root);

    assert.equal(context.root, path.resolve(repo.root));
    assert.equal(context.head, "NO_COMMITS");
    assert.equal(context.headOid, null);
    assert.equal(context.isEmpty, true);
    assert.deepEqual(context.commits, []);

    const status = getGitStatus(repo.root);
    assert.equal(status.isEmpty, true);
    assert.equal(status.headOid, null);
    assert.equal(status.isDirty, false);
  });
});

test("clean, staged, unstaged, and untracked states have structured status", () => {
  withRepo((repo) => {
    const commit = commitFile(repo, "tracked.txt", "one\n", "initial");
    const clean = getGitStatus(repo.root);
    assert.equal(clean.isDirty, false);
    assert.equal(clean.isEmpty, false);
    assert.equal(clean.headOid, commit);
    assert.equal(clean.index.changed, 0);
    assert.equal(clean.worktree.changed, 0);

    fs.writeFileSync(path.join(repo.root, "tracked.txt"), "two\n");
    const unstaged = getGitStatus(repo.root);
    assert.equal(unstaged.isDirty, true);
    assert.equal(unstaged.worktree.changed, 1);

    repo.runGit(["add", "--", "tracked.txt"]);
    const staged = getGitStatus(repo.root);
    assert.equal(staged.index.changed, 1);

    fs.writeFileSync(path.join(repo.root, "untracked.txt"), "new\n");
    const untracked = getGitStatus(repo.root);
    assert.equal(untracked.entries.find((entry) => entry.path === "untracked.txt").untracked, true);
  });
});

test("detached HEAD is normalized without changing the repository", () => {
  withRepo((repo) => {
    const first = commitFile(repo, "one.txt", "one\n", "one");
    commitFile(repo, "two.txt", "two\n", "two");
    const before = snapshotGitState(repo);

    repo.runGit(["checkout", "--detach", first]);
    const context = getGitContext(repo.root);
    const status = getGitStatus(repo.root);

    assert.equal(context.branch, "DETACHED");
    assert.equal(context.isDetached, true);
    assert.equal(status.branch, "DETACHED");
    assert.equal(status.isDetached, true);
    assert.equal(context.headOid, first);

    const after = snapshotGitState(repo);
    assert.notEqual(after.head, before.head);
    assert.equal(after.status, before.status);
  });
});

test("read-only Git reads preserve refs, index, and worktree state", () => {
  withRepo((repo) => {
    const commit = commitFile(repo, "tracked.txt", "one\n", "initial");
    fs.writeFileSync(path.join(repo.root, "tracked.txt"), "dirty\n");
    const before = snapshotGitState(repo);

    getGitContext(repo.root, 10);
    getGitStatus(repo.root);
    readCommit(repo.root, commit);

    assert.deepEqual(snapshotGitState(repo), before);
  });
});

test("repository and revision failures use normalized domain error codes", () => {
  withRepo((repo) => {
    const commit = commitFile(repo, "tracked.txt", "one\n", "initial");
    assert.equal(resolveRepo(repo.root), path.resolve(repo.root));
    assert.throws(
      () => readCommit(repo.root, "does-not-exist"),
      (error) => error.code === "INVALID_REVISION"
    );
    assert.equal(readCommit(repo.root, commit).selectedCommit, commit);
  });

  const notRepo = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "git-graph-mcp-not-repo-"));
  try {
    assert.throws(
      () => resolveRepo(notRepo),
      (error) => error.code === "NOT_GIT_REPOSITORY"
    );
  } finally {
    fs.rmSync(notRepo, { recursive: true, force: true });
  }
});

test("comparison classifies SAME, ANCESTOR, and DESCENDANT with symmetric counts", () => {
  const { repo, base, ahead } = createLinearFixture();
  try {
    const same = compareWithHead(repo.root, base);
    assert.equal(same.relation, "SAME");
    assert.equal(same.mergeBaseOid, base);
    assert.equal(same.headAheadCount, 0);
    assert.equal(same.headBehindCount, 0);

    const ancestor = compareWithHead(repo.root, base);
    assert.equal(ancestor.relation, "SAME");

    repo.runGit(["checkout", "ahead"]);
    const descendant = compareWithHead(repo.root, base);
    assert.equal(descendant.relation, "ANCESTOR");
    assert.equal(descendant.headAheadCount, 1);
    assert.equal(descendant.headBehindCount, 0);

    repo.runGit(["checkout", "--detach", base]);
    const selectedAhead = compareWithHead(repo.root, ahead);
    assert.equal(selectedAhead.relation, "DESCENDANT");
    assert.equal(selectedAhead.headAheadCount, 0);
    assert.equal(selectedAhead.headBehindCount, 1);
    assert.ok(selectedAhead.warnings.some((warning) => /ahead of HEAD/i.test(warning)));
  } finally {
    repo.cleanup();
  }
});

test("merge comparisons return deterministic, de-duplicated changed files", () => {
  const repo = createTempRepo();
  try {
    commitFile(repo, "base.txt", "base\n", "base");
    const mainBranch = repo.runGit(["branch", "--show-current"]).trim();
    repo.runGit(["checkout", "-b", "feature"]);
    const feature = commitFile(repo, "feature.txt", "feature\n", "feature");
    repo.runGit(["checkout", mainBranch]);
    commitFile(repo, "main.txt", "main\n", "main");
    repo.runGit(["merge", "--no-ff", "feature", "-m", "merge feature"]);

    const result = compareWithHead(repo.root, feature);
    assert.equal(result.relation, "ANCESTOR");
    assert.equal(new Set(result.changedFiles).size, result.changedFiles.length);
    assert.deepEqual(result.changedFiles, ["A\tmain.txt"]);
  } finally {
    repo.cleanup();
  }
});

test("comparison classifies DIVERGED, reports both sides, and warns on dirty state", () => {
  const { repo, base, feature, head } = createDivergedFixture();
  try {
    const result = compareWithHead(repo.root, feature);
    assert.equal(result.relation, "DIVERGED");
    assert.equal(result.mergeBaseOid, base);
    const [expectedBehind, expectedAhead] = repo.runGit([
      "rev-list",
      "--left-right",
      "--count",
      `${feature}...${head}`,
    ]).trim().split(/\s+/).map(Number);
    assert.equal(result.headAheadCount, expectedAhead);
    assert.equal(result.headBehindCount, expectedBehind);
    assert.deepEqual(result.commitsUniqueToHead.length, 1);
    assert.deepEqual(result.commitsUniqueToSelection.length, 1);
    assert.equal(new Set(result.changedFiles).size, result.changedFiles.length);
    assert.equal(result.isWorkingTreeDirty, false);
    assert.ok(result.warnings.some((warning) => /diverged/i.test(warning)));

    fs.writeFileSync(path.join(repo.root, "dirty.txt"), "dirty\n");
    const dirty = compareWithHead(repo.root, feature);
    assert.equal(dirty.isWorkingTreeDirty, true);
    assert.ok(dirty.warnings.some((warning) => /working tree/i.test(warning)));
    assert.equal(dirty.headOid, head);

    const inspect = runCli(["inspect", feature, "--repo", repo.root], PROJECT_ROOT);
    assert.equal(inspect.status, 0, inspect.stderr);
    const beforeCompare = snapshotGitState(repo);
    const compare = runCli(["compare-selected", "--repo", repo.root], PROJECT_ROOT);
    assert.equal(compare.status, 0, compare.stderr);
    assert.equal(JSON.parse(compare.stdout).relation, "DIVERGED");
    assert.deepEqual(snapshotGitState(repo), beforeCompare);
  } finally {
    repo.cleanup();
  }
});

test("CLI rejects unknown options and options without values", () => {
  const unknown = runCli(["status", "--wat"], PROJECT_ROOT);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr.trim(), /^Unknown option: --wat$/);

  const missing = runCli(["status", "--repo"], PROJECT_ROOT);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr.trim(), /^Option --repo requires a value\.$/);
});

test("CLI graph and status commands work against a temporary repository", () => {
  withRepo((repo) => {
    const commit = commitFile(repo, "tracked.txt", "one\n", "initial");
    const graph = runCli(["graph", "--repo", repo.root, "--plain", "--limit", "5"], PROJECT_ROOT);
    assert.equal(graph.status, 0, graph.stderr);
    assert.match(graph.stdout, /git-graph-mcp/);

    const status = runCli(["status", "--repo", repo.root], PROJECT_ROOT);
    assert.equal(status.status, 0, status.stderr);
    const parsed = JSON.parse(status.stdout);
    assert.equal(parsed.repo, path.resolve(repo.root));
    assert.equal(parsed.statusDetails.isDirty, false);

    const inspect = runCli(["inspect", commit, "--repo", repo.root], PROJECT_ROOT);
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.equal(JSON.parse(inspect.stdout).selectedCommit, commit);
  });
});
