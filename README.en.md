# git-graph-mcp

[![CI](https://github.com/ShinonomeAya/git-graph-mcp/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/ShinonomeAya/git-graph-mcp/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/ShinonomeAya/git-graph-mcp)](https://github.com/ShinonomeAya/git-graph-mcp/releases)
[![License](https://img.shields.io/github/license/ShinonomeAya/git-graph-mcp)](LICENSE)

**Language:** [简体中文](README.md) | English

A local-first Git commit graph terminal tool with a standard MCP stdio server. It lets you select commits or ranges in the terminal, then lets Claude Code, Codex, Cursor, and other MCP clients read the same budget-bounded Git context.

![Terminal preview](docs/assets/git-graph-preview.png)

> Current stable release: `0.2.2` · [GitHub Release](https://github.com/ShinonomeAya/git-graph-mcp/releases/tag/v0.2.2)
>
> `v0.2.2` is the public-readiness patch; the existing `v0.2.1` tag remains immutable.

## What it does

- Browse the commit graph, branches, commit details, and working-tree status in the terminal;
- Save commit, range, and ref selections and reuse them across the CLI, TUI, and MCP server;
- Read graph, status, context, search, diff, history, and resources through MCP;
- Generate safe branch-action and reset previews without automatically running reset, checkout, or push;
- Use `doctor` to check Node.js, Git, repository, MCP configuration, and the stdio handshake.

## Supported environments

- Node.js `22+`; Git must be available on `PATH`;
- GitHub Actions verifies Node.js 22 and 24 on Windows and Ubuntu;
- The local stdio setup is verified with Claude Code; other MCP clients that follow the standard stdio transport can use the same configuration pattern;
- macOS is not in the current CI matrix. Run `doctor` and the read-only smoke command before relying on it there.

## Install and run

### Run from a source checkout

Use this path when contributing or testing the latest branch:

```powershell
git clone https://github.com/ShinonomeAya/git-graph-mcp.git
Set-Location git-graph-mcp
npm ci
node .\bin\git-graph-mcp.js graph --plain --limit 8
node .\bin\git-graph-mcp.js doctor
```

### Run from a fixed GitHub Release package

`git-graph-mcp` is not published to the npm registry. Download a fixed `.tgz` from [GitHub Releases](https://github.com/ShinonomeAya/git-graph-mcp/releases) and install it in a disposable directory:

```powershell
New-Item -ItemType Directory git-graph-mcp-runtime -Force | Out-Null
Set-Location git-graph-mcp-runtime
npm init -y
$version = "0.2.2" # replace with the Release version you want
npm install "https://github.com/ShinonomeAya/git-graph-mcp/releases/download/v$version/git-graph-mcp-$version.tgz"
npx --prefix . --no-install git-graph-mcp graph --plain --limit 8 --repo <path-to-git-repository>
npx --prefix . --no-install git-graph-mcp doctor --json --repo <path-to-git-repository>
```

When you change the version, verify the downloaded file against the SHA-256 value in the Release notes.

## Common commands

The following commands run from a source checkout. If the fixed package is installed in the target project, replace the entrypoint with `npx --no-install git-graph-mcp`; if it is installed in a separate runtime directory, add `npx --prefix <path-to-git-graph-mcp-runtime> --no-install`:

```powershell
node .\bin\git-graph-mcp.js graph --plain --limit 8
node .\bin\git-graph-mcp.js status
node .\bin\git-graph-mcp.js search --limit 20
node .\bin\git-graph-mcp.js select commit <commit-oid>
node .\bin\git-graph-mcp.js selected
node .\bin\git-graph-mcp.js doctor --json
```

Append `--repo <path>` when the target repository is not the current directory.

## Use the interactive TUI

Run `node .\bin\git-graph-mcp.js graph`, then use:

| Key | Action |
|---|---|
| `j` / `k` or arrow keys | Move between commits |
| `Enter` / `s` | Save the current commit selection |
| `b` | Set the range base |
| `e` | Save the current range |
| `r` | Save the current visible ref |
| `q` / `Ctrl+C` | Quit |

## Configure an MCP client

### Source checkout

The repository-root `.mcp.json` uses relative paths and is intended for opening the source checkout as a project:

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

### Installed package

If you install the fixed package in the target project, use its local executable:

```json
{
  "mcpServers": {
    "git-graph": {
      "type": "stdio",
      "command": "npx",
      "args": ["--no-install", "git-graph-mcp", "mcp"]
    }
  }
}
```

For Claude Code, run:

```powershell
claude mcp add --transport stdio --scope local git-graph -- npx --prefix <path-to-git-graph-mcp-runtime> --no-install git-graph-mcp mcp
```

The server exposes 12 bounded tools:

| Group | Tools |
|---|---|
| Read and status | `git_graph`, `git_status`, `git_selected` |
| Context queries | `git_context_bundle`, `git_search_commits`, `git_commit_diff`, `git_file_history` |
| Selection and safe actions | `git_inspect_commit`, `git_compare_selected_with_head`, `git_revalidate_plan`, `git_create_branch_at_selected`, `git_reset_plan` |

It also exposes two read-only resources: `git-graph://default/selection` and `git-graph://default/status`. See the [MCP server specification](SPEC-mcp-server.md) for input, output, and error contracts.

## Security boundaries

The default workflow is read-only. Branch creation requires an explicit call and never moves an existing branch; reset operations only generate a preview, and `git_revalidate_plan` checks the repository state fingerprint before an action. The project does not open a network listener or upload repository contents.

## Troubleshoot connection problems

Check these in order:

```powershell
node --version
git --version
node .\bin\git-graph-mcp.js doctor --json --repo <path-to-repository>
npm ci
npm run check
```

For Claude Code connection issues, see [Claude Code setup](docs/CLAUDE_CODE.md). For stdio diagnostics, see the [MCP debug log](docs/MCP_DEBUG_LOG.md).

## Develop and release

```powershell
npm run check
npm run test:package-install
npm audit --omit=dev --audit-level=high
```

More information:

- [Five-minute demo](docs/DEMO.md)
- [Capability and test evidence](CAPABILITY_MAP.md)
- [Technical solution](docs/TECHNICAL_SOLUTION.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Release acceptance checklist](docs/RELEASE_CANDIDATE.md)
