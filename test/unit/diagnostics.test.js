const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { runDoctor } = require("../../src/diagnostics");
const { commitFile, createTempRepo } = require("../helpers/git-repo");

const PROJECT_ROOT = path.resolve(__dirname, "../..");

test("doctor reports an MCP handshake failure with a stable code", async () => {
  const repo = createTempRepo();
  try {
    commitFile(repo, "one.txt", "one\n", "one");
    const report = await runDoctor({
      repo: repo.root,
      configPath: path.join(PROJECT_ROOT, ".mcp.json"),
      binPath: path.join(repo.root, "missing-mcp-entrypoint.js"),
    });
    assert.equal(report.ok, false);
    assert.equal(report.checks.find((check) => check.name === "mcp-handshake").code, "MCP_HANDSHAKE_FAILED");
    assert.equal(JSON.stringify(report).includes(repo.root), false);
  } finally {
    repo.cleanup();
  }
});
