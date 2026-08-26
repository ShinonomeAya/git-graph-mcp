const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const { commitFile, createTempRepo } = require("../helpers/git-repo");
const { runNpm } = require("../helpers/npm");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const BIN = path.join(PROJECT_ROOT, "bin", "git-graph-mcp.js");
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/;

function runCli(args, cwd) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
}

function gitSnapshot(cwd) {
  return {
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim(),
    refs: execFileSync("git", ["show-ref"], { cwd, encoding: "utf8" }).trim(),
    status: execFileSync("git", ["status", "--porcelain=v1"], { cwd, encoding: "utf8" }).trim(),
  };
}

test("graph plain and non-TTY fallback are deterministic and ANSI-free", () => {
  const repo = createTempRepo();
  try {
    commitFile(repo, "one.txt", "one\n", "one");
    const plain = runCli(["graph", "--repo", repo.root, "--plain", "--limit", "5"], PROJECT_ROOT);
    const fallback = runCli(["graph", "--repo", repo.root, "--limit", "5"], PROJECT_ROOT);

    assert.equal(plain.status, 0, plain.stderr);
    assert.equal(fallback.status, 0, fallback.stderr);
    assert.equal(ANSI.test(plain.stdout), false);
    assert.equal(ANSI.test(fallback.stdout), false);
    assert.equal(plain.stdout, fallback.stdout);

    const smoke = runNpm(["run", "smoke"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      env: { ...process.env, GIT_GRAPH_MCP_REPO: repo.root },
    });
    assert.equal(smoke.status, 0, smoke.error || smoke.stderr);
    assert.match(smoke.stdout, /git-graph-mcp/);
  } finally {
    repo.cleanup();
  }
});

test("empty repositories render an explicit no-commits state", () => {
  const repo = createTempRepo();
  try {
    const result = runCli(["graph", "--repo", repo.root, "--plain"], PROJECT_ROOT);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /No commits yet/);
  } finally {
    repo.cleanup();
  }
});

test("CLI selection workflow returns one JSON document per machine command", () => {
  const repo = createTempRepo();
  const developmentBefore = gitSnapshot(PROJECT_ROOT);
  try {
    commitFile(repo, "one.txt", "one\n", "one");
    const selectedOid = commitFile(repo, "two.txt", "two\n", "two");
    const status = runCli(["status", "--repo", repo.root], PROJECT_ROOT);
    assert.equal(status.status, 0, status.stderr);
    assert.equal(JSON.parse(status.stdout).statusDetails.isDirty, false);

    const inspect = runCli(["inspect", selectedOid, "--repo", repo.root], PROJECT_ROOT);
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.equal(JSON.parse(inspect.stdout).schemaVersion, 2);
    assert.equal(JSON.parse(inspect.stdout).selection.oid, selectedOid);
    assert.equal(JSON.parse(inspect.stdout).selectedCommit, selectedOid);

    const selected = runCli(["selected", "--repo", repo.root], PROJECT_ROOT);
    assert.equal(selected.status, 0, selected.stderr);
    assert.equal(JSON.parse(selected.stdout).selected.oid, selectedOid);
    assert.equal(JSON.parse(selected.stdout).selectedCommit, selectedOid);

    const compare = runCli(["compare-selected", "--repo", repo.root], PROJECT_ROOT);
    assert.equal(compare.status, 0, compare.stderr);
    const comparison = JSON.parse(compare.stdout);
    assert.equal(comparison.selectedOid, selectedOid);
    assert.equal(comparison.relation, "SAME");

    const invalid = runCli(["graph", "--repo", repo.root, "--limit", "0"], PROJECT_ROOT);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr.trim(), /^limit must be an integer from 1 to 500\.$/);
  } finally {
    repo.cleanup();
    assert.deepEqual(gitSnapshot(PROJECT_ROOT), developmentBefore);
  }
});

test("CLI search returns deterministic pages and an explicit cursor", () => {
  const repo = createTempRepo();
  try {
    const first = commitFile(repo, "one.txt", "one\n", "one");
    const second = commitFile(repo, "two.txt", "two\n", "two");
    const page = runCli(["search", "--repo", repo.root, "--limit", "1"], PROJECT_ROOT);
    assert.equal(page.status, 0, page.stderr);
    const parsed = JSON.parse(page.stdout);
    assert.equal(parsed.schemaVersion, 2);
    assert.equal(parsed.results.length, 1);
    assert.equal(parsed.results[0].hash, second);
    assert.equal(parsed.page.hasMore, true);
    assert.equal(typeof parsed.page.nextCursor, "string");

    const next = runCli([
      "search",
      "--repo", repo.root,
      "--limit", "1",
      "--cursor", parsed.page.nextCursor,
    ], PROJECT_ROOT);
    assert.equal(next.status, 0, next.stderr);
    const nextParsed = JSON.parse(next.stdout);
    assert.equal(nextParsed.results[0].hash, first);
    assert.equal(nextParsed.page.hasMore, false);
  } finally {
    repo.cleanup();
  }
});

test("typed CLI selection resolves commit, range, and full ref without changing Git state", () => {
  const repo = createTempRepo();
  try {
    const baseOid = commitFile(repo, "one.txt", "one\n", "one");
    const headOid = commitFile(repo, "two.txt", "two\n", "two");
    const branch = execFileSync("git", ["branch", "--show-current"], { cwd: repo.root, encoding: "utf8" }).trim();
    const ref = `refs/heads/${branch}`;
    const before = gitSnapshot(repo.root);

    const commit = runCli(["select", "commit", baseOid, "--repo", repo.root], PROJECT_ROOT);
    assert.equal(commit.status, 0, commit.stderr);
    assert.deepEqual(JSON.parse(commit.stdout).selection, { kind: "commit", oid: baseOid });

    const range = runCli(["select", "range", baseOid, headOid, "--repo", repo.root], PROJECT_ROOT);
    assert.equal(range.status, 0, range.stderr);
    assert.deepEqual(JSON.parse(range.stdout).selection, { kind: "range", baseOid, headOid });

    const refSelection = runCli(["select", "ref", ref, "--repo", repo.root], PROJECT_ROOT);
    assert.equal(refSelection.status, 0, refSelection.stderr);
    assert.deepEqual(JSON.parse(refSelection.stdout).selection, { kind: "ref", ref, oid: headOid });

    assert.deepEqual(gitSnapshot(repo.root), before);
  } finally {
    repo.cleanup();
  }
});
