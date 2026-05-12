# MCP Setup

Timeline Truth runs as a local stdio MCP server. It does not need network
access, credentials, or hosted storage.

## Local Checkout

Use this while evaluating the repo or contributing changes:

```json
{
  "mcpServers": {
    "timeline-truth": {
      "command": "node",
      "args": ["C:/path/to/timeline-truth/src/mcp-server.js"]
    }
  }
}
```

From the checkout, install dependencies once:

```bash
npm install
```

## Npm Package

Use this after the `timeline-truth` npm package is published:

```json
{
  "mcpServers": {
    "timeline-truth": {
      "command": "npx",
      "args": ["-y", "--package=timeline-truth", "timeline-truth-mcp"]
    }
  }
}
```

Before publish, `npx --package=timeline-truth timeline-truth-mcp` will fail
because the package is not yet available from the public registry.

## Agent Prompt

Paste planning notes into your agent with this instruction:

```text
Use the timeline-truth MCP server. Call create_timeline with these notes as a
single source. Then summarize the timeline, list gaps and assumptions, and show
the mermaid_gantt output. Do not infer missing dates or owners; use the gaps
from the tool as follow-up questions.
```

Useful follow-up calls:

- `validate_timeline` after manual edits or agent refinements.
- `render_timeline` when you need only Mermaid or Markdown output.
- `refine_timeline` when a human answers a gap and you need to preserve
  existing `source_refs`.
