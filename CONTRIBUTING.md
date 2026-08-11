# Contributing

Thanks for helping improve Timeline Truth.

This project is an evidence-preserving timeline compiler and validator for
agent workflows. It should stay small, predictable, and easy to run locally.

## Good Contributions

- Better parsing for pasted planning notes, Markdown, CSV, or JSON.
- Stronger validation for gaps, dependencies, sequencing, calendar dates,
  durations, and source evidence.
- More useful Mermaid or Markdown rendering.
- Schedule-diff improvements (movement, range, scope, dependency, status, and
  evidence-grade changes).
- Tests that capture real TPM/PM planning examples.
- Documentation that helps users install, run, or evaluate the MCP server.

## Out Of Scope

- Full project management workflows.
- Drag-and-drop UI.
- Capacity planning or scheduling optimization.
- Computing a "critical path" from incomplete planning data (this project
  explicitly refuses to do that).
- Silent inference of dates, owners, or dependencies.
- Integrations that require hosted credentials or vendor-specific assumptions
  without a clear local-first path.

## Development

```bash
npm ci
npm test
npm run check
npm run contracts:verify
npm run eval
npm pack --dry-run
```

`npm run verify` runs the whole chain in one command. CI runs the same steps on
Node.js 22 and 24.

## Pull Request Checklist

- Keep the change focused.
- Add or update tests for behavior changes.
- Preserve `source_refs` when transforming user-supplied planning material.
- Keep `evidence_grade` deterministic and documented; never reintroduce
  arbitrary numeric confidence.
- Keep `package.json`, `src/mcp-server.js`, `src/timeline.js`, and the schemas
  in one version (`SCHEMA_VERSION`) — `npm run contracts:verify` enforces this.
- Report uncertainty as gaps or issues instead of inventing missing facts.
- Run `npm run verify` before opening a PR.

## Design Principle

When in doubt, prefer a conservative compiler over a confident planner. The
project should make planning uncertainty visible.
