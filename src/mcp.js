const { compareWithHead, getGitContext, getGitStatus, readCommit } = require("./git");
const { buildGraphRows, renderGraphAfter, renderLane } = require("./graph");
const { readSelection, writeSelection } = require("./state");

const SERVER_NAME = "git-graph";
const SERVER_VERSION = "0.1.0";

async function runMcpServer() {
  const transport = new StdioJsonRpcTransport(process.stdin, process.stdout);

  transport.onMessage(async (message) => {
    if (!message || !message.method) return;

    try {
      if (message.method === "initialize") {
        transport.respond(message.id, {
          protocolVersion: message.params && message.params.protocolVersion || "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
          },
        });
        return;
      }

      if (message.method === "notifications/initialized") {
        return;
      }

      if (message.method === "ping") {
        transport.respond(message.id, {});
        return;
      }

      if (message.method === "tools/list") {
        transport.respond(message.id, { tools: listTools() });
        return;
      }

      if (message.method === "tools/call") {
        const result = callTool(message.params || {});
        transport.respond(message.id, result);
        return;
      }

      if (message.id !== undefined) {
        transport.error(message.id, -32601, `Unknown method: ${message.method}`);
      }
    } catch (error) {
      transport.error(message.id, -32000, error && error.message ? error.message : String(error));
    }
  });
}

function listTools() {
  return [
    {
      name: "git_graph",
      description: "Render and return the Git commit graph for a repository. Use this before reasoning about branches, merges, reset targets, or history shape.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path. Defaults to GIT_GRAPH_MCP_REPO, CLAUDE_PROJECT_DIR, or the current working directory."),
        limit: numberProp("Maximum number of commits to read. Defaults to 80."),
      }),
    },
    {
      name: "git_status",
      description: "Return compact git status for a repository.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
      }),
    },
    {
      name: "git_selected",
      description: "Return the commit currently selected by the terminal TUI or git_inspect_commit.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
      }),
    },
    {
      name: "git_inspect_commit",
      description: "Inspect a commit and save it as the current AI-readable selection.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
        commit: requiredStringProp("Commit hash, branch, tag, or other Git revision."),
      }, ["commit"]),
    },
    {
      name: "git_compare_selected_with_head",
      description: "Compare the selected commit with HEAD. Use this to plan whether to branch, checkout, or reset.",
      inputSchema: objectSchema({
        repo: stringProp("Repository path."),
      }),
    },
  ];
}

function callTool(params) {
  const name = params.name;
  const args = params.arguments || {};

  if (name === "git_graph") {
    const repo = resolveRepo(args.repo);
    const limit = Number(args.limit || 80);
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
    if (!args.commit) throw new Error("git_inspect_commit requires a commit argument.");
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
  return repo || process.env.GIT_GRAPH_MCP_REPO || process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function jsonToolResult(value, leadingText) {
  const json = JSON.stringify(value, null, 2);
  return {
    content: [
      {
        type: "text",
        text: leadingText ? `${leadingText}\n\n${json}` : json,
      },
    ],
  };
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
  };
}

function requiredStringProp(description) {
  return stringProp(description);
}

function numberProp(description) {
  return {
    type: "number",
    description,
  };
}

class StdioJsonRpcTransport {
  constructor(input, output) {
    this.input = input;
    this.output = output;
    this.buffer = Buffer.alloc(0);
    this.listeners = [];

    this.input.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.readMessages();
    });
  }

  onMessage(listener) {
    this.listeners.push(listener);
  }

  respond(id, result) {
    if (id === undefined || id === null) return;
    this.write({
      jsonrpc: "2.0",
      id,
      result,
    });
  }

  error(id, code, message) {
    if (id === undefined || id === null) return;
    this.write({
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
      },
    });
  }

  write(message) {
    const body = Buffer.from(JSON.stringify(message), "utf8");
    this.output.write(`Content-Length: ${body.length}\r\n\r\n`);
    this.output.write(body);
  }

  readMessages() {
    while (this.buffer.length) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        this.tryReadLineDelimitedJson();
        return;
      }

      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        this.buffer = Buffer.alloc(0);
        return;
      }

      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) return;

      const body = this.buffer.slice(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.slice(bodyEnd);
      this.emit(JSON.parse(body));
    }
  }

  tryReadLineDelimitedJson() {
    const newline = this.buffer.indexOf("\n");
    if (newline === -1) return;

    const line = this.buffer.slice(0, newline).toString("utf8").trim();
    this.buffer = this.buffer.slice(newline + 1);
    if (line) this.emit(JSON.parse(line));
    this.readMessages();
  }

  emit(message) {
    this.listeners.forEach((listener) => listener(message));
  }
}

module.exports = {
  runMcpServer,
};
