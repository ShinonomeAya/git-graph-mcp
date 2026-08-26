# Spec: selection-state

Status: draft for review

## Objective

Store the user's selected commit as versioned JSON owned by the target Git repository, with atomic writes, linked-worktree support, legacy migration, and clear stale-selection behavior.

## Responsibilities

- Ask `git-domain` for the Git-managed selection path.
- Read no-selection, legacy-selection, current-selection, malformed, and stale cases predictably.
- Normalize legacy data in memory without rewriting it on read.
- Write schema version 1 atomically.
- Preserve one independent selection per linked worktree.

## Non-goals

- Storing branch/lane selections.
- Synchronizing selections over sockets or a network.
- Keeping a selection history.
- Automatically choosing another commit when the saved commit disappears.

## Tech stack and commands

- Node.js `fs` and `path` modules.
- `git-domain.resolveGitPath` and `git-domain.resolveCommit`.

Focused verification:

```powershell
node --test test/unit/state.test.js test/integration/worktree-selection.test.js
node --check .\src\state.js
```

## Project structure

- `src/state.js`: state schema normalization, reads, and atomic writes.
- `test/unit/state.test.js`: schema and malformed-file behavior.
- `test/integration/worktree-selection.test.js`: real main-worktree and linked-worktree isolation.

## Public module contract

| Function | Behavior |
|---|---|
| `readSelection(root)` | Return `null` when absent; otherwise return normalized schema version 1 data or a stable state error |
| `writeSelection(root, selection)` | Validate normalized input and atomically replace the repository-owned file |
| `selectionPath(root)` | Return the absolute path supplied by `git-domain.resolveGitPath` |

New writes use:

```js
{
  schemaVersion: 1,
  repoRoot,
  selected: {
    kind: "commit",
    oid,
  },
  resolvedAt,
  commit: {
    shortHash,
    subject,
    refs,
  },
}
```

The reader accepts the existing object with `selectedCommit` and maps it to `selected.oid`. Unknown future schema versions fail with `UNSUPPORTED_SELECTION_VERSION`; malformed JSON fails with `INVALID_SELECTION_FILE`; a missing saved commit fails validation with `STALE_SELECTION` when a caller requests an action or comparison.

## Atomic-write behavior

1. Resolve the final Git-managed path.
2. Create its parent directory if Git has not already done so.
3. Write JSON plus a trailing newline to a uniquely named temporary file in the same directory.
4. Rename the temporary file over the final path.
5. Remove only this operation's temporary file if an error occurs.

No write may truncate the existing valid file before the replacement is complete.

## Code style

Keep schema normalization explicit:

```js
function normalizeSelection(value) {
  if (value && value.schemaVersion === 1) return validateV1(value);
  if (value && value.selectedCommit) return fromLegacySelection(value);
  throw createStateError("INVALID_SELECTION_FILE", "Selection data is not valid.");
}
```

## Testing strategy

Unit tests cover absent files, valid v1, current legacy input, malformed JSON, unsupported versions, invalid object ids, and simulated replacement failure. Integration tests prove that two linked worktrees do not overwrite each other's selection and that a deleted/re-written commit is reported as stale before an action.

## Boundaries

- Always: validate external JSON; write atomically; use the Git-resolved path; preserve legacy readability in v0.2.
- Ask first: change the schema version; share selection across worktrees; add selection history.
- Never: place state in the npm package or tracked project files; silently substitute HEAD for a stale selection; rewrite a legacy file merely because it was read.

## Success criteria

- Normal repositories and linked worktrees persist and retrieve independent selections.
- A process interruption cannot leave a partially written final JSON document.
- The current legacy selection shape remains readable.
- Malformed, unsupported, and stale selections produce distinct stable error codes.
- Read-only calls never alter the selection file.

## Open questions

None for v0.2.
