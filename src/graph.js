function buildGraphRows(commits) {
  const lanes = [];

  return commits.map((commit) => {
    let lane = lanes.indexOf(commit.hash);
    if (lane === -1) {
      lane = lanes.length;
      lanes.push(commit.hash);
    }

    const laneSnapshot = lanes.slice();
    const firstParent = commit.parents[0];
    const extraParents = commit.parents.slice(1);

    if (firstParent) {
      lanes[lane] = firstParent;
    } else {
      lanes.splice(lane, 1);
    }

    for (let index = extraParents.length - 1; index >= 0; index -= 1) {
      const parent = extraParents[index];
      if (!lanes.includes(parent)) {
        lanes.splice(lane + 1, 0, parent);
      }
    }

    return {
      commit,
      lane,
      lanes: laneSnapshot,
      width: Math.max(laneSnapshot.length, lanes.length, lane + 1),
      isMerge: commit.parents.length > 1,
    };
  });
}

function renderLane(row) {
  if (row.commit.graphPrefix) {
    return renderGitGraphPrefix(row.commit.graphPrefix, row.isMerge);
  }

  const cells = [];
  const width = Math.max(row.width, row.lanes.length);

  for (let index = 0; index < width; index += 1) {
    if (index === row.lane) {
      cells.push(row.isMerge ? "◆" : "●");
    } else if (row.lanes[index]) {
      cells.push("│");
    } else {
      cells.push(" ");
    }
  }

  return cells.join(" ");
}

function renderGraphAfter(row) {
  return (row.commit.graphAfter || []).map((line) => renderGitGraphPrefix(line, false));
}

function renderGitGraphPrefix(prefix, isMerge) {
  return prefix.replace(/\*/g, isMerge ? "◆" : "●");
}

module.exports = {
  buildGraphRows,
  renderGraphAfter,
  renderLane,
};
