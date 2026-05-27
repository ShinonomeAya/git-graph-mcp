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

async function runTui(context, rows) {
  let selected = 0;
  let message = "Enter: inspect/select  j/k or arrows: move  s: save  q: quit";

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdout.write(HIDE_CURSOR);

  const cleanup = () => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdout.write(SHOW_CURSOR);
  };

  const render = () => {
    process.stdout.write(CLEAR);
    process.stdout.write(renderStaticGraph(context, rows, selected, message, true));
  };

  const selectCurrent = () => {
    const commit = rows[selected] && rows[selected].commit;
    if (!commit) return;
    const selection = readCommit(context.root, commit.hash);
    writeSelection(context.root, selection);
    message = `Selected ${commit.shortHash}: ${commit.subject}`;
  };

  render();

  await new Promise((resolve) => {
    process.stdin.on("keypress", (_input, key) => {
      if (!key) return;

      if (key.name === "q" || (key.ctrl && key.name === "c")) {
        cleanup();
        process.stdout.write("\n");
        resolve();
        return;
      }

      if (key.name === "up" || key.name === "k") {
        selected = Math.max(0, selected - 1);
      } else if (key.name === "down" || key.name === "j") {
        selected = Math.min(rows.length - 1, selected + 1);
      } else if (key.name === "return" || key.name === "s") {
        selectCurrent();
      }

      render();
    });
  });
}

function renderStaticGraph(context, rows, selectedIndex, footer, color) {
  const visibleRows = pickWindow(rows, selectedIndex, terminalHeight() - 5);
  const dim = color ? DIM : "";
  const invert = color ? INVERT : "";
  const reset = color ? RESET : "";
  const lines = [
    `git-graph-mcp  ${context.branch} @ ${context.head}`,
    dim + context.root + reset,
    "",
  ];

  visibleRows.forEach(({ row, index }) => {
    const commit = row.commit;
    const refs = commit.refs.length ? ` ${dim}${commit.refs.join(", ")}${reset}` : "";
    const marker = index === selectedIndex ? ">" : " ";
    const line = `${marker} ${renderLane(row).padEnd(12)} ${commit.shortHash}${refs}  ${commit.subject}`;
    lines.push(index === selectedIndex ? invert + line + reset : line);
    renderGraphAfter(row).forEach((graphLine) => {
      lines.push(`  ${graphLine}`);
    });
  });

  lines.push("");
  lines.push(dim + (footer || "Run without --plain for interactive TUI.") + reset);
  return lines.join("\n");
}

function pickWindow(rows, selectedIndex, height) {
  const size = Math.max(5, height || 20);
  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(selectedIndex - half, rows.length - size));
  return rows.slice(start, start + size).map((row, offset) => ({
    row,
    index: start + offset,
  }));
}

function terminalHeight() {
  return process.stdout.rows || 24;
}

module.exports = {
  runTui,
  renderStaticGraph,
};
