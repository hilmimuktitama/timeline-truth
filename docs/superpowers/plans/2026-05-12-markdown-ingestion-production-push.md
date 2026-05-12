# Markdown Ingestion Production Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Markdown ingestion fixes safely to production/npm with tests, docs, release notes, and a tagged package.

**Architecture:** The implemented fix extends the existing deterministic parser in `src/timeline.js` and the MCP contract in `src/mcp-tools.js`. The production push should keep the scope to Markdown filtering, table parsing, fuzzy-date preservation, richer source refs, and noise reporting; CLI mode, TPM profiles, and ID-based dependencies remain future batches.

**Tech Stack:** Node.js 22+, native `node:test`, MCP SDK, npm package release workflow, GitHub remote `hilmimuktitama/timeline-truth`.

---

### Task 1: Finalize Release Notes And Public Docs

**Files:**
- Modify: `README.md`
- Modify: `docs/RELEASE.md`
- Test: `test/adoption.test.js`

- [ ] **Step 1: Write the failing adoption test for release-note coverage**

Add this assertion to `test/adoption.test.js` inside `README gives a credible first-use path for AI-agent TPM adoption`:

```js
assert.match(readme, /Markdown tables under those headings are parsed into items/i);
assert.match(readme, /noise_report\.ignored/i);
```

Add this assertion inside `MCP setup and release docs cover local use, npm use, agent prompting, and publish checks`:

```js
assert.match(release, /Markdown ingestion/i);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
rtk npm test
```

Expected before docs update: the release-doc assertion fails because `docs/RELEASE.md` does not mention Markdown ingestion yet.

- [ ] **Step 3: Update release docs with the production change summary**

Add a short release note section near the top of `docs/RELEASE.md`:

```md
## Current Release Notes

- Markdown ingestion now ignores frontmatter by default, parses configured headings, supports simple pipe tables, preserves fuzzy time windows, enriches source refs, and reports ignored content through `noise_report`.
- This release intentionally does not include CLI file mode, TPM validation profiles, or dependency matching by external IDs.
```

- [ ] **Step 4: Run tests and commit docs**

Run:

```bash
rtk npm test
rtk npm run check
```

Expected: all tests pass and syntax check exits 0.

Commit:

```bash
rtk git add README.md docs/RELEASE.md test/adoption.test.js
rtk git commit -m "docs: document markdown ingestion release"
```

### Task 2: Package And Smoke-Test The Build

**Files:**
- Modify: none expected
- Test: npm package tarball output

- [ ] **Step 1: Run the package dry run**

Run:

```bash
rtk npm pack --dry-run
```

Expected: tarball contents include `src/timeline.js`, `src/mcp-tools.js`, `README.md`, `docs/RELEASE.md`, and tests are not required in package contents.

- [ ] **Step 2: Smoke-test MCP tool schema through Node**

Run:

```bash
rtk node -e "import('./src/mcp-tools.js').then(({listTimelineTools})=>{const tool=listTimelineTools().find(t=>t.name==='create_timeline'); console.log(JSON.stringify(tool.inputSchema.properties.markdown.properties));})"
```

Expected output includes `sections` and `ignoreFrontmatter`.

- [ ] **Step 3: Smoke-test Markdown fuzzy table parsing through Node**

Run:

```bash
rtk node -e "import('./src/timeline.js').then(({createTimeline})=>{const r=createTimeline({sources:[{id:'smoke',type:'markdown',path:'docs/program.md',content:'## Timeline\n\n| Item | Target | Owner |\n| --- | --- | --- |\n| API readiness | W3-W4 May 2026 | Platform |'}]}); console.log(JSON.stringify({title:r.timeline.items[0].title,time_window:r.timeline.items[0].time_window,gaps:r.gaps.map(g=>g.field),noise:r.noise_report.ignored}));})"
```

Expected output includes `"title":"API readiness"`, `"time_window":"W3-W4 May 2026"`, and `"exact_date"` in `gaps`.

- [ ] **Step 4: Commit any package metadata changes only if npm requires them**

If no files changed after dry run and smoke tests, do not commit.

### Task 3: Version, Tag, And Push

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Choose patch version**

Use a patch release because this is backward-compatible parser behavior:

```bash
rtk npm version patch --no-git-tag-version
```

Expected: `package.json` and `package-lock.json` version move from `0.1.0` to `0.1.1`.

- [ ] **Step 2: Run release verification**

Run:

```bash
rtk npm test
rtk npm run check
rtk npm pack --dry-run
```

Expected: tests pass, syntax check passes, package dry run succeeds.

- [ ] **Step 3: Commit release version**

Run:

```bash
rtk git add package.json package-lock.json
rtk git commit -m "chore: release 0.1.1"
```

- [ ] **Step 4: Tag the release**

Run:

```bash
rtk git tag v0.1.1
```

- [ ] **Step 5: Push branch and tag**

Run:

```bash
rtk git push origin main
rtk git push origin v0.1.1
```

Expected: GitHub receives the release commit and tag.

### Task 4: Publish To npm And Verify Production

**Files:**
- Modify: none expected
- Test: installed package behavior through `npx`

- [ ] **Step 1: Confirm npm target is available**

Run:

```bash
rtk npm view timeline-truth version
```

Expected before publish: output is lower than `0.1.1` or package is not yet at `0.1.1`.

- [ ] **Step 2: Publish**

Run:

```bash
rtk npm publish --access public
```

Expected: npm publishes `timeline-truth@0.1.1`.

- [ ] **Step 3: Verify npm package version**

Run:

```bash
rtk npm view timeline-truth version
```

Expected: `0.1.1`.

- [ ] **Step 4: Verify MCP binary launches from npm**

Run:

```bash
rtk npx -y --package=timeline-truth@0.1.1 timeline-truth-mcp
```

Expected: process starts the MCP stdio server without module resolution errors. Stop it manually after launch confirmation.

### Task 5: Create GitHub Release And Track Deferred Work

**Files:**
- Modify: none expected
- GitHub: release notes and follow-up issues

- [ ] **Step 1: Create GitHub release notes**

Create release `v0.1.1` with this body:

```md
## Markdown ingestion improvements

- Ignore YAML frontmatter by default.
- Parse Markdown only under configured planning headings.
- Parse simple Markdown pipe tables into timeline items.
- Preserve fuzzy target windows such as `W3-W4 May 2026` as `time_window` / `date_text`.
- Flag fuzzy windows with an `exact_date` gap instead of inventing exact dates.
- Include file path, heading, table row, line number, and original row text in Markdown table `source_refs`.
- Add `noise_report.ignored` counts for skipped frontmatter, prose, and table rows without target dates.

## Deferred

- CLI/file mode.
- TPM validation profiles.
- Dependency matching by Jira key, external ID, slug, and aliases.
```

- [ ] **Step 2: Open follow-up issues**

Create three GitHub issues:

```md
Title: Add CLI file mode for local timeline parsing
Body: Add `timeline-truth create --file path/to/program.md --sections Timeline,Follow-Ups --json` for CI and local TPM workflows.
```

```md
Title: Add TPM validation profile
Body: Add optional `profile: "tpm-program"` validation for blocker owners/target dates, risk mitigations/owners, dependency provider-consumer fields, milestone target dates, and plain-wording statuses.
```

```md
Title: Match dependencies by external identifiers
Body: Extend dependency validation beyond titles to support Jira keys, external IDs, slugs, and alias lists.
```

- [ ] **Step 3: Final production verification**

Run:

```bash
rtk npm view timeline-truth version
rtk git status --short
```

Expected: npm shows `0.1.1`; git status is clean.

### Self-Review

- Spec coverage: covers production readiness for the implemented Markdown batch and explicitly defers CLI mode, TPM profiles, and ID-based dependency matching.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: public fields are consistently named `time_window`, `date_text`, `exact_date_needed`, `source_refs`, `noise_report`, `sections`, and `ignoreFrontmatter`.
