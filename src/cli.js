const { compareWithHead, getGitContext, getGitStatus, readCommit } = require("./git");
const { buildGraphRows } = require("./graph");
const { runMcpServer } = require("./mcp");
const { runTui, renderStaticGraph } = require("./tui");
const { readSelection, writeSelection } = require("./state");

async function runCli(argv) {
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "graph";
  const args = command === "graph" ? argv.slice(argv[0] === "graph" ? 1 : 0) : argv.slice(1);
  const repo = readOption(args, "--repo") || process.cwd();

  if (command === "mcp") {
    await runMcpServer();
    return;
  }

  if (command === "graph") {
    const limit = Number(readOption(args, "--limit") || 80);
    const context = getGitContext(repo, limit);
    const rows = buildGraphRows(context.commits);

    if (!process.stdout.isTTY || args.includes("--plain")) {
      console.log(renderStaticGraph(context, rows, 0));
      return;
    }

    await runTui(context, rows);
    return;
  }

  if (command === "status") {
    const context = getGitContext(repo, Number(readOption(args, "--limit") || 40));
    const status = getGitStatus(context.root);
    console.log(JSON.stringify({
      repo: context.root,
      head: context.head,
      branch: context.branch,
      status,
    }, null, 2));
    return;
  }

  if (command === "selected") {
    const context = getGitContext(repo, Number(readOption(args, "--limit") || 80));
    const selection = readSelection(context.root);
    console.log(JSON.stringify(selection || {
      repo: context.root,
      selectedCommit: null,
      message: "No commit has been selected yet. Run `git-graph-mcp graph` first.",
    }, null, 2));
    return;
  }

  if (command === "compare-selected") {
    const context = getGitContext(repo, Number(readOption(args, "--limit") || 40));
    const selection = readSelection(context.root);
    if (!selection || !selection.selectedCommit) {
      throw new Error("No selected commit. Run `git-graph-mcp graph` and select a commit, or use `inspect <commit>` first.");
    }
    console.log(JSON.stringify(compareWithHead(context.root, selection.selectedCommit), null, 2));
    return;
  }

  if (command === "inspect") {
    const hash = args[0];
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

function readOption(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] || null;
}

module.exports = { runCli };
