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

Use the published `timeline-truth` package:

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

This is the recommended package config because it does not require a global npm
install or depend on the user's global npm bin directory being on `PATH`.

Optional global install:

```bash
npm install -g timeline-truth
timeline-truth-mcp
```

With the global package installed and available on `PATH`, the MCP config can
call the package binary directly:

```json
{
  "mcpServers": {
    "timeline-truth": {
      "command": "timeline-truth-mcp",
      "args": []
    }
  }
}
```

If you need to test local changes before publishing a new version, use the local
checkout config above.

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
