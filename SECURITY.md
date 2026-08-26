# Security Policy

`git-graph-mcp` is a local-first tool. The supported MCP transport is stdio;
the project does not open a network listener, upload repository data, or ship a
background service. The default MCP surface is read-only. Branch creation is
explicit and idempotent, while reset planning never invokes `git reset`.

## Reporting a vulnerability

Please do not include secrets, private repository contents, or exploit details
in a public issue. Use GitHub's private vulnerability reporting or a private
security contact available to the repository maintainers. If neither option is
available, open a minimal public issue asking for a private reporting channel
without including sensitive details.

Include the affected version or commit, operating system, Node.js and Git
versions, reproduction steps using a disposable repository, and the expected
and observed behavior. Allow maintainers reasonable time to investigate before
public disclosure.

## Security boundaries

- Keep Node.js 22+ and Git patched; Node.js 20 is migration-only.
- Never put credentials, tokens, absolute machine paths, or repository contents
  in `.mcp.json`, diagnostics, screenshots, or bug reports.
- Review `git_revalidate_plan` results before any separately approved write.
- Treat MCP client configuration and tool calls as local user-authorized input.
- Run `npm run check` and `npm run test:package-install` before distributing a
  candidate package.
