# Spec: release-engineering

Status: draft for review

## Objective

Make `git-graph-mcp` reproducible to install, verify, diagnose, and package on supported Windows and Linux environments without publishing machine-specific configuration or depending on undocumented manual checks.

## Responsibilities

- Define supported Node and Git baselines.
- Provide repository-native syntax, unit, integration, smoke, and package checks.
- Run CI on Windows and Ubuntu.
- Keep npm contents portable and minimal.
- Provide verified setup for Claude Code and generic stdio MCP clients.
- Maintain opt-in diagnostics and correct historical troubleshooting documentation.
- Prepare, but do not publish, the v0.2 release candidate.

## Non-goals

- Publishing to npm, tagging Git, committing, or pushing without explicit approval.
- Auto-updaters, installers outside npm, signed binaries, or bundled Git/Node runtimes.
- Supporting end-of-life Node versions.

## Tech stack and commands

Supported runtime majors are Node 22 and Node 24. The development machine's current Node 20 installation is migration-only and is not a release acceptance environment.

Required commands after implementation:

```powershell
npm ci
npm run check:syntax
npm run test:unit
npm run test:integration
npm test
npm run smoke
npm run check
npm pack --dry-run
```

`npm run check` is the human and CI Definition of Done. It must not rely on an interactive TTY or mutate the development repository.

## Project structure

- `package.json` and `package-lock.json`: exact dependency and script contract.
- `.github/workflows/ci.yml`: OS/runtime matrix.
- `.mcp.json`: portable source-checkout setup using `node` from `PATH`.
- `README.md`: product, installation, commands, safety.
- `docs/CLAUDE_CODE.md`: verified Claude Code setup and troubleshooting.
- `docs/MCP_DEBUG_LOG.md`: historical evidence with corrected conclusion.
- `LICENSE`: license text matching `package.json`.
- `test/integration/package.test.js`: artifact allowlist assertions.

## Package contract

`package.json` must declare:

- target version `0.2.0` only when the release candidate is approved;
- `engines.node` as `>=22`;
- the executable `bin` mapping;
- the official MCP SDK dependency;
- an explicit `files` allowlist containing only runtime code and public package documentation;
- scripts used by this specification.

The packed artifact may contain:

- `bin/**`
- `src/**`
- `README.md`
- `LICENSE`
- npm-generated `package.json`

It must not contain `.mcp.json`, `start-mcp.bat`, tests, tasks, specifications, debug logs, coverage, temporary repositories, absolute local paths, or selection files.

## Configuration contract

Checked-in source configuration uses a portable command:

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

Installed-package documentation uses the package executable through the client's documented npm/npx workflow. Absolute developer paths belong only in local, ignored configuration.

## CI contract

The matrix covers:

- `windows-latest` with Node 22 and 24;
- `ubuntu-latest` with Node 22 and 24.

Each job checks out the repository, configures Node with npm cache, runs `npm ci`, then `npm run check`. A single job may upload diagnostic output only after a failure, and artifacts must not contain repository contents beyond test reports.

No automatic publish job is added in v0.2.

## Diagnostics contract

- Default execution creates no log file.
- `GIT_GRAPH_MCP_DEBUG=1` enables concise lifecycle logging to stderr and, if retained, a documented temporary file.
- Debug output records no patch body, environment dump, secrets, or arbitrary file content.
- Troubleshooting starts with runtime versions, `npm ci`, CLI smoke, official SDK handshake, and client configuration in that order.
- Historical hypotheses are labeled; disproven or superseded conclusions are corrected rather than repeated in setup docs.

## Code style

- Commands shown in documentation must be copyable and identify whether they apply to a source checkout or an installed package.
- Use relative paths in repository files and placeholders in examples.
- Keep one source of truth for supported runtime versions and derive server version from package metadata where practical.
- Avoid platform wrappers unless a verified platform limitation requires one.

## Testing strategy

- Package integration test parses `npm pack --dry-run --json` and asserts both allowed and forbidden paths.
- CLI smoke runs from a temporary repository and from the packed/installed artifact.
- MCP integration runs the packaged bin with the official SDK client.
- CI matrix provides Windows/Linux evidence.
- Manual Claude Code acceptance records the client version, Node version, connect result, tool list, and one read-only call; it does not record private repository content.

## Boundaries

- Always: lock dependencies; use a package allowlist; keep config portable; run checks on both OS families.
- Ask first: change supported Node majors; add a dependency; add release automation; publish, tag, commit, or push.
- Never: publish local paths or debug files; claim compatibility without a test; run automatic npm publication from the v0.2 CI workflow.

## Success criteria

- `npm ci` and `npm run check` pass on all four CI matrix entries.
- The package test proves the artifact contains only approved files.
- A clean temporary install exposes the executable and completes an official MCP handshake.
- Claude Code connects on Windows using documented portable configuration.
- Setup docs contain no machine-specific absolute path.
- Debug documentation accurately records the framing mismatch and the verified fix.
- No publish, tag, commit, or push occurs without later explicit approval.

## Open questions

None for v0.2. Registry publication metadata and release ownership are intentionally deferred until release approval.
