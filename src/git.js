const { execFileSync } = require("child_process");
const path = require("path");

const FIELD = "\x1f";
const RECORD = "\x1e";

function getGitContext(repo, limit) {
  const root = git(repo, ["rev-parse", "--show-toplevel"]).trim();
  const hasHead = canGit(root, ["rev-parse", "--verify", "HEAD"]);
  const head = hasHead ? git(root, ["rev-parse", "--short", "HEAD"]).trim() : "NO_COMMITS";
  const branch = git(root, ["branch", "--show-current"]).trim() || "DETACHED";
  const commits = hasHead ? readLog(root, limit) : [];

  return {
    root,
    head,
    branch,
    commits,
  };
}

function readLog(root, limit) {
  const format = `${FIELD}%H${FIELD}%P${FIELD}%D${FIELD}%an${FIELD}%ae${FIELD}%at${FIELD}%s`;
  const output = git(root, [
    "log",
    "--graph",
    "--topo-order",
    "--decorate=full",
    `--max-count=${limit}`,
    `--format=${format}`,
  ]);

  const commits = [];

  output
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      const fieldIndex = line.indexOf(FIELD);
      if (fieldIndex === -1) {
        const previous = commits[commits.length - 1];
        if (previous) previous.graphAfter.push(line);
        return;
      }

      const graphPrefix = line.slice(0, fieldIndex).trimEnd();
      const record = line.slice(fieldIndex + FIELD.length);
      commits.push(parseCommitRecord(record, graphPrefix));
    });

  return commits;
}

function parseCommitRecord(record, graphPrefix) {
  const [hash, parentsRaw, refsRaw, authorName, authorEmail, timestampRaw, subject] = record.split(FIELD);
  return {
    hash,
    shortHash: hash.slice(0, 7),
    parents: parentsRaw ? parentsRaw.split(" ").filter(Boolean) : [],
    refs: parseRefs(refsRaw || ""),
    author: {
      name: authorName || "",
      email: authorEmail || "",
    },
    timestamp: Number(timestampRaw || 0),
    date: new Date(Number(timestampRaw || 0) * 1000).toISOString(),
    subject: subject || "",
    graphPrefix: graphPrefix || "",
    graphAfter: [],
  };
}

function parseRefs(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .map((item) => item
      .replace(/^HEAD -> /, "")
      .replace(/^refs\/heads\//, "")
      .replace(/^refs\/remotes\//, "")
      .replace(/^refs\/tags\//, "tag:"))
    .filter(Boolean);
}

function getGitStatus(root) {
  const lines = git(root, ["status", "--short", "--branch"])
    .split(/\r?\n/)
    .filter(Boolean);
  return lines;
}

function readCommit(root, hash) {
  const record = git(root, [
    "show",
    "--quiet",
    "--decorate=full",
    `--format=%H${FIELD}%P${FIELD}%D${FIELD}%an${FIELD}%ae${FIELD}%at${FIELD}%s`,
    hash,
  ]).trim();
  const commit = parseCommitRecord(record);
  const changedFiles = git(root, ["diff-tree", "-m", "--no-commit-id", "--name-status", "-r", hash])
    .split(/\r?\n/)
    .filter(Boolean);
  const patchPreview = git(root, ["show", "--stat", "--oneline", "--decorate", "--no-renames", hash]);

  return {
    repo: root,
    selectedCommit: commit.hash,
    selectedShortHash: commit.shortHash,
    refs: commit.refs,
    parents: commit.parents,
    subject: commit.subject,
    author: commit.author,
    date: commit.date,
    changedFiles,
    patchPreview,
    suggestedActions: [
      "compare_with_HEAD",
      "create_branch_here",
      "checkout_detached",
      "soft_reset_here",
      "hard_reset_here_requires_confirmation",
    ],
  };
}

function compareWithHead(root, hash) {
  const range = `${hash}..HEAD`;
  const commitsAhead = git(root, ["log", "--oneline", "--decorate", range])
    .split(/\r?\n/)
    .filter(Boolean);
  const diffStat = git(root, ["diff", "--stat", range]).trim();
  const nameStatus = git(root, ["diff", "--name-status", range])
    .split(/\r?\n/)
    .filter(Boolean);

  return {
    repo: root,
    baseCommit: hash,
    head: git(root, ["rev-parse", "HEAD"]).trim(),
    commitCountFromSelectedToHead: commitsAhead.length,
    commitsFromSelectedToHead: commitsAhead,
    changedFiles: nameStatus,
    diffStat,
    suggestedActions: [
      "review_diff",
      "create_branch_at_selected",
      "soft_reset_to_selected_if_commits_should_be_uncommitted",
      "hard_reset_to_selected_only_after_backup_and_confirmation",
    ],
  };
}

function git(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd: path.resolve(cwd),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 16,
    });
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : "";
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
}

function canGit(cwd, args) {
  try {
    git(cwd, args);
    return true;
  } catch (_error) {
    return false;
  }
}

module.exports = {
  compareWithHead,
  getGitContext,
  getGitStatus,
  readCommit,
};
