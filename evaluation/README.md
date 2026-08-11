# Evaluation Suite

This directory holds the synthetic regression/evaluation suite that replaced the
old "benchmark" naming and scripts.

## Running

```bash
npm run eval
```

The evaluator (`scripts/evaluation.js`) loads `cases.json`, runs every case
through the same `createTimeline` path used by the CLI and MCP tools, and checks:

- exact item title order
- presence of documented gaps (`itemTitle` + `field`)
- presence of documented validation issue types
- exact `evidence_grade` per item
- non-empty renders for all four output formats

Failures exit non-zero so CI can block contract regressions. `npm run benchmark`
still exists as a deprecated shim that delegates here.

## Adding A Case

Add an entry to `cases.json`:

```json
{
  "id": "my-case",
  "name": "Human-readable name",
  "sourceType": "text",
  "content": "Discovery: 2026-06-01 to 2026-06-05 owner PM",
  "expected": {
    "itemTitles": ["Discovery"],
    "gaps": [],
    "issues": [],
    "evidenceGrades": { "Discovery": "exact" }
  }
}
```

Use `"sourcePath"` instead of `"content"` to reference a checked-in fixture
file. Keep cases small, deterministic, and focused on one behavior so a failure
names the exact regression.

## Honest Limitations

- The corpus is synthetic and maintained inside this repository. It is a
  regression net, not independent proof of real-world planning accuracy.
- Structured Markdown/CSV/JSON input is the most reliable path; free-form prose
  outside the tested shapes may perform worse.
- The suite does not measure a live LLM, human reviewer, MCP-client latency,
  Jira import quality, or real Confluence/Slack material.
