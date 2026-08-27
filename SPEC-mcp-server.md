# Spec: mcp-server

Status: maintained contract for the v0.2.x implementation

## Objective

Expose `git-graph-mcp` capabilities to local AI coding tools through a standards-compliant, official-SDK stdio server with stable tool names, validated inputs, machine-readable outputs, predictable errors, and clean lifecycle handling.

## Responsibilities

- Start one local MCP server over official SDK stdio.
- Register the implemented 12-tool surface, including read-only context tools
  and two explicitly bounded safe-action tools.
- Validate every external argument before invoking domain functions.
- Return structured content plus readable text.
- Translate expected domain/action errors without leaking implementation detail.
- Keep stdout protocol-clean and shut down cleanly.

## Non-goals

- Hand-written JSON-RPC framing.
- Streamable HTTP, SSE, sockets, authentication, or remote deployment.
- Client-specific protocol branches.
- Executing reset or any unapproved Git mutation.

## Tech stack and commands

- `@modelcontextprotocol/sdk` official server and `StdioServerTransport`.
- CommonJS imports supported by the installed SDK export map.
- JSON Schema for tool inputs and outputs.

Focused verification:

```powershell
node --test test/unit/mcp.test.js test/integration/mcp-stdio.test.js
node .\bin\git-graph-mcp.js mcp
```

The second command is launched by an MCP client during real verification; users do not type JSON-RPC manually.

## Project structure

- `src/mcp.js`: server construction, schemas, result formatting, handlers, and stdio startup.
- `src/cli.js`: dispatches `mcp` before reading repository CLI options.
- `test/unit/mcp.test.js`: tool registry, schemas, and result/error formatting.
- `test/integration/mcp-stdio.test.js`: real official-SDK client process.

## Transport contract

- Use `StdioServerTransport`; do not wrap or subclass it.
- Messages are newline-delimited JSON-RPC.
- stdout contains MCP messages only.
- stderr may contain opt-in diagnostics.
- `SIGINT`, stdin close, and client close terminate the server without an orphan process.

The previously introduced `Content-Length` response framing is removed. Historical debug findings remain documented as history, with the conclusion corrected to the reproduced protocol mismatch.

## Tool contracts

All result objects include `schemaVersion: 1` and are mirrored in `structuredContent` and a JSON text block.

| Tool | Required input | Primary output | Mutation |
|---|---|---|---|
| `git_graph` | optional `repo`, `limit`, `timeoutMs` | root, branch, HEAD, graph text, commits | none |
| `git_status` | optional `repo`, `timeoutMs` | root, branch, HEAD, structured/compact status | none |
| `git_selected` | optional `repo` | normalized selection or `selected: null` | none |
| `git_context_bundle` | optional `repo`, bounds, `includePatch` | bounded selection, status, graph, comparison, and warnings | none |
| `git_search_commits` | optional filters and paging | bounded commit search results and cursor | none |
| `git_commit_diff` | required `commit`; optional path, parent, bounds, `includePatch` | structured diff metadata and optional bounded patch | none |
| `git_file_history` | required safe relative `path`; optional ref and paging | bounded file history | none |
| `git_revalidate_plan` | required `plan`; optional `repo` | current action-plan validity and state fingerprint | none |
| `git_inspect_commit` | required `commit` | inspected commit and saved selection | selection file only |
| `git_compare_selected_with_head` | optional `repo` | relationship and diff summary | none |
| `git_create_branch_at_selected` | required `name`; optional `plan` | created/idempotent branch result | creates one new local branch |
| `git_reset_plan` | required `mode` | preview, impacts, warnings, exact command | none |

Every tool accepts optional `repo`. `git_graph` additionally accepts optional integer `limit` from 1 to 500. `git_reset_plan.mode` is one of `soft`, `mixed`, or `hard`. Schemas set `additionalProperties: false`.

Repository default precedence is:

1. explicit tool `repo`;
2. `GIT_GRAPH_MCP_REPO`;
3. `CLAUDE_PROJECT_DIR`;
4. server process working directory.

### Error contract

Expected errors return `isError: true` with:

```js
{
  schemaVersion: 1,
  error: {
    code,
    message,
    details, // optional, serializable, no stack or raw environment
  },
}
```

Input and domain errors do not become generic protocol internal errors. Protocol errors remain reserved for malformed MCP messages or server defects.

### Compatibility policy

- Existing tool names are immutable in v0.2.
- Existing useful top-level fields remain present; new fields are additive.
- Human text may improve, but `structuredContent` is the stable machine contract.
- `schemaVersion` changes only for a breaking result-shape change and requires a migration plan.

## Code style

Keep the registry declarative and handlers thin:

```js
function successResult(data, text = JSON.stringify(data, null, 2)) {
  return {
    content: [{ type: "text", text }],
    structuredContent: data,
  };
}
```

The MCP module may format results but must not duplicate Git parsing, relationship classification, state migration, or action safety logic.

## Testing strategy

Unit tests assert exact tool names, descriptions, input constraints, output schemas, and error envelopes. The integration test uses the official SDK client to:

1. spawn the real bin entrypoint;
2. complete initialization within a bounded timeout;
3. list exactly twelve tools;
4. call representative read, selection, comparison, branch, and reset-plan flows against a temporary repository;
5. verify no non-MCP stdout; and
6. close the client and observe process exit.

The branch tool uses a disposable repository. The reset-plan test records refs, index, and worktree before and after and proves they are unchanged.

## Boundaries

- Always: official transport; boundary validation; structured errors; bounded request tests; protocol-clean stdout.
- Ask first: SDK major upgrade; tool rename; HTTP transport; new tool; result schema version change.
- Never: custom stdio framing; client-specific hacks; stack traces in results; reset execution; arbitrary stdout logging.

## Success criteria

- The official SDK client connects and lists twelve tools on Windows.
- Contract tests cover valid and invalid input for every tool.
- Every result provides `schemaVersion: 1` structured content.
- Expected errors are stable tool errors, not timeouts or uncaught exceptions.
- stdout is valid newline-delimited MCP JSON-RPC only.
- Server shutdown leaves no child process behind.

## Open questions

None for v0.2.
