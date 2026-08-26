const { buildResetPlan, createBranchAtSelected, revalidateActionPlan } = require("./actions");
const {
  compareWithHead,
  getGitContext,
  getGitStatus,
  normalizeLimit,
  readCommit,
  readCommitDiff,
  readFileHistory,
  resolveRepo,
  searchCommits,
} = require("./git");
const { buildGraphRows, renderGraphAfter, renderLane } = require("./graph");
const { buildContextBundle } = require("./context");
const { readSelection, resolveSelection, writeSelection } = require("./state");
const { debugLog } = require("./diagnostics");
const { version: SERVER_VERSION } = require("../package.json");

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  McpError,
  ErrorCode,
} = require("@modelcontextprotocol/sdk/types.js");

const SERVER_NAME = "git-graph";
const SCHEMA_VERSION = 1;
const RESOURCE_MIME_TYPE = "application/json";
const RESOURCE_DEFINITIONS = Object.freeze([
  {
    uri: "git-graph://default/selection",
    name: "git_selection",
    title: "Git selection",
    description: "The default repository's current immutable selection.",
    tool: "git_selected",
  },
  {
    uri: "git-graph://default/status",
    name: "git_status",
    title: "Git status",
    description: "The default repository's compact working-tree status.",
    tool: "git_status",
  },
]);

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
    { capabilities: { resources: { listChanged: false }, tools: { listChanged: false } } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: listTools() };
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: listResources() };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      return readResource(request.params.uri);
    } catch (error) {
      const toolError = normalizeToolError(error);
      if (toolError) {
        throw new McpError(ErrorCode.InvalidRequest, toolError.message);
      }
      throw error;
    }
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
        timeoutMs: numberProp("Maximum time for each Git process. Defaults to 5000ms.", {
          minimum: 1,
          maximum: 60000,
        }),
      }),
      outputSchema: toolOutputSchema(),
    },
    {
      name: "git_status",
      description: "Return compact git status for a repository.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
        timeoutMs: numberProp("Maximum time for each Git process. Defaults to 5000ms.", {
          minimum: 1,
          maximum: 60000,
        }),
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
      name: "git_context_bundle",
      description: "Return a bounded, provenance-aware Git context bundle for the selected commit or range.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
        maxCommits: numberProp("Maximum graph commits. Defaults to 20.", {
          minimum: 1,
          maximum: 100,
        }),
        maxFiles: numberProp("Maximum changed files. Defaults to 50.", {
          minimum: 1,
          maximum: 500,
        }),
        maxBytes: numberProp("Maximum bundle content bytes. Defaults to 32768.", {
          minimum: 256,
          maximum: 1048576,
        }),
        timeoutMs: numberProp("Maximum time for each Git process. Defaults to 5000ms.", {
          minimum: 1,
          maximum: 60000,
        }),
        includePatch: {
          type: "boolean",
          description: "Include a bounded diff patch for the current selection.",
        },
      }),
      outputSchema: toolOutputSchema(),
    },
    {
      name: "git_search_commits",
      description: "Search commits with bounded paging and literal author, message, ref, and time filters.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
        pageSize: numberProp("Maximum commits per page. Defaults to 20.", {
          minimum: 1,
          maximum: 100,
        }),
        cursor: stringProp("Opaque cursor returned by a previous search page."),
        ref: stringProp("Full Git ref to search, such as refs/heads/main. Defaults to HEAD."),
        author: stringProp("Literal author name or email filter."),
        message: stringProp("Literal commit subject/body filter."),
        since: stringProp("Git-compatible lower time bound."),
        until: stringProp("Git-compatible upper time bound."),
        timeoutMs: numberProp("Maximum time for each Git process. Defaults to 5000ms.", {
          minimum: 1,
          maximum: 60000,
        }),
      }),
      outputSchema: toolOutputSchema(),
    },
    {
      name: "git_commit_diff",
      description: "Return bounded structured diff metadata for one commit; patch text is opt-in.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
        commit: requiredStringProp("Commit hash, branch, tag, or other Git revision."),
        path: stringProp("Optional safe relative file path."),
        parent: numberProp("Merge parent number, starting at 1. Defaults to 1.", {
          minimum: 1,
          maximum: 8,
        }),
        maxFiles: numberProp("Maximum changed files. Defaults to 100.", {
          minimum: 1,
          maximum: 500,
        }),
        maxBytes: numberProp("Maximum patch bytes. Defaults to 32768.", {
          minimum: 256,
          maximum: 1048576,
        }),
        timeoutMs: numberProp("Maximum time for each Git process. Defaults to 5000ms.", {
          minimum: 1,
          maximum: 60000,
        }),
        includePatch: {
          type: "boolean",
          description: "Include a bounded unified patch body.",
        },
      }, ["commit"]),
      outputSchema: toolOutputSchema(),
    },
    {
      name: "git_file_history",
      description: "Return bounded commit history for one safe relative file path.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
        path: requiredStringProp("Safe relative file path."),
        ref: stringProp("Full Git ref to search, such as refs/heads/main. Defaults to HEAD."),
        pageSize: numberProp("Maximum commits per page. Defaults to 20.", {
          minimum: 1,
          maximum: 100,
        }),
        cursor: stringProp("Opaque cursor returned by a previous history page."),
        timeoutMs: numberProp("Maximum time for each Git process. Defaults to 5000ms.", {
          minimum: 1,
          maximum: 60000,
        }),
      }, ["path"]),
      outputSchema: toolOutputSchema(),
    },
    {
      name: "git_revalidate_plan",
      description: "Revalidate a read-only action plan receipt against the current repository state.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
        plan: {
          type: "object",
          description: "Receipt returned by git_reset_plan.",
          additionalProperties: true,
        },
      }, ["plan"]),
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
        plan: {
          type: "object",
          description: "Optional action plan receipt to revalidate before creating the branch.",
          additionalProperties: true,
        },
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

function listResources() {
  return RESOURCE_DEFINITIONS.map(({ uri, name, title, description }) => ({
    uri,
    name,
    title,
    description,
    mimeType: RESOURCE_MIME_TYPE,
  }));
}

function readResource(uri) {
  const definition = RESOURCE_DEFINITIONS.find((resource) => resource.uri === uri);
  if (!definition) {
    throw new ToolError("INVALID_RESOURCE_URI", "The requested resource URI is not supported.");
  }

  const result = handleToolCall({
    name: definition.tool,
    arguments: {},
  });
  const value = result.structuredContent || {
    schemaVersion: SCHEMA_VERSION,
    error: {
      code: "RESOURCE_READ_FAILED",
      message: "The resource did not return structured content.",
    },
  };
  return {
    contents: [{
      uri,
      mimeType: RESOURCE_MIME_TYPE,
      text: JSON.stringify(value, null, 2),
    }],
  };
}

function callTool(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    throw new ToolError("INVALID_ARGUMENT", "Tool parameters must be an object.");
  }

  const name = params.name;
  const args = params.arguments || {};

  if (name === "git_graph") {
    const repo = resolveRepo(args.repo, { timeoutMs: args.timeoutMs });
    const limit = normalizeLimit(args.limit);
    const context = getGitContext(repo, limit, { timeoutMs: args.timeoutMs });
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
    const repo = resolveRepo(args.repo, { timeoutMs: args.timeoutMs });
    const context = getGitContext(repo, 1, { timeoutMs: args.timeoutMs });
    return jsonToolResult({
      repo: context.root,
      head: context.head,
      branch: context.branch,
      status: getGitStatus(context.root, { timeoutMs: args.timeoutMs }),
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

  if (name === "git_context_bundle") {
    const repo = resolveRepo(args.repo, { timeoutMs: args.timeoutMs });
    return jsonToolResult(buildContextBundle(repo, {
      maxCommits: args.maxCommits,
      maxFiles: args.maxFiles,
      maxBytes: args.maxBytes,
      includePatch: args.includePatch,
      timeoutMs: args.timeoutMs,
    }));
  }

  if (name === "git_search_commits") {
    const repo = resolveRepo(args.repo, { timeoutMs: args.timeoutMs });
    return jsonToolResult(searchCommits(repo, {
      pageSize: args.pageSize,
      cursor: args.cursor,
      ref: args.ref,
      author: args.author,
      message: args.message,
      since: args.since,
      until: args.until,
      timeoutMs: args.timeoutMs,
    }));
  }

  if (name === "git_commit_diff") {
    const repo = resolveRepo(args.repo, { timeoutMs: args.timeoutMs });
    return jsonToolResult(readCommitDiff(repo, args.commit, {
      path: args.path,
      parent: args.parent,
      maxFiles: args.maxFiles,
      maxBytes: args.maxBytes,
      includePatch: args.includePatch,
      timeoutMs: args.timeoutMs,
    }));
  }

  if (name === "git_file_history") {
    const repo = resolveRepo(args.repo, { timeoutMs: args.timeoutMs });
    return jsonToolResult(readFileHistory(repo, {
      path: args.path,
      ref: args.ref,
      pageSize: args.pageSize,
      cursor: args.cursor,
      timeoutMs: args.timeoutMs,
    }));
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
    return jsonToolResult(createBranchAtSelected(repo, args.name, args.plan));
  }

  if (name === "git_reset_plan") {
    const repo = resolveRepo(args.repo);
    return jsonToolResult(buildResetPlan(repo, args.mode));
  }

  if (name === "git_revalidate_plan") {
    const repo = resolveRepo(args.repo);
    return jsonToolResult(revalidateActionPlan(repo, args.plan));
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
      "GIT_TIMEOUT",
      "BRANCH_ALREADY_EXISTS",
      "INVALID_RESET_MODE",
      "INVALID_BRANCH_NAME",
      "INVALID_GIT_PATH",
      "INVALID_LIMIT",
      "INVALID_REPO_PATH",
      "INVALID_REVISION",
      "INVALID_SELECTION_FILE",
      "INVALID_CONTEXT_BUDGET",
      "INVALID_TIMEOUT",
      "INVALID_RESOURCE_URI",
      "INVALID_REF",
      "INVALID_SEARCH_FILTER",
      "INVALID_SEARCH_CURSOR",
      "INVALID_DIFF_FILTER",
      "INVALID_ACTION_PLAN",
      "PLAN_EXPIRED",
      "PLAN_DIRTY_CHANGED",
      "PLAN_REF_MOVED",
      "PLAN_STALE",
      "UNSUPPORTED_SELECTION",
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
        enum: [1, 2],
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
  listResources,
  listTools,
  readResource,
  runMcpServer,
};
