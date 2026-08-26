const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { commitFile, createTempRepo } = require("../helpers/git-repo");

const repoRoot = path.resolve(__dirname, "../..");
const binPath = path.join(repoRoot, "bin", "git-graph-mcp.js");

test("official MCP SDK client can initialize and list the existing tools", async () => {
  const fixture = createTempRepo();
  const commitOid = commitFile(fixture, "README.md", "fixture\n", "fixture commit");
  const client = new Client({ name: "git-graph-mcp-test-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [binPath, "mcp"],
    cwd: repoRoot,
    stderr: "pipe",
  });

  try {
    await client.connect(transport, { timeout: 2000 });
    const result = await client.listTools({}, { timeout: 2000 });
    const names = result.tools.map((tool) => tool.name);

    assert.deepEqual(names, [
      "git_graph",
      "git_status",
      "git_selected",
      "git_inspect_commit",
      "git_compare_selected_with_head",
    ]);

    const graph = await client.callTool({
      name: "git_graph",
      arguments: { repo: fixture.root, limit: 1 },
    }, undefined, { timeout: 2000 });
    assert.equal(graph.structuredContent.schemaVersion, 1);
    assert.equal(graph.structuredContent.commits.length, 1);

    const status = await client.callTool({
      name: "git_status",
      arguments: { repo: fixture.root },
    }, undefined, { timeout: 2000 });
    assert.equal(status.structuredContent.schemaVersion, 1);
    assert.equal(status.structuredContent.branch, fixture.runGit(["branch", "--show-current"]).trim());

    const inspected = await client.callTool({
      name: "git_inspect_commit",
      arguments: { repo: fixture.root, commit: commitOid },
    }, undefined, { timeout: 2000 });
    assert.equal(inspected.structuredContent.selectedCommit, commitOid);

    const selected = await client.callTool({
      name: "git_selected",
      arguments: { repo: fixture.root },
    }, undefined, { timeout: 2000 });
    assert.equal(selected.structuredContent.selectedCommit, commitOid);

    const comparison = await client.callTool({
      name: "git_compare_selected_with_head",
      arguments: { repo: fixture.root },
    }, undefined, { timeout: 2000 });
    assert.equal(comparison.structuredContent.baseCommit, commitOid);

    const invalidLimit = await client.callTool({
      name: "git_graph",
      arguments: { repo: fixture.root, limit: 0 },
    }, undefined, { timeout: 2000 });
    assert.equal(invalidLimit.isError, true);
    assert.deepEqual(invalidLimit.structuredContent.error, {
      code: "INVALID_LIMIT",
      message: "limit must be an integer from 1 to 500.",
    });
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
    fixture.cleanup();
  }
});
