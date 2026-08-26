const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { resolveRepo } = require("./git");
const { version: PACKAGE_VERSION } = require("../package.json");

function debugLog(event) {
  if (process.env.GIT_GRAPH_MCP_DEBUG !== "1") return;
  const safeEvent = String(event).replace(/[^a-zA-Z0-9 .:_-]/g, "_");
  process.stderr.write(`[git-graph-mcp] ${new Date().toISOString()} ${safeEvent}\n`);
}

function check(name, status, code, message, details) {
  return { name, status, code, message, ...(details ? { details } : {}) };
}

function summarize(checks) {
  return checks.reduce((counts, item) => {
    counts[item.status] += 1;
    return counts;
  }, { pass: 0, warn: 0, fail: 0 });
}

function readMcpConfiguration(configPath) {
  if (!fs.existsSync(configPath)) {
    return check("mcp-config", "warn", "MCP_CONFIG_MISSING", "MCP configuration file was not found.");
  }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const server = config && config.mcpServers && config.mcpServers["git-graph"];
    const valid = server
      && server.type === "stdio"
      && server.command === "node"
      && Array.isArray(server.args)
      && server.args.includes("mcp");
    if (!valid) {
      return check("mcp-config", "fail", "MCP_CONFIG_STALE", "MCP configuration does not match the portable stdio setup.");
    }
    return check("mcp-config", "pass", "OK", "Portable stdio configuration is present.");
  } catch (_error) {
    return check("mcp-config", "fail", "MCP_CONFIG_INVALID", "MCP configuration is not valid JSON.");
  }
}

async function checkMcpHandshake(options) {
  const binPath = options.binPath || path.resolve(__dirname, "../bin/git-graph-mcp.js");
  const requestedCwd = options.handshakeCwd || options.repo || process.cwd();
  const cwd = typeof requestedCwd === "string" && fs.existsSync(requestedCwd) ? requestedCwd : process.cwd();
  const client = new Client({ name: "git-graph-mcp-doctor", version: PACKAGE_VERSION });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [binPath, "mcp"],
    cwd,
    stderr: "pipe",
  });
  try {
    await client.connect(transport, { timeout: options.handshakeTimeoutMs || 10000 });
    const listed = await client.listTools({}, { timeout: options.handshakeTimeoutMs || 10000 });
    const count = Array.isArray(listed.tools) ? listed.tools.length : 0;
    if (!count) return check("mcp-handshake", "fail", "MCP_HANDSHAKE_FAILED", "MCP stdio returned no tools.");
    return check("mcp-handshake", "pass", "OK", `MCP stdio handshake succeeded (${count} tools).`, { toolCount: count });
  } catch (_error) {
    return check("mcp-handshake", "fail", "MCP_HANDSHAKE_FAILED", "MCP stdio handshake failed.");
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

async function runDoctor(options = {}) {
  const checks = [];
  const runtimeVersion = options.runtimeVersion || process.versions.node;
  const major = Number(String(runtimeVersion).split(".")[0]);
  checks.push(Number.isInteger(major) && major >= 22
    ? check("runtime", "pass", "OK", `Node.js ${runtimeVersion}.`)
    : check("runtime", "warn", "RUNTIME_UNSUPPORTED", "Node.js 22 or newer is recommended for supported releases."));

  try {
    const version = execFileSync("git", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 2000 }).trim();
    checks.push(check("git", "pass", "OK", version.replace(/^git version /, "Git ")));
  } catch (_error) {
    checks.push(check("git", "fail", "GIT_UNAVAILABLE", "Git is not available on PATH."));
  }

  let resolvedRepo = null;
  try {
    resolvedRepo = resolveRepo(options.repo, { timeoutMs: options.timeoutMs });
    checks.push(check("repository", "pass", "OK", "Git repository resolved."));
  } catch (_error) {
    checks.push(check("repository", "fail", "INVALID_REPO_PATH", "The requested path is not a usable Git repository."));
  }

  checks.push(check("package", "pass", "OK", `git-graph-mcp ${PACKAGE_VERSION}.`));
  const configPath = options.configPath || path.join(process.cwd(), ".mcp.json");
  checks.push(readMcpConfiguration(configPath));
  checks.push(await checkMcpHandshake({ ...options, handshakeCwd: resolvedRepo || process.cwd() }));

  const summary = summarize(checks);
  return { schemaVersion: 1, ok: summary.fail === 0, checks, summary };
}

function formatDoctor(report) {
  const lines = report.checks.map((item) => `${item.status.toUpperCase().padEnd(4)} ${item.name}: ${item.message}`);
  lines.push(`Doctor: ${report.ok ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

module.exports = { debugLog, formatDoctor, runDoctor };
