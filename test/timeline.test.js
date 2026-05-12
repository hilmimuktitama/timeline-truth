import assert from "node:assert/strict";
import test from "node:test";

import {
  createTimeline,
  refineTimeline,
  renderTimeline,
  validateTimeline
} from "../src/timeline.js";

test("createTimeline parses project notes into defensible items and flags gaps", () => {
  const result = createTimeline({
    sources: [
      {
        id: "notes",
        type: "text",
        content: [
          "Discovery: 2026-06-01 to 2026-06-05 owner Ana status planned",
          "Build API: starts 2026-06-06 duration 5d owner BE depends on Discovery",
          "Stakeholder review milestone on 2026-06-14",
          "Launch readiness owner TPM depends on Build API"
        ].join("\n")
      }
    ]
  });

  assert.equal(result.timeline.items.length, 4);
  assert.deepEqual(
    result.timeline.items.map((item) => item.title),
    ["Discovery", "Build API", "Stakeholder review", "Launch readiness"]
  );
  assert.equal(result.timeline.items[0].start, "2026-06-01");
  assert.equal(result.timeline.items[0].end, "2026-06-05");
  assert.equal(result.timeline.items[1].duration, "5d");
  assert.deepEqual(result.timeline.items[1].dependencies, ["Discovery"]);
  assert.equal(result.timeline.milestones[0].title, "Stakeholder review");
  assert.ok(result.gaps.some((gap) => gap.itemTitle === "Launch readiness" && gap.field === "start"));
  assert.ok(result.assumptions.some((assumption) => assumption.includes("No dates were inferred")));
  assert.match(result.renders.mermaid_gantt, /gantt/);
});

test("createTimeline parses CSV rows while preserving owners, dates, status, and dependencies", () => {
  const result = createTimeline({
    sources: [
      {
        id: "csv",
        type: "csv",
        content: [
          "title,type,start,end,owner,status,dependencies",
          "Design,task,2026-07-01,2026-07-03,FE,done,",
          "QA signoff,milestone,2026-07-04,,QA,blocked,Design"
        ].join("\n")
      }
    ]
  });

  assert.equal(result.timeline.items[0].owner, "FE");
  assert.equal(result.timeline.items[0].status, "done");
  assert.equal(result.timeline.items[1].type, "milestone");
  assert.deepEqual(result.timeline.items[1].dependencies, ["Design"]);
  assert.equal(result.timeline.items[1].source_refs[0].sourceId, "csv");
});

test("createTimeline parses JSON without losing supplied fields", () => {
  const result = createTimeline({
    sources: [
      {
        id: "json",
        type: "json",
        content: JSON.stringify({
          items: [
            {
              title: "Integration",
              type: "task",
              start: "2026-08-10",
              end: "2026-08-12",
              owner: "Platform",
              status: "at risk",
              dependencies: ["Schema"],
              confidence: 0.7,
              source_refs: [{ sourceId: "upstream", line: 3 }]
            }
          ],
          assumptions: ["Imported from existing plan"]
        })
      }
    ]
  });

  assert.equal(result.timeline.items[0].title, "Integration");
  assert.equal(result.timeline.items[0].confidence, 0.7);
  assert.deepEqual(result.timeline.items[0].source_refs, [{ sourceId: "upstream", line: 3 }]);
  assert.ok(result.assumptions.includes("Imported from existing plan"));
});

test("validateTimeline detects missing dates, circular dependencies, and ambiguous milestone ownership", () => {
  const timeline = {
    items: [
      { title: "A", type: "task", dependencies: ["B"], source_refs: [] },
      { title: "B", type: "task", start: "2026-09-01", dependencies: ["A"], source_refs: [] },
      { title: "Go live", type: "milestone", start: "2026-09-10", source_refs: [] }
    ],
    milestones: [],
    assumptions: [],
    gaps: [],
    render: {}
  };

  const result = validateTimeline(timeline);

  assert.ok(result.gaps.some((gap) => gap.itemTitle === "A" && gap.field === "start"));
  assert.ok(result.gaps.some((gap) => gap.itemTitle === "Go live" && gap.field === "owner"));
  assert.ok(result.issues.some((issue) => issue.type === "circular_dependency"));
});

test("renderTimeline returns valid Mermaid gantt, Mermaid timeline, and compact Markdown", () => {
  const timeline = {
    items: [
      {
        title: "Discovery",
        type: "task",
        start: "2026-06-01",
        end: "2026-06-05",
        owner: "TPM",
        status: "planned",
        dependencies: [],
        source_refs: []
      },
      {
        title: "Launch",
        type: "milestone",
        start: "2026-06-10",
        owner: "PM",
        status: "planned",
        dependencies: ["Discovery"],
        source_refs: []
      }
    ],
    milestones: [],
    assumptions: [],
    gaps: [],
    render: {}
  };

  assert.match(renderTimeline(timeline, { format: "mermaid_gantt" }), /^gantt\n/);
  assert.match(renderTimeline(timeline, { format: "mermaid_timeline" }), /^timeline\n/);
  assert.match(renderTimeline(timeline, { format: "markdown" }), /## Timeline/);
});

test("refineTimeline applies edits while preserving evidence and assumptions", () => {
  const timeline = {
    items: [
      {
        title: "Launch readiness",
        type: "task",
        owner: "TPM",
        dependencies: [],
        source_refs: [{ sourceId: "notes", line: 4 }]
      }
    ],
    milestones: [],
    assumptions: ["No dates were inferred."],
    gaps: [],
    render: {}
  };

  const refined = refineTimeline(timeline, {
    updates: [{ matchTitle: "Launch readiness", set: { start: "2026-06-15", end: "2026-06-17" } }]
  });

  assert.equal(refined.items[0].title, "Launch readiness");
  assert.equal(refined.items[0].owner, "TPM");
  assert.equal(refined.items[0].start, "2026-06-15");
  assert.deepEqual(refined.items[0].source_refs, [{ sourceId: "notes", line: 4 }]);
  assert.ok(refined.assumptions.includes("No dates were inferred."));
});
