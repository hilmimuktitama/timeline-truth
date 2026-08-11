## Pull Request Checklist

Thanks for contributing to Timeline Truth. Please confirm the following before
requesting review:

- [ ] The change stays within the project's narrow scope (compiler + validator
      + diff, evidence-first; no scheduling optimization, no critical-path
      computation).
- [ ] `source_refs` are preserved when transforming planning material.
- [ ] No arbitrary numeric confidence was reintroduced; `evidence_grade`
      stays deterministic and documented.
- [ ] `package.json`, `src/mcp-server.js`, `src/timeline.js`, and `schemas/`
      remain on the same version (enforced by `npm run contracts:verify`).
- [ ] Tests cover the behavior change (engine, CLI, MCP, or diff as relevant).
- [ ] `npm run verify` passes locally (tests, syntax, contracts, evaluation).
- [ ] Documentation (README, CHANGELOG, MIGRATION, docs) updated where the
      change affects users.

## Description

<!-- What does this change do and why? Link any issues. -->
