import assert from "node:assert/strict";
import test from "node:test";

import { formatCliResult, parseCliArgs, runTimelineCli } from "../src/cli.js";

test("parseCliArgs defaults to stdin text and JSON output", () => {
  assert.deepEqual(parseCliArgs([]), {
    command: "compile",
    inputPath: "-",
    sourceType: "text",
    format: "json"
  });
});

test("parseCliArgs accepts a file, source type, and output format", () => {
  assert.deepEqual(parseCliArgs(["examples/launch-checklist.md", "--type", "markdown", "--format", "review"]), {
    command: "compile",
    inputPath: "examples/launch-checklist.md",
    sourceType: "markdown",
    format: "review"
  });
});

test("parseCliArgs parses the diff subcommand with baseline and current paths", () => {
  assert.deepEqual(parseCliArgs(["diff", "a.json", "b.json"]), {
    command: "diff",
    baselinePath: "a.json",
    currentPath: "b.json",
    format: "markdown"
  });

  assert.deepEqual(parseCliArgs(["diff", "a.json", "b.json", "--format", "json"]), {
    command: "diff",
    baselinePath: "a.json",
    currentPath: "b.json",
    format: "json"
  });
});

test("parseCliArgs rejects diff without both file paths", () => {
  assert.throws(() => parseCliArgs(["diff", "a.json"]), /diff requires baseline and current/);
  assert.throws(() => parseCliArgs(["diff"]), /diff requires baseline and current/);
});

test("parseCliArgs rejects unsupported diff formats", () => {
  assert.throws(() => parseCliArgs(["diff", "a.json", "b.json", "--format", "review"]), /Unsupported diff format/);
});

test("formatCliResult renders review reports for first-run evaluation", () => {
  const output = formatCliResult(
    {
      timeline: {
        items: [{ title: "Discovery", type: "task", status: "planned", start: "2026-06-01", owner: "TPM" }],
        gaps: [],
        assumptions: []
      },
      renders: {
        review_report: "## Timeline Review\n\n- Discovery"
      }
    },
    "review"
  );

  assert.equal(output, "## Timeline Review\n\n- Discovery");
});

test("runTimelineCli reads content and returns the selected format", () => {
  const output = runTimelineCli({
    argv: ["--type", "text", "--format", "markdown"],
    stdin: "Discovery: 2026-06-01 to 2026-06-05 owner TPM"
  });

  assert.match(output, /## Timeline/);
  assert.match(output, /Discovery/);
});

test("runTimelineCli diff returns JSON with summary and change types", () => {
  const output = runTimelineCli({
    argv: ["diff", "examples/baseline-plan.json", "examples/current-plan.json", "--format", "json"]
  });

  const diff = JSON.parse(output);
  assert.equal(diff.schema_version, "0.3.0");
  assert.equal(diff.summary.added, 1);
  assert.equal(diff.summary.removed, 1);
  assert.equal(diff.summary.changed, 3);
  assert.equal(diff.summary.new_issues, 1);
  assert.deepEqual(
    diff.changes.map((change) => change.type),
    ["end_moved", "range_changed", "owner_changed", "status_changed", "start_moved", "removed", "added"]
  );
  assert.equal(diff.critical_path.computed, false);
});

test("runTimelineCli diff returns Markdown by default and mentions the critical path statement", () => {
  const output = runTimelineCli({
    argv: ["diff", "examples/baseline-plan.json", "examples/current-plan.json"]
  });

  assert.match(output, /## Schedule Diff/);
  assert.match(output, /end_moved/);
  assert.match(output, /Critical path is not computed/);
});

test("runTimelineCli diff fails clearly on unparseable timeline files", () => {
  assert.throws(
    () => runTimelineCli({ argv: ["diff", "examples/baseline-plan.json", "README.md"] }),
    /Unable to parse timeline file "README.md" as JSON/
  );
});
