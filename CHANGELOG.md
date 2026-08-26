# Changelog

All notable changes to `git-graph-mcp` are documented here.

## Unreleased — v0.2 candidate

This section describes the current candidate only. The package version remains
`0.1.0` until the release gate is explicitly approved.

- Restored standards-compliant MCP stdio transport through the official SDK.
- Added schema-versioned MCP results, stable expected-error codes, and seven
  tools for graph, status, selection, comparison, branch creation, and reset
  planning.
- Hardened Git input validation, relationship comparison, linked-worktree
  selection state, and terminal cleanup.
- Added safe idempotent branch creation and read-only reset previews.
- Added portable npm packaging, Claude Code setup, opt-in diagnostics, and
  Windows/Ubuntu Node 22/24 CI configuration.
- Upgraded `@modelcontextprotocol/sdk` to `1.30.0` and verified zero production
  vulnerabilities through the official npm registry.
