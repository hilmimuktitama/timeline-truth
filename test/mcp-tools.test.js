import assert from "node:assert/strict";
import test from "node:test";

import { callTimelineTool, listTimelineTools } from "../src/mcp-tools.js";

test("listTimelineTools exposes the planned MCP tool names", () => {
  assert.deepEqual(
    listTimelineTools().map((tool) => tool.name),
    ["create_timeline", "validate_timeline", "render_timeline", "refine_timeline", "diff_timelines"]
  );
});

test("create_timeline schema exposes Markdown source paths and section allowlists", () => {
  const createTool = listTimelineTools().find((tool) => tool.name === "create_timeline");

  assert.equal(createTool.inputSchema.properties.sources.items.properties.path.type, "string");
  assert.deepEqual(createTool.inputSchema.properties.markdown.properties.sections.items, { type: "string" });
  assert.equal(createTool.inputSchema.properties.markdown.properties.ignoreFrontmatter.default, true);
});

test("diff_timelines schema requires baseline and current timelines", () => {
  const diffTool = listTimelineTools().find((tool) => tool.name === "diff_timelines");

  assert.deepEqual(diffTool.inputSchema.required, ["baseline", "current"]);
  assert.deepEqual(diffTool.inputSchema.properties.format.enum, ["json", "markdown"]);
});

test("refine_timeline schema requires matchTitle or matchId", () => {
  const refineTool = listTimelineTools().find((tool) => tool.name === "refine_timeline");

  const itemsSchema = refineTool.inputSchema.properties.updates.items;
  assert.deepEqual(itemsSchema.required, ["set"]);
  assert.deepEqual(itemsSchema.anyOf, [{ required: ["matchTitle"] }, { required: ["matchId"] }]);
});

test("callTimelineTool rejects refine updates without a match key", () => {
  assert.throws(
    () =>
      callTimelineTool("refine_timeline", {
        timeline: { items: [{ title: "Task" }] },
        updates: [{ set: { start: "2026-06-01" } }]
      }),
    /matchTitle.*matchId/
  );
});

test("callTimelineTool returns JSON text content for create_timeline", () => {
  const response = callTimelineTool("create_timeline", {
    sources: [{ id: "notes", type: "text", content: "Discovery: 2026-06-01 to 2026-06-05 owner TPM" }]
  });

  assert.equal(response.content[0].type, "text");
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.timeline.items[0].title, "Discovery");
  assert.equal(parsed.timeline.items[0].evidence_grade, "exact");
  assert.match(parsed.renders.mermaid_gantt, /^gantt\n/);
  assert.match(parsed.renders.review_report, /^## Timeline Review\n/);
});

test("render_timeline exposes review reports through the MCP schema", () => {
  const renderTool = listTimelineTools().find((tool) => tool.name === "render_timeline");

  assert.ok(renderTool.inputSchema.properties.format.enum.includes("review_report"));

  const response = callTimelineTool("render_timeline", {
    format: "review_report",
    timeline: {
      items: [{ title: "Discovery", start: "2026-06-01", owner: "TPM" }]
    }
  });

  assert.match(response.content[0].text, /^## Timeline Review\n/);
});

test("diff_timelines returns JSON diff output with change types", () => {
  const response = callTimelineTool("diff_timelines", {
    baseline: {
      items: [{ id: "a", title: "Alpha", start: "2026-06-01" }]
    },
    current: {
      items: [{ id: "a", title: "Alpha", start: "2026-06-02" }]
    }
  });

  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.changes[0].type, "start_moved");
  assert.equal(parsed.summary.changed, 1);
  assert.equal(parsed.critical_path.computed, false);
});

test("diff_timelines returns Markdown when requested", () => {
  const response = callTimelineTool("diff_timelines", {
    format: "markdown",
    baseline: {
      items: [{ id: "a", title: "Alpha", start: "2026-06-01" }]
    },
    current: {
      items: [{ id: "a", title: "Alpha", start: "2026-06-02" }]
    }
  });

  assert.match(response.content[0].text, /## Schedule Diff/);
  assert.match(response.content[0].text, /Critical path is not computed/);
});

test("callTimelineTool rejects unknown tools", () => {
  assert.throws(() => callTimelineTool("missing_tool", {}), /Unknown timeline tool/);
});
