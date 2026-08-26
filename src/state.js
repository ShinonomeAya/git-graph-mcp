const fs = require("fs");
const path = require("path");

const { resolveCommit, resolveGitPath, resolveRepo } = require("./git");

const SCHEMA_VERSION = 1;
const SELECTION_FILE = "git-graph-mcp-selection.json";

class StateError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "StateError";
    this.code = code;
    if (cause) this.cause = cause;
  }
}

function selectionPath(root) {
  return resolveGitPath(resolveRepo(root), SELECTION_FILE);
}

function readSelection(root) {
  const resolvedRoot = resolveRepo(root);
  const file = selectionPath(resolvedRoot);
  if (!fs.existsSync(file)) return null;

  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new StateError("INVALID_SELECTION_FILE", "The selection file is not valid JSON.", error);
  }
  return normalizeSelection(value, resolvedRoot);
}

function resolveSelection(root) {
  const resolvedRoot = resolveRepo(root);
  const selection = readSelection(resolvedRoot);
  if (!selection) return null;

  try {
    const oid = resolveCommit(resolvedRoot, selection.selected.oid);
    return withLegacyAliases({
      ...selection,
      selected: { ...selection.selected, oid },
    });
  } catch (error) {
    throw new StateError("STALE_SELECTION", "The selected commit no longer exists in this repository.", error);
  }
}

function writeSelection(root, selection) {
  const resolvedRoot = resolveRepo(root);
  const normalized = normalizeSelection(selection, resolvedRoot);
  let oid;
  try {
    oid = resolveCommit(resolvedRoot, normalized.selected.oid);
  } catch (error) {
    throw new StateError("STALE_SELECTION", "The selected commit does not exist in this repository.", error);
  }

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    repoRoot: resolvedRoot,
    selected: { kind: "commit", oid },
    resolvedAt: normalized.resolvedAt,
    commit: normalized.commit,
  };
  const file = selectionPath(resolvedRoot);
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );

  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx" });
    fs.renameSync(temporary, file);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch (_cleanupError) {
      // The replacement failure is the actionable error; cleanup is best effort.
    }
    throw new StateError("SELECTION_WRITE_FAILED", "The selection file could not be replaced atomically.", error);
  }

  return withLegacyAliases(payload);
}

function normalizeSelection(value, root) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StateError("INVALID_SELECTION_FILE", "Selection data is not a valid object.");
  }
  if (value.schemaVersion !== undefined && value.schemaVersion !== SCHEMA_VERSION) {
    throw new StateError("UNSUPPORTED_SELECTION_VERSION", "The selection file uses an unsupported schema version.");
  }

  const legacy = value.schemaVersion === undefined;
  const selected = legacy ? null : value.selected;
  const oid = legacy ? value.selectedCommit : selected && selected.oid;
  if (legacy && (typeof value.selectedCommit !== "string" || !value.selectedCommit.trim())) {
    throw new StateError("INVALID_SELECTION_FILE", "Selection data does not contain a commit.");
  }
  if (!legacy && (!selected || selected.kind !== "commit" || typeof oid !== "string")) {
    throw new StateError("INVALID_SELECTION_FILE", "Selection data does not contain a commit.");
  }
  if (!/^[0-9a-f]{40,64}$/i.test(oid)) {
    throw new StateError("INVALID_SELECTION_FILE", "The selected commit id is not valid.");
  }

  const repoRoot = root || value.repoRoot;
  if (typeof repoRoot !== "string" || !repoRoot.trim()) {
    throw new StateError("INVALID_SELECTION_FILE", "Selection data does not contain a repository root.");
  }
  const commit = legacy ? {
    shortHash: typeof value.selectedShortHash === "string" ? value.selectedShortHash : oid.slice(0, 7),
    subject: typeof value.subject === "string" ? value.subject : "",
    refs: Array.isArray(value.refs) ? value.refs : [],
  } : {
    shortHash: typeof value.commit?.shortHash === "string" ? value.commit.shortHash : oid.slice(0, 7),
    subject: typeof value.commit?.subject === "string" ? value.commit.subject : "",
    refs: Array.isArray(value.commit?.refs) ? value.commit.refs : [],
  };

  return withLegacyAliases({
    schemaVersion: SCHEMA_VERSION,
    repoRoot: path.resolve(repoRoot),
    selected: { kind: "commit", oid },
    resolvedAt: typeof value.resolvedAt === "string" && value.resolvedAt
      ? value.resolvedAt
      : new Date().toISOString(),
    commit,
  });
}

function withLegacyAliases(value) {
  return {
    ...value,
    selectedCommit: value.selected.oid,
    selectedOid: value.selected.oid,
    selectedShortHash: value.commit.shortHash,
    subject: value.commit.subject,
    refs: value.commit.refs,
  };
}

module.exports = {
  StateError,
  normalizeSelection,
  readSelection,
  resolveSelection,
  selectionPath,
  writeSelection,
};
