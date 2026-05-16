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

test("createTimeline returns grouped follow-ups and confidence reasons for review", () => {
  const result = createTimeline({
    sources: [
      {
        id: "notes",
        type: "text",
        content: [
          "Discovery: 2026-06-01 to 2026-06-05 owner TPM status planned",
          "Build API: starts 2026-06-06 duration 5d owner BE depends on Discovery",
          "Launch readiness owner TPM depends on Build API"
        ].join("\n")
      }
    ]
  });

  assert.equal(result.timeline.items[0].confidence_reason, "Exact date evidence found in source text.");
  assert.equal(result.timeline.items[2].confidence_reason, "No exact dates found; timeline placement needs human follow-up.");
  assert.ok(result.followups.by_field.start.some((followup) => followup.itemTitle === "Launch readiness"));
  assert.ok(result.followups.by_owner.TPM.some((followup) => followup.itemTitle === "Launch readiness"));
  assert.match(result.renders.review_report, /## Follow-Up Questions/);
  assert.match(result.renders.review_report, /Launch readiness/);
});

test("createTimeline filters Markdown to planning sections, parses tables, and reports ignored noise", () => {
  const result = createTimeline({
    sources: [
      {
        id: "program-note",
        type: "markdown",
        path: "docs/program.md",
        content: [
          "---",
          "title: MAG rollout",
          "owner: TPM",
          "---",
          "# MAG Rollout",
          "This prose explains context and should not become a timeline item.",
          "",
          "## Timeline",
          "",
          "| Item | Target | Owner | Status |",
          "| --- | --- | --- | --- |",
          "| API readiness for MAG | W3-W4 May 2026 | Platform | At risk |",
          "| Cutover rehearsal | 2026-06-15 | SRE | Planned |",
          "",
          "## Notes",
          "This prose should also be ignored."
        ].join("\n")
      }
    ]
  });

  assert.deepEqual(
    result.timeline.items.map((item) => item.title),
    ["API readiness for MAG", "Cutover rehearsal"]
  );
  assert.equal(result.timeline.items[0].time_window, "W3-W4 May 2026");
  assert.equal(result.timeline.items[0].exact_date_needed, true);
  assert.equal(result.timeline.items[0].start, undefined);
  assert.equal(result.timeline.items[1].start, "2026-06-15");
  assert.deepEqual(result.timeline.items[0].source_refs, [
    {
      sourceId: "program-note",
      path: "docs/program.md",
      heading: "Timeline",
      tableRow: 1,
      line: 12,
      text: "| API readiness for MAG | W3-W4 May 2026 | Platform | At risk |"
    }
  ]);
  assert.equal(result.noise_report.ignored.frontmatter_lines, 4);
  assert.ok(result.noise_report.ignored.prose_lines >= 2);
  assert.equal(result.noise_report.ignored.table_rows_without_dates, 0);
  assert.ok(
    result.gaps.some(
      (gap) => gap.itemTitle === "API readiness for MAG" && gap.field === "exact_date"
    )
  );
});

test("createTimeline honors Markdown heading allowlists and counts table rows without dates", () => {
  const result = createTimeline({
    markdown: {
      sections: ["Follow-Ups"]
    },
    sources: [
      {
        id: "weekly",
        type: "markdown",
        content: [
          "# Weekly",
          "## Timeline",
          "- Should be ignored: 2026-07-01 owner PM",
          "## Follow-Ups",
          "| Follow-Up | Owner | Status | Target |",
          "| --- | --- | --- | --- |",
          "| Confirm migration window | TPM | Open | W2 July 2026 |",
          "| Share launch notes | PM | Open | |"
        ].join("\n")
      }
    ]
  });

  assert.deepEqual(
    result.timeline.items.map((item) => item.title),
    ["Confirm migration window", "Share launch notes"]
  );
  assert.equal(result.timeline.items[0].time_window, "W2 July 2026");
  assert.equal(result.timeline.items[1].owner, "PM");
  assert.equal(result.noise_report.ignored.table_rows_without_dates, 1);
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

test("createTimeline reports source-aware JSON parse diagnostics", () => {
  assert.throws(
    () =>
      createTimeline({
        sources: [{ id: "bad-json", type: "json", content: "{ nope" }]
      }),
    /Unable to parse JSON source "bad-json"/
  );
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
  assert.deepEqual(
    result.gaps
      .filter((gap) => gap.itemTitle === "Go live" && gap.field === "owner")
      .map((gap) => gap.question),
    ["Milestone ownership is ambiguous."]
  );
  assert.ok(result.issues.some((issue) => issue.type === "circular_dependency"));
});

test("validateTimeline suggests likely dependency titles without silently resolving them", () => {
  const result = validateTimeline({
    items: [
      { title: "Build API", type: "task", start: "2026-09-01", end: "2026-09-03", owner: "BE" },
      { title: "QA", type: "task", start: "2026-09-04", duration: "2d", owner: "QA", dependencies: ["build api"] }
    ]
  });

  const issue = result.issues.find((candidate) => candidate.type === "unknown_dependency");
  assert.deepEqual(issue.suggestions, ["Build API"]);
});

test("createTimeline groups dependency follow-ups separately from date and owner gaps", () => {
  const result = createTimeline({
    sources: [
      {
        id: "notes",
        type: "text",
        content: "QA: starts 2026-09-04 duration 2d owner QA depends on build api"
      }
    ]
  });

  assert.ok(result.followups.by_dependency["build api"].some((followup) => followup.itemTitle === "QA"));
  assert.equal(result.followups.by_dependency["build api"][0].field, "dependency");
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
