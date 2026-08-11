# Migration Guide

This guide covers moving to Timeline Truth 0.3.0 from 0.2.x.

## 1. Version Consistency

Everything is now pinned to 0.3.0 and verified by `npm run contracts:verify`:

- `package.json` version
- `src/mcp-server.js` server version
- `src/timeline.js` `SCHEMA_VERSION`
- `schemas/timeline-item.schema.json` and `schemas/source-ref.schema.json`
  — exact canonical copies of the truth-tools contract schemas (Draft
  2020-12); the verifier fails if they drift from the canonical siblings

If you consume the timeline JSON contract programmatically, check
`timeline.schema_version === "0.3.0"` before relying on new fields.

## 2. Canonical Source References

`source_refs` now follow the canonical SourceRef contract
(`schemas/source-ref.schema.json`). Every emitted reference has:

- `source_id` (required) — identifier of the source record in the same
  artifact
- `locator` (required) — deterministic concrete pointer captured at
  extraction time: the source path (when the source has one) or the stable
  source id, suffixed with the finest location (`:line`, `:row N`, or
  `#heading`)

Original Timeline Truth provenance fields (`path`, `heading`, `tableRow`,
`line`, `text`) remain as optional passthrough metadata.

**Deprecated inputs.** The legacy `sourceId` field and plain-string
references are still accepted on input and converted automatically to
`source_id` + `locator`. Each conversion emits a deprecation warning in
`noise_report.warnings`:

```json
{ "source_refs": [{ "sourceId": "upstream", "line": 3 }] }
```

becomes `{ "source_id": "upstream", "locator": "upstream:3", "line": 3 }`.
Update your inputs to the canonical shape; the deprecated forms will be
removed in a future major version. Fields outside the SourceRef contract are
dropped during normalization.

## 3. `confidence` Is Gone

`confidence` (numeric) and `confidence_reason` are removed from normalized
items. They are replaced by:

| Old | New |
| --- | --- |
| `confidence: 0.75` | `evidence_grade: "exact"` |
| `confidence: 0.7` | `evidence_grade: "exact"` (Markdown table dates) |
| `confidence: 0.55` | `evidence_grade: "fuzzy"` / `"missing"` |
| `confidence: 0.45` | `evidence_grade: "missing"` |
| `confidence_reason` | `evidence_reason` (fixed per grade) |

Migration: replace any reads of `item.confidence` with
`item.evidence_grade` and any display of `confidence_reason` with
`evidence_reason`. Do not map grades back to numbers; the whole point of the
change is that the project no longer fabricates numeric certainty.

## 4. New Item Fields

Normalized items now also carry:

- `missing_title: boolean` — true when the source supplied no title.
- `dangerous_fields: string[]` — denylisted fields dropped from JSON input.
- `date_derivation: "explicit" | "natural" | "none"` — how the date evidence
  was obtained before normalization. It survives re-normalization so a
  natural-language date keeps its `derived` grade after being converted to
  `YYYY-MM-DD`.
- `evidence_grade` / `evidence_reason` — see below.

`evidence_grade` is always recomputed from the normalized evidence and
`date_derivation`. A caller-supplied `evidence_grade` or `evidence_reason` is
ignored, so hand-authored or round-tripped JSON cannot claim a grade the
evidence does not support. If you previously passed `evidence_grade` into the
engine to force a grade, pass the raw evidence instead (for example a
natural-language date, which grades `derived`).

## 5. New Validation Findings

`validate_timeline` (and `create_timeline`) can now report these issue types
that did not exist in 0.2.x:

- `invalid_date` — e.g. `2026-02-30` (error)
- `timezone_free_datetime` — datetime with time-of-day but no timezone (error);
  the value is rejected for scheduling and preserved in `date_text`
- `malformed_duration` — e.g. `5x` (error)
- `duplicate_dependencies` (warning)
- `duplicate_id` (warning)
- `missing_title` (error)
- `start_after_end` (error)
- `unsupported_dangerous_field` (error)

Datetimes with an explicit timezone (`Z`, `±HH:MM`, or a named zone) are now
accepted and reduced to their date part. If you previously fed
`2026-06-01T17:00:00` (no timezone) as a date, add a timezone or use
`2026-06-01`.

## 6. Schedule Diff

New CLI subcommand and MCP tool:

```bash
timeline-truth diff baseline.json current.json --format markdown
timeline-truth diff baseline.json current.json --format json
```

MCP: `diff_timelines(baseline, current, format)`. Items are matched by `id`
(fallback: normalized title). If you want reliable diffs, give items stable,
unique `id` values — `duplicate_id` warnings will tell you when you do not.
When several current items could match one baseline item, the diff reports an
`ambiguous_match` entry with the candidate titles instead of silently guessing;
pairing is deterministic (first unmatched item in document order), and
`summary.ambiguous_matches` counts these findings.

Refine updates now require a match key: every `refine_timeline` update needs a
`matchTitle` or `matchId` or the call is rejected. Updates that do not match
any item, or that lack a `set` object, now **throw** instead of being silently
skipped. Setting exact dates on a fuzzy item clears the stale
`time_window`/`date_text`/`exact_date_needed` state, and setting a fuzzy
window clears stale exact dates.

Diff output never contains a critical path: `critical_path.computed` is always
`false`.

## 7. Benchmark → Evaluation

`npm run benchmark` still exists but prints a deprecation notice and delegates
to `npm run eval` (the synthetic regression/evaluation suite). Update any CI or
docs that reference benchmark reports; see
[docs/BENCHMARK.md](docs/BENCHMARK.md).

## 8. Natural Dates And Metadata

Text and Markdown inputs now convert natural-language dates deterministically
(e.g. `June 17, 2026` → `2026-06-17`, graded `derived`). Lines that look like
metadata (`Generated:`, `Version:`, `Updated:`, ...) and `Project:` headers
are skipped and counted under `noise_report.ignored.metadata_lines`. If a
planning line was previously parsed and now disappears, it is probably being
treated as metadata — rename the key or move it into the section body.

## 9. Rolling Back

If a consumer cannot migrate yet, pin `timeline-truth@0.2.1`. Note that 0.2.1
lacks the strict validations and the diff tool; treat its output as a
pre-contract format.
