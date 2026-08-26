# Spec: terminal-ui

Status: draft for review

## Objective

Provide a compact terminal Git graph that works in static output and interactive TTY modes, lets a human navigate real commits, shows enough context to choose safely, and persists the chosen commit through `selection-state`.

## Responsibilities

- Render repository root, current branch/detached state, HEAD, lanes, refs, hashes, and subjects.
- Render a deterministic static view for non-TTY output and `--plain`.
- Navigate commits with arrow keys and `j`/`k`.
- Save the current commit with `Enter` or `s`.
- Exit cleanly with `q` or `Ctrl+C`, restoring raw mode and cursor visibility.
- Show concise selected-commit metadata without displaying an unbounded patch.

## Non-goals

- Editing commits or refs.
- Independent branch/lane selection.
- Full diff browsing, mouse support, search, or a Web UI.
- Owning Git parsing or selection-file formats.

## Tech stack and commands

- Node.js `readline` and ANSI escape sequences already used by the repository.
- Pure rendering helpers from `src/graph.js`.
- Domain data from `git-domain`; persistence through `selection-state`.

Focused verification:

```powershell
node --test test/unit/graph.test.js test/unit/tui.test.js test/integration/cli-graph.test.js
node .\bin\git-graph-mcp.js graph --plain --limit 20
```

## Project structure

- `src/graph.js`: pure lane/row functions and symbols.
- `src/tui.js`: viewport selection, static rendering, and key handling.
- `src/cli.js`: chooses static versus interactive mode.
- `test/unit/graph.test.js`, `test/unit/tui.test.js`, `test/integration/cli-graph.test.js`: verification.

## Public behavior contract

Static output is deterministic for the same Git history and terminal-width-independent except for explicitly documented truncation. Interactive behavior preserves the current keys:

| Key | Result |
|---|---|
| `Up` or `k` | Select previous visible commit; clamp at first commit |
| `Down` or `j` | Select next visible commit; clamp at last commit |
| `Enter` or `s` | Inspect and atomically save selected commit |
| `q` or `Ctrl+C` | Restore terminal state and exit successfully |

Empty repositories render a clear `No commits yet` state and do not enter a broken selection loop. Non-TTY execution automatically uses static output. Very long subjects and refs are truncated to the current terminal width without changing underlying data.

The details area contains only selected hash, subject, refs, author, date, parent count, and the save/status message. It does not run `git show` on every navigation keystroke.

## Code style

Keep output generation pure and keep terminal side effects at the edge:

```js
function moveSelection(current, direction, rowCount) {
  if (rowCount === 0) return -1;
  return Math.max(0, Math.min(rowCount - 1, current + direction));
}
```

All cleanup paths call one idempotent cleanup function. ANSI styling must not appear when color is disabled.

## Testing strategy

- Unit-test graph rows for linear, branching, merge, and empty histories.
- Snapshot exact plain text for small deterministic histories.
- Unit-test viewport bounds and navigation without a real terminal.
- Integration-test `graph --plain` and non-TTY fallback through the public CLI.
- Perform one manual Windows Terminal pass at 80×24 and one narrow pass near 60 columns.

Full keypress automation is optional for v0.2; pure navigation and cleanup logic must still be automated.

## Boundaries

- Always: restore terminal state; keep rendering bounded; preserve current keys; use domain/state modules.
- Ask first: add keys, colors, dependencies, mouse support, or a new selection kind.
- Never: execute Git actions from a key handler; persist on mere navigation; emit ANSI control codes in plain mode.

## Success criteria

- Plain output is stable and readable for linear and merged histories.
- Empty repositories render without errors.
- Navigation never selects outside the available rows.
- Save writes the exact highlighted commit and reports success.
- Every exit path restores the cursor and raw input mode.
- Windows manual acceptance succeeds at standard and narrow terminal sizes.

## Open questions

None for v0.2.
