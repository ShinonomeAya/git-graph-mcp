#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const {
  getGitContext,
  readCommitDiff,
  readFileHistory,
  searchCommits,
} = require("../src/git");

const smoke = process.argv.includes("--smoke");
const commitCount = smoke ? 40 : 160;
const budgets = Object.freeze({
  graphMs: 5000,
  searchMs: 5000,
  diffMs: 5000,
  historyMs: 5000,
  maxOutputBytes: 1024 * 1024,
});

function runGit(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function measure(name, operation) {
  const started = process.hrtime.bigint();
  const value = operation();
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  return {
    name,
    durationMs: Math.round(durationMs * 100) / 100,
    outputBytes: Buffer.byteLength(JSON.stringify(value), "utf8"),
  };
}

function main() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "git-graph-mcp-benchmark-")));
  try {
    runGit(root, ["init"]);
    runGit(root, ["config", "user.name", "git-graph-mcp benchmark"]);
    runGit(root, ["config", "user.email", "git-graph-mcp-benchmark@example.invalid"]);
    for (let index = 0; index < commitCount; index += 1) {
      fs.writeFileSync(path.join(root, "history.txt"), `commit ${index}\n${"x".repeat(index % 80)}\n`);
      runGit(root, ["add", "--", "history.txt"]);
      runGit(root, ["commit", "-m", `benchmark ${index}`]);
    }
    const head = runGit(root, ["rev-parse", "HEAD"]).trim();
    const measurements = [
      measure("graph", () => getGitContext(root, 80)),
      measure("search", () => searchCommits(root, { pageSize: 20 })),
      measure("diff", () => readCommitDiff(root, head, { path: "history.txt" })),
      measure("history", () => readFileHistory(root, { path: "history.txt", pageSize: 20 })),
    ];
    const failures = measurements
      .filter((measurement) => measurement.durationMs > budgets[`${measurement.name}Ms`]
        || measurement.outputBytes > budgets.maxOutputBytes)
      .map((measurement) => measurement.name);
    const report = {
      schemaVersion: 1,
      fixture: { commits: commitCount, repository: "temporary" },
      budgets,
      measurements,
      passed: failures.length === 0,
      failures,
    };
    console.log(JSON.stringify(report, null, 2));
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main();
