const { compareWithHead, createBranch, resolveRepo, validateBranchName } = require("./git");
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

function createBranchAtSelected(root, name) {
  const repoRoot = resolveRepo(root);
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

function buildResetPlan(root, mode) {
  const repoRoot = resolveRepo(root);
  if (typeof mode !== "string" || !Object.prototype.hasOwnProperty.call(RESET_IMPACTS, mode)) {
    throw new ActionError("INVALID_RESET_MODE", "Reset mode must be one of: soft, mixed, hard.");
  }

  const selection = resolveSelection(repoRoot);
  if (!selection) {
    throw new ActionError("NO_SELECTION", "No selected commit is available.");
  }

  const comparison = compareWithHead(repoRoot, selection.selected.oid);
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
  };
}

module.exports = {
  ActionError,
  RESET_IMPACTS,
  buildResetPlan,
  createBranchAtSelected,
  validateBranchName,
};
