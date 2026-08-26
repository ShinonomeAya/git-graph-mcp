const { buildResetPlan, createBranchAtSelected } = require("./actions");
const {
  compareWithHead,
  getGitContext,
  getGitStatus,
  normalizeLimit,
  readCommit,
  resolveRepo,
} = require("./git");
const { buildGraphRows, renderGraphAfter, renderLane } = require("./graph");
const { readSelection, resolveSelection, writeSelection } = require("./state");
const { debugLog } = require("./diagnostics");
const { version: SERVER_VERSION } = require("../package.json");

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  McpError,
  ErrorCode,
} = require("@modelcontextprotocol/sdk/types.js");

const SERVER_NAME = "git-graph";
const SCHEMA_VERSION = 1;

class ToolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

async function runMcpServer() {
  debugLog("server starting");
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: { listChanged: false } } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: listTools() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const startedAt = Date.now();
    const toolName = request.params && typeof request.params.name === "string"
      ? request.params.name
      : "unknown";
    debugLog(`request ${request.method || "unknown"} tool ${toolName}`);
    try {
      const result = handleToolCall(request.params || {});
      debugLog(`request completed tool ${toolName} durationMs ${Date.now() - startedAt}`);
      return result;
    } catch (error) {
      debugLog(`request failed tool ${toolName} durationMs ${Date.now() - startedAt}`);
      throw new McpError(ErrorCode.InternalError, "Internal MCP server error.");
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  debugLog("server connected");

  await new Promise((resolve) => {
    const finish = () => {
      debugLog("server stopping");
      process.stdin.off("end", finish);
      process.stdin.off("close", finish);
      process.stdin.off("error", finish);
      resolve();
    };

    process.stdin.once("end", finish);
    process.stdin.once("close", finish);
    process.stdin.once("error", finish);
  });

  await server.close();
}

function listTools() {
  return [
    {
      name: "git_graph",
      description: "Render and return the Git commit graph for a repository. Use this before reasoning about branches, merges, reset targets, or history shape.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path. Defaults to GIT_GRAPH_MCP_REPO, CLAUDE_PROJECT_DIR, or the current working directory."),
        limit: numberProp("Maximum number of commits to read. Defaults to 80.", {
          minimum: 1,
          maximum: 500,
        }),
      }),
      outputSchema: toolOutputSchema(),
    },
    {
      name: "git_status",
      description: "Return compact git status for a repository.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
      }),
      outputSchema: toolOutputSchema(),
    },
    {
      name: "git_selected",
      description: "Return the commit currently selected by the terminal TUI or git_inspect_commit.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
      }),
      outputSchema: toolOutputSchema(),
    },
    {
      name: "git_inspect_commit",
      description: "Inspect a commit and save it as the current AI-readable selection.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
        commit: requiredStringProp("Commit hash, branch, tag, or other Git revision."),
      }, ["commit"]),
      outputSchema: toolOutputSchema(),
    },
    {
      name: "git_compare_selected_with_head",
      description: "Compare the selected commit with HEAD. Use this to plan whether to branch, checkout, or reset.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
      }),
      outputSchema: toolOutputSchema(),
    },
    {
      name: "git_create_branch_at_selected",
      description: "Create a new local branch at the selected commit without checking it out or moving an existing branch.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
        name: requiredStringProp("New local branch name."),
      }, ["name"]),
      outputSchema: toolOutputSchema(),
    },
    {
      name: "git_reset_plan",
      description: "Describe a soft, mixed, or hard reset to the selected commit without executing it.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
        mode: requiredStringProp("Reset preview mode: soft, mixed, or hard."),
      }, ["mode"]),
      outputSchema: toolOutputSchema(),
    },
  ];
}

function callTool(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new ToolError("INVALID_ARGUMENT", "Tool parameters must be an object.");
  }

  const name = params.name;
  const args = params.arguments || {};

  if (name === "git_graph") {
    const repo = resolveRepo(args.repo);
    const limit = normalizeLimit(args.limit);
    const context = getGitContext(repo, limit);
    const rows = buildGraphRows(context.commits);
    const textGraph = renderGraphText(context, rows);
    return jsonToolResult({
      repo: context.root,
      branch: context.branch,
      head: context.head,
      graph: textGraph,
      commits: context.commits,
    }, textGraph);
  }

  if (name === "git_status") {
    const repo = resolveRepo(args.repo);
    const context = getGitContext(repo, 1);
    return jsonToolResult({
      repo: context.root,
      head: context.head,
      branch: context.branch,
      status: getGitStatus(context.root),
    });
  }

  if (name === "git_selected") {
    const repo = resolveRepo(args.repo);
    const context = getGitContext(repo, 1);
    return jsonToolResult(readSelection(context.root) || {
      repo: context.root,
      selectedCommit: null,
      message: "No commit has been selected yet. Run the terminal graph and select a commit, or call git_inspect_commit.",
    });
  }

  if (name === "git_inspect_commit") {
    if (typeof args.commit !== "string" || !args.commit.trim() || args.commit.startsWith("-")) {
      throw new ToolError("INVALID_REVISION", "A valid commit revision is required.");
    }
    const repo = resolveRepo(args.repo);
    const context = getGitContext(repo, 1);
    const selection = readCommit(context.root, args.commit);
    writeSelection(context.root, selection);
    return jsonToolResult(selection);
  }

  if (name === "git_compare_selected_with_head") {
    const repo = resolveRepo(args.repo);
    const context = getGitContext(repo, 1);
    const selection = resolveSelection(context.root);
    if (!selection) {
      throw new Error("No selected commit. Select one in the TUI or call git_inspect_commit first.");
    }
    return jsonToolResult(compareWithHead(context.root, selection.selectedCommit));
  }

  if (name === "git_create_branch_at_selected") {
    const repo = resolveRepo(args.repo);
    return jsonToolResult(createBranchAtSelected(repo, args.name));
  }

  if (name === "git_reset_plan") {
    const repo = resolveRepo(args.repo);
    return jsonToolResult(buildResetPlan(repo, args.mode));
  }

  throw new Error(`Unknown tool: ${name}`);
}

function handleToolCall(params) {
  try {
    return callTool(params);
  } catch (error) {
    const toolError = normalizeToolError(error);
    if (!toolError) throw error;
    return toolErrorResult(toolError);
  }
}

function renderGraphText(context, rows) {
  const lines = [
    `git-graph-mcp  ${context.branch} @ ${context.head}`,
    context.root,
    "",
  ];

  rows.forEach((row) => {
    const commit = row.commit;
    const refs = commit.refs.length ? ` ${commit.refs.join(", ")}` : "";
    lines.push(`  ${renderLane(row).padEnd(12)} ${commit.shortHash}${refs}  ${commit.subject}`);
    renderGraphAfter(row).forEach((graphLine) => {
      lines.push(`  ${graphLine}`);
    });
  });

  return lines.join("\n");
}

function jsonToolResult(value, leadingText) {
  const structuredContent = withSchemaVersion(value);
  const json = JSON.stringify(structuredContent, null, 2);
  return {
    content: [
      {
        type: "text",
        text: leadingText ? `${leadingText}\n\n${json}` : json,
      },
    ],
    structuredContent,
  };
}

function toolErrorResult(error) {
  const structuredContent = {
    schemaVersion: SCHEMA_VERSION,
    error: {
      code: error.code,
      message: error.message,
    },
  };

  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

function withSchemaVersion(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && value.schemaVersion === undefined) {
    return {
      schemaVersion: SCHEMA_VERSION,
      ...value,
    };
  }
  return value;
}

function normalizeToolError(error) {
  if (error instanceof ToolError) return error;

  if (error && typeof error.code === "string") {
    const publicCodes = new Set([
      "GIT_COMMAND_FAILED",
      "BRANCH_ALREADY_EXISTS",
      "INVALID_RESET_MODE",
      "INVALID_BRANCH_NAME",
      "INVALID_GIT_PATH",
      "INVALID_LIMIT",
      "INVALID_REPO_PATH",
      "INVALID_REVISION",
      "INVALID_SELECTION_FILE",
      "NO_HEAD",
      "NO_SELECTION",
      "NOT_GIT_REPOSITORY",
      "SELECTION_WRITE_FAILED",
      "STALE_SELECTION",
      "UNSUPPORTED_SELECTION_VERSION",
    ]);
    if (publicCodes.has(error.code)) {
      return new ToolError(error.code, error.message);
    }
  }

  const message = error && error.message ? error.message : String(error);
  if (/not a git repository/i.test(message)) {
    return new ToolError("NOT_GIT_REPOSITORY", "The path is not a Git repository.");
  }
  if (/unknown revision|bad object|ambiguous argument|invalid object name/i.test(message)) {
    return new ToolError("INVALID_REVISION", "The requested Git revision does not exist.");
  }
  if (/no selected commit|no commit has been selected/i.test(message)) {
    return new ToolError("NO_SELECTION", "No commit has been selected.");
  }
  return null;
}

function objectSchema(properties, required) {
  return {
    type: "object",
    properties,
    required: required || [],
    additionalProperties: false,
  };
}

function stringProp(description) {
  return {
    type: "string",
    description,
    minLength: 1,
  };
}

function requiredStringProp(description) {
  return stringProp(description);
}

function numberProp(description, options = {}) {
  return {
    type: "number",
    description,
    ...options,
  };
}

function toolOutputSchema() {
  return {
    type: "object",
    properties: {
      schemaVersion: {
        type: "integer",
        const: SCHEMA_VERSION,
      },
      error: {
        type: "object",
        properties: {
          code: { type: "string", minLength: 1 },
          message: { type: "string", minLength: 1 },
        },
        required: ["code", "message"],
        additionalProperties: false,
      },
    },
    required: ["schemaVersion"],
    additionalProperties: true,
  };
}

module.exports = {
  callTool,
  handleToolCall,
  jsonToolResult,
  listTools,
  runMcpServer,
};
