# Architecture

Timeline Truth is a small, dependency-light evidence-preserving timeline
compiler, validator, and schedule diff for local AI-agent workflows.

## Modules

```
src/
  cli.js          CLI entrypoint: compile sources and diff timelines.
  mcp-server.js   MCP stdio server exposing the tools.
  mcp-tools.js    Tool definitions and dispatch.
  timeline.js     Core engine: parsing, normalization, evidence grading,
                  validation, rendering, follow-ups.
  diff.js         Schedule diff between baseline and current timelines.
schemas/          Published JSON Schema contracts (timeline-item, source-ref).
scripts/
  check-syntax.js       Syntax check for all JS files.
  contracts-verify.js   Version drift + schema conformance verification.
  evaluation.js         Synthetic regression/evaluation runner.
  benchmark.js          Deprecated shim delegating to evaluation.js.
evaluation/             Cases and docs for the regression suite.
```

## Data Flow

1. `createTimeline` receives `sources` (text, Markdown, CSV, JSON) plus
   optional Markdown options (`sections`, `ignoreFrontmatter`).
2. Each source is parsed into raw items:
   - text: one item per non-metadata, non-heading line; natural-language dates
     are converted deterministically.
   - Markdown: frontmatter and metadata lines are skipped (and counted in
      `noise_report`), only allowed headings are parsed, pipe tables become
      items, fuzzy targets are preserved as `time_window`, and profiled note
      tables (`estimate_table`, `objective_table`, `progress_table`) are
      transformed into timeline rows. Table transforms rewrite record keys
      only; every item keeps its original `source_refs.line`, `tableRow`, and
      `text` from the source content.
   - CSV: header-driven record mapping.
   - JSON: arrays or `{items}` with imported assumptions.
3. `normalizeItem` produces the contract shape (see
   `schemas/timeline-item.schema.json`), dropping unknown fields, rejecting
   timezone-free datetimes, converting natural dates, and computing the
   deterministic `evidence_grade`. Source references are normalized to the
   canonical SourceRef contract: required `source_id` and a deterministic
   `locator` derived from the source path (or stable source id) plus the
   finest location (line, table row, or heading). Legacy `sourceId` and
   plain-string references are converted and reported as deprecation warnings
   in `noise_report.warnings`; fields outside the SourceRef contract are
   dropped.
4. `validateTimeline` returns gaps (follow-up questions) and issues (strict
   validation findings).
5. Renders: Mermaid Gantt, Mermaid timeline, compact Markdown, review report.
6. `diffTimelines` matches items by id (fallback: normalized title) and reports
   scope/schedule/owner/dependency/status/evidence changes plus new impossible
   sequencing.

## Evidence Grading

`evidence_grade` is always one of `exact`, `derived`, `fuzzy`, `missing`,
computed in this order:

1. `exact` — an explicit `YYYY-MM-DD` date, or a timezone-bearing datetime
   reduced to its date.
2. `derived` — no explicit date, but a natural-language date (e.g.
   `June 17, 2026`) was converted by a fixed, documented algorithm.
3. `fuzzy` — a preserved time window with no exact/derived date.
4. `missing` — no date evidence.

Each grade maps to one fixed `evidence_reason` string. There is no numeric
interpolation and no model anywhere in the pipeline: the same input always
produces the same grade.

The grade is **always recomputed from the normalized evidence**; a
caller-supplied `evidence_grade` or `evidence_reason` is ignored, so round-
tripped or hand-authored JSON cannot claim a grade its evidence does not
support. To keep `derived` stable after a natural date was converted to
`YYYY-MM-DD`, `normalizeItem` records `date_derivation`
(`explicit` / `natural` / `none`) before rewriting evidence, and provenance
survives re-normalization (`deriveDateProvenance`). Parsers set it, and
`refineTimeline` invalidates it whenever an update touches date evidence
(`start`, `end`, `time_window`, `date_text`) so the grade is recomputed from
the new values.

## Strict Validation Catalog

Gaps (follow-up questions):

- `exact_date` — fuzzy window needs an exact date.
- `start` / `end` — missing dates (end not required for milestones).
- `owner` — exactly one owner gap per item, with a milestone-specific question.

Issues:

| Type | Severity | Meaning |
| --- | --- | --- |
| `unknown_dependency` | warning | dependency title not found; suggestions provided |
| `circular_dependency` | error | dependency cycle |
| `impossible_sequence` | warning | item starts before a dependency ends |
| `start_after_end` | error | `start > end` |
| `invalid_date` | error | not a real calendar date (month/day/leap-year aware) |
| `timezone_free_datetime` | error | time-of-day without timezone; value rejected for scheduling |
| `malformed_duration` | error | duration not `\d+[dwmy]` |
| `duplicate_dependencies` | warning | same dependency listed more than once |
| `duplicate_id` | warning | two items share an id |
| `missing_title` | error | item had no title (normalized to "Untitled") |
| `unsupported_dangerous_field` | error | denylisted field dropped |

Nothing is silently "fixed"; findings are advisory so humans review.

## Schedule Diff

`diffTimelines(baseline, current)`:

- matches items by `id`, falling back to case/format-insensitive title match;
- compares start, end, duration (range when both endpoints move), owner,
  status, evidence grade, and dependency sets;
- reports unmatched baseline items as `removed` and unmatched current items as
  `added`;
- validates both timelines and reports only impossible-sequencing issues that
  are new in the current timeline;
- reports duplicate-match ambiguity: when several unmatched current items
  could match one baseline item (by `id` or by normalized title), the diff
  emits an `ambiguous_match` entry listing the candidates. Pairing itself is
  deterministic (first unmatched item in document order), but the ambiguity is
  surfaced instead of silently guessed. `summary.ambiguous_matches` counts
  these findings and `renderDiffMarkdown` renders an "Ambiguous Matches"
  section.

The diff output always includes:

```json
"critical_path": {
  "computed": false,
  "reason": "Critical path is not computed. It cannot be determined defensibly
             with incomplete data: missing dates, durations, or owners leave
             the schedule under-constrained."
}
```

The project never computes a critical path and never claims one: with missing
dates, durations, or owners the schedule is under-constrained and any critical
path would be a guess.

## Refinement And Renders

`refineTimeline` applies edits without discarding provenance: `source_refs`,
`date_derivation`, and assumptions are preserved unless explicitly replaced.
Every update must carry `matchTitle` or `matchId`; an update that matches no
item, or that lacks a `set` object, throws instead of being silently skipped.
Date-affecting updates clear stale fuzzy/exact state and invalidate
`date_derivation` so the evidence grade is recomputed from the new evidence.

Mermaid renders escape syntax separators (`:`, `#`, `;`, `,`) in item labels
and in gantt status text so unescaped user content cannot corrupt the diagram.

## Versioning And Drift

The package release version and normalized contract version are checked
independently by `npm run contracts:verify`:

- `package.json` → release `version` (`0.3.1`)
- `src/mcp-server.js` → server release `version` (`0.3.1`)
- `src/timeline.js` → normalized contract `SCHEMA_VERSION` (`0.3.0`)

The package can ship a patch release without changing the shared normalized
contract. The contract version is carried by timeline and diff artifacts and
must change only when that contract changes.

The schemas in `schemas/` are byte-exact copies of the canonical truth-tools
contract schemas (Draft 2020-12): `timeline-item.schema.json` references the
absolute canonical `$id` of `source-ref.schema.json`, which requires
`source_id` and `locator`. `npm run contracts:verify` deep-compares them
against the canonical siblings in `truth-tools/packages/contracts/schemas/`
and validates real engine output against them with a minimal JSON Schema
verifier inside `scripts/contracts-verify.js` — no runtime dependency beyond
Node itself.

## Security Model

- Inputs are untrusted text and JSON. Nothing is executed.
- JSON items are scanned for denylisted dangerous fields (prototype-pollution
  vectors and code-execution hints); matching fields are dropped and reported.
- No network calls in the library; the package depends only on the MCP SDK.

## Explicit Non-Goals

- Capacity planning and scheduling optimization.
- Defensible critical-path computation from incomplete data.
- Silent inference of dates, owners, or dependencies.
- Hosted/vendor-specific integrations.
