import { readFileSync } from "node:fs";

import { createTimeline } from "../src/timeline.js";

const CASES_PATH = "evaluation/cases.json";
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

const cases = JSON.parse(readFileSync(CASES_PATH, "utf8")).cases;
const results = cases.map(runCase);
const failures = results.filter((result) => !result.passed);

const report = buildReport(results);
process.stdout.write(report);

if (failures.length > 0) {
  process.stderr.write(`\n${failures.length} evaluation case(s) failed.\n`);
  process.exit(1);
}

function runCase(evaluationCase) {
  const source = evaluationCase.sourcePath
    ? readFileSync(evaluationCase.sourcePath, "utf8")
    : evaluationCase.content;
  const result = createTimeline({
    sources: [
      {
        id: evaluationCase.id,
        type: evaluationCase.sourceType,
        content: source
      }
    ]
  });

  const actualTitles = result.timeline.items.map((item) => item.title);
  const failuresList = [];
  const warningsList = [];

  const expected = evaluationCase.expected || {};

  if (expected.itemTitles) {
    if (JSON.stringify(actualTitles) !== JSON.stringify(expected.itemTitles)) {
      failuresList.push(
        `item titles: expected ${JSON.stringify(expected.itemTitles)}, got ${JSON.stringify(actualTitles)}`
      );
    }
  }

  for (const expectedGap of expected.gaps || []) {
    const found = result.gaps.some(
      (gap) => gap.itemTitle === expectedGap.itemTitle && gap.field === expectedGap.field
    );
    if (!found) {
      failuresList.push(`missing expected gap ${expectedGap.itemTitle}:${expectedGap.field}`);
    }
  }

  const actualIssueTypes = result.issues.map((issue) => issue.type);
  for (const expectedIssueType of expected.issues || []) {
    if (!actualIssueTypes.includes(expectedIssueType)) {
      failuresList.push(`missing expected issue type "${expectedIssueType}"`);
    }
  }

  for (const [title, grade] of Object.entries(expected.evidenceGrades || {})) {
    const item = result.timeline.items.find((candidate) => candidate.title === title);
    if (!item) {
      failuresList.push(`expected item "${title}" for evidence grade check was not found`);
    } else if (item.evidence_grade !== grade) {
      failuresList.push(
        `evidence grade for "${title}": expected ${grade}, got ${item.evidence_grade}`
      );
    }
  }

  for (const gap of result.gaps) {
    const expectedGap = (expected.gaps || []).some(
      (candidate) => candidate.itemTitle === gap.itemTitle && candidate.field === gap.field
    );
    if (!expectedGap) warningsList.push(`extra gap ${gap.itemTitle}:${gap.field}`);
  }

  const unexpectedIssues = actualIssueTypes.filter((type) => !(expected.issues || []).includes(type));
  if (unexpectedIssues.length > 0) {
    warningsList.push(`unexpected issue types: ${[...new Set(unexpectedIssues)].join(", ")}`);
  }

  for (const format of ["mermaid_gantt", "mermaid_timeline", "markdown", "review_report"]) {
    if (!result.renders[format] || result.renders[format].trim() === "") {
      failuresList.push(`empty render: ${format}`);
    }
  }

  return {
    id: evaluationCase.id,
    name: evaluationCase.name,
    passed: failuresList.length === 0,
    itemCount: result.timeline.items.length,
    gapCount: result.gaps.length,
    issueCount: result.issues.length,
    failures: failuresList,
    warnings: warningsList
  };
}

function buildReport(results) {
  const generatedAt = new Date().toISOString();
  const passedCount = results.filter((result) => result.passed).length;
  const warningsCount = results.reduce((total, result) => total + result.warnings.length, 0);
  const failuresCount = results.reduce((total, result) => total + result.failures.length, 0);

  const lines = [
    "# Timeline Truth Evaluation",
    "",
    `Generated: ${generatedAt}`,
    `Package: ${packageJson.name} v${packageJson.version}`,
    `Node: ${process.version}`,
    `Synthetic regression cases: ${results.length}`,
    "",
    "## Method",
    "",
    "- Each case is a deterministic synthetic fixture or checked-in example, run through the same `createTimeline` path used by the CLI and MCP tools.",
    "- Expected contracts: exact item title order, presence of documented gaps, presence of documented validation issue types, and exact evidence grades.",
    "- This is a synthetic regression/evaluation suite, not an accuracy benchmark: the corpus is small and maintained inside this repository, so it does not prove general-world planning accuracy.",
    "- It does not measure a live LLM, human reviewer, MCP-client latency, Jira import quality, or real Confluence/Slack material.",
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Cases passed | ${passedCount}/${results.length} |`,
    `| Cases failed | ${results.length - passedCount} |`,
    `| Contract failures | ${failuresCount} |`,
    `| Non-blocking warnings | ${warningsCount} |`,
    "",
    "## Per-Case Results",
    "",
    "| Case | Pass | Items | Gaps | Issues | Failures | Warnings |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...results.map((result) =>
      `| ${result.name} | ${result.passed ? "yes" : "NO"} | ${result.itemCount} | ${result.gapCount} | ${result.issueCount} | ${result.failures.length} | ${result.warnings.length} |`
    )
  ];

  for (const result of results.filter((candidate) => !candidate.passed || candidate.warnings.length > 0)) {
    lines.push("", `### ${result.name}`, "");
    if (result.failures.length > 0) {
      lines.push("Failures:", "");
      for (const failure of result.failures) lines.push(`- ${failure}`);
      lines.push("");
    }
    if (result.warnings.length > 0) {
      lines.push("Warnings:", "");
      for (const warning of result.warnings) lines.push(`- ${warning}`);
      lines.push("");
    }
  }

  lines.push(
    "",
    "## Honest Limitations",
    "",
    "- Useful: the suite catches regressions in parsing, validation, evidence grading, and rendering across the checked-in fixtures.",
    "- Useful: failures exit non-zero, so CI blocks changes that break the documented contracts.",
    "- Limitation: the corpus is synthetic and maintained by this project; it is a regression net, not independent proof of real-world accuracy.",
    "- Limitation: free-form prose outside the tested shapes may perform worse; structured Markdown/CSV/JSON input remains the most reliable path."
  );

  return `${lines.join("\n")}\n`;
}
