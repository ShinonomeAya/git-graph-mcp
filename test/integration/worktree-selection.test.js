const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { commitFile, createTempRepo } = require("../helpers/git-repo");
const {
  readSelection,
  selectionPath,
  writeSelection,
} = require("../../src/state");

test("main and linked worktrees keep independent selections", () => {
  const main = createTempRepo();
  const linked = fs.mkdtempSync(path.join(os.tmpdir(), "git-graph-mcp-linked-"));
  fs.rmSync(linked, { recursive: true, force: true });
  try {
    const first = commitFile(main, "one.txt", "one\n", "one");
    const second = commitFile(main, "two.txt", "two\n", "two");
    main.runGit(["worktree", "add", linked, "-b", "linked", first]);

    writeSelection(main.root, { selectedCommit: second, subject: "main" });
    writeSelection(linked, { selectedCommit: first, subject: "linked" });

    assert.notEqual(selectionPath(main.root), selectionPath(linked));
    assert.equal(readSelection(main.root).selected.oid, second);
    assert.equal(readSelection(linked).selected.oid, first);
  } finally {
    main.runGit(["worktree", "remove", "--force", linked]);
    fs.rmSync(linked, { recursive: true, force: true });
    main.cleanup();
  }
});
