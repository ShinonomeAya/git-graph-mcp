# git-graph-mcp v0.2 Technical Solution

Status: draft for review; product boundaries confirmed on 2026-08-26

## 1. Objective

`git-graph-mcp` gives terminal-first AI coding tools a shared, inspectable Git context. A developer selects a commit in the terminal, and an AI client reads that exact selection before suggesting or performing narrowly allowed Git actions.

The v0.2 objective is to turn the current proof of concept into a reliable local CLI and MCP server that:

1. renders real Git history consistently;
2. stores a commit selection safely, including in linked worktrees;
3. connects to Claude Code on Windows through standards-compliant stdio;
4. exposes predictable, machine-readable tool results;
5. can create a new branch at the selected commit safely;
6. can explain reset effects without executing a reset; and
7. can be tested and packed reproducibly as an npm CLI.

Primary users are developers who work in Claude Code, Codex, Cursor, or another MCP-capable coding tool and want visual control over the history context given to the agent.

## 2. Confirmed assumptions

- The product is local-first and terminal-first.
- Windows plus Claude Code is the first manual acceptance target.
- Interoperability is defined by the MCP protocol and official SDK, not by client-specific workarounds.
- The source remains CommonJS JavaScript for v0.2; a TypeScript or ESM migration is not required to deliver the requested behavior.
- Node.js 22 or 24 is the supported runtime. Node 20 may be used only as a temporary local migration check because it is end-of-life.
- The server uses local stdio. Streamable HTTP is not required for v0.2 and must not be added as a workaround for a broken stdio implementation.
- The npm artifact must be portable, but publishing it to the registry requires separate approval.

## 3. Current baseline

The repository contains a small CommonJS CLI with these working capabilities:

- real history read through `git log --graph --topo-order`;
- static graph output and an interactive TUI;
- commit selection persisted under `.git/`;
- CLI commands for graph, status, selection, inspection, and comparison;
- twelve MCP tool definitions, two read-only resources, and two safe-action tools;
- the official SDK stdio transport and a preserved Windows timeout investigation.

Verified on 2026-08-26:

- `graph --plain` and `status` execute successfully;
- all current JavaScript source files pass `node --check`;
- the official SDK client completes initialize, lists all twelve tools and both resources, and closes cleanly on Windows;
- stdout is newline-delimited MCP JSON-RPC through the official SDK transport;
- `GIT_GRAPH_MCP_DEBUG=1` emits concise stderr-only lifecycle diagnostics;
- the npm dry run is constrained to the runtime/public-document allowlist;
- the working tree contains user-owned, uncommitted implementation work that must be preserved until review.

## 4. Scope

### In scope for v0.2

- Correct repository and revision resolution.
- Graph, status, commit inspection, and relationship comparison.
- Versioned, atomic, worktree-compatible selection storage.
- Static and interactive terminal views.
- Official SDK stdio server with twelve tools and two read-only resources.
- Safe new-branch creation at the selected commit.
- Soft, mixed, and hard reset impact previews.
- Structured errors, opt-in diagnostics, automated tests, CI, and portable npm packaging.

### Out of scope for v0.2

- Executing any reset.
- Checkout or detached-HEAD actions.
- Branch deletion or rename.
- Commit, merge, rebase, push, or force push.
- Remote or hosted MCP transport.
- Authentication, authorization servers, or multi-user operation.
- Web UI, editor extension, or graphical diff viewer.
- Independent branch/lane selection in the TUI.

## 5. Architecture

```text
Claude Code / Codex / Cursor                 Human terminal
              |                                   |
       MCP newline JSON-RPC                       | keys / text
              |                                   |
              v                                   v
       +-------------+                     +-------------+
       | mcp-server  |                     | terminal-ui |
       +------+------+                     +------+------+
              |                                   |
              +----------------+------------------+
                               |
                    +----------+----------+
                    | selection-state     |
                    +----------+----------+
                               |
                    +----------v----------+
                    | git-domain          |
                    +----------+----------+
                               |
                    +----------v----------+
                    | git executable      |
                    +---------------------+

safe-actions depends on git-domain + selection-state and is exposed by mcp-server.
```

### Design rules

- `git-domain` is the only module allowed to execute Git commands.
- Git is invoked with `execFile`/`execFileSync` argument arrays; no shell-built commands.
- UI and transport modules translate their inputs once, call domain functions, and format results.
- Expected failures use stable error codes; raw stderr and stack traces do not cross public boundaries.
- stdout is reserved exclusively for MCP messages while the server is in stdio mode.
- Existing public tool names are preserved. New fields are additive and carry `schemaVersion: 1`.

## 6. Runtime and dependencies

| Concern | Decision |
|---|---|
| Runtime | Node.js `>=22` |
| Verified CI majors | Node 22 and Node 24 |
| Language/module system | JavaScript, CommonJS |
| Git integration | System `git` executable through `child_process.execFile*` |
| MCP | Official `@modelcontextprotocol/sdk`, initially retaining the installed 1.x API until a separately tested migration is needed |
| Test runner | Built-in `node:test` and `node:assert/strict` |
| Package manager | npm with committed lockfile |
| Build step | None; source is executed directly |

No new runtime dependency should be added unless the existing SDK or Node standard library cannot meet an approved requirement.

## 7. Command contract

### Existing user commands to preserve

```powershell
node .\bin\git-graph-mcp.js graph --repo <path> --limit 80
node .\bin\git-graph-mcp.js graph --repo <path> --plain --limit 80
node .\bin\git-graph-mcp.js status --repo <path>
node .\bin\git-graph-mcp.js selected --repo <path>
node .\bin\git-graph-mcp.js inspect <revision> --repo <path>
node .\bin\git-graph-mcp.js compare-selected --repo <path>
node .\bin\git-graph-mcp.js mcp
```

### Planned development commands

```powershell
npm install
npm run check:syntax
npm run test:unit
npm run test:integration
npm test
npm run smoke
npm run check
npm pack --dry-run
```

`npm run check` is the required local gate and must run syntax checks, all tests, the smoke suite, and the package dry run without modifying a Git repository under test.

## 8. Target project structure

```text
bin/
  git-graph-mcp.js          CLI executable entrypoint
src/
  cli.js                    Argument parsing and CLI orchestration
  git.js                    Git-domain operations and normalized errors
  graph.js                  Pure lane/row model and text symbols
  state.js                  Versioned selection persistence
  tui.js                    Interactive and static terminal rendering
  actions.js                New-branch action and reset-plan generation
  mcp.js                    MCP tool schemas, handlers, and official transport
test/
  helpers/git-repo.js       Temporary Git repository fixture builder
  unit/                     Pure and focused module tests
  integration/              CLI, worktree, and MCP process tests
docs/
  TECHNICAL_SOLUTION.md     System-wide architecture and decisions
  CLAUDE_CODE.md            User setup and troubleshooting
  MCP_DEBUG_LOG.md          Historical investigation, clearly labeled
tasks/
  plan.md                   Dependency-ordered implementation plan
  todo.md                   Executable task checklist
CAPABILITY_MAP.md           Stable module index and build order
SPEC-*.md                   Module contracts and acceptance criteria
```

Only add a new source module when it represents one of the approved capability boundaries. Do not create generic `utils`, `services`, or `managers` modules.

## 9. Code style

- Two-space indentation, semicolons, double-quoted strings, trailing commas in multiline literals.
- `camelCase` for functions and values; `UPPER_SNAKE_CASE` for constants and machine-readable error codes; kebab-case for stable module ids.
- Functions should return plain serializable objects at module boundaries.
- Boundary validation happens in CLI/MCP handlers and repository resolution. Internal functions may trust normalized inputs.
- Comments explain safety or protocol decisions, not obvious syntax.

Representative style:

```js
function normalizeLimit(value, fallback = 80) {
  const limit = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw createError("INVALID_LIMIT", "limit must be an integer from 1 to 500");
  }
  return limit;
}
```

## 10. Public contracts

### CLI behavior

- Successful machine-readable commands write one JSON document to stdout and exit `0`.
- `graph --plain` writes human-readable text and exits `0`.
- Validation or Git failures write one concise message to stderr and set a non-zero exit code.
- Unknown commands, unknown options, and options missing values fail explicitly.
- `--repo` defaults to the current working directory for CLI commands.

### MCP tools

Existing names remain stable:

- `git_graph`
- `git_status`
- `git_selected`
- `git_inspect_commit`
- `git_compare_selected_with_head`

v0.2 adds:

- `git_create_branch_at_selected`
- `git_reset_plan`

Every successful result includes the same object in `structuredContent` and as JSON in a text content block. Results contain `schemaVersion: 1`. `git_graph` may prepend its compact human graph to the text block, but `structuredContent` remains pure data.

Expected tool failures return `isError: true` and this stable shape:

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "INVALID_REVISION",
    "message": "The requested Git revision does not exist."
  }
}
```

Implementation details, absolute debug-log paths, stack traces, and raw Git command lines are excluded unless a documented reset preview intentionally displays the proposed command.

### Selection document

New writes use this versioned shape:

```json
{
  "schemaVersion": 1,
  "repoRoot": "C:/work/project",
  "selected": {
    "kind": "commit",
    "oid": "40-character-object-id"
  },
  "resolvedAt": "2026-08-26T00:00:00.000Z",
  "commit": {
    "shortHash": "abcdef0",
    "subject": "Example commit",
    "refs": []
  }
}
```

Readers accept the current legacy shape during v0.2 and normalize it in memory. The next successful write replaces it with schema version 1. The file is written atomically in the Git path returned by `git rev-parse --git-path`.

### Comparison semantics

Comparison output must distinguish these cases:

- `SAME`: selection equals HEAD;
- `ANCESTOR`: HEAD is ahead of the selection;
- `DESCENDANT`: the selection is ahead of HEAD;
- `DIVERGED`: both sides contain unique commits.

The result includes full selected and HEAD object ids, merge base when available, `headAheadCount`, `headBehindCount`, working-tree dirtiness, changed files, diff stat, and safety warnings. It must never describe a divergent selection as a simple reset target without explaining that commits exist on both sides.

## 11. Safe-action model

### New branch creation

- Resolve the saved commit immediately before action.
- Validate the name with Git's own ref validation.
- Reject empty names, option-like names, invalid refs, and a branch that points elsewhere.
- If the branch already points to the same commit, return an idempotent success with `created: false`.
- Never overwrite or force-move an existing branch.
- Return the created/existing ref and resolved object id.

### Reset plan

- Accept only `soft`, `mixed`, or `hard`.
- Recompute the selected/HEAD relationship and dirty state at request time.
- Return the exact proposed command, affected commits, index/worktree impact, warnings, and a backup-branch suggestion.
- Set `requiresExplicitExternalExecution: true`.
- Never invoke `git reset` from any v0.2 code path.

## 12. Transport and lifecycle

- Use the official SDK `StdioServerTransport` with `server.connect(transport)`.
- Do not maintain a parallel custom stdio parser or writer.
- MCP requests and responses are newline-delimited JSON-RPC on stdin/stdout.
- Normal execution creates no log file. Optional lifecycle diagnostics go to stderr only when `GIT_GRAPH_MCP_DEBUG=1`.
- Handle `SIGINT`, stdin end, and transport close without leaving the child process alive.
- Stdio is tested by launching the real CLI with the official SDK client, completing initialize, listing tools, calling representative tools, and closing cleanly.

Streamable HTTP may be reconsidered only for an approved remote/server deployment. If added later it requires loopback binding by default, Origin validation, authentication, and repository authorization; legacy SSE is not the target transport.

## 13. Testing strategy

### Unit tests

- Graph row construction and rendering.
- Argument and limit validation.
- Git output parsing and normalized errors.
- Selection migration and atomic persistence.
- Relationship classification and reset-plan generation.
- Branch-name validation and idempotency decisions.

### Integration tests

- Create isolated temporary repositories with deterministic commits, branches, merges, detached HEAD, empty history, dirty index, dirty worktree, and linked worktrees.
- Execute the public CLI and assert exit codes, stdout, and stderr.
- Spawn the MCP server with the official SDK client and exercise initialization, tool listing, success results, expected failures, and shutdown.
- Run the npm package dry run and assert the package contains only approved files.

Tests must not use the development repository as a mutation target. Temporary repositories are removed after each test. No test executes reset, push, force push, branch deletion, or rebase.

No arbitrary coverage percentage gates v0.2. Every branch of safety-critical action code and every documented public command/tool must have an explicit test.

## 14. Diagnostics and observability

- Normal CLI errors are concise and actionable.
- MCP mode writes no non-protocol stdout.
- Debug logging is opt-in and records timestamps, lifecycle events, tool names, durations, and normalized error codes.
- Debug logs must not include patch contents, environment variables, or arbitrary file contents.
- Documentation must distinguish evidence from hypotheses. The current Windows timeout record should be updated to state that non-standard response framing was reproduced locally; it must not claim an upstream Claude Code defect without independent evidence.

## 15. Packaging and compatibility

- Use `package.json#files` as an allowlist for `bin/`, `src/`, `README.md`, and the license file.
- Exclude `.mcp.json`, local launch scripts, task documents, debug logs, tests, and machine-specific paths from the npm artifact.
- Keep the executable shebang and verify the installed bin on Windows and Linux.
- Use `node` from `PATH` in checked-in project configuration; do not commit an absolute Node executable path.
- CI covers Windows and Ubuntu on Node 22 and Node 24.
- Target release is `0.2.0`; publication and Git tagging require explicit approval after release-candidate review.

## 16. Boundaries

### Always do

- Preserve unrelated and pre-existing local changes.
- Add or change tests before changing safety-critical behavior.
- Resolve repository roots and revisions through Git before use.
- Use argument-array child process APIs.
- Run focused tests after each task and `npm run check` at every checkpoint.
- Keep tool names and existing response fields backward compatible where practical.

### Ask first

- Add a runtime dependency.
- Change the module system or migrate to TypeScript.
- Add Streamable HTTP or any listening network socket.
- Change an existing CLI command or MCP tool name.
- Expand write permissions beyond new-branch creation.
- Publish to npm, create a Git tag, commit, or push.

### Never do in v0.2

- Execute reset, checkout, rebase, merge, push, force push, or branch deletion.
- Use shell-concatenated Git commands.
- Write diagnostics to MCP stdout.
- Package machine-specific paths, secrets, selection files, or debug logs.
- Mutate a repository from a read-only tool.
- Remove or weaken a failing safety test to make a check pass.

## 17. Success criteria

v0.2 is ready for human release review when:

- the official SDK client connects to the packaged stdio server on Windows;
- all twelve MCP tools and two resources appear and their success/error schemas pass contract tests;
- normal repositories, empty repositories, detached HEAD, divergent history, dirty trees, and linked worktrees pass automated tests;
- `git_create_branch_at_selected` is idempotent and never moves an existing branch;
- `git_reset_plan` never invokes reset and accurately describes all three modes;
- every documented CLI command has a passing smoke or integration test;
- stdio stdout contains only valid newline-delimited MCP messages;
- `npm run check` passes on Windows and Ubuntu with Node 22 and 24;
- `npm pack --dry-run` contains no absolute paths or internal debug/task files;
- README and Claude Code setup instructions match the verified implementation; and
- the working tree contains no unintended changes from temporary test repositories.

## 18. Open questions deferred beyond v0.2

- Whether branch/lane selection should become independent from commit selection.
- Whether a Web UI is valuable for large graph or diff review.
- Whether to add a secured Streamable HTTP deployment mode.
- Whether to migrate to the newer split MCP SDK packages and newer protocol era after the v0.2 compatibility baseline is stable.

None of these questions blocks v0.2.

## 19. Authoritative references

- [MCP transport specification, revision 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP lifecycle specification, revision 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [Official TypeScript SDK server guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md)
- [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp)
- [Node.js end-of-life policy and releases](https://nodejs.org/en/about/eol)
