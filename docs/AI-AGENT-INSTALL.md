# AI Agent Install

This page is for AI agents helping a user install Timeline Truth.

If the user says:

```text
let's use timeline-truth from https://github.com/hilmimuktitama/timeline-truth
```

use this repo as the discovery source, then install the stable npm package. Do
not clone the repo, configure a GitHub package spec, add a hosted service, or
change Timeline Truth source code unless the user explicitly asks for
development setup.

## Default Install

Add or update the user's MCP config with this server entry:

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

This tells the local agent to install the stable npm package on demand and run
the `timeline-truth-mcp` stdio server.

If you cannot edit the MCP config automatically, show the exact JSON above and
tell the user where it needs to be added in their current MCP-capable client.
Then ask the user to reload or restart MCP servers if their client requires it.

## Verify The Tool

After config reload, verify `create_timeline` is available by listing MCP tools
or using the client-specific MCP discovery command. The expected Timeline Truth
tools are:

- `create_timeline`
- `validate_timeline`
- `render_timeline`
- `refine_timeline`

If your client lets you call tools directly, run a small smoke test with
`create_timeline`:

```json
{
  "sources": [
    {
      "id": "agent-install-smoke-test",
      "type": "text",
      "content": "Discovery: 2026-06-01 to 2026-06-05 owner PM status planned"
    }
  ]
}
```

The response should include a normalized timeline item, assumptions, gaps, and
Mermaid render output.

## Use It

After setup, the user can paste planning notes and ask:

```text
Use the timeline-truth MCP server. Call create_timeline with these notes as a
single source. Then summarize the timeline, list gaps and assumptions, and show
the mermaid_gantt output. Do not infer missing dates, owners, or dependencies;
use the tool gaps as follow-up questions.
```

## Fallbacks

Use a local clone only when the user wants to evaluate unpublished local changes
or contribute to the project. Use a GitHub package spec only when the user
explicitly wants to run directly from GitHub instead of the stable npm package.
