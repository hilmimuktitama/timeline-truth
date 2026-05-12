import assert from "node:assert/strict";
import test from "node:test";

import { formatCliResult, parseCliArgs, runTimelineCli } from "../src/cli.js";

test("parseCliArgs defaults to stdin text and JSON output", () => {
  assert.deepEqual(parseCliArgs([]), {
    inputPath: "-",
    sourceType: "text",
    format: "json"
  });
});

test("parseCliArgs accepts a file, source type, and output format", () => {
  assert.deepEqual(parseCliArgs(["examples/launch-checklist.md", "--type", "markdown", "--format", "review"]), {
    inputPath: "examples/launch-checklist.md",
    sourceType: "markdown",
    format: "review"
  });
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
