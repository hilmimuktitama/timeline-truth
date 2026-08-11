# Release Checklist

Use this checklist before publishing a public version of `timeline-truth`.

## Current Release Notes (0.3.0)

- Versioned reliability contract: `schema_version` 0.3.0 in the engine,
  package, MCP server, and published schemas, enforced by
  `npm run contracts:verify`.
- `evidence_grade` (`exact`/`derived`/`fuzzy`/`missing`) replaces the old
  arbitrary numeric `confidence`, with documented deterministic rules and fixed
  evidence reasons.
- Strict validation: real calendar dates, timezone-free datetime rejection,
  malformed durations, duplicate ids/dependencies, missing titles, start after
  end, and unsupported dangerous fields; exactly one owner gap per item.
- Core schedule diff: `timeline-truth diff baseline current
  [--format markdown|json]` and the `diff_timelines` MCP tool, covering scope,
  movement, range, owner, dependency, status, evidence grade, and new
  impossible sequencing. The critical path is never computed.
- Natural-language date conversion, Markdown ingestion profiles, metadata/
  frontmatter handling, and per-source noise reporting (reconciled from main).
- Copied `source-ref`/`timeline-item` schemas with drift verification and no
  private runtime dependency.
- Synthetic regression/evaluation suite replaces benchmark naming.
- CI (clean install, tests, syntax, examples, package dry run) and a
  trusted-publishing release workflow.

## Verify Package Name

```bash
npm view timeline-truth version
```

Expected result: npm returns the latest published version. Before publishing a
new release, confirm whether the version in `package.json` needs to be bumped.

## Verify Local Quality

```bash
npm ci
npm audit --audit-level=high
npm test
npm run check
npm run contracts:verify
npm run eval
npm pack --dry-run
```

Confirm the pack output includes:

- `src/`
- `docs/`
- `examples/`
- `schemas/`
- `evaluation/`
- `README.md`
- `LICENSE`

Also execute the example surface manually:

```bash
node src/cli.js examples/launch-checklist.md --format review
node src/cli.js diff examples/baseline-plan.json examples/current-plan.json --format json
node src/cli.js diff examples/baseline-plan.json examples/current-plan.json --format markdown
```

The release gate runs the same CLI and diff smoke checks before packing and
publishing, including non-empty output and the explicit non-computed critical
path statement.

## Release Sequence

1. Update `CHANGELOG.md`, `README.md`, and any migration notes, then verify the
   package version in `package.json`.
2. Commit the release preparation and push it to the default branch.
3. Create and publish the matching GitHub Release for the exact `vX.Y.Z` tag.
4. The published-release event runs `.github/workflows/release.yml`, which
   checks out that exact tag, verifies its package version, runs every gate, and
   publishes to npm with OIDC provenance.
5. If the event needs to be replayed, manually run the workflow and provide the
   existing release tag; it never creates a GitHub Release itself.

The workflow gates are clean install, high-severity dependency audit, tests,
syntax check, contract verification, evaluation, CLI review/status and JSON/
Markdown diff smoke checks, and package dry run. Manual fallback:

```bash
npm publish --provenance --access public
```

After publishing, rerun:

```bash
npm view timeline-truth version
```

Then test the documented MCP package command:

```bash
npx -y --package=timeline-truth timeline-truth-mcp
```

## Post-Release

- Update [CHANGELOG.md](../CHANGELOG.md) and [MIGRATION.md](../MIGRATION.md)
  with the release notes and any breaking changes.
- Update the README status line to the new version.
