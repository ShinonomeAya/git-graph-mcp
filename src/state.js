const fs = require("fs");
const path = require("path");

const { resolveCommit, resolveGitPath, resolveRepo } = require("./git");

const SCHEMA_VERSION = 2;
const LEGACY_SCHEMA_VERSION = 1;
const SELECTION_FILE = "git-graph-mcp-selection.json";
const OID_PATTERN = /^[0-9a-f]{40,64}$/i;
const REF_PATTERN = /^refs\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;

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

  const resolved = resolveStoredSelection(resolvedRoot, selection.selection);
  return withLegacyAliases({
    ...selection,
    selection: resolved,
  });
}

function writeSelection(root, selection) {
  const resolvedRoot = resolveRepo(root);
  const normalized = normalizeSelection(selection, resolvedRoot);
  const resolved = resolveStoredSelection(resolvedRoot, normalized.selection, "write");

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    repoRoot: resolvedRoot,
    selection: resolved,
    resolvedAt: normalized.resolvedAt,
  };
  if (normalized.repoFingerprint) payload.repoFingerprint = normalized.repoFingerprint;
  if (normalized.commit) payload.commit = normalized.commit;

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

  const version = value.schemaVersion === undefined && value.selection
    ? SCHEMA_VERSION
    : value.schemaVersion;
  if (version !== undefined && version !== LEGACY_SCHEMA_VERSION && version !== SCHEMA_VERSION) {
    throw new StateError("UNSUPPORTED_SELECTION_VERSION", "The selection file uses an unsupported schema version.");
  }

  const repoRoot = root || value.repoRoot || value.repo;
  if (typeof repoRoot !== "string" || !repoRoot.trim()) {
    throw new StateError("INVALID_SELECTION_FILE", "Selection data does not contain a repository root.");
  }

  let selection;
  let commit;
  if (version === undefined) {
    const oid = requireImmutableOid(value.selectedCommit);
    selection = { kind: "commit", oid };
    commit = normalizeCommitMetadata(value, oid);
  } else if (version === LEGACY_SCHEMA_VERSION) {
    const selected = value.selected;
    if (!selected || selected.kind !== "commit") {
      throw new StateError("INVALID_SELECTION_FILE", "Schema v1 selection must contain a commit.");
    }
    const oid = requireImmutableOid(selected.oid);
    selection = { kind: "commit", oid };
    commit = normalizeCommitMetadata(value.commit || value, oid);
  } else {
    selection = normalizeV2Selection(value.selection);
    commit = normalizeCommitMetadata(value.commit, selection.kind === "commit" ? selection.oid : null);
  }

  const normalized = {
    schemaVersion: SCHEMA_VERSION,
    repoRoot: path.resolve(repoRoot),
    selection,
    resolvedAt: typeof value.resolvedAt === "string" && value.resolvedAt
      ? value.resolvedAt
      : new Date().toISOString(),
  };
  if (value.repoFingerprint !== undefined) {
    if (!value.repoFingerprint || typeof value.repoFingerprint !== "object" || Array.isArray(value.repoFingerprint)) {
      throw new StateError("INVALID_SELECTION_FILE", "Selection data contains an invalid repository fingerprint.");
    }
    normalized.repoFingerprint = { ...value.repoFingerprint };
  }
  if (commit) normalized.commit = commit;
  return withLegacyAliases(normalized);
}

function normalizeV2Selection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StateError("INVALID_SELECTION_FILE", "Schema v2 selection is not a valid object.");
  }

  if (value.kind === "commit") {
    return { kind: "commit", oid: requireImmutableOid(value.oid) };
  }
  if (value.kind === "range") {
    return {
      kind: "range",
      baseOid: requireImmutableOid(value.baseOid),
      headOid: requireImmutableOid(value.headOid),
    };
  }
  if (value.kind === "ref") {
    return {
      kind: "ref",
      ref: requireRef(value.ref),
      oid: requireImmutableOid(value.oid),
    };
  }
  throw new StateError("INVALID_SELECTION_FILE", "Schema v2 selection has an unsupported kind.");
}

function resolveStoredSelection(root, selection, operation = "read") {
  if (selection.kind === "commit") {
    return {
      kind: "commit",
      oid: resolveImmutableOid(root, selection.oid),
    };
  }
  if (selection.kind === "range") {
    return {
      kind: "range",
      baseOid: resolveImmutableOid(root, selection.baseOid),
      headOid: resolveImmutableOid(root, selection.headOid),
    };
  }
  if (selection.kind === "ref") {
    const currentOid = resolveRefOid(root, selection.ref);
    const savedOid = resolveImmutableOid(root, selection.oid);
    if (currentOid !== savedOid) {
      throw new StateError(
        "MOVED_REF",
        `The selected ref moved from ${savedOid} to ${currentOid}.`
      );
    }
    return { kind: "ref", ref: selection.ref, oid: savedOid };
  }
  throw new StateError("INVALID_SELECTION_FILE", `Cannot ${operation} an unsupported selection kind.`);
}

function resolveImmutableOid(root, oid) {
  try {
    return resolveCommit(root, requireImmutableOid(oid));
  } catch (error) {
    if (error instanceof StateError && error.code === "INVALID_SELECTION_FILE") throw error;
    throw new StateError("STALE_SELECTION", "A selected commit no longer exists in this repository.", error);
  }
}

function resolveRefOid(root, ref) {
  try {
    return resolveCommit(root, requireRef(ref));
  } catch (error) {
    if (error instanceof StateError && error.code === "INVALID_SELECTION_FILE") throw error;
    throw new StateError("STALE_SELECTION", "The selected ref no longer exists in this repository.", error);
  }
}

function requireImmutableOid(oid) {
  if (typeof oid !== "string" || !OID_PATTERN.test(oid)) {
    throw new StateError("INVALID_SELECTION_FILE", "Selection data must contain a full immutable commit id.");
  }
  return oid.toLowerCase();
}

function requireRef(ref) {
  if (
    typeof ref !== "string"
    || !REF_PATTERN.test(ref)
    || ref.includes("..")
    || ref.includes("//")
    || ref.includes("@{")
    || ref.endsWith("/")
  ) {
    throw new StateError("INVALID_SELECTION_FILE", "Selection data must contain a full Git ref name.");
  }
  return ref;
}

function normalizeCommitMetadata(value, oid) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return oid
      ? { shortHash: oid.slice(0, 7), subject: "", refs: [] }
      : undefined;
  }
  return {
    shortHash: typeof value.shortHash === "string" && value.shortHash ? value.shortHash : oid ? oid.slice(0, 7) : "",
    subject: typeof value.subject === "string" ? value.subject : "",
    refs: Array.isArray(value.refs) ? value.refs : [],
  };
}

function withLegacyAliases(value) {
  const selection = value.selection;
  const isCommitLike = selection.kind === "commit" || selection.kind === "ref";
  const selected = isCommitLike ? { ...selection } : null;
  const selectedCommit = selection.kind === "commit" || selection.kind === "ref" ? selection.oid : null;
  const commit = value.commit || normalizeCommitMetadata(null, selectedCommit);
  return {
    ...value,
    selected,
    selectedCommit,
    selectedOid: selectedCommit,
    selectedShortHash: commit ? commit.shortHash : null,
    subject: commit ? commit.subject : "",
    refs: commit ? commit.refs : [],
  };
}

module.exports = {
  SCHEMA_VERSION,
  StateError,
  normalizeSelection,
  readSelection,
  resolveSelection,
  selectionPath,
  writeSelection,
};
