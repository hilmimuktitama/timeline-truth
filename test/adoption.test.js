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

  assert.match(readme, /paste PRD\/Jira\/status notes/i);
  assert.match(readme, /Why not just ask ChatGPT or Mermaid\?/i);
  assert.match(readme, /Current limitations/i);
  assert.match(readme, /Npm package config/i);
  assert.match(readme, /Easy Way: Ask Your Agent/i);
  assert.match(readme, /let's use timeline-truth from https:\/\/github\.com\/hilmimuktitama\/timeline-truth/i);
  assert.match(readme, /Your agent should handle the setup/i);
  assert.match(readme, /Most users should not copy MCP JSON\s+by hand/i);
  assert.match(readme, /Manual fallback\/reference config/i);
  assert.match(readme, /docs\/AI-AGENT-INSTALL\.md/i);
  assert.match(readme, /Markdown tables under those headings are parsed into items/i);
  assert.match(readme, /noise_report\.ignored/i);
});

test("MCP setup, agent install docs, and release docs cover adoption and publish checks", () => {
  const setup = readFileSync("docs/MCP-SETUP.md", "utf8");
  const agentInstall = readFileSync("docs/AI-AGENT-INSTALL.md", "utf8");
  const release = readFileSync("docs/RELEASE.md", "utf8");

  assert.match(setup, /local checkout/i);
  assert.match(setup, /timeline-truth-mcp/);
  assert.match(setup, /Generic MCP-Capable Agent/i);
  assert.match(setup, /docs\/AI-AGENT-INSTALL\.md/i);
  assert.match(setup, /Ask your agent to call `create_timeline`/i);
  assert.match(setup, /create_timeline/);
  assert.match(agentInstall, /let's use timeline-truth from https:\/\/github\.com\/hilmimuktitama\/timeline-truth/i);
  assert.match(agentInstall, /install the stable npm package/i);
  assert.match(agentInstall, /"args": \["-y", "--package=timeline-truth", "timeline-truth-mcp"\]/);
  assert.match(agentInstall, /verify `create_timeline` is available/i);
  assert.match(agentInstall, /If you cannot edit the MCP config/i);
  assert.match(release, /npm view timeline-truth/i);
  assert.match(release, /npm pack --dry-run/i);
  assert.match(release, /npm publish --access public/i);
  assert.match(release, /Markdown ingestion/i);
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
