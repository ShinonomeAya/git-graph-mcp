# Five-minute demo

This is the smallest read-only onboarding path. Run it from a disposable Git
repository or pass `--repo <path>` to every command.

```powershell
# 1. Render bounded history
node .\bin\git-graph-mcp.js graph --plain --limit 8

# 2. Save an immutable commit selection (replace <oid> with a visible commit)
node .\bin\git-graph-mcp.js select commit <oid>

# 3. Verify the saved selection without changing Git state
node .\bin\git-graph-mcp.js selected

# 4. Check the local MCP setup and stdio handshake
node .\bin\git-graph-mcp.js doctor --json

# 5. Start the stdio server for an MCP client
node .\bin\git-graph-mcp.js mcp
```

The official SDK integration covers initialize, tool/resource listing, and
read-only calls in `test/integration/mcp-stdio.test.js`. The clean-install
version of this flow is exercised by `npm run test:package-install`.
