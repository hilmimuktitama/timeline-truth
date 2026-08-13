import { SCHEMA_VERSION, normalizeTimeline, validateTimeline } from "./timeline.js";

export const DIFF_CHANGE_TYPES = [
  "added",
  "removed",
  "start_moved",
  "end_moved",
  "duration_changed",
  "range_changed",
  "owner_changed",
  "dependency_added",
  "dependency_removed",
  "status_changed",
  "evidence_grade_changed",
  "impossible_sequence"
];

export const CRITICAL_PATH_STATEMENT =
  "Critical path is not computed. It cannot be determined defensibly with incomplete data: missing dates, durations, or owners leave the schedule under-constrained.";

export function diffTimelines(baseline = {}, current = {}, options = {}) {
  const base = normalizeTimeline(baseline);
  const curr = normalizeTimeline(current);

  const matched = matchItems(base.items, curr.items);
  const changes = [];
  let unchangedCount = 0;
  let changedCount = 0;

  for (const pair of matched.pairs) {
    const fieldChanges = compareItems(pair.baseline, pair.current);
    for (const change of fieldChanges) {
      changes.push({ ...change, itemTitle: pair.baseline.title, itemId: pair.baseline.id });
    }
    if (fieldChanges.length === 0) {
      unchangedCount += 1;
    } else {
      changedCount += 1;
    }
  }

  for (const item of matched.removedFromBaseline) {
    changes.push({
      type: "removed",
      category: "scope",
      itemTitle: item.title,
      itemId: item.id,
      item: item,
      message: `"${item.title}" is in the baseline but missing from the current timeline.`
    });
  }

  for (const item of matched.addedInCurrent) {
    changes.push({
      type: "added",
      category: "scope",
      itemTitle: item.title,
      itemId: item.id,
      item: item,
      message: `"${item.title}" was added to the current timeline.`
    });
  }

  const newSequencing = findNewImpossibleSequencing(base.items, curr.items);

  return {
    schema_version: SCHEMA_VERSION,
    baseline: {
      label: options.baselineLabel || "baseline",
      item_count: base.items.length
    },
    current: {
      label: options.currentLabel || "current",
      item_count: curr.items.length
    },
    summary: {
      matched: matched.pairs.length,
      changed: changedCount,
      unchanged: unchangedCount,
      added: matched.addedInCurrent.length,
      removed: matched.removedFromBaseline.length,
      new_issues: newSequencing.length,
      ambiguous_matches: matched.ambiguities.length
    },
    changes,
    new_issues: newSequencing,
    ambiguities: matched.ambiguities,
    critical_path: {
      computed: false,
      reason: CRITICAL_PATH_STATEMENT
    }
  };
}

export function renderDiffMarkdown(diff = {}) {
  const markdown = (value) => escapeMarkdown(value);
  const scalar = (value) => markdown(value);
  const lines = [
    "## Schedule Diff",
    "",
    `Baseline: ${scalar(diff.baseline?.label ?? "baseline")} (${scalar(diff.baseline?.item_count ?? 0)} items)  ·  Current: ${scalar(diff.current?.label ?? "current")} (${scalar(diff.current?.item_count ?? 0)} items)`,
    "",
    "| Metric | Count |",
    "| --- | ---: |",
    `| Added | ${scalar(diff.summary?.added ?? 0)} |`,
    `| Removed | ${scalar(diff.summary?.removed ?? 0)} |`,
    `| Changed | ${scalar(diff.summary?.changed ?? 0)} |`,
    `| Unchanged | ${scalar(diff.summary?.unchanged ?? 0)} |`,
    `| New impossible sequencing | ${scalar(diff.summary?.new_issues ?? 0)} |`,
    `| Ambiguous matches | ${scalar(diff.summary?.ambiguous_matches ?? 0)} |`,
    ""
  ];

  const changes = Array.isArray(diff.changes) ? diff.changes.filter(Boolean) : [];
  if (changes.length > 0) {
    lines.push("### Changes", "");
    for (const change of changes) {
      const type = DIFF_CHANGE_TYPES.includes(change.type) ? change.type : "unknown";
      // The allowlist makes this scalar safe without rendering an attacker-
      // supplied type as Markdown syntax.
      lines.push(`- **${type}**: "${markdown(change.itemTitle)}"${describeChange({ ...change, type }, markdown)}`);
    }
    lines.push("");
  } else {
    lines.push("### Changes", "", "- No schedule changes detected.", "");
  }

  const ambiguities = Array.isArray(diff.ambiguities) ? diff.ambiguities.filter(Boolean) : [];
  if (ambiguities.length > 0) {
    lines.push("### Ambiguous Matches", "");
    for (const ambiguity of ambiguities) {
      lines.push(`- ${markdown(ambiguity.message)}`);
    }
    lines.push("");
  }

  const newIssues = Array.isArray(diff.new_issues) ? diff.new_issues.filter(Boolean) : [];
  lines.push("### New Impossible Sequencing", "");
  if (newIssues.length === 0) {
    lines.push("- None.");
  } else {
    for (const issue of newIssues) {
      lines.push(`- ${markdown(issue.message)}`);
    }
  }
  lines.push("", "### Critical Path", "", `- ${CRITICAL_PATH_STATEMENT}`, "");

  return `${lines.join("\n")}\n`;
}

function describeChange(change, markdown = escapeMarkdown) {
  switch (change.type) {
    case "start_moved":
      return `: start moved ${markdown(change.old ?? "(none)")} → ${markdown(change.new ?? "(none)")}`;
    case "end_moved":
      return `: end moved ${markdown(change.old ?? "(none)")} → ${markdown(change.new ?? "(none)")}`;
    case "duration_changed":
      return `: duration ${markdown(change.old ?? "(none)")} → ${markdown(change.new ?? "(none)")}`;
    case "range_changed":
      return `: range changed ${markdown(change.old ?? "(none)")} → ${markdown(change.new ?? "(none)")}`;
    case "owner_changed":
      return `: owner ${markdown(change.old ?? "(none)")} → ${markdown(change.new ?? "(none)")}`;
    case "status_changed":
      return `: status ${markdown(change.old ?? "(none)")} → ${markdown(change.new ?? "(none)")}`;
    case "evidence_grade_changed":
      return `: evidence grade ${markdown(change.old ?? "(none)")} → ${markdown(change.new ?? "(none)")}`;
    case "dependency_added":
      return `: dependency "${markdown(change.value)}" added`;
    case "dependency_removed":
      return `: dependency "${markdown(change.value)}" removed`;
    case "added":
      return " was added to the current timeline";
    case "removed":
      return " was removed from the current timeline";
    case "impossible_sequence":
      return `: starts before dependency "${markdown(change.dependency)}" ends`;
    default:
      return "";
  }
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029\r\n]+/g, " ")
    .replace(/[\\`*_[\]{}()<>#+.!|~-]/g, "\\$&");
}

function matchItems(baselineItems, currentItems) {
  const pairs = [];
  const ambiguities = [];
  const matchedCurrent = new Set();
  const matchedBaseline = new Set();

  const currentById = new Map();
  for (const item of currentItems) {
    if (!currentById.has(item.id)) currentById.set(item.id, []);
    currentById.get(item.id).push(item);
  }

  for (const baselineItem of baselineItems) {
    const idCandidates = (currentById.get(baselineItem.id) || [])
      .filter((item) => !matchedCurrent.has(item));
    const titleCandidates = currentItems.filter(
      (item) => !matchedCurrent.has(item) && normalizeKey(item.title) === normalizeKey(baselineItem.title)
    );
    const candidate = idCandidates[0] || titleCandidates[0];

    if (candidate) {
      pairs.push({ baseline: baselineItem, current: candidate });
      matchedCurrent.add(candidate);
      matchedBaseline.add(baselineItem);

      // Pairing is deterministic (first unmatched item in document order), but
      // when several current items could match the same baseline item the
      // pairing is ambiguous and must be reported instead of silently guessed.
      if (idCandidates.length > 1) {
        ambiguities.push(makeAmbiguity(baselineItem, "id", baselineItem.id, idCandidates));
      } else if (idCandidates.length === 0 && titleCandidates.length > 1) {
        ambiguities.push(makeAmbiguity(baselineItem, "title", baselineItem.title, titleCandidates));
      }
    }
  }

  return {
    pairs,
    ambiguities,
    removedFromBaseline: baselineItems.filter((item) => !matchedBaseline.has(item)),
    addedInCurrent: currentItems.filter((item) => !matchedCurrent.has(item))
  };
}

function makeAmbiguity(baselineItem, key, value, candidates) {
  return {
    type: "ambiguous_match",
    category: "matching",
    itemTitle: baselineItem.title,
    itemId: baselineItem.id,
    key,
    value,
    matches: candidates.map((candidate) => candidate.title),
    message: `"${baselineItem.title}" matches ${candidates.length} current items by ${key} "${value}"; the engine pairs it with the first unmatched item in document order, which may be wrong.`
  };
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function compareItems(baseline, current) {
  const changes = [];

  const bothStart = baseline.start !== current.start;
  const bothEnd = baseline.end !== current.end;
  if (bothStart && bothEnd) {
    changes.push({
      type: "range_changed",
      category: "schedule",
      field: "range",
      old: formatRange(baseline.start, baseline.end),
      new: formatRange(current.start, current.end),
      message: `"${baseline.title}" range changed from ${formatRange(baseline.start, baseline.end)} to ${formatRange(current.start, current.end)}.`
    });
  } else if (bothStart) {
    changes.push({
      type: "start_moved",
      category: "schedule",
      field: "start",
      old: baseline.start,
      new: current.start,
      message: `"${baseline.title}" start moved from ${baseline.start ?? "(none)"} to ${current.start ?? "(none)"}.`
    });
  } else if (bothEnd) {
    changes.push({
      type: "end_moved",
      category: "schedule",
      field: "end",
      old: baseline.end,
      new: current.end,
      message: `"${baseline.title}" end moved from ${baseline.end ?? "(none)"} to ${current.end ?? "(none)"}.`
    });
  }

  if (baseline.duration !== current.duration) {
    changes.push({
      type: "duration_changed",
      category: "schedule",
      field: "duration",
      old: baseline.duration,
      new: current.duration,
      message: `"${baseline.title}" duration changed from ${baseline.duration ?? "(none)"} to ${current.duration ?? "(none)"}.`
    });
  }

  if (baseline.owner !== current.owner) {
    changes.push({
      type: "owner_changed",
      category: "owner",
      field: "owner",
      old: baseline.owner,
      new: current.owner,
      message: `"${baseline.title}" owner changed from ${baseline.owner ?? "(none)"} to ${current.owner ?? "(none)"}.`
    });
  }

  if (baseline.status !== current.status) {
    changes.push({
      type: "status_changed",
      category: "status",
      field: "status",
      old: baseline.status,
      new: current.status,
      message: `"${baseline.title}" status changed from ${baseline.status ?? "(none)"} to ${current.status ?? "(none)"}.`
    });
  }

  if (baseline.evidence_grade !== current.evidence_grade) {
    changes.push({
      type: "evidence_grade_changed",
      category: "evidence",
      field: "evidence_grade",
      old: baseline.evidence_grade,
      new: current.evidence_grade,
      message: `"${baseline.title}" evidence grade changed from ${baseline.evidence_grade ?? "(none)"} to ${current.evidence_grade ?? "(none)"}.`
    });
  }

  for (const dependency of current.dependencies) {
    if (!baseline.dependencies.includes(dependency)) {
      changes.push({
        type: "dependency_added",
        category: "dependency",
        field: "dependencies",
        value: dependency,
        message: `"${baseline.title}" now depends on "${dependency}".`
      });
    }
  }

  for (const dependency of baseline.dependencies) {
    if (!current.dependencies.includes(dependency)) {
      changes.push({
        type: "dependency_removed",
        category: "dependency",
        field: "dependencies",
        value: dependency,
        message: `"${baseline.title}" no longer depends on "${dependency}".`
      });
    }
  }

  return changes;
}

function formatRange(start, end) {
  if (!start && !end) return "(none)";
  return start ? `${start} to ${end ?? "(open)"}` : `(open) to ${end}`;
}

function findNewImpossibleSequencing(baselineItems, currentItems) {
  const baselineKeys = new Set(impossibleSequenceKeys(baselineItems));
  return impossibleSequenceIssues(currentItems).filter(
    (issue) => !baselineKeys.has(`${issue.itemTitle}|${issue.dependency}`)
  );
}

function impossibleSequenceKeys(items) {
  return validateTimeline({ items }).issues
    .filter((issue) => issue.type === "impossible_sequence")
    .map((issue) => `${issue.itemTitle}|${issue.dependency}`);
}

function impossibleSequenceIssues(items) {
  return validateTimeline({ items }).issues
    .filter((issue) => issue.type === "impossible_sequence")
    .map((issue) => ({
      type: "impossible_sequence",
      category: "validation",
      itemTitle: issue.itemTitle,
      dependency: issue.dependency,
      message: issue.message
    }));
}
