const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");

test("large-repository benchmark smoke uses an isolated fixture and stays within budgets", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "benchmark-large-repo.js"), "--smoke"], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.fixture.repository, "temporary");
  assert.equal(report.passed, true);
  assert.deepEqual(report.failures, []);
});
