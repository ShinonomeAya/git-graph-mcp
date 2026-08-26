const readline = require("readline");
const { renderGraphAfter, renderLane } = require("./graph");
const { readCommit } = require("./git");
const { writeSelection } = require("./state");

const CLEAR = "\x1b[2J\x1b[H";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const INVERT = "\x1b[7m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;

async function runTui(context, rows) {
  const visibleRows = Array.isArray(rows) ? rows : [];
  if (visibleRows.length === 0) {
    process.stdout.write(CLEAR);
    process.stdout.write(renderStaticGraph(context, visibleRows, -1, "No commits yet.", false));
    process.stdout.write("\n");
    return;
  }

  let selected = 0;
  let message = "Enter/s: save commit  b: range base  e: save range  r: save visible ref  j/k or arrows: move  q: quit";
  let selectionDraft = null;
  let cleaned = false;
  let onKeypress;
  let onSigint;
  let onResize;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (onKeypress) process.stdin.off("keypress", onKeypress);
    if (onSigint) process.off("SIGINT", onSigint);
    if (onResize && typeof process.stdout.off === "function") process.stdout.off("resize", onResize);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    if (typeof process.stdin.pause === "function") process.stdin.pause();
    process.stdout.write(SHOW_CURSOR);
  };

  const currentCommit = () => visibleRows[selected] && visibleRows[selected].commit;

  const renderDraft = () => {
    if (!selectionDraft || selectionDraft.kind !== "range") return selectionDraft;
    return buildRangeSelection(selectionDraft.baseOid, selectionDraft.headOid || (currentCommit() && currentCommit().hash));
  };

  const render = () => {
    process.stdout.write(CLEAR);
    process.stdout.write(renderStaticGraph(context, visibleRows, selected, message, true, {
      selectionDraft: renderDraft(),
    }));
  };

  const selectCurrent = () => {
    const commit = currentCommit();
    if (!commit) return;
    const selection = readCommit(context.root, commit.hash);
    writeSelection(context.root, selection);
    selectionDraft = null;
    message = `Selected ${commit.shortHash}: ${commit.subject}`;
  };

  const beginRange = () => {
    const commit = currentCommit();
    if (!commit) return;
    selectionDraft = buildRangeSelection(commit.hash, null);
    message = `Range base ${commit.shortHash}. Move to endpoint and press e to save.`;
  };

  const saveRange = () => {
    const commit = currentCommit();
    if (!selectionDraft || selectionDraft.kind !== "range") {
      message = "Press b on a commit to set the range base first.";
      return;
    }
    if (!commit) return;
    const selection = buildRangeSelection(selectionDraft.baseOid, commit.hash);
    writeSelection(context.root, {
      schemaVersion: 2,
      repoRoot: context.root,
      selection,
    });
    selectionDraft = null;
    message = `Selected range ${selection.baseOid.slice(0, 7)}..${selection.headOid.slice(0, 7)}`;
  };

  const selectVisibleRef = () => {
    const commit = currentCommit();
    if (!commit) return;
    const selection = buildRefSelection(context, commit);
    writeSelection(context.root, {
      schemaVersion: 2,
      repoRoot: context.root,
      selection,
    });
    selectionDraft = null;
    message = `Selected ref ${selection.ref}`;
  };

  const finish = () => {
    cleanup();
    process.stdout.write("\n");
  };

  try {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdout.write(HIDE_CURSOR);
    render();

    onSigint = finish;
    process.once("SIGINT", onSigint);
    onResize = () => {
      if (!cleaned) render();
    };
    if (typeof process.stdout.on === "function") process.stdout.on("resize", onResize);
    onKeypress = (_input, key) => {
      if (!key || cleaned) return;

      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        finish();
        return;
      }

      if (key.name === "up" || key.name === "k") {
        selected = moveSelection(selected, -1, visibleRows.length);
      } else if (key.name === "down" || key.name === "j") {
        selected = moveSelection(selected, 1, visibleRows.length);
      } else if (key.name === "b") {
        try {
          beginRange();
        } catch (error) {
          message = error && error.message ? error.message : "Could not set range base.";
        }
      } else if (key.name === "e") {
        try {
          saveRange();
        } catch (error) {
          message = error && error.message ? error.message : "Could not save range selection.";
        }
      } else if (key.name === "r") {
        try {
          selectVisibleRef();
        } catch (error) {
          message = error && error.message ? error.message : "Could not save ref selection.";
        }
      } else if (key.name === "return" || key.name === "s") {
        try {
          selectCurrent();
        } catch (error) {
          message = error && error.message ? error.message : "Could not save selection.";
        }
      }

      render();
    };
    process.stdin.on("keypress", onKeypress);

    await new Promise((resolve) => {
      const waitForCleanup = () => {
        if (cleaned) {
          resolve();
          return;
        }
        setImmediate(waitForCleanup);
      };
      waitForCleanup();
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}

function renderStaticGraph(context, rows, selectedIndex = 0, footer, color = false, options = {}) {
  const visibleRows = Array.isArray(rows) ? rows : [];
  const width = options.width || terminalWidth();
  const height = options.height || terminalHeight();
  const selected = selectedIndex >= 0 && selectedIndex < visibleRows.length ? selectedIndex : -1;
  const windowRows = pickWindow(visibleRows, selected, height - 8);
  const dim = color ? DIM : "";
  const reset = color ? RESET : "";
  const lines = [
    truncateText(`git-graph-mcp  ${context.branch} @ ${context.head}`, width),
    truncateText(`${dim}${context.root}${reset}`, width),
    "",
  ];

  if (windowRows.length === 0) {
    lines.push(truncateText("No commits yet.", width));
  }

  windowRows.forEach(({ row, index }) => {
    const commit = row.commit;
    const refs = commit.refs && commit.refs.length ? ` ${commit.refs.join(", ")}` : "";
    const marker = index === selected ? ">" : " ";
    const line = `${marker} ${renderLane(row).padEnd(12)} ${commit.shortHash}${refs}  ${commit.subject}`;
    const displayLine = truncateText(line, width);
    lines.push(index === selected && color ? `${INVERT}${displayLine}${RESET}` : displayLine);
    renderGraphAfter(row).forEach((graphLine) => {
      lines.push(truncateText(`  ${graphLine}`, width));
    });
  });

  const selectedCommit = selected >= 0 && visibleRows[selected]
    ? visibleRows[selected].commit
    : null;
  if (selectedCommit) {
    lines.push("");
    lines.push(truncateText(`Selected: ${selectedCommit.shortHash}`, width));
    lines.push(truncateText(`Subject: ${selectedCommit.subject || ""}`, width));
    lines.push(truncateText(`Refs: ${(selectedCommit.refs || []).join(", ") || "(none)"}`, width));
    lines.push(truncateText(`Author: ${selectedCommit.author?.name || ""}`, width));
    lines.push(truncateText(`Date: ${selectedCommit.date || ""}`, width));
    lines.push(truncateText(`Parents: ${(selectedCommit.parents || []).length}`, width));
  }

  if (options.selectionDraft) {
    lines.push("");
    lines.push(truncateText(`Selection mode: ${String(options.selectionDraft.kind).toUpperCase()}`, width));
    if (options.selectionDraft.kind === "range") {
      lines.push(truncateText(`Range base: ${shortOid(options.selectionDraft.baseOid)}`, width));
      lines.push(truncateText(`Range head: ${shortOid(options.selectionDraft.headOid)}`, width));
    } else if (options.selectionDraft.kind === "ref") {
      lines.push(truncateText(`Ref: ${options.selectionDraft.ref}`, width));
      lines.push(truncateText(`Ref oid: ${shortOid(options.selectionDraft.oid)}`, width));
    }
  }

  lines.push("");
  lines.push(truncateText(dim + (footer || "Run without --plain for interactive TUI.") + reset, width));
  return lines.join("\n");
}

function moveSelection(current, direction, rowCount) {
  if (!rowCount) return -1;
  const start = Number.isInteger(current) ? current : 0;
  return Math.max(0, Math.min(rowCount - 1, start + direction));
}

function pickWindow(rows, selectedIndex, height) {
  const visibleRows = Array.isArray(rows) ? rows : [];
  if (visibleRows.length === 0) return [];
  const size = Math.max(5, Number.isInteger(height) ? height : 20);
  const selected = Math.max(0, Math.min(visibleRows.length - 1, selectedIndex < 0 ? 0 : selectedIndex));
  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(selected - half, visibleRows.length - size));
  return visibleRows.slice(start, start + size).map((row, offset) => ({
    row,
    index: start + offset,
  }));
}

function truncateText(value, width) {
  const text = String(value ?? "");
  const limit = Math.max(1, Number.isInteger(width) ? width : 80);
  const visible = text.replace(ANSI_PATTERN, "");
  if (visible.length <= limit) return text;
  return `${visible.slice(0, Math.max(0, limit - 1))}…`;
}

function terminalWidth() {
  return process.stdout.columns || 80;
}

function terminalHeight() {
  return process.stdout.rows || 24;
}

function buildRangeSelection(baseOid, headOid) {
  return { kind: "range", baseOid, headOid };
}

function resolveVisibleRef(context = {}, commit = {}) {
  const displayedRef = Array.isArray(commit.refs) ? commit.refs.find(Boolean) : null;
  if (displayedRef) {
    if (displayedRef.startsWith("tag:")) return `refs/tags/${displayedRef.slice(4)}`;
    if (displayedRef.startsWith("refs/")) return displayedRef;
    if (displayedRef.startsWith("origin/") || displayedRef.startsWith("upstream/")) {
      return `refs/remotes/${displayedRef}`;
    }
    return `refs/heads/${displayedRef}`;
  }

  if (context.branch && context.branch !== "DETACHED" && context.headOid === commit.hash) {
    return `refs/heads/${context.branch}`;
  }
  throw new Error("No full ref is visible for this commit.");
}

function buildRefSelection(context, commit) {
  return {
    kind: "ref",
    ref: resolveVisibleRef(context, commit),
    oid: commit.hash,
  };
}

function shortOid(oid) {
  return typeof oid === "string" && oid ? oid.slice(0, 7) : "(pending)";
}

module.exports = {
  buildRangeSelection,
  buildRefSelection,
  moveSelection,
  pickWindow,
  resolveVisibleRef,
  renderStaticGraph,
  runTui,
  truncateText,
};
