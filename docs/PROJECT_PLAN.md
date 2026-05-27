# Project Plan

## Vision

`git-graph-mcp` is a terminal-first Git graph for AI coding tools. It lets a developer visually choose a commit, branch, or lane in the terminal, then lets an AI agent read that exact selection before proposing Git actions.

The project should feel closer to VS Code Git Graph than to `git log --graph`, but it should live naturally inside Claude Code, Codex, and other CLI-based coding workflows.

## MVP Scope

The first useful version is intentionally read-mostly:

- Render commit lanes in the terminal.
- Navigate commits with keyboard controls.
- Save the selected commit as structured JSON inside `.git/`.
- Let AI tools read the selected context.
- Compare the selected commit with `HEAD` so an AI can reason about reset or branch choices.
- Provide safe action suggestions without executing destructive commands.

## Architecture

```text
Git repository
   |
   | git CLI
   v
Git reader
   |
   v
Graph model / lane layout
   |
   +--> Terminal TUI
   |
   +--> Selection state JSON
   |
   +--> MCP tools
```

## Command Surface

Current CLI:

- `graph`: interactive terminal graph.
- `graph --plain`: static graph output.
- `selected`: read current selected commit JSON.
- `compare-selected`: compare the selected commit with `HEAD`.
- `inspect <commit>`: inspect and save selected commit.
- `status`: compact repo status JSON.

Planned MCP tools:

- `git_graph(repo, limit)`: return graph rows and commit metadata.
- `git_selected(repo)`: return current selected commit context.
- `git_status(repo)`: return compact working tree status.
- `git_inspect_commit(repo, commit)`: inspect and select a commit.
- `git_compare_selected_with_head(repo)`: summarize diff from selected commit to HEAD.
- `git_create_branch_at_selected(repo, name)`: create a branch at the selected commit.
- `git_reset_plan(repo, mode)`: preview reset effects before execution.

## Safety Model

Read-only tools can run directly.

Low-risk write actions, such as branch creation, should show the exact Git command and resulting ref.

Destructive actions must require explicit confirmation:

- hard reset
- branch deletion
- force push
- rebase execution
- checkout when it would overwrite local changes

Before destructive history movement, the tool should suggest creating a backup branch at the current HEAD.

## Near-Term Build Order

1. Add branch and lane selection, not only commit selection.
2. Add safe branch creation.
3. Add reset preview.
4. Improve TUI details panel for selected commit.
5. Add optional SDK-backed MCP transport if dependency installation is acceptable.
6. Package as an npm CLI.

## Open Product Questions

- Should the selection state live only in `.git/`, or also be exposed through a local socket for live MCP updates?
- Should the TUI allow selecting a lane/branch independently from a commit?
- Should destructive actions be available from TUI, or only proposed by the AI after reading selection state?
- Should the graph default to all branches or current branch plus nearby refs?
