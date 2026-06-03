const DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const DEFAULT_MARKDOWN_SECTIONS = ["Timeline", "Milestones", "Next", "Risks And Blockers", "Follow-Ups"];
const SCHEMA_VERSION = "0.2.0";
const METADATA_LINE_PATTERN = /^(?:generated|timezone|time\s*zone|package|version|created|updated|last\s+updated)\s*:/i;
const PROJECT_HEADER_PATTERN = /^project\s*:\s*(.+)$/i;
const NOTE_TABLE_PROFILES = new Set(["estimate_table", "objective_table", "progress_table"]);
const TARGET_NOTE_PATTERN = /\b(?:committed|delivery|deliver|forecast|target|expectation|estimated|completion|complete)\b/i;
const MONTHS = new Map([
  ["jan", "01"],
  ["january", "01"],
  ["feb", "02"],
  ["february", "02"],
  ["mar", "03"],
  ["march", "03"],
  ["apr", "04"],
  ["april", "04"],
  ["may", "05"],
  ["jun", "06"],
  ["june", "06"],
  ["jul", "07"],
  ["july", "07"],
  ["aug", "08"],
  ["august", "08"],
  ["sep", "09"],
  ["sept", "09"],
  ["september", "09"],
  ["oct", "10"],
  ["october", "10"],
  ["nov", "11"],
  ["november", "11"],
  ["dec", "12"],
  ["december", "12"]
]);
const NATURAL_DATE_PATTERN =
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})(?:,\s*\d{1,2}:\d{2}\s*[A-Z]{2,5})?\b/gi;

export function createTimeline(input = {}) {
  const sources = Array.isArray(input.sources) ? input.sources : [];
  const importedAssumptions = [];
  const noiseReport = createNoiseReport();
  const items = sources.flatMap((source, index) =>
    parseSource(source, index, importedAssumptions, input, noiseReport)
  );
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
    diagnostics: noiseReport,
    noise_report: noiseReport,
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
    if (item.exact_date_needed) {
      gaps.push(makeGap(item, "exact_date", "Exact date needed before rendering this fuzzy time window."));
    }

    if (!item.start && !item.time_window) {
      gaps.push(makeGap(item, "start", "Missing start date. Ask for the planned start date instead of inferring it."));
    }

    if (!item.end && !item.duration && !item.time_window && item.type !== "milestone") {
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

function parseSource(source, index, importedAssumptions, input, noiseReport) {
  const normalizedSource = {
    id: source?.id || `source-${index + 1}`,
    type: source?.type || "text",
    profile: source?.profile || "unknown",
    source_system: source?.source_system,
    content: source?.content ?? "",
    path: source?.path || source?.file_path || source?.filePath
  };

  const before = snapshotIgnored(noiseReport);
  let parsed;
  if (normalizedSource.type === "json") {
    parsed = parseJsonSource(normalizedSource, importedAssumptions);
  } else if (normalizedSource.type === "csv") {
    parsed = parseCsvSource(normalizedSource);
  } else if (normalizedSource.type === "markdown") {
    const prepared = {
      ...normalizedSource,
      content: cleanMarkdownForTimeline(normalizedSource.content, {
        profile: normalizedSource.profile
      })
    };
    parsed = parseMarkdownSource(prepared, input?.markdown, noiseReport);
  } else {
    parsed = parseTextSource(normalizedSource, noiseReport);
  }

  noiseReport.sources.push({
    id: normalizedSource.id,
    type: normalizedSource.type,
    profile: normalizedSource.profile,
    source_system: normalizedSource.source_system,
    parsed_items: parsed.length,
    ignored: diffIgnored(before, noiseReport.ignored)
  });
  return parsed;
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

function parseTextSource(source, noiseReport = createNoiseReport()) {
  return String(source.content)
    .split(/\r?\n/)
    .map((line, index) => {
      if (isMetadataLine(line)) {
        noiseReport.ignored.metadata_lines += 1;
        return null;
      }
      return parseTextLine(line, source.id, index + 1);
    })
    .filter(Boolean);
}

function parseMarkdownSource(source, markdownOptions = {}, noiseReport = createNoiseReport()) {
  const lines = String(source.content).split(/\r?\n/);
  const allowedHeadings = getAllowedMarkdownHeadings(markdownOptions);
  const hasAllowedHeadings = markdownHasAllowedHeadings(lines, allowedHeadings);
  const items = [];
  let currentHeading;
  let inFrontmatter = markdownOptions?.ignoreFrontmatter === false ? false : lines[0]?.trim() === "---";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (inFrontmatter) {
      noiseReport.ignored.frontmatter_lines += 1;
      if (index > 0 && trimmed === "---") inFrontmatter = false;
      continue;
    }

    const heading = parseMarkdownHeading(trimmed);
    if (heading) {
      currentHeading = heading;
      continue;
    }

    if (!trimmed) continue;

    if (isMetadataLine(trimmed)) {
      noiseReport.ignored.metadata_lines += 1;
      continue;
    }

    const inAllowedSection = !hasAllowedHeadings || allowedHeadings.has(normalizeHeading(currentHeading));
    if (!inAllowedSection) {
      noiseReport.ignored.prose_lines += 1;
      continue;
    }

    if (isMarkdownTableLine(trimmed)) {
      const table = parseMarkdownTable(lines, index);
      if (!table) {
        noiseReport.ignored.unsupported_table_rows += 1;
        continue;
      }

      for (const row of table.rows) {
        const item = markdownRecordToItem(row.record, currentHeading);
        if (!item) {
          noiseReport.ignored.table_rows_without_dates += row.hasDate ? 0 : 1;
          continue;
        }

        if (!row.hasDate) noiseReport.ignored.table_rows_without_dates += 1;
        items.push(
          normalizeItem(item, [
            compactObject({
              sourceId: source.id,
              path: source.path,
              heading: currentHeading,
              tableRow: row.tableRow,
              line: row.line,
              text: row.text
            })
          ])
        );
      }

      index = table.endIndex;
      continue;
    }

    const parsedLine = parseTextLine(line, source.id, index + 1);
    if (parsedLine) {
      parsedLine.source_refs = parsedLine.source_refs.map((sourceRef) =>
        compactObject({ ...sourceRef, path: source.path, heading: currentHeading })
      );
      items.push(parsedLine);
    } else {
      noiseReport.ignored.prose_lines += 1;
    }
  }

  return items;
}

function parseTextLine(line, sourceId, lineNumber) {
  const trimmed = normalizePlanningLine(normalizeNaturalDateText(line));
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
  if (isMetadataLine(trimmed)) return "";
  if (PROJECT_HEADER_PATTERN.test(trimmed)) return "";

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

function markdownRecordToItem(record, heading) {
  const title =
    valueFromRecord(record, ["item", "follow_up", "follow-up", "followup", "task", "milestone", "risk", "blocker"]) ||
    valueFromRecord(record, ["title", "name"]);
  if (!title) return null;

  const target = valueFromRecord(record, ["target", "date", "when", "time_window", "window"]);
  const dates = extractExactDates(target);
  const fuzzyTarget = target && dates.length === 0 ? target : undefined;

  return {
    title,
    type: normalizeHeading(heading) === "milestones" || record.type === "milestone" ? "milestone" : "task",
    start: dates[0],
    end: dates[1],
    owner: valueFromRecord(record, ["owner", "assignee"]),
    status: valueFromRecord(record, ["status"]) || "planned",
    dependencies: valueFromRecord(record, ["dependencies", "depends_on", "depends on"]),
    time_window: fuzzyTarget,
    date_text: fuzzyTarget,
    exact_date_needed: Boolean(fuzzyTarget),
    confidence: target ? 0.7 : 0.55
  };
}

function normalizeTimeline(timeline = {}) {
  const items = Array.isArray(timeline.items)
    ? timeline.items.map((item) => normalizeItem(item, item.source_refs))
    : [];
  const milestones = items.filter((item) => item.type === "milestone");

  return {
    kind: timeline.kind || "timeline",
    schema_version: timeline.schema_version || SCHEMA_VERSION,
    version: timeline.version || "0.2.0",
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
    time_window: blankToUndefined(item.time_window),
    date_text: blankToUndefined(item.date_text),
    exact_date_needed: Boolean(item.exact_date_needed),
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

function isMetadataLine(line) {
  const trimmed = String(line || "").trim();
  return METADATA_LINE_PATTERN.test(trimmed) || PROJECT_HEADER_PATTERN.test(trimmed);
}

function normalizeNaturalDateText(text = "") {
  return String(text).replace(NATURAL_DATE_PATTERN, (_match, monthName, day, year) => {
    const month = MONTHS.get(String(monthName).toLowerCase());
    if (!month) return _match;
    return `${year}-${month}-${String(day).padStart(2, "0")}`;
  });
}

function cleanMarkdownForTimeline(content = "", { profile = "unknown" } = {}) {
  const lines = String(content).split(/\r?\n/);
  const cleaned = [];
  let currentProject = extractProjectName(content);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const projectMatch = trimmed.match(PROJECT_HEADER_PATTERN);
    if (projectMatch) {
      currentProject = projectMatch[1].trim();
      continue;
    }

    if (METADATA_LINE_PATTERN.test(trimmed)) {
      cleaned.push(line);
      continue;
    }

    if (isMarkdownTableLine(trimmed) && isMarkdownSeparatorLine(lines[index + 1]?.trim())) {
      const table = collectMarkdownTable(lines, index);
      const transformed = transformMarkdownTable(table, { profile, project: currentProject });
      cleaned.push(...(transformed.length > 0 ? transformed : table.lines.map(normalizeNaturalDateText)));
      index = table.endIndex;
      continue;
    }

    cleaned.push(normalizeNaturalDateText(line));
  }

  return cleaned.join("\n");
}

function transformMarkdownTable(table, { profile, project }) {
  if (NOTE_TABLE_PROFILES.has(profile)) {
    return transformProfileNoteTable(table, { project });
  }
  return transformProjectDateTable(table);
}

function transformProfileNoteTable(table, { project }) {
  const headers = parseMarkdownTableCells(table.lines[0]);
  const rows = table.lines.slice(2).map(parseMarkdownTableCells);
  const noteIndex = headers.findIndex((header) =>
    !/^note\s*date$/i.test(header) && /\b(?:note|status|progress|objective|estimate|datetime)\b/i.test(header)
  );
  const chunkIndex = headers.findIndex((header) => /\bchunk\b/i.test(header));
  if (noteIndex === -1 || chunkIndex === -1) return [];

  const titlePrefix = blankToUndefined(project) || "Project";
  const transformedRows = [];
  for (const row of rows) {
    const note = blankToUndefined(row[noteIndex]) || "";
    if (!TARGET_NOTE_PATTERN.test(note)) continue;
    const target = extractFirstDateIso(note);
    if (!target) continue;
    transformedRows.push(formatMarkdownTableRow([`${titlePrefix} ${row[chunkIndex] || "Note"}`, target, "planned"]));
  }

  if (transformedRows.length === 0) return [];
  return [
    formatMarkdownTableRow(["Title", "Target", "Status"]),
    formatMarkdownTableRow(["---", "---", "---"]),
    ...transformedRows
  ];
}

function transformProjectDateTable(table) {
  const headers = parseMarkdownTableCells(table.lines[0]);
  const hasTitle = headers.some((header) => /^(?:project|name|title|item|task|milestone)$/i.test(header.trim()));
  const hasDate = headers.some((header) => /\b(?:estimated\s+datetime|estimated\s+date|completion|complete\s+by|target|target\s+date|date|datetime|when)\b/i.test(header.trim()));
  if (!hasTitle || !hasDate) return [];

  const normalizedHeaders = headers.map((header) => {
    if (/^(?:project|name)$/i.test(header.trim())) return "Title";
    if (/\b(?:estimated\s+datetime|estimated\s+date|completion|complete\s+by|target|target\s+date|date|datetime|when)\b/i.test(header.trim())) return "Target";
    return header;
  });

  return [
    formatMarkdownTableRow(normalizedHeaders),
    table.lines[1],
    ...table.lines.slice(2).map((line) => formatMarkdownTableRow(parseMarkdownTableCells(line).map(normalizeNaturalDateText)))
  ];
}

function collectMarkdownTable(lines, startIndex) {
  const tableLines = [];
  let index = startIndex;
  while (index < lines.length && isMarkdownTableLine(lines[index].trim())) {
    tableLines.push(lines[index]);
    index += 1;
  }
  return { lines: tableLines, endIndex: index - 1 };
}

function formatMarkdownTableRow(cells) {
  return `| ${cells.join(" | ")} |`;
}

function isMarkdownSeparatorLine(line = "") {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
}

function extractProjectName(content = "") {
  for (const line of String(content).split(/\r?\n/)) {
    const match = line.trim().match(PROJECT_HEADER_PATTERN);
    if (match) return match[1].trim();
  }
  return undefined;
}

function extractFirstDateIso(text = "") {
  return normalizeNaturalDateText(text).match(DATE_PATTERN)?.[0];
}

function snapshotIgnored(noiseReport) {
  return { ...noiseReport.ignored };
}

function diffIgnored(before, after) {
  const diff = {};
  for (const key of Object.keys(after)) {
    diff[key] = after[key] - (before[key] ?? 0);
  }
  return diff;
}

function createNoiseReport() {
  return {
    sources: [],
    ignored: {
      frontmatter_lines: 0,
      prose_lines: 0,
      table_rows_without_dates: 0,
      metadata_lines: 0,
      unsupported_table_rows: 0
    },
    warnings: []
  };
}

function getAllowedMarkdownHeadings(options = {}) {
  const sections = Array.isArray(options?.sections) && options.sections.length > 0
    ? options.sections
    : DEFAULT_MARKDOWN_SECTIONS;
  return new Set(sections.map((section) => normalizeHeading(section)));
}

function markdownHasAllowedHeadings(lines, allowedHeadings) {
  return lines.some((line) => {
    const heading = parseMarkdownHeading(line.trim());
    return heading && allowedHeadings.has(normalizeHeading(heading));
  });
}

function parseMarkdownHeading(line) {
  const match = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
  return match ? match[1].trim() : undefined;
}

function normalizeHeading(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isMarkdownTableLine(line) {
  return /^\|.*\|\s*$/.test(line);
}

function parseMarkdownTable(lines, startIndex) {
  const header = parseMarkdownTableCells(lines[startIndex]);
  const separator = parseMarkdownTableCells(lines[startIndex + 1]);
  if (header.length === 0 || !isMarkdownSeparatorRow(separator)) return null;

  const headers = header.map((cell) => normalizeHeader(cell));
  const rows = [];
  let index = startIndex + 2;
  let tableRow = 1;

  while (index < lines.length && isMarkdownTableLine(lines[index].trim())) {
    const cells = parseMarkdownTableCells(lines[index]);
    const record = {};
    headers.forEach((column, columnIndex) => {
      record[column] = cells[columnIndex] ?? "";
    });

    const target = valueFromRecord(record, ["target", "date", "when", "time_window", "window"]);
    rows.push({
      record,
      tableRow,
      line: index + 1,
      text: lines[index].trim(),
      hasDate: extractExactDates(target).length > 0 || Boolean(blankToUndefined(target))
    });
    tableRow += 1;
    index += 1;
  }

  return {
    rows,
    endIndex: index - 1
  };
}

function parseMarkdownTableCells(line = "") {
  const trimmed = String(line).trim();
  if (!isMarkdownTableLine(trimmed)) return [];
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownSeparatorRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function valueFromRecord(record, names) {
  for (const name of names) {
    const normalized = normalizeHeader(name);
    const value = blankToUndefined(record[normalized]);
    if (value) return value;
  }

  return undefined;
}

function extractExactDates(value) {
  return [...String(value || "").matchAll(DATE_PATTERN)].map((match) => match[0]);
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function escapeMermaidText(value) {
  return String(value).replace(/[:#;]/g, "-").trim();
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
