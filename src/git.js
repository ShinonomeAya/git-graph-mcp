const fs = require("fs");
const { execFileSync } = require("child_process");
const path = require("path");

const FIELD = "\x1f";

class GitError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "GitError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function normalizeLimit(value, fallback = 80) {
  if (value === undefined) return fallback;
  const normalized = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value.trim())
      ? Number(value)
      : NaN;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 500) {
    throw new GitError("INVALID_LIMIT", "limit must be an integer from 1 to 500.");
  }
  return normalized;
}

function resolveRepo(repo) {
  const requested = repo === undefined
    ? process.env.GIT_GRAPH_MCP_REPO || process.env.CLAUDE_PROJECT_DIR || process.cwd()
    : repo;
  if (typeof requested !== "string" || !requested.trim()) {
    throw new GitError("INVALID_REPO_PATH", "repo must be a non-empty directory path.");
  }

  const candidate = path.resolve(requested);
  try {
    if (!fs.statSync(candidate).isDirectory()) {
      throw new GitError("INVALID_REPO_PATH", "repo must point to a directory.");
    }
  } catch (error) {
    if (error instanceof GitError) throw error;
    throw new GitError("INVALID_REPO_PATH", "The repository path does not exist.", error);
  }

  try {
    return path.resolve(git(candidate, ["rev-parse", "--show-toplevel"]).trim());
  } catch (error) {
    if (error instanceof GitError && error.code === "NOT_GIT_REPOSITORY") throw error;
    throw new GitError("NOT_GIT_REPOSITORY", "The path is not a Git repository.", error);
  }
}

function resolveGitPath(root, name) {
  if (typeof name !== "string" || !name.trim() || path.isAbsolute(name) || name.split(/[\\/]/).includes("..")) {
    throw new GitError("INVALID_GIT_PATH", "A safe relative Git path is required.");
  }
  const resolvedRoot = resolveRepo(root);
  const gitPath = git(resolvedRoot, ["rev-parse", "--git-path", name]).trim();
  return path.resolve(resolvedRoot, gitPath);
}

function resolveCommit(root, revision) {
  if (typeof revision !== "string" || !revision.trim() || revision.startsWith("-")) {
    throw new GitError("INVALID_REVISION", "A valid Git revision is required.");
  }
  try {
    return git(resolveRepo(root), ["rev-parse", "--verify", `${revision}^{commit}`]).trim();
  } catch (error) {
    if (error instanceof GitError && error.code === "INVALID_REVISION") throw error;
    throw new GitError("INVALID_REVISION", "The requested Git revision does not exist.", error);
  }
}

function resolveSelectionTarget(root, target) {
  const resolvedRoot = resolveRepo(root);
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    throw new GitError("INVALID_SELECTION_KIND", "A typed selection target is required.");
  }

  if (target.kind === "commit") {
    return {
      kind: "commit",
      oid: resolveCommit(resolvedRoot, target.revision),
    };
  }

  if (target.kind === "range") {
    return {
      kind: "range",
      baseOid: resolveCommit(resolvedRoot, target.base),
      headOid: resolveCommit(resolvedRoot, target.head),
    };
  }

  if (target.kind === "ref") {
    if (!isFullRefName(target.ref)) {
      throw new GitError("INVALID_REF", "A full Git ref name such as refs/heads/main is required.");
    }
    return {
      kind: "ref",
      ref: target.ref,
      oid: resolveCommit(resolvedRoot, target.ref),
    };
  }

  throw new GitError("INVALID_SELECTION_KIND", "Selection kind must be one of: commit, range, ref.");
}

function isFullRefName(ref) {
  return typeof ref === "string"
    && /^refs\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref)
    && !ref.includes("..")
    && !ref.includes("//")
    && !ref.includes("@{")
    && !ref.endsWith("/");
}

function validateBranchName(root, name) {
  const resolvedRoot = resolveRepo(root);
  if (typeof name !== "string" || !name || name !== name.trim() || name.startsWith("-")) {
    throw new GitError("INVALID_BRANCH_NAME", "A valid new branch name is required.");
  }
  try {
    const normalized = git(resolvedRoot, ["check-ref-format", "--branch", name]).trim();
    if (!normalized || normalized !== name) {
      throw new GitError("INVALID_BRANCH_NAME", "The requested branch name is not valid.");
    }
  } catch (error) {
    if (error instanceof GitError && error.code === "INVALID_BRANCH_NAME") throw error;
    throw new GitError("INVALID_BRANCH_NAME", "The requested branch name is not valid.", error);
  }
  return name;
}

function createBranch(root, name, oid) {
  const resolvedRoot = resolveRepo(root);
  const branch = validateBranchName(resolvedRoot, name);
  const targetOid = resolveCommit(resolvedRoot, oid);
  const ref = `refs/heads/${branch}`;

  if (canGit(resolvedRoot, ["show-ref", "--verify", "--quiet", ref])) {
    const existingOid = git(resolvedRoot, ["rev-parse", ref]).trim();
    if (existingOid === targetOid) {
      return { branch, targetOid, created: false, alreadyExists: true };
    }
    throw new GitError("BRANCH_ALREADY_EXISTS", "The requested branch already points to another commit.");
  }

  try {
    git(resolvedRoot, ["update-ref", ref, targetOid, ""]);
  } catch (error) {
    if (error && /cannot lock ref|already exists/i.test(error.message || "")) {
      throw new GitError("BRANCH_ALREADY_EXISTS", "The requested branch already exists.", error);
    }
    throw error;
  }

  return { branch, targetOid, created: true, alreadyExists: false };
}

function getGitContext(repo, limit) {
  const root = resolveRepo(repo);
  const normalizedLimit = normalizeLimit(limit);
  const headOid = canGit(root, ["rev-parse", "--verify", "HEAD"])
    ? git(root, ["rev-parse", "HEAD"]).trim()
    : null;
  const branch = readBranch(root);

  return {
    root,
    repoRoot: root,
    head: headOid ? headOid.slice(0, 7) : "NO_COMMITS",
    headOid,
    branch,
    isEmpty: !headOid,
    isDetached: branch === "DETACHED",
    commits: headOid ? readLog(root, normalizedLimit) : [],
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

function searchCommits(root, options = {}) {
  const resolvedRoot = resolveRepo(root);
  const pageSize = normalizeSearchPageSize(options.pageSize);
  const filters = normalizeSearchFilters(resolvedRoot, options);
  const cursor = decodeSearchCursor(options.cursor, filters);
  const offset = cursor ? cursor.offset : 0;
  const format = `${FIELD}%H${FIELD}%P${FIELD}%D${FIELD}%an${FIELD}%ae${FIELD}%at${FIELD}%s`;
  const args = [
    "log",
    "--date-order",
    "--decorate=full",
    `--max-count=${pageSize + 1}`,
    `--skip=${offset}`,
    `--format=${format}`,
  ];
  if (filters.author) args.push(`--author=${filters.author}`);
  if (filters.message) args.push("--fixed-strings", `--grep=${filters.message}`);
  if (filters.since) args.push(`--since=${filters.since}`);
  if (filters.until) args.push(`--until=${filters.until}`);
  args.push(filters.ref);

  const records = git(resolvedRoot, args)
    .split(/\r?\n/)
    .filter((line) => line.includes(FIELD))
    .map((line) => parseCommitRecord(line.slice(line.indexOf(FIELD) + FIELD.length), ""));
  const hasMore = records.length > pageSize;
  const results = records.slice(0, pageSize).map(toSearchCommit);
  const nextCursor = hasMore
    ? encodeSearchCursor({ offset: offset + pageSize, filters })
    : null;

  return {
    schemaVersion: 2,
    repo: resolvedRoot,
    repoRoot: resolvedRoot,
    scope: { ref: filters.ref },
    filters,
    results,
    page: {
      pageSize,
      cursor: options.cursor || null,
      nextCursor,
      hasMore,
      returned: results.length,
      offset,
    },
  };
}

function normalizeSearchPageSize(value) {
  const normalized = value === undefined
    ? 20
    : typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value)
        : NaN;
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 100) {
    throw new GitError("INVALID_SEARCH_FILTER", "pageSize must be an integer from 1 to 100.");
  }
  return normalized;
}

function normalizeSearchFilters(root, options) {
  const input = options && typeof options === "object" && !Array.isArray(options) ? options : {};
  const ref = input.ref === undefined ? "HEAD" : normalizeSearchString(input.ref, "ref");
  if (ref !== "HEAD") {
    if (!isFullRefName(ref)) {
      throw new GitError("INVALID_REF", "A full Git ref name such as refs/heads/main is required.");
    }
    resolveCommit(root, ref);
  }
  const filters = {
    ref,
    author: optionalSearchString(input.author, "author"),
    message: optionalSearchString(input.message, "message"),
    since: optionalSearchDate(input.since, "since"),
    until: optionalSearchDate(input.until, "until"),
  };
  if (filters.since && filters.until && Date.parse(filters.since) > Date.parse(filters.until)) {
    throw new GitError("INVALID_SEARCH_FILTER", "since must not be later than until.");
  }
  return filters;
}

function normalizeSearchString(value, name) {
  if (typeof value !== "string" || !value.trim() || value.includes("\0")) {
    throw new GitError("INVALID_SEARCH_FILTER", `${name} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalSearchString(value, name) {
  return value === undefined || value === null ? null : normalizeSearchString(value, name);
}

function optionalSearchDate(value, name) {
  if (value === undefined || value === null) return null;
  const normalized = normalizeSearchString(value, name);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new GitError("INVALID_SEARCH_FILTER", `${name} must be a valid Git date.`);
  }
  return normalized;
}

function encodeSearchCursor({ offset, filters }) {
  return Buffer.from(JSON.stringify({ version: 1, offset, filters }), "utf8").toString("base64url");
}

function decodeSearchCursor(value, filters) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new GitError("INVALID_SEARCH_CURSOR", "cursor must be a valid search cursor.");
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch (error) {
    throw new GitError("INVALID_SEARCH_CURSOR", "cursor must be a valid search cursor.", error);
  }
  if (
    !payload
    || payload.version !== 1
    || !Number.isInteger(payload.offset)
    || payload.offset < 0
    || payload.offset > 1000000000
    || JSON.stringify(payload.filters) !== JSON.stringify(filters)
  ) {
    throw new GitError("INVALID_SEARCH_CURSOR", "cursor does not match this search.");
  }
  return payload;
}

function toSearchCommit(commit) {
  return {
    hash: commit.hash,
    shortHash: commit.shortHash,
    parents: commit.parents,
    refs: commit.refs,
    author: commit.author,
    timestamp: commit.timestamp,
    date: commit.date,
    subject: commit.subject,
  };
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
  const resolvedRoot = resolveRepo(root);
  const lines = git(resolvedRoot, ["status", "--porcelain=v1", "--branch"])
    .split(/\r?\n/)
    .filter(Boolean);
  const parsed = parseStatusLines(lines);
  const headOid = canGit(resolvedRoot, ["rev-parse", "--verify", "HEAD"])
    ? git(resolvedRoot, ["rev-parse", "HEAD"]).trim()
    : null;

  return {
    ...parsed,
    repoRoot: resolvedRoot,
    head: headOid ? headOid.slice(0, 7) : "NO_COMMITS",
    headOid,
    isEmpty: !headOid,
    isDetached: parsed.branch === "DETACHED",
  };
}

function parseStatusLines(lines) {
  const statusLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
  const branchLine = statusLines.find((line) => line.startsWith("##")) || "## DETACHED";
  const branch = parseStatusBranch(branchLine);
  const entries = statusLines
    .filter((line) => !line.startsWith("##"))
    .map(parseStatusEntry);

  return {
    branch,
    isDirty: entries.length > 0,
    entries,
    index: summarizeChanges(entries, "index"),
    worktree: summarizeChanges(entries, "worktree"),
    lines: statusLines,
  };
}

function parseStatusBranch(line) {
  const value = line.slice(2).trim();
  if (!value || /HEAD \(no branch\)/i.test(value)) return "DETACHED";
  return value
    .replace(/^No commits yet on /, "")
    .split("...")[0]
    .trim() || "DETACHED";
}

function parseStatusEntry(line) {
  const index = line[0] || " ";
  const worktree = line[1] || " ";
  const rawPath = line.slice(3);
  const renameParts = rawPath.split(" -> ");
  return {
    index,
    worktree,
    path: renameParts[renameParts.length - 1],
    origPath: renameParts.length > 1 ? renameParts[0] : null,
    untracked: index === "?" && worktree === "?",
    conflicted: isConflictEntry(index, worktree),
  };
}

function summarizeChanges(entries, side) {
  const summary = {
    changed: 0,
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    copied: 0,
    untracked: 0,
    conflicted: 0,
  };

  entries.forEach((entry) => {
    const code = entry[side];
    if (entry.untracked) {
      if (side === "worktree") {
        summary.changed += 1;
        summary.untracked += 1;
      }
      return;
    }
    if (code === " ") return;
    summary.changed += 1;
    if (code === "A") summary.added += 1;
    if (code === "M") summary.modified += 1;
    if (code === "D") summary.deleted += 1;
    if (code === "R") summary.renamed += 1;
    if (code === "C") summary.copied += 1;
    if (entry.conflicted) summary.conflicted += 1;
  });

  return summary;
}

function isConflictCode(code) {
  return code === "U";
}

function isConflictEntry(index, worktree) {
  return isConflictCode(index)
    || isConflictCode(worktree)
    || ["AA", "DD", "AU", "UA", "DU", "UD", "UU"].includes(`${index}${worktree}`);
}

function readCommit(root, revision) {
  const resolvedRoot = resolveRepo(root);
  const oid = resolveCommit(resolvedRoot, revision);
  const record = git(resolvedRoot, [
    "show",
    "--quiet",
    "--decorate=full",
    `--format=%H${FIELD}%P${FIELD}%D${FIELD}%an${FIELD}%ae${FIELD}%at${FIELD}%s`,
    oid,
  ]).trim();
  const commit = parseCommitRecord(record);
  const changedFiles = git(resolvedRoot, ["diff-tree", "--root", "-m", "--no-commit-id", "--name-status", "-r", oid])
    .split(/\r?\n/)
    .filter(Boolean);
  const patchPreview = git(resolvedRoot, ["show", "--stat", "--oneline", "--decorate", "--no-renames", oid]);

  return {
    repo: resolvedRoot,
    repoRoot: resolvedRoot,
    selectedCommit: commit.hash,
    selectedOid: commit.hash,
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

function compareWithHead(root, revision) {
  const resolvedRoot = resolveRepo(root);
  const selectedOid = resolveCommit(resolvedRoot, revision);
  const headOid = canGit(resolvedRoot, ["rev-parse", "--verify", "HEAD"])
    ? git(resolvedRoot, ["rev-parse", "HEAD"]).trim()
    : null;
  if (!headOid) throw new GitError("NO_HEAD", "The repository has no commits yet.");

  return compareResolvedRevisions(resolvedRoot, selectedOid, headOid);
}

function compareRevisions(root, leftRevision, rightRevision) {
  const resolvedRoot = resolveRepo(root);
  const leftOid = resolveCommit(resolvedRoot, leftRevision);
  const rightOid = resolveCommit(resolvedRoot, rightRevision);
  return compareResolvedRevisions(resolvedRoot, leftOid, rightOid);
}

function readDiff(root, leftRevision, rightRevision) {
  const resolvedRoot = resolveRepo(root);
  const leftOid = resolveCommit(resolvedRoot, leftRevision);
  const rightOid = resolveCommit(resolvedRoot, rightRevision);
  return git(resolvedRoot, ["diff", "--no-ext-diff", "--unified=3", leftOid, rightOid]);
}

function compareResolvedRevisions(resolvedRoot, selectedOid, headOid) {
  const relation = classifyRelationship(resolvedRoot, selectedOid, headOid);
  const countParts = git(resolvedRoot, [
    "rev-list",
    "--left-right",
    "--count",
    `${selectedOid}...${headOid}`,
  ]).trim().split(/\s+/).map(Number);
  const headBehindCount = Number.isFinite(countParts[0]) ? countParts[0] : 0;
  const headAheadCount = Number.isFinite(countParts[1]) ? countParts[1] : 0;
  const commitsUniqueToHead = git(resolvedRoot, ["log", "--oneline", "--decorate", `${selectedOid}..${headOid}`])
    .split(/\r?\n/)
    .filter(Boolean);
  const commitsUniqueToSelection = git(resolvedRoot, ["log", "--oneline", "--decorate", `${headOid}..${selectedOid}`])
    .split(/\r?\n/)
    .filter(Boolean);
  const diffStat = git(resolvedRoot, ["diff", "--stat", "--no-renames", selectedOid, headOid]).trim();
  const nameStatus = uniqueLines(git(resolvedRoot, ["diff", "--name-status", "--no-renames", selectedOid, headOid])
    .split(/\r?\n/)
    .filter(Boolean));
  const status = getGitStatus(resolvedRoot);
  const warnings = relationWarnings(relation);
  if (status.isDirty) {
    warnings.push("The working tree has uncommitted changes; review them before any action.");
  }

  return {
    schemaVersion: 1,
    repo: resolvedRoot,
    repoRoot: resolvedRoot,
    baseCommit: selectedOid,
    selectedOid,
    head: headOid,
    headOid,
    relation,
    mergeBaseOid: findMergeBase(resolvedRoot, selectedOid, headOid),
    headAheadCount,
    headBehindCount,
    isWorkingTreeDirty: status.isDirty,
    commitsUniqueToHead,
    commitsUniqueToSelection,
    commitCountFromSelectedToHead: headAheadCount,
    commitsFromSelectedToHead: commitsUniqueToHead,
    changedFiles: nameStatus,
    diffStat,
    warnings,
    suggestedActions: [
      "review_diff",
      "create_branch_at_selected",
      "soft_reset_to_selected_if_commits_should_be_uncommitted",
      "hard_reset_to_selected_only_after_backup_and_confirmation",
    ],
  };
}

function classifyRelationship(root, selectedOid, headOid) {
  if (selectedOid === headOid) return "SAME";
  if (canGit(root, ["merge-base", "--is-ancestor", selectedOid, headOid])) return "ANCESTOR";
  if (canGit(root, ["merge-base", "--is-ancestor", headOid, selectedOid])) return "DESCENDANT";
  return "DIVERGED";
}

function findMergeBase(root, selectedOid, headOid) {
  try {
    return git(root, ["merge-base", selectedOid, headOid]).trim() || null;
  } catch (_error) {
    return null;
  }
}

function relationWarnings(relation) {
  if (relation === "ANCESTOR") return ["HEAD contains commits newer than the selected commit."];
  if (relation === "DESCENDANT") return ["The selected commit is ahead of HEAD; HEAD does not contain it."];
  if (relation === "DIVERGED") return ["The selected commit and HEAD have diverged; review both sides before any action."];
  return [];
}

function uniqueLines(lines) {
  return [...new Set(lines)];
}

function readBranch(root) {
  const branch = git(root, ["branch", "--show-current"]).trim();
  return branch || "DETACHED";
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
    const message = stderr || `git ${args.join(" ")} failed`;
    if (/not a git repository/i.test(message)) {
      throw new GitError("NOT_GIT_REPOSITORY", "The path is not a Git repository.", error);
    }
    if (/unknown revision|bad object|ambiguous argument|invalid object name|needed a single revision/i.test(message)) {
      throw new GitError("INVALID_REVISION", "The requested Git revision does not exist.", error);
    }
    throw new GitError("GIT_COMMAND_FAILED", message, error);
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
  GitError,
  compareWithHead,
  compareRevisions,
  createBranch,
  getGitContext,
  getGitStatus,
  normalizeLimit,
  parseRefs,
  parseStatusLines,
  readCommit,
  readDiff,
  resolveSelectionTarget,
  validateBranchName,
  resolveCommit,
  resolveGitPath,
  resolveRepo,
  searchCommits,
};
