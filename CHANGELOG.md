# Changelog

All notable changes to `git-graph-mcp` are documented here.

## 0.2.0 — 2026-08-26

This release contains the completed local-first MCP and terminal workflow.

- Restored standards-compliant MCP stdio transport through the official SDK.
- Added schema-versioned MCP results, stable expected-error codes, 12 bounded
  tools, and two read-only resources for graph, status, selection, context,
  search, diff, history, comparison, safe branch planning, and reset planning.
- Added typed commit/range/ref selection, action-plan receipts with repository
  state fingerprints, bounded Git timeouts/benchmarks, and the local `doctor`
  command with redacted JSON diagnostics.
- Hardened Git input validation, relationship comparison, linked-worktree
  selection state, and terminal cleanup.
- Added safe idempotent branch creation and read-only reset previews.
- Added portable npm packaging, Claude Code setup, opt-in diagnostics, and
  Windows/Ubuntu Node 22/24 CI configuration.
- Upgraded `@modelcontextprotocol/sdk` to `1.30.0` and verified zero production
  vulnerabilities through the official npm registry.
