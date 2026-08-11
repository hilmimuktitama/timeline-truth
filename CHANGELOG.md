# Changelog

All notable changes to Timeline Truth are documented here. Versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Updated the direct `@modelcontextprotocol/sdk` dependency to `^1.30.0`.
- Propagated the canonical `date-time` formats on source-reference timestamps
  and aligned contract drift checks and adoption tests.
- Propagated the canonical generated source-reference schema and release gates:
  CI and publishing now run high-severity dependency audits and matching CLI
  diff smoke checks before packaging.
- Standardized trusted releases on published GitHub Releases (or a manually
  supplied existing tag), with exact-tag checkout, package-version verification,
  complete verification gates, and npm OIDC provenance publishing without
  creating a second GitHub Release.

## [0.3.0] - 2026-08-11

### Added

- Versioned reliability contract: `schema_version` 0.3.0 in the engine,
  package, MCP server, and published schemas, enforced by
  `npm run contracts:verify`.
- `evidence_grade` (`exact`/`derived`/`fuzzy`/`missing`) with documented
  deterministic rules and fixed `evidence_reason` strings. The grade is always
  computed from evidence and can never be overridden by caller input.
- `date_derivation` (`explicit`/`natural`/`none`) provenance on every item,
  preserved through re-normalization so derived grades stay stable.
- `refine_timeline` edit hygiene: every update requires `matchTitle` or
  `matchId`; exact-date edits clear stale fuzzy state (`time_window`,
  `date_text`, `exact_date_needed`) and fuzzy-window edits clear stale exact
  dates.
- Markdown `source_refs` always reference original content: line numbers,
  table row numbers, and raw row text survive header normalization and
  profiled note-table transforms.
- Diff ambiguity reporting: duplicate id/title matches emit
  `ambiguous_match` findings (`summary.ambiguous_matches`) instead of being
  silently guessed; Mermaid labels escape commas so renders stay parseable.
- Strict validations: real calendar dates (leap-year aware), timezone-free
  datetime rejection (timezone-bearing datetimes are accepted and reduced to
  their date), malformed durations, duplicate dependencies, duplicate ids,
  missing titles, start-after-end, and unsupported dangerous fields.
- Core schedule diff: `timeline-truth diff baseline current
  [--format markdown|json]` plus the `diff_timelines` MCP tool, detecting
  scope, movement, range, owner, dependency, status, and evidence-grade
  changes and new impossible sequencing.
- Explicit, invariant statement that the critical path is not computed.
- Published `schemas/source-ref.schema.json` and
  `schemas/timeline-item.schema.json` with drift verification that has no
  private runtime dependency.
- Canonical source references: every `source_refs` entry now carries the
  required canonical `source_id` plus a deterministic `locator` (source path
  or stable source id suffixed with line, table row, or heading), with
  original `path`/`heading`/`tableRow`/`line`/`text` preserved as passthrough
  provenance; `schemas/` are byte-exact canonical truth-tools contract
  copies (Draft 2020-12) with sibling drift checks in `contracts:verify`.
- Deprecation warnings: legacy `sourceId` fields and plain-string source
  references are converted automatically and reported in
  `noise_report.warnings`.
- Synthetic regression/evaluation suite (`npm run eval`) replacing benchmark
  naming; `scripts/benchmark.js` remains as a deprecated shim.
- CI workflow (clean install, tests, syntax check, contract verification,
  evaluation, examples, `npm pack --dry-run`) and a trusted-publishing release
  workflow with npm provenance.
- `CHANGELOG.md`, `MIGRATION.md`, `docs/architecture.md`, and GitHub issue/PR
  templates and CODEOWNERS.

### Changed

- Natural-language dates (e.g. `June 17, 2026`) are converted deterministically
  and graded `derived`.
- Markdown metadata lines and project headers are skipped and reported through
  `noise_report.ignored.metadata_lines`; profiled note tables
  (`estimate_table`, `objective_table`, `progress_table`) are transformed into
  timeline rows.
- Per-source noise diagnostics (`noise_report.sources`) with parsed-item counts
  and per-source ignored counters; `diagnostics` alias retained.
- Milestones without owners now produce exactly one owner gap (was two).
- Review reports show evidence grades instead of numeric confidence.
- Refine updates that match no item or lack a `set` object now throw instead
  of being silently skipped.
- Mermaid gantt renders escape status text (not just labels), so statuses with
  syntax separators stay parseable.

### Removed

- Arbitrary numeric `confidence` and `confidence_reason` fields (replaced by
  `evidence_grade`/`evidence_reason`). See [MIGRATION.md](MIGRATION.md).
- Benchmark report generation, "before vs after" timing claims, and benchmark
  language in docs and scripts.

## [0.2.1] - 2026-05-16

### Added

- CLI usability: file mode, source-type inference, format aliases
  (`md`, `mermaid`, `gantt`, `timeline`, `review`), stdin default, and clear
  usage text.
- Per-item `confidence_reason` strings for review reports.
- Follow-up questions grouped by field, owner, date, and dependency.
- Dependency-title suggestions for unknown dependencies (advisory only).
- Review report render with items, follow-ups, issues, and assumptions.

### Fixed

- Duplicate owner gaps for milestones: exactly one owner gap per item.

## [0.2.0] - 2026-04-24

### Added

- Markdown ingestion improvements: heading allowlists, frontmatter ignoring,
  pipe-table parsing, fuzzy time windows preserved as `time_window`/`date_text`
  with `exact_date` gaps, enriched `source_refs`, and `noise_report.ignored`
  counters.
- Examples for PRD snippets, Jira-style CSV exports, launch checklists, and
  status updates with expected-output fixtures.
- Source-aware JSON parse diagnostics.

## [0.1.1] - 2026-03-31

### Fixed

- Npm bin path normalization.

## [0.1.0] - 2026-03-30

### Added

- Initial timeline builder MCP server: text/Markdown/CSV/JSON parsing,
  normalization, gap detection, dependency validation (unknown, circular,
  impossible sequencing), and Mermaid Gantt/Timeline + Markdown renders.
