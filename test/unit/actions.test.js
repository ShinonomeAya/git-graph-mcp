const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { commitFile, createTempRepo } = require("../helpers/git-repo");
const {
  ActionError,
  buildResetPlan,
  createBranchAtSelected,
  revalidateActionPlan,
  validateBranchName,
} = require("../../src/actions");
const { selectionPath, writeSelection } = require("../../src/state");

function withRepo(callback) {
  const repo = createTempRepo();
  try {
    return callback(repo);
  } finally {
    repo.cleanup();
  }
}

test("branch names require a valid non-option Git branch name", () => {
  withRepo((repo) => {
    assert.equal(validateBranchName(repo.root, "review/selected"), "review/selected");
    assert.throws(() => validateBranchName(repo.root, ""), (error) => error.code === "INVALID_BRANCH_NAME");
    assert.throws(() => validateBranchName(repo.root, "-bad"), (error) => error.code === "INVALID_BRANCH_NAME");
    assert.throws(() => validateBranchName(repo.root, "bad name"), (error) => error.code === "INVALID_BRANCH_NAME");
  });
});

test("branch action requires a current selection", () => {
  withRepo((repo) => {
    commitFile(repo, "one.txt", "one\n", "one");
    assert.throws(
      () => createBranchAtSelected(repo.root, "review/selected"),
      (error) => error instanceof ActionError && error.code === "NO_SELECTION"
    );
  });
});

test("stale selections are rejected before branch creation", () => {
  withRepo((repo) => {
    commitFile(repo, "one.txt", "one\n", "one");
    const file = selectionPath(repo.root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ selectedCommit: "0".repeat(40) }));
    assert.throws(
      () => createBranchAtSelected(repo.root, "review/selected"),
      (error) => error.code === "STALE_SELECTION"
    );
  });
});

test("reset plans describe each mode without executing it", () => {
  withRepo((repo) => {
    const selectedOid = commitFile(repo, "one.txt", "one\n", "one");
    const headOid = commitFile(repo, "two.txt", "two\n", "two");
    writeSelection(repo.root, { selectedCommit: selectedOid });

    for (const [mode, expected] of Object.entries({
      soft: { indexImpact: "UNCHANGED", worktreeImpact: "UNCHANGED" },
      mixed: { indexImpact: "RESET_TO_SELECTED", worktreeImpact: "UNCHANGED" },
      hard: { indexImpact: "RESET_TO_SELECTED", worktreeImpact: "RESET_TRACKED_FILES" },
    })) {
      const plan = buildResetPlan(repo.root, mode);
      assert.equal(plan.schemaVersion, 1);
      assert.equal(plan.repoRoot, path.resolve(repo.root));
      assert.equal(plan.mode, mode);
      assert.equal(plan.selectedOid, selectedOid);
      assert.equal(plan.headOid, headOid);
      assert.equal(plan.relation, "ANCESTOR");
      assert.equal(plan.commitImpact, "HEAD_AND_CURRENT_REF_WOULD_MOVE_TO_SELECTED");
      assert.equal(plan.indexImpact, expected.indexImpact);
      assert.equal(plan.worktreeImpact, expected.worktreeImpact);
      assert.equal(plan.proposedCommand, `git reset --${mode} ${selectedOid}`);
      assert.equal(plan.backupBranchSuggestion, `backup-before-reset-${headOid.slice(0, 7)}`);
      assert.equal(plan.requiresExplicitExternalExecution, true);
    }
  });
});

test("reset plans reject invalid modes and missing selections", () => {
  withRepo((repo) => {
    commitFile(repo, "one.txt", "one\n", "one");
    assert.throws(
      () => buildResetPlan(repo.root, "--hard"),
      (error) => error instanceof ActionError && error.code === "INVALID_RESET_MODE"
    );
    assert.throws(
      () => buildResetPlan(repo.root, "hard"),
      (error) => error instanceof ActionError && error.code === "NO_SELECTION"
    );
  });
});

test("action plan receipts revalidate expiry, dirty state, head, and moved refs", () => {
  withRepo((repo) => {
    const selected = commitFile(repo, "one.txt", "one\n", "one");
    commitFile(repo, "two.txt", "two\n", "two");
    writeSelection(repo.root, { selectedCommit: selected });
    const plan = buildResetPlan(repo.root, "soft");
    assert.match(plan.planId, /^[0-9a-f-]{36}$/);
    assert.equal(typeof plan.createdAt, "string");
    assert.equal(typeof plan.expiresAt, "string");
    assert.ok(plan.stateFingerprint.headOid);
    assert.equal(revalidateActionPlan(repo.root, plan).valid, true);

    assert.throws(
      () => revalidateActionPlan(repo.root, plan, { now: new Date(plan.expiresAt).getTime() + 1 }),
      (error) => error.code === "PLAN_EXPIRED"
    );

    fs.writeFileSync(path.join(repo.root, "dirty.txt"), "dirty\n");
    assert.throws(
      () => revalidateActionPlan(repo.root, plan),
      (error) => error.code === "PLAN_DIRTY_CHANGED"
    );
  });

  withRepo((repo) => {
    const selected = commitFile(repo, "one.txt", "one\n", "one");
    writeSelection(repo.root, { selectedCommit: selected });
    const plan = buildResetPlan(repo.root, "soft");
    commitFile(repo, "two.txt", "two\n", "two");
    assert.throws(
      () => revalidateActionPlan(repo.root, plan),
      (error) => error.code === "PLAN_STALE"
    );
  });
});

test("action plan receipts distinguish a moved selected ref", () => {
  withRepo((repo) => {
    const selected = commitFile(repo, "one.txt", "one\n", "one");
    repo.runGit(["branch", "topic"]);
    writeSelection(repo.root, {
      schemaVersion: 2,
      repoRoot: repo.root,
      selection: {
        kind: "ref",
        ref: "refs/heads/topic",
        oid: selected,
      },
    });
    const plan = buildResetPlan(repo.root, "soft");
    const moved = commitFile(repo, "two.txt", "two\n", "two");
    repo.runGit(["update-ref", "refs/heads/topic", moved]);
    assert.throws(
      () => revalidateActionPlan(repo.root, plan),
      (error) => error.code === "PLAN_REF_MOVED"
    );
  });
});
