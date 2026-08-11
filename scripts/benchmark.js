#!/usr/bin/env node
// Deprecated shim: the project no longer uses "benchmark" terminology.
// `npm run benchmark` now delegates to the synthetic regression/evaluation
// suite so existing habits and scripts keep working.
import { spawnSync } from "node:child_process";

process.stderr.write(
  "note: 'benchmark' naming is deprecated and has been replaced by the synthetic regression/evaluation suite.\n" +
    "Use `npm run eval` (scripts/evaluation.js). This shim delegates there for compatibility.\n"
);

const result = spawnSync(process.execPath, ["scripts/evaluation.js", ...process.argv.slice(2)], {
  stdio: "inherit"
});

process.exit(result.status ?? 1);
