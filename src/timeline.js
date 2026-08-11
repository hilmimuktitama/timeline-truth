export const SCHEMA_VERSION = "0.3.0";
export const EVIDENCE_GRADES = ["exact", "derived", "fuzzy", "missing"];
export const EVIDENCE_DERIVATIONS = ["explicit", "natural", "none"];

const DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DURATION_PATTERN = /^\d+[dwmy]$/;
const DEFAULT_MARKDOWN_SECTIONS = ["Timeline", "Milestones", "Next", "Risks And Blockers", "Follow-Ups"];
const METADATA_LINE_PATTERN =
  /^(?:generated|timezone|time\s*zone|package|version|created|updated|last\s+updated)\s*:/i;
const PROJECT_HEADER_PATTERN = /^project\s*:\s*(.+)$/i;
const NOTE_TABLE_PROFILES = new Set(["estimate_table", "objective_table", "progress_table"]);
const TARGET_NOTE_PATTERN = /\b(?:committed|delivery|deliver|forecast|target|expectation|estimated|completion|complete)\b/i;

const MONTHS = new Map([
  ["jan", "01"], ["january", "01"], ["feb", "02"], ["february", "02"],
  ["mar", "03"], ["march", "03"], ["apr", "04"], ["april", "04"],
  ["may", "05"], ["jun", "06"], ["june", "06"], ["jul", "07"], ["july", "07"],
  ["aug", "08"], ["august", "08"], ["sep", "09"], ["sept", "09"], ["september", "09"],
  ["oct", "10"], ["october", "10"], ["nov", "11"], ["november", "11"],
  ["dec", "12"], ["december", "12"]
]);

const NATURAL_DATE_PATTERN =
  /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(\d{4})(?:,\s*\d{1,2}:\d{2}\s*[A-Z]{2,5})?\b/i;
const NATURAL_DATE_GLOBAL = new RegExp(NATURAL_DATE_PATTERN.source, "gi");

// ISO-form datetime tokens: 2026-06-01T17:00:00, 2026-06-01 17:00.
const DATETIME_TOKEN_PATTERN = /\b(\d{4}-\d{2}-\d{2})[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?([+-]\d{2}:?\d{2}|Z)?/g;
const TIMEZONE_FREE_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?$/;
const TIMEZONE_FREE_DATETIME_TOKEN = /\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?/;
const DATETIME_WITH_TZ_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:Z|[+-]\d{2}:?\d{2}|[A-Z]{2,5})$/i;

// Fields that are never accepted on timeline items: prototype pollution vectors
// and code-execution hints. Matching fields are dropped and reported as issues.
const DANGEROUS_FIELD_NAMES = [
  "__proto__", "prototype", "constructor",
  "eval", "exec", "command", "shell", "script", "spawn",
  "require", "import", "fetch", "child_process", "os"
];

const EVIDENCE_REASONS = {
  exact: "Exact date evidence (YYYY-MM-DD) found in source text.",
  derived: "Date converted deterministically from natural language (for example, 'June 17, 2026').",
  fuzzy: "Fuzzy time window preserved for human review; exact date needed.",
  missing: "No date evidence found; timeline placement needs human follow-up."
};

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
      "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.",
      "Critical path is not computed: it cannot be determined defensibly when dates or durations are missing."
    ],
    gaps: [],
    render: {
      audience: "TPM/PM",
      defaultFormats: ["mermaid_gantt", "mermaid_timeline", "markdown", "review_report"]
    }
  });
  const validation = validateTimeline(timeline);
  const validatedTimeline = {
    ...timeline,
    gaps: validation.gaps,
    issues: validation.issues
  };
  const followups = buildFollowups(validatedTimeline);

  return {
    timeline: validatedTimeline,
    assumptions: validatedTimeline.assumptions,
    gaps: validatedTimeline.gaps,
    issues: validation.issues,
    followups,
    noise_report: noiseReport,
    diagnostics: noiseReport,
    renders: {
      mermaid_gantt: renderTimeline(validatedTimeline, { format: "mermaid_gantt" }),
      mermaid_timeline: renderTimeline(validatedTimeline, { format: "mermaid_timeline" }),
      markdown: renderTimeline(validatedTimeline, { format: "markdown" }),
      review_report: renderTimeline(validatedTimeline, { format: "review_report" })
    }
  };
}

export function validateTimeline(timeline = {}) {
  const normalized = normalizeTimeline(timeline);
  const gaps = [];
  const issues = [];

  for (const item of normalized.items) {
    if (item.missing_title) {
      issues.push(makeIssue({
        type: "missing_title",
        severity: "error",
        itemTitle: item.title,
        message: `Item has no title; it was normalized to "${item.title}".`
      }));
    }

    for (const field of item.dangerous_fields) {
      issues.push(makeIssue({
        type: "unsupported_dangerous_field",
        severity: "error",
        itemTitle: item.title,
        field,
        message: `Unsupported field "${field}" was dropped from item "${item.title}".`
      }));
    }

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
      const ownerQuestion = item.type === "milestone"
        ? "Milestone ownership is ambiguous."
        : "Missing accountable owner.";
      gaps.push(makeGap(item, "owner", ownerQuestion));
    }

    if (item.start && !isRealCalendarDate(item.start)) {
      issues.push(makeIssue({
        type: "invalid_date",
        severity: "error",
        itemTitle: item.title,
        field: "start",
        value: item.start,
        message: `Start date "${item.start}" is not a real calendar date.`
      }));
    }

    if (item.end && !isRealCalendarDate(item.end)) {
      issues.push(makeIssue({
        type: "invalid_date",
        severity: "error",
        itemTitle: item.title,
        field: "end",
        value: item.end,
        message: `End date "${item.end}" is not a real calendar date.`
      }));
    }

    if (item.date_text && TIMEZONE_FREE_DATETIME_PATTERN.test(item.date_text)) {
      issues.push(makeIssue({
        type: "timezone_free_datetime",
        severity: "error",
        itemTitle: item.title,
        value: item.date_text,
        message: `Datetime "${item.date_text}" has a time-of-day but no timezone and was rejected for scheduling. Use a date-only value or a timezone (Z or ±HH:MM).`
      }));
    }

    if (item.duration && !DURATION_PATTERN.test(item.duration)) {
      issues.push(makeIssue({
        type: "malformed_duration",
        severity: "error",
        itemTitle: item.title,
        value: item.duration,
        message: `Duration "${item.duration}" is malformed; expected a number with one of d, w, m, y (for example "5d").`
      }));
    }

    const uniqueDependencies = [...new Set(item.dependencies)];
    if (uniqueDependencies.length !== item.dependencies.length) {
      const duplicates = item.dependencies.filter(
        (dependency, index) => item.dependencies.indexOf(dependency) !== index
      );
      issues.push(makeIssue({
        type: "duplicate_dependencies",
        severity: "warning",
        itemTitle: item.title,
        value: [...new Set(duplicates)].join(", "),
        message: `Item "${item.title}" lists duplicate dependencies: ${[...new Set(duplicates)].join(", ")}.`
      }));
    }

    if (item.start && item.end && isRealCalendarDate(item.start) && isRealCalendarDate(item.end) && item.start > item.end) {
      issues.push(makeIssue({
        type: "start_after_end",
        severity: "error",
        itemTitle: item.title,
        field: "range",
        value: `${item.start} to ${item.end}`,
        message: `Item "${item.title}" starts (${item.start}) after it ends (${item.end}).`
      }));
    }
  }

  const idCounts = new Map();
  for (const item of normalized.items) {
    idCounts.set(item.id, (idCounts.get(item.id) || 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      issues.push(makeIssue({
        type: "duplicate_id",
        severity: "warning",
        itemTitle: id,
        value: String(count),
        message: `${count} items share the id "${id}". Use unique ids for reliable diffing.`
      }));
    }
  }

  for (const item of normalized.items) {
    for (const dependency of item.dependencies) {
      if (!normalized.items.some((candidate) => candidate.title === dependency)) {
        const suggestions = suggestDependencyTitles(normalized.items, dependency);
        issues.push(makeIssue({
          type: "unknown_dependency",
          severity: "warning",
          itemTitle: item.title,
          dependency,
          suggestions,
          message: `Dependency "${dependency}" was not found in the timeline.`
        }));
      }
    }
  }

  const cycles = findDependencyCycles(normalized.items);
  for (const cycle of cycles) {
    issues.push(makeIssue({
      type: "circular_dependency",
      severity: "error",
      items: cycle,
      message: `Circular dependency detected: ${cycle.join(" -> ")}.`
    }));
  }

  for (const item of normalized.items) {
    for (const dependencyTitle of item.dependencies) {
      const dependency = normalized.items.find((candidate) => candidate.title === dependencyTitle);
      if (
        dependency?.end &&
        item.start &&
        isRealCalendarDate(dependency.end) &&
        isRealCalendarDate(item.start) &&
        item.start < dependency.end
      ) {
        issues.push(makeIssue({
          type: "impossible_sequence",
          severity: "warning",
          itemTitle: item.title,
          dependency: dependencyTitle,
          message: `"${item.title}" starts before dependency "${dependencyTitle}" ends.`
        }));
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

  if (format === "review_report") {
    return renderReviewReport(normalized);
  }

  return renderMermaidGantt(normalized);
}

export function refineTimeline(timeline = {}, refinement = {}) {
  const refined = normalizeTimeline(structuredCloneSafe(timeline));
  const updates = Array.isArray(refinement.updates) ? refinement.updates : [];

  for (const update of updates) {
    if (!update.matchTitle && !update.matchId) {
      throw new Error('Each refine update requires "matchTitle" or "matchId" to identify the target item.');
    }

    const item = refined.items.find((candidate) => {
      if (update.matchTitle) return candidate.title === update.matchTitle;
      return candidate.id === update.matchId;
    });

    if (!item) {
      const matcher = update.matchTitle
        ? `matchTitle "${update.matchTitle}"`
        : `matchId "${update.matchId}"`;
      throw new Error(`Refine update did not match any timeline item (${matcher}).`);
    }
    if (!update.set || typeof update.set !== "object") {
      throw new Error('Each refine update requires a "set" object describing the changes to apply.');
    }

    const preservedSourceRefs = item.source_refs;
    const mergedItem = { ...item, ...update.set };

    // A refinement that sets exact dates clears stale fuzzy state, and a
    // refinement that sets a fuzzy window clears stale exact dates, so the two
    // states can never coexist after an edit. Fields the update explicitly
    // replaces are kept as given.
    if ("start" in update.set || "end" in update.set) {
      if (!("time_window" in update.set)) delete mergedItem.time_window;
      if (!("date_text" in update.set)) delete mergedItem.date_text;
      if (!("exact_date_needed" in update.set)) delete mergedItem.exact_date_needed;
    }
    if ("time_window" in update.set) {
      if (!("start" in update.set)) delete mergedItem.start;
      if (!("end" in update.set)) delete mergedItem.end;
      if (!("exact_date_needed" in update.set)) mergedItem.exact_date_needed = true;
    }

    // Date-affecting updates invalidate stale provenance so the evidence grade
    // is recomputed from the new evidence. evidence_grade and evidence_reason
    // are always recomputed by normalization; callers cannot override them.
    if (["start", "end", "time_window", "date_text"].some((key) => key in update.set)) {
      delete mergedItem.date_derivation;
    }
    delete mergedItem.evidence_grade;
    delete mergedItem.evidence_reason;

    Object.assign(item, normalizeItem(mergedItem, update.set.source_refs ?? preservedSourceRefs));
  }

  const validation = validateTimeline(refined);
  return {
    ...normalizeTimeline(refined),
    gaps: validation.gaps,
    issues: validation.issues
  };
}

export function normalizeTimeline(timeline = {}) {
  const items = Array.isArray(timeline.items)
    ? timeline.items.map((item) => normalizeItem(item, item.source_refs))
    : [];
  const milestones = items.filter((item) => item.type === "milestone");

  return {
    kind: timeline.kind || "timeline",
    schema_version: timeline.schema_version || SCHEMA_VERSION,
    version: timeline.version || SCHEMA_VERSION,
    items,
    milestones,
    assumptions: Array.isArray(timeline.assumptions) ? [...timeline.assumptions] : [],
    gaps: Array.isArray(timeline.gaps) ? [...timeline.gaps] : [],
    issues: Array.isArray(timeline.issues) ? [...timeline.issues] : [],
    render: timeline.render && typeof timeline.render === "object" ? { ...timeline.render } : {}
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
    parsed = parseJsonSource(normalizedSource, importedAssumptions, noiseReport.warnings);
  } else if (normalizedSource.type === "csv") {
    parsed = parseCsvSource(normalizedSource);
  } else if (normalizedSource.type === "markdown") {
    parsed = parseMarkdownSource(normalizedSource, input?.markdown, noiseReport);
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

function parseJsonSource(source, importedAssumptions, warnings = null) {
  let parsed;
  try {
    parsed = typeof source.content === "string" ? JSON.parse(source.content) : source.content;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to parse JSON source "${source.id}": ${detail}`);
  }
  const rawItems = Array.isArray(parsed) ? parsed : parsed.items ?? [];

  if (Array.isArray(parsed.assumptions)) {
    importedAssumptions.push(...parsed.assumptions.filter((assumption) => typeof assumption === "string"));
  }

  return rawItems.map((item, index) =>
    normalizeItem(item, item.source_refs ?? [{ source_id: source.id, line: index + 1 }], warnings)
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

    return normalizeItem(csvRecordToItem(record), [{ source_id: source.id, line: index + 2 }]);
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
      const parsedLine = parseTextLine(line, source.id, index + 1);
      if (!parsedLine) return null;
      // Prefer the source path as the locator base when one is available.
      parsedLine.source_refs = parsedLine.source_refs.map((sourceRef) =>
        compactObject({
          ...sourceRef,
          locator: deriveLocator({
            sourceId: source.id,
            path: source.path,
            line: sourceRef.line
          }),
          path: source.path
        })
      );
      return parsedLine;
    })
    .filter(Boolean);
}

function parseMarkdownSource(source, markdownOptions = {}, noiseReport = createNoiseReport()) {
  const lines = String(source.content).split(/\r?\n/);
  const allowedHeadings = getAllowedMarkdownHeadings(markdownOptions);
  const hasAllowedHeadings = markdownHasAllowedHeadings(lines, allowedHeadings);
  const items = [];
  let currentHeading;
  let currentProject = extractProjectName(source.content);
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

    // Track the active project for profiled table transforms; the header line
    // itself is never a timeline item and is dropped silently.
    const projectMatch = trimmed.match(PROJECT_HEADER_PATTERN);
    if (projectMatch) {
      currentProject = projectMatch[1].trim();
      continue;
    }

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

      const transformedRows = transformMarkdownTableRows(table, {
        profile: source.profile,
        project: currentProject
      });

      for (const row of transformedRows) {
        const hasDate = rowHasDate(row.record);
        const item = markdownRecordToItem(row.record, currentHeading);
        if (!item) {
          noiseReport.ignored.table_rows_without_dates += hasDate ? 0 : 1;
          continue;
        }

        if (!hasDate) noiseReport.ignored.table_rows_without_dates += 1;
        items.push(
          normalizeItem(item, [
            compactObject({
              source_id: source.id,
              locator: deriveLocator({
                sourceId: source.id,
                path: source.path,
                line: row.line,
                tableRow: row.tableRow,
                heading: currentHeading
              }),
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
        compactObject({
          ...sourceRef,
          locator: deriveLocator({
            sourceId: source.id,
            path: source.path,
            line: sourceRef.line,
            heading: currentHeading
          }),
          path: source.path,
          heading: currentHeading
        })
      );
      items.push(parsedLine);
    } else {
      noiseReport.ignored.prose_lines += 1;
    }
  }

  return items;
}

function parseTextLine(line, sourceId, lineNumber) {
  const original = String(line);
  const trimmed = normalizePlanningLine(original);
  if (!trimmed) return null;

  const hadNaturalDate = NATURAL_DATE_PATTERN.test(trimmed);
  const textWithTzDates = normalizeDatetimeTokens(trimmed);
  const normalized = normalizeNaturalDateText(textWithTzDates);
  const rejectedDatetime = normalized.match(TIMEZONE_FREE_DATETIME_TOKEN);
  const dates = rejectedDatetime ? [] : [...normalized.matchAll(DATE_PATTERN)].map((match) => match[0]);

  const lower = normalized.toLowerCase();
  const type = lower.includes("milestone") ? "milestone" : "task";
  const title = extractTitle(normalized, type);
  const owner = extractKeywordValue(normalized, "owner");
  const status = extractKeywordValue(normalized, "status") || "planned";
  const dependencies = extractDependencies(normalized);
  const duration = extractDuration(normalized);

  // Provenance is recorded here, before normalization rewrites natural dates
  // to YYYY-MM-DD, so the evidence grade stays stable through re-normalization.
  let dateDerivation = "none";
  if (rejectedDatetime) {
    dateDerivation = "none";
  } else if (hadNaturalDate) {
    dateDerivation = "natural";
  } else if (dates.length > 0) {
    dateDerivation = "explicit";
  }

  const item = {
    title,
    type,
    start: rejectedDatetime ? undefined : dates[0],
    end: rejectedDatetime ? undefined : dates[1],
    duration,
    owner,
    status,
    dependencies,
    date_text: rejectedDatetime ? rejectedDatetime[0] : undefined,
    date_derivation: dateDerivation
  };

  return normalizeItem(item, [{ source_id: sourceId, line: lineNumber, text: trimmed }]);
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
    dependencies: record.dependencies || record.depends_on
  };
}

function markdownRecordToItem(record, heading) {
  const title =
    valueFromRecord(record, ["item", "follow_up", "follow-up", "followup", "task", "milestone", "risk", "blocker"]) ||
    valueFromRecord(record, ["title", "name"]);
  if (!title) return null;

  const target = valueFromRecord(record, ["target", "date", "when", "time_window", "window"]);
  const textWithTzDates = normalizeDatetimeTokens(String(target || ""));
  const naturalText = normalizeNaturalDateText(textWithTzDates);
  const dates = extractExactDates(naturalText);
  const rejectedDatetime = naturalText.match(TIMEZONE_FREE_DATETIME_TOKEN);
  const fuzzyTarget = target && dates.length === 0 && !rejectedDatetime ? target : undefined;

  // Record how the target evidence was obtained before normalization rewrites
  // natural dates, so the evidence grade is deterministic through re-runs.
  let dateDerivation = "none";
  if (rejectedDatetime) {
    dateDerivation = "none";
  } else if (dates.length > 0 && NATURAL_DATE_PATTERN.test(String(target || ""))) {
    dateDerivation = "natural";
  } else if (dates.length > 0) {
    dateDerivation = "explicit";
  }

  return {
    title,
    type: normalizeHeading(heading) === "milestones" || record.type === "milestone" ? "milestone" : "task",
    start: rejectedDatetime ? undefined : dates[0],
    end: rejectedDatetime ? undefined : dates[1],
    owner: valueFromRecord(record, ["owner", "assignee"]),
    status: valueFromRecord(record, ["status"]) || "planned",
    dependencies: valueFromRecord(record, ["dependencies", "depends_on", "depends on"]),
    time_window: fuzzyTarget,
    date_text: rejectedDatetime ? rejectedDatetime[0] : fuzzyTarget,
    exact_date_needed: Boolean(fuzzyTarget),
    date_derivation: dateDerivation
  };
}

function normalizeItem(item = {}, sourceRefs = [], warnings = null) {
  const dependencies = Array.isArray(item.dependencies)
    ? item.dependencies
    : typeof item.dependencies === "string"
      ? item.dependencies.split(/[|,;]/)
      : [];

  const startRaw = blankToUndefined(item.start);
  const endRaw = blankToUndefined(item.end);
  const startRejected = startRaw !== undefined && TIMEZONE_FREE_DATETIME_PATTERN.test(startRaw);
  const endRejected = endRaw !== undefined && TIMEZONE_FREE_DATETIME_PATTERN.test(endRaw);
  const start = startRejected ? undefined : normalizeDateValue(startRaw);
  const end = endRejected ? undefined : normalizeDateValue(endRaw);
  const timeWindow = blankToUndefined(item.time_window);
  const dateText = startRejected ? startRaw : endRejected ? endRaw : blankToUndefined(item.date_text);
  const rejected = startRejected || endRejected || (dateText !== undefined && TIMEZONE_FREE_DATETIME_PATTERN.test(dateText));
  // Provenance survives re-normalization (start/end are already YYYY-MM-DD by
  // then) and keeps derived grades stable. A caller-supplied evidence_grade is
  // never trusted: the grade is always recomputed from the normalized evidence.
  const dateDerivation = deriveDateProvenance(item, { startRaw, endRaw });
  const evidenceGrade = computeEvidenceGrade({ timeWindow, dateText, rejected, dateDerivation });
  const rawTitle = blankToUndefined(item.title);
  // Preserve an explicit flag from a previous normalization pass: re-normalizing
  // an already-normalized item must not lose the fact that the source had no title.
  const missingTitle = typeof item.missing_title === "boolean"
    ? item.missing_title
    : rawTitle === undefined;
  // Same for dangerous fields: they are detected on the raw source item, and
  // re-normalizing a normalized item must not silently lose the report.
  const dangerousFields = Array.isArray(item.dangerous_fields) && item.dangerous_fields.length > 0
    ? item.dangerous_fields
    : detectDangerousFields(item);

  return {
    id: item.id || slugify(rawTitle || "untitled"),
    title: rawTitle ?? "Untitled",
    type: item.type === "milestone" ? "milestone" : "task",
    start,
    end,
    duration: blankToUndefined(item.duration),
    time_window: timeWindow,
    date_text: dateText,
    exact_date_needed: Boolean(timeWindow !== undefined && start === undefined && end === undefined),
    owner: blankToUndefined(item.owner),
    status: blankToUndefined(item.status) || "unknown",
    dependencies: dependencies.map((dependency) => String(dependency).trim()).filter(Boolean),
    date_derivation: dateDerivation,
    evidence_grade: evidenceGrade,
    evidence_reason: evidenceReasonFor(evidenceGrade, { rejected }),
    missing_title: missingTitle,
    dangerous_fields: dangerousFields,
    source_refs: normalizeSourceRefs(sourceRefs, warnings)
  };
}

function computeEvidenceGrade({ timeWindow, dateText, rejected, dateDerivation }) {
  if (rejected) return "missing";
  if (dateDerivation === "explicit") return "exact";
  if (dateDerivation === "natural") return "derived";
  if (timeWindow !== undefined || dateText !== undefined) return "fuzzy";
  return "missing";
}

// Deterministic provenance: explicit (YYYY-MM-DD or timezone-bearing
// datetime), natural (natural-language date converted by the fixed algorithm),
// or none. A previous normalization pass already rewrote dates to YYYY-MM-DD,
// so a valid date_derivation is preserved; fresh raw evidence is classified
// from its original form before normalization rewrites it.
function deriveDateProvenance(item, { startRaw, endRaw }) {
  if (EVIDENCE_DERIVATIONS.includes(item.date_derivation)) return item.date_derivation;
  if (isExplicitDate(startRaw) || isExplicitDate(endRaw)) return "explicit";
  if (isNaturalDate(startRaw) || isNaturalDate(endRaw)) return "natural";
  return "none";
}

function evidenceReasonFor(grade, { rejected = false } = {}) {
  if (grade === "missing" && rejected) {
    return "Timezone-free datetime rejected; the date was not used for placement.";
  }
  return EVIDENCE_REASONS[grade] || EVIDENCE_REASONS.missing;
}

function isExplicitDate(value) {
  if (value === undefined || value === null) return false;
  return ISO_DATE_PATTERN.test(String(value).trim()) || DATETIME_WITH_TZ_PATTERN.test(String(value).trim());
}

function isNaturalDate(value) {
  if (value === undefined || value === null) return false;
  return NATURAL_DATE_PATTERN.test(String(value));
}

function detectDangerousFields(item) {
  return Object.keys(item || {}).filter((key) => DANGEROUS_FIELD_NAMES.includes(key));
}

function normalizeDateValue(value) {
  const trimmed = blankToUndefined(value);
  if (trimmed === undefined) return undefined;
  const asString = String(trimmed).trim();
  if (ISO_DATE_PATTERN.test(asString)) return asString;
  const withTz = asString.match(
    /^(\d{4}-\d{2}-\d{2})[T ]\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?\s*(?:Z|[+-]\d{2}:?\d{2}|[A-Z]{2,5})$/i
  );
  if (withTz) return withTz[1];
  return normalizeNaturalDateText(asString);
}

function normalizeDatetimeTokens(text = "") {
  return String(text).replace(DATETIME_TOKEN_PATTERN, (match, datePart, timezone) =>
    timezone ? datePart : match
  );
}

function normalizeNaturalDateText(text = "") {
  return String(text).replace(NATURAL_DATE_GLOBAL, (_match, monthName, day, year) => {
    const month = MONTHS.get(String(monthName).toLowerCase());
    if (!month) return _match;
    return `${year}-${month}-${String(day).padStart(2, "0")}`;
  });
}

// Canonical SourceRef fields (truth-tools contracts, Draft 2020-12). Fields
// outside this set are dropped when normalizing input references.
const SOURCE_REF_FIELDS = new Set([
  "source_id", "locator", "note", "path", "url", "observed_at",
  "source_updated_at", "revision", "content_hash",
  "heading", "tableRow", "line", "text"
]);

// Normalizes raw source references to the canonical SourceRef contract:
// required source_id + locator, with Timeline Truth provenance passthrough
// (path, heading, tableRow, line, text). The deprecated legacy "sourceId"
// field is accepted and converted explicitly; plain-string references are also
// accepted and converted. A deprecation warning is emitted (when a collector
// is supplied) so callers can surface the migration.
function normalizeSourceRefs(sourceRefs, warnings = null) {
  const refs = [];
  for (const raw of Array.isArray(sourceRefs) ? sourceRefs : []) {
    let entry = raw;
    if (typeof raw === "string") {
      if (warnings) warnings.push(`Deprecated plain-string source reference "${raw}"; use { "source_id": "${raw}", "locator": "<pointer>" }.`);
      entry = { source_id: raw };
    }
    if (!entry || typeof entry !== "object") continue;

    if (Object.hasOwn(entry, "sourceId") && !Object.hasOwn(entry, "source_id")) {
      if (warnings) warnings.push(`Deprecated "sourceId" on a source reference; use "source_id" (value "${String(entry.sourceId)}").`);
    }
    const sourceId = blankToUndefined(entry.source_id) ?? blankToUndefined(entry.sourceId);
    if (sourceId === undefined) continue;

    refs.push(compactObject({
      source_id: sourceId,
      locator: blankToUndefined(entry.locator) ?? deriveLocator({
        sourceId,
        path: entry.path,
        line: entry.line,
        tableRow: entry.tableRow,
        heading: entry.heading
      }),
      note: blankToUndefined(entry.note),
      path: blankToUndefined(entry.path),
      url: blankToUndefined(entry.url),
      observed_at: blankToUndefined(entry.observed_at),
      source_updated_at: blankToUndefined(entry.source_updated_at),
      revision: entry.revision === undefined ? undefined : entry.revision,
      content_hash: blankToUndefined(entry.content_hash),
      heading: blankToUndefined(entry.heading),
      tableRow: positiveInteger(entry.tableRow),
      line: positiveInteger(entry.line),
      text: blankToUndefined(entry.text)
    }));
  }
  return refs;
}

// Deterministic concrete pointer: the source path when available (falling back
// to the stable source id), suffixed with the finest location available (line,
// then table row, then heading). Preserves the original source location while
// keeping the locator stable for the same evidence.
function deriveLocator({ sourceId, path, line, tableRow, heading }) {
  const base = blankToUndefined(path) || blankToUndefined(sourceId);
  if (base === undefined) return undefined;
  if (positiveInteger(line) !== undefined) return `${base}:${line}`;
  if (positiveInteger(tableRow) !== undefined) return `${base}:row ${tableRow}`;
  if (blankToUndefined(heading) !== undefined) return `${base}#${heading}`;
  return base;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value >= 1 ? value : undefined;
}

function makeGap(item, field, question) {
  return {
    itemTitle: item.title,
    field,
    question,
    source_refs: item.source_refs
  };
}

function makeIssue(issue) {
  return issue;
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

function suggestDependencyTitles(items, dependency) {
  const dependencyKey = normalizeDependencyKey(dependency);
  if (!dependencyKey) return [];

  return items
    .filter((item) => {
      const titleKey = normalizeDependencyKey(item.title);
      const idKey = normalizeDependencyKey(item.id);
      return titleKey === dependencyKey || idKey === dependencyKey;
    })
    .map((item) => item.title)
    .slice(0, 3);
}

function normalizeDependencyKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function renderMermaidGantt(timeline) {
  const lines = ["gantt", "  title Project Timeline", "  dateFormat YYYY-MM-DD", "  axisFormat %b %d", "  section Plan"];

  for (const item of timeline.items) {
    const label = escapeMermaidText(`${item.title}${item.owner ? ` (${item.owner})` : ""}`);
    const status = escapeMermaidText(item.status || "unknown");
    if (item.type === "milestone" && item.start) {
      lines.push(`  ${label} :milestone, ${item.start}, 0d`);
    } else if (item.start && item.end) {
      lines.push(`  ${label} :${status}, ${item.start}, ${item.end}`);
    } else if (item.start && item.duration) {
      lines.push(`  ${label} :${status}, ${item.start}, ${item.duration}`);
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

function renderReviewReport(timeline) {
  const followups = buildFollowups(timeline);
  const lines = ["## Timeline Review", "", "### Items"];

  for (const item of timeline.items) {
    const window = item.start ? `${item.start}${item.end ? ` to ${item.end}` : item.duration ? ` for ${item.duration}` : ""}` : item.time_window || "date needed";
    lines.push(`- **${item.title}** (${item.type}, ${item.status}) - ${window}${item.owner ? ` - owner: ${item.owner}` : ""}`);
    lines.push(`  - Evidence: ${item.evidence_grade} - ${item.evidence_reason}`);
    if (item.source_refs.length > 0) {
      lines.push(`  - Source: ${formatSourceRef(item.source_refs[0])}`);
    }
  }

  if (timeline.gaps.length > 0) {
    lines.push("", "### Follow-Up Questions");
    for (const followup of followups.all) {
      lines.push(`- ${followup.itemTitle}${followup.owner ? ` (${followup.owner})` : ""}: ${followup.question}`);
    }
  }

  if (timeline.issues.length > 0) {
    lines.push("", "### Issues");
    for (const issue of timeline.issues) {
      const suggestions = issue.suggestions?.length ? ` Suggestions: ${issue.suggestions.join(", ")}.` : "";
      lines.push(`- ${issue.severity}: ${issue.message}${suggestions}`);
    }
  }

  if (timeline.assumptions.length > 0) {
    lines.push("", "### Assumptions");
    for (const assumption of timeline.assumptions) {
      lines.push(`- ${assumption}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildFollowups(timeline) {
  const byTitle = new Map(timeline.items.map((item) => [item.title, item]));
  const gapFollowups = timeline.gaps.map((gap) => {
    const item = byTitle.get(gap.itemTitle);
    return {
      itemTitle: gap.itemTitle,
      field: gap.field,
      owner: item?.owner,
      question: gap.question,
      source_refs: gap.source_refs
    };
  });
  const dependencyFollowups = timeline.issues
    .filter((issue) => issue.type === "unknown_dependency")
    .map((issue) => {
      const item = byTitle.get(issue.itemTitle);
      const suggestions = issue.suggestions?.length
        ? ` Did you mean ${issue.suggestions.join(", ")}?`
        : "";
      return {
        itemTitle: issue.itemTitle,
        field: "dependency",
        dependency: issue.dependency,
        owner: item?.owner,
        question: `Confirm the dependency "${issue.dependency}" or add it to the timeline.${suggestions}`,
        source_refs: item?.source_refs ?? []
      };
    });
  const all = [...gapFollowups, ...dependencyFollowups];
  const dateFollowups = all.filter((followup) => ["start", "end", "exact_date"].includes(followup.field));

  return {
    all,
    by_field: groupBy(all, (followup) => followup.field),
    by_owner: groupBy(all, (followup) => followup.owner || "Unassigned"),
    by_date: groupBy(dateFollowups, (followup) => followup.field),
    by_dependency: groupBy(dependencyFollowups, (followup) => followup.dependency)
  };
}

function groupBy(values, keyFn) {
  return values.reduce((groups, value) => {
    const key = keyFn(value);
    groups[key] = groups[key] || [];
    groups[key].push(value);
    return groups;
  }, {});
}

function formatSourceRef(sourceRef) {
  const parts = [sourceRef.source_id || sourceRef.sourceId];
  if (sourceRef.path) parts.push(sourceRef.path);
  if (sourceRef.heading) parts.push(`heading "${sourceRef.heading}"`);
  if (sourceRef.line) parts.push(`line ${sourceRef.line}`);
  return parts.filter(Boolean).join(", ");
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

function isRealCalendarDate(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

// Transforms are applied to parsed table rows so every item keeps its original
// source position: line, 1-based tableRow, and the original raw row text.
function transformMarkdownTableRows(table, { profile, project }) {
  if (NOTE_TABLE_PROFILES.has(profile)) {
    const rows = transformProfileNoteTableRows(table, { project });
    return rows ?? table.rows;
  }
  const rows = transformProjectDateTableRows(table);
  return rows ?? table.rows;
}

function transformProfileNoteTableRows(table, { project }) {
  const headers = parseMarkdownTableCells(table.lines[0]);
  const noteIndex = headers.findIndex((header) =>
    !/^note\s*date$/i.test(header) && /\b(?:note|status|progress|objective|estimate|datetime)\b/i.test(header)
  );
  const chunkIndex = headers.findIndex((header) => /\bchunk\b/i.test(header));
  if (noteIndex === -1 || chunkIndex === -1) return null;

  const titlePrefix = blankToUndefined(project) || "Project";
  const noteKey = normalizeHeader(headers[noteIndex]);
  const chunkKey = normalizeHeader(headers[chunkIndex]);
  const transformed = [];

  for (const row of table.rows) {
    const note = blankToUndefined(row.record[noteKey]) || "";
    if (!TARGET_NOTE_PATTERN.test(note)) continue;
    const target = extractFirstNaturalDateText(note);
    if (!target) continue;
    transformed.push({
      record: {
        title: `${titlePrefix} ${row.record[chunkKey] || "Note"}`,
        target,
        status: "planned"
      },
      tableRow: row.tableRow,
      line: row.line,
      text: row.text
    });
  }

  return transformed.length > 0 ? transformed : null;
}

function transformProjectDateTableRows(table) {
  const headers = parseMarkdownTableCells(table.lines[0]);
  const hasTitle = headers.some((header) => /^(?:project|name|title|item|task|milestone)$/i.test(header.trim()));
  const hasDate = headers.some((header) =>
    /\b(?:estimated\s+datetime|estimated\s+date|completion|complete\s+by|target|target\s+date|date|datetime|when)\b/i.test(header.trim())
  );
  if (!hasTitle || !hasDate) return null;

  const renamedKeys = headers.map((header) => {
    if (/^(?:project|name)$/i.test(header.trim())) return "title";
    if (/\b(?:estimated\s+datetime|estimated\s+date|completion|complete\s+by|target|target\s+date|date|datetime|when)\b/i.test(header.trim())) return "target";
    return normalizeHeader(header);
  });
  const normalizedKeys = headers.map((cell) => normalizeHeader(cell));

  return table.rows.map((row) => ({
    ...row,
    record: Object.fromEntries(
      normalizedKeys.map((key, columnIndex) => [renamedKeys[columnIndex], row.record[key]])
    )
  }));
}

function rowHasDate(record) {
  const target = valueFromRecord(record, ["target", "date", "when", "time_window", "window"]);
  return extractExactDates(target).length > 0 || Boolean(blankToUndefined(target));
}

function extractProjectName(content = "") {
  for (const line of String(content).split(/\r?\n/)) {
    const match = line.trim().match(PROJECT_HEADER_PATTERN);
    if (match) return match[1].trim();
  }
  return undefined;
}

function extractFirstNaturalDateText(text = "") {
  const match = String(text).match(NATURAL_DATE_PATTERN);
  return match ? match[0] : extractFirstDateIso(text);
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
  const tableLines = [lines[startIndex], lines[startIndex + 1]];
  let index = startIndex + 2;
  let tableRow = 1;

  while (index < lines.length && isMarkdownTableLine(lines[index].trim())) {
    tableLines.push(lines[index]);
    const cells = parseMarkdownTableCells(lines[index]);
    const record = {};
    headers.forEach((column, columnIndex) => {
      record[column] = cells[columnIndex] ?? "";
    });

    rows.push({
      record,
      tableRow,
      line: index + 1,
      text: lines[index].trim()
    });
    tableRow += 1;
    index += 1;
  }

  return {
    rows,
    lines: tableLines,
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
  // Mermaid uses colons, hashes, semicolons, and commas as syntax separators
  // in gantt/timeline labels; replacing them keeps the render parseable.
  return String(value).replace(/[:#;,]/g, "-").trim();
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}
