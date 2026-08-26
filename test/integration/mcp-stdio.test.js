const path = require("path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { commitFile, createTempRepo } = require("../helpers/git-repo");

const repoRoot = path.resolve(__dirname, "../..");
const binPath = path.join(repoRoot, "bin", "git-graph-mcp.js");
const REQUEST_TIMEOUT = 5000;

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
    await client.connect(transport, { timeout: REQUEST_TIMEOUT });
    assert.deepEqual(client.getServerVersion(), {
      name: "git-graph",
      version: require("../../package.json").version,
    });
    const result = await client.listTools({}, { timeout: REQUEST_TIMEOUT });
    const names = result.tools.map((tool) => tool.name);

    assert.deepEqual(names, [
      "git_graph",
      "git_status",
      "git_selected",
      "git_inspect_commit",
      "git_compare_selected_with_head",
      "git_create_branch_at_selected",
      "git_reset_plan",
    ]);

    const graph = await client.callTool({
      name: "git_graph",
      arguments: { repo: fixture.root, limit: 1 },
    }, undefined, { timeout: REQUEST_TIMEOUT });
    assert.equal(graph.structuredContent.schemaVersion, 1);
    assert.equal(graph.structuredContent.commits.length, 1);

    const status = await client.callTool({
      name: "git_status",
      arguments: { repo: fixture.root },
    }, undefined, { timeout: REQUEST_TIMEOUT });
    assert.equal(status.structuredContent.schemaVersion, 1);
    assert.equal(status.structuredContent.branch, fixture.runGit(["branch", "--show-current"]).trim());

    const cliInspect = spawnSync(process.execPath, [binPath, "inspect", commitOid, "--repo", fixture.root], {
      cwd: repoRoot,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(cliInspect.status, 0, cliInspect.stderr);
    assert.equal(JSON.parse(cliInspect.stdout).selectedCommit, commitOid);

    const inspected = await client.callTool({
      name: "git_inspect_commit",
      arguments: { repo: fixture.root, commit: commitOid },
    }, undefined, { timeout: REQUEST_TIMEOUT });
    assert.equal(inspected.structuredContent.selectedCommit, commitOid);

    const selected = await client.callTool({
      name: "git_selected",
      arguments: { repo: fixture.root },
    }, undefined, { timeout: REQUEST_TIMEOUT });
    assert.equal(selected.structuredContent.selectedCommit, commitOid);

    const comparison = await client.callTool({
      name: "git_compare_selected_with_head",
      arguments: { repo: fixture.root },
    }, undefined, { timeout: REQUEST_TIMEOUT });
    assert.equal(comparison.structuredContent.baseCommit, commitOid);

    const invalidLimit = await client.callTool({
      name: "git_graph",
      arguments: { repo: fixture.root, limit: 0 },
    }, undefined, { timeout: REQUEST_TIMEOUT });
    assert.equal(invalidLimit.isError, true);
    assert.deepEqual(invalidLimit.structuredContent.error, {
      code: "INVALID_LIMIT",
      message: "limit must be an integer from 1 to 500.",
    });

    const refsBeforeBranch = fixture.runGit(["show-ref"]);
    const headBeforeBranch = fixture.runGit(["rev-parse", "HEAD"]).trim();
    const statusBeforeBranch = fixture.runGit(["status", "--porcelain"]);
    const branch = await client.callTool({
      name: "git_create_branch_at_selected",
      arguments: { repo: fixture.root, name: "review/selected" },
    }, undefined, { timeout: REQUEST_TIMEOUT });
    assert.equal(branch.structuredContent.schemaVersion, 1);
    assert.equal(branch.structuredContent.branch, "review/selected");
    assert.equal(branch.structuredContent.targetOid, commitOid);
    assert.equal(branch.structuredContent.created, true);
    assert.equal(branch.structuredContent.alreadyExists, false);
    assert.equal(fixture.runGit(["rev-parse", "refs/heads/review/selected"]).trim(), commitOid);
    assert.equal(fixture.runGit(["rev-parse", "HEAD"]).trim(), headBeforeBranch);
    assert.equal(fixture.runGit(["status", "--porcelain"]), statusBeforeBranch);
    assert.notEqual(fixture.runGit(["show-ref"]), refsBeforeBranch);

    const retry = await client.callTool({
      name: "git_create_branch_at_selected",
      arguments: { repo: fixture.root, name: "review/selected" },
    }, undefined, { timeout: REQUEST_TIMEOUT });
    assert.equal(retry.structuredContent.created, false);
    assert.equal(retry.structuredContent.alreadyExists, true);

    const invalidBranch = await client.callTool({
      name: "git_create_branch_at_selected",
      arguments: { repo: fixture.root, name: "-bad" },
    }, undefined, { timeout: REQUEST_TIMEOUT });
    assert.equal(invalidBranch.isError, true);
    assert.deepEqual(invalidBranch.structuredContent.error, {
      code: "INVALID_BRANCH_NAME",
      message: "A valid new branch name is required.",
    });

    const missingBranchName = await client.callTool({
      name: "git_create_branch_at_selected",
      arguments: { repo: fixture.root },
    }, undefined, { timeout: REQUEST_TIMEOUT });
    assert.equal(missingBranchName.isError, true);
    assert.deepEqual(missingBranchName.structuredContent.error, {
      code: "INVALID_BRANCH_NAME",
      message: "A valid new branch name is required.",
    });

    for (const mode of ["soft", "mixed", "hard"]) {
      const resetPlan = await client.callTool({
        name: "git_reset_plan",
        arguments: { repo: fixture.root, mode },
      }, undefined, { timeout: REQUEST_TIMEOUT });
      assert.equal(resetPlan.structuredContent.schemaVersion, 1);
      assert.equal(resetPlan.structuredContent.mode, mode);
      assert.equal(resetPlan.structuredContent.selectedOid, commitOid);
      assert.equal(resetPlan.structuredContent.requiresExplicitExternalExecution, true);
      assert.match(resetPlan.structuredContent.proposedCommand, new RegExp(`^git reset --${mode} `));
    }

    const invalidResetMode = await client.callTool({
      name: "git_reset_plan",
      arguments: { repo: fixture.root, mode: "--hard" },
    }, undefined, { timeout: REQUEST_TIMEOUT });
    assert.equal(invalidResetMode.isError, true);
    assert.deepEqual(invalidResetMode.structuredContent.error, {
      code: "INVALID_RESET_MODE",
      message: "Reset mode must be one of: soft, mixed, hard.",
    });
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
    fixture.cleanup();
  }
});

test("diagnostics are opt-in and remain on stderr without request data", async () => {
  const fixture = createTempRepo();

  async function runWithDebug(debug) {
    const client = new Client({ name: "git-graph-mcp-debug-test-client", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [binPath, "mcp"],
      cwd: repoRoot,
      stderr: "pipe",
      env: debug ? { GIT_GRAPH_MCP_DEBUG: "1" } : {},
    });

    try {
      await client.connect(transport, { timeout: REQUEST_TIMEOUT });
      await client.listTools({}, { timeout: REQUEST_TIMEOUT });
    } finally {
      await client.close().catch(() => {});
      await transport.close().catch(() => {});
    }
    return String(transport.stderr?.read() || "");
  }

  try {
    const quiet = await runWithDebug(false);
    assert.equal(quiet, "");

    const verbose = await runWithDebug(true);
    assert.match(verbose, /server starting/);
    assert.match(verbose, /server connected/);
    assert.doesNotMatch(verbose, new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(verbose, /arguments|selectedCommit|README/);
  } finally {
    fixture.cleanup();
  }
});
