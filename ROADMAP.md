# Roadmap

Timeline Truth should validate usefulness as an open-source MCP server before
expanding into a larger product.

## 0.1: Evidence-First Core

- Parse text, Markdown, CSV, and JSON planning inputs.
- Normalize timeline items.
- Preserve `source_refs`.
- Flag missing dates, owners, unknown dependencies, circular dependencies, and
  impossible sequencing.
- Render Mermaid Gantt, Mermaid timeline, and Markdown.

## 0.2: Better Planning Inputs

- Improve Markdown checklist parsing.
- Add examples for PRD snippets, Jira-style exports, and launch checklists.
- Add confidence reasons per item. Replaced by evidence grades in v0.3.0.
- Generate follow-up questions grouped by owner, date, and dependency.
- Add first-run CLI output for JSON, Markdown, Mermaid, and review reports.
- Add natural-language date conversion, Markdown profiles, metadata/frontmatter
  handling, and per-source noise reporting.

## 0.3: Reliability Contract (current)

- Version the normalized contract (`schema_version` 0.3.0) across package,
  MCP server, engine, and schemas. Done in v0.3.0.
- Replace arbitrary numeric confidence with deterministic `evidence_grade`
  (`exact`/`derived`/`fuzzy`/`missing`) and fixed evidence reasons. Done in
  v0.3.0.
- Strict validations: real calendar dates, timezone-free datetime rejection,
  malformed durations, duplicate ids/dependencies, missing titles, start after
  end, and unsupported dangerous fields. Done in v0.3.0.
- Fix duplicate owner gaps so each item produces exactly one owner gap. Done
  in v0.3.0.
- Add core schedule diff (`timeline-truth diff baseline current`) covering
  scope, movement, range, owner, dependency, status, evidence grade, and new
  impossible sequencing. Done in v0.3.0.
- Publish `schemas/` with drift verification that has no private runtime
  dependency. Done in v0.3.0.
- Add CI (clean install, tests, syntax, examples, package dry run) and a
  trusted-publishing release workflow. Done in v0.3.0.
- Replace benchmark naming with the synthetic regression/evaluation suite.
  Done in v0.3.0.
- Add changelog, migration guide, release checklist, security policy, and
  architecture docs. Done in v0.3.0.

## 0.4: Agent Workflow Polish

- Add stricter schemas for validation issues and diff output.
- Improve error messages for malformed JSON and CSV.
- Add fixture-based tests from realistic planning documents.
- Document MCP client setup for common local agent clients.

## Later

- Optional Jira or Confluence import helpers.
- Optional hosted or team version only if open-source users repeatedly ask for
  private connectors, shared templates, or audit-friendly exports.
