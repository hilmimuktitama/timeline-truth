import assert from "node:assert/strict";
import test from "node:test";

import { callTimelineTool, listTimelineTools } from "../src/mcp-tools.js";

test("listTimelineTools exposes the planned MCP tool names", () => {
  assert.deepEqual(
    listTimelineTools().map((tool) => tool.name),
    ["create_timeline", "validate_timeline", "render_timeline", "refine_timeline"]
  );
});

test("create_timeline schema exposes Markdown source paths and section allowlists", () => {
  const createTool = listTimelineTools().find((tool) => tool.name === "create_timeline");

  assert.equal(createTool.inputSchema.properties.sources.items.properties.path.type, "string");
  assert.deepEqual(createTool.inputSchema.properties.markdown.properties.sections.items, { type: "string" });
  assert.equal(createTool.inputSchema.properties.markdown.properties.ignoreFrontmatter.default, true);
});

test("callTimelineTool returns JSON text content for create_timeline", () => {
  const response = callTimelineTool("create_timeline", {
    sources: [{ id: "notes", type: "text", content: "Discovery: 2026-06-01 to 2026-06-05 owner TPM" }]
  });

  assert.equal(response.content[0].type, "text");
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.timeline.items[0].title, "Discovery");
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

test("callTimelineTool rejects unknown tools", () => {
  assert.throws(() => callTimelineTool("missing_tool", {}), /Unknown timeline tool/);
});
