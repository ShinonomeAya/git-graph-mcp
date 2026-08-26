# Spec: git-domain

Status: draft for review

## Objective

Provide the single authoritative layer for resolving a Git repository, reading history and status, inspecting commits, comparing a selected commit with HEAD, and invoking narrowly approved Git commands. Every CLI, TUI, MCP, selection, and action feature depends on this module rather than spawning Git directly.

## Responsibilities

- Resolve an input path to the canonical repository root.
- Detect empty repositories and detached HEAD without treating them as generic failures.
- Validate revision expressions and resolve them to full commit object ids.
- Read topo-ordered, decorated history and retain Git's graph prefix.
- Return normalized status, commit metadata, changed files, and relationship data.
- Resolve Git-owned paths such as the selection file location.
- Translate Git process failures into stable domain errors.

## Non-goals

- Rendering terminal output.
- Persisting selection JSON.
- Handling MCP messages.
- Executing reset, checkout, rebase, merge, push, branch deletion, or force operations.

## Tech stack and commands

- Node.js 22+ CommonJS.
- `child_process.execFileSync` initially; asynchronous conversion is allowed only if profiling demonstrates a real need.
- System Git 2.x.

Focused verification:

```powershell
node --test test/unit/git.test.js test/integration/git-repositories.test.js
node --check .\src\git.js
```

## Project structure

- `src/git.js`: implementation and exported domain functions.
- `test/unit/git.test.js`: parsing, validation, and error normalization.
- `test/integration/git-repositories.test.js`: real temporary-repository scenarios.
- `test/helpers/git-repo.js`: deterministic fixture creation shared by integration tests.

## Public module contract

| Function | Input | Output | Expected errors |
|---|---|---|---|
| `resolveRepo(repo)` | path string | canonical absolute root | `INVALID_REPO_PATH`, `NOT_GIT_REPOSITORY` |
| `resolveGitPath(root, name)` | resolved root, safe relative Git path name | absolute Git-managed path | `INVALID_GIT_PATH`, `GIT_COMMAND_FAILED` |
| `resolveCommit(root, revision)` | resolved root, non-empty revision | full commit oid | `INVALID_REVISION` |
| `normalizeLimit(value, fallback)` | number/string/undefined | integer 1–500 | `INVALID_LIMIT` |
| `getGitContext(repo, limit)` | path and normalized limit | root, HEAD, branch, commits | normalized repository/Git errors |
| `getGitStatus(root)` | resolved root | structured branch/index/worktree status plus compact lines | `GIT_COMMAND_FAILED` |
| `readCommit(root, revision)` | resolved root and revision | normalized commit inspection | `INVALID_REVISION` |
| `compareWithHead(root, revision)` | resolved root and selected revision | relationship result | `INVALID_REVISION`, `NO_HEAD` |
| `createBranch(root, name, oid)` | resolved root, validated new name, full commit oid | created/existing branch result | action errors defined by `safe-actions` |

`createBranch` is the only write primitive approved for v0.2. It exists in this provider module so `safe-actions` does not spawn Git itself.

## Core data contracts

History commits retain the current additive fields: `hash`, `shortHash`, `parents`, `refs`, `author`, `timestamp`, `date`, `subject`, `graphPrefix`, and `graphAfter`.

Comparison returns:

```js
{
  schemaVersion: 1,
  repoRoot,
  selectedOid,
  headOid,
  relation, // SAME | ANCESTOR | DESCENDANT | DIVERGED
  mergeBaseOid,
  headAheadCount,
  headBehindCount,
  isWorkingTreeDirty,
  commitsUniqueToHead,
  commitsUniqueToSelection,
  changedFiles,
  diffStat,
  warnings,
}
```

Counts are computed from both sides of the revision range, not inferred from a one-way log. Merge commits must not duplicate changed-file entries merely because the commit has multiple parents.

## Code style

Use small functions that build explicit argument arrays:

```js
function resolveCommit(root, revision) {
  if (!revision || revision.startsWith("-")) {
    throw createGitError("INVALID_REVISION", "A Git revision is required.");
  }
  return git(root, ["rev-parse", "--verify", `${revision}^{commit}`]).trim();
}
```

Never concatenate user input into a shell command. Error messages returned to public callers are stable and concise; raw stderr may be retained only as opt-in debug detail.

## Testing strategy

Unit tests cover limit validation, ref parsing, commit-record parsing, graph-prefix handling, and error-code mapping. Integration tests create temporary repositories for:

- no commits;
- linear history;
- a merge commit;
- divergent branches;
- detached HEAD;
- staged, unstaged, and untracked changes;
- a linked worktree;
- invalid paths and revisions.

Tests assert both object ids and relationship labels. Temporary repositories are never nested under the development repository.

## Boundaries

- Always: resolve roots/revisions before use; pass argument arrays; cap history at 500; return serializable values.
- Ask first: add Git version-specific behavior; make Git invocation asynchronous; add another write primitive.
- Never: execute unapproved mutations; invoke a shell; hide divergent history behind a one-way comparison.

## Success criteria

- Every function in the public module contract has focused tests.
- Empty, detached, dirty, merged, divergent, and linked-worktree repositories return the documented result or error.
- Relationship counts agree with `git rev-list --left-right --count` in integration fixtures.
- No read function changes refs, index, worktree, or selection state.
- Only the tested `createBranch` primitive can change a ref, and it cannot force-move an existing branch.

## Open questions

None for v0.2.
