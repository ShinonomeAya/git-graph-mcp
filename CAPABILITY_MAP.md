# Capability Map: git-graph-mcp v0.5 candidate

Status: approved on 2026-08-26

`git-graph-mcp` is split into independently testable capabilities so that a smaller model can implement one bounded module at a time without reinterpreting the whole product.

| Module id | Responsibility | Depends on | Specification |
|---|---|---|---|
| `git-domain` | Resolve repositories and revisions; read history, status, commits, and commit relationships | — | [SPEC-git-domain.md](SPEC-git-domain.md) |
| `selection-state` | Persist, migrate, and validate the selected commit in normal repositories and linked worktrees | `git-domain` | [SPEC-selection-state.md](SPEC-selection-state.md) |
| `terminal-ui` | Render the graph, navigate commits, show concise details, and save a selection | `git-domain`, `selection-state` | [SPEC-terminal-ui.md](SPEC-terminal-ui.md) |
| `mcp-server` | Expose 12 bounded tools and 2 read-only resources through official local stdio transport | `git-domain`, `selection-state` | [SPEC-mcp-server.md](SPEC-mcp-server.md) |
| `safe-actions` | Create a new branch safely and produce reset previews without executing resets | `git-domain`, `selection-state` | [SPEC-safe-actions.md](SPEC-safe-actions.md) |
| `release-engineering` | Provide tests, doctor diagnostics, portable configuration, CI, npm packaging, and release checks | all modules | [SPEC-release-engineering.md](SPEC-release-engineering.md) |

## Dependency direction

```text
git-domain
    |
    +--> selection-state
            |
            +--> terminal-ui
            +--> mcp-server
            +--> safe-actions
                    |
                    +--> mcp-server (tool exposure only)

all completed modules --> release-engineering
```

There are no cyclic dependencies. User interfaces call domain contracts; domain modules do not import the CLI, TUI, or MCP server.

## Build order

1. Restore a trustworthy test baseline and official MCP stdio transport.
2. Harden `git-domain` and `selection-state` contracts.
3. Complete `terminal-ui` and read-only `mcp-server` behavior.
4. Add `safe-actions` as two vertical slices: branch creation, then reset preview.
5. Finish `release-engineering`, cross-platform verification, and release documentation.

Detailed order, checkpoints, and risk handling live in [tasks/plan.md](tasks/plan.md). Executable work items live in [tasks/todo.md](tasks/todo.md).

## Evidence map

| Claim | Automated evidence |
|---|---|
| CLI graph/status/search/selection flows are deterministic | `test/integration/cli-graph.test.js`, `test/integration/git-repositories.test.js` |
| MCP tools/resources use bounded, schema-versioned contracts | `test/integration/mcp-stdio.test.js`, `test/unit/mcp.test.js` |
| Plans fail closed without destructive execution | `test/unit/actions.test.js`, `test/integration/safe-actions.test.js` |
| Clean installation exposes the documented entrypoints | `scripts/package-install.test.js`, `test/integration/package.test.js` |
| Runtime, Git, repo, config, and handshake diagnostics are redacted | `test/integration/cli-graph.test.js`, `test/unit/diagnostics.test.js` |

## Confirmed product boundaries

- The terminal remains the primary UI; no Web UI is in the current candidate.
- Windows plus Claude Code is the first manual acceptance environment.
- Protocol behavior is verified with the official MCP SDK so Codex, Cursor, and other conforming clients are not coupled to Claude-specific behavior.
- Branch creation may execute only after an explicit tool call with a valid new branch name.
- Soft, mixed, and hard reset are preview-only. The project must not execute them.
- Checkout, branch deletion, rebase, force push, and push are outside v0.2.
- Existing uncommitted MCP transport experiments are evidence, not an approved implementation. They may be replaced while preserving useful debug history.

## Initiative completion

The candidate is ready for human release review only when every module success criterion passes,
the checkpoints in `tasks/todo.md` are checked, and the applicable Windows/Ubuntu CI evidence is
current. Repository visibility, version, tag, release, and npm publication are separate explicit
actions.
