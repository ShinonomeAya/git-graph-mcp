const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { commitFile, createTempRepo } = require("../helpers/git-repo");
const { buildContextBundle } = require("../../src/context");
const { selectionPath, writeSelection } = require("../../src/state");

test("context bundle returns bounded metadata and only includes patch when requested", () => {
  const repo = createTempRepo();
  try {
    const first = commitFile(repo, "one.txt", "one\n", "one");
    const second = commitFile(repo, "two.txt", "two\n", "two");
    writeSelection(repo.root, { selectedCommit: first });

    const metadata = buildContextBundle(repo.root, {
      maxCommits: 1,
      maxFiles: 1,
      maxBytes: 1600,
    });
    assert.equal(metadata.schemaVersion, 2);
    assert.equal(metadata.selection.kind, "commit");
    assert.equal(metadata.selection.oid, first);
    assert.equal(metadata.patch, null);
    assert.equal(metadata.budget.includePatch, false);
    assert.equal(metadata.budget.maxCommits, 1);
    assert.equal(metadata.budget.maxFiles, 1);
    assert.equal(metadata.budget.maxBytes, 1600);
    assert.equal(metadata.provenance.git, "system-git");
    assert.equal(typeof metadata.generatedAt, "string");
    assert.equal(typeof metadata.generationMs, "number");
    assert.ok(metadata.graph.commits.length <= 1);
    assert.ok(metadata.changedFiles.length <= 1);

    const withPatch = buildContextBundle(repo.root, {
      maxCommits: 2,
      maxFiles: 2,
      maxBytes: 512,
      includePatch: true,
    });
    assert.equal(withPatch.budget.includePatch, true);
    assert.ok(withPatch.patch);
    assert.equal(withPatch.patch.truncated, true);
    assert.ok(Buffer.byteLength(withPatch.patch.text, "utf8") <= 512);
    assert.equal(withPatch.selection.oid, first);
    assert.ok(second);
  } finally {
    repo.cleanup();
  }
});

test("context bundle distinguishes commit, range, stale, dirty, and divergent states", () => {
  const repo = createTempRepo();
  try {
    const base = commitFile(repo, "base.txt", "base\n", "base");
    const feature = commitFile(repo, "feature.txt", "feature\n", "feature");
    writeSelection(repo.root, { selection: { kind: "range", baseOid: base, headOid: feature } });
    const range = buildContextBundle(repo.root);
    assert.equal(range.selection.kind, "range");
    assert.equal(range.comparison.kind, "range");
    assert.deepEqual(range.comparison.range, { baseOid: base, headOid: feature });

    writeSelection(repo.root, { selectedCommit: base });
    fs.writeFileSync(selectionPath(repo.root), JSON.stringify({
      schemaVersion: 2,
      repoRoot: repo.root,
      selection: { kind: "commit", oid: "0".repeat(40) },
    }));
    const stale = buildContextBundle(repo.root);
    assert.equal(stale.selectionState, "stale");
    assert.equal(stale.comparison, null);
    assert.ok(stale.warnings.some((warning) => /stale/i.test(warning)));

    writeSelection(repo.root, { selectedCommit: feature });
    fs.writeFileSync(path.join(repo.root, "dirty.txt"), "dirty\n");
    const dirty = buildContextBundle(repo.root);
    assert.equal(dirty.status.isDirty, true);
    assert.ok(dirty.warnings.some((warning) => /working tree/i.test(warning)));

    repo.runGit(["checkout", "-b", "side"]);
    const side = commitFile(repo, "side.txt", "side\n", "side");
    repo.runGit(["checkout", "master"]);
    const main = commitFile(repo, "main.txt", "main\n", "main");
    writeSelection(repo.root, { selectedCommit: side });
    const divergent = buildContextBundle(repo.root);
    assert.equal(divergent.selectionState, "valid");
    assert.equal(divergent.comparison.relation, "DIVERGED");
    assert.ok(divergent.warnings.some((warning) => /diverged/i.test(warning)));
    assert.ok(main);
  } finally {
    repo.cleanup();
  }
});

test("context bundle rejects invalid budgets with stable errors", () => {
  const repo = createTempRepo();
  try {
    commitFile(repo, "one.txt", "one\n", "one");
    assert.throws(
      () => buildContextBundle(repo.root, { maxBytes: 0 }),
      (error) => error.code === "INVALID_CONTEXT_BUDGET"
    );
  } finally {
    repo.cleanup();
  }
});
