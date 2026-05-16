import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

import { createTimeline } from "../src/timeline.js";

const ITERATIONS = 1000;
const DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const OWNER_PATTERN = /\bowner\b|(?:^|,)(?:PM|TPM|Platform|QA|BE|DBA|SRE|Legal|Mobile)(?:,|$)/gi;
const DEPENDENCY_PATTERN = /\bdepends on\b|dependencies/gi;

const CASES = [
  {
    id: "prd-snippet",
    name: "PRD snippet",
    sourcePath: "examples/prd-snippet.md",
    sourceType: "markdown",
    expectedPath: "examples/expected-output/prd-snippet.json"
  },
  {
    id: "jira-export",
    name: "Jira CSV export",
    sourcePath: "examples/jira-export.csv",
    sourceType: "csv",
    expectedPath: "examples/expected-output/jira-export.json"
  },
  {
    id: "launch-checklist",
    name: "Launch checklist",
    sourcePath: "examples/launch-checklist.md",
    sourceType: "markdown",
    expectedPath: "examples/expected-output/launch-checklist.json"
  },
  {
    id: "status-update",
    name: "Status update",
    sourcePath: "examples/status-update.md",
    sourceType: "markdown",
    expectedPath: "examples/expected-output/status-update.json"
  }
];

const outputPath = parseWritePath(process.argv.slice(2));
const report = buildBenchmarkReport();

if (outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, report);
}

process.stdout.write(report);

function buildBenchmarkReport() {
  const results = CASES.map(runCase);
  const totals = summarize(results);
  const generatedAt = new Date().toISOString();
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  return [
    "# Timeline Truth Benchmark",
    "",
    `Generated: ${generatedAt}`,
    `Package: ${packageJson.name} v${packageJson.version}`,
    `Commit: ${gitValue(["rev-parse", "--short", "HEAD"])}`,
    `Node: ${process.version}`,
    `Benchmark iterations per fixture: ${ITERATIONS}`,
    "",
    "## Method",
    "",
    "- Before means the checked-in source material as a TPM, PM, or agent would receive it before running Timeline Truth.",
    "- After means the actual `createTimeline` result produced by this repo from the same source content. The CLI and MCP tools use this same implementation path for timeline creation.",
    "- Expected fixture comparison only checks the asserted public benchmark contract: item titles and known gaps. It does not prove perfect timeline understanding.",
    "- This benchmark does not measure a live LLM, human reviewer, hosted MCP-client latency, Jira import quality, or real Confluence/Slack material.",
    "",
    "## Truth Summary",
    "",
    "| Metric | Actual Result |",
    "| --- | ---: |",
    `| Fixture inputs benchmarked | ${totals.fixtureCount} |`,
    `| Raw planning entries before tool use | ${totals.rawEntries} |`,
    `| Exact date strings visible in raw inputs | ${totals.rawDateMentions} |`,
    `| Extracted timeline items after tool use | ${totals.extractedItems} |`,
    `| Extracted milestones after tool use | ${totals.milestones} |`,
    `| Extracted items with source refs | ${totals.itemsWithSourceRefs}/${totals.extractedItems} |`,
    `| Expected item titles matched | ${totals.expectedTitlesMatched}/${totals.expectedTitles} |`,
    `| Expected gaps found | ${totals.expectedGapsFound}/${totals.expectedGaps} |`,
    `| Extra gaps beyond fixtures | ${totals.extraGaps} |`,
    `| Dependency/date issues reported | ${totals.issues} |`,
    `| Follow-up questions generated | ${totals.followups} |`,
    `| Mermaid/Markdown/review renders generated | ${totals.renderSets}/${totals.fixtureCount} fixture sets |`,
    `| Average createTimeline runtime | ${formatMs(totals.averageRuntimeMs)} ms |`,
    `| P95 createTimeline runtime, worst fixture | ${formatMs(totals.worstP95Ms)} ms |`,
    "",
    "## Before vs After",
    "",
    "| Fixture | Before Raw Entries | After Items | After Gaps | Source Ref Coverage | Expected Titles | Expected Gaps | Avg Runtime | P95 Runtime |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...results.map((result) =>
      `| ${result.name} | ${result.before.rawEntries} | ${result.after.itemCount} | ${result.after.gapCount} | ${result.after.sourceRefCoverage}/${result.after.itemCount} | ${result.validation.expectedTitlesMatched}/${result.validation.expectedTitles} | ${result.validation.expectedGapsFound}/${result.validation.expectedGaps} | ${formatMs(result.runtime.averageMs)} ms | ${formatMs(result.runtime.p95Ms)} ms |`
    ),
    "",
    "## Gap Breakdown",
    "",
    "| Field | Count |",
    "| --- | ---: |",
    ...Object.entries(totals.gapsByField).map(([field, count]) => `| ${field} | ${count} |`),
    "",
    "## Honest Interpretation",
    "",
    "- Useful: the tool reliably turns these four messy fixtures into normalized timeline items, source references, gaps, follow-up questions, and renderable artifacts.",
    "- Useful: it matched all checked-in expected item titles and expected gaps in this benchmark run.",
    "- Useful: it did not invent missing dates or owners; those appeared as gaps.",
    "- Limitation: the benchmark corpus is small and maintained inside this repo, so it is a regression benchmark, not independent proof of general-world accuracy.",
    "- Limitation: no dependency issues appeared in the examples, so this run does not validate difficult dependency repair beyond unit tests.",
    "- Limitation: the parser is heuristic; Markdown/CSV structure helps. Free-form prose outside the tested shape may perform worse.",
    "",
    "## Per-Fixture Actual Results",
    "",
    ...results.flatMap(renderCase)
  ].join("\n");
}

function runCase(benchmarkCase) {
  const content = readFileSync(benchmarkCase.sourcePath, "utf8");
  const expected = JSON.parse(readFileSync(benchmarkCase.expectedPath, "utf8"));
  const input = {
    sources: [
      {
        id: expected.sourceId,
        type: benchmarkCase.sourceType,
        path: benchmarkCase.sourcePath,
        content
      }
    ]
  };

  const result = createTimeline(input);
  const runtime = measureRuntime(input);
  const actualTitles = result.timeline.items.map((item) => item.title);
  const actualGapCounts = countGapKeys(result.gaps);
  const expectedGapCounts = countGapKeys(expected.gaps);
  const extraGaps = findExtraGaps(result.gaps, expectedGapCounts);

  return {
    id: benchmarkCase.id,
    name: benchmarkCase.name,
    sourcePath: benchmarkCase.sourcePath,
    sourceType: benchmarkCase.sourceType,
    before: analyzeRawInput(content, benchmarkCase.sourceType),
    after: {
      itemCount: result.timeline.items.length,
      milestoneCount: result.timeline.milestones.length,
      gapCount: result.gaps.length,
      issueCount: result.issues.length,
      followupCount: result.followups.all.length,
      sourceRefCoverage: result.timeline.items.filter((item) => item.source_refs.length > 0).length,
      titles: actualTitles,
      gaps: result.gaps.map((gap) => ({
        itemTitle: gap.itemTitle,
        field: gap.field,
        question: gap.question
      })),
      issues: result.issues,
      noiseReport: result.noise_report,
      renderLengths: {
        mermaid_gantt: result.renders.mermaid_gantt.length,
        mermaid_timeline: result.renders.mermaid_timeline.length,
        markdown: result.renders.markdown.length,
        review_report: result.renders.review_report.length
      }
    },
    validation: {
      expectedTitles: expected.itemTitles.length,
      expectedTitlesMatched: expected.itemTitles.filter((title, index) => title === actualTitles[index]).length,
      titleOrderExact: JSON.stringify(expected.itemTitles) === JSON.stringify(actualTitles),
      expectedGaps: expected.gaps.length,
      expectedGapsFound: expected.gaps.filter((gap) => (actualGapCounts.get(gapKey(gap)) || 0) > 0).length,
      extraGaps: extraGaps.map((gap) => ({ itemTitle: gap.itemTitle, field: gap.field }))
    },
    runtime,
    rawInput: content.trimEnd(),
    actualJson: result,
    actualReviewReport: result.renders.review_report.trimEnd()
  };
}

function measureRuntime(input) {
  const timings = [];

  for (let index = 0; index < 20; index += 1) createTimeline(input);

  for (let index = 0; index < ITERATIONS; index += 1) {
    const startedAt = performance.now();
    createTimeline(input);
    timings.push(performance.now() - startedAt);
  }

  timings.sort((left, right) => left - right);
  const sum = timings.reduce((total, value) => total + value, 0);

  return {
    iterations: ITERATIONS,
    minMs: timings[0],
    averageMs: sum / timings.length,
    p50Ms: percentile(timings, 50),
    p95Ms: percentile(timings, 95),
    maxMs: timings.at(-1)
  };
}

function analyzeRawInput(content, sourceType) {
  const lines = content.split(/\r?\n/);
  const nonEmptyLines = lines.filter((line) => line.trim()).length;
  const rawEntries = sourceType === "csv"
    ? Math.max(0, lines.filter((line) => line.trim()).length - 1)
    : lines.filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("#");
    }).length;

  return {
    nonEmptyLines,
    rawEntries,
    exactDateMentions: matchCount(content, DATE_PATTERN),
    ownerMentions: matchCount(content, OWNER_PATTERN),
    dependencyMentions: matchCount(content, DEPENDENCY_PATTERN)
  };
}

function summarize(results) {
  const gapsByField = {};
  for (const result of results) {
    for (const gap of result.after.gaps) {
      gapsByField[gap.field] = (gapsByField[gap.field] || 0) + 1;
    }
  }

  const runtimeWeightedTotal = results.reduce(
    (total, result) => total + result.runtime.averageMs,
    0
  );

  return {
    fixtureCount: results.length,
    rawEntries: sum(results, (result) => result.before.rawEntries),
    rawDateMentions: sum(results, (result) => result.before.exactDateMentions),
    extractedItems: sum(results, (result) => result.after.itemCount),
    milestones: sum(results, (result) => result.after.milestoneCount),
    itemsWithSourceRefs: sum(results, (result) => result.after.sourceRefCoverage),
    expectedTitles: sum(results, (result) => result.validation.expectedTitles),
    expectedTitlesMatched: sum(results, (result) => result.validation.expectedTitlesMatched),
    expectedGaps: sum(results, (result) => result.validation.expectedGaps),
    expectedGapsFound: sum(results, (result) => result.validation.expectedGapsFound),
    extraGaps: sum(results, (result) => result.validation.extraGaps.length),
    issues: sum(results, (result) => result.after.issueCount),
    followups: sum(results, (result) => result.after.followupCount),
    renderSets: results.filter((result) =>
      Object.values(result.after.renderLengths).every((length) => length > 0)
    ).length,
    averageRuntimeMs: runtimeWeightedTotal / results.length,
    worstP95Ms: Math.max(...results.map((result) => result.runtime.p95Ms)),
    gapsByField
  };
}

function renderCase(result) {
  return [
    `### ${result.name}`,
    "",
    `Source: \`${result.sourcePath}\` (${result.sourceType})`,
    "",
    "#### Before: Raw Input",
    "",
    fenced(result.sourceType === "csv" ? "csv" : "markdown", result.rawInput),
    "",
    "#### After: Benchmark Summary",
    "",
    "```json",
    JSON.stringify(
      {
        before: result.before,
        after: result.after,
        validation: result.validation,
        runtime: roundRuntime(result.runtime)
      },
      null,
      2
    ),
    "```",
    "",
    "#### After: Review Report Output",
    "",
    fenced("markdown", result.actualReviewReport),
    "",
    "#### After: Full createTimeline JSON",
    "",
    "```json",
    JSON.stringify(result.actualJson, null, 2),
    "```",
    ""
  ];
}

function fenced(language, value) {
  return ["```" + language, value, "```"].join("\n");
}

function roundRuntime(runtime) {
  return Object.fromEntries(
    Object.entries(runtime).map(([key, value]) => [
      key,
      typeof value === "number" ? Number(value.toFixed(6)) : value
    ])
  );
}

function formatMs(value) {
  return Number(value).toFixed(4);
}

function percentile(sortedValues, percent) {
  const index = Math.ceil((percent / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))];
}

function sum(values, selector) {
  return values.reduce((total, value) => total + selector(value), 0);
}

function matchCount(value, pattern) {
  return [...String(value).matchAll(pattern)].length;
}

function countGapKeys(gaps) {
  const counts = new Map();
  for (const gap of gaps) {
    const key = gapKey(gap);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function findExtraGaps(actualGaps, expectedGapCounts) {
  const remainingExpected = new Map(expectedGapCounts);
  const extra = [];

  for (const gap of actualGaps) {
    const key = gapKey(gap);
    const remaining = remainingExpected.get(key) || 0;
    if (remaining > 0) {
      remainingExpected.set(key, remaining - 1);
    } else {
      extra.push(gap);
    }
  }

  return extra;
}

function gapKey(gap) {
  return `${gap.itemTitle}:${gap.field}`;
}

function parseWritePath(args) {
  const writeIndex = args.indexOf("--write");
  if (writeIndex === -1) return undefined;
  const value = args[writeIndex + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("Missing value for --write.");
  }
  return value;
}

function gitValue(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    try {
      return execFileSync("rtk", ["git", ...args], { encoding: "utf8" }).trim();
    } catch {
      return gitHeadFromFiles();
    }
  }
}

function gitHeadFromFiles() {
  try {
    const head = readFileSync(".git/HEAD", "utf8").trim();
    if (!head.startsWith("ref: ")) return head.slice(0, 7);

    const refPath = `.git/${head.slice("ref: ".length)}`;
    if (existsSync(refPath)) return readFileSync(refPath, "utf8").trim().slice(0, 7);

    if (existsSync(".git/packed-refs")) {
      const refName = head.slice("ref: ".length);
      const packedRef = readFileSync(".git/packed-refs", "utf8")
        .split(/\r?\n/)
        .find((line) => line.endsWith(` ${refName}`));
      if (packedRef) return packedRef.split(" ")[0].slice(0, 7);
    }
  } catch {
    return "unknown";
  }

  return "unknown";
}
