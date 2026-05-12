# Roadmap

Timeline Builder should validate usefulness as an open-source MCP server before
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
- Add confidence reasons per item.
- Generate follow-up questions grouped by owner, date, and dependency.

## 0.3: Agent Workflow Polish

- Add stricter schemas for timeline items and validation issues.
- Improve error messages for malformed JSON and CSV.
- Add fixture-based tests from realistic planning documents.
- Document MCP client setup for common local agent clients.

## Later

- Optional Jira or Confluence import helpers.
- Optional hosted or team version only if open-source users repeatedly ask for
  private connectors, shared templates, or audit-friendly exports.
