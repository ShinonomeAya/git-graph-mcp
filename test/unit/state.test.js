const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { commitFile, createTempRepo } = require("../helpers/git-repo");
const {
  SCHEMA_VERSION,
  StateError,
  normalizeSelection,
  readSelection,
  resolveSelection,
  selectionPath,
  writeSelection,
} = require("../../src/state");

function withRepo(callback) {
  const repo = createTempRepo();
  try {
    return callback(repo);
  } finally {
    repo.cleanup();
  }
}

function legacySelection(repoRoot, oid) {
  return {
    repo: repoRoot,
    selectedCommit: oid,
    selectedShortHash: oid.slice(0, 7),
    subject: "selected",
    refs: [],
  };
}

function v1Selection(repoRoot, oid) {
  return {
    schemaVersion: 1,
    repoRoot,
    selected: { kind: "commit", oid },
    resolvedAt: "2026-08-26T00:00:00.000Z",
    commit: {
      shortHash: oid.slice(0, 7),
      subject: "v1 selected",
      refs: [],
    },
  };
}

test("missing selection is null and legacy data normalizes without rewriting on read", () => {
  withRepo((repo) => {
    const oid = commitFile(repo, "one.txt", "one\n", "one");
    assert.equal(readSelection(repo.root), null);

    const file = selectionPath(repo.root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const legacy = legacySelection(repo.root, oid);
    fs.writeFileSync(file, JSON.stringify(legacy));

    const normalized = readSelection(repo.root);
    assert.equal(normalized.schemaVersion, SCHEMA_VERSION);
    assert.equal(normalized.selection.kind, "commit");
    assert.equal(normalized.selection.oid, oid);
    assert.equal(normalized.selected.kind, "commit");
    assert.equal(normalized.selected.oid, oid);
    assert.equal(normalized.selectedCommit, oid);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), legacy);

    writeSelection(repo.root, normalized);
    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(written.schemaVersion, SCHEMA_VERSION);
    assert.equal(written.selection.kind, "commit");
    assert.equal(written.selection.oid, oid);
    assert.equal(written.selected, undefined);
    assert.equal(written.selectedCommit, undefined);
  });
});

test("schema v1 files normalize to v2 in memory without rewriting on read", () => {
  withRepo((repo) => {
    const oid = commitFile(repo, "one.txt", "one\n", "one");
    const file = selectionPath(repo.root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const v1 = v1Selection(repo.root, oid);
    fs.writeFileSync(file, JSON.stringify(v1, null, 2));
    const before = fs.readFileSync(file, "utf8");

    const normalized = readSelection(repo.root);

    assert.equal(normalized.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(normalized.selection, { kind: "commit", oid });
    assert.equal(normalized.commit.subject, "v1 selected");
    assert.equal(normalized.resolvedAt, v1.resolvedAt);
    assert.equal(fs.readFileSync(file, "utf8"), before);
  });
});

test("schema v2 writes support commit, range, and ref selections with immutable oids", () => {
  withRepo((repo) => {
    const baseOid = commitFile(repo, "one.txt", "one\n", "one");
    const headOid = commitFile(repo, "two.txt", "two\n", "two");
    const file = selectionPath(repo.root);
    const branch = repo.runGit(["branch", "--show-current"]).trim();
    const ref = `refs/heads/${branch}`;

    const commit = writeSelection(repo.root, {
      schemaVersion: 2,
      selection: { kind: "commit", oid: baseOid },
    });
    assert.deepEqual(commit.selection, { kind: "commit", oid: baseOid });

    const range = writeSelection(repo.root, {
      selection: { kind: "range", baseOid, headOid },
    });
    assert.deepEqual(range.selection, { kind: "range", baseOid, headOid });
    assert.equal(range.selectedCommit, null);

    const refSelection = writeSelection(repo.root, {
      selection: { kind: "ref", ref, oid: headOid },
    });
    assert.deepEqual(refSelection.selection, { kind: "ref", ref, oid: headOid });

    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(written.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(written.selection, { kind: "ref", ref, oid: headOid });
    assert.equal(written.selected, undefined);
    assert.equal(written.selectedCommit, undefined);
  });
});
test("malformed, unsupported, and stale selections have distinct errors", () => {
  withRepo((repo) => {
    const oid = commitFile(repo, "one.txt", "one\n", "one");
    const file = selectionPath(repo.root);
    fs.mkdirSync(path.dirname(file), { recursive: true });

    fs.writeFileSync(file, "not-json");
    assert.throws(() => readSelection(repo.root), (error) => error.code === "INVALID_SELECTION_FILE");

    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 99 }));
    assert.throws(() => readSelection(repo.root), (error) => error.code === "UNSUPPORTED_SELECTION_VERSION");

    writeSelection(repo.root, legacySelection(repo.root, oid));
    const stale = {
      ...readSelection(repo.root),
      selection: { kind: "commit", oid: "0".repeat(40) },
    };
    fs.writeFileSync(file, JSON.stringify(stale));
    assert.throws(() => resolveSelection(repo.root), (error) => error.code === "STALE_SELECTION");
    assert.ok(oid);
  });
});

test("moved refs are distinct from stale immutable selections", () => {
  withRepo((repo) => {
    const first = commitFile(repo, "one.txt", "one\n", "one");
    const branch = repo.runGit(["branch", "--show-current"]).trim();
    const ref = `refs/heads/${branch}`;
    writeSelection(repo.root, { selection: { kind: "ref", ref, oid: first } });

    commitFile(repo, "two.txt", "two\n", "two");
    assert.throws(
      () => resolveSelection(repo.root),
      (error) => error instanceof StateError && error.code === "MOVED_REF"
    );

    fs.writeFileSync(
      selectionPath(repo.root),
      JSON.stringify({ schemaVersion: 2, repoRoot: repo.root, selection: { kind: "commit", oid: "0".repeat(40) } })
    );
    assert.throws(
      () => resolveSelection(repo.root),
      (error) => error instanceof StateError && error.code === "STALE_SELECTION"
    );
  });
});

test("schema v2 rejects non-immutable oids and malformed refs", () => {
  withRepo((repo) => {
    const oid = commitFile(repo, "one.txt", "one\n", "one");
    assert.throws(
      () => normalizeSelection({ selection: { kind: "commit", oid: oid.slice(0, 7) } }, repo.root),
      (error) => error instanceof StateError && error.code === "INVALID_SELECTION_FILE"
    );
    assert.throws(
      () => normalizeSelection({ selection: { kind: "ref", ref: "main", oid } }, repo.root),
      (error) => error instanceof StateError && error.code === "INVALID_SELECTION_FILE"
    );
  });
});

test("failed atomic replacement preserves the previous valid selection", () => {
  withRepo((repo) => {
    const oid = commitFile(repo, "one.txt", "one\n", "one");
    writeSelection(repo.root, legacySelection(repo.root, oid));
    const before = fs.readFileSync(selectionPath(repo.root), "utf8");
    const originalRename = fs.renameSync;
    fs.renameSync = () => {
      throw new Error("simulated replacement failure");
    };
    try {
      assert.throws(
        () => writeSelection(repo.root, legacySelection(repo.root, oid)),
        (error) => error instanceof StateError && error.code === "SELECTION_WRITE_FAILED"
      );
    } finally {
      fs.renameSync = originalRename;
    }
    assert.equal(fs.readFileSync(selectionPath(repo.root), "utf8"), before);
  });
});
