const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { commitFile, createTempRepo } = require("../helpers/git-repo");
const { buildResetPlan, createBranchAtSelected, revalidateActionPlan } = require("../../src/actions");
const { writeSelection } = require("../../src/state");

function snapshot(repo) {
  return {
    head: repo.runGit(["rev-parse", "HEAD"]).trim(),
    refs: repo.runGit(["show-ref"]).trim(),
    status: repo.runGit(["status", "--porcelain=v1"]).trim(),
    index: repo.runGit(["write-tree"]).trim(),
    files: fs.readdirSync(repo.root).sort(),
  };
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

test("branch creation changes exactly one new ref and is idempotent", () => {
  const repo = createTempRepo();
  try {
    const selectedOid = commitFile(repo, "one.txt", "one\n", "one");
    writeSelection(repo.root, { selectedCommit: selectedOid });
    const before = snapshot(repo);

    const created = createBranchAtSelected(repo.root, "review/selected");
    assert.deepEqual(created, {
      schemaVersion: 1,
      repoRoot: path.resolve(repo.root),
      branch: "review/selected",
      targetOid: selectedOid,
      created: true,
      alreadyExists: false,
    });
    const afterCreate = snapshot(repo);
    assert.equal(afterCreate.head, before.head);
    assert.equal(afterCreate.status, before.status);
    assert.equal(afterCreate.index, before.index);
    assert.equal(afterCreate.files.join("\n"), before.files.join("\n"));
    assert.equal(afterCreate.refs.split(/\r?\n/).length, before.refs.split(/\r?\n/).length + 1);
    assert.match(afterCreate.refs, new RegExp(`${selectedOid} refs/heads/review/selected`));

    const retry = createBranchAtSelected(repo.root, "review/selected");
    assert.equal(retry.created, false);
    assert.equal(retry.alreadyExists, true);
    assert.deepEqual(snapshot(repo), afterCreate);
  } finally {
    repo.cleanup();
  }
});

test("an existing branch at another oid fails without mutation", () => {
  const repo = createTempRepo();
  try {
    const first = commitFile(repo, "one.txt", "one\n", "one");
    const second = commitFile(repo, "two.txt", "two\n", "two");
    writeSelection(repo.root, { selectedCommit: second });
    repo.runGit(["branch", "review/selected", first]);
    const before = snapshot(repo);

    assert.throws(
      () => createBranchAtSelected(repo.root, "review/selected"),
      (error) => error.code === "BRANCH_ALREADY_EXISTS"
    );
    assert.deepEqual(snapshot(repo), before);
  } finally {
    repo.cleanup();
  }
});

test("branch creation with a stale plan fails closed before changing refs", () => {
  const repo = createTempRepo();
  try {
    const selected = commitFile(repo, "one.txt", "one\n", "one");
    writeSelection(repo.root, { selectedCommit: selected });
    const plan = buildResetPlan(repo.root, "soft");
    commitFile(repo, "two.txt", "two\n", "two");
    const before = snapshot(repo);
    assert.throws(
      () => createBranchAtSelected(repo.root, "review/stale", plan),
      (error) => error.code === "PLAN_STALE"
    );
    assert.deepEqual(snapshot(repo), before);
    assert.throws(() => revalidateActionPlan(repo.root, plan), (error) => error.code === "PLAN_STALE");
  } finally {
    repo.cleanup();
  }
});

test("all reset plans are read-only and warn for dirty and divergent histories", () => {
  const actionsSource = fs.readFileSync(path.join(__dirname, "../../src/actions.js"), "utf8");
  assert.doesNotMatch(actionsSource, /\[\s*["'`]reset["'`]/);

  const repo = createTempRepo();
  try {
    const selectedOid = commitFile(repo, "one.txt", "one\n", "one");
    commitFile(repo, "two.txt", "two\n", "two");
    writeSelection(repo.root, { selectedCommit: selectedOid });
    const before = snapshot(repo);

    for (const mode of ["soft", "mixed", "hard"]) {
      const plan = buildResetPlan(repo.root, mode);
      assert.equal(plan.relation, "ANCESTOR");
      assert.equal(plan.isWorkingTreeDirty, false);
      assert.deepEqual(snapshot(repo), before);
    }

    fs.writeFileSync(path.join(repo.root, "one.txt"), "dirty\n");
    const beforeDirtyPlan = snapshot(repo);
    const dirty = buildResetPlan(repo.root, "hard");
    assert.equal(dirty.isWorkingTreeDirty, true);
    assert.ok(dirty.warnings.some((warning) => /working tree/i.test(warning)));
    assert.ok(dirty.warnings.some((warning) => /hard reset/i.test(warning)));
    assert.deepEqual(snapshot(repo), beforeDirtyPlan);
  } finally {
    repo.cleanup();
  }

  const diverged = createDivergedFixture();
  try {
    writeSelection(diverged.repo.root, { selectedCommit: diverged.feature });
    const plan = buildResetPlan(diverged.repo.root, "soft");
    assert.equal(plan.relation, "DIVERGED");
    assert.ok(plan.warnings.some((warning) => /not a simple ancestor rollback target/i.test(warning)));
  } finally {
    diverged.repo.cleanup();
  }
});
