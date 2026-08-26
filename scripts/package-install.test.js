const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { createTempRepo, commitFile } = require("../test/helpers/git-repo");
const { runNpm } = require("../test/helpers/npm");

const repoRoot = path.resolve(__dirname, "..");

test("packed artifact installs cleanly and exposes CLI and MCP entrypoints", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "git-graph-mcp-package-"));
  const installRoot = path.join(workspace, "install");
  const fixture = createTempRepo();
  commitFile(fixture, "README.md", "fixture\n", "fixture commit");

  try {
    const packed = runNpm(["pack", "--json", "--pack-destination", workspace], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(packed.status, 0, packed.stderr);
    const packReport = JSON.parse(packed.stdout);
    const tarball = path.join(workspace, packReport[0].filename);

    const installed = runNpm([
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--prefix",
      installRoot,
      tarball,
    ], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.equal(installed.status, 0, installed.stderr);

    const installedBin = path.join(installRoot, "node_modules", "git-graph-mcp", "bin", "git-graph-mcp.js");
    const graph = spawnSync(process.execPath, [installedBin, "graph", "--plain", "--repo", fixture.root], {
      cwd: fixture.root,
      encoding: "utf8",
      windowsHide: true,
    });
    assert.equal(graph.status, 0, graph.stderr);
    assert.match(graph.stdout, /git-graph-mcp/);

    const installedLauncher = path.join(
      installRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "git-graph-mcp.cmd" : "git-graph-mcp"
    );
    const npxLikeGraph = spawnSync(installedLauncher, ["graph", "--plain", "--repo", fixture.root], {
      cwd: fixture.root,
      encoding: "utf8",
      windowsHide: true,
      shell: process.platform === "win32",
    });
    assert.equal(npxLikeGraph.status, 0, npxLikeGraph.stderr);
    assert.match(npxLikeGraph.stdout, /git-graph-mcp/);

    const client = new Client({ name: "git-graph-mcp-package-test-client", version: "1.0.0" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [installedBin, "mcp"],
      cwd: fixture.root,
      stderr: "pipe",
    });
    try {
      await client.connect(transport, { timeout: 10000 });
      assert.deepEqual(client.getServerVersion(), {
        name: "git-graph",
        version: require(path.join(installRoot, "node_modules", "git-graph-mcp", "package.json")).version,
      });
      const listed = await client.listTools({}, { timeout: 10000 });
      assert.deepEqual(listed.tools.map((tool) => tool.name), [
        "git_graph",
        "git_status",
        "git_selected",
        "git_context_bundle",
        "git_search_commits",
        "git_commit_diff",
        "git_file_history",
        "git_revalidate_plan",
        "git_inspect_commit",
        "git_compare_selected_with_head",
        "git_create_branch_at_selected",
        "git_reset_plan",
      ]);

      const doctor = spawnSync(process.execPath, [installedBin, "doctor", "--json", "--repo", fixture.root], {
        cwd: fixture.root,
        encoding: "utf8",
        windowsHide: true,
      });
      assert.equal(doctor.status, 0, doctor.stderr);
      const report = JSON.parse(doctor.stdout);
      assert.equal(report.ok, true);
      assert.equal(report.checks.find((check) => check.name === "mcp-handshake").status, "pass");
    } finally {
      await client.close().catch(() => {});
      await transport.close().catch(() => {});
    }
  } finally {
    fixture.cleanup();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
