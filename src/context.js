const {
  compareRevisions,
  compareWithHead,
  getGitContext,
  getGitStatus,
  readDiff,
  resolveRepo,
} = require("./git");
const { readSelection, resolveSelection } = require("./state");

const DEFAULT_BUDGET = Object.freeze({
  maxCommits: 20,
  maxFiles: 50,
  maxBytes: 32 * 1024,
  includePatch: false,
});

class ContextError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "ContextError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function buildContextBundle(root, options = {}) {
  const startedAt = Date.now();
  const budget = normalizeBudget(options);
  const repo = resolveRepo(root, { timeoutMs: budget.timeoutMs });
  const gitContext = getGitContext(repo, budget.maxCommits + 1, { timeoutMs: budget.timeoutMs });
  const gitStatus = getGitStatus(repo, { timeoutMs: budget.timeoutMs });
  const rawSelection = readSelection(repo);
  const warnings = [];

  let selection = rawSelection ? rawSelection.selection : null;
  let selectionState = rawSelection ? "stale" : "none";
  let resolvedSelection = null;
  if (rawSelection) {
    try {
      resolvedSelection = resolveSelection(repo);
      selection = resolvedSelection ? resolvedSelection.selection : null;
      selectionState = resolvedSelection ? "valid" : "none";
    } catch (error) {
      if (error.code === "MOVED_REF") {
        selectionState = "moved_ref";
        warnings.push(`Moved ref: ${error.message}`);
      } else if (error.code === "STALE_SELECTION") {
        selectionState = "stale";
        warnings.push(`Stale selection: ${error.message}`);
      } else {
        throw error;
      }
    }
  }

  let comparison = null;
  if (resolvedSelection && selection) {
    if (selection.kind === "range") {
      const rangeComparison = compareRevisions(repo, selection.baseOid, selection.headOid);
      comparison = {
        kind: "range",
        range: {
          baseOid: selection.baseOid,
          headOid: selection.headOid,
        },
        ...rangeComparison,
      };
    } else {
      comparison = {
        kind: selection.kind,
        ...compareWithHead(repo, selection.oid),
      };
    }
    warnings.push(...comparison.warnings);
  }
  if (gitStatus.isDirty && !warnings.some((warning) => /working tree/i.test(warning))) {
    warnings.push("The working tree has uncommitted changes; review them before any action.");
  }

  const graphCommits = gitContext.commits.slice(0, budget.maxCommits).map(toCommitMetadata);
  const graph = {
    commits: graphCommits,
    observedCount: gitContext.commits.length,
    truncated: gitContext.commits.length > budget.maxCommits,
  };
  const changedFiles = comparison ? comparison.changedFiles.slice(0, budget.maxFiles) : [];
  const changedFilesCount = comparison ? comparison.changedFiles.length : 0;
  const status = {
    branch: gitStatus.branch,
    head: gitStatus.head,
    headOid: gitStatus.headOid,
    isDirty: gitStatus.isDirty,
    isDetached: gitStatus.isDetached,
    index: gitStatus.index,
    worktree: gitStatus.worktree,
    lines: gitStatus.lines.slice(0, budget.maxFiles),
    entries: gitStatus.entries.slice(0, budget.maxFiles),
  };

  let patch = null;
  if (budget.includePatch) {
    patch = buildPatch(repo, selectionState, selection, gitContext.headOid, budget.maxBytes, budget.timeoutMs);
  }

  const content = {
    selection,
    selectionState,
    status,
    graph,
    comparison,
    changedFiles,
    changedFilesCount,
    changedFilesTruncated: changedFilesCount > budget.maxFiles,
    patch,
    warnings: uniqueWarnings(warnings),
  };
  const truncated = enforceContentBudget(content, budget.maxBytes);
  const bytesUsed = byteLength(content);

  return {
    schemaVersion: 2,
    repoRoot: repo,
    generatedAt: new Date().toISOString(),
    generationMs: Date.now() - startedAt,
    provenance: {
      source: "local-worktree",
      git: "system-git",
      selection: "git-graph-mcp-selection.json",
      status: "git status --porcelain=v1 --branch",
      graph: "git log --graph --topo-order",
      comparison: "git rev-list and git diff",
    },
    budget: {
      ...budget,
      bytesUsed,
    },
    truncated: truncated || graph.truncated || content.changedFilesTruncated || Boolean(patch && patch.truncated),
    ...content,
  };
}

function normalizeBudget(options) {
  const input = options && typeof options === "object" && !Array.isArray(options) ? options : {};
  return {
    maxCommits: boundedInteger(input.maxCommits, "maxCommits", DEFAULT_BUDGET.maxCommits, 1, 100),
    maxFiles: boundedInteger(input.maxFiles, "maxFiles", DEFAULT_BUDGET.maxFiles, 1, 500),
    maxBytes: boundedInteger(input.maxBytes, "maxBytes", DEFAULT_BUDGET.maxBytes, 256, 1024 * 1024),
    timeoutMs: boundedInteger(input.timeoutMs, "timeoutMs", 5000, 1, 60000),
    includePatch: input.includePatch === undefined ? DEFAULT_BUDGET.includePatch : input.includePatch === true,
  };
}

function boundedInteger(value, name, fallback, minimum, maximum) {
  const normalized = value === undefined ? fallback : value;
  if (!Number.isInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new ContextError(
      "INVALID_CONTEXT_BUDGET",
      `${name} must be an integer from ${minimum} to ${maximum}.`
    );
  }
  return normalized;
}

function buildPatch(repo, selectionState, selection, headOid, maxBytes, timeoutMs) {
  if (selectionState !== "valid" || !selection || !headOid) {
    return { requested: true, text: "", bytes: 0, truncated: false };
  }
  const left = selection.kind === "range" ? selection.baseOid : selection.oid;
  const right = selection.kind === "range" ? selection.headOid : headOid;
  const raw = readDiff(repo, left, right, { timeoutMs });
  const text = truncateUtf8(raw, maxBytes);
  return {
    requested: true,
    text,
    bytes: Buffer.byteLength(text, "utf8"),
    truncated: text !== raw,
  };
}

function enforceContentBudget(content, maxBytes) {
  let truncated = false;
  let attempts = 0;
  while (byteLength(content) > maxBytes && attempts < 1000) {
    attempts += 1;
    if (content.patch && content.patch.text) {
      const next = truncateUtf8(content.patch.text, Math.max(0, Math.floor(Buffer.byteLength(content.patch.text, "utf8") / 2)));
      if (next === content.patch.text) content.patch.text = "";
      else content.patch.text = next;
      content.patch.bytes = Buffer.byteLength(content.patch.text, "utf8");
      content.patch.truncated = true;
      truncated = true;
      continue;
    }
    if (content.graph.commits.length > 1) {
      content.graph.commits.pop();
      content.graph.truncated = true;
      truncated = true;
      continue;
    }
    if (content.changedFiles.length > 1) {
      content.changedFiles.pop();
      content.changedFilesTruncated = true;
      truncated = true;
      continue;
    }
    if (content.status.lines.length > 1) {
      content.status.lines.pop();
      content.status.entries = content.status.entries.slice(0, content.status.lines.length);
      truncated = true;
      continue;
    }
    if (content.comparison && content.comparison.commitsUniqueToHead.length > 1) {
      content.comparison.commitsUniqueToHead.pop();
      truncated = true;
      continue;
    }
    if (content.comparison && content.comparison.commitsUniqueToSelection.length > 1) {
      content.comparison.commitsUniqueToSelection.pop();
      truncated = true;
      continue;
    }
    if (content.warnings.length > 1) {
      content.warnings.pop();
      truncated = true;
      continue;
    }
    break;
  }
  return truncated;
}

function toCommitMetadata(commit) {
  return {
    hash: commit.hash,
    shortHash: commit.shortHash,
    parents: commit.parents,
    refs: commit.refs,
    subject: commit.subject,
    author: commit.author,
    date: commit.date,
  };
}

function truncateUtf8(value, maxBytes) {
  const buffer = Buffer.from(String(value || ""), "utf8");
  if (buffer.length <= maxBytes) return String(value || "");
  return buffer.subarray(0, Math.max(0, maxBytes)).toString("utf8");
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function uniqueWarnings(warnings) {
  return [...new Set(warnings.filter(Boolean))];
}

module.exports = {
  ContextError,
  DEFAULT_BUDGET,
  buildContextBundle,
};
