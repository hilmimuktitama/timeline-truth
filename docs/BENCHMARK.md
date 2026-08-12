# Evaluation And Regression Suite

> This document replaces the old "Benchmark" report. Timeline Truth no longer
> uses benchmark naming or benchmark scripts; `docs/BENCHMARK.md` now describes
> the synthetic regression/evaluation suite.

## What Changed

- `scripts/benchmark.js` is a deprecated shim that delegates to
  `scripts/evaluation.js`. Use `npm run eval` (or the combined local
  `npm run verify`).
- The old generated report (timings, "before vs after", raw-input dumps) is
  gone. Timings measured microbenchmarks of tiny fixtures and implied accuracy
  the project cannot honestly claim.
- The suite now speaks in regression/evaluation language: deterministic
  synthetic cases with exact expected contracts.

## Running

```bash
npm run eval
```

`scripts/evaluation.js` loads `evaluation/cases.json` and runs every case
through the same `createTimeline` path used by the CLI and MCP tools. Each case
is checked for:

- exact item title order
- presence of documented gaps (`itemTitle` + `field`)
- presence of documented validation issue types
- exact `evidence_grade` per item
- non-empty renders for all four output formats

Any missing contract fails the case and the script exits non-zero, so CI blocks
regressions. Extra gaps and unexpected issue types are reported as warnings,
not failures, to keep the suite honest about unrelated side effects.

## Adding A Case

Add an entry to `evaluation/cases.json`:

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
file (the example fixtures in `examples/` are cases too). Keep cases small,
deterministic, and focused on one behavior so a failure names the exact
regression.

## Honest Limitations

- The corpus is synthetic and maintained inside this repository. It is a
  regression net, not independent proof of real-world planning accuracy.
- Structured Markdown/CSV/JSON input is the most reliable path; free-form prose
  outside the tested shapes may perform worse.
- The suite does not measure a live LLM, human reviewer, MCP-client latency,
  Jira import quality, or real Confluence/Slack material.
- Passing `npm run eval` means "the checked-in contracts still hold", nothing
  more and nothing less.
