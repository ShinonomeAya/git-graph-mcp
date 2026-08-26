const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { callTool, handleToolCall, jsonToolResult, listTools } = require("../../src/mcp");

const repoRoot = path.resolve(__dirname, "../..");

test("listTools exposes the seven existing tools with closed input schemas", () => {
  const tools = listTools();

  assert.deepEqual(tools.map((tool) => tool.name), [
    "git_graph",
    "git_status",
    "git_selected",
    "git_inspect_commit",
    "git_compare_selected_with_head",
    "git_create_branch_at_selected",
    "git_reset_plan",
  ]);

  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema.properties.schemaVersion.const, 1);
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
