# Claude Code Setup

`git-graph-mcp` exposes a local stdio MCP server for Claude Code. The supported
runtime is Node.js 22 or newer and Git must be available on `PATH`.

## Option A: Project-scoped source checkout

The repository includes a portable `.mcp.json`:

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

From the repository checkout, install dependencies and run the read-only
checks before opening the project in Claude Code:

```powershell
npm ci
npm run check
```

When Claude Code opens the repository, approve the project-scoped server if
prompted. Run `/mcp` and confirm that `git-graph` is connected.

## Option B: Installed package

After installing the package globally or using `npx`, add it from the project
where it should run:

```powershell
claude mcp add --transport stdio --scope local git-graph -- npx git-graph-mcp mcp
```

For a source checkout in another project, replace the executable with
`node <path-to-git-graph-mcp>\bin\git-graph-mcp.js mcp`.

## Tools

- `git_graph`: show the commit graph and return structured commit metadata.
- `git_status`: return compact branch and working-tree status.
- `git_selected`: return the current saved selection.
- `git_context_bundle`: return a bounded selection, status, graph, comparison,
  and warning bundle; patch content is opt-in.
- `git_search_commits`: page through commits with bounded ref, author, message,
  and time filters.
- `git_inspect_commit`: inspect a commit and save it as the current selection.
- `git_compare_selected_with_head`: compare the selection with `HEAD`.
- `git_create_branch_at_selected`: create a new local branch at the selection; never move an existing branch.
- `git_reset_plan`: preview soft, mixed, or hard reset impact; never execute reset.

Legacy tool results contain `schemaVersion: 1`; `git_context_bundle` and
`git_search_commits` use schema version 2. Expected failures use `isError: true`
with a stable error code.

## Resources

The server exposes two read-only resources for the default repository:

- `git-graph://default/selection`: the same JSON payload as `git_selected`.
- `git-graph://default/status`: the same JSON payload as `git_status`.

Resource subscriptions and list-change notifications are intentionally not
advertised. Clients without resource support can use the equivalent tools.

## Typical Claude prompt

```text
Use git_graph to show the current repository history. Inspect the commit before the feature merge, compare it with HEAD, and show a reset plan if useful. Do not execute reset, checkout, or any other destructive Git command.
```

## Manual verification

From a source checkout:

```powershell
node .\bin\git-graph-mcp.js graph --plain
node .\bin\git-graph-mcp.js inspect HEAD
node .\bin\git-graph-mcp.js selected
node .\bin\git-graph-mcp.js compare-selected
npm run check
```

For an installed package, use `npx git-graph-mcp mcp` in the MCP client and
`npx git-graph-mcp graph --plain` for the CLI smoke check.

## Troubleshooting stdio

The historical Windows timeout came from an earlier custom transport that
emitted `Content-Length`-framed messages. The current server uses the official
SDK `StdioServerTransport`; the official SDK client integration passes on
Windows and lists all nine tools plus both resources.

If Claude Code still reports a connection failure:

1. Check `node --version` (22 or newer) and `git --version`.
2. Run `npm ci` and `npm run check` from the source checkout.
3. Confirm `/mcp` shows the project server as connected.
4. Set `GIT_GRAPH_MCP_DEBUG=1` only when diagnosing; concise lifecycle events
   go to stderr and never to MCP stdout.

This repository records the verified official-client result, including the
resource list/read flow; it does not claim that every Claude Code release has
identical Windows behavior.
