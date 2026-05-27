# Claude Code Setup

`git-graph-mcp` exposes a local stdio MCP server for Claude Code.

## Option A: Project-scoped `.mcp.json`

This repository includes a `.mcp.json` that starts the server with:

```json
{
  "mcpServers": {
    "git-graph-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["./bin/git-graph-mcp.js", "mcp"],
      "env": {
        "GIT_GRAPH_MCP_REPO": "${CLAUDE_PROJECT_DIR:-.}"
      }
    }
  }
}
```

When Claude Code opens this repository, it should prompt you to trust the project-scoped MCP server. After approval, run `/mcp` inside Claude Code and check that `git-graph-mcp` is connected.

## Option B: Add It To Another Project

From the project where you want Claude Code to use the graph tools:

```powershell
claude mcp add --transport stdio --scope local git-graph-mcp -- node "F:\sokusai\My project\git-graph-mcp\bin\git-graph-mcp.js" mcp
```

Use `--scope user` instead of `--scope local` if you want the same server available across projects.

## Tools

- `git_graph`: show the commit graph and return structured commit metadata.
- `git_status`: return compact branch and working tree status.
- `git_selected`: return the commit selected in the TUI or by `git_inspect_commit`.
- `git_inspect_commit`: inspect a commit and save it as the current selection.
- `git_compare_selected_with_head`: compare the selected commit with `HEAD` so Claude can plan branch or reset options.

## Typical Claude Prompt

```text
Use git_graph to show me the current repository history. Then inspect the commit before the feature merge and compare it with HEAD. Tell me whether I should create a branch or reset, but do not run destructive Git commands.
```

## Manual Verification

```powershell
node .\bin\git-graph-mcp.js graph --plain
node .\bin\git-graph-mcp.js inspect HEAD
node .\bin\git-graph-mcp.js selected
node .\bin\git-graph-mcp.js compare-selected
```
