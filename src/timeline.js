export const SCHEMA_VERSION = "0.4.0";
export const EVIDENCE_GRADES = ["exact", "derived", "fuzzy", "missing"];
export const EVIDENCE_DERIVATIONS = ["explicit", "natural", "none"];

const DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DURATION_PATTERN = /^\d+[dwmy]$/;
const MAX_CONTRACT_STRING_LENGTH = 2048;
const MAX_DEPENDENCIES = 50;
const MAX_SOURCE_REFS = 20;
const MAX_WARNINGS = 50;
const MAX_ASSUMPTIONS = 100;
const MAX_CONTAINER_ENTRIES = 100;
const MAX_CONTAINER_DEPTH = 8;
const MAX_ITEMS = 100;
const MAX_DANGEROUS_FIELDS = 50;
const SOURCE_METADATA_WARNING = "Invalid or credential-bearing SourceRef metadata was omitted.";
const CONTAINER_LIMIT_WARNING = "Evidence container exceeded the runtime safety bounds and was omitted.";
const UNSAFE_ITEM_METADATA_WARNING = "Unsafe item metadata was omitted from the canonical timeline item.";
const DEFAULT_MARKDOWN_SECTIONS = ["Timeline", "Milestones", "Next", "Risks And Blockers", "Follow-Ups"];
const MANDATORY_ASSUMPTIONS = [
  "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.",
  "Critical path is not computed: it cannot be determined defensibly when dates or durations are missing."
];
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
  input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const noiseReport = createNoiseReport();
  const sources = Array.isArray(input.sources) ? input.sources.slice(0, MAX_CONTAINER_ENTRIES) : [];
  if (Array.isArray(input.sources) && input.sources.length > MAX_CONTAINER_ENTRIES) {
    addWarning(noiseReport.warnings, CONTAINER_LIMIT_WARNING);
  }
  const importedAssumptions = [];
  const items = sources.flatMap((source, index) =>
    parseSource(source, index, importedAssumptions, input, noiseReport)
  );
  const timeline = normalizeTimeline({
    items,
    assumptions: normalizeAssumptions(importedAssumptions, noiseReport.warnings),
    gaps: [],
    render: {
      audience: "TPM/PM",
      defaultFormats: ["mermaid_gantt", "mermaid_timeline", "markdown", "review_report"]
    }
  });
  appendWarnings(noiseReport.warnings, timeline.warnings);
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
        message: `Duration value is invalid; expected a positive integer followed by one of d, w, m, y (for example "5d").`
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

  return { gaps, issues, warnings: normalized.warnings };
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
  timeline = timeline && typeof timeline === "object" && !Array.isArray(timeline) ? timeline : {};
  const warnings = [];
  const schemaVersion = normalizeContractVersion(timeline.schema_version, "schema_version", warnings);
  const artifactVersion = normalizeContractVersion(timeline.version, "version", warnings);
  const rawItems = Array.isArray(timeline.items) ? timeline.items.slice(0, MAX_ITEMS) : [];
  if (Array.isArray(timeline.items) && timeline.items.length > rawItems.length) {
    addWarning(warnings, CONTAINER_LIMIT_WARNING);
  }
  const items = rawItems.map((item) => normalizeItem(
    item,
    item && typeof item === "object" && !Array.isArray(item) ? item.source_refs : [],
    warnings
  ));
  const milestones = items.filter((item) => item.type === "milestone");

  return {
    kind: normalizeItemKind(timeline.kind, warnings) || "timeline",
    schema_version: schemaVersion,
    version: artifactVersion,
    items,
    milestones,
    assumptions: normalizeStringContainer(timeline.assumptions, warnings, MAX_ASSUMPTIONS),
    gaps: normalizeEvidenceContainers(timeline.gaps, warnings),
    issues: normalizeEvidenceContainers(timeline.issues, warnings),
    render: normalizeRenderContainer(timeline.render, warnings),
    warnings
  };
}

function parseSource(source, index, importedAssumptions, input, noiseReport) {
  const normalizedSource = {
    id: safeSourceId(source?.id, `source-${index + 1}`),
    type: ["text", "json", "csv", "markdown"].includes(source?.type) ? source.type : "text",
    profile: safeSourceSystem(source?.profile, noiseReport.warnings) || "unknown",
    source_system: safeSourceSystem(source?.source_system, noiseReport.warnings),
    content: source?.content === undefined ? "" : source.content,
    path: firstSafeSourcePath(
      [source?.path, source?.file_path, source?.filePath],
      noiseReport.warnings
    )
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
  const isJsonContainer = Array.isArray(parsed) || (parsed !== null && typeof parsed === "object");
  if (!isJsonContainer) {
    addWarning(warnings, "JSON source did not contain an object or array; an empty timeline was produced.");
    return [];
  }

  const rawItems = Array.isArray(parsed) ? parsed : parsed.items ?? [];
  const boundedItems = Array.isArray(rawItems) ? rawItems.slice(0, MAX_ITEMS) : [];
  if (Array.isArray(rawItems) && rawItems.length > boundedItems.length) {
    addWarning(warnings, CONTAINER_LIMIT_WARNING);
  }

  if (!Array.isArray(parsed)) {
    importedAssumptions.push(...normalizeStringContainer(parsed.assumptions, warnings, MAX_ASSUMPTIONS));
  }

  return boundedItems.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      addWarning(warnings, "JSON source contained a non-object timeline item; it was omitted.", true);
      return [];
    }
    return [normalizeItem(item, item.source_refs ?? [{ source_id: source.id, line: index + 1 }], warnings)];
  });
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
  item = item && typeof item === "object" && !Array.isArray(item) ? item : {};
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
  const detectedDangerousFields = detectDangerousFields(item);
  const suppliedDangerousFields = Array.isArray(item.dangerous_fields) ? item.dangerous_fields : [];
  // Detected keys are placed first so a bounded supplied list can never hide a
  // dangerous key present on the raw item (especially exec/code-execution keys).
  const dangerousFields = normalizeDangerousFields(suppliedDangerousFields, warnings, detectedDangerousFields);
  const normalizedKind = normalizeItemKind(item.kind, warnings);
  const type = item.type === "milestone" || normalizedKind === "milestone" ? "milestone" : "task";

  return {
    id: boundedText(item.id || slugify(rawTitle || "untitled")),
    title: boundedText(rawTitle ?? "Untitled"),
    type,
    start,
    end,
    duration: boundedText(item.duration),
    time_window: boundedText(timeWindow),
    date_text: boundedText(dateText),
    exact_date_needed: Boolean(timeWindow !== undefined && start === undefined && end === undefined),
    owner: boundedText(item.owner),
    status: boundedText(item.status) || "unknown",
    dependencies: dependencies
      .map((dependency) => boundedText(dependency))
      .filter(Boolean)
      .slice(0, MAX_DEPENDENCIES),
    date_derivation: dateDerivation,
    evidence_grade: evidenceGrade,
    evidence_reason: boundedText(evidenceReasonFor(evidenceGrade, { rejected })),
    missing_title: missingTitle,
    dangerous_fields: dangerousFields,
    source_refs: normalizeSourceRefs(sourceRefs, warnings).slice(0, MAX_SOURCE_REFS)
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

function normalizeItemKind(value, warnings) {
  const raw = blankToUndefined(value);
  if (raw === undefined) return undefined;
  if (isUnsafeContractString(raw)) {
    addWarning(warnings, UNSAFE_ITEM_METADATA_WARNING, true);
    return undefined;
  }
  return boundedText(raw);
}

function normalizeDangerousFields(values, warnings, requiredValues = []) {
  const bounded = values.slice(0, MAX_DANGEROUS_FIELDS);
  if (values.length > bounded.length) addWarning(warnings, CONTAINER_LIMIT_WARNING);
  const seen = new Set();
  const normalizeValue = (value) => {
    if (typeof value !== "string") return [];
    const raw = blankToUndefined(value);
    if (raw === undefined) return [];
    if (isRawEvidenceKey(raw) || isUnsafeContractString(raw)) {
      addWarning(warnings, UNSAFE_ITEM_METADATA_WARNING, true);
      return [];
    }
    const normalized = boundedText(raw);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [normalized];
  };
  return [
    ...requiredValues.flatMap(normalizeValue),
    ...bounded.flatMap(normalizeValue)
  ].slice(0, MAX_DANGEROUS_FIELDS);
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
// outside this set are dropped when normalizing input references. `text` is
// accepted only as legacy input and is never copied to canonical output.
const SOURCE_REF_FIELDS = new Set([
  "source_id", "locator", "note", "path", "url", "observed_at",
  "source_updated_at", "revision", "content_hash",
  "heading", "tableRow", "line"
]);

// Normalizes raw source references to the canonical SourceRef contract:
// required source_id + locator, with Timeline Truth provenance passthrough
// (path, heading, tableRow, line). The deprecated legacy "sourceId" field is
// accepted and converted explicitly; plain-string references are also
// accepted and converted. Raw legacy evidence is stripped and warned about.
function normalizeSourceRefs(sourceRefs, warnings = null) {
  const refs = [];
  const boundedSourceRefs = Array.isArray(sourceRefs) ? sourceRefs.slice(0, MAX_SOURCE_REFS) : [];
  if (Array.isArray(sourceRefs) && sourceRefs.length > MAX_SOURCE_REFS) {
    addWarning(warnings, CONTAINER_LIMIT_WARNING);
  }
  for (const raw of boundedSourceRefs) {
    let entry = raw;
    if (typeof raw === "string") {
      addWarning(warnings, "Deprecated plain-string source reference was normalized; use a structured locator reference.");
      entry = { source_id: raw };
    }
    if (!entry || typeof entry !== "object") continue;

    if (hasRawEvidenceKey(entry)) {
      addRawEvidenceWarning(warnings);
    }

    if (Object.hasOwn(entry, "sourceId") && !Object.hasOwn(entry, "source_id")) {
      addWarning(warnings, "Deprecated sourceId field on a source reference was normalized; use source_id.");
    }
    const sourceId = safeSourceId(blankToUndefined(entry.source_id) ?? blankToUndefined(entry.sourceId));
    if (sourceId === undefined) continue;

    const path = firstSafeSourcePath(
      [entry.path, entry.file_path, entry.filePath],
      warnings
    );
    const rawLocator = blankToUndefined(entry.locator);
    const locator = safeLocator(rawLocator) ?? deriveLocator({
      sourceId, path, line: entry.line, tableRow: entry.tableRow, heading: entry.heading
    });
    if (rawLocator !== undefined && safeLocator(rawLocator) === undefined && warnings) {
      addWarning(warnings, "Credential-bearing URL in a source reference was omitted; a safe locator was used when available.");
    }
    if (locator === undefined) continue;

    refs.push(compactObject({
      source_id: boundedText(sourceId),
      locator: boundedText(locator),
      note: safeSourceNote(entry.note, warnings),
      path,
      url: normalizeSafeUrl(entry.url, warnings),
      observed_at: safeSourceDateTime(entry.observed_at, warnings),
      source_updated_at: safeSourceDateTime(entry.source_updated_at, warnings),
      revision: safeSourceRevision(entry.revision, warnings),
      content_hash: safeContentHash(entry.content_hash, warnings),
      heading: safeSourceHeading(entry.heading, warnings),
      tableRow: positiveInteger(entry.tableRow),
      line: positiveInteger(entry.line),
    }));
  }
  return refs;
}

// Deterministic concrete pointer: the source path when available (falling back
// to the stable source id), suffixed with the finest location available (line,
// then table row, then heading). Preserves the original source location while
// keeping the locator stable for the same evidence.
function deriveLocator({ sourceId, path, line, tableRow, heading }) {
  const base = safeSourcePath(path) || safeSourceId(sourceId);
  if (base === undefined) return undefined;
  if (positiveInteger(line) !== undefined) return `${base}:${line}`;
  if (positiveInteger(tableRow) !== undefined) return `${base}:row ${tableRow}`;
  const safeHeading = safeSourceHeading(heading);
  if (safeHeading !== undefined) return `${base}#${safeHeading}`;
  return base;
}

// Canonical projections must not carry credential-bearing HTTP(S) pointers.
// Non-URL locators remain valid paths, keys, and stable source ids.
function safeLocator(value) {
  const raw = blankToUndefined(value);
  if (raw === undefined) return undefined;
  return containsUnsafeSourceText(raw) ? undefined : boundedText(raw);
}

function safeHttpUrl(value) {
  const raw = blankToUndefined(value);
  if (raw === undefined || containsUnsafeHttpUrl(raw)) return undefined;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function boundedText(value, maxLength = MAX_CONTRACT_STRING_LENGTH) {
  const normalized = blankToUndefined(value);
  return normalized === undefined
    ? undefined
    : normalized.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim().slice(0, maxLength);
}

function normalizeSafeUrl(value, warnings) {
  const raw = blankToUndefined(value);
  const safe = safeHttpUrl(raw);
  if (raw !== undefined && safe === undefined && warnings) {
    addWarning(warnings, "Credential-bearing or invalid source URL was omitted from the canonical reference.");
  }
  return safe === undefined ? undefined : boundedText(safe);
}

function safeSourcePath(value) {
  const raw = blankToUndefined(value);
  return raw === undefined || containsUnsafeSourceText(raw) ? undefined : boundedText(raw);
}

function safeSourceHeading(value, warnings = null) {
  const raw = blankToUndefined(value);
  if (raw === undefined) return undefined;
  if (containsUnsafeSourceText(raw)) {
    addWarning(warnings, SOURCE_METADATA_WARNING, true);
    return undefined;
  }
  return boundedText(raw);
}

function safeSourceId(value, fallback = undefined) {
  const raw = blankToUndefined(value);
  if (raw === undefined) return fallback;
  return containsUnsafeSourceText(raw) ? fallback : boundedText(raw);
}

const MAX_URL_DECODE_LAYERS = 8;
const SUSPICIOUS_URL_DECODE_LAYERS = 4;
const RAW_EVIDENCE_KEYS = new Set([
  "text", "source_excerpt", "source_text", "source_body", "body", "content",
  "contents", "source_content", "raw", "raw_text", "raw_body", "raw_content",
  "rawcontent", "raw_contents", "raw_excerpt", "excerpt", "verbatim",
  "evidence_text", "evidence_excerpt", "evidence_content", "original_text",
  "original_body", "original_content",
  "sourceexcerpt", "sourcetext", "sourcebody", "sourcecontent", "rawtext",
  "rawbody", "rawexcerpt", "evidencetext", "evidenceexcerpt", "evidencecontent",
  "originaltext", "originalbody", "originalcontent"
]);
const RAW_EVIDENCE_WARNING = "Raw evidence content was omitted from a canonical evidence container.";
const UNSAFE_NOTE_PATTERN = /\b(?:source[_ -]?(?:excerpt|text|body)|raw[_ -]?(?:text|body|content)|verbatim|evidence[_ -]?(?:excerpt|text))\b|[\r\n]|\b(?:authorization|bearer|basic)\s+[A-Za-z0-9+/=_-]{8,}\b/i;
const CREDENTIAL_ASSIGNMENT_PATTERN = /(?:^|[?&#;\s"'([{,])([^?&#;\s"'<>:=,]+)\s*[:=]/g;
const CREDENTIAL_KEY_NAMES = new Set([
  "api_key", "x_api_key", "authorization", "auth", "password", "secret",
  "session_id", "signature", "sig", "token", "access_token", "refresh_token",
  "aws_access_key_id", "client_assertion", "access_key", "cookie"
]);
const CREDENTIAL_KEY_COMPONENTS = new Set([
  "authorization", "auth", "password", "secret", "token", "session", "cookie", "sig", "signature"
]);

function normalizeContractVersion(value, field, warnings) {
  if (value !== undefined && value !== null && String(value) !== SCHEMA_VERSION) {
    addWarning(warnings, `Legacy ${field} metadata was replaced with the current contract version for compatibility.`);
  }
  return SCHEMA_VERSION;
}

function hasRawEvidenceKey(value) {
  return Object.keys(value || {}).some((key) => isRawEvidenceKey(key));
}

function isRawEvidenceKey(key) {
  const normalized = normalizeEvidenceKey(key);
  return RAW_EVIDENCE_KEYS.has(normalized);
}

function normalizeEvidenceKey(key) {
  return String(key)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[\s.-]+/g, "_");
}

function addRawEvidenceWarning(warnings) {
  addWarning(warnings, RAW_EVIDENCE_WARNING, true);
}

function addWarning(warnings, warning, dedupe = false) {
  if (!Array.isArray(warnings) || warnings.length >= MAX_WARNINGS) return;
  if (dedupe && warnings.includes(warning)) return;
  warnings.push(warning);
}

function appendWarnings(target, source) {
  if (!Array.isArray(source)) return;
  for (const warning of source) {
    if (target.length >= MAX_WARNINGS) break;
    target.push(warning);
  }
}

function safeSourceSystem(value, warnings) {
  const raw = blankToUndefined(value);
  if (raw === undefined) return undefined;
  if (containsUnsafeHttpUrl(raw) || containsCredentialAssignment(raw) || UNSAFE_NOTE_PATTERN.test(raw)) {
    addRawEvidenceWarning(warnings);
    return undefined;
  }
  return boundedText(raw);
}

function firstSafeSourcePath(values, warnings) {
  for (const value of values) {
    const raw = blankToUndefined(value);
    if (raw === undefined) continue;
    const safe = safeSourcePath(raw);
    if (safe !== undefined) return safe;
    addRawEvidenceWarning(warnings);
  }
  return undefined;
}

function safeSourceNote(value, warnings) {
  const raw = blankToUndefined(value);
  if (raw === undefined) return undefined;
  if (containsUnsafeHttpUrl(raw) || containsCredentialAssignment(raw) || UNSAFE_NOTE_PATTERN.test(raw)) {
    addRawEvidenceWarning(warnings);
    return undefined;
  }
  return boundedText(raw);
}

const RFC3339_DATETIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;
const SHA256_PATTERN = /^(?:sha256:)?[a-f0-9]{64}$/;

function safeSourceDateTime(value, warnings) {
  const raw = blankToUndefined(value);
  if (raw === undefined) return undefined;
  const match = raw?.match(RFC3339_DATETIME_PATTERN);
  const validClock = match && Number(match[2]) <= 23 && Number(match[3]) <= 59 && Number(match[4]) <= 59;
  const validOffset = match?.[5] === "Z" || (Number(match?.[6]) <= 23 && Number(match?.[7]) <= 59);
  if (containsUnsafeHttpUrl(raw) || containsCredentialAssignment(raw) ||
      !match || !validClock || !validOffset || !isRealCalendarDate(match[1])) {
    addWarning(warnings, SOURCE_METADATA_WARNING, true);
    return undefined;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    addWarning(warnings, SOURCE_METADATA_WARNING, true);
    return undefined;
  }
  return boundedText(raw);
}

function safeSourceRevision(value, warnings) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const raw = blankToUndefined(value);
    if (raw !== undefined && !containsUnsafeHttpUrl(raw) && !containsCredentialAssignment(raw)) {
      return boundedText(raw);
    }
  }
  addWarning(warnings, SOURCE_METADATA_WARNING, true);
  return undefined;
}

function safeContentHash(value, warnings) {
  const raw = blankToUndefined(value);
  if (raw === undefined) return undefined;
  if (SHA256_PATTERN.test(raw) && !containsUnsafeHttpUrl(raw) && !containsCredentialAssignment(raw)) {
    return raw;
  }
  addWarning(warnings, SOURCE_METADATA_WARNING, true);
  return undefined;
}

function decodeUriToFixpoint(value) {
  let decoded = String(value);
  let layers = 0;
  for (; layers < MAX_URL_DECODE_LAYERS; layers += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded.replace(/\+/g, " "));
    } catch {
      return { value: decoded, layers, excessive: false };
    }
    if (next === decoded) return { value: decoded, layers, excessive: false };
    decoded = next;
  }

  try {
    return {
      value: decoded,
      layers,
      excessive: decodeURIComponent(decoded.replace(/\+/g, " ")) !== decoded
    };
  } catch {
    return { value: decoded, layers, excessive: false };
  }
}

function containsUnsafeHttpUrl(value, seen = new Set()) {
  const raw = blankToUndefined(value);
  if (raw === undefined || seen.has(raw)) return false;
  seen.add(raw);
  const decoded = decodeUriToFixpoint(raw);
  if (decoded.excessive) return true;
  if (isUnsafeHttpUrl(raw, seen) || isUnsafeHttpUrl(decoded.value, seen)) return true;
  if (decoded.layers >= SUSPICIOUS_URL_DECODE_LAYERS && /https?:\/\//i.test(decoded.value)) return true;
  for (const match of decoded.value.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    if (isUnsafeHttpUrl(match[0].replace(/[),.;]+$/, ""), seen)) return true;
  }
  return false;
}

function isUnsafeHttpUrl(value, seen = new Set()) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (url.username || url.password) return true;
    const keys = [
      ...url.searchParams.keys(),
      ...String(url.hash).split(/[&#;#\s?]+/).map((part) => part.split("=", 1)[0])
    ];
    const nestedValues = [...url.searchParams.values(), String(url.hash)];
    return keys.some((key) => isCredentialKey(key)) ||
      nestedValues.some((part) => containsUnsafeHttpUrl(part, seen));
  } catch {
    return false;
  }
}

function isCredentialKey(value) {
  const decoded = decodeUriToFixpoint(String(value || "").trim());
  if (decoded.excessive) return true;
  const key = normalizeCredentialKey(decoded.value);
  return CREDENTIAL_KEY_NAMES.has(key) ||
    key.split("_").filter(Boolean).some((part) => CREDENTIAL_KEY_COMPONENTS.has(part));
}

function normalizeCredentialKey(value) {
  return String(value)
    .replace(/^[\[({]+|[\])}]+$/g, "")
    // Preserve acronym boundaries: AWSAccessKeyId -> aws_access_key_id.
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function containsCredentialAssignment(value) {
  const candidates = [String(value), decodeUriToFixpoint(value).value];
  return candidates.some((candidate) => {
    for (const match of candidate.matchAll(CREDENTIAL_ASSIGNMENT_PATTERN)) {
      if (isCredentialKey(match[1])) return true;
    }
    return false;
  });
}

function normalizeStringContainer(values, warnings, maxEntries) {
  if (!Array.isArray(values)) return [];
  const bounded = values.slice(0, maxEntries);
  if (values.length > bounded.length) addWarning(warnings, CONTAINER_LIMIT_WARNING);
  return bounded.flatMap((value) => {
    if (typeof value !== "string") return [];
    const normalized = boundedText(value);
    if (!normalized) return [];
    if (isUnsafeContractString(normalized)) {
      addWarning(warnings, "Unsafe assumption string was omitted from canonical timeline metadata.", true);
      return [];
    }
    return [normalized];
  });
}

function isUnsafeContractString(value) {
  return UNSAFE_NOTE_PATTERN.test(value) || containsCredentialAssignment(value) || containsUnsafeHttpUrl(value);
}

function containsUnsafeSourceText(value) {
  const raw = String(value);
  return /[\u0000-\u001f\u007f-\u009f]/.test(raw) ||
    containsUnsafeHttpUrl(raw) ||
    containsCredentialAssignment(raw);
}

function normalizeAssumptions(importedAssumptions, warnings) {
  const mandatory = normalizeStringContainer(MANDATORY_ASSUMPTIONS, warnings, MANDATORY_ASSUMPTIONS.length);
  const imported = normalizeStringContainer(importedAssumptions, warnings, MAX_ASSUMPTIONS)
    .filter((assumption) => !mandatory.includes(assumption));
  const availableSlots = Math.max(0, MAX_ASSUMPTIONS - mandatory.length);
  if (imported.length > availableSlots) addWarning(warnings, CONTAINER_LIMIT_WARNING);
  // Keep imported assumptions in their original order, but reserve the final
  // slots for mandatory assumptions so they cannot be crowded out by imports.
  return [...imported.slice(0, availableSlots), ...mandatory];
}

function normalizeRenderContainer(value, warnings) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return normalizeEvidenceValue(value, warnings);
}

function normalizeEvidenceContainers(containers, warnings) {
  if (!Array.isArray(containers)) return [];
  const bounded = containers.slice(0, MAX_CONTAINER_ENTRIES);
  if (containers.length > bounded.length) addWarning(warnings, CONTAINER_LIMIT_WARNING);
  return bounded.flatMap((container) => {
    if (container === null || container === undefined) return [];
    const normalized = normalizeEvidenceValue(container, warnings);
    return normalized === null || normalized === undefined ? [] : [normalized];
  });
}

function normalizeEvidenceValue(value, warnings, depth = 0, ancestors = new Set()) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return boundedText(value);
  if (typeof value !== "object") return value;
  if (depth >= MAX_CONTAINER_DEPTH || ancestors.has(value)) {
    addWarning(warnings, CONTAINER_LIMIT_WARNING);
    return undefined;
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  if (Array.isArray(value)) {
    const bounded = value.slice(0, MAX_CONTAINER_ENTRIES);
    if (value.length > bounded.length) addWarning(warnings, CONTAINER_LIMIT_WARNING);
    return bounded
      .map((entry) => normalizeEvidenceValue(entry, warnings, depth + 1, nextAncestors))
      .filter((entry) => entry !== undefined && entry !== null);
  }

  const normalized = {};
  let entryCount = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    if (entryCount >= MAX_CONTAINER_ENTRIES) {
      addWarning(warnings, CONTAINER_LIMIT_WARNING);
      break;
    }
    entryCount += 1;
    const entry = value[key];
    if (isRawEvidenceKey(key)) {
      addRawEvidenceWarning(warnings);
      continue;
    }
    const normalizedEntry = key === "source_refs"
      ? normalizeSourceRefs(entry, warnings)
      : normalizeEvidenceValue(entry, warnings, depth + 1, nextAncestors);
    if (normalizedEntry !== undefined && normalizedEntry !== null) {
      normalized[key] = normalizedEntry;
    }
  }
  return normalized;
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
    lines.push(`- **${escapeMarkdown(item.title)}** (${escapeMarkdown(item.type)}, ${escapeMarkdown(item.status)}) - ${escapeMarkdown(window)}${item.owner ? ` - owner: ${escapeMarkdown(item.owner)}` : ""}`);
  }

  if (timeline.gaps.length > 0) {
    lines.push("", "## Gaps");
    for (const gap of timeline.gaps) {
      lines.push(`- ${escapeMarkdown(gap.itemTitle)}: ${escapeMarkdown(gap.field)} - ${escapeMarkdown(gap.question)}`);
    }
  }

  if (timeline.assumptions.length > 0) {
    lines.push("", "## Assumptions");
    for (const assumption of timeline.assumptions) {
      lines.push(`- ${escapeMarkdown(assumption)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function renderReviewReport(timeline) {
  const followups = buildFollowups(timeline);
  const lines = ["## Timeline Review", "", "### Items"];

  for (const item of timeline.items) {
    const window = item.start ? `${item.start}${item.end ? ` to ${item.end}` : item.duration ? ` for ${item.duration}` : ""}` : item.time_window || "date needed";
    lines.push(`- **${escapeMarkdown(item.title)}** (${escapeMarkdown(item.type)}, ${escapeMarkdown(item.status)}) - ${escapeMarkdown(window)}${item.owner ? ` - owner: ${escapeMarkdown(item.owner)}` : ""}`);
    lines.push(`  - Evidence: ${escapeMarkdown(item.evidence_grade)} - ${escapeMarkdown(item.evidence_reason)}`);
    if (item.source_refs.length > 0) {
      lines.push(`  - Source: ${escapeMarkdown(formatSourceRef(item.source_refs[0]))}`);
    }
  }

  if (timeline.gaps.length > 0) {
    lines.push("", "### Follow-Up Questions");
    for (const followup of followups.all) {
      lines.push(`- ${escapeMarkdown(followup.itemTitle)}${followup.owner ? ` (${escapeMarkdown(followup.owner)})` : ""}: ${escapeMarkdown(followup.question)}`);
    }
  }

  if (timeline.issues.length > 0) {
    lines.push("", "### Issues");
    for (const issue of timeline.issues) {
      const suggestions = issue.suggestions?.length ? ` Suggestions: ${issue.suggestions.map(escapeMarkdown).join(", ")}.` : "";
      lines.push(`- ${escapeMarkdown(issue.severity)}: ${escapeMarkdown(issue.message)}${suggestions}`);
    }
  }

  if (timeline.assumptions.length > 0) {
    lines.push("", "### Assumptions");
    for (const assumption of timeline.assumptions) {
      lines.push(`- ${escapeMarkdown(assumption)}`);
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
  const sourceId = sourceRef.source_id || sourceRef.sourceId;
  const parts = [sourceId && sourceRef.locator ? `${sourceId} @ ${sourceRef.locator}` : sourceId];
  if (sourceRef.path) parts.push(sourceRef.path);
  if (sourceRef.heading) parts.push(`heading "${sourceRef.heading}"`);
  if (sourceRef.line) parts.push(`line ${sourceRef.line}`);
  return parts.filter(Boolean).join(", ");
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/[\\`*_[\]{}()<>#+.!|~-]/g, "\\$&")
    .replace(/[\r\n]/g, " ");
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
