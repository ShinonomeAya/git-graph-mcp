const {
  compareWithHead,
  getGitContext,
  getGitStatus,
  normalizeLimit,
  readCommit,
  resolveRepo,
} = require("./git");
const { buildGraphRows } = require("./graph");
const { runMcpServer } = require("./mcp");
const { runTui, renderStaticGraph } = require("./tui");
const { readSelection, resolveSelection, writeSelection } = require("./state");

async function runCli(argv) {
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "graph";
  const args = command === "graph" ? argv.slice(argv[0] === "graph" ? 1 : 0) : argv.slice(1);
  const parsed = parseCommandArgs(command, args);
  const repo = command === "mcp" ? null : resolveRepo(parsed.options.repo);

  if (command === "mcp") {
    await runMcpServer();
    return;
  }

  if (command === "graph") {
    const limit = normalizeLimit(parsed.options.limit);
    const context = getGitContext(repo, limit);
    const rows = buildGraphRows(context.commits);

    if (!process.stdout.isTTY || parsed.options.plain) {
      console.log(renderStaticGraph(context, rows, 0));
      return;
    }

    await runTui(context, rows);
    return;
  }

  if (command === "status") {
    const context = getGitContext(repo, normalizeLimit(parsed.options.limit, 40));
    const status = getGitStatus(context.root);
    console.log(JSON.stringify({
      repo: context.root,
      head: context.head,
      branch: context.branch,
      status: status.lines,
      statusDetails: status,
    }, null, 2));
    return;
  }

  if (command === "selected") {
    const context = getGitContext(repo, normalizeLimit(parsed.options.limit));
    const selection = readSelection(context.root);
    console.log(JSON.stringify(selection || {
      repo: context.root,
      selectedCommit: null,
      message: "No commit has been selected yet. Run `git-graph-mcp graph` first.",
    }, null, 2));
    return;
  }

  if (command === "compare-selected") {
    const context = getGitContext(repo, normalizeLimit(parsed.options.limit, 40));
    const selection = resolveSelection(context.root);
    if (!selection) {
      throw new Error("No selected commit. Run `git-graph-mcp graph` and select a commit, or use `inspect <commit>` first.");
    }
    console.log(JSON.stringify(compareWithHead(context.root, selection.selectedCommit), null, 2));
    return;
  }

  if (command === "inspect") {
    const hash = parsed.positionals[0];
    if (!hash) {
      throw new Error("Usage: git-graph-mcp inspect <commit> [--repo <path>]");
    }
    const context = getGitContext(repo, 1);
    const commit = readCommit(context.root, hash);
    writeSelection(context.root, commit);
    console.log(JSON.stringify(commit, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

const OPTION_DEFINITIONS = {
  graph: { "--repo": "value", "--limit": "value", "--plain": "flag" },
  status: { "--repo": "value", "--limit": "value" },
  selected: { "--repo": "value", "--limit": "value" },
  "compare-selected": { "--repo": "value", "--limit": "value" },
  inspect: { "--repo": "value" },
  mcp: {},
};

function parseCommandArgs(command, args) {
  const definitions = OPTION_DEFINITIONS[command];
  if (!definitions) throw new Error(`Unknown command: ${command}`);

  const options = {};
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }

    const kind = definitions[token];
    if (!kind) throw new Error(`Unknown option: ${token}`);
    if (kind === "flag") {
      options[token.slice(2)] = true;
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("-")) {
      throw new Error(`Option ${token} requires a value.`);
    }
    options[token.slice(2)] = value;
    index += 1;
  }

  if (command !== "inspect" && positionals.length > 0) {
    throw new Error(`Unexpected argument: ${positionals[0]}`);
  }
  if (command === "inspect" && positionals.length > 1) {
    throw new Error(`Unexpected argument: ${positionals[1]}`);
  }

  return { options, positionals };
}

module.exports = { parseCommandArgs, runCli };
