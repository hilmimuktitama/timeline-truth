# MCP Setup

Timeline Truth runs as a local stdio MCP server. It does not need network
access, credentials, or hosted storage.

## Generic MCP-Capable Agent

Use this path when your local AI agent supports stdio MCP servers through an
`mcpServers` config.

For the self-install flow where a user asks an agent to use the GitHub repo,
send the agent to [docs/AI-AGENT-INSTALL.md](AI-AGENT-INSTALL.md).

Add the recommended package config to your agent:

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

Reload or restart the agent if it does not pick up MCP server changes
automatically. After that, use the agent normally: paste planning notes and ask
it to use Timeline Truth. You do not need to manually invoke
`timeline-truth-mcp` during normal use.

Ask your agent to call `create_timeline`, inspect the returned gaps and
assumptions, and render `mermaid_gantt` output for review. A good starter prompt
is:

```text
Use the timeline-truth MCP server. Call create_timeline with these notes as a
single source. Then summarize the timeline, list gaps and assumptions, and show
the mermaid_gantt output. Do not infer missing dates, owners, or dependencies;
use the tool gaps as follow-up questions.
```

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
the mermaid_gantt output. Do not infer missing dates, owners, or dependencies;
use the tool gaps as follow-up questions.
```

Useful follow-up calls:

- `validate_timeline` after manual edits or agent refinements.
- `render_timeline` when you need only Mermaid or Markdown output.
- `refine_timeline` when a human answers a gap and you need to preserve
  existing `source_refs`.
