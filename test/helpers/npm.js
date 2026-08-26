const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function resolveNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    process.platform === "win32" && process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, "nodejs", "node_modules", "npm", "bin", "npm-cli.js")
      : null,
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function runNpm(args, options = {}) {
  const npmCli = resolveNpmCli();
  if (npmCli) {
    return spawnSync(process.execPath, [npmCli, ...args], {
      ...options,
      windowsHide: true,
    });
  }

  return spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    ...options,
    windowsHide: true,
  });
}

module.exports = { runNpm };
