const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  callTool,
  handleToolCall,
  jsonToolResult,
  listResources,
  listTools,
  readResource,
} = require("../../src/mcp");

const repoRoot = path.resolve(__dirname, "../..");

test("listTools exposes the available tools with closed input schemas", () => {
  const tools = listTools();

  assert.deepEqual(tools.map((tool) => tool.name), [
    "git_graph",
    "git_status",
    "git_selected",
    "git_context_bundle",
    "git_search_commits",
    "git_commit_diff",
    "git_file_history",
    "git_inspect_commit",
    "git_compare_selected_with_head",
    "git_create_branch_at_selected",
    "git_reset_plan",
  ]);

  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.deepEqual(tool.outputSchema.properties.schemaVersion.enum, [1, 2]);
    assert.deepEqual(tool.outputSchema.required, ["schemaVersion"]);
  }
});

test("jsonToolResult mirrors schema-versioned data in text and structured content", () => {
  const result = jsonToolResult({ value: "ok" });

  assert.deepEqual(result.structuredContent, {
    schemaVersion: 1,
    value: "ok",
  });
  assert.match(result.content[0].text, /"schemaVersion": 1/);
});

test("git_graph returns structured schema-versioned content", () => {
  const result = callTool({
    name: "git_graph",
    arguments: { repo: repoRoot, limit: 1 },
  });

  assert.equal(result.structuredContent.schemaVersion, 1);
  assert.equal(path.normalize(result.structuredContent.repo), path.normalize(repoRoot));
  assert.equal(result.structuredContent.commits.length, 1);
});

test("invalid graph limits return a stable tool error", () => {
  const result = handleToolCall({
    name: "git_graph",
    arguments: { repo: repoRoot, limit: 0 },
  });

  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent.error, {
    code: "INVALID_LIMIT",
    message: "limit must be an integer from 1 to 500.",
  });
});

test("invalid Git timeout returns a stable tool error", () => {
  const result = handleToolCall({
    name: "git_graph",
    arguments: { repo: repoRoot, timeoutMs: 0 },
  });

  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent.error, {
    code: "INVALID_TIMEOUT",
    message: "timeoutMs must be an integer from 1 to 60000.",
  });
});

test("resources expose default selection and status with tool-compatible JSON", () => {
  const resources = listResources();

  assert.deepEqual(resources.map((resource) => resource.uri), [
    "git-graph://default/selection",
    "git-graph://default/status",
  ]);
  assert.ok(resources.every((resource) => resource.mimeType === "application/json"));

  const selection = readResource("git-graph://default/selection");
  const status = readResource("git-graph://default/status");
  const selectionTool = callTool({ name: "git_selected", arguments: { repo: repoRoot } });
  const statusTool = callTool({ name: "git_status", arguments: { repo: repoRoot } });
  assert.equal(selection.contents.length, 1);
  assert.equal(status.contents.length, 1);
  assert.deepEqual(JSON.parse(selection.contents[0].text), selectionTool.structuredContent);
  assert.deepEqual(JSON.parse(status.contents[0].text), statusTool.structuredContent);
});

test("unknown resources return a stable resource error", () => {
  assert.throws(
    () => readResource("git-graph://default/unknown"),
    (error) => error.code === "INVALID_RESOURCE_URI"
  );
});
