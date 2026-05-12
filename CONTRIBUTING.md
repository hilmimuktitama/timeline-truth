# Contributing

Thanks for helping improve Timeline Truth.

This project is an evidence-preserving timeline compiler for agent workflows.
It should stay small, predictable, and easy to run locally.

## Good Contributions

- Better parsing for pasted planning notes, Markdown, CSV, or JSON.
- Stronger validation for gaps, dependencies, sequencing, and source evidence.
- More useful Mermaid or Markdown rendering.
- Tests that capture real TPM/PM planning examples.
- Documentation that helps users install, run, or evaluate the MCP server.

## Out Of Scope

- Full project management workflows.
- Drag-and-drop UI.
- Capacity planning or scheduling optimization.
- Silent inference of dates, owners, or dependencies.
- Integrations that require hosted credentials or vendor-specific assumptions
  without a clear local-first path.

## Development

```bash
npm install
npm test
npm run check
```

## Pull Request Checklist

- Keep the change focused.
- Add or update tests for behavior changes.
- Preserve `source_refs` when transforming user-supplied planning material.
- Report uncertainty as gaps or assumptions instead of inventing missing facts.
- Run `npm test` and `npm run check` before opening a PR.

## Design Principle

When in doubt, prefer a conservative compiler over a confident planner. The
project should make planning uncertainty visible.
