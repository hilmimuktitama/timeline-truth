const DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;

export function createTimeline(input = {}) {
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const importedAssumptions = [];
  const items = sources.flatMap((source, index) => parseSource(source, index, importedAssumptions));
  const timeline = normalizeTimeline({
    items,
    assumptions: [
      ...importedAssumptions,
      "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up."
    ],
    gaps: [],
    render: {
      audience: "TPM/PM",
      defaultFormats: ["mermaid_gantt", "mermaid_timeline", "markdown"]
    }
  });
  const validation = validateTimeline(timeline);
  const validatedTimeline = {
    ...timeline,
    gaps: validation.gaps,
    issues: validation.issues
  };

  return {
    timeline: validatedTimeline,
    assumptions: validatedTimeline.assumptions,
    gaps: validatedTimeline.gaps,
    issues: validation.issues,
    renders: {
      mermaid_gantt: renderTimeline(validatedTimeline, { format: "mermaid_gantt" }),
      mermaid_timeline: renderTimeline(validatedTimeline, { format: "mermaid_timeline" }),
      markdown: renderTimeline(validatedTimeline, { format: "markdown" })
    }
  };
}

export function validateTimeline(timeline = {}) {
  const normalized = normalizeTimeline(timeline);
  const gaps = [];
  const issues = [];

  for (const item of normalized.items) {
    if (!item.start) {
      gaps.push(makeGap(item, "start", "Missing start date. Ask for the planned start date instead of inferring it."));
    }

    if (!item.end && !item.duration && item.type !== "milestone") {
      gaps.push(makeGap(item, "end", "Missing end date or duration for a non-milestone item."));
    }

    if (!item.owner) {
      gaps.push(makeGap(item, "owner", "Missing accountable owner."));
    }

    if (item.type === "milestone" && !item.owner) {
      gaps.push(makeGap(item, "owner", "Milestone ownership is ambiguous."));
    }
  }

  for (const item of normalized.items) {
    for (const dependency of item.dependencies) {
      if (!normalized.items.some((candidate) => candidate.title === dependency)) {
        issues.push({
          type: "unknown_dependency",
          severity: "warning",
          itemTitle: item.title,
          dependency,
          message: `Dependency "${dependency}" was not found in the timeline.`
        });
      }
    }
  }

  const cycles = findDependencyCycles(normalized.items);
  for (const cycle of cycles) {
    issues.push({
      type: "circular_dependency",
      severity: "error",
      items: cycle,
      message: `Circular dependency detected: ${cycle.join(" -> ")}.`
    });
  }

  for (const item of normalized.items) {
    for (const dependencyTitle of item.dependencies) {
      const dependency = normalized.items.find((candidate) => candidate.title === dependencyTitle);
      if (dependency?.end && item.start && item.start < dependency.end) {
        issues.push({
          type: "impossible_sequence",
          severity: "warning",
          itemTitle: item.title,
          dependency: dependencyTitle,
          message: `"${item.title}" starts before dependency "${dependencyTitle}" ends.`
        });
      }
    }
  }

  return { gaps, issues };
}

export function renderTimeline(timeline = {}, options = {}) {
  const normalized = normalizeTimeline(timeline);
  const format = options.format ?? "mermaid_gantt";

  if (format === "mermaid_timeline") {
    return renderMermaidTimeline(normalized);
  }

  if (format === "markdown") {
    return renderMarkdown(normalized);
  }

  return renderMermaidGantt(normalized);
}

export function refineTimeline(timeline = {}, refinement = {}) {
  const refined = normalizeTimeline(structuredCloneSafe(timeline));
  const updates = Array.isArray(refinement.updates) ? refinement.updates : [];

  for (const update of updates) {
    const item = refined.items.find((candidate) => {
      if (update.matchTitle) return candidate.title === update.matchTitle;
      if (update.matchId) return candidate.id === update.matchId;
      return false;
    });

    if (!item || !update.set || typeof update.set !== "object") continue;

    const preservedSourceRefs = item.source_refs;
    const mergedItem = { ...item, ...update.set };
    Object.assign(item, normalizeItem(mergedItem, update.set.source_refs ?? preservedSourceRefs));
  }

  const validation = validateTimeline(refined);
  return {
    ...normalizeTimeline(refined),
    gaps: validation.gaps,
    issues: validation.issues
  };
}

function parseSource(source, index, importedAssumptions) {
  const normalizedSource = {
    id: source?.id || `source-${index + 1}`,
    type: source?.type || "text",
    content: source?.content ?? ""
  };

  if (normalizedSource.type === "json") {
    return parseJsonSource(normalizedSource, importedAssumptions);
  }

  if (normalizedSource.type === "csv") {
    return parseCsvSource(normalizedSource);
  }

  return parseTextSource(normalizedSource);
}

function parseJsonSource(source, importedAssumptions) {
  const parsed = typeof source.content === "string" ? JSON.parse(source.content) : source.content;
  const rawItems = Array.isArray(parsed) ? parsed : parsed.items ?? [];

  if (Array.isArray(parsed.assumptions)) {
    importedAssumptions.push(...parsed.assumptions.filter((assumption) => typeof assumption === "string"));
  }

  return rawItems.map((item, index) =>
    normalizeItem(item, item.source_refs ?? [{ sourceId: source.id, line: index + 1 }])
  );
}

function parseCsvSource(source) {
  const rows = parseCsv(source.content);
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => normalizeHeader(header));
  return rows.slice(1).flatMap((row, index) => {
    if (row.every((cell) => cell.trim() === "")) return [];

    const record = {};
    headers.forEach((header, headerIndex) => {
      record[header] = row[headerIndex] ?? "";
    });

    return normalizeItem(csvRecordToItem(record), [{ sourceId: source.id, line: index + 2 }]);
  });
}

function parseTextSource(source) {
  return String(source.content)
    .split(/\r?\n/)
    .map((line, index) => parseTextLine(line, source.id, index + 1))
    .filter(Boolean);
}

function parseTextLine(line, sourceId, lineNumber) {
  const trimmed = normalizePlanningLine(line);
  if (!trimmed) return null;

  const dates = [...trimmed.matchAll(DATE_PATTERN)].map((match) => match[0]);
  const lower = trimmed.toLowerCase();
  const type = lower.includes("milestone") ? "milestone" : "task";
  const title = extractTitle(trimmed, type);
  const owner = extractKeywordValue(trimmed, "owner");
  const status = extractKeywordValue(trimmed, "status") || "planned";
  const dependencies = extractDependencies(trimmed);
  const duration = extractDuration(trimmed);
  const item = {
    title,
    type,
    start: dates[0],
    end: dates[1],
    duration,
    owner,
    status,
    dependencies,
    confidence: dates.length > 0 ? 0.75 : 0.45
  };

  return normalizeItem(item, [{ sourceId, line: lineNumber, text: trimmed }]);
}

function normalizePlanningLine(line) {
  const trimmed = String(line).trim();
  if (/^#{1,6}\s+/.test(trimmed)) return "";

  return trimmed
    .replace(/^[-*]\s+\[[ xX]\]\s+/, "")
    .replace(/^[-*]\s+/, "");
}

function extractTitle(line, type) {
  const colonIndex = line.indexOf(":");
  if (colonIndex > 0) return cleanTitle(line.slice(0, colonIndex));

  const milestoneMatch = line.match(/^(.+?)\s+milestone\b/i);
  if (milestoneMatch) return cleanTitle(milestoneMatch[1]);

  const dateMatch = line.match(DATE_PATTERN);
  if (dateMatch?.index && dateMatch.index > 0) return cleanTitle(line.slice(0, dateMatch.index));

  const ownerIndex = line.search(/\sowner\b/i);
  if (ownerIndex > 0) return cleanTitle(line.slice(0, ownerIndex));

  return cleanTitle(type === "milestone" ? line.replace(/\bmilestone\b/gi, "") : line);
}

function cleanTitle(title) {
  return title
    .replace(/\b(starts?|start|from|on|by|duration|depends on|owner|status)\b.*$/i, "")
    .trim()
    .replace(/[.:-]+$/g, "")
    .trim();
}

function extractKeywordValue(line, keyword) {
  const pattern = new RegExp(`\\b${keyword}\\s+([^,;]+?)(?=\\s+(?:status|owner|depends? on|duration|starts?|from|on)\\b|$)`, "i");
  const match = line.match(pattern);
  return match ? match[1].trim() : undefined;
}

function extractDependencies(line) {
  const match = line.match(/\bdepends? on\s+(.+?)(?=\s+(?:owner|status|duration|starts?|from|on)\b|$)/i);
  if (!match) return [];

  return match[1]
    .split(/[|,;]/)
    .map((dependency) => dependency.trim())
    .filter(Boolean);
}

function extractDuration(line) {
  const match = line.match(/\bduration\s+(\d+\s*[dwmy])\b/i);
  return match ? match[1].replace(/\s+/g, "") : undefined;
}

function csvRecordToItem(record) {
  return {
    title: record.title || record.name || record.task || record.milestone,
    type: record.type,
    start: record.start || record.start_date,
    end: record.end || record.end_date,
    duration: record.duration,
    owner: record.owner || record.assignee,
    status: record.status,
    dependencies: record.dependencies || record.depends_on,
    confidence: record.confidence ? Number(record.confidence) : undefined
  };
}

function normalizeTimeline(timeline = {}) {
  const items = Array.isArray(timeline.items)
    ? timeline.items.map((item) => normalizeItem(item, item.source_refs))
    : [];
  const milestones = items.filter((item) => item.type === "milestone");

  return {
    items,
    milestones,
    assumptions: Array.isArray(timeline.assumptions) ? [...timeline.assumptions] : [],
    gaps: Array.isArray(timeline.gaps) ? [...timeline.gaps] : [],
    render: timeline.render && typeof timeline.render === "object" ? { ...timeline.render } : {}
  };
}

function normalizeItem(item = {}, sourceRefs = []) {
  const dependencies = Array.isArray(item.dependencies)
    ? item.dependencies
    : typeof item.dependencies === "string"
      ? item.dependencies.split(/[|,;]/)
      : [];

  return {
    id: item.id || slugify(item.title || "untitled"),
    title: String(item.title || "Untitled").trim(),
    type: item.type === "milestone" ? "milestone" : "task",
    start: blankToUndefined(item.start),
    end: blankToUndefined(item.end),
    duration: blankToUndefined(item.duration),
    owner: blankToUndefined(item.owner),
    status: blankToUndefined(item.status) || "unknown",
    dependencies: dependencies.map((dependency) => String(dependency).trim()).filter(Boolean),
    confidence: typeof item.confidence === "number" ? item.confidence : 0.6,
    source_refs: normalizeSourceRefs(sourceRefs)
  };
}

function normalizeSourceRefs(sourceRefs) {
  return Array.isArray(sourceRefs)
    ? sourceRefs.map((sourceRef) => ({ ...sourceRef }))
    : [];
}

function makeGap(item, field, question) {
  return {
    itemTitle: item.title,
    field,
    question,
    source_refs: item.source_refs
  };
}

function findDependencyCycles(items) {
  const byTitle = new Map(items.map((item) => [item.title, item]));
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycles = [];

  function visit(title) {
    if (visiting.has(title)) {
      const cycleStart = stack.indexOf(title);
      cycles.push([...stack.slice(cycleStart), title]);
      return;
    }

    if (visited.has(title)) return;

    const item = byTitle.get(title);
    if (!item) return;

    visiting.add(title);
    stack.push(title);

    for (const dependency of item.dependencies) {
      visit(dependency);
    }

    stack.pop();
    visiting.delete(title);
    visited.add(title);
  }

  for (const item of items) {
    visit(item.title);
  }

  return dedupeCycles(cycles);
}

function dedupeCycles(cycles) {
  const seen = new Set();
  return cycles.filter((cycle) => {
    const key = [...new Set(cycle)].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderMermaidGantt(timeline) {
  const lines = ["gantt", "  title Project Timeline", "  dateFormat YYYY-MM-DD", "  axisFormat %b %d", "  section Plan"];

  for (const item of timeline.items) {
    const label = escapeMermaidText(`${item.title}${item.owner ? ` (${item.owner})` : ""}`);
    if (item.type === "milestone" && item.start) {
      lines.push(`  ${label} :milestone, ${item.start}, 0d`);
    } else if (item.start && item.end) {
      lines.push(`  ${label} :${item.status || "unknown"}, ${item.start}, ${item.end}`);
    } else if (item.start && item.duration) {
      lines.push(`  ${label} :${item.status || "unknown"}, ${item.start}, ${item.duration}`);
    } else {
      lines.push(`  %% ${label} omitted from chart: missing defensible date or duration`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderMermaidTimeline(timeline) {
  const lines = ["timeline", "  title Project Timeline"];

  for (const item of timeline.items) {
    if (!item.start) {
      lines.push(`  ${escapeMermaidText("Unscheduled")} : ${escapeMermaidText(item.title)}`);
      continue;
    }

    lines.push(`  ${item.start} : ${escapeMermaidText(item.title)}`);
  }

  return `${lines.join("\n")}\n`;
}

function renderMarkdown(timeline) {
  const lines = ["## Timeline", ""];

  for (const item of timeline.items) {
    const window = item.start ? `${item.start}${item.end ? ` to ${item.end}` : item.duration ? ` for ${item.duration}` : ""}` : "date needed";
    lines.push(`- **${item.title}** (${item.type}, ${item.status}) - ${window}${item.owner ? ` - owner: ${item.owner}` : ""}`);
  }

  if (timeline.gaps.length > 0) {
    lines.push("", "## Gaps");
    for (const gap of timeline.gaps) {
      lines.push(`- ${gap.itemTitle}: ${gap.field} - ${gap.question}`);
    }
  }

  if (timeline.assumptions.length > 0) {
    lines.push("", "## Assumptions");
    for (const assumption of timeline.assumptions) {
      lines.push(`- ${assumption}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < String(content).length; index += 1) {
    const character = String(content)[index];
    const next = String(content)[index + 1];

    if (character === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => value !== ""));
}

function normalizeHeader(header) {
  return String(header).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function blankToUndefined(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized === "" ? undefined : normalized;
}

function escapeMermaidText(value) {
  return String(value).replace(/[:#;]/g, "-").trim();
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
