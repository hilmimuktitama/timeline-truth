# Release Checklist

Use this checklist before publishing a public version of `timeline-truth`.

## Verify Package Name

```bash
npm view timeline-truth version
```

Expected before first publish: npm returns `404 Not Found`.

Expected after publish: npm returns the latest published version.

## Verify Local Quality

```bash
npm test
npm run check
npm pack --dry-run
```

Confirm the pack output includes:

- `src/`
- `docs/`
- `examples/`
- `README.md`
- `LICENSE`

## Publish

```bash
npm publish --access public
```

After publishing, rerun:

```bash
npm view timeline-truth version
```

Then test the documented MCP package command:

```bash
npx -y --package=timeline-truth timeline-truth-mcp
```
