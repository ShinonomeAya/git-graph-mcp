# git-graph-mcp

`git-graph-mcp` is a terminal-first Git history viewer and local stdio MCP
server for Claude Code and other AI coding tools. It lets a developer inspect
history, save commit/range/ref selections as shared context, search bounded
history, compare it with `HEAD`, create a new branch safely, and preview reset
effects without executing reset.

## Quick start

Requirements: Git on `PATH` and Node.js 22 or newer.

From a source checkout:

```powershell
npm ci
npm run check
node .\bin\git-graph-mcp.js graph --plain
```

From an installed package:

```powershell
npx git-graph-mcp graph --plain
npx git-graph-mcp mcp
```

See [docs/CLAUDE_CODE.md](docs/CLAUDE_CODE.md) for Claude Code setup.

## CLI commands

| Command | Purpose |
|---|---|
| `node .\bin\git-graph-mcp.js graph` | Interactive graph when a TTY is available |
| `node .\bin\git-graph-mcp.js graph --plain` | Deterministic plain graph |
| `node .\bin\git-graph-mcp.js status` | Structured branch and working-tree status |
| `node .\bin\git-graph-mcp.js search --limit 20` | Bounded commit search with a cursor |
| `node .\bin\git-graph-mcp.js inspect <commit>` | Inspect and save a commit selection |
| `node .\bin\git-graph-mcp.js selected` | Read the saved selection |
| `node .\bin\git-graph-mcp.js compare-selected` | Compare the selection with `HEAD` |
| `node .\bin\git-graph-mcp.js mcp` | Start the stdio MCP server |

Add `--repo <path>` to CLI commands when the target repository is not the
current directory.

## MCP tools

- `git_graph` — return graph text and structured commit metadata.
- `git_status` — return compact and structured status.
- `git_selected` — read the current selection.
- `git_context_bundle` — read bounded selection, status, graph, comparison, and warnings.
- `git_search_commits` — page through commits with ref, author, message, and time filters.
- `git_commit_diff` — read structured commit/file diff metadata with optional bounded patch text.
- `git_file_history` — page through the history of one safe relative file path.
- `git_revalidate_plan` — verify a reset/action receipt before any separately approved write.
- `git_inspect_commit` — inspect and save a selection.
- `git_compare_selected_with_head` — classify the relationship with `HEAD`.
- `git_create_branch_at_selected` — create a new local branch at the selected oid, idempotently.
- `git_reset_plan` — describe soft, mixed, or hard reset effects without invoking `git reset`.

Legacy results use `schemaVersion: 1`; context and search results use
`schemaVersion: 2`. Expected failures use a stable error code. The branch
action never checks out or force-moves a branch. Reset planning is read-only and always sets
`requiresExplicitExternalExecution: true`.

The MCP server also exposes `git-graph://default/selection` and
`git-graph://default/status` as read-only JSON resources. They mirror the
corresponding tools; resource subscriptions are not advertised.

## TUI keys

- `Up` / `k`: move up
- `Down` / `j`: move down
- `Enter` or `s`: inspect and save the selected commit
- `q`: quit and restore the terminal state

## Safety model

The default workflow is read-only. Selection state is stored through Git's
resolved path so linked worktrees remain isolated. A branch action revalidates
the selected oid and refuses to move an existing branch. Reset plans report
the relationship, dirty-state warnings, index/worktree impact, exact proposed
command, and an informational backup-branch suggestion; no reset is executed
by v0.2 code.

## Diagnostics

Normal execution creates no log file and MCP stdout remains protocol-only. Set
`GIT_GRAPH_MCP_DEBUG=1` temporarily to emit concise lifecycle messages on
stderr. The diagnostics intentionally omit repository paths, request
arguments, patch content, and environment dumps.
