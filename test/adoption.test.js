import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTimeline } from "../src/timeline.js";

const EXAMPLE_CASES = [
  ["PRD snippet", "examples/prd-snippet.md", "markdown", "examples/expected-output/prd-snippet.json"],
  ["Jira CSV export", "examples/jira-export.csv", "csv", "examples/expected-output/jira-export.json"],
  ["Launch checklist", "examples/launch-checklist.md", "markdown", "examples/expected-output/launch-checklist.json"],
  ["Status update", "examples/status-update.md", "markdown", "examples/expected-output/status-update.json"]
];

test("README gives a credible first-use path for AI-agent TPM adoption", () => {
  const readme = readFileSync("README.md", "utf8");
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.match(readme, new RegExp(`Status: v${packageJson.version} public release`));
  assert.match(readme, /paste PRD\/Jira\/status notes/i);
  assert.match(readme, /Why not just ask ChatGPT or Mermaid\?/i);
  assert.match(readme, /Current limitations/i);
  assert.match(readme, /Npm package config/i);
  assert.match(readme, /timeline-truth examples\/launch-checklist\.md --format review/i);
  assert.match(readme, /Markdown tables under those headings are parsed into items/i);
  assert.match(readme, /noise_report\.ignored/i);
  assert.match(readme, /evidence_grade/i);
  assert.match(readme, /timeline-truth diff/i);
  assert.match(readme, /critical path/i);
});

test("package exposes both MCP and first-run CLI binaries at version 0.3.0", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(packageJson.version, "0.3.0");
  assert.equal(packageJson.bin["timeline-truth-mcp"], "src/mcp-server.js");
  assert.equal(packageJson.bin["timeline-truth"], "src/cli.js");
  assert.deepEqual(
    ["test", "check", "contracts:verify", "eval"].map((name) => packageJson.scripts[name]),
    ["node --test", "node scripts/check-syntax.js", "node scripts/contracts-verify.js", "node scripts/evaluation.js"]
  );
});

test("MCP setup and release docs cover local use, npm use, agent prompting, and publish checks", () => {
  const setup = readFileSync("docs/MCP-SETUP.md", "utf8");
  const release = readFileSync("docs/RELEASE.md", "utf8");

  assert.match(setup, /local checkout/i);
  assert.match(setup, /timeline-truth-mcp/);
  assert.match(setup, /create_timeline/);
  assert.match(setup, /diff_timelines/);
  assert.match(release, /npm view timeline-truth/i);
  assert.match(release, /npm pack --dry-run/i);
  assert.match(release, /npm publish --provenance --access public/i);
  assert.match(release, /contracts:verify/i);
  assert.match(release, /Markdown ingestion/i);
});

test("contract schemas match the canonical truth-tools contract and evaluation suite exists", () => {
  const itemSchema = JSON.parse(readFileSync("schemas/timeline-item.schema.json", "utf8"));
  const sourceRefSchema = JSON.parse(readFileSync("schemas/source-ref.schema.json", "utf8"));
  const cases = JSON.parse(readFileSync("evaluation/cases.json", "utf8"));

  assert.equal(itemSchema["$schema"], "https://json-schema.org/draft/2020-12/schema");
  assert.equal(sourceRefSchema["$schema"], "https://json-schema.org/draft/2020-12/schema");
  assert.equal(
    itemSchema.properties.source_refs?.items?.$ref,
    "https://truth-tools.dev/schemas/source-ref.schema.json"
  );
  assert.ok(sourceRefSchema.required.includes("source_id"));
  assert.ok(sourceRefSchema.required.includes("locator"));
  assert.equal(sourceRefSchema.additionalProperties, false);
  assert.equal(sourceRefSchema.properties.observed_at.format, "date-time");
  assert.equal(sourceRefSchema.properties.source_updated_at.format, "date-time");
  assert.ok(Array.isArray(cases.cases) && cases.cases.length >= 10);
});

test("CI and release workflows exist with clean-install and trusted publishing", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const release = readFileSync(".github/workflows/release.yml", "utf8");

  assert.match(ci, /npm ci/);
  assert.match(ci, /npm audit --audit-level=high/);
  assert.match(ci, /npm test/);
  assert.match(ci, /contracts:verify/);
  assert.match(release, /id-token: write/);
  assert.match(release, /npm audit --audit-level=high/);
  assert.match(release, /examples\/launch-checklist\.md --type markdown --format review/);
  assert.match(release, /examples\/baseline-plan\.json examples\/current-plan\.json --format markdown/);
  assert.match(release, /npm publish/);
  assert.match(release, /release:\n\s+types: \[published\]/);
  assert.match(release, /workflow_dispatch:/);
  assert.match(release, /required: true/);
  assert.match(release, /ref: \$\{\{ env\.RELEASE_TAG \}\}/);
  assert.match(release, /refs\/tags\/\$RELEASE_TAG/);
  assert.match(release, /package\.json.*version/);
  assert.match(release, /contents: read/);
  assert.match(release, /id-token: write/);
  assert.doesNotMatch(release, /NODE_AUTH_TOKEN|NPM_TOKEN|gh release create|GITHUB_TOKEN/);
});

for (const [name, sourcePath, sourceType, expectedPath] of EXAMPLE_CASES) {
  test(`${name} example is backed by parser output, gaps, source refs, and renders`, () => {
    const content = readFileSync(sourcePath, "utf8");
    const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
    const result = createTimeline({
      sources: [
        {
          id: expected.sourceId,
          type: sourceType,
          content
        }
      ]
    });

    assert.deepEqual(
      result.timeline.items.map((item) => item.title),
      expected.itemTitles
    );

    for (const item of result.timeline.items) {
      assert.ok(item.source_refs.length > 0, `${item.title} should preserve at least one source_ref`);
      assert.ok(["exact", "derived", "fuzzy", "missing"].includes(item.evidence_grade));
      assert.equal(item.confidence, undefined);
    }

    for (const expectedGap of expected.gaps) {
      assert.ok(
        result.gaps.some((gap) => gap.itemTitle === expectedGap.itemTitle && gap.field === expectedGap.field),
        `Expected gap ${expectedGap.itemTitle}:${expectedGap.field}`
      );
    }

    assert.match(result.renders.mermaid_gantt, /^gantt\n/);
    assert.match(result.renders.mermaid_timeline, /^timeline\n/);
    assert.match(result.renders.markdown, /## Timeline/);
  });
}
