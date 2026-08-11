import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CRITICAL_PATH_STATEMENT, diffTimelines, renderDiffMarkdown } from "../src/diff.js";

const baseline = JSON.parse(readFileSync("examples/baseline-plan.json", "utf8"));
const current = JSON.parse(readFileSync("examples/current-plan.json", "utf8"));
const expectedDrift = JSON.parse(readFileSync("examples/timeline-drift.json", "utf8"));

test("diffTimelines detects scope, schedule, owner, dependency, status, and grade changes", () => {
  const diff = diffTimelines(
    {
      items: [
        { id: "a", title: "Alpha", start: "2026-06-01", end: "2026-06-02", owner: "TPM", status: "planned", dependencies: ["Beta"], evidence_grade: "exact" },
        { id: "b", title: "Beta", start: "2026-06-03", owner: "PM", status: "planned", dependencies: ["Alpha"], evidence_grade: "exact" },
        { id: "c", title: "Gamma", start: "2026-06-04", owner: "QA", status: "planned", dependencies: [], evidence_grade: "missing" }
      ]
    },
    {
      items: [
        { id: "a", title: "Alpha", start: "2026-06-01", end: "2026-06-02", owner: "TPM", status: "planned", dependencies: [], evidence_grade: "exact" },
        { id: "b", title: "Beta", start: "2026-06-05", duration: "3d", owner: "PM", status: "at risk", dependencies: ["Alpha", "Gamma"], evidence_grade: "exact" },
        { id: "d", title: "Delta", start: "2026-06-06", owner: "SRE", status: "planned", dependencies: [], evidence_grade: "exact" }
      ]
    }
  );

  const types = diff.changes.map((change) => change.type);
  assert.ok(types.includes("start_moved"), "start move detected");
  assert.ok(types.includes("duration_changed"), "duration change detected");
  assert.ok(types.includes("status_changed"), "status change detected");
  assert.ok(types.includes("dependency_added"), "dependency added detected");
  assert.ok(types.includes("dependency_removed"), "dependency removed detected");
  assert.ok(types.includes("added"), "scope addition detected");
  assert.ok(types.includes("removed"), "scope removal detected");

  const removed = diff.changes.find((change) => change.type === "removed");
  assert.equal(removed.itemTitle, "Gamma");
  assert.equal(removed.category, "scope");
  assert.equal(removed.item.id, "c");

  const added = diff.changes.find((change) => change.type === "added");
  assert.equal(added.itemTitle, "Delta");
  assert.equal(added.category, "scope");
  assert.equal(added.item.id, "d");

  assert.equal(diff.summary.changed, 2);
  assert.equal(diff.summary.unchanged, 0);
  assert.equal(diff.summary.added, 1);
  assert.equal(diff.summary.removed, 1);
  assert.equal(diff.summary.matched, 2);
});

test("diffTimelines emits range_changed when both start and end move together", () => {
  const diff = diffTimelines(
    { items: [{ id: "x", title: "Task", start: "2026-06-01", end: "2026-06-05" }] },
    { items: [{ id: "x", title: "Task", start: "2026-06-08", end: "2026-06-12" }] }
  );

  const types = diff.changes.map((change) => change.type);
  assert.ok(types.includes("range_changed"));
  assert.ok(!types.includes("start_moved"));
  assert.ok(!types.includes("end_moved"));
});

test("diffTimelines detects evidence grade changes", () => {
  const diff = diffTimelines(
    { items: [{ id: "x", title: "Task", time_window: "W2 July 2026", evidence_grade: "fuzzy" }] },
    { items: [{ id: "x", title: "Task", start: "2026-07-08", evidence_grade: "exact" }] }
  );

  const gradeChange = diff.changes.find((change) => change.type === "evidence_grade_changed");
  assert.ok(gradeChange);
  assert.equal(gradeChange.old, "fuzzy");
  assert.equal(gradeChange.new, "exact");
  assert.equal(gradeChange.category, "evidence");
});

test("diffTimelines reports new impossible sequencing that was not in the baseline", () => {
  const diff = diffTimelines(
    {
      items: [
        { id: "api", title: "API contract", start: "2026-06-06", end: "2026-06-09" },
        { id: "qa", title: "Checkout QA", start: "2026-06-10", end: "2026-06-12", dependencies: ["API contract"] }
      ]
    },
    {
      items: [
        { id: "api", title: "API contract", start: "2026-06-06", end: "2026-06-14" },
        { id: "qa", title: "Checkout QA", start: "2026-06-10", end: "2026-06-12", dependencies: ["API contract"] }
      ]
    }
  );

  assert.equal(diff.summary.new_issues, 1);
  assert.equal(diff.new_issues[0].type, "impossible_sequence");
  assert.equal(diff.new_issues[0].itemTitle, "Checkout QA");
  assert.equal(diff.new_issues[0].category, "validation");
});

test("diffTimelines never computes critical path", () => {
  const diff = diffTimelines(baseline, current);

  assert.equal(diff.critical_path.computed, false);
  assert.equal(diff.critical_path.reason, CRITICAL_PATH_STATEMENT);
  assert.match(diff.critical_path.reason, /cannot be determined defensibly/);
});

test("examples drift fixture is reproduced exactly by the engine", () => {
  const diff = diffTimelines(baseline, current, {
    baselineLabel: "examples/baseline-plan.json",
    currentLabel: "examples/current-plan.json"
  });

  assert.deepEqual(JSON.parse(JSON.stringify(diff)), expectedDrift);
});

test("renderDiffMarkdown explains changes, new sequencing, and the critical path statement", () => {
  const markdown = renderDiffMarkdown(diffTimelines(baseline, current));

  assert.match(markdown, /## Schedule Diff/);
  assert.match(markdown, /end_moved/);
  assert.match(markdown, /range_changed/);
  assert.match(markdown, /owner_changed/);
  assert.match(markdown, /start_moved/);
  assert.match(markdown, /Release notes/);
  assert.match(markdown, /### New Impossible Sequencing/);
  assert.match(markdown, /### Critical Path/);
  assert.match(markdown, /Critical path is not computed/);
});

test("diffTimelines reports ambiguous matching for duplicate ids", () => {
  const diff = diffTimelines(
    { items: [{ id: "dup", title: "Original" }] },
    {
      items: [
        { id: "dup", title: "Current A" },
        { id: "dup", title: "Current B" }
      ]
    }
  );

  assert.equal(diff.summary.ambiguous_matches, 1);
  assert.equal(diff.ambiguities.length, 1);
  const ambiguity = diff.ambiguities[0];
  assert.equal(ambiguity.type, "ambiguous_match");
  assert.equal(ambiguity.category, "matching");
  assert.equal(ambiguity.itemTitle, "Original");
  assert.equal(ambiguity.key, "id");
  assert.equal(ambiguity.value, "dup");
  assert.deepEqual(ambiguity.matches, ["Current A", "Current B"]);
  // Deterministic: the pair is the first unmatched item in document order.
  assert.equal(diff.summary.matched, 1);
  assert.equal(diff.changes.filter((change) => change.type === "added").length, 1);
});

test("diffTimelines reports ambiguous title fallbacks", () => {
  const diff = diffTimelines(
    { items: [{ id: "x", title: "Alpha" }] },
    {
      items: [
        { id: "a1", title: "Alpha" },
        { id: "a2", title: "alpha" }
      ]
    }
  );

  assert.equal(diff.summary.ambiguous_matches, 1);
  assert.equal(diff.ambiguities[0].key, "title");
  assert.deepEqual(diff.ambiguities[0].matches, ["Alpha", "alpha"]);
});

test("diffTimelines does not report ambiguity for unique ids", () => {
  const diff = diffTimelines(
    { items: [{ id: "a", title: "Alpha" }] },
    { items: [{ id: "a", title: "Alpha" }, { id: "b", title: "Beta" }] }
  );

  assert.equal(diff.summary.ambiguous_matches, 0);
  assert.deepEqual(diff.ambiguities, []);
});

test("renderDiffMarkdown surfaces ambiguous matches", () => {
  const diff = diffTimelines(
    { items: [{ id: "dup", title: "Original" }] },
    {
      items: [
        { id: "dup", title: "Current A" },
        { id: "dup", title: "Current B" }
      ]
    }
  );

  const markdown = renderDiffMarkdown(diff);
  assert.match(markdown, /### Ambiguous Matches/);
  assert.match(markdown, /matches 2 current items by id "dup"/);
  assert.match(markdown, /\| Ambiguous matches \| 1 \|/);
});
