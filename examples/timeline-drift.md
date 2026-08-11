## Schedule Diff

Baseline: examples/baseline-plan.json (5 items)  ·  Current: examples/current-plan.json (5 items)

| Metric | Count |
| --- | ---: |
| Added | 1 |
| Removed | 1 |
| Changed | 3 |
| Unchanged | 1 |
| New impossible sequencing | 1 |
| Ambiguous matches | 0 |

### Changes

- **end_moved**: "API contract": end moved 2026-06-09 → 2026-06-14
- **range_changed**: "Checkout QA": range changed 2026-06-10 to 2026-06-12 → 2026-06-15 to 2026-06-17
- **owner_changed**: "Checkout QA": owner QA → QE
- **status_changed**: "Checkout QA": status planned → active
- **start_moved**: "Launch decision": start moved 2026-06-17 → 2026-06-18
- **removed**: "Legal approval" was removed from the current timeline
- **added**: "Release notes" was added to the current timeline

### New Impossible Sequencing

- "Release notes" starts before dependency "API contract" ends.

### Critical Path

- Critical path is not computed. It cannot be determined defensibly with incomplete data: missing dates, durations, or owners leave the schedule under-constrained.
