import assert from "node:assert/strict";
import test from "node:test";

import {
  createTimeline,
  normalizeTimeline,
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
  assert.ok(
    result.assumptions.some((assumption) => assumption.includes("Critical path is not computed"))
  );
  assert.match(result.renders.mermaid_gantt, /gantt/);
});

test("createTimeline returns grouped follow-ups and evidence reasons for review", () => {
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

  assert.equal(result.timeline.items[0].evidence_reason, "Exact date evidence (YYYY-MM-DD) found in source text.");
  assert.equal(result.timeline.items[2].evidence_reason, "No date evidence found; timeline placement needs human follow-up.");
  assert.ok(result.followups.by_field.start.some((followup) => followup.itemTitle === "Launch readiness"));
  assert.ok(result.followups.by_owner.TPM.some((followup) => followup.itemTitle === "Launch readiness"));
  assert.match(result.renders.review_report, /## Follow-Up Questions/);
  assert.match(result.renders.review_report, /Launch readiness/);
});

test("evidence_grade replaces numeric confidence with deterministic grades", () => {
  const result = createTimeline({
    sources: [
      {
        id: "notes",
        type: "text",
        content: [
          "Alpha: 2026-06-01 to 2026-06-02 owner TPM",
          "Beta on June 10, 2026 owner PM",
          "Gamma owner QA"
        ].join("\n")
      }
    ]
  });

  const byTitle = new Map(result.timeline.items.map((item) => [item.title, item]));
  assert.equal(byTitle.get("Alpha").evidence_grade, "exact");
  assert.equal(byTitle.get("Beta").evidence_grade, "derived");
  assert.equal(byTitle.get("Gamma").evidence_grade, "missing");
  assert.equal(byTitle.get("Gamma").evidence_reason, "No date evidence found; timeline placement needs human follow-up.");
  for (const item of result.timeline.items) {
    assert.equal(item.confidence, undefined);
    assert.equal(item.confidence_reason, undefined);
  }
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
  assert.equal(result.timeline.items[0].evidence_grade, "fuzzy");
  assert.equal(result.timeline.items[1].start, "2026-06-15");
  assert.equal(result.timeline.items[1].evidence_grade, "exact");
   assert.deepEqual(result.timeline.items[0].source_refs, [
    {
      source_id: "program-note",
      locator: "docs/program.md:12",
      path: "docs/program.md",
      heading: "Timeline",
      tableRow: 1,
      line: 12,
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
  assert.equal(result.timeline.items[0].evidence_grade, "exact");
  assert.equal(result.timeline.items[1].type, "milestone");
  assert.deepEqual(result.timeline.items[1].dependencies, ["Design"]);
  assert.equal(result.timeline.items[1].source_refs[0].source_id, "csv");
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
              source_refs: [{ source_id: "upstream", locator: "upstream:3", line: 3 }]
            }
          ],
          assumptions: ["Imported from existing plan"]
        })
      }
    ]
  });

  assert.equal(result.timeline.items[0].title, "Integration");
  assert.equal(result.timeline.items[0].evidence_grade, "exact");
   assert.deepEqual(result.timeline.items[0].source_refs, [
    { source_id: "upstream", locator: "upstream:3", line: 3 }
  ]);
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

test("JSON null and primitive imports are diagnosed without crashing", () => {
  for (const content of [JSON.stringify(null), JSON.stringify(42), JSON.stringify("text"), JSON.stringify(true)]) {
    const result = createTimeline({ sources: [{ id: "scalar", type: "json", content }] });
    assert.deepEqual(result.timeline.items, []);
    assert.ok(result.noise_report.warnings.some((warning) => warning.includes("empty timeline")));
  }
});

test("SourceRef metadata rejects control characters and Markdown rendering escapes untrusted text", () => {
  const result = createTimeline({
    sources: [{
      id: "safe-source\n| [bad]",
      type: "json",
      content: {
        assumptions: ["safe assumption", "Authorization: Bearer super-secret"],
        items: [{
          title: "Launch *now*\nnext",
          owner: "PM",
          source_refs: [{
            source_id: "ref\nforged",
            locator: "loc\r\nforged",
            path: "docs/plan\n.md",
            heading: "# Heading\nforged"
          }]
        }]
      }
    }]
  });

  const item = result.timeline.items[0];
  assert.equal(item.source_refs.length, 0);
  assert.deepEqual(result.assumptions, [
    "safe assumption",
    "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.",
    "Critical path is not computed: it cannot be determined defensibly when dates or durations are missing."
  ]);
  assert.ok(result.renders.markdown.includes("Launch \\*now\\* next"));
  assert.doesNotMatch(result.renders.markdown, /\r|\nnext/);
  assert.doesNotMatch(JSON.stringify(result), /super-secret|forged/);
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

test("milestone without an owner produces exactly one owner gap", () => {
  const result = createTimeline({
    sources: [{ id: "notes", type: "text", content: "Go live milestone on 2026-06-17" }]
  });

  const ownerGaps = result.gaps.filter((gap) => gap.field === "owner");
  assert.equal(ownerGaps.length, 1);
  assert.equal(ownerGaps[0].question, "Milestone ownership is ambiguous.");
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
        source_refs: [{ source_id: "notes", locator: "notes:4", line: 4 }]
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
  assert.equal(refined.items[0].evidence_grade, "exact");
  assert.deepEqual(refined.items[0].source_refs, [{ source_id: "notes", locator: "notes:4", line: 4 }]);
  assert.ok(refined.assumptions.includes("No dates were inferred."));
});

test("createTimeline returns a versioned contract with parser diagnostics", () => {
  const result = createTimeline({
    sources: [
      {
        id: "status",
        type: "text",
        content: "Launch decision milestone on June 17, 2026 owner PM\nGenerated: tool output"
      }
    ]
  });

  assert.equal(result.timeline.kind, "timeline");
  assert.equal(result.timeline.schema_version, "0.4.0");
  assert.equal(result.timeline.version, "0.4.0");
  assert.equal(result.diagnostics, result.noise_report);
  assert.equal(result.diagnostics.sources.length, 1);
  assert.equal(result.diagnostics.sources[0].parsed_items, 1);
  assert.equal(result.diagnostics.ignored.metadata_lines, 1);
  assert.equal(result.timeline.items[0].start, "2026-06-17");
  assert.equal(result.timeline.items[0].evidence_grade, "derived");
});

test("createTimeline transforms profiled Markdown note tables into timeline rows", () => {
  const result = createTimeline({
    sources: [
      {
        id: "estimate-notes",
        type: "markdown",
        profile: "estimate_table",
        content: [
          "Generated: May 17, 2026",
          "Project: Atlas CRM Cleanup",
          "",
          "| Note Date | Chunk | Estimated Datetime Note |",
          "| --- | --- | --- |",
          "| Apr 8, 2026 | Estimate 1 | Original committed delivery datetime is Apr 29, 2026, 17:00 ICT. |",
          "| May 17, 2026 | Estimate 3 | Forecast changes again to June 1, 2026, 17:00 ICT. |"
        ].join("\n")
      }
    ]
  });

  assert.deepEqual(
    result.timeline.items.map((item) => [item.title, item.start]),
    [
      ["Atlas CRM Cleanup Estimate 1", "2026-04-29"],
      ["Atlas CRM Cleanup Estimate 3", "2026-06-01"]
    ]
  );
  assert.equal(result.timeline.items[0].evidence_grade, "derived");
  assert.equal(result.diagnostics.sources[0].profile, "estimate_table");
  assert.equal(result.diagnostics.sources[0].parsed_items, 2);
  assert.equal(result.diagnostics.ignored.metadata_lines, 1);
});

test("validateTimeline rejects dates that are not real calendar dates", () => {
  const invalid = validateTimeline({
    items: [{ title: "Sprint review", start: "2026-02-30" }]
  });
  assert.ok(invalid.issues.some((issue) => issue.type === "invalid_date" && issue.field === "start"));

  const valid = validateTimeline({
    items: [{ title: "Leap day", start: "2024-02-29" }]
  });
  assert.ok(!valid.issues.some((issue) => issue.type === "invalid_date"));
});

test("timezone-free datetimes are rejected while timezone-bearing datetimes are accepted", () => {
  const rejected = createTimeline({
    sources: [{ id: "notes", type: "text", content: "Cutover: 2026-06-01T17:00:00 owner SRE" }]
  });
  assert.equal(rejected.timeline.items[0].start, undefined);
  assert.equal(rejected.timeline.items[0].evidence_grade, "missing");
  assert.match(rejected.timeline.items[0].evidence_reason, /Timezone-free datetime rejected/);
  assert.ok(rejected.issues.some((issue) => issue.type === "timezone_free_datetime"));

  const spaceForm = createTimeline({
    sources: [{ id: "notes", type: "text", content: "Cutover: 2026-06-01 17:00 owner SRE" }]
  });
  assert.ok(spaceForm.issues.some((issue) => issue.type === "timezone_free_datetime"));

  const accepted = createTimeline({
    sources: [{ id: "notes", type: "text", content: "Cutover: 2026-06-01T17:00:00+07:00 owner SRE" }]
  });
  assert.equal(accepted.timeline.items[0].start, "2026-06-01");
  assert.equal(accepted.timeline.items[0].evidence_grade, "exact");
  assert.ok(!accepted.issues.some((issue) => issue.type === "timezone_free_datetime"));
});

test("validateTimeline detects start after end, malformed durations, and duplicate dependencies", () => {
  const result = validateTimeline({
    items: [
      { title: "Build", start: "2026-06-05", end: "2026-06-01", owner: "BE" },
      { title: "Deploy", start: "2026-06-02", duration: "5x", owner: "Ops" },
      { title: "Review", start: "2026-06-03", owner: "QA", dependencies: ["Design", "Design"] }
    ]
  });

  assert.ok(result.issues.some((issue) => issue.type === "start_after_end"));
  assert.ok(result.issues.some((issue) => issue.type === "malformed_duration"));
  assert.ok(result.issues.some((issue) => issue.type === "duplicate_dependencies"));
});

test("validateTimeline detects missing titles and duplicate ids", () => {
  const result = createTimeline({
    sources: [
      {
        id: "json",
        type: "json",
        content: {
          items: [
            { start: "2026-06-01", end: "2026-06-02" },
            { id: "same", title: "First", start: "2026-06-03" },
            { id: "same", title: "Second", start: "2026-06-04" }
          ]
        }
      }
    ]
  });

  assert.equal(result.timeline.items[0].title, "Untitled");
  assert.equal(result.timeline.items[0].missing_title, true);
  assert.ok(result.issues.some((issue) => issue.type === "missing_title"));
  assert.ok(result.issues.some((issue) => issue.type === "duplicate_id"));
});

test("unsupported dangerous fields are dropped and reported", () => {
  const result = createTimeline({
    sources: [
      {
        id: "json",
        type: "json",
        content: JSON.parse(
          '{"items":[{"title":"Task","start":"2026-06-01","exec":"rm -rf /","__proto__":{"polluted":true}}]}'
        )
      }
    ]
  });

  assert.equal(result.timeline.items[0].exec, undefined);
  assert.deepEqual([...result.timeline.items[0].dangerous_fields].sort(), ["__proto__", "exec"]);
  assert.ok(result.issues.some((issue) => issue.type === "unsupported_dangerous_field"));
});

test("canonical: null evidence entries are dropped and unsafe item metadata is bounded", () => {
  const dangerousFields = [null, 42, "", "raw_content", "token=secret", ...Array.from({ length: 60 }, (_, index) => `field-${index}`)];
  const normalized = normalizeTimeline({
    items: [{ title: "Task", kind: "task\nkind", dangerous_fields: dangerousFields }],
    gaps: [null, undefined, { itemTitle: "Task" }],
    issues: [null, { message: "safe" }, undefined]
  });

  assert.deepEqual(normalized.gaps, [{ itemTitle: "Task" }]);
  assert.deepEqual(normalized.issues, [{ message: "safe" }]);
  assert.equal(normalized.items[0].kind, undefined);
  assert.equal(normalized.items[0].dangerous_fields.length, 45);
  assert.ok(normalized.items[0].dangerous_fields.every((field) => /^field-\d+$/.test(field)));
  assert.doesNotMatch(JSON.stringify(normalized), /raw_content|token=secret|task\\nkind/);
});

test("canonical: nested null evidence values are omitted without sparse arrays", () => {
  const normalized = normalizeTimeline({
    items: [],
    gaps: [{
      keep: "gap",
      omit: null,
      nested: [null, { keep: "nested", omit: null }, [null, "value", null]]
    }],
    issues: [{
      keep: "issue",
      details: { omit: null, entries: [null, { keep: "detail", omit: null }] }
    }]
  });

  assert.deepEqual(normalized.gaps, [{
    keep: "gap",
    nested: [{ keep: "nested" }, ["value"]]
  }]);
  assert.deepEqual(normalized.issues, [{
    keep: "issue",
    details: { entries: [{ keep: "detail" }] }
  }]);
  assert.doesNotMatch(JSON.stringify(normalized), /null/);
  assert.doesNotMatch(renderTimeline(normalized, { format: "review_report" }), /undefined|null/);
});

test("M1: refine with exact dates clears the fuzzy gap and window", () => {
  const refined = refineTimeline(
    {
      items: [
        {
          title: "API readiness",
          type: "task",
          time_window: "W3-W4 May 2026",
          date_text: "W3-W4 May 2026",
          exact_date_needed: true,
          owner: "Platform",
          dependencies: [],
          source_refs: [{ source_id: "program-note", locator: "program-note:12", line: 12 }]
        }
      ]
    },
    {
      updates: [{ matchTitle: "API readiness", set: { start: "2026-05-20" } }]
    }
  );

  const item = refined.items[0];
  assert.equal(item.start, "2026-05-20");
  assert.equal(item.time_window, undefined);
  assert.equal(item.date_text, undefined);
  assert.equal(item.exact_date_needed, false);
  assert.equal(item.evidence_grade, "exact");
  assert.equal(item.date_derivation, "explicit");
  assert.deepEqual(item.source_refs, [{ source_id: "program-note", locator: "program-note:12", line: 12 }]);
  assert.ok(!refined.gaps.some((gap) => gap.itemTitle === "API readiness" && gap.field === "exact_date"));
});

test("M1: refine with a fuzzy window clears stale exact dates", () => {
  const refined = refineTimeline(
    {
      items: [
        { title: "Cutover", type: "task", start: "2026-07-08", end: "2026-07-09", owner: "SRE", dependencies: [], source_refs: [] }
      ]
    },
    {
      updates: [{ matchId: "cutover", set: { time_window: "W2 July 2026" } }]
    }
  );

  const item = refined.items[0];
  assert.equal(item.start, undefined);
  assert.equal(item.end, undefined);
  assert.equal(item.time_window, "W2 July 2026");
  assert.equal(item.exact_date_needed, true);
  assert.equal(item.evidence_grade, "fuzzy");
  assert.equal(item.date_derivation, "none");
  assert.ok(refined.gaps.some((gap) => gap.itemTitle === "Cutover" && gap.field === "exact_date"));
});

test("M2: caller-supplied evidence_grade cannot override computed evidence", () => {
  const result = createTimeline({
    sources: [
      {
        id: "json",
        type: "json",
        content: {
          items: [
            { title: "Exact but claimed fuzzy", start: "2026-06-01", evidence_grade: "fuzzy" },
            { title: "Derived but claimed exact", start: "June 10, 2026", evidence_grade: "exact" },
            { title: "Fuzzy but claimed exact", time_window: "W2 July 2026", evidence_grade: "exact" }
          ]
        }
      }
    ]
  });

  const byTitle = new Map(result.timeline.items.map((item) => [item.title, item]));
  assert.equal(byTitle.get("Exact but claimed fuzzy").evidence_grade, "exact");
  assert.equal(byTitle.get("Derived but claimed exact").evidence_grade, "derived");
  assert.equal(byTitle.get("Fuzzy but claimed exact").evidence_grade, "fuzzy");
});

test("M2: refine cannot override the computed evidence grade", () => {
  const refined = refineTimeline(
    {
      items: [{ title: "Task", type: "task", dependencies: [], source_refs: [] }]
    },
    {
      updates: [{ matchTitle: "Task", set: { start: "2026-06-01", evidence_grade: "missing" } }]
    }
  );

  assert.equal(refined.items[0].evidence_grade, "exact");
  assert.equal(refined.items[0].evidence_reason, "Exact date evidence (YYYY-MM-DD) found in source text.");
});

test("M2: date_derivation keeps derived grades stable through re-normalization", () => {
  const normalized = normalizeTimeline({
    items: [
      { title: "Beta", start: "2026-06-10", date_derivation: "natural" },
      { title: "Gamma", start: "2026-06-11", date_derivation: "explicit" },
      { title: "Delta", start: "2026-06-12" }
    ]
  });

  const byTitle = new Map(normalized.items.map((item) => [item.title, item]));
  assert.equal(byTitle.get("Beta").evidence_grade, "derived");
  assert.equal(byTitle.get("Beta").date_derivation, "natural");
  assert.equal(byTitle.get("Gamma").evidence_grade, "exact");
  assert.equal(byTitle.get("Gamma").date_derivation, "explicit");
  assert.equal(byTitle.get("Delta").evidence_grade, "exact");
  assert.equal(byTitle.get("Delta").date_derivation, "explicit");
});

test("refine requires matchTitle or matchId on every update", () => {
  assert.throws(
    () =>
      refineTimeline(
        { items: [{ title: "Task" }] },
        { updates: [{ set: { start: "2026-06-01" } }] }
      ),
    /matchTitle.*matchId/
  );
});

test("M3: Markdown source refs point at original lines and rows without text", () => {
  const result = createTimeline({
    sources: [
      {
        id: "program-note",
        type: "markdown",
        path: "docs/program.md",
        content: [
          "# Plan",
          "## Timeline",
          "",
          "| Project | Estimated Date | Status |",
          "| --- | --- | --- |",
          "| API readiness | June 15, 2026 | At risk |",
          "| Cutover | 2026-06-20 | Planned |"
        ].join("\n")
      }
    ]
  });

  assert.deepEqual(
    result.timeline.items.map((item) => item.title),
    ["API readiness", "Cutover"]
  );
  assert.equal(result.timeline.items[0].start, "2026-06-15");
  assert.equal(result.timeline.items[0].evidence_grade, "derived");
  assert.deepEqual(result.timeline.items[0].source_refs, [
    {
      source_id: "program-note",
      locator: "docs/program.md:6",
      path: "docs/program.md",
      heading: "Timeline",
      tableRow: 1,
      line: 6,
    }
  ]);
  assert.deepEqual(result.timeline.items[1].source_refs, [
    {
      source_id: "program-note",
      locator: "docs/program.md:7",
      path: "docs/program.md",
      heading: "Timeline",
      tableRow: 2,
      line: 7,
    }
  ]);
});

test("M3: profiled note-table transforms keep locator provenance", () => {
  const result = createTimeline({
    sources: [
      {
        id: "estimate-notes",
        type: "markdown",
        profile: "estimate_table",
        content: [
          "Generated: May 17, 2026",
          "Project: Atlas CRM Cleanup",
          "",
          "| Note Date | Chunk | Estimated Datetime Note |",
          "| --- | --- | --- |",
          "| Apr 8, 2026 | Estimate 1 | Original committed delivery datetime is Apr 29, 2026, 17:00 ICT. |",
          "| May 17, 2026 | Estimate 3 | Forecast changes again to June 1, 2026, 17:00 ICT. |"
        ].join("\n")
      }
    ]
  });

  assert.deepEqual(
    result.timeline.items.map((item) => [item.title, item.start]),
    [
      ["Atlas CRM Cleanup Estimate 1", "2026-04-29"],
      ["Atlas CRM Cleanup Estimate 3", "2026-06-01"]
    ]
  );
  assert.deepEqual(result.timeline.items[0].source_refs, [
    {
      source_id: "estimate-notes",
      locator: "estimate-notes:6",
      tableRow: 1,
      line: 6,
   }
  ]);
  assert.deepEqual(result.timeline.items[1].source_refs, [
    {
      source_id: "estimate-notes",
      locator: "estimate-notes:7",
      tableRow: 2,
      line: 7,
   }
  ]);
});

test("canonical source refs are locator-only while retaining stable provenance locators", () => {
  const result = createTimeline({
    sources: [
      {
        id: "private-program-note",
        type: "markdown",
        path: "private/program.md",
         include_source_text: true,
        content: [
          "## Timeline",
          "",
          "| Project | Estimated Date | Status |",
          "| --- | --- | --- |",
          "| API readiness | June 15, 2026 | At risk |"
        ].join("\n")
      }
    ]
  });

  assert.deepEqual(result.timeline.items[0].source_refs, [
    {
      source_id: "private-program-note",
      locator: "private/program.md:5",
      path: "private/program.md",
      heading: "Timeline",
      tableRow: 1,
      line: 5
    }
  ]);
  assert.equal(result.timeline.items[0].start, "2026-06-15");
});

test("canonical locator-only refs cover text, Markdown, CSV, JSON refs, gaps, and follow-ups", () => {
  const result = createTimeline({
    include_source_text: false,
    sources: [
      {
        id: "notes",
        type: "text",
        content: "Unscheduled launch owner TPM"
      },
      {
        id: "plan",
        type: "markdown",
        path: "docs/plan.md",
        content: [
          "## Timeline",
          "| Item | Target | Owner |",
          "| --- | --- | --- |",
          "| Cutover | 2026-06-20 | SRE |"
        ].join("\n")
      },
      {
        id: "export",
        type: "csv",
        content: "title,start,owner\nQA,2026-06-21,QA"
      },
      {
        id: "imported",
        type: "json",
        content: {
          items: [{
            title: "Imported",
            start: "2026-06-22",
            owner: "PM",
            source_refs: [{ source_id: "upstream", locator: "upstream:42", line: 42, text: "Sensitive upstream row" }]
          }]
        }
      }
    ]
  });

  const byTitle = new Map(result.timeline.items.map((item) => [item.title, item]));
  assert.equal(byTitle.get("Unscheduled launch").source_refs[0].text, undefined);
  assert.equal(byTitle.get("Unscheduled launch").source_refs[0].locator, "notes:1");
  assert.equal(byTitle.get("Cutover").source_refs[0].text, undefined);
  assert.equal(byTitle.get("Cutover").source_refs[0].line, 4);
  assert.equal(byTitle.get("QA").source_refs[0].text, undefined);
  assert.equal(byTitle.get("QA").source_refs[0].line, 2);
   assert.equal(byTitle.get("Imported").source_refs[0].text, undefined);
  assert.equal(byTitle.get("Imported").source_refs[0].locator, "upstream:42");

  const launchGap = result.gaps.find((gap) => gap.itemTitle === "Unscheduled launch" && gap.field === "start");
  assert.ok(launchGap);
  assert.equal(launchGap.source_refs[0].text, undefined);
  const launchFollowup = result.followups.by_field.start.find(
    (followup) => followup.itemTitle === "Unscheduled launch"
  );
  assert.ok(launchFollowup);
  assert.equal(launchFollowup.source_refs[0].text, undefined);
});

test("Mermaid renders escape commas in item labels", () => {
  const timeline = {
    items: [
      {
        title: "Cutover, EU & APAC",
        type: "task",
        start: "2026-06-01",
        end: "2026-06-02",
        owner: "SRE, EU",
        status: "planned",
        dependencies: [],
        source_refs: []
      }
    ],
    milestones: [],
    assumptions: [],
    gaps: [],
    render: {}
  };

  const gantt = renderTimeline(timeline, { format: "mermaid_gantt" });
  assert.match(gantt, /Cutover- EU & APAC \(SRE- EU\)/);
  assert.doesNotMatch(gantt, /Cutover, EU/);

  const mermaidTimeline = renderTimeline(timeline, { format: "mermaid_timeline" });
  assert.match(mermaidTimeline, /Cutover- EU & APAC/);
  assert.doesNotMatch(mermaidTimeline, /Cutover, EU/);
});

test("canonical: legacy sourceId and plain-string refs normalize with deprecation warnings", () => {
  const result = createTimeline({
    sources: [
      {
        id: "legacy-json",
        type: "json",
        content: JSON.stringify({
          items: [
            {
              title: "Legacy ref item",
              type: "task",
              start: "2026-08-01",
              source_refs: [{ sourceId: "upstream", line: 7 }]
            },
            {
              title: "String ref item",
              type: "task",
              start: "2026-08-02",
              source_refs: ["stable-key"]
            }
          ]
        })
      }
    ]
  });

  assert.deepEqual(result.timeline.items[0].source_refs, [
    { source_id: "upstream", locator: "upstream:7", line: 7 }
  ]);
  assert.deepEqual(result.timeline.items[1].source_refs, [
    { source_id: "stable-key", locator: "stable-key" }
  ]);
  const warnings = result.noise_report.warnings;
  assert.ok(
    warnings.some((warning) => warning.includes("Deprecated sourceId") && !warning.includes("upstream")),
    `expected sourceId deprecation warning, got ${JSON.stringify(warnings)}`
  );
  assert.ok(
    warnings.some((warning) => warning.includes("Deprecated plain-string source reference") && !warning.includes("stable-key")),
    `expected plain-string deprecation warning, got ${JSON.stringify(warnings)}`
  );
});

test("canonical: legacy SourceRef.text is stripped, warned, and never copied to note", () => {
  const result = createTimeline({
    sources: [{
      id: "legacy-json",
      type: "json",
      content: {
        items: [{
          title: "Legacy text",
          start: "2026-08-10",
          source_refs: [{
            source_id: "upstream",
            locator: "upstream:10",
            line: 10,
            text: "Sensitive source material",
            note: "keep this note"
          }]
        }]
      }
    }]
  });

  const ref = result.timeline.items[0].source_refs[0];
  assert.equal(ref.text, undefined);
  assert.equal(ref.note, "keep this note");
  assert.ok(result.noise_report.warnings.some((warning) => warning === "Raw evidence content was omitted from a canonical evidence container."));
});

test("canonical: credential-bearing URL boundaries are omitted", () => {
  const result = createTimeline({
    sources: [{
      id: "url-input",
      type: "json",
      content: {
        items: [{
          title: "URL item",
          start: "2026-08-11",
          source_refs: [{
            source_id: "upstream",
            locator: "https://example.test/plan?token=secret",
            url: "https://user:password@example.test/plan"
          }]
        }]
      }
    }]
  });

  assert.deepEqual(result.timeline.items[0].source_refs, [{ source_id: "upstream", locator: "upstream" }]);
});

test("canonical: credential URL key policy covers aliases, AWS keys, assertions, cookies, and multilayer encoding", () => {
  const keys = [
    "AWSAccessKeyId", "client_assertion", "access_key", "cookie",
    "api-key", "x-api-key", "x_api_key"
  ];
  const locators = [];
  for (const key of keys) {
    let encoded = `https://example.test/redirect?${key}=secret`;
    for (let layer = 0; layer < 3; layer += 1) encoded = encodeURIComponent(encoded);
    locators.push(encoded);
  }

  const result = createTimeline({
    sources: [{
      id: "credential-keys",
      type: "json",
      content: {
        items: [{
          title: "Credential key parity",
          start: "2026-08-11",
          source_refs: locators.map((locator, index) => ({
            source_id: `upstream-${index}`,
            locator,
            url: locator,
            path: locator,
            note: locator
          }))
        }]
      }
    }]
  });

  const refs = result.timeline.items[0].source_refs;
  assert.equal(refs.length, keys.length);
  assert.ok(refs.every((ref, index) => ref.source_id === `upstream-${index}`));
  assert.ok(refs.every((ref) => ref.locator.startsWith("upstream-")));
  assert.ok(refs.every((ref) => ref.url === undefined && ref.path === undefined && ref.note === undefined));
  assert.doesNotMatch(JSON.stringify(result), /AWSAccessKeyId|client_assertion|access_key|cookie|x-api-key|secret/);
});

test("canonical: credential assignment policy is shared by locator, path, note, and diagnostics", () => {
  const unsafeValues = [
    "AWSAccessKeyId", "client_assertion", "access_key", "cookie",
    "api-key", "x-api-key", "x_api_key"
  ].map((key) => `https://example.test/redirect?${key}=secret`);
  const result = createTimeline({
    sources: [{
      id: "assignment-boundaries",
      type: "json",
      path: "safe/path.txt",
      source_system: unsafeValues.join(";"),
      content: {
        items: [{
          title: "Assignment boundaries",
          start: "2026-08-12",
          source_refs: unsafeValues.map((value, index) => ({
            source_id: `assignment-${index}`,
            locator: value,
            url: value,
            path: value,
            note: value
          }))
        }]
      }
    }]
  });

  assert.ok(result.timeline.items[0].source_refs.every((ref) => ref.locator.startsWith("assignment-")));
  assert.ok(result.timeline.items[0].source_refs.every((ref) => ref.path === undefined && ref.note === undefined));
  assert.equal(result.diagnostics.sources[0].source_system, undefined);
  assert.doesNotMatch(JSON.stringify(result), /AWSAccessKeyId|client_assertion|access_key|cookie|x-api-key|secret/);
});

test("canonical: locators are deterministic from path or stable source id", () => {
  const result = createTimeline({
    sources: [
      {
        id: "path-source",
        type: "json",
        content: JSON.stringify({
          items: [
            { title: "Path item", type: "task", start: "2026-08-03" },
            { title: "Heading item", type: "task", start: "2026-08-04" }
          ]
        })
      }
    ]
  });

  assert.equal(result.timeline.items[0].source_refs[0].source_id, "path-source");
  assert.equal(result.timeline.items[0].source_refs[0].locator, "path-source:1");

  // A source path is the preferred locator base; unknown fields are dropped.
  const pathResult = createTimeline({
    sources: [
      {
        id: "path-source",
        type: "json",
        path: "docs/plan.json",
        content: JSON.stringify({
          items: [
            {
              title: "Path item",
              type: "task",
              start: "2026-08-03",
              source_refs: [{ source_id: "other", locator: "explicit-pointer", unknown_field: "dropped" }]
            }
          ]
        })
      }
    ]
  });
  assert.deepEqual(pathResult.timeline.items[0].source_refs, [
    { source_id: "other", locator: "explicit-pointer" }
  ]);

  // Fallback refs derive a locator from the source path when one exists.
  const markdownResult = createTimeline({
    sources: [
      {
        id: "path-source",
        type: "text",
        path: "notes/plan.txt",
        content: "Discovery: 2026-08-05"
      }
    ]
  });
  assert.equal(markdownResult.timeline.items[0].source_refs[0].locator, "notes/plan.txt:1");
});

test("canonical: refine throws on unmatched updates and missing set", () => {
  const timeline = {
    items: [
      { title: "Known task", type: "task", dependencies: [], source_refs: [] }
    ]
  };

  assert.throws(
    () => refineTimeline(timeline, { updates: [{ matchTitle: "Ghost", set: { start: "2026-09-01" } }] }),
    /did not match any timeline item/
  );
  assert.throws(
    () => refineTimeline(timeline, { updates: [{ matchTitle: "Known task" }] }),
    /requires a "set" object/
  );
  assert.throws(
    () => refineTimeline(timeline, { updates: [{ matchTitle: "Known task", set: null }] }),
    /requires a "set" object/
  );
});

test("canonical: Mermaid gantt escapes status text", () => {
  const timeline = {
    items: [
      {
        title: "Launch",
        type: "task",
        start: "2026-09-01",
        end: "2026-09-05",
        status: "blocked, on hold",
        dependencies: [],
        source_refs: []
      }
    ],
    milestones: [],
    assumptions: [],
    gaps: [],
    render: {}
  };

  const gantt = renderTimeline(timeline, { format: "mermaid_gantt" });
  assert.match(gantt, /:blocked- on hold, 2026-09-01, 2026-09-05/);
  assert.doesNotMatch(gantt, /:blocked, on hold, 2026-09-01/);
});

test("canonical: normalizeTimeline recursively canonicalizes every evidence container", () => {
  const normalized = normalizeTimeline({
    items: [{
      title: "Task",
      source_refs: [{ source_id: "item", locator: "item:1", text: "private item text" }]
    }],
    gaps: [{
      itemTitle: "Task",
      source_refs: [{ sourceId: "gap", locator: "gap:1", source_excerpt: "private gap text" }],
      nested: { source_refs: ["nested"] }
    }],
    issues: [{
      itemTitle: "Task",
      details: [{ source_refs: [{ source_id: "issue", locator: "issue:1", text: "private issue text" }] }]
    }]
  });

  assert.deepEqual(normalized.items[0].source_refs, [{ source_id: "item", locator: "item:1" }]);
  assert.deepEqual(normalized.gaps[0].source_refs, [{ source_id: "gap", locator: "gap:1" }]);
  assert.deepEqual(normalized.gaps[0].nested.source_refs, [{ source_id: "nested", locator: "nested" }]);
  assert.deepEqual(normalized.issues[0].details[0].source_refs, [{ source_id: "issue", locator: "issue:1" }]);
  assert.doesNotMatch(JSON.stringify(normalized), /private (?:item|gap|issue) text/);
  assert.ok(normalized.warnings.length >= 1);
  assert.ok(normalized.warnings.every((warning) => !/private|sourceId.*gap|nested/.test(warning)));
});

test("canonical: every source parser omits credential-bearing paths and nested URL locators", () => {
  const cases = [
    { type: "text", content: "Task: 2026-09-01" },
    { type: "markdown", content: "## Timeline\n- Task: 2026-09-01" },
    { type: "csv", content: "title,start\nTask,2026-09-01" },
    {
      type: "json",
      content: {
        items: [{
          title: "Task",
          start: "2026-09-01",
          source_refs: [{
            source_id: "json-source",
            locator: "https%3A%2F%2Fexample.test%2Fredirect%3F%255Btoken%255D%3Dsecret"
          }]
        }]
      }
    }
  ];

  for (const source of cases) {
    const result = createTimeline({
      sources: [{ ...source, id: `${source.type}-source`, path: "https://example.test/plan?token=secret" }]
    });
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /token=secret|%255Btoken%255D|example\.test\/plan/);
    assert.ok(result.timeline.items[0].source_refs.every((ref) => !ref.url || !ref.url.includes("token")));
    assert.ok(result.noise_report.warnings.every((warning) => !/secret|example\.test|token=/.test(warning)));
  }
});

test("canonical: URL credential detection reaches a bounded fixpoint beyond three layers", () => {
  const credentialUrl = "https://example.test/redirect?token=secret";
  let encoded = credentialUrl;
  for (let index = 0; index < 4; index += 1) encoded = encodeURIComponent(encoded);

  const result = createTimeline({
    sources: [{
      id: "deep-url",
      type: "json",
      content: {
        items: [{
          title: "Deep URL",
          start: "2026-09-01",
          source_refs: [{ source_id: "upstream", locator: encoded }]
        }]
      }
    }]
  });

  assert.deepEqual(result.timeline.items[0].source_refs, [{ source_id: "upstream", locator: "upstream" }]);
  assert.doesNotMatch(JSON.stringify(result), /token|secret|example\.test/);
});

test("canonical: raw evidence keys are stripped recursively with one generic warning", () => {
  const normalized = normalizeTimeline({
    items: [],
    gaps: [{ body: "private body", nested: { source_excerpt: "private excerpt", safe: "ok" } }],
    issues: [{ details: [{ text: "private text", evidence: { raw_content: "private raw" } }] }]
  });

  assert.deepEqual(normalized.gaps, [{ nested: { safe: "ok" } }]);
  assert.deepEqual(normalized.issues, [{ details: [{ evidence: {} }] }]);
  assert.deepEqual(normalized.warnings, ["Raw evidence content was omitted from a canonical evidence container."]);
  assert.doesNotMatch(JSON.stringify(normalized), /private (?:body|excerpt|text|raw)/);
});

test("canonical: raw evidence aliases and compounds are stripped at every nested gap and issue value", () => {
  const rawKeys = [
    "rawcontent", "raw_content", "contents", "text", "source_excerpt",
    "sourceExcerpt", "source-text", "rawContent", "source_content", "content"
  ];
  const makeEvidence = (prefix) => Object.fromEntries(
    rawKeys.map((key, index) => [key, `${prefix}-${index}`])
  );
  const normalized = normalizeTimeline({
    items: [],
    gaps: [{
      safe: "gap-safe",
      nested: [{ evidence: makeEvidence("gap-raw") }]
    }],
    issues: [{
      safe: "issue-safe",
      details: { evidence: makeEvidence("issue-raw") }
    }]
  });

  assert.deepEqual(normalized.gaps, [{ safe: "gap-safe", nested: [{ evidence: {} }] }]);
  assert.deepEqual(normalized.issues, [{ safe: "issue-safe", details: { evidence: {} } }]);
  assert.deepEqual(normalized.warnings, ["Raw evidence content was omitted from a canonical evidence container."]);
  assert.doesNotMatch(JSON.stringify(normalized), /gap-raw|issue-raw/);
});

test("canonical: path aliases fall back independently and unsafe diagnostics are omitted", () => {
  const result = createTimeline({
    sources: [{
      id: "safe-path",
      type: "text",
      path: "https://example.test/plan?token=secret",
      file_path: "notes/plan.md",
      source_system: "jira token=secret",
      content: "Task: 2026-09-01"
    }]
  });

  assert.equal(result.timeline.items[0].source_refs[0].path, "notes/plan.md");
  assert.equal(result.diagnostics.sources[0].source_system, undefined);
  assert.doesNotMatch(JSON.stringify(result), /token=secret|example\.test/);
});

test("canonical: unsafe SourceRef notes are omitted while benign notes remain", () => {
  const result = createTimeline({
    sources: [{
      id: "notes",
      type: "json",
      content: {
        items: [{
          title: "Safe note",
          start: "2026-09-01",
          source_refs: [
            { source_id: "safe", locator: "safe:1", note: "Reviewed by PM" },
            { source_id: "unsafe", locator: "unsafe:2", note: "source excerpt: private" }
          ]
        }]
      }
    }]
  });

  assert.equal(result.timeline.items[0].source_refs[0].note, "Reviewed by PM");
  assert.equal(result.timeline.items[0].source_refs[1].note, undefined);
  assert.doesNotMatch(JSON.stringify(result), /private/);
});

test("canonical: legacy version metadata is stamped current with an explicit warning", () => {
  const normalized = normalizeTimeline({ schema_version: "0.3.0", version: "0.3.0", items: [] });

  assert.equal(normalized.schema_version, "0.4.0");
  assert.equal(normalized.version, "0.4.0");
  assert.equal(normalized.warnings.length, 2);
  assert.ok(normalized.warnings.every((warning) => warning.includes("current contract version")));
});

test("canonical: SourceRef scalar metadata is validated, bounded, and warned generically", () => {
  const hash = "a".repeat(64);
  const normalized = normalizeTimeline({
    items: [{
      title: "Metadata",
      source_refs: [{
        source_id: "source",
        locator: "source:1",
        observed_at: "not-a-date",
        source_updated_at: "https://example.test/?token=secret",
        revision: { secret: "value" },
        content_hash: "bad-hash",
        note: "n".repeat(3000)
      }, {
        source_id: "valid",
        locator: "valid:1",
        observed_at: "2026-08-13T12:34:56Z",
        source_updated_at: "2026-08-13T12:34:56.123+00:00",
        revision: "r1",
        content_hash: `sha256:${hash}`
      }]
    }]
  });

  const [invalid, valid] = normalized.items[0].source_refs;
  assert.equal(invalid.observed_at, undefined);
  assert.equal(invalid.source_updated_at, undefined);
  assert.equal(invalid.revision, undefined);
  assert.equal(invalid.content_hash, undefined);
  assert.equal(invalid.note.length, 2048);
  assert.equal(valid.observed_at, "2026-08-13T12:34:56Z");
  assert.equal(valid.source_updated_at, "2026-08-13T12:34:56.123+00:00");
  assert.equal(valid.content_hash, `sha256:${hash}`);
  assert.deepEqual(normalized.warnings, ["Invalid or credential-bearing SourceRef metadata was omitted."]);
});

test("canonical: runtime bounds protect refs, assumptions, warnings, and nested evidence containers", () => {
  const sourceRefs = Array.from({ length: 25 }, (_, index) => ({ source_id: `source-${index}`, locator: `source-${index}:1` }));
  const assumptions = Array.from({ length: 105 }, (_, index) => `assumption-${index}-${"x".repeat(3000)}`);
  const nested = { value: "x".repeat(3000) };
  let deep = nested;
  for (let index = 0; index < 20; index += 1) deep = { nested: deep };
  const normalized = normalizeTimeline({
    assumptions,
    items: [{ title: "Bounded", source_refs: sourceRefs }],
    gaps: Array.from({ length: 105 }, (_, index) => ({ source_id: `diagnostic-${index}`, deep }))
  });

  assert.equal(normalized.items[0].source_refs.length, 20);
  assert.equal(normalized.assumptions.length, 100);
  assert.ok(normalized.assumptions.every((value) => value.length === 2048));
  assert.ok(normalized.gaps.length <= 100);
  assert.ok(normalized.warnings.length <= 50);
  assert.doesNotMatch(JSON.stringify(normalized), /diagnostic-100/);
});

test("review rendering includes locator-only refs as source id at locator", () => {
  const rendered = renderTimeline({
    items: [{ title: "Task", start: "2026-08-13", source_refs: [{ source_id: "plan", locator: "plan:7" }] }]
  }, { format: "review_report" });
  assert.match(rendered, /plan @ plan:7/);
  assert.doesNotMatch(rendered, /plan, plan:7/);
});
