const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function createTempRepo() {
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "git-graph-mcp-test-"))
  );
  runGit(root, ["init"]);
  runGit(root, ["config", "user.name", "git-graph-mcp tests"]);
  runGit(root, ["config", "user.email", "git-graph-mcp-tests@example.invalid"]);

  return {
    root,
    runGit: (args) => runGit(root, args),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function commitFile(repo, name, content, message) {
  const file = path.join(repo.root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  repo.runGit(["add", "--", name]);
  repo.runGit(["commit", "-m", message]);
  return repo.runGit(["rev-parse", "HEAD"]).trim();
}

function runGit(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

module.exports = {
  commitFile,
  createTempRepo,
};
