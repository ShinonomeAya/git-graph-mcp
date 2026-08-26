const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { runNpm } = require("../helpers/npm");

const repoRoot = path.resolve(__dirname, "../..");

test("npm package contains only the portable runtime allowlist", () => {
  const result = runNpm(["pack", "--dry-run", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);

  const report = JSON.parse(result.stdout);
  assert.equal(report.length, 1);
  const files = report[0].files.map((entry) => entry.path.replaceAll("\\", "/"));
  const allowed = new Set(["package.json", "README.md", "README.en.md", "LICENSE"]);

  assert.ok(files.includes("package.json"));
  assert.ok(files.includes("README.md"));
  assert.ok(files.includes("README.en.md"));
  assert.ok(files.includes("LICENSE"));
  assert.ok(files.some((file) => file.startsWith("bin/")));
  assert.ok(files.some((file) => file.startsWith("src/")));
  assert.ok(files.every((file) => allowed.has(file) || file.startsWith("bin/") || file.startsWith("src/")));

  for (const forbidden of [".mcp.json", "start-mcp.bat", "tasks/", "test/", "SPEC-", "docs/", "git-graph-mcp-selection.json"]) {
    assert.equal(files.some((file) => file === forbidden || file.startsWith(forbidden)), false, forbidden);
  }
  assert.equal(files.some((file) => path.isAbsolute(file)), false);
});
