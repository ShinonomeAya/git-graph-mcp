const crypto = require("crypto");
const {
  compareWithHead,
  createBranch,
  getRepositoryFingerprint,
  resolveCommit,
  resolveRepo,
  validateBranchName,
} = require("./git");
const { resolveSelection } = require("./state");

const RESET_IMPACTS = Object.freeze({
  soft: Object.freeze({
    commitImpact: "HEAD_AND_CURRENT_REF_WOULD_MOVE_TO_SELECTED",
    indexImpact: "UNCHANGED",
    worktreeImpact: "UNCHANGED",
  }),
  mixed: Object.freeze({
    commitImpact: "HEAD_AND_CURRENT_REF_WOULD_MOVE_TO_SELECTED",
    indexImpact: "RESET_TO_SELECTED",
    worktreeImpact: "UNCHANGED",
  }),
  hard: Object.freeze({
    commitImpact: "HEAD_AND_CURRENT_REF_WOULD_MOVE_TO_SELECTED",
    indexImpact: "RESET_TO_SELECTED",
    worktreeImpact: "RESET_TRACKED_FILES",
  }),
});

class ActionError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "ActionError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function createBranchAtSelected(root, name, plan) {
  const repoRoot = resolveRepo(root);
  if (plan) revalidateActionPlan(repoRoot, plan);
  const selection = resolveSelection(repoRoot);
  if (!selection) {
    throw new ActionError("NO_SELECTION", "No selected commit is available.");
  }

  let branch;
  try {
    branch = validateBranchName(repoRoot, name);
  } catch (error) {
    if (error && error.code === "INVALID_BRANCH_NAME") throw error;
    throw new ActionError("INVALID_BRANCH_NAME", "The requested branch name is not valid.", error);
  }

  const result = createBranch(repoRoot, branch, selection.selected.oid);
  return {
    schemaVersion: 1,
    repoRoot,
    branch: result.branch,
    targetOid: result.targetOid,
    created: result.created,
    alreadyExists: result.alreadyExists,
  };
}

function buildResetPlan(root, mode, options = {}) {
  const repoRoot = resolveRepo(root);
  if (typeof mode !== "string" || !Object.prototype.hasOwnProperty.call(RESET_IMPACTS, mode)) {
    throw new ActionError("INVALID_RESET_MODE", "Reset mode must be one of: soft, mixed, hard.");
  }

  const selection = resolveSelection(repoRoot);
  if (!selection) {
    throw new ActionError("NO_SELECTION", "No selected commit is available.");
  }
  if (!selection.selected) {
    throw new ActionError("UNSUPPORTED_SELECTION", "Reset plans require a commit or ref selection, not a range.");
  }

  const comparison = compareWithHead(repoRoot, selection.selected.oid);
  const receipt = createActionPlanReceipt(repoRoot, selection, options);
  const impact = RESET_IMPACTS[mode];
  const warnings = [...comparison.warnings];
  if (["DESCENDANT", "DIVERGED"].includes(comparison.relation)) {
    warnings.push("The selected commit is not a simple ancestor rollback target.");
  }
  if (mode === "hard") {
    warnings.push("Hard reset would reset tracked files and may lose local changes.");
  }

  return {
    schemaVersion: 1,
    repoRoot,
    mode,
    selectedOid: comparison.selectedOid,
    headOid: comparison.headOid,
    relation: comparison.relation,
    proposedCommand: `git reset --${mode} ${comparison.selectedOid}`,
    commitImpact: impact.commitImpact,
    indexImpact: impact.indexImpact,
    worktreeImpact: impact.worktreeImpact,
    isWorkingTreeDirty: comparison.isWorkingTreeDirty,
    warnings,
    backupBranchSuggestion: `backup-before-reset-${comparison.headOid.slice(0, 7)}`,
    requiresExplicitExternalExecution: true,
    planId: receipt.planId,
    createdAt: receipt.createdAt,
    expiresAt: receipt.expiresAt,
    stateFingerprint: receipt.stateFingerprint,
    receipt,
  };
}

function createActionPlanReceipt(repoRoot, selection, options = {}) {
  const input = options && typeof options === "object" && !Array.isArray(options) ? options : {};
  const now = input.now === undefined ? Date.now() : new Date(input.now).getTime();
  const ttlMs = input.ttlMs === undefined ? 5 * 60 * 1000 : input.ttlMs;
  if (!Number.isFinite(now) || !Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 24 * 60 * 60 * 1000) {
    throw new ActionError("INVALID_ACTION_PLAN", "Action plan clock and expiry settings are invalid.");
  }
  const stateFingerprint = {
    ...getRepositoryFingerprint(repoRoot),
    selection: {
      kind: selection.selection.kind,
      oid: selection.selected.oid,
      ref: selection.selection.ref || null,
    },
  };
  return {
    schemaVersion: 1,
    planId: crypto.randomUUID(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    repoRoot,
    stateFingerprint,
  };
}

function revalidateActionPlan(root, plan, options = {}) {
  const receipt = plan && plan.receipt ? plan.receipt : plan;
  if (!receipt || typeof receipt !== "object" || !receipt.planId || !receipt.expiresAt || !receipt.stateFingerprint) {
    throw new ActionError("INVALID_ACTION_PLAN", "A complete action plan receipt is required.");
  }
  const now = options && options.now !== undefined ? new Date(options.now).getTime() : Date.now();
  if (!Number.isFinite(now)) throw new ActionError("INVALID_ACTION_PLAN", "The action plan clock is invalid.");
  if (now >= new Date(receipt.expiresAt).getTime()) {
    throw new ActionError("PLAN_EXPIRED", "The action plan has expired and must be regenerated.");
  }

  const repoRoot = resolveRepo(root);
  const expected = receipt.stateFingerprint;
  if (expected.selection && expected.selection.kind === "ref") {
    let currentOid;
    try {
      currentOid = resolveCommit(repoRoot, expected.selection.ref);
    } catch (_error) {
      throw new ActionError("PLAN_REF_MOVED", "The selected ref no longer resolves to the planned commit.");
    }
    if (currentOid !== expected.selection.oid) {
      throw new ActionError("PLAN_REF_MOVED", "The selected ref moved after the plan was created.");
    }
  }

  const current = getRepositoryFingerprint(repoRoot);
  if (
    current.headOid !== expected.headOid
    || current.currentRef !== expected.currentRef
    || current.refs !== expected.refs
  ) {
    throw new ActionError("PLAN_STALE", "The repository state changed after the plan was created.");
  }
  if (current.statusEntries !== expected.statusEntries || current.indexTree !== expected.indexTree) {
    throw new ActionError("PLAN_DIRTY_CHANGED", "The index or working-tree state changed after the plan was created.");
  }

  return {
    schemaVersion: 1,
    valid: true,
    planId: receipt.planId,
    repoRoot,
    stateFingerprint: current,
  };
}

module.exports = {
  ActionError,
  RESET_IMPACTS,
  buildResetPlan,
  createBranchAtSelected,
  validateBranchName,
  revalidateActionPlan,
};
