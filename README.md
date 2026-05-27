# git-graph-mcp

Terminal Git graph for AI coding tools.

The goal is to give Claude Code, Codex, and other terminal-first AI coding agents a fast visual Git graph that works where the agent already lives: inside the terminal. The user can select a commit or branch line, then the AI can read that selected context and suggest safe Git actions such as comparing, branching, or reset planning.

## Current MVP

- Zero-dependency Node.js CLI.
- Reads real Git history with `git log --topo-order`.
- Renders a terminal commit graph.
- Supports keyboard selection in TUI mode.
- Writes the selected commit context to `.git/git-graph-mcp-selection.json`.
- Compares the selected commit with `HEAD` for AI reset/branch planning.
- Exposes machine-readable commands for AI tools.

## Usage

From this project directory:

```bash
node ./bin/git-graph-mcp.js graph --repo /path/to/repo
```

Static output:

```bash
node ./bin/git-graph-mcp.js graph --repo /path/to/repo --plain
```

Read the current AI selection:

```bash
node ./bin/git-graph-mcp.js selected --repo /path/to/repo
```

Compare the current selection with `HEAD`:

```bash
node ./bin/git-graph-mcp.js compare-selected --repo /path/to/repo
```

Inspect and select a commit directly:

```bash
node ./bin/git-graph-mcp.js inspect <commit> --repo /path/to/repo
```

Get compact status:

```bash
node ./bin/git-graph-mcp.js status --repo /path/to/repo
```

## TUI keys

- `Up` / `k`: move up
- `Down` / `j`: move down
- `Enter`: inspect and save selected commit
- `s`: save selected commit
- `q`: quit

## Product Direction

Phase 1: terminal-first graph and selection state.

Phase 2: MCP server tools:

- `git_graph`: return commit graph JSON.
- `git_selected`: return the user's selected commit.
- `git_compare_selected_with_head`: return diff summary.
- `git_create_branch_at_selected`: safe branch creation.
- `git_reset_plan`: preview soft/mixed/hard reset impact without executing.

Phase 3: optional Git actions with confirmation:

- checkout branch or detached commit
- create branch from selected commit
- soft reset to selected commit
- hard reset only with explicit user confirmation and backup branch suggestion

Phase 4: optional Web UI for larger diff review, while keeping the terminal TUI as the primary workflow.

## Safety Principles

- Start read-only.
- Any destructive Git operation must be previewed.
- Reset and checkout flows should explain what will happen to commits, index, and working tree.
- Prefer creating a backup branch before destructive history movement.
