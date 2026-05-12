# Timeline Builder

Open-source MCP server for compiling messy project planning inputs into
evidence-preserving timelines.

Timeline Builder is intentionally narrow: agents pass pasted text, Markdown,
CSV, or JSON planning material; the server returns a normalized timeline model,
validation gaps, assumptions, and Mermaid/Markdown renders. It does not infer
missing dates or owners.

The goal is to help TPMs, PMs, engineering leads, and AI agents turn rough
planning notes into defensible timeline artifacts without hiding missing
information.

## Why This Exists

Most timeline tools assume the plan is already structured. Real planning inputs
usually are not. They are PRD snippets, Jira notes, launch checklists, status
updates, CSV exports, and Slack summaries.

Timeline Builder focuses on the handoff from messy planning material to a
reviewable timeline:

- preserve `source_refs` so every item can point back to evidence
- flag missing dates, owners, and dependency problems instead of guessing
- render portable Mermaid and Markdown artifacts
- stay small enough to run inside agent workflows

## Tools

- `create_timeline`: compile source content into timeline JSON plus Mermaid outputs.
- `validate_timeline`: report missing dates, owners, unknown dependencies, circular dependencies, and sequencing issues.
- `render_timeline`: render a normalized timeline as `mermaid_gantt`, `mermaid_timeline`, or `markdown`.
- `refine_timeline`: apply edits while preserving evidence (`source_refs`) and assumptions.

## Quick Start

```bash
npm install
node src/mcp-server.js
```

Or run through the package binary:

```bash
npx timeline-builder-mcp
```

## MCP Client Configuration

Use this server as a local stdio MCP server:

```json
{
  "mcpServers": {
    "timeline-builder": {
      "command": "npx",
      "args": ["timeline-builder-mcp"]
    }
  }
}
```

For a local checkout:

```json
{
  "mcpServers": {
    "timeline-builder": {
      "command": "node",
      "args": ["C:/path/to/timeline-builder/src/mcp-server.js"]
    }
  }
}
```

## Example Input

```text
Discovery: 2026-06-01 to 2026-06-05 owner Ana status planned
Build API: starts 2026-06-06 duration 5d owner BE depends on Discovery
Stakeholder review milestone on 2026-06-14
Launch readiness owner TPM depends on Build API
```

## Example Output Shape

```json
{
  "timeline": {
    "items": [
      {
        "title": "Discovery",
        "type": "task",
        "start": "2026-06-01",
        "end": "2026-06-05",
        "owner": "Ana",
        "source_refs": [
          {
            "sourceId": "notes",
            "line": 1
          }
        ]
      }
    ],
    "gaps": [],
    "assumptions": [
      "No dates were inferred. Missing dates are reported as gaps for agent or user follow-up."
    ]
  }
}
```

## Project Boundaries

Timeline Builder is not a project management system, scheduling optimizer, or
visual planning app. It is a compiler and validator for timeline artifacts.

Good fits:

- turning rough planning notes into a reviewable timeline
- finding missing dates, owners, and dependency issues
- generating Mermaid timelines for docs and status reports
- preserving evidence during AI-assisted planning

Poor fits:

- capacity planning
- drag-and-drop timeline editing
- automatic schedule generation from vague goals
- replacing Jira, Asana, Smartsheet, or similar systems of record

## Development

```bash
npm install
npm test
npm run check
```

## Contributing

Contributions are welcome when they keep the project narrow and evidence-first.
Before adding features, check [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
