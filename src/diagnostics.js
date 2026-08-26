function debugLog(event) {
  if (process.env.GIT_GRAPH_MCP_DEBUG !== "1") return;
  const safeEvent = String(event).replace(/[^a-zA-Z0-9 .:_-]/g, "_");
  process.stderr.write(`[git-graph-mcp] ${new Date().toISOString()} ${safeEvent}\n`);
}

module.exports = { debugLog };
