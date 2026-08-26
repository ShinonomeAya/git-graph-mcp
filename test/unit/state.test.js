const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { commitFile, createTempRepo } = require("../helpers/git-repo");
const {
  StateError,
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

test("missing selection is null and legacy data normalizes without rewriting on read", () => {
  withRepo((repo) => {
    const oid = commitFile(repo, "one.txt", "one\n", "one");
    assert.equal(readSelection(repo.root), null);

    const file = selectionPath(repo.root);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const legacy = legacySelection(repo.root, oid);
    fs.writeFileSync(file, JSON.stringify(legacy));

    const normalized = readSelection(repo.root);
    assert.equal(normalized.schemaVersion, 1);
    assert.equal(normalized.selected.kind, "commit");
    assert.equal(normalized.selected.oid, oid);
    assert.equal(normalized.selectedCommit, oid);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), legacy);

    writeSelection(repo.root, normalized);
    const written = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(written.schemaVersion, 1);
    assert.equal(written.selected.oid, oid);
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
      selected: { kind: "commit", oid: "0".repeat(40) },
      selectedCommit: "0".repeat(40),
    };
    fs.writeFileSync(file, JSON.stringify(stale));
    assert.throws(() => resolveSelection(repo.root), (error) => error.code === "STALE_SELECTION");
    assert.ok(oid);
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
