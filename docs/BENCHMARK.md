# Timeline Truth Benchmark

Generated: 2026-05-16T06:40:05.162Z
Package: timeline-truth v0.2.1
Commit: fda9769
Node: v24.14.0
Benchmark iterations per fixture: 1000

## Method

- Before means the checked-in source material as a TPM, PM, or agent would receive it before running Timeline Truth.
- After means the actual `createTimeline` result produced by this repo from the same source content. The CLI and MCP tools use this same implementation path for timeline creation.
- Expected fixture comparison only checks the asserted public benchmark contract: item titles and known gaps. It does not prove perfect timeline understanding.
- This benchmark does not measure a live LLM, human reviewer, hosted MCP-client latency, Jira import quality, or real Confluence/Slack material.

## Truth Summary

| Metric | Actual Result |
| --- | ---: |
| Fixture inputs benchmarked | 4 |
| Raw planning entries before tool use | 16 |
| Exact date strings visible in raw inputs | 16 |
| Extracted timeline items after tool use | 16 |
| Extracted milestones after tool use | 4 |
| Extracted items with source refs | 16/16 |
| Expected item titles matched | 16/16 |
| Expected gaps found | 11/11 |
| Extra gaps beyond fixtures | 0 |
| Dependency/date issues reported | 0 |
| Follow-up questions generated | 11 |
| Mermaid/Markdown/review renders generated | 4/4 fixture sets |
| Average createTimeline runtime | 0.0415 ms |
| P95 createTimeline runtime, worst fixture | 0.1274 ms |

## Before vs After

| Fixture | Before Raw Entries | After Items | After Gaps | Source Ref Coverage | Expected Titles | Expected Gaps | Avg Runtime | P95 Runtime |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| PRD snippet | 4 | 4 | 2 | 4/4 | 4/4 | 2/2 | 0.0467 ms | 0.1187 ms |
| Jira CSV export | 4 | 4 | 3 | 4/4 | 4/4 | 3/3 | 0.0313 ms | 0.0569 ms |
| Launch checklist | 4 | 4 | 2 | 4/4 | 4/4 | 2/2 | 0.0429 ms | 0.1003 ms |
| Status update | 4 | 4 | 4 | 4/4 | 4/4 | 4/4 | 0.0451 ms | 0.1274 ms |

## Gap Breakdown

| Field | Count |
| --- | ---: |
| start | 4 |
| end | 5 |
| owner | 2 |

## Honest Interpretation

- Useful: the tool reliably turns these four messy fixtures into normalized timeline items, source references, gaps, follow-up questions, and renderable artifacts.
- Useful: it matched all checked-in expected item titles and expected gaps in this benchmark run.
- Useful: it did not invent missing dates or owners; those appeared as gaps.
- Limitation: the benchmark corpus is small and maintained inside this repo, so it is a regression benchmark, not independent proof of general-world accuracy.
- Limitation: no dependency issues appeared in the examples, so this run does not validate difficult dependency repair beyond unit tests.
- Limitation: the parser is heuristic; Markdown/CSV structure helps. Free-form prose outside the tested shape may perform worse.

## Per-Fixture Actual Results

### PRD snippet

Source: `examples/prd-snippet.md` (markdown)

#### Before: Raw Input

```markdown
# Payments Launch PRD Timeline

Discovery: 2026-06-01 to 2026-06-05 owner PM status planned
API contract: starts 2026-06-06 duration 4d owner Platform status planned depends on Discovery
Checkout QA: owner QA status planned depends on API contract
Launch decision milestone on 2026-06-17 owner PM status planned depends on Checkout QA
```

#### After: Benchmark Summary

```json
{
  "before": {
    "nonEmptyLines": 5,
    "rawEntries": 4,
    "exactDateMentions": 4,
    "ownerMentions": 4,
    "dependencyMentions": 3
  },
  "after": {
    "itemCount": 4,
    "milestoneCount": 1,
    "gapCount": 2,
    "issueCount": 0,
    "followupCount": 2,
    "sourceRefCoverage": 4,
    "titles": [
      "Discovery",
      "API contract",
      "Checkout QA",
      "Launch decision"
    ],
    "gaps": [
      {
        "itemTitle": "Checkout QA",
        "field": "start",
        "question": "Missing start date. Ask for the planned start date instead of inferring it."
      },
      {
        "itemTitle": "Checkout QA",
        "field": "end",
        "question": "Missing end date or duration for a non-milestone item."
      }
    ],
    "issues": [],
    "noiseReport": {
      "ignored": {
        "frontmatter_lines": 0,
        "prose_lines": 0,
        "table_rows_without_dates": 0
      }
    },
    "renderLengths": {
      "mermaid_gantt": 318,
      "mermaid_timeline": 146,
      "markdown": 575,
      "review_report": 1275
    }
  },
  "validation": {
    "expectedTitles": 4,
    "expectedTitlesMatched": 4,
    "titleOrderExact": true,
    "expectedGaps": 2,
    "expectedGapsFound": 2,
    "extraGaps": []
  },
  "runtime": {
    "iterations": 1000,
    "minMs": 0.0263,
    "averageMs": 0.046685,
    "p50Ms": 0.0329,
    "p95Ms": 0.1187,
    "maxMs": 0.4105
  }
}
```

#### After: Review Report Output

```markdown
## Timeline Review

### Items
- **Discovery** (task, planned) - 2026-06-01 to 2026-06-05 - owner: PM
  - Confidence: 0.75 - Exact date evidence found in source text.
  - Source: prd-snippet, examples/prd-snippet.md, heading "Payments Launch PRD Timeline", line 3
- **API contract** (task, planned) - 2026-06-06 for 4d - owner: Platform
  - Confidence: 0.75 - Exact date evidence found in source text.
  - Source: prd-snippet, examples/prd-snippet.md, heading "Payments Launch PRD Timeline", line 4
- **Checkout QA** (task, planned) - date needed - owner: QA
  - Confidence: 0.45 - No exact dates found; timeline placement needs human follow-up.
  - Source: prd-snippet, examples/prd-snippet.md, heading "Payments Launch PRD Timeline", line 5
- **Launch decision** (milestone, planned) - 2026-06-17 - owner: PM
  - Confidence: 0.75 - Exact date evidence found in source text.
  - Source: prd-snippet, examples/prd-snippet.md, heading "Payments Launch PRD Timeline", line 6

### Follow-Up Questions
- Checkout QA (QA): Missing start date. Ask for the planned start date instead of inferring it.
- Checkout QA (QA): Missing end date or duration for a non-milestone item.

### Assumptions
- No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.
```

#### After: Full createTimeline JSON

```json
{
  "timeline": {
    "items": [
      {
        "id": "discovery",
        "title": "Discovery",
        "type": "task",
        "start": "2026-06-01",
        "end": "2026-06-05",
        "exact_date_needed": false,
        "owner": "PM",
        "status": "planned",
        "dependencies": [],
        "confidence": 0.75,
        "confidence_reason": "Exact date evidence found in source text.",
        "source_refs": [
          {
            "sourceId": "prd-snippet",
            "line": 3,
            "text": "Discovery: 2026-06-01 to 2026-06-05 owner PM status planned",
            "path": "examples/prd-snippet.md",
            "heading": "Payments Launch PRD Timeline"
          }
        ]
      },
      {
        "id": "api-contract",
        "title": "API contract",
        "type": "task",
        "start": "2026-06-06",
        "duration": "4d",
        "exact_date_needed": false,
        "owner": "Platform",
        "status": "planned",
        "dependencies": [
          "Discovery"
        ],
        "confidence": 0.75,
        "confidence_reason": "Exact date evidence found in source text.",
        "source_refs": [
          {
            "sourceId": "prd-snippet",
            "line": 4,
            "text": "API contract: starts 2026-06-06 duration 4d owner Platform status planned depends on Discovery",
            "path": "examples/prd-snippet.md",
            "heading": "Payments Launch PRD Timeline"
          }
        ]
      },
      {
        "id": "checkout-qa",
        "title": "Checkout QA",
        "type": "task",
        "exact_date_needed": false,
        "owner": "QA",
        "status": "planned",
        "dependencies": [
          "API contract"
        ],
        "confidence": 0.45,
        "confidence_reason": "No exact dates found; timeline placement needs human follow-up.",
        "source_refs": [
          {
            "sourceId": "prd-snippet",
            "line": 5,
            "text": "Checkout QA: owner QA status planned depends on API contract",
            "path": "examples/prd-snippet.md",
            "heading": "Payments Launch PRD Timeline"
          }
        ]
      },
      {
        "id": "launch-decision",
        "title": "Launch decision",
        "type": "milestone",
        "start": "2026-06-17",
        "exact_date_needed": false,
        "owner": "PM",
        "status": "planned",
        "dependencies": [
          "Checkout QA"
        ],
        "confidence": 0.75,
        "confidence_reason": "Exact date evidence found in source text.",
        "source_refs": [
          {
            "sourceId": "prd-snippet",
            "line": 6,
            "text": "Launch decision milestone on 2026-06-17 owner PM status planned depends on Checkout QA",
            "path": "examples/prd-snippet.md",
            "heading": "Payments Launch PRD Timeline"
          }
        ]
      }
    ],
    "milestones": [
      {
        "id": "launch-decision",
        "title": "Launch decision",
        "type": "milestone",
        "start": "2026-06-17",
        "exact_date_needed": false,
        "owner": "PM",
        "status": "planned",
        "dependencies": [
          "Checkout QA"
        ],
        "confidence": 0.75,
        "confidence_reason": "Exact date evidence found in source text.",
        "source_refs": [
          {
            "sourceId": "prd-snippet",
            "line": 6,
            "text": "Launch decision milestone on 2026-06-17 owner PM status planned depends on Checkout QA",
            "path": "examples/prd-snippet.md",
            "heading": "Payments Launch PRD Timeline"
          }
        ]
      }
    ],
    "assumptions": [
      "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up."
    ],
    "gaps": [
      {
        "itemTitle": "Checkout QA",
        "field": "start",
        "question": "Missing start date. Ask for the planned start date instead of inferring it.",
        "source_refs": [
          {
            "sourceId": "prd-snippet",
            "line": 5,
            "text": "Checkout QA: owner QA status planned depends on API contract",
            "path": "examples/prd-snippet.md",
            "heading": "Payments Launch PRD Timeline"
          }
        ]
      },
      {
        "itemTitle": "Checkout QA",
        "field": "end",
        "question": "Missing end date or duration for a non-milestone item.",
        "source_refs": [
          {
            "sourceId": "prd-snippet",
            "line": 5,
            "text": "Checkout QA: owner QA status planned depends on API contract",
            "path": "examples/prd-snippet.md",
            "heading": "Payments Launch PRD Timeline"
          }
        ]
      }
    ],
    "issues": [],
    "render": {
      "audience": "TPM/PM",
      "defaultFormats": [
        "mermaid_gantt",
        "mermaid_timeline",
        "markdown",
        "review_report"
      ]
    }
  },
  "assumptions": [
    "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up."
  ],
  "gaps": [
    {
      "itemTitle": "Checkout QA",
      "field": "start",
      "question": "Missing start date. Ask for the planned start date instead of inferring it.",
      "source_refs": [
        {
          "sourceId": "prd-snippet",
          "line": 5,
          "text": "Checkout QA: owner QA status planned depends on API contract",
          "path": "examples/prd-snippet.md",
          "heading": "Payments Launch PRD Timeline"
        }
      ]
    },
    {
      "itemTitle": "Checkout QA",
      "field": "end",
      "question": "Missing end date or duration for a non-milestone item.",
      "source_refs": [
        {
          "sourceId": "prd-snippet",
          "line": 5,
          "text": "Checkout QA: owner QA status planned depends on API contract",
          "path": "examples/prd-snippet.md",
          "heading": "Payments Launch PRD Timeline"
        }
      ]
    }
  ],
  "issues": [],
  "followups": {
    "all": [
      {
        "itemTitle": "Checkout QA",
        "field": "start",
        "owner": "QA",
        "question": "Missing start date. Ask for the planned start date instead of inferring it.",
        "source_refs": [
          {
            "sourceId": "prd-snippet",
            "line": 5,
            "text": "Checkout QA: owner QA status planned depends on API contract",
            "path": "examples/prd-snippet.md",
            "heading": "Payments Launch PRD Timeline"
          }
        ]
      },
      {
        "itemTitle": "Checkout QA",
        "field": "end",
        "owner": "QA",
        "question": "Missing end date or duration for a non-milestone item.",
        "source_refs": [
          {
            "sourceId": "prd-snippet",
            "line": 5,
            "text": "Checkout QA: owner QA status planned depends on API contract",
            "path": "examples/prd-snippet.md",
            "heading": "Payments Launch PRD Timeline"
          }
        ]
      }
    ],
    "by_field": {
      "start": [
        {
          "itemTitle": "Checkout QA",
          "field": "start",
          "owner": "QA",
          "question": "Missing start date. Ask for the planned start date instead of inferring it.",
          "source_refs": [
            {
              "sourceId": "prd-snippet",
              "line": 5,
              "text": "Checkout QA: owner QA status planned depends on API contract",
              "path": "examples/prd-snippet.md",
              "heading": "Payments Launch PRD Timeline"
            }
          ]
        }
      ],
      "end": [
        {
          "itemTitle": "Checkout QA",
          "field": "end",
          "owner": "QA",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "prd-snippet",
              "line": 5,
              "text": "Checkout QA: owner QA status planned depends on API contract",
              "path": "examples/prd-snippet.md",
              "heading": "Payments Launch PRD Timeline"
            }
          ]
        }
      ]
    },
    "by_owner": {
      "QA": [
        {
          "itemTitle": "Checkout QA",
          "field": "start",
          "owner": "QA",
          "question": "Missing start date. Ask for the planned start date instead of inferring it.",
          "source_refs": [
            {
              "sourceId": "prd-snippet",
              "line": 5,
              "text": "Checkout QA: owner QA status planned depends on API contract",
              "path": "examples/prd-snippet.md",
              "heading": "Payments Launch PRD Timeline"
            }
          ]
        },
        {
          "itemTitle": "Checkout QA",
          "field": "end",
          "owner": "QA",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "prd-snippet",
              "line": 5,
              "text": "Checkout QA: owner QA status planned depends on API contract",
              "path": "examples/prd-snippet.md",
              "heading": "Payments Launch PRD Timeline"
            }
          ]
        }
      ]
    },
    "by_date": {
      "start": [
        {
          "itemTitle": "Checkout QA",
          "field": "start",
          "owner": "QA",
          "question": "Missing start date. Ask for the planned start date instead of inferring it.",
          "source_refs": [
            {
              "sourceId": "prd-snippet",
              "line": 5,
              "text": "Checkout QA: owner QA status planned depends on API contract",
              "path": "examples/prd-snippet.md",
              "heading": "Payments Launch PRD Timeline"
            }
          ]
        }
      ],
      "end": [
        {
          "itemTitle": "Checkout QA",
          "field": "end",
          "owner": "QA",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "prd-snippet",
              "line": 5,
              "text": "Checkout QA: owner QA status planned depends on API contract",
              "path": "examples/prd-snippet.md",
              "heading": "Payments Launch PRD Timeline"
            }
          ]
        }
      ]
    },
    "by_dependency": {}
  },
  "noise_report": {
    "ignored": {
      "frontmatter_lines": 0,
      "prose_lines": 0,
      "table_rows_without_dates": 0
    }
  },
  "renders": {
    "mermaid_gantt": "gantt\n  title Project Timeline\n  dateFormat YYYY-MM-DD\n  axisFormat %b %d\n  section Plan\n  Discovery (PM) :planned, 2026-06-01, 2026-06-05\n  API contract (Platform) :planned, 2026-06-06, 4d\n  %% Checkout QA (QA) omitted from chart: missing defensible date or duration\n  Launch decision (PM) :milestone, 2026-06-17, 0d\n",
    "mermaid_timeline": "timeline\n  title Project Timeline\n  2026-06-01 : Discovery\n  2026-06-06 : API contract\n  Unscheduled : Checkout QA\n  2026-06-17 : Launch decision\n",
    "markdown": "## Timeline\n\n- **Discovery** (task, planned) - 2026-06-01 to 2026-06-05 - owner: PM\n- **API contract** (task, planned) - 2026-06-06 for 4d - owner: Platform\n- **Checkout QA** (task, planned) - date needed - owner: QA\n- **Launch decision** (milestone, planned) - 2026-06-17 - owner: PM\n\n## Gaps\n- Checkout QA: start - Missing start date. Ask for the planned start date instead of inferring it.\n- Checkout QA: end - Missing end date or duration for a non-milestone item.\n\n## Assumptions\n- No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.\n",
    "review_report": "## Timeline Review\n\n### Items\n- **Discovery** (task, planned) - 2026-06-01 to 2026-06-05 - owner: PM\n  - Confidence: 0.75 - Exact date evidence found in source text.\n  - Source: prd-snippet, examples/prd-snippet.md, heading \"Payments Launch PRD Timeline\", line 3\n- **API contract** (task, planned) - 2026-06-06 for 4d - owner: Platform\n  - Confidence: 0.75 - Exact date evidence found in source text.\n  - Source: prd-snippet, examples/prd-snippet.md, heading \"Payments Launch PRD Timeline\", line 4\n- **Checkout QA** (task, planned) - date needed - owner: QA\n  - Confidence: 0.45 - No exact dates found; timeline placement needs human follow-up.\n  - Source: prd-snippet, examples/prd-snippet.md, heading \"Payments Launch PRD Timeline\", line 5\n- **Launch decision** (milestone, planned) - 2026-06-17 - owner: PM\n  - Confidence: 0.75 - Exact date evidence found in source text.\n  - Source: prd-snippet, examples/prd-snippet.md, heading \"Payments Launch PRD Timeline\", line 6\n\n### Follow-Up Questions\n- Checkout QA (QA): Missing start date. Ask for the planned start date instead of inferring it.\n- Checkout QA (QA): Missing end date or duration for a non-milestone item.\n\n### Assumptions\n- No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.\n"
  }
}
```

### Jira CSV export

Source: `examples/jira-export.csv` (csv)

#### Before: Raw Input

```csv
title,type,start,end,owner,status,dependencies
Discovery,task,2026-07-01,2026-07-03,PM,done,
Backend API,task,2026-07-04,,BE,active,Discovery
Beta milestone,milestone,2026-07-12,,PM,planned,Backend API
Data migration,task,,,DBA,planned,Backend API
```

#### After: Benchmark Summary

```json
{
  "before": {
    "nonEmptyLines": 5,
    "rawEntries": 4,
    "exactDateMentions": 4,
    "ownerMentions": 5,
    "dependencyMentions": 1
  },
  "after": {
    "itemCount": 4,
    "milestoneCount": 1,
    "gapCount": 3,
    "issueCount": 0,
    "followupCount": 3,
    "sourceRefCoverage": 4,
    "titles": [
      "Discovery",
      "Backend API",
      "Beta milestone",
      "Data migration"
    ],
    "gaps": [
      {
        "itemTitle": "Backend API",
        "field": "end",
        "question": "Missing end date or duration for a non-milestone item."
      },
      {
        "itemTitle": "Data migration",
        "field": "start",
        "question": "Missing start date. Ask for the planned start date instead of inferring it."
      },
      {
        "itemTitle": "Data migration",
        "field": "end",
        "question": "Missing end date or duration for a non-milestone item."
      }
    ],
    "issues": [],
    "noiseReport": {
      "ignored": {
        "frontmatter_lines": 0,
        "prose_lines": 0,
        "table_rows_without_dates": 0
      }
    },
    "renderLengths": {
      "mermaid_gantt": 345,
      "mermaid_timeline": 147,
      "markdown": 642,
      "review_report": 1037
    }
  },
  "validation": {
    "expectedTitles": 4,
    "expectedTitlesMatched": 4,
    "titleOrderExact": true,
    "expectedGaps": 3,
    "expectedGapsFound": 3,
    "extraGaps": []
  },
  "runtime": {
    "iterations": 1000,
    "minMs": 0.0194,
    "averageMs": 0.031332,
    "p50Ms": 0.0241,
    "p95Ms": 0.0569,
    "maxMs": 0.394
  }
}
```

#### After: Review Report Output

```markdown
## Timeline Review

### Items
- **Discovery** (task, done) - 2026-07-01 to 2026-07-03 - owner: PM
  - Confidence: 0.6 - Structured date evidence was supplied.
  - Source: jira-export, line 2
- **Backend API** (task, active) - 2026-07-04 - owner: BE
  - Confidence: 0.6 - Structured date evidence was supplied.
  - Source: jira-export, line 3
- **Beta milestone** (milestone, planned) - 2026-07-12 - owner: PM
  - Confidence: 0.6 - Structured date evidence was supplied.
  - Source: jira-export, line 4
- **Data migration** (task, planned) - date needed - owner: DBA
  - Confidence: 0.6 - No date evidence was supplied.
  - Source: jira-export, line 5

### Follow-Up Questions
- Backend API (BE): Missing end date or duration for a non-milestone item.
- Data migration (DBA): Missing start date. Ask for the planned start date instead of inferring it.
- Data migration (DBA): Missing end date or duration for a non-milestone item.

### Assumptions
- No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.
```

#### After: Full createTimeline JSON

```json
{
  "timeline": {
    "items": [
      {
        "id": "discovery",
        "title": "Discovery",
        "type": "task",
        "start": "2026-07-01",
        "end": "2026-07-03",
        "exact_date_needed": false,
        "owner": "PM",
        "status": "done",
        "dependencies": [],
        "confidence": 0.6,
        "confidence_reason": "Structured date evidence was supplied.",
        "source_refs": [
          {
            "sourceId": "jira-export",
            "line": 2
          }
        ]
      },
      {
        "id": "backend-api",
        "title": "Backend API",
        "type": "task",
        "start": "2026-07-04",
        "exact_date_needed": false,
        "owner": "BE",
        "status": "active",
        "dependencies": [
          "Discovery"
        ],
        "confidence": 0.6,
        "confidence_reason": "Structured date evidence was supplied.",
        "source_refs": [
          {
            "sourceId": "jira-export",
            "line": 3
          }
        ]
      },
      {
        "id": "beta-milestone",
        "title": "Beta milestone",
        "type": "milestone",
        "start": "2026-07-12",
        "exact_date_needed": false,
        "owner": "PM",
        "status": "planned",
        "dependencies": [
          "Backend API"
        ],
        "confidence": 0.6,
        "confidence_reason": "Structured date evidence was supplied.",
        "source_refs": [
          {
            "sourceId": "jira-export",
            "line": 4
          }
        ]
      },
      {
        "id": "data-migration",
        "title": "Data migration",
        "type": "task",
        "exact_date_needed": false,
        "owner": "DBA",
        "status": "planned",
        "dependencies": [
          "Backend API"
        ],
        "confidence": 0.6,
        "confidence_reason": "No date evidence was supplied.",
        "source_refs": [
          {
            "sourceId": "jira-export",
            "line": 5
          }
        ]
      }
    ],
    "milestones": [
      {
        "id": "beta-milestone",
        "title": "Beta milestone",
        "type": "milestone",
        "start": "2026-07-12",
        "exact_date_needed": false,
        "owner": "PM",
        "status": "planned",
        "dependencies": [
          "Backend API"
        ],
        "confidence": 0.6,
        "confidence_reason": "Structured date evidence was supplied.",
        "source_refs": [
          {
            "sourceId": "jira-export",
            "line": 4
          }
        ]
      }
    ],
    "assumptions": [
      "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up."
    ],
    "gaps": [
      {
        "itemTitle": "Backend API",
        "field": "end",
        "question": "Missing end date or duration for a non-milestone item.",
        "source_refs": [
          {
            "sourceId": "jira-export",
            "line": 3
          }
        ]
      },
      {
        "itemTitle": "Data migration",
        "field": "start",
        "question": "Missing start date. Ask for the planned start date instead of inferring it.",
        "source_refs": [
          {
            "sourceId": "jira-export",
            "line": 5
          }
        ]
      },
      {
        "itemTitle": "Data migration",
        "field": "end",
        "question": "Missing end date or duration for a non-milestone item.",
        "source_refs": [
          {
            "sourceId": "jira-export",
            "line": 5
          }
        ]
      }
    ],
    "issues": [],
    "render": {
      "audience": "TPM/PM",
      "defaultFormats": [
        "mermaid_gantt",
        "mermaid_timeline",
        "markdown",
        "review_report"
      ]
    }
  },
  "assumptions": [
    "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up."
  ],
  "gaps": [
    {
      "itemTitle": "Backend API",
      "field": "end",
      "question": "Missing end date or duration for a non-milestone item.",
      "source_refs": [
        {
          "sourceId": "jira-export",
          "line": 3
        }
      ]
    },
    {
      "itemTitle": "Data migration",
      "field": "start",
      "question": "Missing start date. Ask for the planned start date instead of inferring it.",
      "source_refs": [
        {
          "sourceId": "jira-export",
          "line": 5
        }
      ]
    },
    {
      "itemTitle": "Data migration",
      "field": "end",
      "question": "Missing end date or duration for a non-milestone item.",
      "source_refs": [
        {
          "sourceId": "jira-export",
          "line": 5
        }
      ]
    }
  ],
  "issues": [],
  "followups": {
    "all": [
      {
        "itemTitle": "Backend API",
        "field": "end",
        "owner": "BE",
        "question": "Missing end date or duration for a non-milestone item.",
        "source_refs": [
          {
            "sourceId": "jira-export",
            "line": 3
          }
        ]
      },
      {
        "itemTitle": "Data migration",
        "field": "start",
        "owner": "DBA",
        "question": "Missing start date. Ask for the planned start date instead of inferring it.",
        "source_refs": [
          {
            "sourceId": "jira-export",
            "line": 5
          }
        ]
      },
      {
        "itemTitle": "Data migration",
        "field": "end",
        "owner": "DBA",
        "question": "Missing end date or duration for a non-milestone item.",
        "source_refs": [
          {
            "sourceId": "jira-export",
            "line": 5
          }
        ]
      }
    ],
    "by_field": {
      "end": [
        {
          "itemTitle": "Backend API",
          "field": "end",
          "owner": "BE",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "jira-export",
              "line": 3
            }
          ]
        },
        {
          "itemTitle": "Data migration",
          "field": "end",
          "owner": "DBA",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "jira-export",
              "line": 5
            }
          ]
        }
      ],
      "start": [
        {
          "itemTitle": "Data migration",
          "field": "start",
          "owner": "DBA",
          "question": "Missing start date. Ask for the planned start date instead of inferring it.",
          "source_refs": [
            {
              "sourceId": "jira-export",
              "line": 5
            }
          ]
        }
      ]
    },
    "by_owner": {
      "BE": [
        {
          "itemTitle": "Backend API",
          "field": "end",
          "owner": "BE",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "jira-export",
              "line": 3
            }
          ]
        }
      ],
      "DBA": [
        {
          "itemTitle": "Data migration",
          "field": "start",
          "owner": "DBA",
          "question": "Missing start date. Ask for the planned start date instead of inferring it.",
          "source_refs": [
            {
              "sourceId": "jira-export",
              "line": 5
            }
          ]
        },
        {
          "itemTitle": "Data migration",
          "field": "end",
          "owner": "DBA",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "jira-export",
              "line": 5
            }
          ]
        }
      ]
    },
    "by_date": {
      "end": [
        {
          "itemTitle": "Backend API",
          "field": "end",
          "owner": "BE",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "jira-export",
              "line": 3
            }
          ]
        },
        {
          "itemTitle": "Data migration",
          "field": "end",
          "owner": "DBA",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "jira-export",
              "line": 5
            }
          ]
        }
      ],
      "start": [
        {
          "itemTitle": "Data migration",
          "field": "start",
          "owner": "DBA",
          "question": "Missing start date. Ask for the planned start date instead of inferring it.",
          "source_refs": [
            {
              "sourceId": "jira-export",
              "line": 5
            }
          ]
        }
      ]
    },
    "by_dependency": {}
  },
  "noise_report": {
    "ignored": {
      "frontmatter_lines": 0,
      "prose_lines": 0,
      "table_rows_without_dates": 0
    }
  },
  "renders": {
    "mermaid_gantt": "gantt\n  title Project Timeline\n  dateFormat YYYY-MM-DD\n  axisFormat %b %d\n  section Plan\n  Discovery (PM) :done, 2026-07-01, 2026-07-03\n  %% Backend API (BE) omitted from chart: missing defensible date or duration\n  Beta milestone (PM) :milestone, 2026-07-12, 0d\n  %% Data migration (DBA) omitted from chart: missing defensible date or duration\n",
    "mermaid_timeline": "timeline\n  title Project Timeline\n  2026-07-01 : Discovery\n  2026-07-04 : Backend API\n  2026-07-12 : Beta milestone\n  Unscheduled : Data migration\n",
    "markdown": "## Timeline\n\n- **Discovery** (task, done) - 2026-07-01 to 2026-07-03 - owner: PM\n- **Backend API** (task, active) - 2026-07-04 - owner: BE\n- **Beta milestone** (milestone, planned) - 2026-07-12 - owner: PM\n- **Data migration** (task, planned) - date needed - owner: DBA\n\n## Gaps\n- Backend API: end - Missing end date or duration for a non-milestone item.\n- Data migration: start - Missing start date. Ask for the planned start date instead of inferring it.\n- Data migration: end - Missing end date or duration for a non-milestone item.\n\n## Assumptions\n- No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.\n",
    "review_report": "## Timeline Review\n\n### Items\n- **Discovery** (task, done) - 2026-07-01 to 2026-07-03 - owner: PM\n  - Confidence: 0.6 - Structured date evidence was supplied.\n  - Source: jira-export, line 2\n- **Backend API** (task, active) - 2026-07-04 - owner: BE\n  - Confidence: 0.6 - Structured date evidence was supplied.\n  - Source: jira-export, line 3\n- **Beta milestone** (milestone, planned) - 2026-07-12 - owner: PM\n  - Confidence: 0.6 - Structured date evidence was supplied.\n  - Source: jira-export, line 4\n- **Data migration** (task, planned) - date needed - owner: DBA\n  - Confidence: 0.6 - No date evidence was supplied.\n  - Source: jira-export, line 5\n\n### Follow-Up Questions\n- Backend API (BE): Missing end date or duration for a non-milestone item.\n- Data migration (DBA): Missing start date. Ask for the planned start date instead of inferring it.\n- Data migration (DBA): Missing end date or duration for a non-milestone item.\n\n### Assumptions\n- No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.\n"
  }
}
```

### Launch checklist

Source: `examples/launch-checklist.md` (markdown)

#### Before: Raw Input

```markdown
# Launch Checklist

- [x] Scope review: 2026-08-01 to 2026-08-02 owner TPM status done
- [ ] Production readiness: starts 2026-08-05 duration 3d owner SRE status planned depends on Scope review
- [ ] Legal approval owner Legal status planned depends on Scope review
- [ ] Go live milestone on 2026-08-12 owner PM status planned depends on Production readiness, Legal approval
```

#### After: Benchmark Summary

```json
{
  "before": {
    "nonEmptyLines": 5,
    "rawEntries": 4,
    "exactDateMentions": 4,
    "ownerMentions": 4,
    "dependencyMentions": 3
  },
  "after": {
    "itemCount": 4,
    "milestoneCount": 1,
    "gapCount": 2,
    "issueCount": 0,
    "followupCount": 2,
    "sourceRefCoverage": 4,
    "titles": [
      "Scope review",
      "Production readiness",
      "Legal approval",
      "Go live"
    ],
    "gaps": [
      {
        "itemTitle": "Legal approval",
        "field": "start",
        "question": "Missing start date. Ask for the planned start date instead of inferring it."
      },
      {
        "itemTitle": "Legal approval",
        "field": "end",
        "question": "Missing end date or duration for a non-milestone item."
      }
    ],
    "issues": [],
    "noiseReport": {
      "ignored": {
        "frontmatter_lines": 0,
        "prose_lines": 0,
        "table_rows_without_dates": 0
      }
    },
    "renderLengths": {
      "mermaid_gantt": 320,
      "mermaid_timeline": 152,
      "markdown": 583,
      "review_report": 1281
    }
  },
  "validation": {
    "expectedTitles": 4,
    "expectedTitlesMatched": 4,
    "titleOrderExact": true,
    "expectedGaps": 2,
    "expectedGapsFound": 2,
    "extraGaps": []
  },
  "runtime": {
    "iterations": 1000,
    "minMs": 0.0268,
    "averageMs": 0.042944,
    "p50Ms": 0.0309,
    "p95Ms": 0.1003,
    "maxMs": 0.438
  }
}
```

#### After: Review Report Output

```markdown
## Timeline Review

### Items
- **Scope review** (task, done) - 2026-08-01 to 2026-08-02 - owner: TPM
  - Confidence: 0.75 - Exact date evidence found in source text.
  - Source: launch-checklist, examples/launch-checklist.md, heading "Launch Checklist", line 3
- **Production readiness** (task, planned) - 2026-08-05 for 3d - owner: SRE
  - Confidence: 0.75 - Exact date evidence found in source text.
  - Source: launch-checklist, examples/launch-checklist.md, heading "Launch Checklist", line 4
- **Legal approval** (task, planned) - date needed - owner: Legal
  - Confidence: 0.45 - No exact dates found; timeline placement needs human follow-up.
  - Source: launch-checklist, examples/launch-checklist.md, heading "Launch Checklist", line 5
- **Go live** (milestone, planned) - 2026-08-12 - owner: PM
  - Confidence: 0.75 - Exact date evidence found in source text.
  - Source: launch-checklist, examples/launch-checklist.md, heading "Launch Checklist", line 6

### Follow-Up Questions
- Legal approval (Legal): Missing start date. Ask for the planned start date instead of inferring it.
- Legal approval (Legal): Missing end date or duration for a non-milestone item.

### Assumptions
- No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.
```

#### After: Full createTimeline JSON

```json
{
  "timeline": {
    "items": [
      {
        "id": "scope-review",
        "title": "Scope review",
        "type": "task",
        "start": "2026-08-01",
        "end": "2026-08-02",
        "exact_date_needed": false,
        "owner": "TPM",
        "status": "done",
        "dependencies": [],
        "confidence": 0.75,
        "confidence_reason": "Exact date evidence found in source text.",
        "source_refs": [
          {
            "sourceId": "launch-checklist",
            "line": 3,
            "text": "Scope review: 2026-08-01 to 2026-08-02 owner TPM status done",
            "path": "examples/launch-checklist.md",
            "heading": "Launch Checklist"
          }
        ]
      },
      {
        "id": "production-readiness",
        "title": "Production readiness",
        "type": "task",
        "start": "2026-08-05",
        "duration": "3d",
        "exact_date_needed": false,
        "owner": "SRE",
        "status": "planned",
        "dependencies": [
          "Scope review"
        ],
        "confidence": 0.75,
        "confidence_reason": "Exact date evidence found in source text.",
        "source_refs": [
          {
            "sourceId": "launch-checklist",
            "line": 4,
            "text": "Production readiness: starts 2026-08-05 duration 3d owner SRE status planned depends on Scope review",
            "path": "examples/launch-checklist.md",
            "heading": "Launch Checklist"
          }
        ]
      },
      {
        "id": "legal-approval",
        "title": "Legal approval",
        "type": "task",
        "exact_date_needed": false,
        "owner": "Legal",
        "status": "planned",
        "dependencies": [
          "Scope review"
        ],
        "confidence": 0.45,
        "confidence_reason": "No exact dates found; timeline placement needs human follow-up.",
        "source_refs": [
          {
            "sourceId": "launch-checklist",
            "line": 5,
            "text": "Legal approval owner Legal status planned depends on Scope review",
            "path": "examples/launch-checklist.md",
            "heading": "Launch Checklist"
          }
        ]
      },
      {
        "id": "go-live",
        "title": "Go live",
        "type": "milestone",
        "start": "2026-08-12",
        "exact_date_needed": false,
        "owner": "PM",
        "status": "planned",
        "dependencies": [
          "Production readiness",
          "Legal approval"
        ],
        "confidence": 0.75,
        "confidence_reason": "Exact date evidence found in source text.",
        "source_refs": [
          {
            "sourceId": "launch-checklist",
            "line": 6,
            "text": "Go live milestone on 2026-08-12 owner PM status planned depends on Production readiness, Legal approval",
            "path": "examples/launch-checklist.md",
            "heading": "Launch Checklist"
          }
        ]
      }
    ],
    "milestones": [
      {
        "id": "go-live",
        "title": "Go live",
        "type": "milestone",
        "start": "2026-08-12",
        "exact_date_needed": false,
        "owner": "PM",
        "status": "planned",
        "dependencies": [
          "Production readiness",
          "Legal approval"
        ],
        "confidence": 0.75,
        "confidence_reason": "Exact date evidence found in source text.",
        "source_refs": [
          {
            "sourceId": "launch-checklist",
            "line": 6,
            "text": "Go live milestone on 2026-08-12 owner PM status planned depends on Production readiness, Legal approval",
            "path": "examples/launch-checklist.md",
            "heading": "Launch Checklist"
          }
        ]
      }
    ],
    "assumptions": [
      "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up."
    ],
    "gaps": [
      {
        "itemTitle": "Legal approval",
        "field": "start",
        "question": "Missing start date. Ask for the planned start date instead of inferring it.",
        "source_refs": [
          {
            "sourceId": "launch-checklist",
            "line": 5,
            "text": "Legal approval owner Legal status planned depends on Scope review",
            "path": "examples/launch-checklist.md",
            "heading": "Launch Checklist"
          }
        ]
      },
      {
        "itemTitle": "Legal approval",
        "field": "end",
        "question": "Missing end date or duration for a non-milestone item.",
        "source_refs": [
          {
            "sourceId": "launch-checklist",
            "line": 5,
            "text": "Legal approval owner Legal status planned depends on Scope review",
            "path": "examples/launch-checklist.md",
            "heading": "Launch Checklist"
          }
        ]
      }
    ],
    "issues": [],
    "render": {
      "audience": "TPM/PM",
      "defaultFormats": [
        "mermaid_gantt",
        "mermaid_timeline",
        "markdown",
        "review_report"
      ]
    }
  },
  "assumptions": [
    "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up."
  ],
  "gaps": [
    {
      "itemTitle": "Legal approval",
      "field": "start",
      "question": "Missing start date. Ask for the planned start date instead of inferring it.",
      "source_refs": [
        {
          "sourceId": "launch-checklist",
          "line": 5,
          "text": "Legal approval owner Legal status planned depends on Scope review",
          "path": "examples/launch-checklist.md",
          "heading": "Launch Checklist"
        }
      ]
    },
    {
      "itemTitle": "Legal approval",
      "field": "end",
      "question": "Missing end date or duration for a non-milestone item.",
      "source_refs": [
        {
          "sourceId": "launch-checklist",
          "line": 5,
          "text": "Legal approval owner Legal status planned depends on Scope review",
          "path": "examples/launch-checklist.md",
          "heading": "Launch Checklist"
        }
      ]
    }
  ],
  "issues": [],
  "followups": {
    "all": [
      {
        "itemTitle": "Legal approval",
        "field": "start",
        "owner": "Legal",
        "question": "Missing start date. Ask for the planned start date instead of inferring it.",
        "source_refs": [
          {
            "sourceId": "launch-checklist",
            "line": 5,
            "text": "Legal approval owner Legal status planned depends on Scope review",
            "path": "examples/launch-checklist.md",
            "heading": "Launch Checklist"
          }
        ]
      },
      {
        "itemTitle": "Legal approval",
        "field": "end",
        "owner": "Legal",
        "question": "Missing end date or duration for a non-milestone item.",
        "source_refs": [
          {
            "sourceId": "launch-checklist",
            "line": 5,
            "text": "Legal approval owner Legal status planned depends on Scope review",
            "path": "examples/launch-checklist.md",
            "heading": "Launch Checklist"
          }
        ]
      }
    ],
    "by_field": {
      "start": [
        {
          "itemTitle": "Legal approval",
          "field": "start",
          "owner": "Legal",
          "question": "Missing start date. Ask for the planned start date instead of inferring it.",
          "source_refs": [
            {
              "sourceId": "launch-checklist",
              "line": 5,
              "text": "Legal approval owner Legal status planned depends on Scope review",
              "path": "examples/launch-checklist.md",
              "heading": "Launch Checklist"
            }
          ]
        }
      ],
      "end": [
        {
          "itemTitle": "Legal approval",
          "field": "end",
          "owner": "Legal",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "launch-checklist",
              "line": 5,
              "text": "Legal approval owner Legal status planned depends on Scope review",
              "path": "examples/launch-checklist.md",
              "heading": "Launch Checklist"
            }
          ]
        }
      ]
    },
    "by_owner": {
      "Legal": [
        {
          "itemTitle": "Legal approval",
          "field": "start",
          "owner": "Legal",
          "question": "Missing start date. Ask for the planned start date instead of inferring it.",
          "source_refs": [
            {
              "sourceId": "launch-checklist",
              "line": 5,
              "text": "Legal approval owner Legal status planned depends on Scope review",
              "path": "examples/launch-checklist.md",
              "heading": "Launch Checklist"
            }
          ]
        },
        {
          "itemTitle": "Legal approval",
          "field": "end",
          "owner": "Legal",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "launch-checklist",
              "line": 5,
              "text": "Legal approval owner Legal status planned depends on Scope review",
              "path": "examples/launch-checklist.md",
              "heading": "Launch Checklist"
            }
          ]
        }
      ]
    },
    "by_date": {
      "start": [
        {
          "itemTitle": "Legal approval",
          "field": "start",
          "owner": "Legal",
          "question": "Missing start date. Ask for the planned start date instead of inferring it.",
          "source_refs": [
            {
              "sourceId": "launch-checklist",
              "line": 5,
              "text": "Legal approval owner Legal status planned depends on Scope review",
              "path": "examples/launch-checklist.md",
              "heading": "Launch Checklist"
            }
          ]
        }
      ],
      "end": [
        {
          "itemTitle": "Legal approval",
          "field": "end",
          "owner": "Legal",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "launch-checklist",
              "line": 5,
              "text": "Legal approval owner Legal status planned depends on Scope review",
              "path": "examples/launch-checklist.md",
              "heading": "Launch Checklist"
            }
          ]
        }
      ]
    },
    "by_dependency": {}
  },
  "noise_report": {
    "ignored": {
      "frontmatter_lines": 0,
      "prose_lines": 0,
      "table_rows_without_dates": 0
    }
  },
  "renders": {
    "mermaid_gantt": "gantt\n  title Project Timeline\n  dateFormat YYYY-MM-DD\n  axisFormat %b %d\n  section Plan\n  Scope review (TPM) :done, 2026-08-01, 2026-08-02\n  Production readiness (SRE) :planned, 2026-08-05, 3d\n  %% Legal approval (Legal) omitted from chart: missing defensible date or duration\n  Go live (PM) :milestone, 2026-08-12, 0d\n",
    "mermaid_timeline": "timeline\n  title Project Timeline\n  2026-08-01 : Scope review\n  2026-08-05 : Production readiness\n  Unscheduled : Legal approval\n  2026-08-12 : Go live\n",
    "markdown": "## Timeline\n\n- **Scope review** (task, done) - 2026-08-01 to 2026-08-02 - owner: TPM\n- **Production readiness** (task, planned) - 2026-08-05 for 3d - owner: SRE\n- **Legal approval** (task, planned) - date needed - owner: Legal\n- **Go live** (milestone, planned) - 2026-08-12 - owner: PM\n\n## Gaps\n- Legal approval: start - Missing start date. Ask for the planned start date instead of inferring it.\n- Legal approval: end - Missing end date or duration for a non-milestone item.\n\n## Assumptions\n- No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.\n",
    "review_report": "## Timeline Review\n\n### Items\n- **Scope review** (task, done) - 2026-08-01 to 2026-08-02 - owner: TPM\n  - Confidence: 0.75 - Exact date evidence found in source text.\n  - Source: launch-checklist, examples/launch-checklist.md, heading \"Launch Checklist\", line 3\n- **Production readiness** (task, planned) - 2026-08-05 for 3d - owner: SRE\n  - Confidence: 0.75 - Exact date evidence found in source text.\n  - Source: launch-checklist, examples/launch-checklist.md, heading \"Launch Checklist\", line 4\n- **Legal approval** (task, planned) - date needed - owner: Legal\n  - Confidence: 0.45 - No exact dates found; timeline placement needs human follow-up.\n  - Source: launch-checklist, examples/launch-checklist.md, heading \"Launch Checklist\", line 5\n- **Go live** (milestone, planned) - 2026-08-12 - owner: PM\n  - Confidence: 0.75 - Exact date evidence found in source text.\n  - Source: launch-checklist, examples/launch-checklist.md, heading \"Launch Checklist\", line 6\n\n### Follow-Up Questions\n- Legal approval (Legal): Missing start date. Ask for the planned start date instead of inferring it.\n- Legal approval (Legal): Missing end date or duration for a non-milestone item.\n\n### Assumptions\n- No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.\n"
  }
}
```

### Status update

Source: `examples/status-update.md` (markdown)

#### Before: Raw Input

```markdown
# Weekly Status

Mobile beta: starts 2026-09-02 duration 5d owner Mobile status active
Partner review milestone on 2026-09-09 status planned
Rollout owner TPM status planned depends on Mobile beta, Partner review
Analytics setup: 2026-09-03 to 2026-09-06 status planned
```

#### After: Benchmark Summary

```json
{
  "before": {
    "nonEmptyLines": 5,
    "rawEntries": 4,
    "exactDateMentions": 4,
    "ownerMentions": 2,
    "dependencyMentions": 1
  },
  "after": {
    "itemCount": 4,
    "milestoneCount": 1,
    "gapCount": 4,
    "issueCount": 0,
    "followupCount": 4,
    "sourceRefCoverage": 4,
    "titles": [
      "Mobile beta",
      "Partner review",
      "Rollout",
      "Analytics setup"
    ],
    "gaps": [
      {
        "itemTitle": "Partner review",
        "field": "owner",
        "question": "Milestone ownership is ambiguous."
      },
      {
        "itemTitle": "Rollout",
        "field": "start",
        "question": "Missing start date. Ask for the planned start date instead of inferring it."
      },
      {
        "itemTitle": "Rollout",
        "field": "end",
        "question": "Missing end date or duration for a non-milestone item."
      },
      {
        "itemTitle": "Analytics setup",
        "field": "owner",
        "question": "Missing accountable owner."
      }
    ],
    "issues": [],
    "noiseReport": {
      "ignored": {
        "frontmatter_lines": 0,
        "prose_lines": 0,
        "table_rows_without_dates": 0
      }
    },
    "renderLengths": {
      "mermaid_gantt": 306,
      "mermaid_timeline": 146,
      "markdown": 655,
      "review_report": 1297
    }
  },
  "validation": {
    "expectedTitles": 4,
    "expectedTitlesMatched": 4,
    "titleOrderExact": true,
    "expectedGaps": 4,
    "expectedGapsFound": 4,
    "extraGaps": []
  },
  "runtime": {
    "iterations": 1000,
    "minMs": 0.0259,
    "averageMs": 0.045134,
    "p50Ms": 0.029,
    "p95Ms": 0.1274,
    "maxMs": 0.6284
  }
}
```

#### After: Review Report Output

```markdown
## Timeline Review

### Items
- **Mobile beta** (task, active) - 2026-09-02 for 5d - owner: Mobile
  - Confidence: 0.75 - Exact date evidence found in source text.
  - Source: status-update, examples/status-update.md, heading "Weekly Status", line 3
- **Partner review** (milestone, planned) - 2026-09-09
  - Confidence: 0.75 - Exact date evidence found in source text.
  - Source: status-update, examples/status-update.md, heading "Weekly Status", line 4
- **Rollout** (task, planned) - date needed - owner: TPM
  - Confidence: 0.45 - No exact dates found; timeline placement needs human follow-up.
  - Source: status-update, examples/status-update.md, heading "Weekly Status", line 5
- **Analytics setup** (task, planned) - 2026-09-03 to 2026-09-06
  - Confidence: 0.75 - Exact date evidence found in source text.
  - Source: status-update, examples/status-update.md, heading "Weekly Status", line 6

### Follow-Up Questions
- Partner review: Milestone ownership is ambiguous.
- Rollout (TPM): Missing start date. Ask for the planned start date instead of inferring it.
- Rollout (TPM): Missing end date or duration for a non-milestone item.
- Analytics setup: Missing accountable owner.

### Assumptions
- No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.
```

#### After: Full createTimeline JSON

```json
{
  "timeline": {
    "items": [
      {
        "id": "mobile-beta",
        "title": "Mobile beta",
        "type": "task",
        "start": "2026-09-02",
        "duration": "5d",
        "exact_date_needed": false,
        "owner": "Mobile",
        "status": "active",
        "dependencies": [],
        "confidence": 0.75,
        "confidence_reason": "Exact date evidence found in source text.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 3,
            "text": "Mobile beta: starts 2026-09-02 duration 5d owner Mobile status active",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      },
      {
        "id": "partner-review",
        "title": "Partner review",
        "type": "milestone",
        "start": "2026-09-09",
        "exact_date_needed": false,
        "status": "planned",
        "dependencies": [],
        "confidence": 0.75,
        "confidence_reason": "Exact date evidence found in source text.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 4,
            "text": "Partner review milestone on 2026-09-09 status planned",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      },
      {
        "id": "rollout",
        "title": "Rollout",
        "type": "task",
        "exact_date_needed": false,
        "owner": "TPM",
        "status": "planned",
        "dependencies": [
          "Mobile beta",
          "Partner review"
        ],
        "confidence": 0.45,
        "confidence_reason": "No exact dates found; timeline placement needs human follow-up.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 5,
            "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      },
      {
        "id": "analytics-setup",
        "title": "Analytics setup",
        "type": "task",
        "start": "2026-09-03",
        "end": "2026-09-06",
        "exact_date_needed": false,
        "status": "planned",
        "dependencies": [],
        "confidence": 0.75,
        "confidence_reason": "Exact date evidence found in source text.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 6,
            "text": "Analytics setup: 2026-09-03 to 2026-09-06 status planned",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      }
    ],
    "milestones": [
      {
        "id": "partner-review",
        "title": "Partner review",
        "type": "milestone",
        "start": "2026-09-09",
        "exact_date_needed": false,
        "status": "planned",
        "dependencies": [],
        "confidence": 0.75,
        "confidence_reason": "Exact date evidence found in source text.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 4,
            "text": "Partner review milestone on 2026-09-09 status planned",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      }
    ],
    "assumptions": [
      "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up."
    ],
    "gaps": [
      {
        "itemTitle": "Partner review",
        "field": "owner",
        "question": "Milestone ownership is ambiguous.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 4,
            "text": "Partner review milestone on 2026-09-09 status planned",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      },
      {
        "itemTitle": "Rollout",
        "field": "start",
        "question": "Missing start date. Ask for the planned start date instead of inferring it.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 5,
            "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      },
      {
        "itemTitle": "Rollout",
        "field": "end",
        "question": "Missing end date or duration for a non-milestone item.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 5,
            "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      },
      {
        "itemTitle": "Analytics setup",
        "field": "owner",
        "question": "Missing accountable owner.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 6,
            "text": "Analytics setup: 2026-09-03 to 2026-09-06 status planned",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      }
    ],
    "issues": [],
    "render": {
      "audience": "TPM/PM",
      "defaultFormats": [
        "mermaid_gantt",
        "mermaid_timeline",
        "markdown",
        "review_report"
      ]
    }
  },
  "assumptions": [
    "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up."
  ],
  "gaps": [
    {
      "itemTitle": "Partner review",
      "field": "owner",
      "question": "Milestone ownership is ambiguous.",
      "source_refs": [
        {
          "sourceId": "status-update",
          "line": 4,
          "text": "Partner review milestone on 2026-09-09 status planned",
          "path": "examples/status-update.md",
          "heading": "Weekly Status"
        }
      ]
    },
    {
      "itemTitle": "Rollout",
      "field": "start",
      "question": "Missing start date. Ask for the planned start date instead of inferring it.",
      "source_refs": [
        {
          "sourceId": "status-update",
          "line": 5,
          "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
          "path": "examples/status-update.md",
          "heading": "Weekly Status"
        }
      ]
    },
    {
      "itemTitle": "Rollout",
      "field": "end",
      "question": "Missing end date or duration for a non-milestone item.",
      "source_refs": [
        {
          "sourceId": "status-update",
          "line": 5,
          "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
          "path": "examples/status-update.md",
          "heading": "Weekly Status"
        }
      ]
    },
    {
      "itemTitle": "Analytics setup",
      "field": "owner",
      "question": "Missing accountable owner.",
      "source_refs": [
        {
          "sourceId": "status-update",
          "line": 6,
          "text": "Analytics setup: 2026-09-03 to 2026-09-06 status planned",
          "path": "examples/status-update.md",
          "heading": "Weekly Status"
        }
      ]
    }
  ],
  "issues": [],
  "followups": {
    "all": [
      {
        "itemTitle": "Partner review",
        "field": "owner",
        "question": "Milestone ownership is ambiguous.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 4,
            "text": "Partner review milestone on 2026-09-09 status planned",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      },
      {
        "itemTitle": "Rollout",
        "field": "start",
        "owner": "TPM",
        "question": "Missing start date. Ask for the planned start date instead of inferring it.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 5,
            "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      },
      {
        "itemTitle": "Rollout",
        "field": "end",
        "owner": "TPM",
        "question": "Missing end date or duration for a non-milestone item.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 5,
            "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      },
      {
        "itemTitle": "Analytics setup",
        "field": "owner",
        "question": "Missing accountable owner.",
        "source_refs": [
          {
            "sourceId": "status-update",
            "line": 6,
            "text": "Analytics setup: 2026-09-03 to 2026-09-06 status planned",
            "path": "examples/status-update.md",
            "heading": "Weekly Status"
          }
        ]
      }
    ],
    "by_field": {
      "owner": [
        {
          "itemTitle": "Partner review",
          "field": "owner",
          "question": "Milestone ownership is ambiguous.",
          "source_refs": [
            {
              "sourceId": "status-update",
              "line": 4,
              "text": "Partner review milestone on 2026-09-09 status planned",
              "path": "examples/status-update.md",
              "heading": "Weekly Status"
            }
          ]
        },
        {
          "itemTitle": "Analytics setup",
          "field": "owner",
          "question": "Missing accountable owner.",
          "source_refs": [
            {
              "sourceId": "status-update",
              "line": 6,
              "text": "Analytics setup: 2026-09-03 to 2026-09-06 status planned",
              "path": "examples/status-update.md",
              "heading": "Weekly Status"
            }
          ]
        }
      ],
      "start": [
        {
          "itemTitle": "Rollout",
          "field": "start",
          "owner": "TPM",
          "question": "Missing start date. Ask for the planned start date instead of inferring it.",
          "source_refs": [
            {
              "sourceId": "status-update",
              "line": 5,
              "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
              "path": "examples/status-update.md",
              "heading": "Weekly Status"
            }
          ]
        }
      ],
      "end": [
        {
          "itemTitle": "Rollout",
          "field": "end",
          "owner": "TPM",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "status-update",
              "line": 5,
              "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
              "path": "examples/status-update.md",
              "heading": "Weekly Status"
            }
          ]
        }
      ]
    },
    "by_owner": {
      "Unassigned": [
        {
          "itemTitle": "Partner review",
          "field": "owner",
          "question": "Milestone ownership is ambiguous.",
          "source_refs": [
            {
              "sourceId": "status-update",
              "line": 4,
              "text": "Partner review milestone on 2026-09-09 status planned",
              "path": "examples/status-update.md",
              "heading": "Weekly Status"
            }
          ]
        },
        {
          "itemTitle": "Analytics setup",
          "field": "owner",
          "question": "Missing accountable owner.",
          "source_refs": [
            {
              "sourceId": "status-update",
              "line": 6,
              "text": "Analytics setup: 2026-09-03 to 2026-09-06 status planned",
              "path": "examples/status-update.md",
              "heading": "Weekly Status"
            }
          ]
        }
      ],
      "TPM": [
        {
          "itemTitle": "Rollout",
          "field": "start",
          "owner": "TPM",
          "question": "Missing start date. Ask for the planned start date instead of inferring it.",
          "source_refs": [
            {
              "sourceId": "status-update",
              "line": 5,
              "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
              "path": "examples/status-update.md",
              "heading": "Weekly Status"
            }
          ]
        },
        {
          "itemTitle": "Rollout",
          "field": "end",
          "owner": "TPM",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "status-update",
              "line": 5,
              "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
              "path": "examples/status-update.md",
              "heading": "Weekly Status"
            }
          ]
        }
      ]
    },
    "by_date": {
      "start": [
        {
          "itemTitle": "Rollout",
          "field": "start",
          "owner": "TPM",
          "question": "Missing start date. Ask for the planned start date instead of inferring it.",
          "source_refs": [
            {
              "sourceId": "status-update",
              "line": 5,
              "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
              "path": "examples/status-update.md",
              "heading": "Weekly Status"
            }
          ]
        }
      ],
      "end": [
        {
          "itemTitle": "Rollout",
          "field": "end",
          "owner": "TPM",
          "question": "Missing end date or duration for a non-milestone item.",
          "source_refs": [
            {
              "sourceId": "status-update",
              "line": 5,
              "text": "Rollout owner TPM status planned depends on Mobile beta, Partner review",
              "path": "examples/status-update.md",
              "heading": "Weekly Status"
            }
          ]
        }
      ]
    },
    "by_dependency": {}
  },
  "noise_report": {
    "ignored": {
      "frontmatter_lines": 0,
      "prose_lines": 0,
      "table_rows_without_dates": 0
    }
  },
  "renders": {
    "mermaid_gantt": "gantt\n  title Project Timeline\n  dateFormat YYYY-MM-DD\n  axisFormat %b %d\n  section Plan\n  Mobile beta (Mobile) :active, 2026-09-02, 5d\n  Partner review :milestone, 2026-09-09, 0d\n  %% Rollout (TPM) omitted from chart: missing defensible date or duration\n  Analytics setup :planned, 2026-09-03, 2026-09-06\n",
    "mermaid_timeline": "timeline\n  title Project Timeline\n  2026-09-02 : Mobile beta\n  2026-09-09 : Partner review\n  Unscheduled : Rollout\n  2026-09-03 : Analytics setup\n",
    "markdown": "## Timeline\n\n- **Mobile beta** (task, active) - 2026-09-02 for 5d - owner: Mobile\n- **Partner review** (milestone, planned) - 2026-09-09\n- **Rollout** (task, planned) - date needed - owner: TPM\n- **Analytics setup** (task, planned) - 2026-09-03 to 2026-09-06\n\n## Gaps\n- Partner review: owner - Milestone ownership is ambiguous.\n- Rollout: start - Missing start date. Ask for the planned start date instead of inferring it.\n- Rollout: end - Missing end date or duration for a non-milestone item.\n- Analytics setup: owner - Missing accountable owner.\n\n## Assumptions\n- No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.\n",
    "review_report": "## Timeline Review\n\n### Items\n- **Mobile beta** (task, active) - 2026-09-02 for 5d - owner: Mobile\n  - Confidence: 0.75 - Exact date evidence found in source text.\n  - Source: status-update, examples/status-update.md, heading \"Weekly Status\", line 3\n- **Partner review** (milestone, planned) - 2026-09-09\n  - Confidence: 0.75 - Exact date evidence found in source text.\n  - Source: status-update, examples/status-update.md, heading \"Weekly Status\", line 4\n- **Rollout** (task, planned) - date needed - owner: TPM\n  - Confidence: 0.45 - No exact dates found; timeline placement needs human follow-up.\n  - Source: status-update, examples/status-update.md, heading \"Weekly Status\", line 5\n- **Analytics setup** (task, planned) - 2026-09-03 to 2026-09-06\n  - Confidence: 0.75 - Exact date evidence found in source text.\n  - Source: status-update, examples/status-update.md, heading \"Weekly Status\", line 6\n\n### Follow-Up Questions\n- Partner review: Milestone ownership is ambiguous.\n- Rollout (TPM): Missing start date. Ask for the planned start date instead of inferring it.\n- Rollout (TPM): Missing end date or duration for a non-milestone item.\n- Analytics setup: Missing accountable owner.\n\n### Assumptions\n- No dates were inferred. Missing dates are reported as gaps for agent or user follow-up.\n"
  }
}
```
