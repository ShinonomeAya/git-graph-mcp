const fs = require("fs");
const path = require("path");

function selectionPath(root) {
  return path.join(root, ".git", "git-graph-mcp-selection.json");
}

function writeSelection(root, selection) {
  fs.writeFileSync(selectionPath(root), JSON.stringify(selection, null, 2));
}

function readSelection(root) {
  const file = selectionPath(root);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

module.exports = {
  readSelection,
  writeSelection,
};
