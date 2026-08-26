const { compareWithHead, getGitContext, getGitStatus, readCommit } = require("./git");
const { buildGraphRows, renderGraphAfter, renderLane } = require("./graph");
const { readSelection, writeSelection } = require("./state");

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  McpError,
  ErrorCode,
} = require("@modelcontextprotocol/sdk/types.js");

const SERVER_NAME = "git-graph";
const SERVER_VERSION = "0.1.0";
const SCHEMA_VERSION = 1;

class ToolError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ToolError";
    this.code = code;
  }
}

async function runMcpServer() {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: { listChanged: false } } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: listTools() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return handleToolCall(request.params || {});
    } catch (error) {
      throw new McpError(ErrorCode.InternalError, "Internal MCP server error.");
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  await new Promise((resolve) => {
    const finish = () => {
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
    const selection = readSelection(context.root);
    if (!selection || !selection.selectedCommit) {
      throw new Error("No selected commit. Select one in the TUI or call git_inspect_commit first.");
    }
    return jsonToolResult(compareWithHead(context.root, selection.selectedCommit));
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

function resolveRepo(repo) {
  if (repo !== undefined && (typeof repo !== "string" || !repo.trim())) {
    throw new ToolError("INVALID_REPO", "repo must be a non-empty path.");
  }
  return repo || process.env.GIT_GRAPH_MCP_REPO || process.env.CLAUDE_PROJECT_DIR || process.cwd();
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

function normalizeLimit(value) {
  const limit = value === undefined ? 80 : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new ToolError("INVALID_LIMIT", "limit must be an integer from 1 to 500.");
  }
  return limit;
}

function normalizeToolError(error) {
  if (error instanceof ToolError) return error;

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
