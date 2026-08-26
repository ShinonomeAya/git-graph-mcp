# Contributing

Contributions should preserve the project's local-first, read-only-by-default
security model. Keep changes small and scoped to the current task; add tests
before changing safety-critical behavior.

## Development workflow

```powershell
npm ci
npm run check
npm run test:package-install
```

Use a disposable Git repository for integration tests. Do not use the working
repository as a mutation target, commit credentials or machine-specific paths,
or add shell-concatenated Git commands. New MCP tools must define bounded input
and output schemas, stable error codes, and official SDK stdio coverage.

## Pull requests

Describe the user-facing behavior, safety impact, tests run, and any remaining
manual checks. Keep package contents within the allowlist (`bin/`, `src/`,
`README.md`, `LICENSE`, and generated `package.json`). Do not add a network
listener, background daemon, destructive Git executor, or dependency without a
separate design decision.

Version changes, tags, GitHub visibility, releases, and npm publication are
separate maintainer approvals. A pull request must not perform those actions.
