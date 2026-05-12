import assert from "node:assert/strict";
import test from "node:test";

import { callTimelineTool, listTimelineTools } from "../src/mcp-tools.js";

test("listTimelineTools exposes the planned MCP tool names", () => {
  assert.deepEqual(
    listTimelineTools().map((tool) => tool.name),
    ["create_timeline", "validate_timeline", "render_timeline", "refine_timeline"]
  );
});

test("callTimelineTool returns JSON text content for create_timeline", () => {
  const response = callTimelineTool("create_timeline", {
    sources: [{ id: "notes", type: "text", content: "Discovery: 2026-06-01 to 2026-06-05 owner TPM" }]
  });

  assert.equal(response.content[0].type, "text");
  const parsed = JSON.parse(response.content[0].text);
  assert.equal(parsed.timeline.items[0].title, "Discovery");
  assert.match(parsed.renders.mermaid_gantt, /^gantt\n/);
});

test("callTimelineTool rejects unknown tools", () => {
  assert.throws(() => callTimelineTool("missing_tool", {}), /Unknown timeline tool/);
});
