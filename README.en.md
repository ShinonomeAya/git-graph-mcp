# git-graph-mcp

**Language:** [简体中文](README.md) | English

A local-first Git commit graph terminal tool with a standard MCP stdio server.
It lets you select commits or ranges in the terminal, then lets Claude Code,
Codex, Cursor, and other MCP clients read the same budget-bounded Git context.

![Terminal preview](docs/assets/git-graph-preview.png)

## What it does

- Browse the commit graph, branches, commit details, and working-tree status in
  the terminal.
- Save commit, range, and ref selections and reuse them across the CLI, TUI,
  and MCP server.
- Read graph, status, context, search, diff, and history data through MCP,
  together with two read-only resources.
- Generate safe branch-action and reset previews without automatically running
  reset, checkout, or push.
- Use `doctor` to check Node.js, Git, repository, MCP configuration, and the
  stdio handshake.

## Quick start

Requirements: Git must be available on `PATH`. Node.js 22 or newer is officially
supported.

```powershell
npm ci
node .\bin\git-graph-mcp.js graph --plain --limit 8
node .\bin\git-graph-mcp.js doctor
```

Start the interactive TUI:

```powershell
node .\bin\git-graph-mcp.js graph
```

Common commands:

```powershell
node .\bin\git-graph-mcp.js status
node .\bin\git-graph-mcp.js search --limit 20
node .\bin\git-graph-mcp.js select commit <commit-oid>
node .\bin\git-graph-mcp.js selected
node .\bin\git-graph-mcp.js doctor --json
```

When the target repository is not the current directory, append
`--repo <path>` to the command.

## MCP configuration

The repository's root `.mcp.json` uses a local stdio server:

```json
{
  "mcpServers": {
    "git-graph": {
      "type": "stdio",
      "command": "node",
      "args": ["./bin/git-graph-mcp.js", "mcp"]
    }
  }
}
```

The server provides 12 bounded tools and two read-only resources:
`git-graph://default/selection` and `git-graph://default/status`. MCP stdout
contains protocol messages only. Diagnostics go to stderr and do not echo
repository paths, configuration values, or request contents.

## Security boundaries

The default workflow is read-only. Creating a branch requires an explicit call
and never moves an existing branch. Reset operations only generate a preview;
`git_revalidate_plan` verifies the repository state fingerprint before an action
is taken. The project does not open a network listener or upload repository
contents.

## Development and release

```powershell
npm run check
npm run test:package-install
```

More information:

- [Five-minute demo](docs/DEMO.md)
- [Capability and test evidence](CAPABILITY_MAP.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Release checklist](docs/RELEASE_CANDIDATE.md)
