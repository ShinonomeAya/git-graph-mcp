# Implementation Plan: git-graph-mcp v0.2

Status: v0.2.2 stable release published; local and GitHub gates complete; npm
publication intentionally remains disabled

## Overview

Deliver a reliable terminal-first Git graph and local MCP server by first restoring a testable, standards-compliant baseline, then hardening Git/state behavior, completing the terminal experience, adding two narrowly safe action slices, and finally making the package portable and continuously verified.

The task list target is [tasks/todo.md](todo.md). Stable module ownership comes from [CAPABILITY_MAP.md](../CAPABILITY_MAP.md); system-wide decisions come from [docs/TECHNICAL_SOLUTION.md](../docs/TECHNICAL_SOLUTION.md).

## Starting-state constraints

The working tree already contains user-owned changes in `.mcp.json`, `docs/CLAUDE_CODE.md`, `package.json`, `src/mcp.js`, `docs/MCP_DEBUG_LOG.md`, `package-lock.json`, and `start-mcp.bat`.

Before every task that overlaps these files, the implementing model must:

1. inspect the current diff;
2. preserve evidence or useful work that still matches the specifications;
3. replace only the incompatible implementation or conclusion;
4. avoid broad restore, checkout, reset, formatting, staging, commit, or push operations.

## Architecture decisions

- Keep CommonJS JavaScript in v0.2 to minimize migration scope.
- Support maintained Node 22 and 24; do not advertise Node 20 or earlier.
- Use Node's built-in test runner to avoid another test dependency.
- Use the official MCP SDK stdio transport; remove the custom framing layer.
- Keep `git-domain` as the only Git process boundary.
- Store one versioned selection per worktree through a Git-resolved path.
- Preserve existing CLI commands and MCP tool names; add fields rather than removing useful fields.
- Permit only idempotent new-branch creation. Reset remains a pure plan.
- Use an npm `files` allowlist; publishing remains manual and out of scope.

## Dependency graph

```text
T01 test/runtime baseline
  |
  +--> T02 official MCP stdio --> T03 MCP contracts
  |
  +--> T04 Git inputs/status --> T05 relationship comparison --> T06 selection/worktree
                                                        |              |
                                                        +------+-------+
                                                               |
                                                       T07 TUI rendering
                                                               |
                                                       T08 CLI integration
                                                               |
                                              T09 branch action --> T10 reset plan
                                                               |
                                             T11 packaging --> T12 docs/diagnostics
                                                               |
                                                        T13 CI and RC audit
```

Tasks sharing `src/git.js`, `src/mcp.js`, or `package.json` are sequential even if their domain concerns differ.

## Phases and task index

### Phase 1: Restore trust

- T01 — Establish the maintained runtime and deterministic test harness.
- T02 — Replace custom framing with official MCP stdio and prove the handshake.
- T03 — Stabilize MCP tool schemas, results, and expected errors.

### Checkpoint A: protocol baseline

- Syntax and baseline tests pass.
- Official SDK client initializes and lists the five existing tools.
- MCP stdout contains no custom headers or diagnostic text.
- Human reviews the removal/replacement of the experimental transport before continuing.

### Phase 2: Correct domain and state behavior

- T04 — Validate repository/CLI inputs and normalize status/history behavior.
- T05 — Implement symmetric selected-versus-HEAD relationship analysis.
- T06 — Add versioned, atomic, linked-worktree selection state.

### Checkpoint B: read-only core

- Empty, detached, dirty, merged, divergent, and linked-worktree fixtures pass.
- All existing CLI commands retain documented behavior.
- Read-only operations leave refs, index, worktree, and selection unchanged.

### Phase 3: Complete the terminal workflow

- T07 — Harden graph rendering, viewport behavior, cleanup, and details.
- T08 — Verify public CLI output and failure behavior end to end.

### Checkpoint C: terminal acceptance

- Automated TUI/render tests pass.
- Manual Windows Terminal checks pass at 80×24 and a narrow viewport.
- Selecting a commit and reading it through CLI/MCP returns the same oid.

### Phase 4: Add safe vertical actions

- T09 — Deliver idempotent branch creation from selection through MCP.
- T10 — Deliver soft/mixed/hard reset previews through MCP.

### Checkpoint D: action safety

- Branch tests prove exactly one allowed ref change.
- Retry and conflict cases are deterministic.
- Reset-plan tests prove no Git state changes and no `git reset` invocation.
- Human reviews action wording and safety warnings.

### Phase 5: Package and release candidate

- T11 — Make runtime metadata, configuration, license, and npm contents portable.
- T12 — Align user documentation and opt-in diagnostics with verified behavior.
- T13 — Add the Windows/Linux CI matrix and complete the release-candidate audit.

### Checkpoint E: v0.2 ready for review

- `npm run check` passes locally and on all CI matrix entries.
- The packed artifact installs and completes an official MCP handshake.
- No package file contains developer-specific paths.
- No unapproved Git operation exists in source.
- Human decides separately whether to bump/version, commit, tag, push, or publish.

## Migration strategy

### MCP transport

Treat the current custom transport as an experiment. First add a failing official-client handshake test, then replace it with `StdioServerTransport`, then update the debug conclusion. Do not preserve two transport implementations.

### Selection state

Read both the current legacy object and schema version 1. Normalize to v1 in memory. Only future successful writes produce v1; no bulk migration command is required.

### Public results

Preserve existing tool names and useful fields. Add `schemaVersion` and `structuredContent`. Establish the stable error envelope before adding the two new tools.

### Runtime

Move the advertised minimum directly to Node 22 because Node 16, 18, and 20 are end-of-life. The current Node 20 workstation may verify the pre-migration baseline but is not evidence for release support.

## Verification strategy

- Focused unit/integration commands run after each task.
- `npm run check` runs at every checkpoint after T01 defines it.
- Safety tasks record Git refs, HEAD, index tree, and status before and after.
- MCP is tested through the actual bin process and official client, not an in-process handler alone.
- Packaging is tested from dry-run JSON and a clean temporary install.
- Manual testing is limited to terminal interaction and real Claude Code connection behavior that cannot be meaningfully proven by unit tests.

## Parallelization

For a single smaller model, execute strictly in task order. If separate agents are explicitly requested later:

- T04/T05 domain work and T07 pure rendering tests can proceed in parallel only after T01, provided they do not edit the same files.
- Documentation research can run alongside already-defined implementation, but updates wait until behavior is verified.
- T02/T03, T05/T06, T09/T10, and T11/T12 must remain sequential because they share contracts or files.

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Existing experimental changes are overwritten | High | Inspect each overlapping diff and patch surgically; never restore whole files |
| MCP SDK/protocol version drift | High | Pin dependency with lockfile; use official client contract tests; avoid custom framing |
| A read-only path mutates Git state | High | Before/after integration assertions for refs, index, worktree, and selection |
| Branch creation moves an existing ref | High | Git validation, preflight oid lookup, no force flag, idempotency tests |
| Reset preview accidentally executes | High | Pure planner, no generic command executor, invocation-spy and state snapshot tests |
| Linked worktree state collides | Medium | Resolve state path through Git and test two worktrees independently |
| Package leaks absolute paths/debug files | Medium | npm `files` allowlist plus dry-run artifact assertions |
| Node 20-only development hides compatibility issues | Medium | CI and manual verification on maintained Node 22/24 |
| Graph output regresses on merges/narrow terminals | Medium | deterministic fixtures, snapshots, and two manual viewport checks |

## Definition of Done

Each task is done only when its acceptance criteria and focused verification pass, changed files remain within the declared scope, no unrelated diff is introduced, and the task checkbox is updated. The initiative is done only after all five checkpoints pass and the human approves the release candidate.

## Open questions

None block implementation. Publication ownership, registry metadata, and post-v0.2 features remain explicitly deferred.

## Phase 6: Release-candidate handoff (current)

The implementation is feature-complete for v0.2, but the release gate remains
open until maintained-runtime CI evidence and explicit release approval exist.
This phase prepares the candidate without changing Git history or publishing.

### T14 — Execute the local release preflight

**Acceptance criteria:**

- [ ] Full repository checks, clean package installation, official-registry
  production audit, package allowlist, and machine-path scan pass together.
- [ ] Candidate changelog and rollback notes describe only verified behavior.
- [ ] Working-tree changes remain uncommitted and no release artifact is pushed.

**Verification:**

- `npm ci`, `npm run check`, `npm run test:package-install`;
- `npm audit --registry=https://registry.npmjs.org --omit=dev --audit-level=high`;
- `npm pack --dry-run --json`, `git diff --check`, and the public-path scan.

### T15 — Obtain maintained-runtime CI evidence

**Acceptance criteria:**

- [ ] Windows Node 22, Windows Node 24, Ubuntu Node 22, and Ubuntu Node 24
  all complete `npm ci`, the production audit, and `npm run check`.
- [ ] CI results are attached to the candidate review; failures block release.

**Dependency:** T14 and an exact user-approved Git remote.

### T16 — Human release gate

**Acceptance criteria:**

- [ ] User approves the candidate version (`0.2.0`) and release notes.
- [ ] User separately approves commit, tag, push, and npm publication actions.
- [ ] A reversible release/rollback window and first-hour verification owner are
  identified before any external mutation.

**Dependency:** T15.

## Phase 6 checkpoint: v0.2 release-ready, not yet released

- [ ] T14–T16 acceptance criteria pass.
- [ ] No unreviewed high-severity dependency findings remain.
- [ ] No publish, tag, push, or release occurs without explicit approval.

## Post-v0.2 product direction

Competitive research and the recommended architecture are recorded in
`docs/COMPETITIVE_ANALYSIS_AND_ROADMAP.md`. The project will not pursue a
full Git client. Its differentiator is a human-selected, AI-readable, local
Git context with narrow and explicit safety boundaries.

### Phase 7: v0.3 human-approved context bundle

- [x] T17 — Add selection schema v2 with v1-compatible reads.
- [x] T18 — Add commit/range/ref selection to the Git domain and CLI.
- [x] T19 — Add two-anchor range and ref selection to the TUI.
- [x] T20 — Add a budgeted `git_context_bundle` MCP tool.

### Checkpoint F: context bundle

- TUI, CLI, and MCP resolve the same immutable oids.
- Legacy v1 selection files remain readable.
- All read paths preserve refs, index, worktree, and selection.
- Bundle count/byte limits and `truncated` markers pass contract tests.
- User-directed continuation approves the v0.3 contract before Phase 8.

### Phase 8: v0.4 read-only history exploration

- [x] T21 — Add default-repository selection/status MCP resources with tool parity.
- [x] T22 — Add paged commit search and ref/author/message filters.
- [x] T23 — Add structured commit diff and file history.
- [x] T24 — Add large-repository budgets and only optimize paths that miss them.

### Checkpoint G: read-only exploration

- Search, diff, and file history remain bounded and deterministic.
- Resource and tool results share the same schema.
- No database, daemon, network listener, or new write action is introduced.

### Phase 9: v0.5 safe productization

- [x] T25 — Bind action-plan receipts to repository state fingerprints.
- [x] T26 — Add a local `doctor` command for runtime, Git, repo, and MCP setup.
- [x] T27 — Complete conditional public-release and contributor readiness.

### Checkpoint H: productization

- Stale plans fail closed without mutation.
- A clean install completes graph → select → MCP read within the onboarding flow.
- Repository visibility, version, tag, and npm publication remain separate human decisions.

## Post-v0.2 architecture decisions

- Stay on Node.js/CommonJS through v0.3; no language or module migration.
- Keep the system Git CLI as the only Git engine.
- Treat terminal lanes as UI state; persist only commit oids and full refs.
- Keep stdio and local-first defaults; no Streamable HTTP in these phases.
- Prefer richer read-only context over a larger write-tool surface.
- Add performance complexity only after a repeatable benchmark misses its budget.

## Post-v0.2 dependency order

```text
T16 human release gate
        |
       T17 --> T18 --> T19 --> T20
                                 |
                                Checkpoint F
                                 |
               T21 --> T22 --> T23 --> T24
                                         |
                                        Checkpoint G
                                         |
                               T25 --> T26 --> T27
```

## Post-v0.2 open questions

- Phase 7 recommendation is range selection first; ref selection may be reduced
  to resolving a ref into an immutable oid if moving-ref semantics are not wanted.
- MCP resource subscriptions are deferred until tool/resource parity is proven.
- Public repository visibility is optional and must not be inferred from npm or
  release readiness.

## Phase 11: public page and README remediation

The public repository is usable, but the current `master` branch contains
documentation and package-allowlist changes after the immutable `v0.2.1`
release. This phase prepares a coherent `v0.2.2` patch candidate without
moving `v0.2.1` or publishing to npm.

### T34 — Reconcile the next patch baseline [DONE]

- Bump the candidate package and lockfile to `0.2.2`.
- Record the release intent in `CHANGELOG.md` and `docs/RELEASE_CANDIDATE.md`.
- Keep `v0.2.1` immutable and state that the candidate Release is not created
  until local and CI gates pass.

### T35 — Make the README executable for new users [DONE]

- Add stable-release, CI, license, and language navigation near the title.
- Separate source-checkout installation from GitHub tarball installation.
- Explain that npm registry publication is not enabled and show the exact
  `npm install`/`npx --no-install` path for a downloaded Release asset.
- Add supported runtime/OS boundaries, TUI key controls, MCP client setup, the
  12-tool catalog, the two resources, and troubleshooting links in both
  Chinese and English.

### T36 — Align linked public technical docs [DONE]

- Update the MCP specification's tool count and contract table from the stale
  seven-tool draft to the implemented 12-tool surface.
- Link the client setup and MCP specification from both READMEs.
- Keep historical v0.2.0/v0.2.1 evidence labeled as historical rather than
  silently rewriting it.

### T37 — Complete community intake files [LOCAL DONE]

- Add a concise Code of Conduct and bug/feature issue templates.
- Add a GitHub issue-template config with security-report guidance.
- Record repository topics as a separate GitHub metadata action; do not encode
  them as fake files in the package.

### T38 — Verify the candidate before external release [DONE]

- Run syntax, unit/integration, smoke, package, and clean-install checks.
- Verify the packed allowlist contains the bilingual README and no private
  configuration.
- Compute the candidate tarball SHA-256 and record it in the release checklist;
  then push `master`, create the immutable `v0.2.2` tag, upload the tarball,
  and verify the downloaded asset.

### Checkpoint M: public onboarding [PASS]

- A new user can choose source checkout or fixed Release asset without guessing.
- A Claude Code/Codex/Cursor user can copy the correct stdio configuration.
- README, package metadata, MCP spec, changelog, and release checklist agree on
  the released version and tool count.

## Phase 12: v0.2.2 launch closure [DONE]

- Release commit `0794bcec7b57e1d1e0372ecc2e015bdd4eaf25b8` was pushed to `master`.
- Immutable annotated tag `v0.2.2` and the GitHub Release were created at that
  commit; the fixed tarball was uploaded and its downloaded SHA-256/SHA-512
  matched the local build.
- GitHub Actions runs `33057318621` (`master`) and `33057337752` (`v0.2.2`)
  passed on Windows/Ubuntu × Node 22/24, including clean package install and
  official registry audit.
- npm publication and repository topics remain separate maintainer decisions.

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The stable tag omits newer documentation | High | Keep `v0.2.1` immutable; ship the aligned allowlist and README in `v0.2.2` |
| A tarball command works only from a source checkout | High | Test the URL/tarball install with a disposable prefix and `npx --no-install` |
| README tool claims drift from the MCP registry | Medium | Derive the public catalog from `src/mcp.js` and the package integration test |
| Community metadata is changed without a review trail | Low | Keep topics as a separate maintainer action after the candidate is approved |

## Phase 10: public-release readiness remediation

The `v0.2.0` GitHub Release remains immutable and `v0.2.1` is the public patch
release. T28–T33 technical remediation is complete on `master`: bounded Windows
cleanup, packed install/audit CI gates, reconciled public documents,
maintained-runtime graph → select → MCP read → doctor evidence, release artifact
review, visibility change, and anonymous post-launch checks all pass. The local
Node 20 environment remains migration-only. A real Claude Code `/mcp` screenshot
remains recommended manual evidence, and npm publication remains a separate,
unapproved channel.

### Definition of done for public release

- The exact release commit passes Windows/Ubuntu × Node 22/24, including clean
  package installation and the official MCP handshake.
- The Windows fixture cleanup is bounded and retry-safe; no test relies on a
  best-effort deletion that can make a green run flaky.
- README, changelog, release checklist, acceptance plan, capability map, and
  CI workflow describe the same version, test count, tool count, and release
  state.
- Node 22/24 user-path evidence covers graph → select → MCP read and `doctor`;
  paths/configuration values are not exposed in screenshots or logs.
- Existing `v0.2.0` tag is never moved. The post-tag fixes ship as the approved
  `v0.2.1` patch release after the final CI gate passes.
- Public visibility is changed only after the technical gate is green. npm
  publication remains a separate decision and is not implied by GitHub release.

### Ordered remediation tasks

1. **T28 — Make Windows test cleanup deterministic [DONE].** Add a bounded retry/backoff
   cleanup helper for temporary Git repositories, preserve the original error
   after retries, and prove the search test can run repeatedly on Windows.
2. **T29 — Strengthen CI release gates [DONE].** Run clean packed installation and the
   official-registry high-severity audit in CI; keep the four runtime cells
   explicit and fail the workflow on either packaging or audit failure.
3. **T30 — Reconcile public documentation [DONE].** Update stale 44-test/0.1.0/
   “not released” claims, document the current release and known Node baseline,
   and add the public support/reporting path without exposing private paths.
4. **T31 — Re-run maintained-runtime acceptance [AUTOMATED DONE].** Capture
   Windows Node 22/24 and Ubuntu Node 22/24 results plus the clean-install
   graph/select/MCP/doctor path; a real client-side graph/status call remains a
   manual evidence recommendation, and the local Node 20 warning stays separate.
5. **T32 — Prepare the public-release gate [DONE].** Build a clean release artifact,
   verify repository/package allowlists and rollback instructions, and record
   `v0.2.0` immutability. Because fixes landed after that tag, `v0.2.1` is the
   approved public target. Do not move `v0.2.0`.
6. **T33 — Execute the visibility decision [DONE].** After T28–T32 passed and
   the user confirmed, the repository was changed to public; the public README,
   v0.2.1 release, security policy, issue/reporting path, and install flow were
   verified anonymously.

### Checkpoints

- **Checkpoint I — deterministic test base [PASS]:** T28 focused tests and local full
  check pass; no unrelated files are changed.
- **Checkpoint J — release CI gate [PASS]:** T29 and T31 are green in all four cells;
  package install, audit, MCP handshake, and user-path evidence are recorded.
- **Checkpoint K — public review [PASS]:** T30/T32 are complete, release/tag strategy
  is explicit, and no private path or secret appears in public artifacts.
- **Checkpoint L — public launch [PASS]:** T33 completed the final external
  mutation; the public repository and release passed anonymous checks. The
  repository maintainer owns first-release monitoring and rollback decisions.

### Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Windows Git/process handle keeps a fixture directory busy | High | Retry cleanup with bounded delays and retain diagnostics; never hide test failures |
| CI passes unit tests but misses packed-install regressions | High | Make `test:package-install` a required matrix step |
| Historical docs contradict public behavior | Medium | Scan version/count/release claims before publishing |
| Fix after an existing tag creates an unverifiable release | High | Keep `v0.2.0` immutable; use `v0.2.1` for fixes |
| Public repository exposes local paths or private setup | High | Run path/secret scans and review README/release assets before visibility change |

### Open decisions

- Whether and when npm publication is desired; GitHub source/release is the
  current distribution channel;
- Whether to publish later patch or minor versions;
- First-release monitoring and rollback decisions are owned by `ShinonomeAya`.
