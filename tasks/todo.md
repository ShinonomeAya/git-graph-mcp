# git-graph-mcp v0.2 Task List

Status: T16 human release gate pending; T15 CI completed; T14 completed; dependency security remediation completed; Checkpoint D approved by self-review

Rules for every task:

- Read [CAPABILITY_MAP.md](../CAPABILITY_MAP.md), [docs/TECHNICAL_SOLUTION.md](../docs/TECHNICAL_SOLUTION.md), and only the selected module spec before editing.
- Inspect overlapping uncommitted changes first and preserve unrelated work.
- Do not commit, push, publish, tag, reset, checkout, or broadly stage files without explicit user approval.
- Complete tasks in dependency order and stop at each checkpoint for review.

## T01: Establish runtime and test baseline

**Module:** `release-engineering`

**Description:** Add the smallest Node built-in test harness, deterministic temporary-Git fixture helper, maintained runtime metadata, and repository-native check scripts without changing product behavior.

**Acceptance criteria:**

- [x] `package.json` advertises Node `>=22` and defines syntax, unit, integration, smoke, test, and check scripts.
- [x] A temporary-repository helper configures a local test identity and never targets the development repository.
- [x] At least the current pure graph behavior has a passing baseline test.

**Verification:**

- [x] `npm install` completes and lockfile metadata matches `package.json`.
- [x] `npm run check:syntax` and `npm test` pass on the current source baseline.
- [x] `git status --short` shows only expected project/test changes plus preserved pre-existing changes.

**Dependencies:** None

**Files likely touched:**

- `package.json`
- `package-lock.json`
- `test/helpers/git-repo.js`
- `test/unit/graph.test.js`

**Estimated scope:** Medium (4 files)

## T02: Restore standards-compliant MCP stdio

**Module:** `mcp-server`

**Description:** Reproduce the timeout with an official-client test, replace custom `Content-Length` framing with the SDK `StdioServerTransport`, and record the verified cause without keeping a second transport.

**Acceptance criteria:**

- [x] The official SDK client initializes the real bin process and lists the five existing tools within a bounded timeout.
- [x] MCP stdout contains newline-delimited JSON-RPC only; no `Content-Length` header or debug text appears.
- [x] The historical debug record identifies non-standard response framing as the reproduced cause and labels older hypotheses accurately.

**Verification:**

- [x] `node --test test/integration/mcp-stdio.test.js` passes.
- [x] `npm run check:syntax` passes.
- [x] Closing the client terminates the spawned server without an orphan process.

**Dependencies:** T01

**Files likely touched:**

- `src/mcp.js`
- `test/integration/mcp-stdio.test.js`
- `docs/MCP_DEBUG_LOG.md`

**Estimated scope:** Medium (3 files)

## T03: Stabilize MCP schemas and errors

**Module:** `mcp-server`

**Description:** Define the v1 result/error contract, add boundary validation and `structuredContent`, preserve existing tool names/fields, and keep protocol errors separate from expected tool failures.

**Acceptance criteria:**

- [x] The five existing tools have `additionalProperties: false`, validated inputs, and documented output schemas.
- [x] Successful outputs include `schemaVersion: 1` in structured and text content without removing useful existing fields.
- [x] Invalid repository, revision, and limit inputs return stable `isError: true` tool results rather than timeouts or stacks.

**Verification:**

- [x] `node --test test/unit/mcp.test.js test/integration/mcp-stdio.test.js` passes.
- [x] Contract assertions cover every existing tool and representative error.
- [x] `npm run check:syntax` passes.

**Dependencies:** T02

**Files likely touched:**

- `src/mcp.js`
- `test/unit/mcp.test.js`
- `test/integration/mcp-stdio.test.js`

**Estimated scope:** Medium (3 files)

## Checkpoint A: Protocol baseline

- [x] T01–T03 acceptance criteria pass.
- [x] `npm run check` passes.
- [x] Official SDK handshake and tool listing pass on Windows.
- [x] Human approves replacing the experimental transport before T04.

## T04: Harden repository inputs and status/history

**Module:** `git-domain`

**Description:** Centralize repository/revision/limit validation, normalize empty and detached repositories, structure status without removing compact lines, and make CLI option failures explicit.

**Acceptance criteria:**

- [x] Repository paths, revisions, and limits produce the documented normalized values or stable error codes.
- [x] Empty, detached, clean, staged, unstaged, and untracked fixtures return documented context/status shapes.
- [x] Unknown CLI options and options missing values fail non-zero with one concise stderr message.

**Verification:**

- [x] `node --test test/unit/git.test.js test/integration/git-repositories.test.js` passes.
- [x] Existing `graph`, `status`, and `inspect` smoke commands still work against temporary repositories.
- [x] Before/after fixture assertions prove read paths do not change Git state.

**Dependencies:** Checkpoint A

**Files likely touched:**

- `src/git.js`
- `src/cli.js`
- `test/unit/git.test.js`
- `test/integration/git-repositories.test.js`

**Estimated scope:** Medium (4 files)

## T05: Implement symmetric history comparison

**Module:** `git-domain`

**Description:** Replace the one-way `selected..HEAD` assumption with explicit SAME, ANCESTOR, DESCENDANT, and DIVERGED classification, merge base, both-side counts, dirty state, and warnings.

**Acceptance criteria:**

- [x] All four relationship states return correct full oids, merge base, `headAheadCount`, and `headBehindCount`.
- [x] Changed files and diff stat are deterministic and merge commits do not create accidental duplicate entries.
- [x] Diverged, descendant, and dirty cases contain distinct safety warnings.

**Verification:**

- [x] `node --test test/unit/git.test.js test/integration/git-repositories.test.js` passes.
- [x] Counts match `git rev-list --left-right --count` in every fixture.
- [x] `compare-selected` returns valid JSON and leaves Git state unchanged.

**Dependencies:** T04

**Files likely touched:**

- `src/git.js`
- `test/unit/git.test.js`
- `test/integration/git-repositories.test.js`

**Estimated scope:** Medium (3 files)

## T06: Make selection state versioned and worktree-safe

**Module:** `selection-state`

**Description:** Resolve the selection location through Git, support the legacy shape, write schema v1 atomically, and distinguish missing, malformed, unsupported, and stale state.

**Acceptance criteria:**

- [x] Legacy data reads as normalized v1 and the next explicit write produces the v1 document.
- [x] Main and linked worktrees store independent selections at Git-resolved paths.
- [x] Atomic-write failure preserves the previous valid file; malformed/unsupported/stale cases have distinct errors.

**Verification:**

- [x] `node --test test/unit/state.test.js test/integration/worktree-selection.test.js` passes.
- [x] An interrupted/rejected replacement test leaves the original JSON parseable.
- [x] `inspect`, `selected`, and comparison still agree on the selected oid.

**Dependencies:** T05

**Files likely touched:**

- `src/state.js`
- `src/git.js`
- `test/unit/state.test.js`
- `test/integration/worktree-selection.test.js`

**Estimated scope:** Medium (4 files)

## Checkpoint B: Read-only core

- [x] T04–T06 acceptance criteria pass.
- [x] `npm run check` passes.
- [x] Empty, detached, dirty, merged, divergent, and linked-worktree fixtures pass.
- [x] Human reviews the v1 state and comparison schemas before T07.

## T07: Harden graph and interactive rendering

**Module:** `terminal-ui`

**Description:** Make graph/render helpers deterministic for empty, branch, merge, long, and narrow cases; isolate navigation logic; add bounded details; and guarantee terminal cleanup.

**Acceptance criteria:**

- [x] Empty history, linear history, branches, merges, and graph continuation lines render as specified.
- [x] Navigation clamps safely, details remain bounded, and narrow terminals truncate display without changing data.
- [x] All quit/error paths restore cursor visibility, raw mode, and terminal listeners through one idempotent cleanup path.

**Verification:**

- [x] `node --test test/unit/graph.test.js test/unit/tui.test.js` passes.
- [x] Plain snapshots contain no ANSI codes and remain deterministic.
- [x] Manual Windows TTY quit/cleanup passes at the default 80-column PTY; narrow (~60) behavior is covered by bounded-width tests.

**Dependencies:** Checkpoint B

**Files likely touched:**

- `src/graph.js`
- `src/tui.js`
- `test/unit/graph.test.js`
- `test/unit/tui.test.js`

**Estimated scope:** Medium (4 files)

## T08: Verify the complete CLI selection workflow

**Module:** `terminal-ui`, `selection-state`

**Description:** Exercise public CLI commands through the bin entrypoint, including non-TTY fallback, selection persistence, JSON output, and concise failure behavior.

**Acceptance criteria:**

- [x] `graph --plain`, non-TTY `graph`, `status`, `inspect`, `selected`, and `compare-selected` pass end to end.
- [x] Machine commands write one parseable JSON document; plain graph writes text; failures write stderr and exit non-zero.
- [x] The commit saved through `inspect` is the same oid returned by CLI and MCP selection reads.

**Verification:**

- [x] `node --test test/integration/cli-graph.test.js test/integration/mcp-stdio.test.js` passes.
- [x] `npm run smoke` passes from a disposable repository.
- [x] The development repository's refs/index/worktree are unchanged by the tests.

**Dependencies:** T07

**Files likely touched:**

- `src/cli.js`
- `test/integration/cli-graph.test.js`
- `test/integration/mcp-stdio.test.js`

**Estimated scope:** Medium (3 files)

## Checkpoint C: Terminal acceptance

- [x] T07–T08 acceptance criteria pass.
- [x] `npm run check` passes.
- [x] Manual Windows terminal checks are recorded.
- [x] Human approves the read-only terminal workflow before actions are added.

## T09: Add idempotent branch creation

**Module:** `safe-actions`, `mcp-server`

**Description:** Implement the complete vertical slice from selected state through validated domain ref creation to `git_create_branch_at_selected`, without checkout or force behavior.

**Acceptance criteria:**

- [x] A valid new name creates exactly one local branch at the revalidated selected oid and leaves HEAD/index/worktree unchanged.
- [x] Retrying the same branch/oid succeeds with `created: false`; an existing branch elsewhere fails without mutation.
- [x] Invalid, option-like, missing, and stale inputs return documented error codes through MCP.

**Verification:**

- [x] `node --test test/unit/actions.test.js test/integration/safe-actions.test.js test/integration/mcp-stdio.test.js` passes.
- [x] Before/after ref snapshots prove no existing ref moved.
- [x] The official client sees the sixth tool and its v1 result/error contract.

**Dependencies:** Checkpoint C

**Files likely touched:**

- `src/actions.js`
- `src/git.js`
- `src/mcp.js`
- `test/unit/actions.test.js`
- `test/integration/safe-actions.test.js`

**Estimated scope:** Medium (5 files)

## T10: Add reset preview without execution

**Module:** `safe-actions`, `mcp-server`

**Description:** Implement the pure reset planner and expose `git_reset_plan` for soft, mixed, and hard modes with current relationship, dirty-state warnings, exact proposed command, and backup suggestion.

**Acceptance criteria:**

- [x] All three modes report correct ref/index/worktree impacts and set `requiresExplicitExternalExecution: true`.
- [x] SAME, ANCESTOR, DESCENDANT, DIVERGED, dirty, stale, and invalid-mode cases produce specified outputs/errors.
- [x] No planner or MCP path invokes `git reset` or changes refs, HEAD, index, worktree, or selection.

**Verification:**

- [x] `node --test test/unit/actions.test.js test/integration/safe-actions.test.js test/integration/mcp-stdio.test.js` passes.
- [x] Git invocation/source assertions prove no `reset` subcommand was called.
- [x] The official client sees exactly seven tools and valid v1 reset-plan content.

**Dependencies:** T09

**Files likely touched:**

- `src/actions.js`
- `src/mcp.js`
- `test/unit/actions.test.js`
- `test/integration/safe-actions.test.js`
- `test/integration/mcp-stdio.test.js`

**Estimated scope:** Medium (5 files)

## Checkpoint D: Action safety

- [x] T09–T10 acceptance criteria pass.
- [x] `npm run check` passes.
- [x] Mutation snapshots show only the explicitly requested new branch.
- [x] Self-review approves branch conflict behavior and reset warnings.

## T11: Make runtime configuration and npm package portable

**Module:** `release-engineering`

**Description:** Add the package allowlist, portable project MCP command, matching license, and an artifact test that forbids machine-specific or internal files.

**Acceptance criteria:**

- [x] Checked-in MCP configuration uses `node` from `PATH` and repository-relative arguments.
- [x] The package declares Node `>=22`, contains the matching license, and uses an explicit runtime/public-doc allowlist.
- [x] Dry-run JSON proves local config, batch files, tests, tasks, specs, and debug logs are excluded.

**Verification:**

- [x] `node --test test/integration/package.test.js` passes.
- [x] `npm pack --dry-run --json` contains only the approved artifact files.
- [x] A clean temporary install exposes `git-graph-mcp` and passes CLI/MCP smoke.

**Dependencies:** Checkpoint D

**Files likely touched:**

- `package.json`
- `package-lock.json`
- `.mcp.json`
- `LICENSE`
- `test/integration/package.test.js`

**Estimated scope:** Medium (5 files)

## T12: Align diagnostics and user documentation

**Module:** `release-engineering`, `mcp-server`

**Description:** Make logging opt-in and protocol-safe, then update README, setup, and debug history to match only verified commands, compatibility, safety, and troubleshooting behavior.

**Acceptance criteria:**

- [x] Normal execution creates no debug log and MCP stdout remains protocol-only; opt-in logging excludes sensitive content.
- [x] README and Claude Code docs distinguish source-checkout and installed-package commands and contain no developer-specific paths.
- [x] Debug history records the framing mismatch and verified official-transport fix without asserting an unsupported upstream bug.

**Verification:**

- [x] MCP integration passes with debug off and on.
- [x] Source-checkout and installed-package commands are verified on Windows; live Claude Code registration remains client-specific.
- [x] `rg` finds no `F:\\sokusai`, `C:\\Program Files\\nodejs`, or temporary-log absolute path in public setup/package files.

**Dependencies:** T11

**Files likely touched:**

- `src/mcp.js`
- `README.md`
- `docs/CLAUDE_CODE.md`
- `docs/MCP_DEBUG_LOG.md`

**Estimated scope:** Medium (4 files)

## T13: Add CI and complete the release-candidate audit

**Module:** `release-engineering`

**Description:** Add the Windows/Ubuntu and Node 22/24 check matrix, then run the full local, packaged, and real-client acceptance suite without publishing or changing Git history.

**Acceptance criteria:**

- [x] CI runs `npm ci` and `npm run check` on Windows/Ubuntu with Node 22/24 and all entries pass.
- [x] The packed artifact passes clean-install CLI and official MCP client acceptance on Windows.
- [x] The final audit finds no unapproved Git command path, machine-specific package content, or unintended working-tree change.

**Verification:**

- [x] `npm run check` passes locally on the available Node 20 migration environment; Node 22/24 CI remains pending.
- [x] Official-registry production dependency audit reports zero vulnerabilities after the MCP SDK 1.30.0 upgrade.
- [x] CI results for all four matrix entries are recorded for human review (`32940965021`, commit `3224cd8`).
- [x] `git diff --check`, `git status --short`, and package contents are reviewed; no commit, tag, push, or publish is performed.

**Dependencies:** T12

**Files likely touched:**

- `.github/workflows/ci.yml`

**Estimated scope:** Small (1 file plus verification)

## Checkpoint E: v0.2 release review

- [ ] All task acceptance criteria are checked.
- [ ] All module success criteria are satisfied.
- [x] CI, packaged install, Windows Terminal, and Claude Code connection evidence are available.
- [ ] Human explicitly decides whether to bump version, commit, tag, push, and/or publish.

## T14: Execute the local release preflight

**Description:** Consolidate the local candidate evidence, update release notes,
and confirm the working tree is ready for an external CI handoff without
changing Git history.

**Acceptance criteria:**

- [x] Full tests, clean package install, official-registry audit, package allowlist,
  and public-path scan pass.
- [x] Candidate changelog and rollback notes are present and verified.
- [x] No commit, tag, push, or publish is performed.

**Verification:**

- [x] `npm run check` and `npm run test:package-install` pass.
- [x] `npm audit --registry=https://registry.npmjs.org --omit=dev --audit-level=high` passes.
- [x] `git diff --check` and `npm pack --dry-run --json` pass.

**Dependencies:** T13

## T15: Obtain maintained-runtime CI evidence

**Acceptance criteria:**

- [x] Windows/Ubuntu × Node 22/24 all pass `npm ci`, audit, and `npm run check`.
- [x] Results are recorded for review (`32940965021`, commit `3224cd8`).

**Verification:**

- [x] Windows temporary Node 22.23.2 and 24.19.0 direct test runs pass 44 tests.
- [x] Windows temporary Node 22.23.2 and 24.19.0 clean package-install runs pass.
- [x] GitHub Actions matrix has four successful jobs.

**Dependencies:** T14 and the newly created private remote; CI evidence is complete

## T16: Human release gate

**Acceptance criteria:**

- [ ] User approves version `0.2.0` and release notes.
- [ ] User separately approves commit, tag, push, and npm publish.
- [ ] Rollback and first-hour verification owner are identified.

**Dependencies:** T15

## Phase 6 checkpoint: v0.2 release-ready, not yet released

- [ ] T14–T16 acceptance criteria pass.
- [ ] No high-severity dependency findings remain.
- [ ] No external release mutation occurs without explicit approval.

## T17: Add selection schema v2 with compatible reads

**Description:** Extend the persisted selection contract from one commit to a
typed commit, range, or ref selection without breaking existing schema v1 files.

**Acceptance criteria:**

- [x] v1 files normalize in memory without being rewritten on read.
- [x] v2 writes validate immutable oids and store ref name plus resolved oid.
- [x] malformed, unsupported, moved-ref, and stale selections have distinct errors.

**Verification:**

- [x] `node --test test/unit/state.test.js test/integration/worktree-selection.test.js` passes.
- [x] Before/after assertions prove reads do not change the selection file or Git state.

**Dependencies:** T16 and explicit approval to start post-v0.2 development

**Files likely touched:**

- `src/state.js`
- `SPEC-selection-state.md`
- `test/unit/state.test.js`
- `test/integration/worktree-selection.test.js`
- `src/mcp.js`
- `test/unit/mcp.test.js`

**Estimated scope:** Medium (6 files)

## T18: Add commit, range, and ref selection to the domain and CLI

**Description:** Resolve and save one commit, two immutable range endpoints, or
a full ref through typed CLI commands while preserving current commands.

**Acceptance criteria:**

- [x] Range endpoints and refs resolve through Git and reject option-like revisions.
- [x] Existing `inspect`, `selected`, and `compare-selected` behavior remains compatible.
- [x] Machine commands emit one JSON document with schema version 2 selection data.

**Verification:**

- [x] `node --test test/unit/git.test.js test/integration/cli-graph.test.js test/integration/git-repositories.test.js` passes.
- [x] Fixture snapshots prove all selection operations leave refs/index/worktree unchanged.

**Dependencies:** T17

**Files likely touched:**

- `src/git.js`
- `src/cli.js`
- `test/unit/git.test.js`
- `test/integration/cli-graph.test.js`
- `test/integration/git-repositories.test.js`

**Estimated scope:** Medium (5 files)

## T19: Add two-anchor and ref selection to the TUI

**Description:** Let the user mark a range base, choose its endpoint, or resolve a
visible ref while keeping navigation, cleanup, and plain fallback deterministic.

**Acceptance criteria:**

- [x] The active selection mode and both range endpoints are visible before save.
- [x] Saving a range/ref writes exactly the v2 contract produced by the CLI.
- [x] Quit, resize, invalid ref, and empty-history paths restore terminal state.

**Verification:**

- [x] `node --test test/unit/tui.test.js test/unit/graph.test.js test/integration/cli-graph.test.js` passes.
- [x] Manual Windows TTY check covers commit and range selection.

**Dependencies:** T18

**Files likely touched:**

- `src/tui.js`
- `src/graph.js`
- `test/unit/tui.test.js`
- `test/unit/graph.test.js`
- `test/integration/cli-graph.test.js`

**Estimated scope:** Medium (5 files)

## T20: Add a budgeted MCP context bundle

**Description:** Add `git_context_bundle` so an AI can retrieve selection,
repository status, graph neighborhood, comparison, changed files, and warnings
through one bounded call.

**Acceptance criteria:**

- [ ] Results expose count/byte limits, provenance, generation time, and `truncated`.
- [ ] Commit, range, stale, dirty, and divergent selections return distinct content.
- [ ] Default results contain metadata/statistics only; patch content is explicit and bounded.

**Verification:**

- [ ] Unit tests cover budget calculations and deterministic truncation.
- [ ] Official SDK integration verifies the new tool and unchanged existing seven tools.

**Dependencies:** T19

**Files likely touched:**

- `src/context.js`
- `src/git.js`
- `src/mcp.js`
- `test/unit/context.test.js`
- `test/integration/mcp-stdio.test.js`

**Estimated scope:** Medium (5 files)

## Checkpoint F: v0.3 context bundle

- [ ] T17–T20 acceptance criteria pass.
- [ ] TUI, CLI, and MCP return the same immutable selection oids.
- [ ] v1 migration, worktrees, bundle budgets, and no-mutation snapshots pass.
- [ ] Human approves the v0.3 public contract before Phase 8.

## T21: Add selection and status MCP resources

**Description:** Expose the default repository's selection and status as MCP
resources while keeping tools as the compatibility path.

**Acceptance criteria:**

- [ ] Resource and tool payloads use the same schema and error rules.
- [ ] Unsupported subscriptions are not advertised.
- [ ] Clients without resource support retain the full tool workflow.

**Verification:**

- [ ] Official SDK lists and reads both resources over stdio.
- [ ] Existing tool integration tests remain unchanged and pass.

**Dependencies:** Checkpoint F

**Files likely touched:**

- `src/mcp.js`
- `src/state.js`
- `test/unit/mcp.test.js`
- `test/integration/mcp-stdio.test.js`
- `docs/CLAUDE_CODE.md`

**Estimated scope:** Medium (5 files)

## T22: Add bounded commit search and filters

**Description:** Add paged search by ref, author, message, and time without
overloading graph rendering or accepting shell fragments.

**Acceptance criteria:**

- [ ] Search has deterministic ordering, bounded page size, and an explicit cursor.
- [ ] All filters are passed as Git argument-array values and reject invalid refs.
- [ ] CLI/MCP results report whether more results exist.

**Verification:**

- [ ] Merge, unicode, no-result, invalid-filter, and multi-page fixtures pass.
- [ ] Search leaves refs, index, worktree, and selection unchanged.

**Dependencies:** T21

**Files likely touched:**

- `src/git.js`
- `src/cli.js`
- `src/mcp.js`
- `test/integration/git-repositories.test.js`
- `test/integration/mcp-stdio.test.js`

**Estimated scope:** Medium (5 files)

## T23: Add structured commit diff and file history

**Description:** Provide read-only, path-limited commit diff metadata and file
evolution so agents can answer code-history questions without arbitrary Git commands.

**Acceptance criteria:**

- [ ] Rename, binary, merge, initial-commit, deleted-file, and invalid-path cases are explicit.
- [ ] Patch bodies are opt-in, byte-limited, and marked when truncated.
- [ ] No tool accepts a free-form Git command.

**Verification:**

- [ ] Focused Git-domain and official MCP integration tests pass.
- [ ] Source assertions and state snapshots prove no write command is reachable.

**Dependencies:** T22

**Files likely touched:**

- `src/git.js`
- `src/mcp.js`
- `test/unit/git.test.js`
- `test/integration/git-repositories.test.js`
- `test/integration/mcp-stdio.test.js`

**Estimated scope:** Medium (5 files)

## T24: Establish and enforce large-repository budgets

**Description:** Measure first graph, search, diff, memory, timeout, and output size
on repeatable large fixtures, then optimize only failed paths.

**Acceptance criteria:**

- [ ] Benchmarks define reproducible budgets without using the development repo.
- [ ] Slow Git processes time out or cancel with stable errors and no orphan process.
- [ ] Caching/async changes are added only when a recorded budget is missed.

**Verification:**

- [ ] Benchmark smoke and timeout/cancellation integration tests pass on Windows/Linux.
- [ ] `npm run check` remains deterministic and does not include long benchmarks.

**Dependencies:** T23

**Files likely touched:**

- `scripts/benchmark-large-repo.js`
- `src/git.js`
- `test/integration/git-repositories.test.js`
- `package.json`
- `docs/TEST_PLAN.md`

**Estimated scope:** Medium (5 files)

## Checkpoint G: v0.4 read-only exploration

- [ ] T21–T24 acceptance criteria pass.
- [ ] Search/diff/file history are deterministic and bounded.
- [ ] Resources and tools remain schema-compatible.
- [ ] No database, daemon, HTTP listener, or new write action exists.

## T25: Bind action plans to repository state

**Description:** Add a plan receipt containing expected HEAD/index/status
fingerprints so a later approved action fails closed if the repo changed.

**Acceptance criteria:**

- [ ] Every plan has an id, creation time, expiry, repo root, and state fingerprint.
- [ ] Revalidation distinguishes expired, stale, dirty-changed, and ref-moved plans.
- [ ] This task adds no destructive executor.

**Verification:**

- [ ] Unit and integration tests mutate each fingerprint component and observe rejection.
- [ ] Existing branch creation remains idempotent and reset remains plan-only.

**Dependencies:** Checkpoint G

**Files likely touched:**

- `src/actions.js`
- `src/state.js`
- `src/mcp.js`
- `test/unit/actions.test.js`
- `test/integration/safe-actions.test.js`

**Estimated scope:** Medium (5 files)

## T26: Add a local doctor command

**Description:** Diagnose Node, Git, repository resolution, package version, MCP
configuration, and stdio handshake without exposing secrets or changing state.

**Acceptance criteria:**

- [ ] `doctor` emits concise human output and optional structured JSON.
- [ ] Checks distinguish missing runtime, invalid repo, stale config, and MCP failure.
- [ ] Diagnostics redact paths/config values according to the existing policy.

**Verification:**

- [ ] CLI fixtures cover healthy and failing environments.
- [ ] Packaged install runs `doctor` successfully on Windows and Ubuntu.

**Dependencies:** T25

**Files likely touched:**

- `src/cli.js`
- `src/diagnostics.js`
- `test/integration/cli-graph.test.js`
- `scripts/package-install.test.js`
- `README.md`

**Estimated scope:** Medium (5 files)

## T27: Complete conditional public-release readiness

**Description:** Prepare a demo, capability matrix, security policy, contribution
guide, and release checklist without changing repository visibility or publishing.

**Acceptance criteria:**

- [ ] Public claims map to tests or captured manual evidence.
- [ ] Security reporting and contribution boundaries are documented.
- [ ] Visibility, version, tag, release, and npm publish remain separate approvals.

**Verification:**

- [ ] Public-path and package allowlist scans pass.
- [ ] README install commands pass from a clean packed artifact.

**Dependencies:** T26

**Files likely touched:**

- `README.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `docs/COMPETITIVE_ANALYSIS_AND_ROADMAP.md`
- `docs/RELEASE_CANDIDATE.md`

**Estimated scope:** Medium (5 files)

## Checkpoint H: v0.5 productization

- [ ] T25–T27 acceptance criteria pass.
- [ ] Stale action plans fail closed and no destructive executor exists.
- [ ] Clean-install onboarding completes graph → select → MCP read.
- [ ] Human separately decides public visibility, version, tag, release, and npm publication.
