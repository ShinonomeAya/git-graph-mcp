# Spec: safe-actions

Status: draft for review

## Objective

Provide exactly two action capabilities around the selected commit: idempotently create a new local branch, and generate an accurate reset preview. The module makes safe behavior easy to verify and makes destructive execution impossible within v0.2.

## Responsibilities

- Load and revalidate the selected commit immediately before an action.
- Validate a requested new branch name with Git.
- Create a new local branch without checkout or force movement.
- Treat retrying the same branch-at-same-commit intent as success.
- Recompute history relationship and working-tree state for reset previews.
- Explain soft, mixed, and hard impacts without executing reset.

## Non-goals

- Checkout, switch, branch deletion, branch rename, or branch force-move.
- Any reset execution.
- Commit, merge, rebase, push, force push, or remote ref changes.
- A generic Git command executor.

## Tech stack and commands

- `src/actions.js` for policy and result construction.
- Approved Git primitives supplied by `git-domain`.
- Saved state supplied by `selection-state`.

Focused verification:

```powershell
node --test test/unit/actions.test.js test/integration/safe-actions.test.js
node --check .\src\actions.js
```

## Project structure

- `src/actions.js`: validation, idempotency, reset-plan semantics.
- `src/git.js`: provider-owned ref lookup and branch creation primitives.
- `src/mcp.js`: thin tool exposure.
- `test/unit/actions.test.js`: pure decision tests.
- `test/integration/safe-actions.test.js`: real disposable-repository checks.

## Public module contract

### `createBranchAtSelected(root, name)`

Successful output:

```js
{
  schemaVersion: 1,
  repoRoot,
  branch: name,
  targetOid,
  created,       // true only when a ref was created in this call
  alreadyExists, // true only when the same branch already targeted targetOid
}
```

Rules:

1. Require a current selection and resolve its oid again.
2. Reject names that are empty, begin with `-`, or fail `git check-ref-format --branch`.
3. If `refs/heads/<name>` does not exist, create it at the selected oid.
4. If it exists at the same oid, return idempotent success.
5. If it exists elsewhere, fail with `BRANCH_ALREADY_EXISTS` and include no mutation.
6. Do not checkout the new branch.

### `buildResetPlan(root, mode)`

Successful output:

```js
{
  schemaVersion: 1,
  repoRoot,
  mode, // soft | mixed | hard
  selectedOid,
  headOid,
  relation,
  proposedCommand,
  commitImpact,
  indexImpact,
  worktreeImpact,
  isWorkingTreeDirty,
  warnings,
  backupBranchSuggestion,
  requiresExplicitExternalExecution: true,
}
```

Mode semantics:

| Mode | HEAD/ref | Index | Worktree |
|---|---|---|---|
| `soft` | would move to selection | unchanged | unchanged |
| `mixed` | would move to selection | would reset to selection | unchanged |
| `hard` | would move to selection | would reset to selection | tracked files would reset; local tracked changes may be lost |

Plans for `DESCENDANT` or `DIVERGED` relationships contain an elevated warning because the selected commit is not a simple ancestor rollback target. Dirty trees always produce a warning; hard mode uses the strongest warning. The suggested backup branch name is informational and is never created automatically.

## Error contract

Expected action codes are:

- `NO_SELECTION`
- `STALE_SELECTION`
- `INVALID_BRANCH_NAME`
- `BRANCH_ALREADY_EXISTS`
- `INVALID_RESET_MODE`
- `NO_HEAD`
- normalized `git-domain` errors

Action functions throw normalized errors internally; CLI/MCP boundaries convert them to their public error format.

## Code style

Represent modes as immutable data, not conditionals scattered across handlers:

```js
const RESET_IMPACTS = {
  soft: { indexImpact: "UNCHANGED", worktreeImpact: "UNCHANGED" },
  mixed: { indexImpact: "RESET_TO_SELECTED", worktreeImpact: "UNCHANGED" },
  hard: { indexImpact: "RESET_TO_SELECTED", worktreeImpact: "RESET_TRACKED_FILES" },
};
```

No function accepts an arbitrary Git subcommand or arguments from a caller.

## Testing strategy

Unit tests cover all branch-name and existing-ref decisions, every reset mode, every history relationship, dirty-state warnings, and stale selection. Integration tests snapshot refs, HEAD, index tree, and worktree status before and after each action:

- branch creation changes exactly one new `refs/heads/*` ref;
- retry at the same oid changes nothing and succeeds;
- an existing branch at another oid changes nothing and fails;
- all reset-plan modes change nothing;
- invalid inputs change nothing.

The integration suite scans or stubs Git invocation in the reset-plan path to ensure no `reset` subcommand is called.

## Boundaries

- Always: revalidate at action time; validate with Git; make branch retry idempotent; prove mutations with before/after assertions.
- Ask first: add another action; auto-create a backup branch; add CLI execution of actions.
- Never: force-update a ref; checkout; execute reset; accept arbitrary commands; hide dirty/diverged warnings.

## Success criteria

- Branch creation is safe to retry and never moves an existing different ref.
- Branch creation never changes HEAD, index, or worktree.
- Reset previews correctly describe three modes and four relationship states.
- No reset-plan code path invokes `git reset`.
- Invalid, stale, dirty, and divergent cases return the documented warning/error behavior.

## Open questions

None for v0.2.
